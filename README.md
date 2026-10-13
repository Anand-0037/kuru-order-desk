# Kuru Order Desk

**Compose a Kuru order in the browser. Review the exact intent in MetaMask Agent Wallet. Reconcile what happened.**

Kuru Order Desk is a trading control center for the MON/USDC market on Monad testnet. It gives traders a clear path from order terms to wallet review and status tracking while keeping signing and policy decisions inside Agent Wallet.

[Open the live app](https://anand-0037.github.io/kuru-order-desk/) · [Watch the product demo](https://anand-0037.github.io/kuru-order-desk/demo.html) · [Watch the pitch](https://anand-0037.github.io/kuru-order-desk/pitch.html)

## Why it exists

A transaction hash alone does not tell a trader whether an order is resting, filled, cancelled, or still uncertain. Kuru Order Desk makes the order terms readable before submission and gives the trader a separate path to inspect the outcome.

## How it works

1. **Compose:** Choose a side, MON quantity, and USDC limit price. The browser builds a readable `mm kuru prepare` command for a GTC post-only order.
2. **Review:** The Agent Wallet plugin checks the selected wallet, Kuru account, market, custody funds, and gas balance. A successful prepare returns a review digest without signing.
3. **Authorize:** The trader reviews that exact digest and separately requests submission through Agent Wallet's signing and policy controls.
4. **Reconcile:** `status` checks transaction, market, and order-slot evidence. Cancellation has its own review, and uncertain outcomes stop automatic retries.

The browser is a non-signing companion. Its interactive lifecycle examples and the plugin's offline `demo` command are explicitly labeled synthetic.

## Try it

Open the [live app](https://anand-0037.github.io/kuru-order-desk/) and select **Try interactive demo**, or enter order terms to generate a prepare command. No browser login or private key is needed.

To run the project locally, use Node.js 22.18+ and npm 10+:

```sh
npm run check:web
npm run serve
```

Open `http://127.0.0.1:4173/`. For Agent Wallet installation and command usage, follow the [plugin guide](packages/agent-wallet-plugin/README.md) and [agent skill](packages/agent-wallet-plugin/skills/kuru-order-desk/SKILL.md). The [account setup guide](docs/ACCOUNT_SETUP.md) covers the Monad testnet and Kuru custody prerequisites.

## Project map

| Path | Contents |
| --- | --- |
| `apps/web/dist/` | Browser companion and interactive examples |
| `packages/agent-wallet-plugin/` | Wallet commands, order review, intent state, and reconciliation |
| `assets/demo/` | Narrated product and pitch recordings |
| `docs/` | Setup, provenance, validation, and [dated release status](docs/RELEASE_STATUS.md) |

## Sarvam API example

The separate [single-call Python example](sarvam_chat.py) demonstrates a Sarvam chat completion. Install `sarvamai`, put `SARVAM_API_KEY` in a local `.env`, and run `python sarvam_chat.py`. The key and local virtual environment are ignored by Git.

The repository's original code is [MIT licensed](LICENSE). Dependencies retain their own terms; [AI assistance](AI_USAGE.md) and [source provenance](docs/SOURCE_PROVENANCE.md) are documented separately.
