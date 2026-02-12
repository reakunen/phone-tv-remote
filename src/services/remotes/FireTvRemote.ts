import { RemoteCommand, SavedTV } from "../../types/tv";
import { sendBridgeCommand } from "./BridgeRemote";
import { DispatchResult } from "./remoteTypes";
import { fetchWithTimeout } from "./remoteUtils";

function parseXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function looksLikeFireTvText(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("fire tv") ||
    normalized.includes("amazon") ||
    normalized.includes("<modelname>aft")
  );
}

export async function sendFireTvCommand(
  tv: SavedTV,
  command: RemoteCommand
): Promise<DispatchResult> {
  const bridgeResult = await sendBridgeCommand(tv, command);
  if (bridgeResult.ok) {
    return { ok: true, message: "Command sent to Fire TV." };
  }

  return {
    ok: false,
    message: `Fire TV control requires bridge/ADB integration. ${bridgeResult.message}`,
  };
}

export async function isLikelyFireTvHost(host: string): Promise<boolean> {
  try {
    const descriptorResponse = await fetchWithTimeout(
      `http://${host}:8009/ssdp/device-desc.xml`,
      {},
      700
    );

    if (descriptorResponse.ok) {
      const xml = await descriptorResponse.text();
      const manufacturer = parseXmlTag(xml, "manufacturer") ?? "";
      const modelName = parseXmlTag(xml, "modelName") ?? "";
      const friendlyName = parseXmlTag(xml, "friendlyName") ?? "";
      const merged = `${manufacturer} ${modelName} ${friendlyName}`;
      if (looksLikeFireTvText(merged) || /^aft/i.test(modelName.trim())) {
        return true;
      }
    }
  } catch {
    // continue to secondary detection
  }

  try {
    const castResponse = await fetchWithTimeout(
      `http://${host}:8008/setup/eureka_info`,
      {},
      700
    );
    if (!castResponse.ok) return false;
    const body = (await castResponse.text()).toLowerCase();
    return looksLikeFireTvText(body);
  } catch {
    return false;
  }
}
