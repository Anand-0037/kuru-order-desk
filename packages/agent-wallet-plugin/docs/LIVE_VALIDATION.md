# Later human-run acceptance checklist

**NOT EXECUTED.** Offline tests and the public read-only deployment check do not satisfy this checklist. Stop at any unknown outcome. A funded address alone is not permission for an assistant to sign or submit a financial transaction.

## 1. Review/install

- Review original source, upstream license gate, tests, package contents and this limitation list
- Use tested Agent Wallet 6.2.0, Node 22.18+, and one private local state directory
- A human enables the documented experimental plugin settings, reviews capabilities and installs from `file:$PWD`; the assistant has not changed these settings
- Verify `mm --version`, `mm chains list --json` includes10143, `mm kuru --help` lists all 5 commands, and `mm kuru demo` works without signing
- Record actual package commit/version and platform. Do not describe metadata generation as completed wallet installation

## 2. Dedicated account and funds

- Human chooses a dedicated testnet owner and ensures no other app/process/trader/hook uses this owner/market
- Human registers/funds its Kuru root account through an independently reviewed supported workflow. The plugin has no deposit, approval, withdrawal or grant action
- Obtain the deployment's dummy USDC through legitimate authorized access; the docs do not promise a public faucet. No account/asset request or outreach has been made
- Keep native MON in the wallet for gas, separately from Kuru custody/free funds
- Never send MON to its zero-address token sentinel; do not use unrelated USDC/WMON addresses
- Preserve the human's chosen side, quantity and price; do not use the demo price as a recommendation

## 3. Read-only prepare

- Run `mm kuru prepare --owner OWNER --side buy|sell --price USER_PRICE --quantity USER_MON --json`
- Verify network/owner/pair, human MON quantity and USDC/MON price, GTC_POST_ONLY, fixed target, notional, fee estimate and prefunded required/free funds
- Explain no guaranteed fill, preflight-only expiry/fee estimate, gas limitation, exclusive-account assumption and custody after cancellation
- Save the exact intent ID/review digest. If any material term changes, prepare a new review

## 4. One real human-authorized order

- Human reviews the exact financial action, any applicable host policy prompt and fee
- Human runs/authorizes `mm kuru submit --intent ID --confirm DIGEST --exclusive-account --json` using MetaMask controls
- Record host request and returned hash without secrets. Never retry after started/unknown or no hash
- Run `mm kuru status --intent ID --json` until a finalized supported outcome exists
- If post-only was skipped, record “not placed.” If still open, record that. If filled, record actual quantity. Do not force the expected story or manufacture market fills
- Compare the application result with actual receipt and packed events on the fixed market; preserve the block and canonical source positions

## 5. Cancellation and restart

- If a tracked remainder exists, preview `mm kuru cancel --intent ID --json`
- Human reviews remainder/identity/expiry and authorizes the exact fresh digest through the same wallet controls
- Reconcile after cancellation. Confirm actual raced fills, deleted remainder, and same-block slot state
- Require `cancellationRequest.receiptState = success` AND `confirmedByTrackedDeletion = true` before saying this request cancelled it
- A filled original order with pending cancel still blocks a new order. Verify the cancellation's own terminal transaction outcome first
- Restart the CLI and read status without another submit. Do not deliberately interrupt a real financial operation to demonstrate reliability; the explicitly offline crash test covers that scenario

## 6. Evidence packet and release decision

Capture: host/plugin versions, commit, network/market/owner consent scope, human-selected input, immutable digest, real transaction hashes, finalized receipts/blocks, decoded creation/fill/deletion records, current slots and exact human-unit quantities. Do not publish secrets, approval links or private wallet metadata.

Use a copy of the repository's [blank live acceptance record](../../../docs/templates/live-acceptance-record.md) for one actual run. It starts at `NOT_RUN`, separates host, public read-only and synthetic evidence, and requires original captures for each completed field. Keep the raw copy private and make a reviewed sanitized copy for judges.

Keep three categories separate: synthetic fixtures; public read-only deployment observations; actual human-authorized live transactions. Only the third establishes a real order lifecycle. If partial fill does not naturally occur, use a separately labelled fixture to explain it.

Before any public release: clarify upstream SDK rights; review source/AI/license disclosures; obtain publication and judge-access permission; recheck the hackathon's actual track/bounty selection and current deadline. The portal remains unchanged. No live-result guarantee or prize claim is made.
