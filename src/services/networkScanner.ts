import * as Network from "expo-network";
import { TVBrand } from "../types/tv";

export type DiscoveredTV = {
  id: string;
  brand: TVBrand;
  nickname: string;
  host: string;
  port: number;
  source:
    | "roku"
    | "samsung"
    | "sony"
    | "chromecast"
    | "lg"
    | "vizio"
    | "philips"
    | "panasonic"
    | "firetv"
    | "bridge";
};

export type ScanOptions = {
  prefixes?: string[];
  hosts?: string[];
  hostRangeStart?: number;
  hostRangeEnd?: number;
  maxConcurrentHosts?: number;
  onDiscovered?: (tv: DiscoveredTV) => void;
  abortSignal?: AbortSignal;
};

const defaultScanPrefixes = [
  "192.168.1",
  "192.168.0",
  "192.168.50",
  "10.0.0",
  "10.0.1",
  "172.20.10",
];
const defaultHostRangeStart = 1;
const defaultHostRangeEnd = 254;
const defaultMaxConcurrentHosts = 28;
const samsungSocketProbeTimeoutMs = 700;

function mapBrand(label: string): TVBrand {
  const value = label.toLowerCase();
  if (value.includes("samsung")) return "samsung";
  if (value.includes("sony") || value.includes("bravia")) return "sony";
  if (value.includes("roku")) return "roku";
  if (value.includes("panasonic")) return "panasonic";
  if (value.includes("vizio")) return "vizio";
  if (value.includes("tcl")) return "tcl";
  if (value.includes("lg") || value.includes("webos")) return "lg";
  if (value.includes("philips")) return "philips";
  if (value.includes("amazon") || value.includes("fire tv") || value.includes("aft")) {
    return "firetv";
  }
  return "other";
}

function bindAbort(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  signal.addEventListener("abort", onAbort);
  return () => signal.removeEventListener("abort", onAbort);
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 450,
  abortSignal?: AbortSignal,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const unbindAbort = bindAbort(abortSignal, () => controller.abort());
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    unbindAbort();
  }
}

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

function canOpenWebSocket(
  url: string,
  timeoutMs = 1500,
  abortSignal?: AbortSignal
): Promise<boolean> {
  if (abortSignal?.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const socket = new WebSocket(url);

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unbindAbort();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      finish(false);
    }, timeoutMs);

    const unbindAbort = bindAbort(abortSignal, () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      finish(false);
    });

    socket.onopen = () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      finish(true);
    };

    socket.onerror = () => {
      finish(false);
    };
  });
}

function parseTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

async function probeRoku(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;
  try {
    const response = await fetchWithTimeout(`http://${host}:8060/query/device-info`, 500, abortSignal);
    if (!response.ok) return null;
    const text = await response.text();

    const friendlyName = parseTag(text, "friendly-device-name");
    const vendorName = parseTag(text, "vendor-name") ?? "";
    const modelName = parseTag(text, "model-name") ?? "";

    const brand: TVBrand = "roku";
    return {
      id: `roku-${host}`,
      brand,
      nickname: friendlyName || `${brand.toUpperCase()} TV`,
      host,
      port: 8060,
      source: "roku",
    };
  } catch {
    return null;
  }
}

async function probeSamsung(
  host: string,
  abortSignal?: AbortSignal,
  allowSocketFallback = false
): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;
  const fallbackNickname = `Samsung TV (${host})`;

  try {
    const response = await fetchWithTimeout(`http://${host}:8001/api/v2/`, 650, abortSignal);
    const text = await response.text();
    let deviceName = "";
    let modelName = "";

    try {
      const payload = JSON.parse(text) as {
        device?: { name?: string; modelName?: string };
      };
      deviceName = payload.device?.name ?? "";
      modelName = payload.device?.modelName ?? "";
    } catch {
      // Some Samsung models return non-JSON bodies; keep probing with heuristics.
    }

    const payloadFingerprint = text.toLowerCase();
    const looksSamsungPayload =
      payloadFingerprint.includes("samsung") ||
      payloadFingerprint.includes("tizen") ||
      payloadFingerprint.includes("smarttv");
    const hasDeviceInfo = deviceName.length > 0 || modelName.length > 0;

    if (hasDeviceInfo || (response.status < 500 && looksSamsungPayload)) {
      return {
        id: `samsung-${host}`,
        brand: "samsung",
        nickname: deviceName || modelName || fallbackNickname,
        host,
        port: 8001,
        source: "samsung",
      };
    }
  } catch {
    // Continue with websocket fallback probing.
  }
  if (abortSignal?.aborted || !allowSocketFallback) return null;

  const appName = base64EncodeAscii("PhoneRemote");
  const ws8001 = await canOpenWebSocket(
    `ws://${host}:8001/api/v2/channels/samsung.remote.control?name=${appName}`,
    samsungSocketProbeTimeoutMs,
    abortSignal
  );
  if (ws8001) {
    return {
      id: `samsung-${host}-ws8001`,
      brand: "samsung",
      nickname: fallbackNickname,
      host,
      port: 8001,
      source: "samsung",
    };
  }

  const ws8002 = await canOpenWebSocket(
    `wss://${host}:8002/api/v2/channels/samsung.remote.control?name=${appName}`,
    samsungSocketProbeTimeoutMs,
    abortSignal
  );
  if (ws8002) {
    return {
      id: `samsung-${host}-ws8002`,
      brand: "samsung",
      nickname: fallbackNickname,
      host,
      port: 8002,
      source: "samsung",
    };
  }

  return null;
}

async function probeSony(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;

  try {
    const response = await fetchWithTimeout(
      `http://${host}:80/sony/system`,
      550,
      abortSignal,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          method: "getSystemInformation",
          params: [],
          id: 1,
          version: "1.0",
        }),
      }
    );
    const body = await response.text();
    const normalized = body.toLowerCase();

    if (response.status === 401 || response.status === 403) {
      return {
        id: `sony-${host}-auth`,
        brand: "sony",
        nickname: `Sony TV (${host})`,
        host,
        port: 80,
        source: "sony",
      };
    }

    if (!response.ok && response.status >= 500) {
      return null;
    }

    let nickname = `Sony TV (${host})`;
    try {
      const payload = JSON.parse(body) as {
        result?: Array<{ model?: string; product?: string; generation?: string }>;
      };
      const info = payload.result?.[0];
      const label = [info?.model, info?.product, info?.generation]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ");
      if (label) nickname = label;
    } catch {
      // Ignore parse errors and keep heuristic fallback.
    }

    const looksSony =
      normalized.includes("sony") ||
      normalized.includes("bravia") ||
      normalized.includes("illegal request") ||
      normalized.includes("\"result\"") ||
      normalized.includes("\"error\"");

    if (!looksSony) return null;

    return {
      id: `sony-${host}`,
      brand: "sony",
      nickname,
      host,
      port: 80,
      source: "sony",
    };
  } catch {
    return null;
  }
}

async function probeLG(
  host: string,
  abortSignal?: AbortSignal,
  allowSocketProbe = false
): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;

  try {
    const response = await fetchWithTimeout(`http://${host}:3000/`, 420, abortSignal);
    if (response.ok || response.status < 500) {
      return {
        id: `lg-${host}-http3000`,
        brand: "lg",
        nickname: `LG TV (${host})`,
        host,
        port: 3000,
        source: "lg",
      };
    }
  } catch {
    // Continue with websocket probing on explicit host scans only.
  }

  if (!allowSocketProbe || abortSignal?.aborted) return null;

  const ws3000 = await canOpenWebSocket(`ws://${host}:3000`, 900, abortSignal);
  if (ws3000) {
    return {
      id: `lg-${host}-ws3000`,
      brand: "lg",
      nickname: `LG TV (${host})`,
      host,
      port: 3000,
      source: "lg",
    };
  }

  const ws3001 = await canOpenWebSocket(`wss://${host}:3001`, 900, abortSignal);
  if (ws3001) {
    return {
      id: `lg-${host}-ws3001`,
      brand: "lg",
      nickname: `LG TV (${host})`,
      host,
      port: 3001,
      source: "lg",
    };
  }

  return null;
}

async function probeVizio(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;

  try {
    const response = await fetchWithTimeout(`http://${host}:7345/state/device/name`, 420, abortSignal);
    if (!response.ok && response.status !== 401) {
      return null;
    }

    let label = "VIZIO TV";
    try {
      const payload = (await response.json()) as {
        ITEM?: { VALUE?: { NAME?: string } };
      };
      const candidate = payload.ITEM?.VALUE?.NAME;
      if (candidate && candidate.trim().length > 0) {
        label = candidate.trim();
      }
    } catch {
      // Some models return non-JSON on unauthenticated reads.
    }

    return {
      id: `vizio-${host}`,
      brand: "vizio",
      nickname: label,
      host,
      port: 7345,
      source: "vizio",
    };
  } catch {
    return null;
  }
}

async function probePhilips(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;

  const endpoints = [`http://${host}:1925/6/system`, `http://${host}:1925/1/system`];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, 500, abortSignal);
      const body = await response.text();
      const normalized = body.toLowerCase();

      if (response.status === 401 || response.status === 403) {
        return {
          id: `philips-${host}-auth`,
          brand: "philips",
          nickname: `Philips TV (${host})`,
          host,
          port: 1925,
          source: "philips",
        };
      }

      if (!response.ok && response.status >= 500) {
        continue;
      }

      let nickname = `Philips TV (${host})`;
      try {
        const payload = JSON.parse(body) as {
          name?: string;
          model?: string;
          serialnumber_encrypted?: string;
        };
        const label = [payload.name, payload.model]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join(" ");
        if (label) nickname = label;
      } catch {
        // Keep fallback nickname.
      }

      const looksPhilips =
        normalized.includes("philips") ||
        normalized.includes("jointspace") ||
        normalized.includes("ambilight") ||
        normalized.includes("featuring");

      if (!looksPhilips) {
        continue;
      }

      return {
        id: `philips-${host}`,
        brand: "philips",
        nickname,
        host,
        port: 1925,
        source: "philips",
      };
    } catch {
      // continue
    }
  }

  return null;
}

async function probePanasonic(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;

  const endpoints = [`http://${host}:55000/nrc/sdd_0.xml`, `http://${host}:55000/nrc/ddd.xml`];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, 500, abortSignal);
      const body = await response.text();
      const normalized = body.toLowerCase();

      if (response.status === 401 || response.status === 403) {
        return {
          id: `panasonic-${host}-auth`,
          brand: "panasonic",
          nickname: `Panasonic TV (${host})`,
          host,
          port: 55000,
          source: "panasonic",
        };
      }

      if (!response.ok && response.status >= 500) {
        continue;
      }

      const friendlyName = parseTag(body, "friendlyName");
      const modelName = parseTag(body, "modelName");
      const nickname = friendlyName || modelName || `Panasonic TV (${host})`;

      const looksPanasonic =
        normalized.includes("panasonic") ||
        normalized.includes("viera") ||
        normalized.includes("p00networkcontrol") ||
        normalized.includes("x_sendkey");

      if (!looksPanasonic) {
        continue;
      }

      return {
        id: `panasonic-${host}`,
        brand: "panasonic",
        nickname,
        host,
        port: 55000,
        source: "panasonic",
      };
    } catch {
      // continue
    }
  }

  return null;
}

async function probeFireTv(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;

  try {
    const response = await fetchWithTimeout(
      `http://${host}:8009/ssdp/device-desc.xml`,
      500,
      abortSignal
    );
    if (!response.ok) return null;
    const xml = await response.text();

    const manufacturer = parseTag(xml, "manufacturer") ?? "";
    const modelName = parseTag(xml, "modelName") ?? "";
    const friendlyName = parseTag(xml, "friendlyName") ?? "";
    const merged = `${manufacturer} ${modelName} ${friendlyName}`.toLowerCase();
    const looksFireTv =
      merged.includes("amazon") || merged.includes("fire tv") || /^aft/i.test(modelName.trim());

    if (!looksFireTv) {
      return null;
    }

    return {
      id: `firetv-${host}`,
      brand: "firetv",
      nickname: friendlyName || modelName || `Fire TV (${host})`,
      host,
      port: 8009,
      source: "firetv",
    };
  } catch {
    return null;
  }
}

async function probeChromecast(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;
  try {
    const response = await fetchWithTimeout(`http://${host}:8008/setup/eureka_info`, 500, abortSignal);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      name?: string;
      device_info?: { manufacturer?: string; model_name?: string };
    };

    const manufacturer = payload.device_info?.manufacturer ?? "";
    const modelName = payload.device_info?.model_name ?? "";
    const merged = `${manufacturer} ${modelName}`;

    return {
      id: `cast-${host}`,
      brand: mapBrand(merged),
      nickname: payload.name || modelName || "Cast TV",
      host,
      port: 8008,
      source: "chromecast",
    };
  } catch {
    return null;
  }
}

async function probeBridge(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;
  try {
    const response = await fetchWithTimeout(`http://${host}:8080/remote/ping`, 360, abortSignal);
    if (!response.ok) return null;
    return {
      id: `bridge-${host}`,
      brand: "other",
      nickname: `TV Bridge (${host})`,
      host,
      port: 8080,
      source: "bridge",
    };
  } catch {
    return null;
  }
}

async function probeHost(
  host: string,
  abortSignal?: AbortSignal,
  allowSamsungSocketFallback = false
): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;
  const results = await Promise.all([
    probeRoku(host, abortSignal),
    probeSamsung(host, abortSignal, allowSamsungSocketFallback),
    probeSony(host, abortSignal),
    probeLG(host, abortSignal, allowSamsungSocketFallback),
    probeVizio(host, abortSignal),
    probePhilips(host, abortSignal),
    probePanasonic(host, abortSignal),
    probeFireTv(host, abortSignal),
    probeChromecast(host, abortSignal),
    probeBridge(host, abortSignal),
  ]);

  return results.find((item) => Boolean(item)) ?? null;
}

async function probeGenericHost(host: string, abortSignal?: AbortSignal): Promise<DiscoveredTV | null> {
  if (abortSignal?.aborted) return null;
  const candidates = [80, 10000, 1925, 3000, 3001, 7345, 8008, 8009, 8001, 8002, 8060, 8080, 55000];
  for (const port of candidates) {
    if (abortSignal?.aborted) return null;
    try {
      const response = await fetchWithTimeout(`http://${host}:${port}/`, 360, abortSignal);
      // Any reachable HTTP response is enough to present an "unknown TV candidate".
      if (!response) continue;
      return {
        id: `generic-${host}-${port}`,
        brand: "other",
        nickname: `Potential TV (${host})`,
        host,
        port,
        source: "bridge",
      };
    } catch {
      // Ignore and continue probing other ports.
    }
  }
  return null;
}

function isValidPrefix(prefix: string): boolean {
  const parts = prefix.split(".");
  if (parts.length !== 3) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function extractPrefixFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return isValidPrefix(prefix) ? prefix : null;
}

async function getLocalNetworkPrefix(): Promise<string | null> {
  try {
    const ipAddress = await Network.getIpAddressAsync();
    const prefix = extractPrefixFromHost(ipAddress);
    if (!prefix) return null;
    if (prefix === "0.0.0" || prefix.startsWith("127.")) return null;
    return prefix;
  } catch {
    return null;
  }
}

async function normalizePrefixes(prefixes?: string[]): Promise<string[]> {
  if (prefixes !== undefined && prefixes.length === 0) return [];
  const candidate = prefixes?.map((value) => value.trim()).filter(Boolean) ?? [];
  const localPrefix = await getLocalNetworkPrefix();
  if (candidate.length > 0) {
    const validCandidate = candidate.filter(isValidPrefix);
    if (validCandidate.length > 0) {
      return [...new Set(validCandidate)];
    }
  }

  if (localPrefix) {
    return [localPrefix];
  }

  return [...new Set(defaultScanPrefixes)];
}

function isValidHost(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function normalizeHosts(hosts?: string[]): string[] {
  if (!hosts || hosts.length === 0) return [];
  const candidate = hosts.map((value) => value.trim()).filter(Boolean);
  const valid = candidate.filter(isValidHost);
  return [...new Set(valid)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildHosts(prefixes: string[], hostRangeStart: number, hostRangeEnd: number): string[] {
  const hosts: string[] = [];
  for (const prefix of prefixes) {
    for (let i = hostRangeStart; i <= hostRangeEnd; i += 1) {
      hosts.push(`${prefix}.${i}`);
    }
  }
  return hosts;
}

export async function scanNetworkForTVs(options?: ScanOptions): Promise<DiscoveredTV[]> {
  const prefixes = await normalizePrefixes(options?.prefixes);
  const explicitHosts = normalizeHosts(options?.hosts);
  const explicitHostSet = new Set(explicitHosts);
  const start = clamp(options?.hostRangeStart ?? defaultHostRangeStart, 1, 254);
  const end = clamp(options?.hostRangeEnd ?? defaultHostRangeEnd, start, 254);
  const concurrency = clamp(options?.maxConcurrentHosts ?? defaultMaxConcurrentHosts, 8, 128);
  const onDiscovered = options?.onDiscovered;
  const abortSignal = options?.abortSignal;

  const rangedHosts = buildHosts(prefixes, start, end);
  const hosts = [...new Set([...explicitHosts, ...rangedHosts])];
  const discovered: DiscoveredTV[] = [];
  const seenHosts = new Set<string>();

  let cursor = 0;

  async function worker() {
    while (cursor < hosts.length) {
      if (abortSignal?.aborted) return;
      const host = hosts[cursor];
      cursor += 1;
      if (!host) continue;
      const isExplicitHost = explicitHostSet.has(host);
      const found = await probeHost(host, abortSignal, isExplicitHost);
      if (found) {
        if (!seenHosts.has(found.host)) {
          seenHosts.add(found.host);
          console.log(
            `[networkScanner] Discovered TV payload:\n${JSON.stringify(found, null, 2)}`
          );
          discovered.push(found);
          onDiscovered?.(found);
        }
        continue;
      }

      if (!isExplicitHost) {
        continue;
      }

      const generic = await probeGenericHost(host, abortSignal);
      if (!generic) continue;
      if (seenHosts.has(generic.host)) continue;
      seenHosts.add(generic.host);
      console.log(
        `[networkScanner] Discovered TV payload:\n${JSON.stringify(generic, null, 2)}`
      );
      discovered.push(generic);
      onDiscovered?.(generic);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return discovered;
}
