import { withCommandErrors } from "../../command-errors.ts";
import {
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
  type CommandIO,
} from "@metamask/agent-wallet/plugin";
import { intentInputs, services } from "../../command-support.ts";
import { presentStatus } from "../../presentation.ts";
export default class KuruStatus extends PluginCommand<
  ReturnType<typeof presentStatus>
> {
  static override description =
    "Reconcile receipt, market fills and pinned open-order slots. Does not submit.";
  static override flags = schemaToFlags(intentInputs);
  static override args = schemaToArgs(intentInputs);
  protected readonly pluginCommandId = "kuru:status";
  async execute(io: CommandIO) {
    return withCommandErrors(async () => {
      const v = await io.resolveInputs(intentInputs),
        { service, store } = services(
          this.ctx,
          io,
          this.pluginCommandId,
          v.stateDir,
        );
      return presentStatus(
        (await store.read(v.intent)).intent,
        await service.status(v.intent),
      );
    });
  }
}
