# Kuru Order Desk live acceptance record — blank template

**State: NOT_RUN.** Copy this file for a human-consented testnet run. Keep the raw copy private; make a separate sanitized copy for any judge. Never record a seed phrase, private key, token, approval link, authentication response, or unrelated wallet/account metadata. A filled form is not evidence unless its cited original CLI/chain captures exist and match.

## Run identity and consent

| Field | Actual observation |
| --- | --- |
| Capture date/time and time zone | NOT_RUN |
| Source checkout path and source hash or revision | NOT_RUN |
| Node/npm, OS, Agent Wallet version | NOT_RUN |
| Plugin package/manifest version and install source | NOT_RUN |
| Human reviewer of plugin source/capabilities | NOT_RUN |
| Human consent for experimental settings and installation | NOT_RUN |
| Human authorization for any later submit/cancel | NOT_RUN; separate from install consent |
| Evidence storage path and access scope | NOT_RUN |

## A. Host discovery — no signing

**Status: NOT_RUN.** Preserve unedited command output, exit status and capture time for `mm --version`, `mm kuru --help`, `mm kuru demo`, and authenticated `mm chains list --json`. Verify all five Kuru commands and chain 10143 in the intended host profile. The offline demo must remain labelled synthetic.

| Check | Result | Evidence file |
| --- | --- | --- |
| Consented local install and capability prompt | NOT_RUN | — |
| Five commands discovered in Agent Wallet | NOT_RUN | — |
| No-signing demo | NOT_RUN | — |
| Authenticated chain 10143 support | NOT_RUN | — |

## B. Dedicated account and read-only prepare

**Status: NOT_RUN.** The human chooses the owner, side, limit price and MON quantity. Record only an owner address or approved redaction, never a key. Confirm registration, exclusive use, custody funds and separate native gas through the supported workflow. The browser's synthetic fixture balances do not count.

| CLI review field | Actual value or approved redaction | Evidence file |
| --- | --- | --- |
| Owner / Kuru account ID | NOT_RUN | — |
| Chain 10143 / fixed market | NOT_RUN | — |
| Side, MON quantity, USDC/MON limit, GTC post-only | NOT_RUN | — |
| Snapshot block and local review expiry | NOT_RUN | — |
| Required and free custody funding, maker fee estimate, wallet gas | NOT_RUN | — |
| Intent ID and confirmation digest | NOT_RUN | — |
| Human review of all displayed terms | NOT_RUN | — |

Stop if the owner, terms, funds, fee, gas, market or digest is missing or different from the human's intent. A successful prepare is read-only; it does not prove a placed order.

## C. Separately authorized submit

**Status: NOT_RUN.** The human decides whether to authorize the exact prepared request in MetaMask. No assistant should infer permission from installation or this template. Do not retry a pending, hashless or unknown request.

| Field | Actual observation | Evidence file |
| --- | --- | --- |
| Human approval of exact intent and digest | NOT_RUN | — |
| Host request identity, if exposed | NOT_RUN / NOT EXPOSED | — |
| Plugin `phase` | NOT_RUN | — |
| Returned `transactionHash` or explicit null | NOT_RUN | — |
| Unknown/pending handling and retry decision | NOT_RUN | — |

## D. Status and protocol evidence

**Status: NOT_RUN.** Capture the original `mm kuru status --intent <ID> --format json` and a readable text view. The plugin reports an outcome; preserve independent receipt, log and slot observations when available. A transaction hash or successful receipt alone does not prove that an order rested or filled.

| Reported field | Actual value | Evidence file |
| --- | --- | --- |
| State, order ID, slot | NOT_RUN | — |
| Filled / open / cancelled / other removed MON | NOT_RUN | — |
| Finalized block and observation time | NOT_RUN | — |
| Submitted hash vs persisted expected hash; match flag | NOT_RUN | — |
| Receipt status/block; request match; finalized/complete/canonical flags | NOT_RUN | — |
| Evidence block range and finalized head hash | NOT_RUN | — |
| Creation, fill, skip or deletion event positions; trade IDs | NOT_RUN | — |
| Current pinned account slots | NOT_RUN | — |
| Quantity reconciliation and any remaining unknowns | NOT_RUN | — |

If the post-only order was skipped, write **not placed**. If evidence is incomplete or contradictory, write **unknown / needs review**. Do not turn absent values into zero.

## E. Cancellation, only if a tracked remainder exists

**Status: NOT_RUN / NOT_APPLICABLE.** If no cancellable remainder exists, mark not applicable and keep live cancellation coverage open. If one exists, capture a fresh preview and digest, separate human approval, cancellation request hash, finalized own-request receipt, tracked deletion, raced fills, and resulting quantities. `cancellationRequest.receiptState = success` and `confirmedByTrackedDeletion = true` are both required before attributing cancellation to this request. Cancellation does not reverse fills or withdraw custody funds.

| Field | Actual observation | Evidence file |
| --- | --- | --- |
| Remaining MON, order ID, slot, fresh digest/expiry | NOT_RUN | — |
| Separate human approval and cancellation request hash | NOT_RUN | — |
| Own request receipt and correlated tracked deletion | NOT_RUN | — |
| Raced fills and final filled/open/cancelled/other removed MON | NOT_RUN | — |

## F. Ordinary restart and decision

**Status: NOT_RUN.** Restart normally, read the same intent's status, and verify no second submission occurred. Do not interrupt a real transaction to make a video; interruption behavior has separate offline fixture coverage.

| Decision item | Result | Evidence file |
| --- | --- | --- |
| Same persisted intent and status after restart | NOT_RUN | — |
| No duplicate submit or cancel request | NOT_RUN | — |
| Raw evidence and sanitized judge copy agree | NOT_RUN | — |
| Live acceptance verdict and unresolved limits | NOT_RUN | — |

## Evidence manifest

List each file with **category** (`LIVE HOST`, `PUBLIC READ-ONLY`, or `OFFLINE SYNTHETIC`), capture time, source revision, SHA-256, what it proves, and any redaction. Keep categories visibly separate in screenshots and video. The public [11 October deployment diagnostic](../evidence/public-readiness-2026-10-11.json) belongs to `PUBLIC READ-ONLY`; it cannot fill sections A–F.

| File | Category | Capture time / source | SHA-256 | Claim supported / redaction |
| --- | --- | --- | --- | --- |
| NOT_RUN | — | — | — | — |

**Release verdict: HOLD.** Resolve the SDK rights gate, current portal requirements, judge access, and final video/copy review separately. Filling this template does not authorize publication or submission.
