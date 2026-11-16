export function publicError(error: unknown) {
  const record = error && typeof error === "object" ? (error as { shortMessage?: string; message?: string }) : null;
  const message = record?.shortMessage || record?.message || "Request failed.";
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
