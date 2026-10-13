import {
  address,
  DEPLOYMENT,
  hash,
  integer,
  record,
  type PreparedIntent,
  type Side,
} from "./domain.ts";
import { canonical, verifyIntent } from "./planner.ts";

export interface Observation {
  kind: "book" | "trade";
  chainId: number;
  market: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  recordIndex: number;
  actionAccountId: string;
  clientOrderId: string;
  makerId: string;
  orderId: string;
  slot: number;
  side: Side;
  price: string;
  makerFeePps: string;
  operationIndex?: number;
}
export interface BookObservation extends Observation {
  kind: "book";
  size: string;
  live: boolean;
  sentinel: boolean;
  outcome: number;
}
export interface TradeObservation extends Observation {
  kind: "trade";
  fillSize: string;
  updatedSize: string;
  tradeId: string;
  passive: boolean;
}
export type OrderObservation = BookObservation | TradeObservation;
export interface OrderEvidence {
  chainId: number;
  market: string;
  submissionHash: string;
  receiptStatus: "success" | "reverted" | "pending";
  receiptBlock: string;
  requestMatches: boolean;
  finalized: boolean;
  complete: boolean;
  canonical: boolean;
  fromBlock: string;
  toBlock: string;
  headHash: string;
  observedAtMs: number;
  events: OrderObservation[];
  slots: string[];
}
export interface ReconciliationProvenance {
  schemaVersion: 2;
  chainId: number;
  market: string;
  intentOwner: string;
  intentAccountId: string;
  submissionHash: string;
  expectedSubmissionHash: string;
  submissionHashMatches: boolean;
  receiptStatus: OrderEvidence["receiptStatus"];
  receiptBlock: string;
  evidenceFromBlock: string;
  evidenceToBlock: string;
  finalizedHeadHash: string;
  observedAtMs: number;
  requestMatches: boolean;
  finalized: boolean;
  complete: boolean;
  canonical: boolean;
}
export interface OrderStatus {
  state:
    | "unconfirmed"
    | "needs-review"
    | "reverted"
    | "not-placed"
    | "open"
    | "partially-filled"
    | "filled"
    | "cancelled"
    | "partially-filled-cancelled"
    | "removed";
  orderId: string | null;
  slot: number | null;
  filledQuantity: string | null;
  openQuantity: string | null;
  cancelledQuantity: string | null;
  removedQuantity: string | null;
  observedAtMs: number | null;
  throughBlock: string | null;
  reasons: string[];
  fillTradeIds: string[];
  cancelTransactionHashes: string[];
  cancelActions?: {
    transactionHash: string;
    clientOrderId: string;
    accountId: string;
    quantity: string;
    operationIndex: number | undefined;
  }[];
  reconciliationProvenance?: ReconciliationProvenance;
  cancellation?: {
    phase: string;
    transactionHash: string | null;
    receiptState:
      | "not-requested"
      | "unknown"
      | "pending"
      | "success"
      | "reverted"
      | "unavailable";
    confirmedByTrackedDeletion: boolean;
    note: string;
  };
}
function uncertain(
  reason: string,
  state: OrderStatus["state"] = "needs-review",
): OrderStatus {
  return {
    state,
    orderId: null,
    slot: null,
    filledQuantity: null,
    openQuantity: null,
    cancelledQuantity: null,
    removedQuantity: null,
    observedAtMs: null,
    throughBlock: null,
    reasons: [reason],
    fillTradeIds: [],
    cancelTransactionHashes: [],
  };
}
function compare(a: Observation, b: Observation): number {
  const block = BigInt(a.blockNumber) - BigInt(b.blockNumber);
  return block < 0n
    ? -1
    : block > 0n
      ? 1
      : a.transactionIndex - b.transactionIndex ||
        a.logIndex - b.logIndex ||
        a.recordIndex - b.recordIndex;
}
function observation(value: unknown): OrderObservation {
  const v = record(value);
  if (v.kind !== "book" && v.kind !== "trade")
    throw new Error("Unknown event kind");
  for (const k of [
    "blockNumber",
    "actionAccountId",
    "makerId",
    "orderId",
    "price",
    "makerFeePps",
  ])
    integer(v[k], k);
  for (const k of ["transactionHash", "blockHash", "clientOrderId"])
    hash(v[k], k);
  address(v.market);
  for (const k of ["transactionIndex", "logIndex", "recordIndex", "slot"])
    if (typeof v[k] !== "number" || !Number.isSafeInteger(v[k]) || v[k] < 0)
      throw new Error("Invalid observation position");
  if ((v.slot as number) > 255 || (v.side !== "buy" && v.side !== "sell"))
    throw new Error("Invalid order metadata");
  if (v.kind === "book") {
    integer(v.size, "size");
    if (
      typeof v.live !== "boolean" ||
      typeof v.sentinel !== "boolean" ||
      !Number.isInteger(v.outcome)
    )
      throw new Error("Invalid book record");
  } else {
    for (const k of ["fillSize", "updatedSize", "tradeId"]) integer(v[k], k);
    if (typeof v.passive !== "boolean") throw new Error("Invalid trade record");
  }
  return v as unknown as OrderObservation;
}
export function reconcile(
  intent: PreparedIntent,
  value: unknown,
  expectedSubmissionHash?: string,
): OrderStatus {
  try {
    if (!verifyIntent(intent)) return uncertain("Invalid immutable intent");
    const v = record(value);
    if (
      v.chainId !== DEPLOYMENT.chainId ||
      address(v.market) !== DEPLOYMENT.market
    )
      return uncertain("Wrong chain or market");
    if (v.receiptStatus === "pending")
      return uncertain("Transaction not yet included", "unconfirmed");
    if (v.requestMatches !== true)
      return uncertain(
        "Transaction does not match reviewed calldata/owner/target",
      );
    if (v.canonical !== true || v.complete !== true)
      return uncertain("Incomplete or noncanonical evidence");
    if (v.finalized !== true)
      return uncertain("Finalized receipt/head unavailable", "unconfirmed");
    const start = integer(v.receiptBlock, "receiptBlock"),
      from = integer(v.fromBlock, "fromBlock"),
      end = integer(v.toBlock, "toBlock");
    if (from !== start || end < start)
      return uncertain(
        "Evidence does not cover the full receipt-to-head range",
      );
    hash(v.headHash);
    const submissionHash = hash(v.submissionHash);
    if (
      expectedSubmissionHash !== undefined &&
      submissionHash !== hash(expectedSubmissionHash)
    )
      return uncertain(
        "Evidence submission hash does not match persisted transaction",
      );
    if (
      !Array.isArray(v.events) ||
      !Array.isArray(v.slots) ||
      v.slots.length !== 62
    )
      return uncertain("Missing market logs or account slots");
    for (const slot of v.slots) integer(slot, "slot orderId");
    if (v.receiptStatus === "reverted")
      return {
        ...uncertain("Original transaction reverted", "reverted"),
        filledQuantity: "0",
        openQuantity: "0",
        cancelledQuantity: "0",
        removedQuantity: "0",
      };
    if (v.receiptStatus !== "success")
      return uncertain("Unknown transaction status");
    const seen = new Map<string, string>(),
      fills = new Map<string, string>(),
      events: OrderObservation[] = [];
    for (const raw of v.events) {
      const r = record(raw);
      if (
        r.chainId !== DEPLOYMENT.chainId ||
        address(r.market) !== DEPLOYMENT.market
      )
        continue;
      const e = observation(r),
        block = BigInt(e.blockNumber);
      if (block < from || block > end)
        return uncertain("Log outside evidence range");
      const key = `${e.blockHash}:${e.transactionHash}:${e.logIndex}:${e.recordIndex}`;
      const normalized = canonical(e),
        previous = seen.get(key);
      if (previous && previous !== normalized)
        return uncertain("Conflicting observation identity");
      if (previous) continue;
      seen.set(key, normalized);
      if (e.kind === "trade") {
        const fillKey = `${e.chainId}:${e.market}:${e.tradeId}`;
        const previousFill = fills.get(fillKey);
        // A canonical fill may not move to a different observation in one finalized replay.
        if (previousFill && previousFill !== normalized)
          return uncertain("Conflicting canonical trade identity");
        if (previousFill) continue;
        fills.set(fillKey, normalized);
      }
      events.push(e);
    }
    events.sort(compare);
    const ownAction = events.filter(
      (e) =>
        e.transactionHash.toLowerCase() === submissionHash &&
        e.clientOrderId.toLowerCase() === intent.clientOrderId &&
        e.actionAccountId === intent.accountId,
    );
    if (ownAction.some((e) => e.kind === "trade"))
      return uncertain("Post-only transaction unexpectedly executed as taker");
    const initial = ownAction.filter(
      (e): e is BookObservation =>
        e.kind === "book" && e.operationIndex === 0 && e.outcome !== 0,
    );
    if (initial.length !== 1)
      return uncertain(
        "Expected one uniquely bound post-only operation outcome",
      );
    const create = initial[0]!;
    if (
      create.outcome === 6 &&
      create.sentinel &&
      !create.live &&
      create.size === "0" &&
      create.orderId === "0" &&
      create.makerId === "0" &&
      create.slot === 255
    ) {
      if (v.slots.some((x) => x !== "0"))
        return uncertain("Unexpected account order after skipped submission");
      return {
        state: "not-placed",
        orderId: null,
        slot: null,
        filledQuantity: "0",
        openQuantity: "0",
        cancelledQuantity: "0",
        removedQuantity: "0",
        observedAtMs: v.observedAtMs as number,
        throughBlock: end.toString(),
        reasons: ["Post-only would cross: no order was placed"],
        fillTradeIds: [],
        cancelTransactionHashes: [],
      };
    }
    if (
      create.outcome !== 2 ||
      create.sentinel ||
      !create.live ||
      create.makerId !== intent.accountId ||
      create.orderId === "0" ||
      create.slot >= 62 ||
      create.size !== intent.quantity ||
      create.price !== intent.price ||
      create.side !== intent.side
    )
      return uncertain(
        "Creation record does not match prepared post-only order",
      );
    let remaining = BigInt(intent.quantity),
      filled = 0n,
      cancelled = 0n,
      removed = 0n;
    const fillTradeIds: string[] = [],
      cancelTransactionHashes: string[] = [];
    const cancelActions: NonNullable<OrderStatus["cancelActions"]> = [];
    for (const e of events) {
      if (
        compare(e, create) <= 0 ||
        e.makerId !== intent.accountId ||
        e.orderId !== create.orderId
      )
        continue;
      if (
        e.slot !== create.slot ||
        e.side !== intent.side ||
        e.price !== intent.price
      )
        return uncertain("Tracked order identity changed");
      if (e.kind === "trade") {
        if (e.passive || e.makerFeePps !== create.makerFeePps)
          return uncertain("Unsupported maker record");
        const q = BigInt(e.fillSize),
          after = BigInt(e.updatedSize);
        if (q <= 0n || q > remaining || remaining - q !== after)
          return uncertain(
            "Fill amount does not reconcile to exact remaining quantity",
          );
        remaining = after;
        filled += q;
        fillTradeIds.push(e.tradeId);
      } else {
        if (e.live || e.sentinel)
          return uncertain(
            "Tracked order was unexpectedly replaced or replenished",
          );
        const q = BigInt(e.size);
        if (q !== remaining || q <= 0n)
          return uncertain("Deletion amount does not match unfilled remainder");
        remaining = 0n;
        if (e.outcome === 7) {
          cancelled += q;
          cancelTransactionHashes.push(e.transactionHash);
          cancelActions.push({
            transactionHash: e.transactionHash,
            clientOrderId: e.clientOrderId,
            accountId: e.actionAccountId,
            quantity: q.toString(),
            operationIndex: e.operationIndex,
          });
        } else removed += q;
      }
    }
    const slot = v.slots[create.slot];
    if (slot !== "0" && slot !== create.orderId)
      return uncertain("Tracked slot has been reused; refuse cancellation");
    if (
      (remaining > 0n && slot !== create.orderId) ||
      (remaining === 0n && slot !== "0")
    )
      return uncertain("Logs disagree with pinned on-chain slot");
    if (v.slots.some((id, n) => n !== create.slot && id !== "0"))
      return uncertain(
        "Exclusive-account assumption violated by another order",
      );
    if (filled + remaining + cancelled + removed !== BigInt(intent.quantity))
      return uncertain("Order quantity conservation failed");
    const state: OrderStatus["state"] =
      remaining > 0n
        ? filled > 0n
          ? "partially-filled"
          : "open"
        : removed > 0n
          ? "removed"
          : cancelled > 0n
            ? filled > 0n
              ? "partially-filled-cancelled"
              : "cancelled"
            : "filled";
    return {
      state,
      orderId: create.orderId,
      slot: create.slot,
      filledQuantity: filled.toString(),
      openQuantity: remaining.toString(),
      cancelledQuantity: cancelled.toString(),
      removedQuantity: removed.toString(),
      observedAtMs: v.observedAtMs as number,
      throughBlock: end.toString(),
      reasons: [],
      fillTradeIds,
      cancelTransactionHashes,
      cancelActions,
    };
  } catch (error) {
    return uncertain(
      error instanceof Error ? error.message : "Invalid evidence",
    );
  }
}
