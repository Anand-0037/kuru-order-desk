export function scaleDecimals(scale: bigint): number {
  if (scale < 1n || !/^10*$/.test(scale.toString()) || scale > 10n ** 18n)
    throw new Error("Unsupported precision scale");
  return scale.toString().length - 1;
}
export function parseExact(value: string, scale: bigint): bigint {
  const decimals = scaleDecimals(scale);
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw new Error("Use a plain nonnegative decimal string");
  const [whole = "", fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error("Amount has extra precision; rounding is not allowed");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, "0") || "0");
}
export function formatExact(value: bigint, scale: bigint): string {
  const decimals = scaleDecimals(scale);
  if (value < 0n) throw new Error("Negative amount");
  if (!decimals) return value.toString();
  const frac = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${value / scale}${frac ? `.${frac}` : ""}`;
}
export function ceilDiv(value: bigint, divisor: bigint): bigint {
  if (value < 0n || divisor <= 0n) throw new Error("Invalid unsigned division");
  return (value + divisor - 1n) / divisor;
}
