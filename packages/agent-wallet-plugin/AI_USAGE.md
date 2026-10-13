# AI assistance and provenance

This prototype was developed with OpenAI assistant assistance for research, architecture, TypeScript implementation, tests, independent review, documentation and demo preparation. The human owner selected/approved the scope. Routine engineering choices were delegated; financial actions and publication were not performed by the assistant.

The initial application source in this directory was written for this prototype on 2 October 2026. A narrow 5 October follow-up added persisted submission-hash binding, normalized hash comparison in provenance, and a regression test. The previous Metropolis drafts and demos are separate; none is claimed as a new live Kuru implementation. SDK, wallet host and protocol functionality are credited to their respective authors.

## External references

- MetaMask Agent Wallet plugin documentation and MIT template informed command/manifest structure: https://docs.metamask.io/agent-wallet/reference/plugins/ and https://github.com/MetaMask/agent-wallet-plugin-template
- Kuru's sponsor-linked V2 docs and published SDK informed exact units, addresses, request shapes and receipt semantics: https://kuru-testnet-docs.mintlify.site/sdk/installation and https://github.com/Kuru-Labs/ts-sdk
- viem supplies ABI encoding/decoding and read-only RPC formatting: https://viem.sh/

No SDK implementation or ABI bundle is copied into project source. The pinned Kuru SDK remains an external dependency with an unresolved `UNLICENSED` distribution gate. Public source release and usage rights are not asserted on the basis of AI generation.

The partial adapter follow-through independently authors the public packed record-body layout in `src/packed.ts`. It does not claim a legally supervised clean-room process, full SDK replacement, or legal certainty. Exact public specifications and unavailable declarations are recorded in docs/INDEPENDENT-ADAPTER.md.

## Evidence discipline

Synthetic fixtures are explicitly labelled. The offline demo never signs or sends transactions. Public read-only compatibility checks establish only chain/deployment facts at recorded blocks. No customer interview, usage, trading volume, performance claim or real testnet order/fill/cancel was fabricated.

Independent AI review added tests with separate numeric/calldata oracles and found real bugs in early implementations. Fixes and fresh tests improve confidence but do not replace human review, a contract audit or live acceptance.

The 5 October follow-up was checked in a clean exact-lock Linux copy with 138 tests, strict source/test typechecks, lint, build and manifest generation. Synthetic evidence export verified the new provenance fields and all recorded source hashes. A local browser smoke used synthetic order values only; it did not connect a wallet, query the chain, execute the generated CLI command, or submit a transaction. No dependency update, public release, deployment or submission was performed.
