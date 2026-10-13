import {
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { abi } from "@toxicflow-labs/ts-sdk";
import {
  address,
  DEPLOYMENT,
  hash,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_FUTURE_SKEW_MS,
  ZERO,
  type MarketSnapshot,
  type PreparedIntent,
} from "./domain.ts";
import { canonical, validateSnapshot } from "./planner.ts";
import { decodeMarketLogs } from "./decode.ts";
import type { OrderEvidence } from "./evidence.ts";
import type { ChainReader } from "./service.ts";
import {
  buildOrderTransaction,
  type FixedTransaction,
} from "./transactions.ts";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const PAGE_BLOCKS = 100n,
  MAX_BLOCKS = 100_000n,
  MAX_LOGS = 50_000;

/** All RPC access is read-only. There is no wallet client or broadcast transport here. */
export class KuruReader implements ChainReader {
  private readonly client: PublicClient;
  private readonly now: () => number;
  constructor(client: PublicClient, now: () => number = Date.now) {
    this.client = client;
    this.now = now;
  }
  private async head(tag: "latest" | "finalized") {
    if ((await this.client.getChainId()) !== 10143)
      throw new Error("Wrong RPC chain: expected 10143");
    const head = await this.client.getBlock({ blockTag: tag });
    if (head.number === null || head.hash === null)
      throw new Error("Missing pinned chain head");
    const timestamp = Number(head.timestamp) * 1000;
    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp - this.now() > SNAPSHOT_FUTURE_SKEW_MS ||
      this.now() - timestamp > SNAPSHOT_MAX_AGE_MS
    )
      throw new Error("Stale or future RPC head");
    return { ...head, number: head.number, hash: head.hash };
  }
  private assertHeadFresh(timestamp: bigint): void {
    const ms = Number(timestamp) * 1000;
    if (
      !Number.isSafeInteger(ms) ||
      ms - this.now() > SNAPSHOT_FUTURE_SKEW_MS ||
      this.now() - ms > SNAPSHOT_MAX_AGE_MS
    )
      throw new Error("Pinned head became stale during replay");
  }
  private async canonical(
    blockNumber: bigint,
    expectedHash: string,
  ): Promise<void> {
    const block = await this.client.getBlock({ blockNumber });
    if (block.hash?.toLowerCase() !== expectedHash.toLowerCase())
      throw new Error("Pinned block changed; canonical evidence unavailable");
  }
  private async read<T>(
    contract: Address,
    contractAbi: Abi,
    functionName: string,
    args: readonly unknown[],
    blockNumber: bigint,
  ): Promise<T> {
    return (await this.client.readContract({
      address: contract,
      abi: contractAbi,
      functionName,
      args,
      blockNumber,
    })) as T;
  }
  private async deployment(blockNumber: bigint): Promise<void> {
    for (const [proxy, implementation] of [
      [DEPLOYMENT.market, DEPLOYMENT.marketImplementation],
      [DEPLOYMENT.accountCore, DEPLOYMENT.accountImplementation],
    ] as const) {
      const slot = await this.client.getStorageAt({
        address: proxy,
        slot: IMPLEMENTATION_SLOT,
        blockNumber,
      });
      if (!slot || address(`0x${slot.slice(-40)}`) !== implementation)
        throw new Error(
          "Unrecognized proxy implementation; update compatibility review",
        );
      for (const target of [proxy, implementation]) {
        const code = await this.client.getBytecode({
          address: target,
          blockNumber,
        });
        if (!code || code === "0x")
          throw new Error("Missing deployed contract code");
      }
    }
  }
  async snapshot(ownerInput: string): Promise<MarketSnapshot> {
    const owner = address(ownerInput) as Address,
      head = await this.head("latest"),
      n = head.number;
    await this.deployment(n);
    const book = <T>(name: string, args: readonly unknown[] = []) =>
      this.read<T>(DEPLOYMENT.market, abi.orderBookAbi, name, args, n);
    const account = <T>(name: string, args: readonly unknown[] = []) =>
      this.read<T>(DEPLOYMENT.accountCore, abi.accountCoreAbi, name, args, n);
    const [
      params,
      baseToken,
      quoteToken,
      quoteDecimals,
      baseMultiplier,
      accountCore,
      marketState,
      paused,
      accountId,
      marketMakerFee,
    ] = await Promise.all([
      book<readonly [number, bigint, number, bigint, bigint, bigint, bigint]>(
        "getMarketParams",
      ),
      book<string>("baseToken"),
      book<string>("quoteToken"),
      book<number>("quoteTokenDecimals"),
      book<bigint>("baseSizeMultiplier"),
      book<string>("spotBalanceAccountAddress"),
      book<number>("marketState"),
      account<boolean>("protocolPaused"),
      account<number>("rootAccountIdOf", [owner]),
      book<bigint>("makerFeePps"),
    ]);
    const userId = BigInt(accountId);
    const [
      accountOwner,
      baseFree,
      quoteFree,
      baseReserved,
      quoteReserved,
      makerFee,
      hook,
      slots,
      walletMon,
    ] = await Promise.all([
      userId
        ? account<string>("getAccountOwner", [userId])
        : Promise.resolve(owner),
      account<bigint>("getBalance", [userId, ZERO]),
      account<bigint>("getBalance", [userId, DEPLOYMENT.quoteToken]),
      account<bigint>("getSpotReservedBalance", [userId, ZERO]),
      account<bigint>("getSpotReservedBalance", [
        userId,
        DEPLOYMENT.quoteToken,
      ]),
      account<number>("effectiveSpotMakerFeePps", [userId, marketMakerFee]),
      book<string>("getPostFillHook", [userId]),
      this.slots(userId, n),
      this.client.getBalance({ address: owner, blockNumber: n }),
    ]);
    if (address(accountOwner) !== owner)
      throw new Error("Root account owner mismatch");
    await this.canonical(n, head.hash);
    this.assertHeadFresh(head.timestamp);
    return validateSnapshot({
      ...DEPLOYMENT,
      owner,
      accountId: userId.toString(),
      blockNumber: n.toString(),
      blockHash: head.hash,
      blockTimestampMs: Number(head.timestamp) * 1000,
      observedAtMs: this.now(),
      priceScale: params[0].toString(),
      sizeScale: params[1].toString(),
      tick: params[2].toString(),
      minQuoteAtoms: params[3].toString(),
      maxQuoteAtoms: params[4].toString(),
      baseToken,
      quoteToken,
      quoteDecimals,
      baseMultiplier: baseMultiplier.toString(),
      accountCore,
      marketState,
      paused,
      makerFeePps: makerFee.toString(),
      postFillHook: hook,
      baseFreeAtoms: baseFree.toString(),
      quoteFreeAtoms: quoteFree.toString(),
      baseReservedAtoms: baseReserved.toString(),
      quoteReservedAtoms: quoteReserved.toString(),
      walletMonAtoms: walletMon.toString(),
      slots,
    });
  }
  private async slots(
    accountId: bigint,
    blockNumber: bigint,
  ): Promise<string[]> {
    const result: string[] = [];
    // Bounded parallelism avoids a burst of 62 requests against shared RPCs.
    for (let from = 0; from < 62; from += 8) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(8, 62 - from) }, (_, n) =>
          this.read<bigint>(
            DEPLOYMENT.market,
            abi.orderBookAbi,
            "getOrderId",
            [accountId, from + n],
            blockNumber,
          ),
        ),
      );
      result.push(...batch.map((x) => x.toString()));
    }
    return result;
  }
  async simulate(tx: FixedTransaction): Promise<void> {
    if (
      tx.chainId !== 10143 ||
      tx.to !== DEPLOYMENT.market ||
      tx.value !== "0x0"
    )
      throw new Error("Invalid fixed transaction");
    const head = await this.head("latest");
    await this.deployment(head.number);
    await this.client.call({
      account: tx.from,
      to: tx.to,
      data: tx.data,
      value: 0n,
      blockNumber: head.number,
    });
    await this.canonical(head.number, head.hash);
  }
  private async receipt(txHash: string): Promise<TransactionReceipt | null> {
    try {
      const receipt = await this.client.getTransactionReceipt({
        hash: hash(txHash),
      });
      if (receipt.transactionHash.toLowerCase() !== hash(txHash))
        throw new Error("Receipt transaction hash mismatch");
      return receipt;
    } catch (error) {
      if (
        error instanceof Error &&
        /TransactionReceiptNotFound|Transaction receipt.*not.*found/i.test(
          `${error.name} ${error.message}`,
        )
      )
        return null;
      throw error;
    }
  }
  private async matches(
    tx: FixedTransaction,
    txHash: string,
  ): Promise<boolean> {
    const actual = await this.client.getTransaction({ hash: hash(txHash) });
    if (actual.hash.toLowerCase() !== hash(txHash))
      throw new Error("Returned transaction hash mismatch");
    return (
      actual.from.toLowerCase() === tx.from &&
      actual.to?.toLowerCase() === tx.to &&
      actual.input.toLowerCase() === tx.data.toLowerCase() &&
      actual.value === 0n &&
      actual.chainId === 10143
    );
  }
  async transactionOutcome(
    tx: FixedTransaction,
    txHash: string,
  ): Promise<"pending" | "success" | "reverted"> {
    const head = await this.head("finalized"),
      receipt = await this.receipt(txHash);
    if (!receipt || receipt.blockNumber > head.number) return "pending";
    if (!(await this.matches(tx, txHash)))
      throw new Error("Returned transaction does not match reviewed request");
    const sameBlock = await this.client.getLogs({
      address: DEPLOYMENT.market,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    const expected = decodeMarketLogs(receipt.logs).sort(
      (a, b) => a.logIndex - b.logIndex || a.recordIndex - b.recordIndex,
    );
    const observed = decodeMarketLogs(sameBlock)
      .filter((e) => e.transactionHash === hash(txHash))
      .sort((a, b) => a.logIndex - b.logIndex || a.recordIndex - b.recordIndex);
    if (
      expected.some(
        (e) =>
          e.transactionHash !== hash(txHash) ||
          e.blockHash !== receipt.blockHash ||
          e.blockNumber !== receipt.blockNumber.toString(),
      ) ||
      observed.some(
        (e) =>
          e.blockHash !== receipt.blockHash ||
          e.blockNumber !== receipt.blockNumber.toString(),
      ) ||
      canonical(expected) !== canonical(observed)
    )
      throw new Error(
        "Cancellation receipt and same-block market log payload differ",
      );
    await this.canonical(receipt.blockNumber, receipt.blockHash);
    await this.canonical(head.number, head.hash);
    this.assertHeadFresh(head.timestamp);
    return receipt.status;
  }
  async evidence(
    intent: PreparedIntent,
    txHash: string,
  ): Promise<OrderEvidence> {
    const head = await this.head("finalized");
    await this.deployment(head.number);
    const receipt = await this.receipt(txHash);
    const empty: OrderEvidence = {
      chainId: 10143,
      market: DEPLOYMENT.market,
      submissionHash: hash(txHash),
      receiptStatus: "pending",
      receiptBlock: "0",
      requestMatches: false,
      finalized: false,
      complete: false,
      canonical: false,
      fromBlock: "0",
      toBlock: head.number.toString(),
      headHash: head.hash,
      observedAtMs: this.now(),
      events: [],
      slots: [],
    };
    if (!receipt || receipt.blockNumber > head.number) return empty;
    const requestMatches = await this.matches(
      buildOrderTransaction(intent),
      txHash,
    );
    const from = receipt.blockNumber;
    if (head.number - from > MAX_BLOCKS)
      throw new Error(
        "Market history exceeds the 100,000-block replay limit. Automated archival recovery is not implemented. Preserve the intent and local state; automated status is unresolved and new intents for this owner remain blocked. Stop and seek separately reviewed recovery guidance.",
      );
    const logs: Awaited<ReturnType<PublicClient["getLogs"]>> = [];
    for (let start = from; start <= head.number; start += PAGE_BLOCKS) {
      const end =
        start + PAGE_BLOCKS - 1n < head.number
          ? start + PAGE_BLOCKS - 1n
          : head.number;
      const page = await this.client.getLogs({
        address: DEPLOYMENT.market,
        fromBlock: start,
        toBlock: end,
      });
      if (page.length >= 10_000 || logs.length + page.length > MAX_LOGS)
        throw new Error("Log response may be capped; completeness unknown");
      logs.push(...page);
    }
    const events = decodeMarketLogs(logs);
    // A provider omitting the original receipt logs cannot establish action correlation.
    const receiptEvents = decodeMarketLogs(receipt.logs);
    const observed = new Map(
      events.map((e) => [
        `${e.transactionHash}:${e.logIndex}:${e.recordIndex}`,
        canonical(e),
      ]),
    );
    if (
      receiptEvents.some(
        (e) =>
          observed.get(
            `${e.transactionHash}:${e.logIndex}:${e.recordIndex}`,
          ) !== canonical(e),
      )
    )
      throw new Error("RPC log range differs from original receipt evidence");
    const slots = await this.slots(BigInt(intent.accountId), head.number);
    // Check every returned log's block hash, not just the range endpoints.
    const blocks = new Map<string, Hash>();
    for (const log of logs) {
      if (log.blockNumber === null || log.blockHash === null)
        throw new Error("Incomplete log block metadata");
      const n = log.blockNumber.toString(),
        prior = blocks.get(n);
      if (prior && prior !== log.blockHash)
        throw new Error("Conflicting canonical block hashes in log range");
      blocks.set(n, log.blockHash);
    }
    for (const [n, h] of blocks) await this.canonical(BigInt(n), h);
    await this.canonical(from, receipt.blockHash);
    await this.canonical(head.number, head.hash);
    this.assertHeadFresh(head.timestamp);
    return {
      ...empty,
      receiptStatus: receipt.status,
      receiptBlock: from.toString(),
      fromBlock: from.toString(),
      requestMatches,
      finalized: true,
      complete: true,
      canonical: true,
      events,
      slots,
      observedAtMs: this.now(),
    };
  }
}
