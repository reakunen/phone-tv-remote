import { RemoteCommand, SavedTV } from "../types/tv";

type DispatchResult = {
  ok: boolean;
  message: string;
};

const bridgeCommandMap: Record<RemoteCommand, string> = {
  power: "POWER",
  input: "INPUT",
  up: "UP",
  down: "DOWN",
  left: "LEFT",
  right: "RIGHT",
  ok: "OK",
  back: "BACK",
  home: "HOME",
  settings: "SETTINGS",
  volumeUp: "VOLUME_UP",
  volumeDown: "VOLUME_DOWN",
  channelUp: "CHANNEL_UP",
  channelDown: "CHANNEL_DOWN",
  mute: "MUTE",
  previous: "PREVIOUS",
  playPause: "PLAY_PAUSE",
  next: "NEXT",
  numpad: "NUMPAD",
  digit0: "DIGIT_0",
  digit1: "DIGIT_1",
  digit2: "DIGIT_2",
  digit3: "DIGIT_3",
  digit4: "DIGIT_4",
  digit5: "DIGIT_5",
  digit6: "DIGIT_6",
  digit7: "DIGIT_7",
  digit8: "DIGIT_8",
  digit9: "DIGIT_9",
  numpadBackspace: "NUMPAD_BACKSPACE",
  numpadEnter: "NUMPAD_ENTER",
};

const samsungKeyMap: Partial<Record<RemoteCommand, string>> = {
  power: "KEY_POWER",
  input: "KEY_SOURCE",
  up: "KEY_UP",
  down: "KEY_DOWN",
  left: "KEY_LEFT",
  right: "KEY_RIGHT",
  ok: "KEY_ENTER",
  back: "KEY_RETURN",
  home: "KEY_HOME",
  settings: "KEY_MENU",
  volumeUp: "KEY_VOLUP",
  volumeDown: "KEY_VOLDOWN",
  channelUp: "KEY_CHUP",
  channelDown: "KEY_CHDOWN",
  mute: "KEY_MUTE",
  previous: "KEY_REWIND",
  playPause: "KEY_PLAY",
  next: "KEY_FF",
  digit0: "KEY_0",
  digit1: "KEY_1",
  digit2: "KEY_2",
  digit3: "KEY_3",
  digit4: "KEY_4",
  digit5: "KEY_5",
  digit6: "KEY_6",
  digit7: "KEY_7",
  digit8: "KEY_8",
  digit9: "KEY_9",
  numpadBackspace: "KEY_RETURN",
  numpadEnter: "KEY_ENTER",
};

function base64EncodeAscii(value: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let i = 0;

  while (i < value.length) {
    const c1 = value.charCodeAt(i++);
    const c2 = value.charCodeAt(i++);
    const c3 = value.charCodeAt(i++);

    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    const e3 = Number.isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6);
    const e4 = Number.isNaN(c3) ? 64 : c3 & 63;

    output += chars.charAt(e1) + chars.charAt(e2) + chars.charAt(e3) + chars.charAt(e4);
  }

  return output;
}

function openWebSocket(url: string, timeoutMs = 4500): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(url);

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      reject(new Error("WebSocket connection timed out."));
    }, timeoutMs);

    socket.onopen = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(socket);
    };

    socket.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed."));
    };
  });
}

async function sendSamsungKey(tv: SavedTV, key: string): Promise<DispatchResult> {
  const preferredPorts = tv.port ? [tv.port] : [];
  const candidatePorts = [...new Set([...preferredPorts, 8001, 8002])];

  const appName = base64EncodeAscii("TV Remote Expo");
  const errors: string[] = [];

  for (const port of candidatePorts) {
    const protocol = port === 8002 ? "wss" : "ws";
    const url = `${protocol}://${tv.host}:${port}/api/v2/channels/samsung.remote.control?name=${appName}`;

    try {
      const socket = await openWebSocket(url, 4200);

      const payload = {
        method: "ms.remote.control",
        params: {
          Cmd: "Click",
          DataOfCmd: key,
          Option: "false",
          TypeOfRemote: "SendRemoteKey",
        },
      };

      socket.send(JSON.stringify(payload));

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            socket.close();
          } catch {
            // ignore
          }
          resolve();
        }, 220);
      });

      return {
        ok: true,
        message: "Command sent to Samsung TV.",
      };
    } catch (error) {
      errors.push(`${port}`);
    }
  }

  return {
    ok: false,
    message:
      "Unable to connect to Samsung remote service on ports " +
      errors.join(", ") +
      ". On TV, enable IP/remote control and approve pairing prompt.",
  };
}

async function sendViaBridge(tv: SavedTV, command: RemoteCommand): Promise<DispatchResult> {
  const payload = {
    brand: tv.brand,
    command: bridgeCommandMap[command],
    nickname: tv.nickname,
  };

  const port = tv.port ?? 8080;
  const endpoint = `http://${tv.host}:${port}/remote/command`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { ok: false, message: `TV bridge rejected command (${res.status}).` };
    }

    return { ok: true, message: "Command sent." };
  } catch {
    return {
      ok: false,
      message: "Unable to reach TV bridge over Wi-Fi.",
    };
  }
}

export async function dispatchWifiCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  if (tv.brand === "samsung") {
    if (command === "numpad") {
      return { ok: true, message: "Numpad opened." };
    }
    const samsungKey = samsungKeyMap[command];
    if (!samsungKey) {
      return { ok: false, message: "This command is not mapped for Samsung yet." };
    }
    return sendSamsungKey(tv, samsungKey);
  }

  // Generic bridge mode for non-Samsung profiles.
  return sendViaBridge(tv, command);
}
