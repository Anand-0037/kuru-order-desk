# Threat and correctness boundary

This describes our application controls. It is not a third-party protocol vulnerability report or audit.

## Trust and authority

The plugin can read public chain/wallet metadata and can request a policy-gated transaction only in submit/cancel. MetaMask owns signing, credentials, policy and MFA. The plugin never accesses them. The human remains responsible for financial authorization, account setup, token acquisition and funding. Installation consent is not consent to a particular financial action.

Only fixed Monad testnet deployment/ABI operations are constructed. Arbitrary destinations, calldata, keys, network switches, token approvals, fund transfers, builder grants, delegation, Relay and off-chain signatures are unsupported.

## Integrity and order truth

The review digest binds complete deterministic intent content; persisted content is schema/version checked and reconstructable. Cancellation has a separate identity/remainder/expiry-bound digest. A checksum detects inconsistent changes; it is not a MAC or defense against someone who controls and rewrites all local files. Filesystem integrity and a private local state directory are trusted.

The reader verifies chain and documented proxy implementations, explicit block-pinned reads, transaction hash/from/to/input/value/chain binding, receipt hash, canonical block hashes, packed-log layout, original receipt/range agreement, and all 62 account slots. It refuses wrong identities, incompatible updates, stale heads, removed/conflicting evidence and unsupported finality.

A receipt is transaction status; a live event is creation; fill records explain executed quantity; non-sentinel deletion explains removed remainder. These are distinct. Quantity conservation is checked. The plugin's own cancellation request has its own receipt state and requires exact tx/client/account/operation 0 deletion correlation before reporting success.

### RPC completeness is an assumption

A provider can silently omit a later partial fill while returning the same open order ID. The slot getter cannot independently prove remaining size. Bounded full-range replay, receipt cross-checks, caps and canonicality protect against specific faults but cannot prove an RPC provider returned all later logs. No indexer/light-client proof, custody-delta reconciliation or protocol audit is claimed.

Unsupported finalized reads fail closed. Snapshots/head age must remain ≤30 seconds even after replay. The first version reads at most 100,000 blocks / 50,000 logs and stops when the supported range is exceeded or provider output may be capped. It does not hide truncation by returning zero. Automated archival recovery is not implemented: status remains unresolved and same-owner preparation remains blocked. Preserve the original intent and local state, and seek separately reviewed recovery guidance; do not shorten the replay or trust a saved display report as chain evidence.

## Concurrency and crash behavior

A single state-directory exclusive lock and durable fsynced phase record precede executor entry. Known hashes survive restart; ambiguous responses remain started/unknown and never auto-resend. Unresolved cancellations block new owner intents even after the original order fills, because a late cancel could otherwise act on a reused slot.

On POSIX, the state directory must have no group or other permissions. Native Windows fails closed because this version cannot verify effective ACL privacy; its directory-fsync behavior is also unvalidated. Use Linux or WSL for plugin state storage.

The state is atomically rewritten with guarded transitions. It is not an append-only event journal. A genuine child-process crash test confirms a pre-entry barrier survives that tested crash; there is no exhaustive disk/power-loss proof.

The lock is local. Multiple state directories, copied/deleted/restored files, separate machines, external traders and manually unknown pending transactions fall outside it. A stale lock is not automatically removed. A human must verify the owning process exited before recovering mutations; read-only status remains possible.

Direct cancel-by-slot is not atomic identity-guarded cancellation. The plugin checks the recorded order ID immediately before request but another writer can race after that read. Use one dedicated account with no other process. The prototype is deliberately unsuitable for concurrent trading. This limitation cannot be solved by calling the current check “safe” or “exactly once.”

## Economic and operational limits

All values are testnet examples, not financial advice. Post-only can skip or fill before cancel; fills are irreversible. Native gas is separate from Kuru free/reserved funds. A nonzero wallet balance plus eth_call is not proof of sufficient gas for the eventual host estimate.

Fee budget and local expiry cannot constrain pending execution: current direct batch has no per-order fee cap or deadline. Protocol governance/upgrades, RPC access, market pauses, fee tiers, liquidity and withdrawal limits remain external dependencies. Cancellation releases reservation inside AccountCore; it does not withdraw.

## Handling a failure

1. Stop any dependent submit/cancel when state or evidence is unknown
2. Preserve the intent ID, original host request and known transaction hash
3. Inspect host request status and canonical chain evidence with the human
4. Do not clear records, silently retry, switch directories, sign a replacement or create another order to get unstuck
5. If recovery exceeds the bounded implementation, report the exact gap and use a separately reviewed manual workflow

No public wallet actions, new credentials or persistent wallet permission changes were exercised in the build session.
