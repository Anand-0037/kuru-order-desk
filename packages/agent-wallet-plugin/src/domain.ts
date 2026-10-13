export const DEPLOYMENT = Object.freeze({
  chainId: 10143,
  market: "0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9",
  accountCore: "0xdbaade7b42c95399bb1e9614d51b5b9e2cf78038",
  baseToken: "0x0000000000000000000000000000000000000000",
  quoteToken: "0xa402b424f392eaa05dbc8779e4502a1f6a96fef1",
  marketImplementation: "0xa4171e141a3cf7801d7f06c126284ac0a509e6a9",
  accountImplementation: "0x980719bfce5bf47fbe6951676086bde2fd8452b1",
} as const);
export const ZERO = DEPLOYMENT.baseToken;
export const SNAPSHOT_MAX_AGE_MS = 30_000;
// Block timestamps can briefly lead a local wall clock without invalidating chain identity.
export const SNAPSHOT_FUTURE_SKEW_MS = 2_000;
export const INTENT_TTL_MS = 300_000;
export const PPS = 10_000_000n;
export type Hex = `0x${string}`;
export type Side = "buy" | "sell";
export interface MarketSnapshot {
  chainId: number;
  market: string;
  accountCore: string;
  baseToken: string;
  quoteToken: string;
  marketImplementation: string;
  accountImplementation: string;
  owner: string;
  accountId: string;
  blockNumber: string;
  blockHash: string;
  observedAtMs: number;
  blockTimestampMs: number;
  priceScale: string;
  sizeScale: string;
  baseMultiplier: string;
  quoteDecimals: number;
  tick: string;
  minQuoteAtoms: string;
  maxQuoteAtoms: string;
  makerFeePps: string;
  baseFreeAtoms: string;
  quoteFreeAtoms: string;
  baseReservedAtoms: string;
  quoteReservedAtoms: string;
  walletMonAtoms: string;
  slots: string[];
  postFillHook: string;
  paused: boolean;
  marketState: number;
}
export interface PreparedIntent {
  version: 1;
  id: string;
  digest: string;
  clientOrderId: Hex;
  owner: string;
  accountId: string;
  chainId: 10143;
  market: string;
  side: Side;
  price: string;
  quantity: string;
  createdAtMs: number;
  expiresAtMs: number;
  material: string;
  quoteNotionalAtoms: string;
  baseAtoms: string;
  funding: {
    token: "MON" | "USDC";
    requiredAtoms: string;
    freeAtoms: string;
    estimatedMakerFeeQuoteAtoms: string;
    label: string;
  };
  snapshot: MarketSnapshot;
  risks: string[];
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected object");
  return value as Record<string, unknown>;
}
export function integer(
  value: unknown,
  name: string,
  max = (1n << 256n) - 1n,
): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)$/.test(value) ||
    value.length > 78
  )
    throw new Error(`${name}: expected unsigned decimal integer`);
  const parsed = BigInt(value);
  if (parsed > max) throw new Error(`${name}: outside integer bounds`);
  return parsed;
}
export function address(value: unknown, name = "address"): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new Error(`${name}: invalid address`);
  return value.toLowerCase();
}
export function hash(value: unknown, name = "hash"): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new Error(`${name}: invalid hash`);
  return value.toLowerCase() as Hex;
}
export function safeMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid timestamp");
  return value;
}
