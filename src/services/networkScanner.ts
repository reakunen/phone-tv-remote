import { TVBrand } from "../types/tv";

export type DiscoveredTV = {
  id: string;
  brand: TVBrand;
  nickname: string;
  host: string;
  port: number;
  source: "roku" | "samsung" | "chromecast" | "bridge";
};

const scanPrefixes = ["192.168.1", "192.168.0", "10.0.0"];
const hostRangeStart = 2;
const hostRangeEnd = 60;
const maxConcurrentHosts = 24;

function mapBrand(label: string): TVBrand {
  const value = label.toLowerCase();
  if (value.includes("samsung")) return "samsung";
  if (value.includes("panasonic")) return "panasonic";
  if (value.includes("vizio")) return "vizio";
  if (value.includes("tcl") || value.includes("roku")) return "tcl";
  if (value.includes("lg")) return "lg";
  return "other";
}

async function fetchWithTimeout(url: string, timeoutMs = 380): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

async function probeRoku(host: string): Promise<DiscoveredTV | null> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8060/query/device-info`, 420);
    if (!response.ok) return null;
    const text = await response.text();

    const friendlyName = parseTag(text, "friendly-device-name");
    const vendorName = parseTag(text, "vendor-name") ?? "";
    const modelName = parseTag(text, "model-name") ?? "";

    const brand = mapBrand(`${vendorName} ${modelName} Roku`);
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

async function probeSamsung(host: string): Promise<DiscoveredTV | null> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8001/api/v2/`, 420);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      device?: { name?: string; modelName?: string };
    };

    const deviceName = payload.device?.name ?? "";
    const modelName = payload.device?.modelName ?? "";
    const merged = `${deviceName} ${modelName} samsung`;

    return {
      id: `samsung-${host}`,
      brand: mapBrand(merged),
      nickname: deviceName || modelName || "Samsung TV",
      host,
      port: 8001,
      source: "samsung",
    };
  } catch {
    return null;
  }
}

async function probeChromecast(host: string): Promise<DiscoveredTV | null> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8008/setup/eureka_info`, 420);
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

async function probeBridge(host: string): Promise<DiscoveredTV | null> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8080/remote/ping`, 320);
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

async function probeHost(host: string): Promise<DiscoveredTV | null> {
  // Prioritize the fastest and most common TV fingerprints.
  const roku = await probeRoku(host);
  if (roku) return roku;

  const samsung = await probeSamsung(host);
  if (samsung) return samsung;

  const cast = await probeChromecast(host);
  if (cast) return cast;

  return probeBridge(host);
}

function buildHosts(): string[] {
  const hosts: string[] = [];
  for (const prefix of scanPrefixes) {
    for (let i = hostRangeStart; i <= hostRangeEnd; i += 1) {
      hosts.push(`${prefix}.${i}`);
    }
  }
  return hosts;
}

export async function scanNetworkForTVs(): Promise<DiscoveredTV[]> {
  const hosts = buildHosts();
  const discovered: DiscoveredTV[] = [];
  const seenHosts = new Set<string>();

  let cursor = 0;

  async function worker() {
    while (cursor < hosts.length) {
      const host = hosts[cursor];
      cursor += 1;
      if (!host) continue;
      const found = await probeHost(host);
      if (!found) continue;
      if (seenHosts.has(found.host)) continue;
      seenHosts.add(found.host);
      discovered.push(found);
    }
  }

  const workers = Array.from({ length: maxConcurrentHosts }, () => worker());
  await Promise.all(workers);

  return discovered.sort((a, b) => a.nickname.localeCompare(b.nickname));
}
