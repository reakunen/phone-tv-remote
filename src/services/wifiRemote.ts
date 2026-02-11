import { RemoteCommand, SavedTV } from "../types/tv";

type DispatchResult = {
  ok: boolean;
  message: string;
};

const commandMap: Record<RemoteCommand, string> = {
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

// Wi-Fi command router. Each brand needs protocol-specific adapters;
// this gives one stable place to integrate those implementations.
export async function dispatchWifiCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  // Example generic payload for future adapters / bridge services.
  const payload = {
    brand: tv.brand,
    command: commandMap[command],
    nickname: tv.nickname,
  };

  // Placeholder endpoint:
  // if you run a local bridge service, point host/port to it and it can
  // translate commands for Samsung/LG/Vizio/etc.
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
