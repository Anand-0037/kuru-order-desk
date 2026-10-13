import { createHash } from "node:crypto";
import { ceilDiv, formatExact, parseExact, scaleDecimals } from "./amounts.ts";
import {
  address,
  DEPLOYMENT,
  hash,
  integer,
  INTENT_TTL_MS,
  PPS,
  record,
  safeMs,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_FUTURE_SKEW_MS,
  ZERO,
  type MarketSnapshot,
  type PreparedIntent,
} from "./domain.ts";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Cannot digest undefined");
  return result;
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function validateSnapshot(value: unknown): MarketSnapshot {
  const v = record(value);
  for (const [key, expected] of Object.entries(DEPLOYMENT)) {
    if (key === "chainId") {
      if (v[key] !== expected)
        throw new Error("Expected Monad testnet chain 10143");
    } else if (address(v[key], key) !== expected)
      throw new Error(`Unrecognized deployment ${key}`);
  }
  const s = { ...v, ...DEPLOYMENT } as unknown as MarketSnapshot;
  s.owner = address(v.owner, "owner");
  if (s.owner === ZERO) throw new Error("Zero owner");
  s.postFillHook = address(v.postFillHook, "postFillHook");
  hash(v.blockHash, "blockHash");
  safeMs(v.observedAtMs);
  safeMs(v.blockTimestampMs);
  for (const key of [
    "accountId",
    "blockNumber",
    "priceScale",
    "sizeScale",
    "baseMultiplier",
    "tick",
    "minQuoteAtoms",
    "maxQuoteAtoms",
    "makerFeePps",
    "baseFreeAtoms",
    "quoteFreeAtoms",
    "baseReservedAtoms",
    "quoteReservedAtoms",
    "walletMonAtoms",
  ] as const)
    integer(s[key], key);
  if (!Array.isArray(v.slots) || v.slots.length !== 62)
    throw new Error("All 62 order slots must be read");
  for (const id of v.slots) integer(id, "orderId", (1n << 64n) - 1n);
  if (typeof s.paused !== "boolean" || !Number.isInteger(s.marketState))
    throw new Error("Invalid protocol state");
  if (
    s.quoteDecimals !== 6 ||
    BigInt(s.sizeScale) * BigInt(s.baseMultiplier) !== 10n ** 18n
  )
    throw new Error("Invalid token units");
  scaleDecimals(BigInt(s.priceScale));
  scaleDecimals(BigInt(s.sizeScale));
  if (
    !BigInt(s.tick) ||
    BigInt(s.makerFeePps) > PPS ||
    BigInt(s.minQuoteAtoms) > BigInt(s.maxQuoteAtoms) ||
    BigInt(s.accountId) >= 1n << 40n
  )
    throw new Error("Invalid market/account parameters");
  return s;
}
export function assertFresh(s: MarketSnapshot, nowMs: number): void {
  safeMs(nowMs);
  if (
    s.observedAtMs > nowMs ||
    nowMs - s.observedAtMs > SNAPSHOT_MAX_AGE_MS ||
    s.blockTimestampMs - nowMs > SNAPSHOT_FUTURE_SKEW_MS ||
    nowMs - s.blockTimestampMs > SNAPSHOT_MAX_AGE_MS
  )
    throw new Error("Stale or future chain snapshot");
}
export function materialSnapshot(value: unknown): string {
  const s = validateSnapshot(value);
  return digest(
    Object.fromEntries(
      [
        "chainId",
        "market",
        "accountCore",
        "baseToken",
        "quoteToken",
        "marketImplementation",
        "accountImplementation",
        "owner",
        "accountId",
        "priceScale",
        "sizeScale",
        "baseMultiplier",
        "quoteDecimals",
        "tick",
        "minQuoteAtoms",
        "maxQuoteAtoms",
        "makerFeePps",
      ].map((k) => [k, s[k as keyof MarketSnapshot]]),
    ),
  );
}
export function prepareIntent(
  value: unknown,
  snapshotValue: unknown,
  nowMs: number,
): PreparedIntent {
  const input = record(value),
    s = validateSnapshot(snapshotValue);
  assertFresh(s, nowMs);
  const owner = address(input.owner);
  if (owner !== s.owner || !BigInt(s.accountId))
    throw new Error("Owner requires its registered root account");
  if (input.side !== "buy" && input.side !== "sell")
    throw new Error("Side must be buy or sell");
  if (s.paused || s.marketState !== 0)
    throw new Error("Market/protocol is not active");
  if (s.postFillHook !== ZERO)
    throw new Error("Custom post-fill hooks are unsupported");
  if (s.slots.some((id) => id !== "0"))
    throw new Error("Dedicated exclusive account must have no open orders");
  if (!BigInt(s.walletMonAtoms)) throw new Error("Wallet needs MON for gas");
  const price = parseExact(input.price as string, BigInt(s.priceScale));
  const quantity = parseExact(input.quantity as string, BigInt(s.sizeScale));
  if (
    price <= 0n ||
    price >= 1n << 32n ||
    quantity <= 0n ||
    quantity >= 1n << 96n ||
    price % BigInt(s.tick)
  )
    throw new Error("Price/quantity violates tick or ABI bounds");
  const quoteScale = 10n ** BigInt(s.quoteDecimals);
  const notional =
    (((price * quantity) / BigInt(s.sizeScale)) * quoteScale) /
    BigInt(s.priceScale);
  if (notional < BigInt(s.minQuoteAtoms) || notional > BigInt(s.maxQuoteAtoms))
    throw new Error("Order outside market notional bounds");
  const estimate = ceilDiv(
    price * quantity * quoteScale,
    BigInt(s.priceScale) * BigInt(s.sizeScale),
  );
  const fee = ceilDiv(estimate * BigInt(s.makerFeePps), PPS);
  const base = quantity * BigInt(s.baseMultiplier);
  const required = input.side === "buy" ? estimate + fee : base;
  const free = input.side === "buy" ? s.quoteFreeAtoms : s.baseFreeAtoms;
  if (BigInt(free) < required)
    throw new Error("Insufficient prefunded AccountCore free balance");
  const payload = {
    version: 1 as const,
    owner,
    accountId: s.accountId,
    chainId: 10143 as const,
    market: DEPLOYMENT.market,
    side: input.side as "buy" | "sell",
    price: price.toString(),
    quantity: quantity.toString(),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + INTENT_TTL_MS,
    material: materialSnapshot(s),
    quoteNotionalAtoms: notional.toString(),
    baseAtoms: base.toString(),
    funding: {
      token: input.side === "buy" ? ("USDC" as const) : ("MON" as const),
      requiredAtoms: required.toString(),
      freeAtoms: free,
      estimatedMakerFeeQuoteAtoms: fee.toString(),
      label:
        "Conservative snapshot funding estimate; not an execution-time cap",
    },
    snapshot: s,
    risks: [
      "TESTNET ONLY: these are dummy assets; no profit or fill is guaranteed.",
      "GTC POST_ONLY can be skipped; a resting order may fill partially or fully before cancellation.",
      "Cancellation cannot reverse fills. Released funds remain in AccountCore, subject to withdrawal rules.",
      "Direct batch has no execution-time deadline or maker-fee cap; local expiry and fees are preflight checks only.",
      "Use one dedicated exclusive account: external concurrent trading can reuse a slot after the cancellation check.",
      "Gas is charged in wallet MON separately; MetaMask displays the transaction fee before authorization.",
    ],
  };
  const d = digest(payload);
  return { ...payload, id: d, digest: d, clientOrderId: `0x${d}` };
}
export function verifyIntent(value: unknown): value is PreparedIntent {
  try {
    const v = record(value);
    if (
      v.version !== 1 ||
      typeof v.id !== "string" ||
      !/^[a-f0-9]{64}$/.test(v.id) ||
      v.digest !== v.id ||
      v.clientOrderId !== `0x${v.id}`
    )
      return false;
    const s = validateSnapshot(v.snapshot),
      created = safeMs(v.createdAtMs);
    if (safeMs(v.expiresAtMs) !== created + INTENT_TTL_MS) return false;
    const p = prepareIntent(
      {
        owner: v.owner,
        side: v.side,
        price: formatExact(integer(v.price, "price"), BigInt(s.priceScale)),
        quantity: formatExact(
          integer(v.quantity, "quantity"),
          BigInt(s.sizeScale),
        ),
      },
      s,
      created,
    );
    return canonical(p) === canonical(v);
  } catch {
    return false;
  }
}
