// Run the package-defined checks without layers of nested npm processes.
// The full upstream TypeScript graph is memory-intensive in small workspaces.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readinessTests = spawnSync(process.execPath, ['--test', 'scripts/readiness.test.mjs'], { cwd: root, stdio: 'inherit' });
if (readinessTests.error) throw readinessTests.error;
if (readinessTests.status !== 0) process.exit(readinessTests.status ?? 1);
for (const [directory, checks] of [
  ['apps/web', ['check']],
  ['packages/agent-wallet-plugin', ['test', 'typecheck', 'lint', 'build']],
]) {
  const cwd = resolve(root, directory);
  const { scripts } = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  for (const check of checks) {
    const command = scripts[check];
    if (typeof command !== 'string' || !command) throw new Error(`Missing ${directory}:${check}`);
    console.log(`\n> ${directory}:${check}\n> ${command}\n`);
    const result = spawnSync(command, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${resolve(cwd, 'node_modules/.bin')}${delimiter}${process.env.PATH ?? ''}` },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
