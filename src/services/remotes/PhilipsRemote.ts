import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

const philipsKeyMap: Partial<Record<RemoteCommand, string>> = {
  power: "Standby",
  input: "Source",
  up: "CursorUp",
  down: "CursorDown",
  left: "CursorLeft",
  right: "CursorRight",
  ok: "Confirm",
  back: "Back",
  home: "Home",
  settings: "Options",
  volumeUp: "VolumeUp",
  volumeDown: "VolumeDown",
  channelUp: "ChannelStepUp",
  channelDown: "ChannelStepDown",
  mute: "Mute",
  previous: "Previous",
  playPause: "PlayPause",
  next: "Next",
  digit0: "Digit0",
  digit1: "Digit1",
  digit2: "Digit2",
  digit3: "Digit3",
  digit4: "Digit4",
  digit5: "Digit5",
  digit6: "Digit6",
  digit7: "Digit7",
  digit8: "Digit8",
  digit9: "Digit9",
  numpadBackspace: "Back",
  numpadEnter: "Confirm",
};

function buildPhilipsCommandUrls(host: string, preferredPort?: number): string[] {
  const ports = [preferredPort, 1925, 1926].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  const uniquePorts = [...new Set(ports)];

  const urls: string[] = [];
  uniquePorts.forEach((port) => {
    const protocol = port === 1926 ? "https" : "http";
    urls.push(`${protocol}://${host}:${port}/6/input/key`);
    urls.push(`${protocol}://${host}:${port}/1/input/key`);
  });
  return urls;
}

function buildPhilipsSystemUrls(host: string): string[] {
  return [`http://${host}:1925/6/system`, `http://${host}:1925/1/system`];
}

export async function sendPhilipsCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const key = philipsKeyMap[command];
  if (!key) {
    return { ok: false, message: "This command is not mapped for Philips yet." };
  }

  const urls = buildPhilipsCommandUrls(tv.host, tv.port);
  let unauthorized = false;
  let lastStatus: number | null = null;
  let lastError: Error | null = null;

  for (const url of urls) {
    for (const method of ["POST", "PUT"] as const) {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ key }),
          },
          2600
        );

        if (response.ok) {
          return { ok: true, message: "Command sent to Philips TV." };
        }

        lastStatus = response.status;
        if (response.status === 401 || response.status === 403) {
          unauthorized = true;
          continue;
        }

        if (response.status === 404 || response.status === 405) {
          continue;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Philips request failed.");
      }
    }
  }

  if (unauthorized) {
    return {
      ok: false,
      message:
        "Philips TV denied the command. Enable JointSpace/IP control and pairing on the TV.",
    };
  }

  if (lastStatus !== null) {
    return { ok: false, message: `Philips TV rejected command (${lastStatus}).` };
  }

  return {
    ok: false,
    message: `Unable to send Philips command. ${describeError(lastError)}`,
  };
}

export async function isLikelyPhilipsHost(host: string): Promise<boolean> {
  const urls = buildPhilipsSystemUrls(host);

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
        body.includes("philips") ||
        body.includes("jointspace") ||
        body.includes("ambilight") ||
        body.includes("featuring")
      ) {
        return true;
      }
    } catch {
      // continue trying other endpoints
    }
  }

  return false;
}
