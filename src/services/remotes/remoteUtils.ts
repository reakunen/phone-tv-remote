export function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "connection failed";
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 1200
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function base64EncodeAscii(value: string): string {
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
