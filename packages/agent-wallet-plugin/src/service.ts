import { formatExact } from "./amounts.ts";
import {
  address,
  hash,
  integer,
  record,
  SNAPSHOT_MAX_AGE_MS,
  type PreparedIntent,
} from "./domain.ts";
import {
  assertFresh,
  digest,
  materialSnapshot,
  prepareIntent,
  validateSnapshot,
  verifyIntent,
} from "./planner.ts";
import { reconcile, type OrderEvidence, type OrderStatus } from "./evidence.ts";
import {
  type CancelPreview,
  type IntentRecord,
  type IntentStore,
  type Operation,
} from "./store.ts";
import {
  buildCancelTransaction,
  buildOrderTransaction,
  type FixedTransaction,
} from "./transactions.ts";

export interface ChainReader {
  snapshot(owner: string): Promise<unknown>;
  evidence(intent: PreparedIntent, hash: string): Promise<OrderEvidence>;
  simulate(tx: FixedTransaction): Promise<void>;
  transactionOutcome?(
    tx: FixedTransaction,
    hash: string,
  ): Promise<"pending" | "success" | "reverted">;
}
export type Executor = (
  tx: FixedTransaction,
  summary: string,
) => Promise<{ hash?: string; status?: string }>;
const terminal = new Set([
  "not-placed",
  "filled",
  "cancelled",
  "partially-filled-cancelled",
  "removed",
  "reverted",
]);
export class OrderService {
  private readonly store: IntentStore;
  private readonly chain: ChainReader;
  private readonly executor: Executor;
  private readonly now: () => number;
  constructor(
    store: IntentStore,
    chain: ChainReader,
    executor: Executor,
    now: () => number = Date.now,
  ) {
    this.store = store;
    this.chain = chain;
    this.executor = executor;
    this.now = now;
  }
  async prepare(value: unknown): Promise<PreparedIntent> {
    return this.store.withLock(async () => {
      const owner = address(record(value).owner);
      for (const r of await this.store.list()) {
        if (r.intent.owner !== owner) continue;
        if (
          r.cancellation.phase === "started" ||
          r.cancellation.phase === "unknown"
        )
          throw new Error(
            "Unresolved cancellation blocks any new intent for this owner",
          );
        if (r.cancellation.phase === "broadcast") {
          if (
            !r.cancelPreview ||
            !r.cancellation.hash ||
            !this.chain.transactionOutcome
          )
            throw new Error(
              "Unresolved cancellation receipt blocks owner reuse",
            );
          const outcome = await this.chain.transactionOutcome(
            buildCancelTransaction(
              r.intent,
              r.cancelPreview.slot,
              r.cancelPreview.clientOrderId,
            ),
            r.cancellation.hash,
          );
          if (outcome === "pending")
            throw new Error("Pending cancellation blocks owner reuse");
        }
        if (
          r.submission.phase === "not-started" &&
          r.intent.expiresAtMs < this.now()
        )
          continue;
        if (
          r.submission.phase === "broadcast" &&
          terminal.has((await this.readStatus(r)).state)
        )
          continue;
        throw new Error(
          `An active intent already exists for this owner: ${r.intent.id}`,
        );
      }
      const i = prepareIntent(
        value,
        await this.chain.snapshot(owner),
        this.now(),
      );
      await this.store.create(i);
      return i;
    });
  }
  private checkUser(
    i: PreparedIntent,
    confirm: string,
    expected: string,
    exclusive: boolean,
    selected: string,
  ): void {
    if (!verifyIntent(i)) throw new Error("Invalid intent");
    if (confirm !== expected)
      throw new Error("Exact review confirmation digest is required");
    if (!exclusive)
      throw new Error("Dedicated exclusive-account declaration is required");
    if (address(selected) !== i.owner)
      throw new Error("Selected wallet does not match the reviewed owner");
  }
  async submit(
    id: string,
    confirm: string,
    exclusive: boolean,
    selected: string,
  ): Promise<IntentRecord> {
    return this.store.withLock(async () => {
      const r = await this.store.read(id),
        i = r.intent;
      this.checkUser(i, confirm, i.digest, exclusive, selected);
      if (r.submission.phase === "broadcast") return r;
      if (r.submission.phase !== "not-started")
        throw new Error(
          `Submission ${r.submission.phase}; do not resubmit. Reconcile the wallet request manually.`,
        );
      if (this.now() > i.expiresAtMs)
        throw new Error("Intent expired; prepare a new review");
      const s = validateSnapshot(await this.chain.snapshot(i.owner));
      assertFresh(s, this.now());
      if (materialSnapshot(s) !== i.material)
        throw new Error(
          "Material fees/market/account changed; prepare a new review",
        );
      if (
        s.paused ||
        s.marketState !== 0 ||
        s.postFillHook !== "0x0000000000000000000000000000000000000000" ||
        s.slots.some((x) => x !== "0")
      )
        throw new Error(
          "Account is not exclusively empty or market is inactive",
        );
      const free = i.side === "buy" ? s.quoteFreeAtoms : s.baseFreeAtoms;
      if (
        BigInt(free) < BigInt(i.funding.requiredAtoms) ||
        BigInt(s.walletMonAtoms) === 0n
      )
        throw new Error("Funding changed; insufficient free balance or gas");
      const tx = buildOrderTransaction(i);
      await this.chain.simulate(tx);
      assertFresh(s, this.now());
      if (this.now() > i.expiresAtMs)
        throw new Error("Intent expired during simulation");
      return this.executeOnce(
        r,
        "submission",
        tx,
        `Kuru TESTNET: ${i.side} ${formatExact(BigInt(i.quantity), BigInt(i.snapshot.sizeScale))} MON at limit ${formatExact(BigInt(i.price), BigInt(i.snapshot.priceScale))} USDC/MON; GTC POST_ONLY; reviewed ${i.digest}`,
      );
    });
  }
  private async executeOnce(
    r: IntentRecord,
    key: "submission" | "cancellation",
    tx: FixedTransaction,
    summary: string,
  ): Promise<IntentRecord> {
    r[key] = { phase: "started", atMs: this.now() };
    await this.store.save(r);
    try {
      const result = await this.executor(tx, summary);
      const txHash = hash(result.hash, "wallet transaction hash");
      r[key] = { phase: "broadcast", atMs: r[key].atMs!, hash: txHash };
      await this.store.save(r);
      return r;
    } catch {
      // Even a rejected/timeout response may occur after an external submission. Never reset.
      const barrier: Operation = {
        phase: "unknown",
        atMs: r[key].atMs!,
        error:
          "Wallet result unknown; inspect host wallet requests before any further action",
      };
      r[key] = barrier;
      try {
        await this.store.save(r);
      } catch {
        /* The durable started record still prevents resend. */
      }
      throw new Error(
        `${key} outcome unknown; no automatic retry. Inspect MetaMask wallet requests and chain evidence.`,
      );
    }
  }
  private async readStatus(r: IntentRecord): Promise<OrderStatus> {
    if (r.submission.phase !== "broadcast" || !r.submission.hash) {
      return {
        state:
          r.submission.phase === "not-started" ? "unconfirmed" : "needs-review",
        orderId: null,
        slot: null,
        filledQuantity: null,
        openQuantity: null,
        cancelledQuantity: null,
        removedQuantity: null,
        observedAtMs: null,
        throughBlock: null,
        reasons: [
          `Submission ${r.submission.phase}; no verified transaction hash`,
        ],
        fillTradeIds: [],
        cancelTransactionHashes: [],
      };
    }
    const observed = await this.chain.evidence(r.intent, r.submission.hash),
      status = reconcile(r.intent, observed, r.submission.hash);
    const observedSubmissionHash = hash(observed.submissionHash),
      expectedSubmissionHash = hash(r.submission.hash);
    let receiptState: NonNullable<OrderStatus["cancellation"]>["receiptState"] =
      r.cancellation.phase === "not-started" ? "not-requested" : "unknown";
    if (
      r.cancellation.phase === "broadcast" &&
      r.cancellation.hash &&
      r.cancelPreview
    ) {
      try {
        receiptState = this.chain.transactionOutcome
          ? await this.chain.transactionOutcome(
              buildCancelTransaction(
                r.intent,
                r.cancelPreview.slot,
                r.cancelPreview.clientOrderId,
              ),
              r.cancellation.hash,
            )
          : "unavailable";
      } catch {
        receiptState = "unavailable";
      }
    }
    const confirmed =
      receiptState === "success" &&
      !!status.cancelActions?.some(
        (a) =>
          a.transactionHash === r.cancellation.hash &&
          a.clientOrderId === r.cancelPreview?.clientOrderId &&
          a.accountId === r.intent.accountId &&
          a.operationIndex === 0,
      );
    return {
      ...status,
      reconciliationProvenance: {
        schemaVersion: 2,
        chainId: observed.chainId,
        market: observed.market,
        intentOwner: r.intent.owner,
        intentAccountId: r.intent.accountId,
        submissionHash: observedSubmissionHash,
        expectedSubmissionHash,
        submissionHashMatches:
          observedSubmissionHash === expectedSubmissionHash,
        receiptStatus: observed.receiptStatus,
        receiptBlock: observed.receiptBlock,
        evidenceFromBlock: observed.fromBlock,
        evidenceToBlock: observed.toBlock,
        finalizedHeadHash: observed.headHash,
        observedAtMs: observed.observedAtMs,
        requestMatches: observed.requestMatches,
        finalized: observed.finalized,
        complete: observed.complete,
        canonical: observed.canonical,
      },
      cancellation: {
        phase: r.cancellation.phase,
        transactionHash: r.cancellation.hash ?? null,
        receiptState,
        confirmedByTrackedDeletion: confirmed,
        note: confirmed
          ? "Matching finalized cancellation transaction and tracked order deletion verified."
          : "Order state and cancellation-request outcome are separate; this request is not yet verified to have cancelled the remainder.",
      },
    };
  }
  // Read-only recovery works even when a crashed process left its local mutation lock.
  async status(id: string): Promise<OrderStatus> {
    return this.readStatus(await this.store.read(id));
  }
  private async cancelState(r: IntentRecord): Promise<OrderStatus> {
    const state = await this.readStatus(r);
    if (
      !["open", "partially-filled"].includes(state.state) ||
      state.orderId === null ||
      state.slot === null ||
      state.openQuantity === null ||
      integer(state.openQuantity, "openQuantity") === 0n
    )
      throw new Error(
        `Cannot cancel: ${state.state}. ${state.reasons.join("; ")}`,
      );
    if (
      state.observedAtMs === null ||
      this.now() < state.observedAtMs ||
      this.now() - state.observedAtMs > SNAPSHOT_MAX_AGE_MS
    )
      throw new Error("Stale cancellation evidence");
    const s = validateSnapshot(await this.chain.snapshot(r.intent.owner));
    assertFresh(s, this.now());
    if (
      s.accountId !== r.intent.accountId ||
      s.owner !== r.intent.owner ||
      s.slots[state.slot] !== state.orderId ||
      s.slots.some((id, n) => n !== state.slot && id !== "0")
    )
      throw new Error(
        "Tracked slot identity changed or exclusive account violated",
      );
    return state;
  }
  async previewCancel(id: string): Promise<CancelPreview> {
    return this.store.withLock(async () => {
      const r = await this.store.read(id);
      if (r.cancellation.phase !== "not-started")
        throw new Error(
          `Cancellation already ${r.cancellation.phase}; inspect status`,
        );
      const state = await this.cancelState(r),
        expiresAtMs = this.now() + 30_000;
      const payload = {
        intentDigest: r.intent.digest,
        orderId: state.orderId!,
        slot: state.slot!,
        quantity: state.openQuantity!,
        expiresAtMs,
      };
      const d = digest(payload);
      const preview: CancelPreview = {
        digest: d,
        orderId: payload.orderId,
        slot: payload.slot,
        quantity: payload.quantity,
        expiresAtMs,
        clientOrderId: `0x${d}`,
      };
      r.cancelPreview = preview;
      await this.store.save(r);
      return preview;
    });
  }
  async cancel(
    id: string,
    confirm: string,
    exclusive: boolean,
    selected: string,
  ): Promise<IntentRecord> {
    return this.store.withLock(async () => {
      const r = await this.store.read(id),
        preview = r.cancelPreview;
      if (!preview)
        throw new Error("Create and review a cancellation preview first");
      this.checkUser(r.intent, confirm, preview.digest, exclusive, selected);
      if (r.cancellation.phase === "broadcast") return r;
      if (r.cancellation.phase !== "not-started")
        throw new Error(
          `Cancellation ${r.cancellation.phase}; do not resubmit`,
        );
      if (this.now() > preview.expiresAtMs)
        throw new Error("Cancellation preview expired");
      const state = await this.cancelState(r);
      if (
        state.orderId !== preview.orderId ||
        state.slot !== preview.slot ||
        state.openQuantity !== preview.quantity
      )
        throw new Error(
          "Remainder changed; review a fresh cancellation preview",
        );
      const tx = buildCancelTransaction(
        r.intent,
        preview.slot,
        preview.clientOrderId,
      );
      await this.chain.simulate(tx);
      if (this.now() > preview.expiresAtMs)
        throw new Error("Cancellation preview expired during simulation");
      return this.executeOnce(
        r,
        "cancellation",
        tx,
        `Cancel only Kuru TESTNET order ${preview.orderId}, remaining ${formatExact(BigInt(preview.quantity), BigInt(r.intent.snapshot.sizeScale))} MON; prior fills remain final`,
      );
    });
  }
}
