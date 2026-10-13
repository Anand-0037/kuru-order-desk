import { homedir } from "node:os";
import { join } from "node:path";
import {
  InputFieldType,
  type InputSchema,
  type PluginCommandContext,
  type CommandIO,
} from "@metamask/agent-wallet/plugin";
import { IntentStore } from "./store.ts";
import { KuruReader } from "./chain.ts";
import { OrderService } from "./service.ts";
import { makeHostExecutor } from "./host.ts";
import { officialPrepareClient } from "./official-rpc.ts";
export const commonInputs = {
  stateDir: {
    type: InputFieldType.Text,
    flag: "state-dir",
    message: "Private local state directory",
    required: false,
    prompt: false,
  },
} satisfies InputSchema;
export const intentInputs = {
  ...commonInputs,
  intent: {
    type: InputFieldType.Text,
    flag: "intent",
    message: "Full intent ID from prepare",
    required: true,
    prompt: false,
  },
} satisfies InputSchema;
export const approvalInputs = {
  confirm: {
    type: InputFieldType.Text,
    flag: "confirm",
    message: "Exact digest from the review",
    required: true,
    prompt: false,
  },
  exclusive: {
    type: InputFieldType.Boolean,
    flag: "exclusive-account",
    message:
      "Dedicated owner; no other trader or process uses this market/account",
    default: false,
  },
} satisfies InputSchema;
export function localStore(directory?: string): IntentStore {
  return new IntentStore(directory || join(homedir(), ".kuru-order-desk"));
}
export function services(
  context: PluginCommandContext,
  io: CommandIO,
  source: string,
  directory?: string,
  readSource: "host" | "official" = "host",
) {
  const store = localStore(directory),
    chain = new KuruReader(
      readSource === "official"
        ? officialPrepareClient()
        : context.publicClient(10143),
    );
  const executor =
    source === "kuru:submit" || source === "kuru:cancel"
      ? makeHostExecutor(context, io, source)
      : async () => {
          throw new Error("Read-only command cannot submit");
        };
  return { store, service: new OrderService(store, chain, executor) };
}
