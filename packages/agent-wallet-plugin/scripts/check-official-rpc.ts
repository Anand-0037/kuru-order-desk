import { KuruReader } from "../src/chain.ts";
import { officialPrepareClient } from "../src/official-rpc.ts";

const owner = process.argv[2] ?? "0x0000000000000000000000000000000000000001";
try {
  const client = officialPrepareClient();
  const head = await client.getBlock({ blockTag: "latest" });
  const headAgeMs = Date.now() - Number(head.timestamp) * 1000;
  console.log(JSON.stringify({ observation: "latest-head-age", headAgeMs }));
  const snapshot = await new KuruReader(client).snapshot(owner);
  console.log(JSON.stringify({
    ok: true,
    chainId: snapshot.chainId,
    blockNumber: snapshot.blockNumber,
    accountRegistered: snapshot.accountId !== "0",
    nativeGasPresent: BigInt(snapshot.walletMonAtoms) > 0n,
    custodyQuotePresent: BigInt(snapshot.quoteFreeAtoms) > 0n,
    slotCount: snapshot.slots.length,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "Unknown RPC failure",
  }));
  process.exitCode = 1;
}
