import AsyncStorage from "@react-native-async-storage/async-storage";
import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

type SonyIrccInfo = {
  name: string;
  value: string;
};

const SONY_PSK_STORAGE_KEY = "tv_remote:sony_psk_tokens_v1";
let sonyAuthLoaded = false;
const sonyPskCache = new Map<string, string>();
const sonyRemoteCodeCache = new Map<string, Record<string, string>>();

const sonyKeyNameCandidates: Partial<Record<RemoteCommand, string[]>> = {
  power: ["Power", "PowerOff", "TvPower"],
  input: ["Input", "TvInput", "InputSelect"],
  up: ["Up"],
  down: ["Down"],
  left: ["Left"],
  right: ["Right"],
  ok: ["Confirm", "Enter", "Select"],
  back: ["Return", "Back"],
  home: ["Home"],
  settings: ["Options", "ActionMenu", "Display"],
  volumeUp: ["VolumeUp", "AudioVolumeUp"],
  volumeDown: ["VolumeDown", "AudioVolumeDown"],
  channelUp: ["ChannelUp", "ProgramUp", "ProgUp"],
  channelDown: ["ChannelDown", "ProgramDown", "ProgDown"],
  mute: ["Mute", "AudioMute"],
  previous: ["Rewind", "Prev", "PrevChapter"],
  playPause: ["Play", "Pause"],
  next: ["Forward", "Next", "NextChapter"],
  digit0: ["Num0", "0"],
  digit1: ["Num1", "1"],
  digit2: ["Num2", "2"],
  digit3: ["Num3", "3"],
  digit4: ["Num4", "4"],
  digit5: ["Num5", "5"],
  digit6: ["Num6", "6"],
  digit7: ["Num7", "7"],
  digit8: ["Num8", "8"],
  digit9: ["Num9", "9"],
  numpadBackspace: ["Return", "Back"],
  numpadEnter: ["Enter", "Confirm"],
};

function getSonyAuthKey(tv: SavedTV): string {
  return `${tv.id}:${tv.host ?? ""}`;
}

function normalizeSonyCodeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildSonyBaseUrls(host: string, preferredPort?: number): string[] {
  const ports = [preferredPort, 80, 10000, 443].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  const uniquePorts = [...new Set(ports)];
  return uniquePorts.map((port) =>
    port === 443 ? `https://${host}:${port}` : `http://${host}:${port}`
  );
}

async function ensureSonyAuthLoaded(): Promise<void> {
  if (sonyAuthLoaded) return;

  try {
    const raw = await AsyncStorage.getItem(SONY_PSK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value === "string" && value.length > 0) {
          sonyPskCache.set(key, value);
        }
      });
    }
  } catch {
    // ignore cache load errors
  } finally {
    sonyAuthLoaded = true;
  }
}

async function persistSonyAuthTokens(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SONY_PSK_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(sonyPskCache.entries()))
    );
  } catch {
    // ignore cache persist errors
  }
}

async function setSonyPsk(sonyKey: string, psk: string): Promise<void> {
  if (!psk) return;
  if (sonyPskCache.get(sonyKey) === psk) return;
  sonyPskCache.set(sonyKey, psk);
  await persistSonyAuthTokens();
}

async function clearSonyPsk(sonyKey: string): Promise<void> {
  if (!sonyPskCache.delete(sonyKey)) return;
  sonyRemoteCodeCache.delete(sonyKey);
  await persistSonyAuthTokens();
}

function createSonyPairingRequiredResult(message?: string): DispatchResult {
  return {
    ok: false,
    message:
      message ??
      "Enter your Sony TV Pre-Shared Key (IP Control) to authorize this remote.",
    pairing: {
      brand: "sony",
      challenge: { type: "psk" },
    },
  };
}

function createSonyAuthError(message?: string): Error {
  const error = new Error(message ?? "Sony TV authentication required.");
  (error as Error & { code?: string }).code = "SONY_AUTH_REQUIRED";
  return error;
}

function isSonyAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === "SONY_AUTH_REQUIRED"
  );
}

function isSonyUnauthorizedResponse(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  if (!body || typeof body !== "object") return false;

  const payload = body as { error?: unknown };
  if (!Array.isArray(payload.error) || payload.error.length === 0) return false;
  const code = payload.error[0];
  if (code === 401 || code === 403) return true;
  return false;
}

async function sonyJsonRpcRequest(
  host: string,
  preferredPort: number | undefined,
  service: "system" | "audio" | "avContent",
  method: string,
  params: unknown[],
  psk?: string
): Promise<{ status: number; body: unknown | null }> {
  const baseUrls = buildSonyBaseUrls(host, preferredPort);
  let lastError: Error | null = null;

  for (const baseUrl of baseUrls) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (psk && psk.trim().length > 0) {
        headers["X-Auth-PSK"] = psk.trim();
      }

      const response = await fetchWithTimeout(
        `${baseUrl}/sony/${service}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            method,
            params,
            id: 1,
            version: "1.0",
          }),
        },
        3200
      );

      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`Sony service not found at ${baseUrl} (${response.status}).`);
        continue;
      }

      const text = await response.text();
      if (text.trim().length === 0) {
        return { status: response.status, body: null };
      }

      try {
        return { status: response.status, body: JSON.parse(text) as unknown };
      } catch {
        return { status: response.status, body: null };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Sony request failed.");
    }
  }

  throw lastError ?? new Error("Sony TV is unreachable.");
}

function extractSonyRemoteCodes(body: unknown): SonyIrccInfo[] {
  if (!body || typeof body !== "object") return [];
  const payload = body as { result?: unknown };
  if (!Array.isArray(payload.result) || payload.result.length < 2) return [];
  const maybeList = payload.result[1];
  if (!Array.isArray(maybeList)) return [];

  return maybeList
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as { name?: unknown; value?: unknown };
      if (typeof item.name !== "string" || typeof item.value !== "string") return null;
      if (item.name.trim().length === 0 || item.value.trim().length === 0) return null;
      return { name: item.name.trim(), value: item.value.trim() };
    })
    .filter((entry): entry is SonyIrccInfo => Boolean(entry));
}

async function fetchSonyRemoteCodeMap(tv: SavedTV, psk: string): Promise<Record<string, string>> {
  if (!tv.host) {
    throw new Error("No TV host configured yet.");
  }

  const response = await sonyJsonRpcRequest(
    tv.host,
    tv.port,
    "system",
    "getRemoteControllerInfo",
    [],
    psk
  );

  if (isSonyUnauthorizedResponse(response.status, response.body)) {
    throw createSonyAuthError();
  }

  const infos = extractSonyRemoteCodes(response.body);
  if (infos.length === 0) {
    throw new Error("Sony TV returned no IRCC key data.");
  }

  const map: Record<string, string> = {};
  infos.forEach((item) => {
    map[normalizeSonyCodeName(item.name)] = item.value;
  });
  return map;
}

function findSonyIrccCode(command: RemoteCommand, codeMap: Record<string, string>): string | undefined {
  const candidates = sonyKeyNameCandidates[command];
  if (!candidates || candidates.length === 0) return undefined;

  for (const candidate of candidates) {
    const normalized = normalizeSonyCodeName(candidate);
    const exact = codeMap[normalized];
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const normalized = normalizeSonyCodeName(candidate);
    const fuzzy = Object.entries(codeMap).find(([name]) => name.includes(normalized));
    if (fuzzy) return fuzzy[1];
  }

  return undefined;
}

async function sendSonyIrccCode(
  tv: SavedTV,
  psk: string,
  irccCode: string
): Promise<void> {
  if (!tv.host) {
    throw new Error("No TV host configured yet.");
  }

  const baseUrls = buildSonyBaseUrls(tv.host, tv.port);
  let lastError: Error | null = null;

  const body =
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    "<s:Body>" +
    '<u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
    `<IRCCCode>${irccCode}</IRCCCode>` +
    "</u:X_SendIRCC>" +
    "</s:Body>" +
    "</s:Envelope>";

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/sony/IRCC`,
        {
          method: "POST",
          headers: {
            "Content-Type": 'text/xml; charset="utf-8"',
            SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
            "X-Auth-PSK": psk,
          },
          body,
        },
        3200
      );

      if (response.status === 401 || response.status === 403) {
        throw createSonyAuthError();
      }

      if (response.ok) {
        return;
      }

      lastError = new Error(`Sony IRCC request failed (${response.status}).`);
    } catch (error) {
      if (isSonyAuthError(error)) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error("Sony IRCC request failed.");
    }
  }

  throw lastError ?? new Error("Sony IRCC request failed.");
}

export async function completeSonyPairing(tv: SavedTV, psk: string): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const cleaned = psk.trim();
  if (cleaned.length < 4) {
    return { ok: false, message: "Enter a valid Sony Pre-Shared Key." };
  }

  await ensureSonyAuthLoaded();
  const sonyKey = getSonyAuthKey(tv);

  try {
    const codes = await fetchSonyRemoteCodeMap(tv, cleaned);
    sonyRemoteCodeCache.set(sonyKey, codes);
    await setSonyPsk(sonyKey, cleaned);
    return { ok: true, message: "Sony TV paired." };
  } catch (error) {
    if (isSonyAuthError(error)) {
      return createSonyPairingRequiredResult(
        "Sony key rejected. Check the TV's Pre-Shared Key and try again."
      );
    }
    return { ok: false, message: `Unable to pair Sony TV. ${describeError(error)}` };
  }
}

export async function sendSonyCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  await ensureSonyAuthLoaded();
  const sonyKey = getSonyAuthKey(tv);
  const cachedPsk = sonyPskCache.get(sonyKey);
  if (!cachedPsk) {
    return createSonyPairingRequiredResult();
  }

  if (!sonyKeyNameCandidates[command]) {
    return { ok: false, message: "This command is not mapped for Sony yet." };
  }

  let codes = sonyRemoteCodeCache.get(sonyKey);
  if (!codes) {
    try {
      codes = await fetchSonyRemoteCodeMap(tv, cachedPsk);
      sonyRemoteCodeCache.set(sonyKey, codes);
    } catch (error) {
      if (isSonyAuthError(error)) {
        await clearSonyPsk(sonyKey);
        return createSonyPairingRequiredResult(
          "Sony authorization expired. Re-enter your TV Pre-Shared Key."
        );
      }
      return { ok: false, message: `Unable to load Sony remote keys. ${describeError(error)}` };
    }
  }

  let irccCode = findSonyIrccCode(command, codes);
  if (!irccCode) {
    try {
      const refreshedCodes = await fetchSonyRemoteCodeMap(tv, cachedPsk);
      sonyRemoteCodeCache.set(sonyKey, refreshedCodes);
      irccCode = findSonyIrccCode(command, refreshedCodes);
    } catch (error) {
      if (isSonyAuthError(error)) {
        await clearSonyPsk(sonyKey);
        return createSonyPairingRequiredResult(
          "Sony authorization expired. Re-enter your TV Pre-Shared Key."
        );
      }
      return { ok: false, message: `Unable to refresh Sony remote keys. ${describeError(error)}` };
    }
  }

  if (!irccCode) {
    return { ok: false, message: "This command is unavailable on this Sony TV model." };
  }

  try {
    await sendSonyIrccCode(tv, cachedPsk, irccCode);
    return { ok: true, message: "Command sent to Sony TV." };
  } catch (error) {
    if (isSonyAuthError(error)) {
      await clearSonyPsk(sonyKey);
      return createSonyPairingRequiredResult(
        "Sony key no longer valid. Re-enter your TV Pre-Shared Key."
      );
    }
    return { ok: false, message: `Unable to send Sony command. ${describeError(error)}` };
  }
}

export async function isLikelySonyHost(host: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `http://${host}:80/sony/system`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          method: "getPowerStatus",
          params: [],
          id: 1,
          version: "1.0",
        }),
      },
      700
    );

    if (response.status === 401 || response.status === 403) {
      return true;
    }

    if (!response.ok && response.status >= 500) {
      return false;
    }

    const body = (await response.text()).toLowerCase();
    return (
      body.includes("sony") ||
      body.includes("result") ||
      body.includes("error") ||
      body.includes("illegal request")
    );
  } catch {
    return false;
  }
}
