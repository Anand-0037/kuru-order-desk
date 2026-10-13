# Kuru Order Desk

Kuru Order Desk is a focused trading control center for Kuru's MON/USDC market on Monad testnet. Traders compose an exact GTC post-only order in the browser, review it in MetaMask Agent Wallet, and use separate commands to request execution and inspect the outcome. The browser never signs a transaction.

**Explore:** [Live browser app](https://anand-0037.github.io/kuru-order-desk/) · [Product walkthrough](https://anand-0037.github.io/kuru-order-desk/demo.html) · [Short pitch](https://anand-0037.github.io/kuru-order-desk/pitch.html)

## The workflow

1. **Compose.** Choose buy or sell, limit price, MON quantity, and a dedicated wallet address. The website creates a readable `mm kuru prepare` command.
2. **Review.** The Agent Wallet plugin reads the Kuru account, market, custody balance, and wallet gas balance. A successful prepare creates an intent with a review digest; it does not place an order.
3. **Authorize.** The trader checks the exact terms and separately chooses whether to submit through Agent Wallet policy and signing.
4. **Reconcile.** `status` checks receipt, market, and order-slot evidence. A cancellation has its own preview and confirmation. Uncertain outcomes stop automatic retries.

The plugin also includes an explicitly labelled offline demo that exercises the workflow without a wallet or live transaction. The browser's interactive examples are synthetic and are kept separate from real account reads.

## Try the browser

Use Node.js 22.18+ and npm 10+.

```sh
npm run check:web
npm run serve
```

Open `http://127.0.0.1:4173/`. Select **Try interactive demo** to explore the synthetic scenarios, or enter your own terms to build a read-only prepare command. The page asks for a wallet address only; never enter a private key or recovery phrase.

## Run the Agent Wallet plugin

The [plugin guide](packages/agent-wallet-plugin/README.md) covers installation, capability consent, and the command workflow. Its [agent skill](packages/agent-wallet-plugin/skills/kuru-order-desk/SKILL.md) documents the same approval boundary for an assistant. Use Linux or WSL for the plugin, a dedicated Monad testnet account, and review every wallet request yourself.

```sh
npm run install:plugin
npm run check
npm run demo
npm --prefix packages/agent-wallet-plugin run account:readiness
```

`npm run demo` is an offline fixture. For real testnet preparation, follow the [account setup guide](docs/ACCOUNT_SETUP.md) and [live validation procedure](packages/agent-wallet-plugin/docs/LIVE_VALIDATION.md). The [dated release status](docs/RELEASE_STATUS.md) records the current host, account, evidence, and distribution gates.

`account:readiness` is a read-only check of the selected Agent Wallet identity, plugin, Monad network, Kuru registration, wallet MON, and custody balances. It prints a separate result for each prerequisite. Run `prepare` to check affordability for specific order terms.

## Project structure

| Path | Purpose |
| --- | --- |
| `apps/web/dist/` | Static browser companion and offline examples |
| `apps/web/tests/` | Browser behavior and handoff checks |
| `packages/agent-wallet-plugin/` | Agent Wallet commands, planner, durable intent state, and reconciliation |
| `docs/` | Account setup, release status, provenance, and validation record |

The repository's original code is [MIT licensed](LICENSE); dependencies retain their own terms. [AI assistance](AI_USAGE.md) and [source provenance](docs/SOURCE_PROVENANCE.md) are documented separately.
