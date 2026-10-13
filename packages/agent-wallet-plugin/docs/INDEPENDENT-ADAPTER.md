# Independent adapter feasibility and partial remediation

Checked 2 October 2026. This revision preserves the delivered prototype at commit `b6d26cf0e9e86bb50786ef02b62c9b7c19ee30bb` and its source archive. It is bounded release-blocker research, not a new trading feature.

## Result

**Complete SDK removal is blocked by missing public interface specifications.** The project still depends on `@toxicflow-labs/ts-sdk@0.2.0`. Its `UNLICENSED` release gate remains unresolved. No claim of legal clearance or real transaction compatibility is made.

**11 October 2026 refresh:** The official public [DEX contracts repository](https://github.com/Kuru-Labs/Kuru-contracts-dex-public) exposes an older interface with `OrderCreated`/`Trade` events and boolean `isBuy`/`postOnly`, rather than the packed V2 events and numeric mappings required here. Its [interface](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/main/contracts/interfaces/IOrderBook.sol) and [implementation](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/main/contracts/OrderBook.sol) also carry different license headers; repository visibility does not resolve reuse permission or make that interface compatible. The official [SDK package metadata](https://github.com/Kuru-Labs/ts-sdk/blob/main/package.json) still says `UNLICENSED` on current `main` (version 0.3.0, whereas this plugin pins 0.2.0). No authoritative, publicly licensed V2 specification was found for the missing enum values, packed-event field types/indexing, and getters. The decision remains **HOLD**: obtain written permission covering the intended distribution, or a versioned licensed V2 interface with those exact declarations before attempting complete replacement. This is a source-availability and engineering gate, not a legal opinion.

The completed independent portion is `src/packed.ts`: decoding of the fully documented 39-byte book bodies and 64-byte trade bodies. It is called by `src/decode.ts`, replacing the SDK's packed-body decoders. Event envelopes still use the external SDK ABI. Builders and read interfaces remain unchanged. The dependency and lockfile remain because those imports are still required.

This patch was authored from the published protocol descriptions, using ordinary big-endian byte extraction. No upstream implementation or generated ABI was copied into the patch. Previous integration work involved the SDK, so this is not a claim of a legally supervised clean-room process. Our MIT notice does not grant any rights in third-party material.

## Specification inventory and missing pieces

| Surface | Available public specification | Decision |
|---|---|---|
| Book/trade record bodies | Complete byte widths, bit fields, flags, operation outcomes, sentinel/passive semantics | Implemented independently |
| Four-argument native batch | Account width, six tuple field widths/order, slot list and client ID | Signature is documented; full builder replacement blocked below |
| Native BUY/SELL, GTC, POST_ONLY | Names and meanings; SDK normalization/export examples | Numeric enum mappings are not specified; do not guess from old tests or inspect SDK implementation to fill the gap |
| BookUpdatesPacked / TradesPacked envelope | Parameter names/order and that executor is indexed | Missing complete Solidity field types and indexed declarations; cannot independently derive topic signatures or envelope layout |
| Required read interfaces | Most callable signatures and output widths, including account balances and slot IDs | `protocolPaused()` declaration missing; market `makerFeePps()` and `spotBalanceAccountAddress()` declarations not fully specified on the OrderBook reference |
| getMarketParams | Seven output widths; quickstart names first five | Sufficient for currently consumed positions. Final two names are not independently specified, so this does not justify replacing the separate fee getter with an inferred tuple position |

The public full-document export was searched in addition to the focused pages. The linked contract repository tree at documented revision `cdac5ae1311ce4793f80d604d25f9713fcfed57d` returned GitHub HTTP 404. This establishes that it was unavailable through that public read, not why. No access escalation, external contact, ABI reconstruction from bytecode, or live probing was attempted.

A complete replacement requires an authoritative specification of these missing declarations/mappings, followed by renewed independent tests and human live validation. If retaining the SDK, permission or a clarified upstream license remains the separate release gate. Installing a dependency does not establish redistribution rights.

## Codec contract

- Accept only a string beginning `0x`, complete hexadecimal bytes, and a whole number of records
- An empty body returns an empty list; empty evidence cannot prove order creation/fill/cancellation
- Preserve all integer fields as bigint; bounded flag/slot/index fields are numbers
- Read fields at their documented byte offsets, including trailing 4-byte block / 3-byte fee fields
- Report operation metadata only for nonzero outcomes; outcome NONE explicitly makes those raw fields meaningless
- Reject unknown outcomes, reserved bits and documented invalid outcome/record combinations
- Recognize sentinel shape precisely; a nonzero outcome alone is not a sentinel
- Preserve contiguous record order; do not require MATCH_END at every log boundary, because one match can span logs
- Reject the entire payload if any contained record is malformed; never return a successful prefix

Event address, canonical position, receipt matching, replay freshness and quantity conservation remain responsibilities of the existing envelope reader and lifecycle reducer.

## Public sources

- [OrderBook callable reference](https://kuru-testnet-docs.mintlify.site/contracts/order-book): native tuple and read types
- [AccountCore callable reference](https://kuru-testnet-docs.mintlify.site/contracts/account-core): account and balance views
- [OrderBook indexing specification](https://kuru-testnet-docs.mintlify.site/indexing/order-book): packed fields, sentinels, per-operation outcome contexts and stream ordering
- [Event outcome reference](https://kuru-testnet-docs.mintlify.site/sdk/events): stable numeric outcome codes
- [First trade](https://kuru-testnet-docs.mintlify.site/sdk/quickstart): first five market-return meanings and SDK enum usage
- [SDK method reference](https://kuru-testnet-docs.mintlify.site/sdk/method-reference): normalization helpers, without numeric enum schema
- [Full public documentation export](https://kuru-testnet-docs.mintlify.site/llms-full.txt): cross-page missing-spec search
- [Testnet deployment](https://kuru-testnet-docs.mintlify.site/deployments/testnet): fixed deployment and ABI revision

Source hashes/timestamps are recorded separately under `docs/evidence/independent-adapter-sources.json`. Full third-party documentation is not bundled.
