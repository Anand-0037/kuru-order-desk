import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IntentStore } from "./store.ts";
import { OrderService } from "./service.ts";
import { presentIntent, presentStatus } from "./presentation.ts";
import {
  OfflineDemoChain,
  DEMO_NOW,
  DEMO_OWNER,
  DEMO_SUBMIT,
  DEMO_CANCEL,
} from "./fixtures/demo.ts";
export async function runDemo() {
  const store = new IntentStore(
      await mkdtemp(join(tmpdir(), "kuru-offline-demo-")),
    ),
    chain = new OfflineDemoChain();
  let executorCalls = 0;
  const service = new OrderService(
    store,
    chain,
    async () => {
      executorCalls++;
      chain.stage = executorCalls === 1 ? "open" : "cancelled";
      return { hash: executorCalls === 1 ? DEMO_SUBMIT : DEMO_CANCEL };
    },
    () => DEMO_NOW,
  );
  const intent = await service.prepare({
      owner: DEMO_OWNER,
      side: "buy",
      price: "0.025",
      quantity: "1000",
    }),
    preview = presentIntent(intent);
  const steps = [
    {
      stage: "1 · Prepare",
      message: preview.order,
      detail: `Funding estimate: ${preview.funding}. Snapshot estimate, no guaranteed fill.`,
    },
  ];
  await service.submit(intent.id, intent.digest, true, DEMO_OWNER);
  steps.push({
    stage: "2 · Submit through fixture executor",
    message: "One synthetic broadcast recorded",
    detail:
      "The real command delegates to MetaMask policy; this demo never reaches a wallet or RPC.",
  });
  chain.stage = "partial";
  const partial = presentStatus(intent, await service.status(intent.id));
  steps.push({
    stage: "3 · Reconcile partial fill",
    message: `Filled ${partial.filled}; open ${partial.open}`,
    detail:
      "Synthetic order/fill observations plus a matching order slot; receipt success alone is insufficient.",
  });
  const cancel = await service.previewCancel(intent.id);
  chain.cancelClientId = cancel.clientOrderId;
  steps.push({
    stage: "4 · Review cancellation",
    message: "Cancel only the 600 MON remainder",
    detail: "Already filled 400 MON cannot be undone.",
  });
  await service.cancel(intent.id, cancel.digest, true, DEMO_OWNER);
  const final = presentStatus(intent, await service.status(intent.id));
  steps.push({
    stage: "5 · Verify cancellation",
    message: `Filled ${final.filled}; cancelled ${final.cancelled}; open ${final.open}`,
    detail:
      "Own cancellation request is correlated separately to its synthetic receipt and deletion.",
  });
  const restarted = new OrderService(
      new IntentStore(store.directory),
      chain,
      async () => {
        throw new Error("Restart must not submit");
      },
      () => DEMO_NOW,
    ),
    restart = await restarted.status(intent.id);
  await service.submit(intent.id, intent.digest, true, DEMO_OWNER);
  await service.cancel(intent.id, cancel.digest, true, DEMO_OWNER);
  steps.push({
    stage: "6 · Restart and repeat",
    message: "Same outcome; total executor calls remain two",
    detail:
      "Known transaction identities survive restart. Ambiguous submission stops instead of retrying.",
  });
  return {
    mode: "OFFLINE FIXTURE · NO LIVE TRANSACTIONS" as const,
    steps,
    preview,
    partial,
    final,
    restart,
    executorCalls,
    stateDirectory: store.directory,
    limitation:
      "Synthetic chain and executor data. This is product-flow evidence, not testnet/EVM integration proof.",
  };
}
