import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

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

export async function sendBridgeCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const payload = {
    brand: tv.brand,
    command: bridgeCommandMap[command],
    nickname: tv.nickname,
  };

  const port = tv.port ?? 8080;
  const baseUrl = `http://${tv.host}:${port}`;
  const pingEndpoint = `${baseUrl}/remote/ping`;
  const commandEndpoint = `${baseUrl}/remote/command`;

  try {
    const pingResponse = await fetchWithTimeout(pingEndpoint, { method: "GET" }, 1200);
    if (!pingResponse.ok && pingResponse.status !== 404) {
      return {
        ok: false,
        message: `TV bridge ping failed (${pingResponse.status}).`,
      };
    }
  } catch {
    return {
      ok: false,
      message: "Unable to reach TV bridge ping endpoint over Wi-Fi.",
    };
  }

  try {
    const response = await fetchWithTimeout(
      commandEndpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      2200
    );

    if (!response.ok) {
      return { ok: false, message: `TV bridge rejected command (${response.status}).` };
    }

    return { ok: true, message: "Command sent." };
  } catch (error) {
    return {
      ok: false,
      message: `Unable to reach TV bridge over Wi-Fi. ${describeError(error)}`,
    };
  }
}
