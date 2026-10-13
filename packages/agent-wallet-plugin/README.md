# Kuru Order Desk

**Review one Kuru order in human units. Keep signing inside MetaMask Agent Wallet. See what actually filled before acting again.**

An original, installable MetaMask Agent Wallet plugin prototype for **MON/USDC on Monad testnet (10143)**. It supports one dedicated account and one reviewed GTC post-only order lifecycle. It does not provide stop-losses, unattended trading, price predictions, or profit guarantees.

## Start with the safe offline demo

Prerequisites: Node.js 22.18+ and npm 10+. The filesystem/crash workflow was validated on Linux. Native Windows is not supported for plugin state storage in this version because ACL privacy cannot be verified and directory-fsync behavior has not been validated; use Linux or WSL. No wallet or credentials are needed for these commands.

```sh
npm ci --ignore-scripts
npm run check
npm run demo
```

The demo is continuously labelled **OFFLINE FIXTURE · NO LIVE TRANSACTIONS**. It uses our real planner, fixed-ABI transaction builders, durable state, service and reducer with synthetic chain/executor data. It shows 1,000 MON ordered, 400 filled, 600 cancelled, zero open, and restart/repeat behavior with only two fake executor calls. These numbers are examples, not market quotes, trading volume or live evidence.

Full upstream type resolution needs at least 1.5 GB free process headroom. Build/typecheck scripts explicitly cap the TypeScript heap at 768 MB to avoid excessive peak allocation; use a workspace with sufficient memory. The initial 896 MB cap suffered command-level memory kills; the partial-adapter revision lowers the cap to 768 MB. See docs/VERIFICATION.md for actual checks rather than assuming the aggregate passed. Dependencies are lockfile-pinned. Some upstream development dependencies currently emit peer/deprecation warnings; do not treat a completed install as an audited dependency tree.

## What is verified

- Exact-unit planner, immutable review and separate wallet-gas/custody-funding explanations
- Pinned Kuru V2 calldata round trips plus independent literal ABI word/selector test vectors
- Packed receipt-event decoding and a complete bounded finalized-log reconciliation path
- Partial/full fills, skipped post-only order, cancellation races, stale/reused slots, wrong receipt/log identity and unknown evidence
- Durable pre-executor barriers, local concurrency lock, duplicate calls, restart and a real local child-process crash test
- Real MetaMask plugin imports/types, compiled command classes and generated oclif metadata
- Public **read-only** deployment check: see [compatibility evidence](docs/COMPATIBILITY.md)

**Installed-host update (12 October):** Agent Wallet 6.2.0 is authenticated and initialized. Its current `mm plugins --json` output lists `mm-plugin-kuru-order-desk@0.1.0` as a valid installed user plugin, and all five Kuru commands are discoverable. The no-signing fixture demo ran. The opt-in `--official-rpc` read-only prepare reached Kuru account state and stopped because the owner has no registered root account. The selected wallet currently reports 10 testnet MON, supplied by two verified faucet transactions. Separately authorized 0.1 testnet MON registration attempts with Agent Wallet 6.2.0 and an isolated 7.1.0 install were rejected by gas estimation with `Invalid chainId` before a transaction hash or pending request was returned. No Kuru deposit, live order, or signing is confirmed. See [release status](../../docs/RELEASE_STATUS.md) and [account setup](../../docs/ACCOUNT_SETUP.md).

**Not yet verified:** successful live prepare for a registered and funded owner; a completed Kuru wallet transaction; any signed testnet order/cancel/fill; user demand; production suitability. A build or fixture demo does not satisfy those gates.

## Install in Agent Wallet: human setup gate

Development was tested against **@metamask/agent-wallet 6.2.0**. The peer range is `^6.2.0`; version 7 is not claimed compatible. The sponsor's version floor is 6.2.0. Check your actual CLI's `mm chains list --json` for chain 10143.

The following steps change plugin settings and grant capabilities. A human must review and approve the capability prompt. They were completed for the owner's local WSL profile on 12 October; other installations still require their own review.

```sh
npm run build
# Human reviews and enables the documented experimental plugin settings:
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
# Install from this DIRECTORY, as required by the host's local approval flow:
mm plugins install "file:$PWD"
mm kuru --help
mm kuru demo
```

Do not substitute a tarball for the local-directory install. The official template says the host reads `package.json#mm` from that directory to save approvals. Review the consent screen; no `--accept-permissions` shortcut is needed. Read the [official plugin reference](https://docs.metamask.io/agent-wallet/reference/plugins/) and [template instructions](https://github.com/MetaMask/agent-wallet-plugin-template).

Command capabilities:

| Command | Capability | Effect |
|---|---|---|
| `kuru demo` | none | Offline synthetic walkthrough; writes a disposable local demo record |
| `kuru prepare` | wallet-read | Reads chain/account state; saves an immutable local intent |
| `kuru status` | wallet-read | Reads receipt/log/slot evidence; no signing |
| `kuru submit` | wallet-read, wallet-submit | Requests one reviewed order through host `walletExecutor` |
| `kuru cancel` | wallet-read, wallet-submit | Previews first; exact confirmation requests a single-slot cancel |

Plugin-wide capabilities are empty. No mnemonic/session/token APIs, network configuration, signing-key access or separate signer exist in this plugin.

## Live workflow: later human-run acceptance

Use a **dedicated, registered, prefunded Kuru root account** with no other orders, hooks, bots or external writers. The dummy USDC token is specific to this Kuru deployment. The published docs say no public dummy-token faucet is deployed; obtaining assets is a separate human step. Never send MON to its zero-address token sentinel.

```sh
# Read only; replace with your dedicated owner, chosen price and quantity
mm kuru prepare --owner 0xYOUR_OWNER --side buy --price 0.025 --quantity 1000 --json

# Optional read-only workaround when the 6.2.0 host RPC rejects chain 10143:
# sends public account/market reads to the fixed Monad testnet RPC at a paced rate.
# It never signs or broadcasts. Your account address is visible to that RPC provider.
mm kuru prepare --owner 0xYOUR_OWNER --side buy --price 0.025 --quantity 1000 --official-rpc --json

# HUMAN FINANCIAL ACTION: inspect the full review and host policy before proceeding
mm kuru submit --intent FULL_INTENT_ID --confirm EXACT_REVIEW_DIGEST --exclusive-account --json

mm kuru status --intent FULL_INTENT_ID --json

# No --confirm means review only
mm kuru cancel --intent FULL_INTENT_ID --json

# HUMAN FINANCIAL ACTION: confirm the fresh cancellation preview and host request
mm kuru cancel --intent FULL_INTENT_ID --confirm EXACT_CANCEL_DIGEST --exclusive-account --json
mm kuru status --intent FULL_INTENT_ID --json
```

Those prices/amounts are illustrative, not recommendations or live quotes. There is no automatic funding or withdrawal command. See the full [human live-validation checklist](docs/LIVE_VALIDATION.md) before any real action.

A successful submission returns a hash and the next status command. It does not say the order rested or filled. Status separately displays filled, open, cancelled and other-removed MON amounts, evidence block, and the cancellation request's receipt state. Own cancellation is confirmed only with a matching finalized transaction and an action-bound deletion of the tracked order.

## Important limitations

- Funding and maker fee are **snapshot estimates**. Direct Kuru `batch` has no onchain deadline or per-order maker-fee cap. Local expiry and revalidation cannot guarantee execution-time configuration or cost.
- Prepare checks positive wallet MON and submit/cancel simulate with `eth_call`; this is not a gas-budget guarantee. MetaMask calculates/shows the transaction fee at authorization.
- Direct cancel-by-slot has no atomic expected-order-ID constraint. Fresh checks detect many stale/reused cases, but another writer can reuse the slot after a read. **Exclusive account use is mandatory.** This is unsuitable for concurrent trading.
- Cancelling cannot reverse fills. Released reservations remain in AccountCore; cancellation is not a withdrawal. Custody/withdrawal limits are external protocol rules.
- RPC completeness is trusted. Canonicality, receipt inclusion, log limits and slot agreement detect specific faults, not every silent omission. The onchain slot getter returns identity, not independent remaining size. See [threat boundary](docs/THREAT_BOUNDARY.md).
- Finalized-head support and ≤30-second freshness are required. Reconciliation bounds are 100,000 blocks and 50,000 logs. If the block range is too large or provider output may be capped, reconciliation stops. Automated archival recovery is not implemented; preserve the intent and local state, and seek separately reviewed recovery guidance. Automated status remains unresolved and blocks new intents for the same owner. Do not bypass this by shortening the scan, trusting a saved display report, or creating another state directory.
- Retry protection is local to one canonical state directory on a local filesystem. Other directories/machines, deleted/restored records, external writers and chain-wide exactly-once guarantees are outside scope.
- Ambiguous executor response or process crash leaves `started`/`unknown` and refuses resubmission. Inspect `mm wallet requests list`, the original request and receipts manually. Never create a new state directory to bypass the barrier.
- A stale `.lock` blocks mutations after a crash. Read-only `status` remains usable. Remove a stale lock only after a human verifies its process exited and no other writer uses the directory. Never delete intent records to get past uncertainty.

## Source, licenses and provenance

Our original code is [MIT](LICENSE). AI assistance and authorship boundaries are documented in [AI_USAGE.md](AI_USAGE.md).

**Public-release gate:** `@toxicflow-labs/ts-sdk@0.2.0` publishes `license: UNLICENSED`. Kuru's sponsor-linked docs explicitly direct integrations to install it, but that alone does not settle distribution rights. The SDK is an external npm dependency; no implementation or ABI bundle is vendored into this source or package. Clarify its usage/distribution terms before public release. Do not assume our MIT license grants upstream rights.

The plugin package sets `private: true` while this gate is open, so npm refuses registry publication. Local file installation and packaging checks remain available for review. No upstream rights grant is recorded.

An isolated scratch npm file-package install resolved this package and the external SDK 0.2.0 after registry reads; the compiled transaction module imported. That smoke check omitted the Agent Wallet peer and does not establish clean host installation or live compatibility. The current gate is summarized in [release status](../../docs/RELEASE_STATUS.md).

A bounded follow-through independently implements the publicly specified packed record bodies. Complete SDK replacement remains blocked by missing native enum values, event-envelope declarations and required getter declarations; see [adapter feasibility](docs/INDEPENDENT-ADAPTER.md). The SDK dependency and rights gate remain.

No public repository, deployment, wallet action, fundraising/customer claim or hackathon submission was performed by this build. The artifact is ready for review and local testing; live/release gates remain explicit.

## Architecture and checks

- `domain`, `amounts`, `planner`: validated units, fixed deployment and immutable review
- `store`, `service`: durable local barriers and a single policy-gated executor port
- `transactions`, `decode`, `packed`, `chain`: fixed SDK builders/envelope ABI, independent documented record-body decoder and read-only viem adapter
- `host`, `commands/kuru`: real MetaMask plugin wrappers and curated host context
- `fixtures/demo`: explicitly synthetic demo-only data, isolated from live commands
- `tests/review-*`: independent arithmetic, calldata, crash, RPC, schema and wallet-boundary checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm pack --dry-run
npm run demo
```

See [design](docs/DESIGN.md), [live validation](docs/LIVE_VALIDATION.md) and [threat boundaries](docs/THREAT_BOUNDARY.md).
