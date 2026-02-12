import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

const panasonicKeyMap: Partial<Record<RemoteCommand, string>> = {
  power: "NRC_POWER-ONOFF",
  input: "NRC_CHG_INPUT-ONOFF",
  up: "NRC_UP-ONOFF",
  down: "NRC_DOWN-ONOFF",
  left: "NRC_LEFT-ONOFF",
  right: "NRC_RIGHT-ONOFF",
  ok: "NRC_ENTER-ONOFF",
  back: "NRC_RETURN-ONOFF",
  home: "NRC_HOME-ONOFF",
  settings: "NRC_SUBMENU-ONOFF",
  volumeUp: "NRC_VOLUP-ONOFF",
  volumeDown: "NRC_VOLDOWN-ONOFF",
  channelUp: "NRC_CH_UP-ONOFF",
  channelDown: "NRC_CH_DOWN-ONOFF",
  mute: "NRC_MUTE-ONOFF",
  previous: "NRC_REW-ONOFF",
  playPause: "NRC_PLAY-ONOFF",
  next: "NRC_FF-ONOFF",
  digit0: "NRC_D0-ONOFF",
  digit1: "NRC_D1-ONOFF",
  digit2: "NRC_D2-ONOFF",
  digit3: "NRC_D3-ONOFF",
  digit4: "NRC_D4-ONOFF",
  digit5: "NRC_D5-ONOFF",
  digit6: "NRC_D6-ONOFF",
  digit7: "NRC_D7-ONOFF",
  digit8: "NRC_D8-ONOFF",
  digit9: "NRC_D9-ONOFF",
  numpadBackspace: "NRC_RETURN-ONOFF",
  numpadEnter: "NRC_ENTER-ONOFF",
};

function buildPanasonicControlUrls(host: string, preferredPort?: number): string[] {
  const ports = [preferredPort, 55000].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  const uniquePorts = [...new Set(ports)];
  return uniquePorts.map((port) => `http://${host}:${port}/nrc/control_0`);
}

function buildPanasonicProbeUrls(host: string): string[] {
  return [`http://${host}:55000/nrc/sdd_0.xml`, `http://${host}:55000/nrc/ddd.xml`];
}

function buildPanasonicSendKeyEnvelope(keyEvent: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:X_SendKey xmlns:u="urn:panasonic-com:service:p00NetworkControl:1">
      <X_KeyEvent>${keyEvent}</X_KeyEvent>
    </u:X_SendKey>
  </s:Body>
</s:Envelope>`;
}

function extractFaultString(body: string): string | null {
  const faultMatch = body.match(/<faultstring>(.*?)<\/faultstring>/is);
  if (!faultMatch) return null;
  const value = faultMatch[1]?.replace(/\s+/g, " ").trim();
  return value && value.length > 0 ? value : null;
}

function isSoapFault(body: string): boolean {
  return /<\s*(?:\w+:)?fault/i.test(body);
}

export async function sendPanasonicCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const keyEvent = panasonicKeyMap[command];
  if (!keyEvent) {
    return { ok: false, message: "This command is not mapped for Panasonic yet." };
  }

  const urls = buildPanasonicControlUrls(tv.host, tv.port);
  let unauthorized = false;
  let lastStatus: number | null = null;
  let lastFaultMessage: string | null = null;
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": 'text/xml; charset="utf-8"',
            SOAPACTION: '"urn:panasonic-com:service:p00NetworkControl:1#X_SendKey"',
            Accept: "text/xml, application/xml, */*",
          },
          body: buildPanasonicSendKeyEnvelope(keyEvent),
        },
        2800
      );

      const body = await response.text();
      if (response.ok && !isSoapFault(body)) {
        return { ok: true, message: "Command sent to Panasonic TV." };
      }

      lastStatus = response.status;
      if (response.status === 401 || response.status === 403) {
        unauthorized = true;
      }

      const faultMessage = extractFaultString(body);
      if (faultMessage) {
        lastFaultMessage = faultMessage;
        if (/auth|forbid|denied|not allowed|session|authorize/i.test(faultMessage)) {
          unauthorized = true;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Panasonic request failed.");
    }
  }

  if (unauthorized) {
    return {
      ok: false,
      message:
        "Panasonic TV denied the command. Enable TV Remote App / Network Remote Control in TV settings.",
    };
  }

  if (lastFaultMessage) {
    return { ok: false, message: `Panasonic TV returned a SOAP fault: ${lastFaultMessage}` };
  }

  if (lastStatus !== null) {
    return { ok: false, message: `Panasonic TV rejected command (${lastStatus}).` };
  }

  return {
    ok: false,
    message: `Unable to send Panasonic command. ${describeError(lastError)}`,
  };
}

export async function isLikelyPanasonicHost(host: string): Promise<boolean> {
  const urls = buildPanasonicProbeUrls(host);

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, {}, 760);
      if (response.status === 401 || response.status === 403) {
        return true;
      }

      if (!response.ok && response.status >= 500) {
        continue;
      }

      const body = (await response.text()).toLowerCase();
      if (
        body.includes("panasonic") ||
        body.includes("viera") ||
        body.includes("p00networkcontrol") ||
        body.includes("x_sendkey")
      ) {
        return true;
      }
    } catch {
      // continue trying other endpoints
    }
  }

  return false;
}
