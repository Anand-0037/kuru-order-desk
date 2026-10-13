# Kuru Order Desk web

A repository-ready, dependency-free static frontend centered on composing a clear order in the browser and reviewing it in the Agent Wallet CLI, with secondary read-only browser-wallet diagnostics and collapsed synthetic examples:

1. **Order decision flow:** enter side, price, quantity and dedicated owner; review and authorize in Agent Wallet; check status in the CLI
2. **Optional browser-wallet diagnostics:** user-selected EIP-1193/EIP-6963 provider, account address, chain check and native MON balance on Monad testnet 10143
3. **Offline order examples:** exact-decimal review and recorded resting, partial-fill, cancelled-remainder and unknown-submit scenarios

No signing, contract calls, order submission, cancellation, funding or token approval is implemented. The browser wallet is separate from MetaMask Agent Wallet CLI. See [wallet integration and limitations](docs/WALLET-INTEGRATION.md).

## Quick start

Requires Node.js 22.18+ for checks and the local server. No npm dependencies or install step is needed.

```sh
npm run check
npm run serve
```

Open `http://127.0.0.1:4173`. Choose the side, price, quantity and dedicated owner address; none are preselected. The page creates a read-only `mm kuru prepare` command with human-readable text output. Run it in Agent Wallet, read the full review there, and use the exact intent ID and digest only if you decide to authorize an order. Check the outcome in the CLI with `mm kuru status`. The normal flow does not require copying JSON back to the page. A collapsed optional section can format JSON reports for users who want a browser view. The page does not run commands, authorize, submit, cancel or query the chain. Expand **Offline examples** to inspect synthetic scenarios. Optional browser-wallet diagnostics appear below them; connecting a wallet does not change the examples or the CLI handoff.

If an imported report leaves quantities unknown or its state conflicts with them, the page recommends inspection of the original request and discourages retries or order actions. Status provenance v2 adds the reported chain, market, intent owner and Kuru account context to the existing submission and finalized-block evidence. The importer checks that this context matches the selected review, but the page still cannot authenticate the report or independently verify it. It displays the CLI observation timestamp and provenance details as claims from the imported report only; their presence or recency never means a live check. Reports without provenance, including older status reports, remain importable and show the observation time as unknown.

Use the wallet's permission controls to revoke saved site access. **Disconnect this page** only clears this page's display and listeners. The balance is a point-in-time read; Refresh requests a new reading. Nothing reconnects automatically after reload.

## Structure

- `dist/index.html`, `styles.css`: static UI and responsive layout; `dist/` is the authored source/public directory, not a generated bundle
- `dist/wallet.mjs`: provider state controller and strict read-only request boundary
- `dist/wallet-discovery.mjs`: EIP-6963 selection and legacy fallback
- `dist/wallet-ui.mjs`: wallet UI bindings, independent of offline fixture loading
- `dist/model.mjs`, `amounts.mjs`, `app.mjs`: offline amount review and lifecycle viewer
- `dist/evidence.json`: checked-in actual outputs from local synthetic CLI execution; separately labelled historical public read-only deployment check; source SHA-256 hashes
- `tests/`: provider mocks, DOM-stub integration tests, exact-decimal and static-boundary checks
- `scripts/check.mjs`: syntax checks and complete test suite
- `scripts/export-evidence.mjs`: optional offline evidence regeneration
- Sites deployment configuration is intentionally omitted from this portable copy; the existing deployment checkout retains its own identity

## Evidence regeneration

Serving and testing do not require the CLI repository. To regenerate fixtures, first install the core CLI's declared dependencies, then provide its root explicitly:

```sh
# In a monorepo where this frontend is apps/web:
node scripts/export-evidence.mjs --core-root ../../packages/agent-wallet-plugin
```

The exporter calls only injected synthetic readers/executors. It imports original application code in the build environment; no SDK or Node service code is shipped to the browser. It copies the original MIT exact-unit helper with types removed and records source hashes. It does not obtain live trading evidence.

## Verification and limits

`npm run check` syntax-checks every public JavaScript module and runs the full suite. Provider tests cover absent provider, rejection, wrong network, account and chain changes, local/provider disconnect, stale async results, repeated clicks, malformed data and balance failure. UI tests use DOM stubs; they are not rendered-browser QA.

Eighteen numerical review cases were also compared with the original core planner. On 3 October the new handoff flow was exercised in a rendered browser at desktop and mobile sizes with synthetic input and report data. Real installed-wallet approval and a live order lifecycle remain unverified.

## Agent Wallet handoff

The primary three-stage flow uses explicit side, price, quantity and owner fields. It generates a read-only `--format text` prepare command, gives the exact submit and status command templates, and keeps authorization in MetaMask Agent Wallet. The user reads CLI review and status output in the terminal; they are not asked to paste it back. MetaMask's [Agent Wallet command reference](https://github.com/MetaMask/metamask-docs/blob/main/agent-wallet/reference/commands.md) documents the human-readable text output format. A collapsed optional importer remains for users who specifically want JSON reports formatted in the page. `handoff.mjs` validates structured order fields and, for the optional importer, report identity; `handoff-ui.mjs` renders user data as text. CLI result objects and successful `{ok:true,data:...}` envelopes are supported. Prepare commands can be copied after an explicit click; clipboard denial leaves manual selection available. There is no LLM call, terminal execution, clipboard read, credential storage or browser signing.

Optional imported reports remain in memory and disappear on reload. Editing order terms clears generated commands and any dependent reports. The page identifies every imported outcome as a CLI report that the browser has not independently verified. The offline fixture viewer remains separately labelled. `scripts/serve.mjs` supplies a Node-only local static server.

## Hosting and license

The same static source can be served from a standard HTTPS static host. Current deployment/access settings are managed separately; do not assume source availability changes the Site audience. No secrets or environment variables are needed. No personal wallet address or balance is recorded in source.

Original code and exact-unit helpers are MIT licensed; see `dist/LICENSE.txt`. The original project mark is reused from Kuru Order Desk brand assets. No Kuru SDK implementation or dependency bundle is redistributed.
