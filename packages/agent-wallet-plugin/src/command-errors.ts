import { CommandError } from "@metamask/agent-wallet/plugin";
export async function withCommandErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CommandError) throw error;
    const first =
      error instanceof Error
        ? error.message.split("\n")[0]
        : "Unexpected plugin failure";
    const message = (first || "Plugin action stopped")
      .replace(/https?:\/\/\S+/g, "[RPC endpoint]")
      .slice(0, 500);
    throw new CommandError(
      "KURU_ACTION_STOPPED",
      message,
      "Stop and inspect the stated blocker. If submission/cancellation is started or unknown, do not retry; inspect the original MetaMask request and chain evidence.",
    );
  }
}
