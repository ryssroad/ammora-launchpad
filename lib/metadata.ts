export type TokenMetadata = {
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
};

export function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function decodeBase64(value: string) {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString("utf8");
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function readMetadata(uri: string): TokenMetadata | null {
  try {
    let json = "";
    if (uri.startsWith("data:application/json;base64,")) {
      json = decodeBase64(uri.slice("data:application/json;base64,".length));
    } else if (uri.startsWith("data:application/json;charset=utf-8,")) {
      json = decodeURIComponent(uri.slice("data:application/json;charset=utf-8,".length));
    } else if (uri.startsWith("data:application/json,")) {
      json = decodeURIComponent(uri.slice("data:application/json,".length));
    } else {
      return null;
    }
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      symbol: typeof parsed.symbol === "string" ? parsed.symbol : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      image: typeof parsed.image === "string" ? httpsUrl(parsed.image) ?? undefined : undefined,
    };
  } catch {
    return null;
  }
}

export function buildMetadataUri(input: { name: string; symbol: string; image?: string; description?: string }) {
  const doc: Record<string, string> = { name: input.name, symbol: input.symbol };
  if (input.description) doc.description = input.description;
  if (input.image) doc.image = input.image;
  return `data:application/json;base64,${encodeBase64(JSON.stringify(doc))}`;
}
