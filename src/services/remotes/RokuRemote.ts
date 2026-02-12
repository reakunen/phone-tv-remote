import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

const rokuKeyMap: Partial<Record<RemoteCommand, string>> = {
  power: "Power",
  input: "InputTuner",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  ok: "Select",
  back: "Back",
  home: "Home",
  settings: "Info",
  volumeUp: "VolumeUp",
  volumeDown: "VolumeDown",
  channelUp: "ChannelUp",
  channelDown: "ChannelDown",
  mute: "VolumeMute",
  previous: "Rev",
  playPause: "Play",
  next: "Fwd",
  digit0: "Lit_0",
  digit1: "Lit_1",
  digit2: "Lit_2",
  digit3: "Lit_3",
  digit4: "Lit_4",
  digit5: "Lit_5",
  digit6: "Lit_6",
  digit7: "Lit_7",
  digit8: "Lit_8",
  digit9: "Lit_9",
  numpadBackspace: "Backspace",
  numpadEnter: "Enter",
};

export async function sendRokuCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const rokuKey = rokuKeyMap[command];
  if (!rokuKey) {
    return { ok: false, message: "This command is not mapped for Roku yet." };
  }

  const endpoint = `http://${tv.host}:8060/keypress/${encodeURIComponent(rokuKey)}`;

  try {
    const response = await fetchWithTimeout(endpoint, { method: "POST" }, 2200);
    if (!response.ok) {
      return { ok: false, message: `Roku rejected command (${response.status}).` };
    }
    return { ok: true, message: "Command sent to Roku TV." };
  } catch (error) {
    return {
      ok: false,
      message: `Unable to send Roku command. ${describeError(error)}`,
    };
  }
}

export async function isLikelyRokuHost(host: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8060/query/device-info`, {}, 520);
    return response.ok;
  } catch {
    return false;
  }
}
