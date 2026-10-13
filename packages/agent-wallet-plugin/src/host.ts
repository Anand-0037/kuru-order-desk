import type {
  CommandIO,
  PluginCommandContext,
} from "@metamask/agent-wallet/plugin";
import { address, DEPLOYMENT, record } from "./domain.ts";
import type { Executor } from "./service.ts";

/** Reads public wallet metadata only. Secret/key/session APIs are never accessed. */
export function selectedOwner(value: unknown): string {
  const state = record(value),
    selected = record(state.selectedWallet);
  if (
    selected.namespace !== "evm" ||
    !["server", "byok"].includes(selected.mode as string)
  )
    throw new Error("Select one supported EVM wallet in MetaMask");
  const ref = record(selected.ref),
    keys = Object.keys(ref);
  if (keys.length !== 1 || !["id", "address", "name"].includes(keys[0] ?? ""))
    throw new Error("Invalid selected wallet reference");
  const wallets =
    selected.mode === "server" ? state.remoteWallets : state.byokWallets;
  if (!Array.isArray(wallets)) throw new Error("Missing wallet metadata");
  const key = keys[0]!;
  const matches = wallets
    .map(record)
    .filter(
      (w) =>
        (w.namespace === undefined || w.namespace === "evm") &&
        (key === "address"
          ? address(w.address) === address(ref.address)
          : w[key] === ref[key]),
    );
  if (matches.length !== 1)
    throw new Error("Selected wallet is missing or ambiguous");
  return address(matches[0]!.address);
}
export function makeHostExecutor(
  context: PluginCommandContext,
  io: CommandIO,
  source: string,
): Executor {
  if (source !== "kuru:submit" && source !== "kuru:cancel")
    throw new Error("Unsupported wallet command");
  return async (tx, summary) => {
    if (
      tx.chainId !== 10143 ||
      tx.to !== DEPLOYMENT.market ||
      tx.value !== "0x0"
    )
      throw new Error("Invalid fixed-market transaction");
    if (selectedOwner(context.walletStateManager.read()) !== tx.from)
      throw new Error("Selected wallet changed; stop and review again");
    const execute = await context.walletExecutor(io, source);
    if (selectedOwner(context.walletStateManager.read()) !== tx.from)
      throw new Error(
        "Selected wallet changed during wallet authorization setup",
      );
    const result = await execute(
      {
        kind: "transaction",
        chainId: 10143,
        transaction: { to: tx.to, data: tx.data, value: 0n },
        intent: { action: "custom", summary },
      },
      { signal: io.signal },
    );
    if (result.kind !== "transaction")
      throw new Error("Unexpected wallet result kind");
    return { hash: result.hash, status: result.status };
  };
}
