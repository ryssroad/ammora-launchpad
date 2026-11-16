export function isGiwaRateLimit(error: unknown): boolean {
  // Contract and SDK errors may wrap the original JSON-RPC error.
  for (let depth = 0; depth < 8 && error && typeof error === "object"; depth++) {
    const item = error as { code?: number; cause?: unknown };
    if (item.code === -32016) return true;
    error = item.cause;
  }
  return false;
}

export function publicError(error: unknown) {
  const record = error && typeof error === "object" ? (error as { shortMessage?: string; message?: string }) : null;
  const message = record?.shortMessage || record?.message || "Request failed.";
  if (isGiwaRateLimit(error)) return "GIWA is handling too many requests. Wait a moment and try again.";
  if (/^RPC Request failed\.?$|timed out|too many requests/i.test(message)) {
    return "GIWA could not answer this request. Wait a moment and try again.";
  }
  return message.replace(/https?:\/\/\S+/g, "[endpoint]").slice(0, 420);
}

export function parsePositiveInt(value: string | undefined, label: string) {
  const raw = value?.trim() || "";
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${label} must be a positive integer.`);
  return BigInt(raw);
}

export function configIdFromEnv() {
  return parsePositiveInt(process.env.CONFIG_ID || process.env.NEXT_PUBLIC_CONFIG_ID || "6", "CONFIG_ID");
}

export function slippageBps(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 100);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error("Slippage must be an integer from 0 to 1000 basis points (0–10%).");
  }
  return parsed;
}
