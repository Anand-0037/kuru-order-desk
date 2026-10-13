import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const name of readdirSync('dist').filter(n => n.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', `dist/${name}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const tests = readdirSync('tests').filter(n => n.endsWith('.test.mjs')).map(n => `tests/${n}`);
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
process.exit(result.status ?? 1);
