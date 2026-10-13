# Source provenance

## Plugin snapshot

The plugin source was copied from the reviewed Kuru Order Desk local source commit `7d52789ff249ea967d6b4e86113592716666575c` (2 October 2026). Original source, tests, lockfile, license and technical docs were preserved. No original checkout or remote was changed.

Repository assembly removes historical internal planning material, unrelated demand/judging/submission drafts and transient artifacts. The package file list and README links were adjusted to match that bounded source set. Historical verification logs replace temporary machine-specific output/cache paths with descriptive placeholders. No transaction behavior was changed.

## Browser snapshot

The frontend was copied from the clean, reviewed source commit `6bf62a0320ef37b9a22383e85bc17f73aab6e1ba` (2 October 2026). Its wallet/provider logic, static source, tests and integration limitations were preserved. The Sites deployment configuration was excluded. The `export:evidence` npm script was pointed at the monorepo plugin path, and the README describes the omitted deployment configuration. No wallet behavior was changed. The offline evidence was regenerated against the frozen plugin source through the monorepo command; scenario identities are synthetic and the generation timestamp is local test provenance.

## What is intentionally absent

Installed dependencies, vendored SDK code, compiled plugin output, credentials, private wallet state, host profiles, caches, temporary test state, deployment-specific Sites configuration, third-party research snapshots, private working notes and previous unrelated projects.

Synthetic fixtures remain in the repository because they are reproducible tests and demo evidence. Saved public read-only deployment checks are labelled with their original timestamps and blocks. Neither is a current live-wallet acceptance record.

## Portability

The Sites checkout has a separate deployment identity. This monorepo copies the web source under `apps/web` without its `.git` directory or `.openai` deployment configuration. It does not move or rewrite the Sites remote, change a domain, make the site public, or grant GitHub collaborators access.
