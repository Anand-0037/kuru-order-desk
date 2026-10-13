import { withCommandErrors } from "../../command-errors.ts";
import {
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
  type CommandIO,
} from "@metamask/agent-wallet/plugin";
import {
  intentInputs,
  approvalInputs,
  services,
} from "../../command-support.ts";
import { selectedOwner } from "../../host.ts";
const inputs = { ...intentInputs, ...approvalInputs };
export default class KuruSubmit extends PluginCommand<{
  intentId: string;
  phase: string;
  transactionHash: string | null;
  next: string;
}> {
  static override description =
    "Submit one reviewed testnet post-only order through MetaMask wallet policy.";
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "kuru:submit";
  async execute(io: CommandIO) {
    return withCommandErrors(async () => {
      const v = await io.resolveInputs(inputs);
      const r = await services(
        this.ctx,
        io,
        this.pluginCommandId,
        v.stateDir,
      ).service.submit(
        v.intent,
        v.confirm,
        v.exclusive,
        selectedOwner(this.ctx.walletStateManager.read()),
      );
      return {
        intentId: r.intent.id,
        phase: r.submission.phase,
        transactionHash: r.submission.hash ?? null,
        next: "Run kuru status. A transaction hash is not proof of a resting order or fill.",
      };
    });
  }
}
