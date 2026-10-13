# Compatibility and source ledger

Checked 2 October 2026. These are implementation facts and a public read-only chain observation, not live wallet acceptance.

## Tested package boundary

| Component | Pinned version | Evidence |
|---|---|---|
| Node | 24.19.0 in build; minimum 22.18 | Local `node --version`; host/package engines |
| MetaMask Agent Wallet | 6.2.0 | Public npm package, git `13fdaca19f63baa961c6af6a862649db07cffa33`; actual `@metamask/agent-wallet/plugin` import and classes load |
| MetaMask companion SDK | 6.2.0, development only | Required to resolve upstream exported executor/context types completely; no runtime import in plugin source. Its allowed viem range is narrowed to 2.52.2 (its declared minimum and the companion fox-sdk pin) for deterministic, smaller type resolution |
| Kuru V2 SDK | `@toxicflow-labs/ts-sdk` 0.2.0 | Public package git `8128e38f511e9111e151a4ee5b2dcc18ef934577`; matches sponsor-linked installation docs |
| viem | 2.51.3 | Exact direct runtime dependency required by reviewed Kuru guide |
| TypeScript | 5.9.3 | Real host types compiled; ESNext/Bundler resolution matches official plugin template |

Runtime imports Kuru's pure spot request builders and exported ABI data. The partial independent-adapter revision replaces packed record-body decoding only; complete removal is blocked as described in [adapter feasibility](INDEPENDENT-ADAPTER.md). No `createWalletClient`, private-key/account signer, delegated wallet or Relay constructor is used. SDK code remains an external dependency and is not bundled/vendored. The plugin peer range is deliberately `^6.2.0`; **7.x compatibility has not been tested**.

Official MetaMask references:
- [Plugin API and manifest](https://docs.metamask.io/agent-wallet/reference/plugins/)
- [Official local-install template](https://github.com/MetaMask/agent-wallet-plugin-template)
- [Supported chains](https://docs.metamask.io/agent-wallet/reference/supported-chains/): chain 10143 is documented; the actual installed host's `mm chains list` remains authoritative

The upstream CLI declarations use extensionless internal imports. TypeScript NodeNext mode did not resolve their base class correctly; the project's Bundler resolution follows the official template while `rewriteRelativeImportExtensions` creates valid Node ESM output. No host-interface shim was substituted.

## Fixed testnet deployment

| Property | Value |
|---|---|
| Chain | Monad testnet, 10143 |
| Market | `0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9` |
| AccountCore proxy | `0xdbaade7b42c95399bb1e9614d51b5b9e2cf78038` |
| MON sentinel | `0x0000000000000000000000000000000000000000` (native 18 decimals; never a transfer destination) |
| Dummy USDC | `0xa402b424f392eaa05dbc8779e4502a1f6a96fef1` (6 decimals) |
| Expected OrderBook implementation | `0xa4171e141a3cf7801d7f06c126284ac0a509e6a9` |
| Expected AccountCore implementation | `0x980719bfce5bf47fbe6951676086bde2fd8452b1` |
| Documented ABI revision | `cdac5ae1311ce4793f80d604d25f9713fcfed57d` |

Source: [Kuru V2 testnet deployment](https://kuru-testnet-docs.mintlify.site/deployments/testnet). Implementation addresses are checked through the standard ERC1967 implementation storage slot before reads/submission simulation; unknown changes stop the plugin. Calls target proxies, never implementations.

### Public read-only observation

`node --experimental-strip-types scripts/check-deployment.ts` succeeded at 2026-10-02T07:56:20.844Z, finalized block **67489203**, hash `0x87f4aa14671f0984c9273bc38d42ef8317dc9d2739e426726252c3307b04599c`.

It observed chain 10143, the MON native sentinel, dummy-USDC quote token, AccountCore custody and the documented OrderBook implementation. Market parameters were price/size precision 1,000,000, tick 1, minimum 10 USDC, maximum 5,000,000 USDC, baseline taker 7 bps and maker 4 bps. This script did not query an owner's account and did not sign, fund or submit anything.

Raw application-produced result: [public-chain-check-2026-10-02.json](evidence/public-chain-check-2026-10-02.json). This validates those facts at one block. It does not validate later upgrades, current liquidity, balances, effective per-account fees, receipt production or fill behavior.

## Protocol semantics used

- Price/quantity are exact precision-scaled integers; custody uses token atoms. MON quantity × base multiplier converts to 18-decimal atoms
- Buy notional follows the documented two-stage floor; the funding budget uses a conservative ceiling plus maker-fee estimate
- `batch` receives one GTC POST_ONLY native order, zero cancellations and a unique nonzero clientOrderId; cancellation sends no orders and exactly one slot
- A successful receipt can contain POST_ONLY_NOT_PLACED. Open orders require a matching live event
- Maker fills occur under another taker's header; the reader obtains market-wide logs and filters packed maker identity
- Canonical fill identity is chain/market/tradeId; observation position and block hashes provide provenance
- Direct cancel-by-slot lacks an atomic expected-order-ID condition. The dedicated exclusive-owner assumption is required
- Local expiry and fee revalidation are preflight checks; the direct ABI has no execution deadline or maker-fee cap

Sources: [installation/version caveats](https://kuru-testnet-docs.mintlify.site/sdk/installation), [first trade](https://kuru-testnet-docs.mintlify.site/sdk/quickstart), [orders/cancellation](https://kuru-testnet-docs.mintlify.site/sdk/orders-and-cancellation), [event reference](https://kuru-testnet-docs.mintlify.site/sdk/events), [packed indexing specification](https://kuru-testnet-docs.mintlify.site/indexing/order-book).

## Explicit compatibility exclusions

Kuru SDK 0.2.0's hosted WebSocket decoder does not cover later hosted-layout changes documented after its release. The prototype therefore uses contract receipts/logs and never the exchange WebSocket decoder. Old `docs.kuru.io`, `@kuru-labs/kuru-sdk` and terminal examples are not assumed to be V2-compatible. No secondary EOA, EIP7702, hosted Relay, native triggers, TWAP or automatic exits are integrated.

## Upstream rights gate

The npm metadata of `@toxicflow-labs/ts-sdk@0.2.0` has `license: UNLICENSED`. Its published integrity is `sha512-cV/ZGeDG/SyoXnxFlAAOs7UkFbiK09vangxyIiByLYuL02Srl+B6eBql1KH1waxIb1T0beMgKdvfeqdzjFsP3Q==`. [Package registry metadata](https://registry.npmjs.org/@toxicflow-labs%2fts-sdk/0.2.0) and sponsor-linked installation guidance establish the package identity; they do not resolve redistribution permission. Clarify before release. No external contact was made.
