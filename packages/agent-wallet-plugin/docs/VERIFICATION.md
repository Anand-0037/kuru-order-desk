# Verification record

Local prototype verification on 2 October 2026. This is not wallet installation or live trading acceptance.

## Executed evidence

- Full deterministic unit/integration fixture suite: passed after final presentation and CLI error changes (70 tests)
- Independent reviewer: 22 additional tests, actual red failures fixed; separately reran the then-current 66-test suite, strict typecheck and lint
- Real local child-process crash: durable pre-executor barrier survived; no repeated fake broadcast
- Public read-only deployment: succeeded at finalized block 67489203; exact result is in docs/evidence
- Offline demo: complete order/partial-fill/cancel/restart flow; exactly two fake executor calls; no wallet or RPC

Final artifact packaging and fresh type/build check results are recorded below by the release check.

## Not executed or not established

- Consented plugin installation into a real Agent Wallet profile
- Real host policy/MFA or human-approved testnet order/cancel/fill
- Native Windows plugin state storage is intentionally rejected until ACL privacy and directory-fsync behavior are validated
- Actual Kuru bytecode executed on a local Anvil/fork; fake RPC and ABI vectors are not a contract-semantic oracle
- Exhaustive filesystem/power-loss failures, arbitrary external concurrency or RPC completeness proof
- User demand, acquisition, retention, production suitability or prize qualification
- Upstream UNLICENSED package distribution rights, public release or hackathon submission

## Warnings and resource limit

Official upstream development dependencies emit peer/deprecation warnings. The sandbox's inherited npm http-proxy configuration also emits a warning. These were not hidden, and install/build success does not mean the dependency tree has no advisories.

Unbounded compiler runs were intermittently terminated for memory. The build uses the official host types with a bounded TypeScript heap, ESNext/Bundler resolution matching the official template, and a development-only SDK dependency pin; no invented host-interface shim was used. Individual verification results below distinguish completed checks from earlier resource failures.

## Final local release check — 08:35 UTC

- `npm test`: passed, **70/70**
- Source and test strict TypeScript: both passed via direct compiler commands (same tsconfig/options as npm scripts)
- TypeScript emit/build: passed; generated oclif manifest includes all five commands
- `npm run lint`: passed
- `npm run format:check`: passed
- `npm run demo`: passed; human-unit order/cancel/restart flow, two fixture executor calls

Resource distinction: the complete nested `npm run check` was killed during typecheck in this constrained command environment. Each compiler stage then passed directly with an 896 MB heap. Measured peak child RSS was about 912 MB for source and 1,044 MB across source/test stages. This is a resource limitation, not a green aggregate command; use sufficient free memory. No types were replaced by stubs.

## Private artifact smoke check

- `npm pack --ignore-scripts --dry-run --json --cache <writable-npm-cache>`: passed after pointing npm at the authorized writable cache
- `npm pack --ignore-scripts --json --cache <writable-npm-cache>`: produced the private `.tgz`; package file inventory excludes node_modules, third-party research snapshots and build working logs
- Extracted package: all five compiled command modules loaded and inherited the real host PluginCommand; manifest schema and command inventory passed
- Extracted compiled demo: passed with 400 MON filled, 600 MON cancelled, zero open and exactly two fake executor calls

The extraction smoke check reused the already pinned local dependencies by symlink. It is **not** a fresh dependency install, a host plugin-consent install, or a real wallet integration test. Official local installation uses the directory flow documented in README.

## Partial independent-adapter revision — 09:02 UTC

This is a new local branch from the frozen baseline, not a replacement of the delivered artifact and not full SDK removal. See docs/INDEPENDENT-ADAPTER.md and the separate independent review.

- `npm run check`: **passed**, including all **85 tests**, strict source/test typechecks, full lint, TypeScript emit and all five oclif command entries
- `npm run format:check`: passed
- `npm run demo`: passed, with the same prominently labelled synthetic 400 filled / 600 cancelled / 0 open result and two fake executor calls
- `npm pack --ignore-scripts --dry-run --json --cache <writable-npm-cache>`: passed
- `npm pack --ignore-scripts --json --pack-destination <separate-package-output> --cache <writable-npm-cache>`: passed; separate destination preserves the original private package
- Extracted package smoke: real host manifest/class checks, compiled independent packed codec literal/malformed vector and full compiled offline demo passed
- Public read-only deployment recheck: passed at finalized block **67501223**, 2026-10-02T08:56:47.861Z; same recorded fixed market/configuration/implementation. No owner queried or transaction submitted
- Independent reviewer: public-spec completeness assessment, 12 independently constructed body-codec tests with an actual six-failure red checkpoint, final 85-test suite/lint rerun and source reread; bounded codec accepted

Resource resolution: at the start of this follow-through, the old 896 MB script and one direct full-test compiler run again exited 137. A direct full source+test check passed with 768 MB. The scripts now use 768 MB; the complete standard `npm run check` subsequently exited 0. Earlier failures remain recorded rather than being described as successes. Inherited npm http-proxy warnings remain.

The source+lockfile still require the Kuru SDK for request builders and event/read ABI definitions. Its rights gate and the missing public-interface specifications remain unresolved. Package smoke reused existing pinned local dependencies via symlink and is not a cold install or real Agent Wallet consent flow. No real Kuru fill/cancel was tested.
