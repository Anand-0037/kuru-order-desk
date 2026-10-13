import type { PreparedIntent } from "./domain.ts";
import type { OrderStatus } from "./evidence.ts";
import type { CancelPreview } from "./store.ts";
import { formatExact } from "./amounts.ts";
export function presentIntent(i: PreparedIntent) {
  const amount = formatExact(BigInt(i.quantity), BigInt(i.snapshot.sizeScale)),
    price = formatExact(BigInt(i.price), BigInt(i.snapshot.priceScale));
  const fundingScale = i.funding.token === "USDC" ? 1_000_000n : 10n ** 18n;
  return {
    network: "Monad TESTNET (10143) · dummy test assets",
    intentId: i.id,
    confirmationDigest: i.digest,
    order: `${i.side === "buy" ? "Buy" : "Sell"} ${amount} MON at a limit of ${price} USDC/MON`,
    type: "GTC + POST_ONLY; may be skipped if crossing",
    funding: `${formatExact(BigInt(i.funding.requiredAtoms), fundingScale)} ${i.funding.token} prefunded in AccountCore`,
    fundingMeaning: i.funding.label,
    availableFunding: `${formatExact(BigInt(i.funding.freeAtoms), fundingScale)} ${i.funding.token} free in AccountCore`,
    makerFeeRate: `${formatExact(BigInt(i.snapshot.makerFeePps), 100000n)}% snapshot rate`,
    estimatedMakerFee: `${formatExact(BigInt(i.funding.estimatedMakerFeeQuoteAtoms), 1_000_000n)} USDC`,
    walletGasBalance: `${formatExact(BigInt(i.snapshot.walletMonAtoms), 10n ** 18n)} MON`,
    gas: "Separate wallet MON charge, estimated and authorized in the host wallet",
    localReviewExpires: new Date(i.expiresAtMs).toISOString(),
    market: i.market,
    owner: i.owner,
    accountId: i.accountId,
    snapshotBlock: i.snapshot.blockNumber,
    risks: i.risks,
  };
}
export function presentStatus(i: PreparedIntent, s: OrderStatus) {
  const amount = (q: string | null) =>
    q === null
      ? "Unknown"
      : `${formatExact(BigInt(q), BigInt(i.snapshot.sizeScale))} MON`;
  return {
    intentId: i.id,
    state: s.state,
    orderId: s.orderId,
    slot: s.slot,
    filled: amount(s.filledQuantity),
    open: amount(s.openQuantity),
    cancelled: amount(s.cancelledQuantity),
    otherRemoved: amount(s.removedQuantity),
    throughFinalizedBlock: s.throughBlock,
    reconciliationProvenance: s.reconciliationProvenance ?? null,
    evidence: s.reasons.length
      ? s.reasons
      : [
          "Receipt, complete bounded market-log replay and pinned account slots agree",
        ],
    fillTradeIds: s.fillTradeIds,
    cancelTransactionHashes: s.cancelTransactionHashes,
    cancellationRequest: s.cancellation ?? null,
    cancellationNote:
      "Cancellation affects only remaining order size. Filled trades stay final; released funds remain in AccountCore.",
  };
}

export function presentCancel(i: PreparedIntent, preview: CancelPreview) {
  return {
    mode: "REVIEW ONLY",
    intentId: i.id,
    orderId: preview.orderId,
    slot: preview.slot,
    remaining: `${formatExact(BigInt(preview.quantity), BigInt(i.snapshot.sizeScale))} MON`,
    confirmationDigest: preview.digest,
    localReviewExpires: new Date(preview.expiresAtMs).toISOString(),
    warning:
      "Cancellation cannot reverse prior fills. Released funds remain in AccountCore. External concurrent trading is unsafe.",
    gas: "Separate wallet MON fee, estimated and authorized by MetaMask",
  };
}
