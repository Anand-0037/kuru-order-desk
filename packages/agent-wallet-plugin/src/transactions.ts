import { encodeFunctionData, type Abi } from "viem";
import {
  buildBatchRequest,
  buildCancelBySlotsRequest,
} from "@toxicflow-labs/ts-sdk/spot";
import { DEPLOYMENT, hash, type Hex, type PreparedIntent } from "./domain.ts";
import { verifyIntent } from "./planner.ts";
export interface FixedTransaction {
  chainId: 10143;
  from: Hex;
  to: Hex;
  data: Hex;
  value: "0x0";
}
function encode(
  intent: PreparedIntent,
  request: {
    address: Hex;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  },
): FixedTransaction {
  if (
    !verifyIntent(intent) ||
    intent.chainId !== 10143 ||
    request.address.toLowerCase() !== DEPLOYMENT.market
  )
    throw new Error("Invalid fixed-market intent");
  return {
    chainId: 10143,
    from: intent.owner as Hex,
    to: DEPLOYMENT.market,
    data: encodeFunctionData({
      abi: request.abi,
      functionName: request.functionName,
      args: request.args ?? [],
    }),
    value: "0x0",
  };
}
export function buildOrderTransaction(i: PreparedIntent): FixedTransaction {
  return encode(
    i,
    buildBatchRequest({
      market: DEPLOYMENT.market,
      userId: BigInt(i.accountId),
      orders: [
        {
          side: i.side,
          quantity: BigInt(i.quantity),
          price: BigInt(i.price),
          tif: "GTC",
          executionInstruction: "POST_ONLY",
          minSizeAfterBlock: 0n,
        },
      ],
      cancelSlotIdxs: [],
      clientOrderId: i.clientOrderId,
    }),
  );
}
export function buildCancelTransaction(
  i: PreparedIntent,
  slot: number,
  clientId: Hex,
): FixedTransaction {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 62)
    throw new Error("Invalid cancel slot");
  hash(clientId);
  if (/^0x0{64}$/.test(clientId) || clientId === i.clientOrderId)
    throw new Error("Cancellation requires a unique nonzero client ID");
  return encode(
    i,
    buildCancelBySlotsRequest({
      market: DEPLOYMENT.market,
      userId: BigInt(i.accountId),
      cancelSlotIdxs: [slot],
      clientOrderId: clientId,
    }),
  );
}
