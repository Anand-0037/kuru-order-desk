import { createPublicClient, custom } from "viem";

const ENDPOINT = "https://testnet-rpc.monad.xyz";
const READ_METHODS = new Set([
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getStorageAt",
  "eth_getCode",
  "eth_call",
  "eth_getBalance",
]);

/** Explicit, fixed-endpoint read transport for prepare only. No signing method exists. */
export function officialPrepareClient(
  fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => number = Date.now,
) {
  let nextAt = 0;
  let queue: Promise<void> = Promise.resolve();
  let id = 0;
  const transport = custom(
    {
      request: ({ method, params }) => {
        if (!READ_METHODS.has(method))
          throw new Error(`Official prepare RPC refuses ${method}`);
        const task = queue.then(async () => {
          const wait = Math.max(0, nextAt - now());
          if (wait) await pause(wait);
          nextAt = now() + 150;
          const response = await fetcher(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: ++id,
              method,
              params: params ?? [],
            }),
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok)
            throw new Error(`Official prepare RPC HTTP ${response.status}`);
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("result" in body))
            throw new Error("Official prepare RPC returned no result");
          return body.result;
        });
        queue = task.then(() => {}, () => {});
        return task;
      },
    },
    { retryCount: 0 },
  );
  return createPublicClient({ transport });
}
