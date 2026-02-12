import AsyncStorage from "@react-native-async-storage/async-storage";
import { RemoteCommand, SavedTV } from "../../types/tv";
import { DispatchResult } from "./remoteTypes";
import { describeError, fetchWithTimeout } from "./remoteUtils";

type LgSocketMessage = {
  id?: string;
  type?: string;
  error?: string;
  payload?: {
    [key: string]: unknown;
    returnValue?: boolean;
    "client-key"?: string;
  };
};

type LgCommandRequest = {
  uri: string;
  payload?: Record<string, unknown>;
};

const LG_CLIENT_KEYS_STORAGE_KEY = "tv_remote:lg_client_keys_v1";
let lgClientKeysLoaded = false;
const lgClientKeyCache = new Map<string, string>();

const lgButtonMap: Partial<Record<RemoteCommand, string>> = {
  up: "UP",
  down: "DOWN",
  left: "LEFT",
  right: "RIGHT",
  ok: "ENTER",
  back: "BACK",
  home: "HOME",
  volumeUp: "VOLUMEUP",
  volumeDown: "VOLUMEDOWN",
  channelUp: "CHANNELUP",
  channelDown: "CHANNELDOWN",
  mute: "MUTE",
  previous: "REWIND",
  playPause: "PLAY",
  next: "FASTFORWARD",
  digit0: "0",
  digit1: "1",
  digit2: "2",
  digit3: "3",
  digit4: "4",
  digit5: "5",
  digit6: "6",
  digit7: "7",
  digit8: "8",
  digit9: "9",
  numpadBackspace: "DELETE",
  numpadEnter: "ENTER",
};

const lgRegisterPermissions = [
  "LAUNCH",
  "LAUNCH_WEBAPP",
  "APP_TO_APP",
  "CLOSE",
  "TEST_OPEN",
  "TEST_PROTECTED",
  "CONTROL_AUDIO",
  "CONTROL_DISPLAY",
  "CONTROL_INPUT_JOYSTICK",
  "CONTROL_INPUT_MEDIA_PLAYBACK",
  "CONTROL_INPUT_TV",
  "CONTROL_POWER",
  "READ_APP_STATUS",
  "READ_CURRENT_CHANNEL",
  "READ_INPUT_DEVICE_LIST",
  "READ_NETWORK_STATE",
  "READ_RUNNING_APPS",
  "READ_TV_CHANNEL_LIST",
  "WRITE_NOTIFICATION_TOAST",
  "READ_POWER_STATE",
  "READ_COUNTRY_INFO",
  "WRITE_SETTINGS",
];

const lgSignedPermissions = [
  "CONTROL_AUDIO",
  "CONTROL_DISPLAY",
  "CONTROL_INPUT_JOYSTICK",
  "CONTROL_INPUT_MEDIA_PLAYBACK",
  "CONTROL_INPUT_TV",
  "CONTROL_POWER",
  "READ_APP_STATUS",
  "READ_CURRENT_CHANNEL",
  "READ_RUNNING_APPS",
  "READ_UPDATE_INFO",
  "READ_POWER_STATE",
];

function parseLgMessage(data: unknown): LgSocketMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as LgSocketMessage;
  } catch {
    return null;
  }
}

function getLgClientKeyKey(tv: SavedTV): string {
  return `${tv.id}:${tv.host ?? ""}`;
}

function buildLgUrls(host: string): string[] {
  return [`ws://${host}:3000`, `wss://${host}:3001`];
}

function getLgCommandRequest(command: RemoteCommand): LgCommandRequest | null {
  if (command === "power") {
    return { uri: "ssap://system/turnOff" };
  }

  if (command === "input") {
    return {
      uri: "ssap://com.webos.applicationManager/launch",
      payload: { id: "com.webos.app.inputpicker" },
    };
  }

  if (command === "settings") {
    return {
      uri: "ssap://com.webos.applicationManager/launch",
      payload: { id: "com.palm.app.settings" },
    };
  }

  const buttonName = lgButtonMap[command];
  if (!buttonName) {
    return null;
  }

  return {
    uri: "ssap://com.webos.service.networkinput/sendButton",
    payload: { name: buttonName },
  };
}

async function ensureLgClientKeysLoaded(): Promise<void> {
  if (lgClientKeysLoaded) return;

  try {
    const raw = await AsyncStorage.getItem(LG_CLIENT_KEYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value === "string" && value.length > 0) {
          lgClientKeyCache.set(key, value);
        }
      });
    }
  } catch {
    // ignore cache load errors
  } finally {
    lgClientKeysLoaded = true;
  }
}

async function persistLgClientKeys(): Promise<void> {
  try {
    const payload = Object.fromEntries(lgClientKeyCache.entries());
    await AsyncStorage.setItem(LG_CLIENT_KEYS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache persist errors
  }
}

function sendLgViaUrl(
  url: string,
  request: LgCommandRequest,
  clientKey?: string
): Promise<{ clientKey?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestSent = false;
    let discoveredClientKey = clientKey;

    const registerId = `register_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requestId = `request_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const socket = new WebSocket(url);

    const finish = (error?: Error, nextClientKey?: string) => {
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

      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve({ clientKey: nextClientKey });
    };

    const timeout = setTimeout(() => {
      finish(new Error("LG TV connection timeout. Is the TV on the same Wi-Fi?"));
    }, clientKey ? 6000 : 15000);

    const sendRequest = () => {
      if (requestSent) return;
      requestSent = true;

      const payload = {
        id: requestId,
        type: "request",
        uri: request.uri,
        payload: request.payload ?? {},
      };

      try {
        socket.send(JSON.stringify(payload));
      } catch {
        finish(new Error("LG payload failed to send."));
      }
    };

    socket.onopen = () => {
      const registerPayload: Record<string, unknown> = {
        forcePairing: false,
        pairingType: "PROMPT",
        manifest: {
          manifestVersion: 1,
          appVersion: "1.1",
          signed: {
            created: "20140509",
            appId: "com.lge.test",
            vendorId: "com.lge",
            localizedAppNames: {
              "": "LG Remote App",
            },
            localizedVendorNames: {
              "": "LG Electronics",
            },
            permissions: lgSignedPermissions,
            serial: "2f930e2d2cfe083771f68e4fe7bb07",
          },
          permissions: lgRegisterPermissions,
        },
      };

      if (clientKey) {
        registerPayload["client-key"] = clientKey;
      }

      const message = {
        id: registerId,
        type: "register",
        payload: registerPayload,
      };

      try {
        socket.send(JSON.stringify(message));
      } catch {
        finish(new Error("LG registration payload failed to send."));
      }
    };

    socket.onmessage = (event) => {
      const message = parseLgMessage(event.data);
      if (!message) return;

      const messageClientKey =
        typeof message.payload?.["client-key"] === "string"
          ? (message.payload?.["client-key"] as string)
          : undefined;
      if (messageClientKey) {
        discoveredClientKey = messageClientKey;
      }

      if (message.type === "error") {
        const details = message.error?.trim() || "request failed";
        if (message.id === registerId) {
          finish(new Error(`LG TV denied remote authorization (${details}).`));
          return;
        }
        if (message.id === requestId) {
          finish(new Error(`LG TV rejected command (${details}).`));
          return;
        }
      }

      if (message.type === "registered") {
        sendRequest();
        return;
      }

      if (message.id === registerId && message.type === "response") {
        if (message.payload?.returnValue === false) {
          finish(new Error("LG TV rejected registration response."));
          return;
        }
        sendRequest();
        return;
      }

      if (message.id === requestId && message.type === "response") {
        if (message.payload?.returnValue === false) {
          finish(new Error("LG TV command returned returnValue=false."));
          return;
        }
        finish(undefined, discoveredClientKey);
      }
    };

    socket.onerror = () => {
      finish(new Error("LG adapter connection failed."));
    };

    socket.onclose = () => {
      if (!settled) {
        finish(new Error("LG TV socket closed before command response."));
      }
    };
  });
}

export async function sendLgCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  if (!tv.host) {
    return { ok: false, message: "No TV host configured yet." };
  }

  const request = getLgCommandRequest(command);
  if (!request) {
    return { ok: false, message: "This command is not mapped for LG yet." };
  }

  await ensureLgClientKeysLoaded();

  const clientKeyId = getLgClientKeyKey(tv);
  const host = tv.host;

  const tryWithClientKey = async (clientKey?: string): Promise<string | undefined> => {
    const urls = buildLgUrls(host);
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        const result = await sendLgViaUrl(url, request, clientKey);
        return result.clientKey;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("LG adapter failed.");
      }
    }

    throw lastError ?? new Error("LG adapter failed to connect.");
  };

  const cachedClientKey = lgClientKeyCache.get(clientKeyId);

  try {
    const discoveredClientKey = await tryWithClientKey(cachedClientKey);
    if (discoveredClientKey && discoveredClientKey !== cachedClientKey) {
      lgClientKeyCache.set(clientKeyId, discoveredClientKey);
      await persistLgClientKeys();
    }
    return { ok: true, message: "Command sent to LG TV." };
  } catch (errorWithCachedKey) {
    if (cachedClientKey) {
      lgClientKeyCache.delete(clientKeyId);
      await persistLgClientKeys();

      try {
        const discoveredClientKey = await tryWithClientKey(undefined);
        if (discoveredClientKey) {
          lgClientKeyCache.set(clientKeyId, discoveredClientKey);
          await persistLgClientKeys();
        }
        return { ok: true, message: "Command sent to LG TV." };
      } catch (errorWithoutCachedKey) {
        return {
          ok: false,
          message: `Unable to send LG command. ${describeError(errorWithoutCachedKey)}`,
        };
      }
    }

    return {
      ok: false,
      message: `Unable to send LG command. ${describeError(errorWithCachedKey)}`,
    };
  }
}

export async function isLikelyLgHost(host: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`http://${host}:3000/`, {}, 520);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}
