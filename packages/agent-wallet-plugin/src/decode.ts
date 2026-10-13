import { decodeEventLog } from "viem";
import { abi } from "@toxicflow-labs/ts-sdk";
import { decodeBookPayload, decodeTradePayload } from "./packed.ts";
import { address, DEPLOYMENT, hash, record, type Hex } from "./domain.ts";
import type { OrderObservation } from "./evidence.ts";

/** Synthetic tests use official event layout. This function accepts only mined, nonremoved logs. */
export function decodeMarketLogs(logs: readonly unknown[]): OrderObservation[] {
  const result: OrderObservation[] = [];
  for (const raw of logs) {
    const log = record(raw);
    if (address(log.address) !== DEPLOYMENT.market) continue;
    if (log.removed === true)
      throw new Error("Removed log cannot establish order state");
    if (
      typeof log.blockNumber !== "bigint" ||
      log.blockNumber < 0n ||
      typeof log.transactionIndex !== "number" ||
      !Number.isSafeInteger(log.transactionIndex) ||
      log.transactionIndex < 0 ||
      typeof log.logIndex !== "number" ||
      !Number.isSafeInteger(log.logIndex) ||
      log.logIndex < 0
    )
      throw new Error("Unmined or incomplete log position");
    if (typeof log.data !== "string" || !Array.isArray(log.topics))
      throw new Error("Invalid log payload");
    const decoded = decodeEventLog({
      abi: abi.orderBookAbi,
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
      strict: true,
    });
    if (
      decoded.eventName !== "BookUpdatesPacked" &&
      decoded.eventName !== "TradesPacked"
    )
      continue;
    const args = record(decoded.args);
    const base = {
      chainId: DEPLOYMENT.chainId,
      market: DEPLOYMENT.market,
      blockNumber: log.blockNumber.toString(),
      blockHash: hash(log.blockHash),
      transactionHash: hash(log.transactionHash),
      transactionIndex: log.transactionIndex as number,
      logIndex: log.logIndex as number,
      actionAccountId: String(args.accountId),
      clientOrderId: hash(args.clientOrderId),
    };
    if (decoded.eventName === "BookUpdatesPacked") {
      const records = decodeBookPayload(args.packedUpdates);
      for (const [recordIndex, r] of records.entries())
        result.push({
          ...base,
          kind: "book",
          recordIndex,
          makerId: r.makerId.toString(),
          orderId: r.orderId.toString(),
          slot: r.slotIdx,
          side: r.makerIsBuy ? "buy" : "sell",
          price: r.price.toString(),
          size: r.size.toString(),
          live: r.isLive,
          sentinel: r.isSentinel,
          outcome: r.outcome,
          makerFeePps: r.makerFeePps.toString(),
          ...(r.operationIndex !== undefined
            ? { operationIndex: r.operationIndex }
            : {}),
        });
    } else {
      const records = decodeTradePayload(args.packedTrades);
      for (const [recordIndex, r] of records.entries())
        result.push({
          ...base,
          kind: "trade",
          recordIndex,
          makerId: r.makerId.toString(),
          orderId: r.orderId.toString(),
          slot: r.slotIdx,
          side: r.makerIsBuy ? "buy" : "sell",
          price: r.price.toString(),
          fillSize: r.fillSize.toString(),
          updatedSize: r.updatedSize.toString(),
          tradeId: r.tradeId.toString(),
          passive: r.makerIsPassive,
          makerFeePps: r.makerFeePps.toString(),
          ...(r.operationIndex !== undefined
            ? { operationIndex: r.operationIndex }
            : {}),
        });
    }
  }
  return result;
}
