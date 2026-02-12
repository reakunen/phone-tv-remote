import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { RemoteCommand, SavedTV } from "../../types/tv";
import {
  isSamsungNativeModuleAvailable,
  sendSamsungKeyWithNativeIOS,
} from "../samsungNativeModule";
import { DispatchResult } from "./remoteTypes";
import { base64EncodeAscii, describeError, fetchWithTimeout } from "./remoteUtils";

type SamsungSocketMessage = {
  event?: string;
  data?: {
    token?: string | number;
    clients?: Array<{
      attributes?: {
        token?: string | number;
      };
    }>;
  };
};

const SAMSUNG_TOKENS_STORAGE_KEY = "tv_remote:samsung_tokens_v1";
const SAMSUNG_CERTS_STORAGE_KEY = "tv_remote:samsung_certs_v1";

const samsungTokenCache = new Map<string, string>();
const samsungCertFingerprintCache = new Map<string, string>();
let samsungAuthLoaded = false;

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

function parseSamsungMessage(data: unknown): SamsungSocketMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as SamsungSocketMessage;
  } catch {
    return null;
  }
}

function extractSamsungToken(message: SamsungSocketMessage | null): string | undefined {
  const directToken = message?.data?.token;
  if (typeof directToken === "string" && directToken.length > 0) {
    return directToken;
  }
  if (typeof directToken === "number" && Number.isFinite(directToken)) {
    return String(directToken);
  }

  const clientToken = message?.data?.clients?.find((client) => {
    const candidate = client?.attributes?.token;
    return (
      (typeof candidate === "string" && candidate.length > 0) ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    );
  })?.attributes?.token;

  if (typeof clientToken === "string" && clientToken.length > 0) {
    return clientToken;
  }
  if (typeof clientToken === "number" && Number.isFinite(clientToken)) {
    return String(clientToken);
  }

  return undefined;
}

function getSamsungTokenKey(tv: SavedTV): string {
  return `${tv.id}:${tv.host ?? ""}`;
}

function buildSamsungUrls(host: string, token?: string): string[] {
  const appName = base64EncodeAscii("PhoneRemote");
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  const path = `/api/v2/channels/samsung.remote.control?name=${appName}${tokenParam}`;

  return [`ws://${host}:8001${path}`, `wss://${host}:8002${path}`];
}

async function ensureSamsungAuthLoaded(): Promise<void> {
  if (samsungAuthLoaded) return;

  try {
    const [tokensRaw, certsRaw] = await AsyncStorage.multiGet([
      SAMSUNG_TOKENS_STORAGE_KEY,
      SAMSUNG_CERTS_STORAGE_KEY,
    ]);

    const tokenPayload = tokensRaw?.[1] ?? null;
    const certPayload = certsRaw?.[1] ?? null;

    if (tokenPayload) {
      const parsedTokens = JSON.parse(tokenPayload) as Record<string, string>;
      Object.entries(parsedTokens).forEach(([key, value]) => {
        if (typeof value === "string" && value.length > 0) {
          samsungTokenCache.set(key, value);
        }
      });
    }

    if (certPayload) {
      const parsedCerts = JSON.parse(certPayload) as Record<string, string>;
      Object.entries(parsedCerts).forEach(([key, value]) => {
        if (typeof value === "string" && value.length > 0) {
          samsungCertFingerprintCache.set(key, value);
        }
      });
    }
  } catch {
    // ignore cache load errors
  } finally {
    samsungAuthLoaded = true;
  }
}

async function persistSamsungAuthCache(): Promise<void> {
  try {
    const tokenPayload = JSON.stringify(Object.fromEntries(samsungTokenCache.entries()));
    const certPayload = JSON.stringify(
      Object.fromEntries(samsungCertFingerprintCache.entries())
    );

    await AsyncStorage.multiSet([
      [SAMSUNG_TOKENS_STORAGE_KEY, tokenPayload],
      [SAMSUNG_CERTS_STORAGE_KEY, certPayload],
    ]);
  } catch {
    // ignore cache persist errors
  }
}

async function upsertSamsungAuth(
  tokenKey: string,
  token?: string,
  certificateFingerprintSha256?: string
): Promise<void> {
  let changed = false;

  if (token && token.length > 0) {
    if (samsungTokenCache.get(tokenKey) !== token) {
      samsungTokenCache.set(tokenKey, token);
      changed = true;
    }
  }

  if (certificateFingerprintSha256 && certificateFingerprintSha256.length > 0) {
    if (samsungCertFingerprintCache.get(tokenKey) !== certificateFingerprintSha256) {
      samsungCertFingerprintCache.set(tokenKey, certificateFingerprintSha256);
      changed = true;
    }
  }

  if (changed) {
    await persistSamsungAuthCache();
  }
}

async function clearSamsungAuth(tokenKey: string, includeCert = true): Promise<void> {
  let changed = false;

  if (samsungTokenCache.delete(tokenKey)) {
    changed = true;
  }
  if (includeCert && samsungCertFingerprintCache.delete(tokenKey)) {
    changed = true;
  }

  if (changed) {
    await persistSamsungAuthCache();
  }
}

function sendSamsungViaUrl(
  url: string,
  key: string,
  options?: { hasToken?: boolean }
): Promise<{ token?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let commandSent = false;
    const socket = new WebSocket(url);

    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      if (error) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        reject(error);
        return;
      }

      if (typeof token === "string" && token.length > 0) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        resolve({ token });
        return;
      }

      resolve({});
    };

    const timeout = setTimeout(() => {
      finish(new Error("Samsung TV connection timeout. Is the TV on the same Wi-Fi?"));
    }, options?.hasToken ? 4000 : 12000);

    const sendCommand = () => {
      if (commandSent) return;
      commandSent = true;

      try {
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
      } catch {
        finish(new Error("Samsung payload failed to send."));
      }
    };

    socket.onopen = () => {
      sendCommand();
    };

    socket.onmessage = (event) => {
      const msg = parseSamsungMessage(event.data);
      if (msg?.event === "ms.channel.unauthorized") {
        finish(new Error("Samsung TV denied remote authorization."));
        return;
      }

      const token = msg?.event === "ms.channel.connect" ? extractSamsungToken(msg) : undefined;
      if (typeof token === "string" && token.length > 0) {
        finish(undefined, token);
      }
    };

    socket.onclose = () => {
      finish();
    };

    socket.onerror = () => {
      finish(new Error("Samsung adapter connection failed."));
    };
  });
}

async function sendSamsungKey(tv: SavedTV, key: string): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  await ensureSamsungAuthLoaded();

  const tokenKey = getSamsungTokenKey(tv);
  const host = tv.host;
  const useNativeIOS = Platform.OS === "ios" && isSamsungNativeModuleAvailable();

  const tryWithToken = async (token?: string): Promise<void> => {
    if (useNativeIOS) {
      const pinnedFingerprint = samsungCertFingerprintCache.get(tokenKey);
      const result = await sendSamsungKeyWithNativeIOS(host, key, token, pinnedFingerprint);
      await upsertSamsungAuth(
        tokenKey,
        result.token,
        result.certificateFingerprintSha256
      );
      return;
    }

    const urls = buildSamsungUrls(host, token);
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        const result = await sendSamsungViaUrl(url, key, { hasToken: Boolean(token) });
        await upsertSamsungAuth(tokenKey, result.token, undefined);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Samsung adapter failed.");
      }
    }

    throw lastError ?? new Error("Samsung adapter failed to connect.");
  };

  const cachedToken = samsungTokenCache.get(tokenKey);
  try {
    await tryWithToken(cachedToken);
    return { ok: true, message: "Command sent to Samsung TV." };
  } catch (errorWithToken) {
    if (cachedToken) {
      await clearSamsungAuth(tokenKey, useNativeIOS);
      try {
        await tryWithToken(undefined);
        return { ok: true, message: "Command sent to Samsung TV." };
      } catch (errorWithoutToken) {
        return {
          ok: false,
          message: `Unable to send Samsung command. ${describeError(errorWithoutToken)}`,
        };
      }
    }

    if (useNativeIOS && samsungCertFingerprintCache.has(tokenKey)) {
      await clearSamsungAuth(tokenKey, true);
      try {
        await tryWithToken(undefined);
        return { ok: true, message: "Command sent to Samsung TV." };
      } catch (errorWithoutPin) {
        return {
          ok: false,
          message: `Unable to send Samsung command. ${describeError(errorWithoutPin)}`,
        };
      }
    }

    return {
      ok: false,
      message: `Unable to send Samsung command. ${describeError(errorWithToken)}`,
    };
  }
}

export async function sendSamsungCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  const samsungKey = samsungKeyMap[command];
  if (!samsungKey) {
    return { ok: false, message: "This command is not mapped for Samsung yet." };
  }

  return sendSamsungKey(tv, samsungKey);
}

export async function isLikelySamsungHost(host: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8001/api/v2/`, {}, 580);
    if (!response.ok && response.status >= 500) {
      return false;
    }

    const body = (await response.text()).toLowerCase();
    return (
      body.includes("samsung") ||
      body.includes("tizen") ||
      body.includes("smarttv") ||
      body.includes("ms.channel")
    );
  } catch {
    return false;
  }
}
