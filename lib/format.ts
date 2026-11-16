import { formatUnits } from "viem";

export function formatRaw(raw: string | bigint, decimals: number, maxFraction = 6) {
  const text = formatUnits(typeof raw === "bigint" ? raw : BigInt(raw), decimals);
  const [whole, fraction = ""] = text.split(".");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function shortAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function progressPercent(bps: number) {
  if (!Number.isFinite(bps)) return 0;
  return Math.max(0, Math.min(100, bps / 100));
}

export function statusTone(status: number) {
  if (status === 1) return "active";
  if (status === 2) return "ready";
  if (status === 3) return "done";
  return "idle";
}
