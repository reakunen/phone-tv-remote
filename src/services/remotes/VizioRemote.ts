import AsyncStorage from "@react-native-async-storage/async-storage";
import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult, VizioPairingChallenge } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

type VizioKeySpec = {
  codeset: number;
  code: number;
};

type VizioApiPayload = {
  STATUS?: {
    RESULT?: string;
    DETAIL?: string;
  };
  ITEM?: Record<string, unknown>;
};

const VIZIO_AUTH_STORAGE_KEY = "tv_remote:vizio_auth_tokens_v1";
let vizioAuthLoaded = false;
const vizioAuthTokenCache = new Map<string, string>();
const vizioPairingChallengeCache = new Map<string, VizioPairingChallenge>();

const vizioKeyMap: Partial<Record<RemoteCommand, VizioKeySpec>> = {
  power: { codeset: 11, code: 2 },
  input: { codeset: 7, code: 1 },
  volumeDown: { codeset: 5, code: 0 },
  volumeUp: { codeset: 5, code: 1 },
  mute: { codeset: 5, code: 4 },
  channelDown: { codeset: 8, code: 0 },
  channelUp: { codeset: 8, code: 1 },
  previous: { codeset: 8, code: 2 },
  digit0: { codeset: 0, code: 48 },
  digit1: { codeset: 0, code: 49 },
  digit2: { codeset: 0, code: 50 },
  digit3: { codeset: 0, code: 51 },
  digit4: { codeset: 0, code: 52 },
  digit5: { codeset: 0, code: 53 },
  digit6: { codeset: 0, code: 54 },
  digit7: { codeset: 0, code: 55 },
  digit8: { codeset: 0, code: 56 },
  digit9: { codeset: 0, code: 57 },
  numpadBackspace: { codeset: 0, code: 8 },
  numpadEnter: { codeset: 0, code: 13 },
};

function getVizioAuthKey(tv: SavedTV): string {
  return `${tv.id}:${tv.host ?? ""}`;
}

function buildVizioBaseUrls(host: string): string[] {
  return [
    `https://${host}:7345`,
    `https://${host}:9000`,
    `http://${host}:7345`,
    `http://${host}:9000`,
  ];
}

async function ensureVizioAuthLoaded(): Promise<void> {
  if (vizioAuthLoaded) return;

  try {
    const raw = await AsyncStorage.getItem(VIZIO_AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value === "string" && value.length > 0) {
          vizioAuthTokenCache.set(key, value);
        }
      });
    }
  } catch {
    // ignore cache load errors
  } finally {
    vizioAuthLoaded = true;
  }
}

async function persistVizioAuthTokens(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      VIZIO_AUTH_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(vizioAuthTokenCache.entries()))
    );
  } catch {
    // ignore cache persist errors
  }
}

async function setVizioAuthToken(vizioKey: string, authToken: string): Promise<void> {
  if (!authToken) return;
  if (vizioAuthTokenCache.get(vizioKey) === authToken) return;
  vizioAuthTokenCache.set(vizioKey, authToken);
  await persistVizioAuthTokens();
}

async function clearVizioAuthToken(vizioKey: string): Promise<void> {
  if (!vizioAuthTokenCache.delete(vizioKey)) return;
  await persistVizioAuthTokens();
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getVizioStatusResult(payload: VizioApiPayload | null): string {
  return String(payload?.STATUS?.RESULT ?? "")
    .trim()
    .toUpperCase();
}

function getVizioStatusDetail(payload: VizioApiPayload | null): string {
  const raw = payload?.STATUS?.DETAIL;
  return typeof raw === "string" ? raw.trim() : "";
}

function getVizioItem(payload: VizioApiPayload | null): Record<string, unknown> | null {
  if (!payload?.ITEM || typeof payload.ITEM !== "object") return null;
  return payload.ITEM;
}

function getVizioItemValue(item: Record<string, unknown> | null, key: string): unknown {
  if (!item) return undefined;
  if (key in item) return item[key];

  const lowered = key.toLowerCase();
  const foundKey = Object.keys(item).find((candidate) => candidate.toLowerCase() === lowered);
  return foundKey ? item[foundKey] : undefined;
}

function extractVizioAuthToken(payload: VizioApiPayload | null): string | undefined {
  const item = getVizioItem(payload);
  const authToken = getVizioItemValue(item, "AUTH_TOKEN");
  if (typeof authToken === "string" && authToken.trim().length > 0) {
    return authToken.trim();
  }
  return undefined;
}

function extractVizioPairingChallenge(
  payload: VizioApiPayload | null,
  fallbackDeviceId: string
): VizioPairingChallenge | null {
  const item = getVizioItem(payload);
  const pairingReqToken = toFiniteNumber(getVizioItemValue(item, "PAIRING_REQ_TOKEN"));
  const challengeType = toFiniteNumber(getVizioItemValue(item, "CHALLENGE_TYPE"));
  const deviceIdRaw = getVizioItemValue(item, "DEVICE_ID");
  const deviceId =
    typeof deviceIdRaw === "string" && deviceIdRaw.trim().length > 0
      ? deviceIdRaw.trim()
      : fallbackDeviceId;

  if (pairingReqToken === null || challengeType === null) {
    return null;
  }

  return {
    challengeType,
    pairingReqToken,
    deviceId,
  };
}

function isVizioPairingRequiredResult(result: string): boolean {
  if (!result) return false;
  return (
    result.includes("PAIR") ||
    result.includes("AUTH") ||
    result.includes("PIN") ||
    result.includes("UNAUTHORIZED")
  );
}

function createVizioDeviceId(tv: SavedTV): string {
  const raw = `tvremote-${tv.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const candidate = raw.slice(0, 40);
  return candidate.length > 0 ? candidate : `tvremote-${Date.now()}`;
}

async function vizioPutJson(
  host: string,
  path: string,
  body: Record<string, unknown>,
  authToken?: string
): Promise<VizioApiPayload | null> {
  const baseUrls = buildVizioBaseUrls(host);
  let lastError: Error | null = null;

  for (const baseUrl of baseUrls) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (authToken) {
        headers.AUTH = authToken;
      }

      const response = await fetchWithTimeout(
        `${baseUrl}${path}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify(body),
        },
        3200
      );

      const text = await response.text();
      if (text.trim().length === 0) {
        if (response.ok) {
          return null;
        }
        lastError = new Error(`Vizio endpoint failed (${response.status}).`);
        continue;
      }

      try {
        return JSON.parse(text) as VizioApiPayload;
      } catch {
        if (response.ok) {
          return null;
        }
        lastError = new Error(`Vizio endpoint returned non-JSON (${response.status}).`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Vizio request failed.");
    }
  }

  throw lastError ?? new Error("Vizio adapter failed to connect.");
}

async function startVizioPairing(tv: SavedTV): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  await ensureVizioAuthLoaded();
  const vizioKey = getVizioAuthKey(tv);
  const deviceId = createVizioDeviceId(tv);

  try {
    const payload = await vizioPutJson(
      tv.host,
      "/pairing/start",
      {
        DEVICE_ID: deviceId,
        DEVICE_NAME: "TV Remote App",
      },
      undefined
    );

    const maybeToken = extractVizioAuthToken(payload);
    if (maybeToken) {
      await setVizioAuthToken(vizioKey, maybeToken);
      return { ok: true, message: "Vizio TV paired and authenticated." };
    }

    const challenge = extractVizioPairingChallenge(payload, deviceId);
    if (challenge) {
      vizioPairingChallengeCache.set(vizioKey, challenge);
      return {
        ok: false,
        message: "Enter the PIN shown on your Vizio TV to finish pairing.",
        pairing: { brand: "vizio", challenge },
      };
    }

    const result = getVizioStatusResult(payload);
    const detail = getVizioStatusDetail(payload);
    return {
      ok: false,
      message:
        "Unable to start Vizio pairing." +
        (result ? ` Result: ${result}.` : "") +
        (detail ? ` ${detail}` : ""),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Unable to start Vizio pairing. ${describeError(error)}`,
    };
  }
}

export async function completeVizioPairing(
  tv: SavedTV,
  pin: string,
  challenge?: VizioPairingChallenge
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const cleanedPin = pin.trim();
  if (!/^\d{4,8}$/.test(cleanedPin)) {
    return { ok: false, message: "Enter a valid numeric PIN from your Vizio TV." };
  }

  await ensureVizioAuthLoaded();
  const vizioKey = getVizioAuthKey(tv);
  const cachedChallenge = vizioPairingChallengeCache.get(vizioKey);
  const pairingChallenge = challenge ?? cachedChallenge;
  if (!pairingChallenge) {
    return { ok: false, message: "No Vizio pairing session found. Start pairing again." };
  }

  try {
    const payload = await vizioPutJson(
      tv.host,
      "/pairing/pair",
      {
        DEVICE_ID: pairingChallenge.deviceId,
        CHALLENGE_TYPE: pairingChallenge.challengeType,
        RESPONSE_VALUE: cleanedPin,
        PAIRING_REQ_TOKEN: pairingChallenge.pairingReqToken,
      },
      undefined
    );

    const authToken = extractVizioAuthToken(payload);
    if (authToken) {
      await setVizioAuthToken(vizioKey, authToken);
      vizioPairingChallengeCache.delete(vizioKey);
      return { ok: true, message: "Vizio pairing complete." };
    }

    const result = getVizioStatusResult(payload);
    const detail = getVizioStatusDetail(payload);
    return {
      ok: false,
      message:
        "Vizio pairing failed." +
        (result ? ` Result: ${result}.` : "") +
        (detail ? ` ${detail}` : ""),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Vizio pairing failed. ${describeError(error)}`,
    };
  }
}

export async function sendVizioCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  await ensureVizioAuthLoaded();
  const vizioKey = getVizioAuthKey(tv);
  const cachedAuthToken = vizioAuthTokenCache.get(vizioKey);

  if (!cachedAuthToken) {
    const pairingResult = await startVizioPairing(tv);
    if (pairingResult.ok) {
      return sendVizioCommand(tv, command);
    }
    return pairingResult;
  }

  const keySpec = vizioKeyMap[command];
  if (!keySpec) {
    return { ok: false, message: "This command is not mapped for Vizio yet." };
  }

  try {
    const payload = await vizioPutJson(
      tv.host,
      "/key_command/",
      {
        KEYLIST: [
          {
            CODESET: keySpec.codeset,
            CODE: keySpec.code,
            ACTION: "KEYPRESS",
          },
        ],
      },
      cachedAuthToken
    );

    const result = getVizioStatusResult(payload);
    if (!result || result === "SUCCESS") {
      return { ok: true, message: "Command sent to Vizio TV." };
    }

    if (isVizioPairingRequiredResult(result)) {
      await clearVizioAuthToken(vizioKey);
      return startVizioPairing(tv);
    }

    const detail = getVizioStatusDetail(payload);
    return {
      ok: false,
      message: `Vizio rejected command (${result}${detail ? `: ${detail}` : ""}).`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Unable to send Vizio command. ${describeError(error)}`,
    };
  }
}

export async function isLikelyVizioHost(host: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`http://${host}:7345/state/device/name`, {}, 520);
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}
