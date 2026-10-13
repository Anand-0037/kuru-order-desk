/** Public reads only. A diagnostic RPC override never changes the wallet host's chain. */
import { createPublicClient, http, type Abi } from "viem";
import { monadTestnet } from "viem/chains";
import { abi } from "@toxicflow-labs/ts-sdk";
import { DEPLOYMENT } from "../src/domain.ts";

class ProbeFailure extends Error {
  readonly detail: Record<string, unknown>;
  constructor(detail: Record<string, unknown>) { super("Public read-only probe failed"); this.detail = detail; }
}

// Raw viem errors can contain URLs, credentials, headers and request bodies.
// Only fixed messages and allowlisted cause codes leave this boundary.
function failure(error: unknown, stage: string, rpcOperation: string) {
  const causes: Record<string, unknown>[] = [];
  let current = error;
  for (let i = 0; i < 12 && current && typeof current === "object"; i++) {
    const entry = current as Record<string, unknown>;
    causes.push(entry); current = entry.cause;
  }
  const networkCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"];
  const causeCode = causes.map(c => c.code).find(c => typeof c === "string" && networkCodes.includes(c));
  const httpStatus = causes.map(c => c.status).find(c => typeof c === "number" && Number.isInteger(c) && c >= 400 && c <= 599);
  const rpcCode = causes.map(c => c.code).find(c => typeof c === "number" && Number.isInteger(c));
  const names = causes.map(c => c.name);
  let failureKind = "unknown";
  let message = "Public RPC observation failed; no deployment conclusion is available.";
  if (causeCode === "ETIMEDOUT" || causeCode === "UND_ERR_CONNECT_TIMEOUT" || names.some(n => n === "TimeoutError" || n === "AbortError")) {
    failureKind = "timeout"; message = "Public RPC request timed out.";
  } else if (causeCode || causes.some(c => c.message === "fetch failed")) {
    failureKind = "network"; message = "Public RPC transport failed.";
  } else if (httpStatus !== undefined || rpcCode !== undefined || names.includes("RpcRequestError")) {
    failureKind = "http-rpc-rejection"; message = "Public endpoint rejected an HTTP or RPC request.";
  } else if (names.includes("SyntaxError")) {
    failureKind = "malformed-json"; message = "Public endpoint returned malformed JSON.";
  } else if (names.some(n => typeof n === "string" && /^(ContractFunction|AbiDecoding|RawContractError)/.test(n))) {
    failureKind = "contract-call-decode"; message = "Public contract call or ABI decoding failed.";
  }
  return { kind: "PUBLIC_READ_ONLY_FAILURE", failureKind, stage, rpcOperation, message, ...(causeCode ? { causeCode } : {}), ...(httpStatus !== undefined ? { httpStatus } : {}), ...(rpcCode !== undefined ? { rpcCode } : {}) };
}

async function observe<T>(stage: string, operation: string, run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) { throw new ProbeFailure(failure(error, stage, operation)); }
}

async function main() {
  const override = process.env.KURU_DIAGNOSTIC_RPC_URL;
  let rpc: string;
  try {
    const parsed = new URL(override ?? "https://testnet-rpc.monad.xyz");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) throw Error("Invalid diagnostic endpoint");
    rpc = parsed.href;
  } catch {
    throw new ProbeFailure({ kind: "PUBLIC_READ_ONLY_FAILURE", failureKind: "invalid-rpc-url", stage: "rpc-configuration", rpcOperation: "none", message: "Diagnostic RPC must be an HTTPS URL without user info or fragment." });
  }
  const client = createPublicClient({ chain: monadTestnet, transport: http(rpc, { timeout: 20000, retryCount: 0 }) });
  const chainId = await observe("chain-id", "eth_chainId", () => client.getChainId());
  if (chainId !== 10143) throw new ProbeFailure({ kind: "PUBLIC_READ_ONLY_FAILURE", failureKind: "wrong-chain", stage: "chain-id", rpcOperation: "eth_chainId", message: "Diagnostic endpoint returned the wrong chain." });
  const head = await observe("finalized-head", "eth_getBlockByNumber", () => client.getBlock({ blockTag: "finalized" }));
  if (head.number === null) throw new ProbeFailure({ kind: "PUBLIC_READ_ONLY_FAILURE", failureKind: "incomplete-observation", stage: "finalized-head", rpcOperation: "eth_getBlockByNumber", message: "No finalized head was returned." });
  const blockNumber = head.number;
  const read = (stage: string, functionName: string) => observe(stage, "eth_call", () => client.readContract({ address: DEPLOYMENT.market, abi: abi.orderBookAbi as Abi, functionName, blockNumber }));
  const storage = (stage: string, address: `0x${string}`) => observe(stage, "eth_getStorageAt", () => client.getStorageAt({ address, slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", blockNumber }));
  const params = await read("market-params", "getMarketParams");
  const base = await read("base-token", "baseToken");
  const quote = await read("quote-token", "quoteToken");
  const custody = await read("custody", "spotBalanceAccountAddress");
  const impl = await storage("market-implementation", DEPLOYMENT.market);
  const accountImpl = await storage("account-implementation", DEPLOYMENT.accountCore);
  const codePresent = [];
  // Sequential reads identify the first failed operation deterministically.
  for (const [stage, address] of [
    ["market-code", DEPLOYMENT.market], ["custody-code", DEPLOYMENT.accountCore],
    ["market-implementation-code", DEPLOYMENT.marketImplementation], ["account-implementation-code", DEPLOYMENT.accountImplementation],
  ] as const) {
    const code = await observe(stage, "eth_getCode", () => client.getBytecode({ address, blockNumber }));
    codePresent.push(Boolean(code && code !== "0x"));
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), kind: "PUBLIC_READ_ONLY_NO_WALLET", rpcSource: override ? "diagnostic-override" : "official-default", chainId, blockNumber, blockHash: head.hash, blockTimestamp: head.timestamp, market: DEPLOYMENT.market, params, base, quote, custody, implementationStorage: impl, accountImplementationStorage: accountImpl, codePresent }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
}

try { await main(); }
catch (error) {
  console.error(JSON.stringify(error instanceof ProbeFailure ? error.detail : failure(error, "rpc-configuration", "none")));
  process.exitCode = 1;
}
