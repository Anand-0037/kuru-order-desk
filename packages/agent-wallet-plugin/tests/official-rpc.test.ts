import { test } from "node:test";
import assert from "node:assert/strict";
import { officialPrepareClient } from "../src/official-rpc.ts";

test("official prepare transport paces reads and refuses writes", async () => {
  let clock = 1000;
  const sent: { method: string; at: number; url: string }[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { method: string };
    sent.push({ method: payload.method, at: clock, url: String(url) });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x279f" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = officialPrepareClient(
    fakeFetch,
    async (ms) => { clock += ms; },
    () => clock,
  );
  const [first, second] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: "0x0000000000000000000000000000000000000001" }),
  ]);
  assert.deepEqual([first, second], [10143, 10143n]);
  assert.equal(sent.length, 2);
  assert.ok(sent[1]!.at - sent[0]!.at >= 150);
  assert.ok(sent.every((entry) => entry.url === "https://testnet-rpc.monad.xyz"));
  await assert.rejects(
    () => client.request({ method: "eth_sendRawTransaction", params: ["0x"] }),
    /refuses eth_sendRawTransaction/,
  );
  assert.equal(sent.length, 2);
});
