import { RemoteCommand, SavedTV } from "../types/tv";
import { isLikelyFireTvHost, sendFireTvCommand } from "./remotes/FireTvRemote";
import { sendBridgeCommand } from "./remotes/BridgeRemote";
import { isLikelyLgHost, sendLgCommand } from "./remotes/LGRemote";
import { isLikelyPanasonicHost, sendPanasonicCommand } from "./remotes/PanasonicRemote";
import { isLikelyPhilipsHost, sendPhilipsCommand } from "./remotes/PhilipsRemote";
import { isLikelyRokuHost, sendRokuCommand } from "./remotes/RokuRemote";
import { isLikelySamsungHost, sendSamsungCommand } from "./remotes/SamsungRemote";
import { completeSonyPairing, isLikelySonyHost, sendSonyCommand } from "./remotes/SonyRemote";
import { completeVizioPairing, isLikelyVizioHost, sendVizioCommand } from "./remotes/VizioRemote";
import type { DispatchResult } from "./remotes/remoteTypes";

export type {
  DispatchResult,
  SonyPairingChallenge,
  VizioPairingChallenge,
} from "./remotes/remoteTypes";
export { completeVizioPairing } from "./remotes/VizioRemote";
export { completeSonyPairing } from "./remotes/SonyRemote";

async function sendForOtherTv(tv: SavedTV, command: RemoteCommand): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const [
    likelyRoku,
    likelyLg,
    likelySamsung,
    likelyVizio,
    likelySony,
    likelyPhilips,
    likelyPanasonic,
    likelyFireTv,
  ] =
    await Promise.all([
      isLikelyRokuHost(tv.host),
      isLikelyLgHost(tv.host),
      isLikelySamsungHost(tv.host),
      isLikelyVizioHost(tv.host),
      isLikelySonyHost(tv.host),
      isLikelyPhilipsHost(tv.host),
      isLikelyPanasonicHost(tv.host),
      isLikelyFireTvHost(tv.host),
    ]);

  if (likelyRoku) {
    const result = await sendRokuCommand(tv, command);
    if (result.ok) {
      return { ok: true, message: "Command sent using Roku protocol." };
    }
  }

  if (likelyLg) {
    const result = await sendLgCommand(tv, command);
    if (result.ok) {
      return { ok: true, message: "Command sent using LG protocol." };
    }
  }

  if (likelySamsung) {
    const result = await sendSamsungCommand(tv, command);
    if (result.ok || result.pairing) {
      return result.ok
        ? { ok: true, message: "Command sent using Samsung protocol." }
        : result;
    }
  }

  if (likelyVizio) {
    const result = await sendVizioCommand(tv, command);
    if (result.ok || result.pairing) {
      return result;
    }
  }

  if (likelySony) {
    const result = await sendSonyCommand(tv, command);
    if (result.ok || result.pairing) {
      return result;
    }
  }

  if (likelyPhilips) {
    const result = await sendPhilipsCommand(tv, command);
    if (result.ok || result.pairing) {
      return result.ok
        ? { ok: true, message: "Command sent using Philips protocol." }
        : result;
    }
  }

  if (likelyPanasonic) {
    const result = await sendPanasonicCommand(tv, command);
    if (result.ok || result.pairing) {
      return result.ok
        ? { ok: true, message: "Command sent using Panasonic protocol." }
        : result;
    }
  }

  let bridgeResult: DispatchResult | null = null;
  if (likelyFireTv) {
    const result = await sendFireTvCommand(tv, command);
    if (result.ok) {
      return result;
    }
    bridgeResult = result;
  }

  if (!bridgeResult) {
    bridgeResult = await sendBridgeCommand(tv, command);
  }

  if (bridgeResult.ok) {
    return bridgeResult;
  }

  return {
    ok: false,
    message: `Unable to send command automatically. ${bridgeResult.message}`,
  };
}

async function sendForTcl(tv: SavedTV, command: RemoteCommand): Promise<DispatchResult> {
  const rokuResult = await sendRokuCommand(tv, command);
  if (rokuResult.ok || rokuResult.pairing) {
    return rokuResult;
  }

  const samsungResult = await sendSamsungCommand(tv, command);
  if (samsungResult.ok || samsungResult.pairing) {
    return samsungResult;
  }

  return sendBridgeCommand(tv, command);
}

export async function dispatchWifiCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  if (command === "numpad") {
    return { ok: true, message: "Numpad opened." };
  }

  switch (tv.brand) {
    case "samsung":
      return sendSamsungCommand(tv, command);
    case "roku":
      return sendRokuCommand(tv, command);
    case "lg":
      return sendLgCommand(tv, command);
    case "philips":
      return sendPhilipsCommand(tv, command);
    case "panasonic":
      return sendPanasonicCommand(tv, command);
    case "firetv":
      return sendFireTvCommand(tv, command);
    case "vizio":
      return sendVizioCommand(tv, command);
    case "sony":
      return sendSonyCommand(tv, command);
    case "tcl":
      return sendForTcl(tv, command);
    case "other":
      return sendForOtherTv(tv, command);
    default:
      return sendBridgeCommand(tv, command);
  }
}
