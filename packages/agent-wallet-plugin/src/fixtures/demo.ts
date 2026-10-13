/** Explicit synthetic data for the offline demo. Never used by live commands. */
import {
  DEPLOYMENT,
  type MarketSnapshot,
  type PreparedIntent,
} from "../domain.ts";
import type { OrderEvidence, OrderObservation } from "../evidence.ts";
import type { ChainReader } from "../service.ts";
import type { FixedTransaction } from "../transactions.ts";
export const DEMO_NOW = 1790928000000;
export const DEMO_OWNER = "0x1111111111111111111111111111111111111111";
export const DEMO_SUBMIT = `0x${"a".repeat(64)}`;
export const DEMO_CANCEL = `0x${"c".repeat(64)}`;
const BLOCK = `0x${"b".repeat(64)}`;
export class OfflineDemoChain implements ChainReader {
  stage: "empty" | "open" | "partial" | "cancelled" = "empty";
  cancelClientId = "";
  async snapshot(): Promise<MarketSnapshot> {
    return {
      ...DEPLOYMENT,
      owner: DEMO_OWNER,
      accountId: "7",
      blockNumber: "105",
      blockHash: BLOCK,
      blockTimestampMs: DEMO_NOW,
      observedAtMs: DEMO_NOW,
      priceScale: "1000000",
      sizeScale: "1000000",
      baseMultiplier: "1000000000000",
      quoteDecimals: 6,
      tick: "1",
      minQuoteAtoms: "10000000",
      maxQuoteAtoms: "5000000000000",
      makerFeePps: "4000",
      baseFreeAtoms: "10000000000000000000000",
      quoteFreeAtoms: "1000000000",
      baseReservedAtoms: "0",
      quoteReservedAtoms: "0",
      walletMonAtoms: "1000000000000000000",
      slots: Array.from({ length: 62 }, (_, n) =>
        (this.stage === "open" || this.stage === "partial") && n === 3
          ? "88"
          : "0",
      ),
      postFillHook: DEPLOYMENT.baseToken,
      paused: false,
      marketState: 0,
    };
  }
  async simulate(_tx: FixedTransaction): Promise<void> {
    /* Deliberately synthetic: no RPC call and no EVM execution. */
  }
  async transactionOutcome(): Promise<"success"> {
    return "success";
  }
  async evidence(i: PreparedIntent): Promise<OrderEvidence> {
    const base = {
      chainId: 10143,
      market: DEPLOYMENT.market,
      blockNumber: "101",
      blockHash: BLOCK,
      transactionHash: DEMO_SUBMIT,
      transactionIndex: 0,
      logIndex: 0,
      recordIndex: 0,
      actionAccountId: "7",
      clientOrderId: i.clientOrderId,
      makerId: "7",
      orderId: "88",
      slot: 3,
      side: "buy" as const,
      price: "25000",
      makerFeePps: "4000",
    };
    const events: OrderObservation[] = [
      {
        ...base,
        kind: "book",
        size: "1000000000",
        live: true,
        sentinel: false,
        outcome: 2,
        operationIndex: 0,
      },
    ];
    if (this.stage === "partial" || this.stage === "cancelled")
      events.push({
        ...base,
        kind: "trade",
        blockNumber: "102",
        transactionHash: `0x${"d".repeat(64)}`,
        actionAccountId: "19",
        clientOrderId: `0x${"e".repeat(64)}`,
        fillSize: "400000000",
        updatedSize: "600000000",
        tradeId: "123",
        passive: false,
      });
    if (this.stage === "cancelled")
      events.push({
        ...base,
        kind: "book",
        blockNumber: "103",
        transactionHash: DEMO_CANCEL,
        clientOrderId: this.cancelClientId,
        size: "600000000",
        live: false,
        sentinel: false,
        outcome: 7,
        operationIndex: 0,
        makerFeePps: "0",
      });
    return {
      chainId: 10143,
      market: DEPLOYMENT.market,
      submissionHash: DEMO_SUBMIT,
      receiptStatus: "success",
      receiptBlock: "101",
      requestMatches: true,
      finalized: true,
      complete: true,
      canonical: true,
      fromBlock: "101",
      toBlock: "105",
      headHash: BLOCK,
      observedAtMs: DEMO_NOW,
      events,
      slots: (await this.snapshot()).slots,
    };
  }
}
