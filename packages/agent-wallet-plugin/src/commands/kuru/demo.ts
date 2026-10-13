import { withCommandErrors } from "../../command-errors.ts";
import { PluginCommand, type CommandIO } from "@metamask/agent-wallet/plugin";
import { runDemo } from "../../demo.ts";
export default class KuruDemo extends PluginCommand<
  Awaited<ReturnType<typeof runDemo>>
> {
  static override description =
    "Run the explicitly labelled OFFLINE FIXTURE demo. No wallet, network or live transactions.";
  static override requiresAuth = false;
  static override requiresInit = false;
  protected readonly pluginCommandId = "kuru:demo";
  async execute(_io: CommandIO) {
    return withCommandErrors(async () => {
      return runDemo();
    });
  }
}
