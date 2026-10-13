import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAddress, formatUnits } from "viem";
import { abi } from "@toxicflow-labs/ts-sdk";
import { DEPLOYMENT, ZERO } from "../src/domain.ts";
import { officialPrepareClient } from "../src/official-rpc.ts";

const run = promisify(execFile);
const mm = "./node_modules/.bin/mm";
const expectedPlugin = "mm-plugin-kuru-order-desk";
type Check = { check: string; state: "pass" | "blocked" | "unknown"; detail: string };
const checks: Check[] = [];
const add = (check: string, state: Check["state"], detail: string) => checks.push({ check, state, detail });

async function cli(args: string[]): Promise<unknown> {
  const { stdout } = await run(mm, args, { maxBuffer: 8 * 1024 * 1024, timeout: 20000 });
  return JSON.parse(stdout);
}

function data(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== true || !("data" in value) || !value.data || typeof value.data !== "object") throw Error("Unexpected Agent Wallet response");
  return value.data as Record<string, unknown>;
}

async function main() {
  const requested = process.argv[2];
  if (requested && !isAddress(requested)) throw Error("Pass a valid EVM owner address, or omit it to use the selected Agent Wallet address");
  let owner = requested;
  try {
    const wallet = data(await cli(["wallet", "address"]));
    const selected = wallet.address;
    if (typeof selected !== "string" || !isAddress(selected)) throw Error("Wallet address unavailable");
    owner ??= selected;
    add("wallet identity", selected.toLowerCase() === owner.toLowerCase() ? "pass" : "blocked", selected.toLowerCase() === owner.toLowerCase() ? "Selected Agent Wallet matches the owner" : "Selected Agent Wallet differs from the requested owner");
  } catch { add("wallet identity", "unknown", "Could not read the selected Agent Wallet address"); }
  try {
    const plugins = await cli(["plugins", "--json"]);
    if (!Array.isArray(plugins)) throw Error("Invalid plugin list");
    const installed = plugins.find((p) => p?.name === expectedPlugin);
    add("plugin", installed?.valid === true ? "pass" : "blocked", installed?.valid === true ? `${expectedPlugin} installed and valid` : "Kuru plugin is not listed as valid");
  } catch { add("plugin", "unknown", "Could not inspect Agent Wallet plugin installation"); }
  try {
    const chains = data(await cli(["chains", "list", "--json"])).chains;
    if (!Array.isArray(chains)) throw Error("Invalid chain list");
    add("host chain", chains.some((c) => c?.chainId === 10143) ? "pass" : "blocked", chains.some((c) => c?.chainId === 10143) ? "Agent Wallet lists Monad testnet 10143" : "Agent Wallet does not list Monad testnet 10143");
  } catch { add("host chain", "unknown", "Could not inspect Agent Wallet chains"); }
  if (!owner || !isAddress(owner)) {
    add("Kuru account", "unknown", "A valid owner address is needed for public chain reads");
  } else {
    const client = officialPrepareClient();
    try {
      const chain = await client.getChainId();
      add("public RPC chain", chain === 10143 ? "pass" : "blocked", chain === 10143 ? "Official public RPC reports Monad testnet 10143" : "Official public RPC returned another chain");
      if (chain !== 10143) throw Error("Wrong chain");
      const accountId = await client.readContract({ address: DEPLOYMENT.accountCore, abi: abi.accountCoreAbi, functionName: "rootAccountIdOf", args: [owner] });
      add("Kuru registration", accountId > 0 ? "pass" : "blocked", accountId > 0 ? `Root account ID ${accountId}` : "No registered root account");
      const gas = await client.getBalance({ address: owner });
      add("wallet gas", gas > 0n ? "pass" : "blocked", `${formatUnits(gas, 18)} MON in wallet; fee sufficiency is checked by the wallet at authorization`);
      if (accountId > 0) {
        for (const [check, token, decimals] of [["custody MON", ZERO, 18], ["custody quote", DEPLOYMENT.quoteToken, 6]] as const) {
          const free = await client.readContract({ address: DEPLOYMENT.accountCore, abi: abi.accountCoreAbi, functionName: "getBalance", args: [accountId, token] }) as bigint;
          add(check, free > 0n ? "pass" : "blocked", `${formatUnits(free, decimals)} free in Kuru AccountCore`);
        }
      } else {
        add("custody MON", "blocked", "No root account to hold custody funds");
        add("custody quote", "blocked", "No root account to hold custody funds");
      }
    } catch {
      if (!checks.some((c) => c.check === "public RPC chain")) add("public RPC chain", "unknown", "Public chain read failed");
      if (!checks.some((c) => c.check === "Kuru registration")) add("Kuru registration", "unknown", "Could not verify Kuru registration");
      if (!checks.some((c) => c.check === "wallet gas")) add("wallet gas", "unknown", "Could not verify wallet MON");
      for (const check of ["custody MON", "custody quote"]) if (!checks.some((c) => c.check === check)) add(check, "unknown", "Could not verify custody balance");
    }
  }
  console.log(JSON.stringify({ kind: "READ_ONLY_ACCOUNT_READINESS", chainId: 10143, owner: owner ?? null, checks, allChecksPass: checks.every((c) => c.state === "pass"), note: "A buy needs quote custody; a sell needs MON custody. A balance alone does not prove affordability or that a transaction can be sent. Run prepare for exact order terms." }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Readiness failed"); process.exitCode = 1; });
