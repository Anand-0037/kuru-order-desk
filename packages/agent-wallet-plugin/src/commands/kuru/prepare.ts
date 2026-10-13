import { withCommandErrors } from "../../command-errors.ts";
import {
  PluginCommand,
  InputFieldType,
  schemaToArgs,
  schemaToFlags,
  type InputSchema,
  type CommandIO,
} from "@metamask/agent-wallet/plugin";
import { commonInputs, services } from "../../command-support.ts";
import { presentIntent } from "../../presentation.ts";
const inputs = {
  ...commonInputs,
  owner: {
    type: InputFieldType.Text,
    flag: "owner",
    message: "Dedicated testnet owner address",
    required: true,
    prompt: false,
  },
  side: {
    type: InputFieldType.Select,
    flag: "side",
    message: "Order side",
    options: [
      { value: "buy", label: "Buy MON" },
      { value: "sell", label: "Sell MON" },
    ],
    required: true,
    prompt: false,
  },
  price: {
    type: InputFieldType.Text,
    flag: "price",
    message: "USDC limit price per MON",
    required: true,
    prompt: false,
  },
  quantity: {
    type: InputFieldType.Text,
    flag: "quantity",
    message: "MON quantity",
    required: true,
    prompt: false,
  },
  officialRpc: {
    type: InputFieldType.Boolean,
    flag: "official-rpc",
    message: "Use the paced official Monad public RPC for read-only prepare",
    default: false,
  },
} satisfies InputSchema;
export default class KuruPrepare extends PluginCommand<
  ReturnType<typeof presentIntent>
> {
  static override description =
    "Prepare a read-only, exact-amount MON/USDC order review on Monad testnet.";
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  static override examples = [
    "<%= config.bin %> kuru prepare --owner 0x... --side buy --price 0.025 --quantity 1000",
  ];
  protected readonly pluginCommandId = "kuru:prepare";
  async execute(io: CommandIO) {
    return withCommandErrors(async () => {
      const v = await io.resolveInputs(inputs);
      return presentIntent(
        await services(
          this.ctx,
          io,
          this.pluginCommandId,
          v.stateDir,
          v.officialRpc ? "official" : "host",
        ).service.prepare(v),
      );
    });
  }
}
