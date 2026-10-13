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
import { presentCancel } from "../../presentation.ts";
import { selectedOwner } from "../../host.ts";
const inputs = {
  ...intentInputs,
  ...approvalInputs,
  confirm: { ...approvalInputs.confirm, required: false },
};
export default class KuruCancel extends PluginCommand<Record<string, unknown>> {
  static override description =
    "Preview cancellation; pass its digest to request cancellation through MetaMask policy.";
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "kuru:cancel";
  async execute(io: CommandIO) {
    return withCommandErrors(async () => {
      const v = await io.resolveInputs(inputs),
        { service, store } = services(
          this.ctx,
          io,
          this.pluginCommandId,
          v.stateDir,
        );
      if (!v.confirm) {
        const preview = await service.previewCancel(v.intent);
        return presentCancel((await store.read(v.intent)).intent, preview);
      }
      const r = await service.cancel(
        v.intent,
        v.confirm,
        v.exclusive,
        selectedOwner(this.ctx.walletStateManager.read()),
      );
      return {
        intentId: r.intent.id,
        phase: r.cancellation.phase,
        transactionHash: r.cancellation.hash ?? null,
        next: "Run kuru status to verify cancellation and any raced fills. Broadcast is not cancellation success.",
      };
    });
  }
}
