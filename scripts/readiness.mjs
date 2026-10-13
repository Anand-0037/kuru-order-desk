import { readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = resolve(root, 'packages/agent-wallet-plugin');
const probeStages = new Set(['rpc-configuration', 'chain-id', 'finalized-head', 'market-params', 'base-token', 'quote-token', 'custody', 'market-implementation', 'account-implementation', 'market-code', 'custody-code', 'market-implementation-code', 'account-implementation-code']);
const rpcOperations = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_getStorageAt', 'eth_getCode', 'none']);
const allowedCauseCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);

const failureMessages = {
  network: 'Public RPC network connection failed.',
  timeout: 'Public RPC request timed out.',
  'http-rpc-rejection': 'Public RPC rejected the request.',
  'malformed-json': 'Public probe returned invalid JSON.',
  'contract-call-decode': 'Public contract call or response decoding failed.',
  'invalid-rpc-url': 'Diagnostic RPC URL is invalid.',
  'wrong-chain': 'Public RPC returned the wrong chain.',
  'wrong-proxy-implementation': 'Proxy implementation does not match the pinned deployment.',
  'missing-bytecode': 'Expected proxy or implementation bytecode is missing.',
  'stale-finalized-head': 'Finalized head is stale.',
  'future-finalized-head': 'Finalized head timestamp is in the future.',
  'incomplete-observation': 'Public deployment observation was incomplete or mismatched.',
  unknown: 'Public deployment probe failed for an unknown reason.'
};

function structuredFailure({ failureKind = 'unknown', stage, rpcOperation, causeCode, httpStatus, rpcCode, exitCode, timedOut = false } = {}) {
  let kind = Object.hasOwn(failureMessages, failureKind) ? failureKind : 'unknown';
  if (kind === 'incomplete-observation' && ['market-implementation', 'account-implementation'].includes(stage)) kind = 'wrong-proxy-implementation';
  if (kind === 'incomplete-observation' && ['market-code', 'custody-code', 'market-implementation-code', 'account-implementation-code'].includes(stage)) kind = 'missing-bytecode';
  if (kind === 'network' && ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(causeCode)) kind = 'timeout';
  return {
    failureKind: kind,
    ...(probeStages.has(stage) ? { stage } : {}),
    rpcOperation: rpcOperations.has(rpcOperation) ? rpcOperation : 'none',
    ...(allowedCauseCodes.has(causeCode) ? { causeCode } : {}),
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}),
    ...(Number.isInteger(rpcCode) ? { rpcCode } : {}),
    ...(Number.isInteger(exitCode) ? { exitCode } : {}),
    timedOut: timedOut === true || kind === 'timeout',
    stderr: failureMessages[kind]
  };
}

function parseFailureJson(stderr) {
  if (typeof stderr !== 'string') return null;
  // The TypeScript probe writes one fixed-shape JSON diagnostic to stderr.
  for (const line of stderr.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line);
      if (value?.kind === 'PUBLIC_READ_ONLY_FAILURE') return value;
    } catch { /* Ignore non-JSON stderr lines. */ }
  }
  return null;
}

export function classifySubprocessFailure({ error, stderr = error?.stderr, exitCode = error?.code, timedOut = false } = {}) {
  const emitted = parseFailureJson(stderr);
  if (emitted) return structuredFailure({ ...emitted, exitCode: Number.isInteger(error?.code) ? error.code : exitCode, timedOut: error?.killed === true || timedOut });
  const code = typeof error?.code === 'string' ? error.code : undefined;
  const isTimeout = timedOut || error?.killed === true || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT';
  if (isTimeout) return structuredFailure({ failureKind: 'timeout', causeCode: allowedCauseCodes.has(code) ? code : undefined, exitCode: Number.isInteger(exitCode) ? exitCode : undefined, timedOut: true });
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'UND_ERR_SOCKET'].includes(code)) return structuredFailure({ failureKind: 'network', causeCode: code, exitCode: Number.isInteger(exitCode) ? exitCode : undefined });
  const status = typeof error?.status === 'number' ? error.status : undefined;
  const kind = status ? 'http-rpc-rejection' : (Number.isInteger(exitCode) && exitCode !== 0 ? 'unknown' : 'unknown');
  return structuredFailure({ failureKind: kind, httpStatus: status, exitCode: Number.isInteger(exitCode) ? exitCode : undefined });
}

export function configCheck(key, probeResult) {
  if (probeResult.failure) return { check: key, state: 'unknown', diagnosticFailure: true, failure: probeResult.failure, reason: probeResult.failure.stderr };
  if (probeResult.error) return { check: key, state: 'unknown', diagnosticFailure: true, reason: 'Host getter could not be read.' };
  let value;
  try { value = JSON.parse(probeResult.stdout); } catch { return { check: key, state: 'unknown', diagnosticFailure: true, reason: 'Host getter returned invalid JSON.' }; }
  if (value.ok !== true || typeof value.data?.[key] !== 'boolean') return { check: key, state: 'unknown', diagnosticFailure: true, reason: 'Host getter did not return the expected boolean.' };
  return { check: key, state: value.data[key] ? 'pass' : 'blocked', reason: value.data[key] ? 'Flag is enabled; capability consent is a separate step.' : 'Flag is disabled. A human must review before enabling it.' };
}

function deploymentError(failureKind, stage, reason) {
  const error = new Error(reason);
  error.failureKind = failureKind;
  error.stage = stage;
  error.rpcOperation = 'none';
  return error;
}

export function checkDeployment(value, expected, now = Date.now()) {
  if (!value || value.kind !== 'PUBLIC_READ_ONLY_NO_WALLET') throw deploymentError('incomplete-observation', undefined, 'Unexpected public-check kind.');
  if (!['official-default', 'diagnostic-override'].includes(value.rpcSource)) throw deploymentError('incomplete-observation', 'rpc-configuration', 'Public probe did not identify its RPC source.');
  if (value.chainId !== expected.chainId) throw deploymentError('wrong-chain', 'chain-id', 'Public RPC returned the wrong chain.');
  const params = value.params;
  if (!Array.isArray(params) || params.length !== 7 || !Number.isSafeInteger(params[0]) || params[0] < 0 || !/^\d+$/.test(params[1]) || !Number.isSafeInteger(params[2]) || params[2] < 0 || !/^\d+$/.test(params[3]) || !/^\d+$/.test(params[4]) || !/^\d+$/.test(params[5]) || !/^\d+$/.test(params[6])) throw deploymentError('incomplete-observation', 'market-params', 'Public market-parameter observation was incomplete or malformed.');
  for (const [field,target,stage] of [['market','market','market-params'],['base','baseToken','base-token'],['quote','quoteToken','quote-token'],['custody','accountCore','custody']]) {
    if (typeof value[field] !== 'string' || value[field].toLowerCase() !== expected[target]) throw deploymentError('incomplete-observation', stage, `Deployment mismatch: ${field}.`);
  }
  for (const [field,target,stage] of [['implementationStorage','marketImplementation','market-implementation'],['accountImplementationStorage','accountImplementation','account-implementation']]) {
    if (typeof value[field] !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value[field]) || `0x${value[field].slice(-40).toLowerCase()}` !== expected[target]) throw deploymentError('wrong-proxy-implementation', stage, `Deployment mismatch: ${field}.`);
  }
  if (!Array.isArray(value.codePresent) || value.codePresent.length !== 4 || !value.codePresent.every(x=>x === true)) {
    const absent = Array.isArray(value.codePresent) ? value.codePresent.findIndex(x => x !== true) : -1;
    const stage = ['market-code', 'custody-code', 'market-implementation-code', 'account-implementation-code'][absent] ?? undefined;
    throw deploymentError('missing-bytecode', stage, 'Missing proxy or implementation code.');
  }
  if (typeof value.blockTimestamp !== 'string' || !/^\d+$/.test(value.blockTimestamp)) throw deploymentError('incomplete-observation', 'finalized-head', 'Invalid block timestamp.');
  const age = now - Number(value.blockTimestamp) * 1000;
  if (!Number.isSafeInteger(age)) throw deploymentError('incomplete-observation', 'finalized-head', 'Invalid finalized head timestamp.');
  if (age < 0) throw deploymentError('future-finalized-head', 'finalized-head', 'Finalized head timestamp is in the future.');
  if (age > 30000) throw deploymentError('stale-finalized-head', 'finalized-head', 'Finalized head is stale.');
  if (typeof value.blockNumber !== 'string' || !/^\d+$/.test(value.blockNumber) || !/^0x[0-9a-fA-F]{64}$/.test(value.blockHash)) throw deploymentError('incomplete-observation', 'finalized-head', 'Invalid finalized head identity.');
  return { check: 'public-deployment', state: 'pass', reason: 'Pinned pair, custody, both implementations and code agree at a fresh finalized block; market parameters were decoded. No owner was queried.', rpcSource: value.rpcSource, marketParamsCount: params.length, blockNumber: value.blockNumber, blockHash: value.blockHash };
}

export function summarize(checks) {
  return checks.length > 0 && checks.every(c=>c.state === 'pass') ? 'CHECKS_PASSED' : 'BLOCKED';
}

export function readinessExitCode(checks) {
  if (checks.some(c => c.diagnosticFailure === true)) return 1;
  return checks.length > 0 && checks.every(c => c.state === 'pass') ? 0 : 2;
}

export function parseProbeOutput(stdout) {
  try { return { observation: JSON.parse(stdout) }; }
  catch { return { failure: structuredFailure({ failureKind: 'malformed-json', exitCode: 0 }) }; }
}

async function probe(args, timeout = 15000) {
  const env = { ...process.env, MM_TELEMETRY_DISABLED: '1' };
  if (process.env.KURU_DIAGNOSTIC_RPC_URL) env.KURU_DIAGNOSTIC_RPC_URL = process.env.KURU_DIAGNOSTIC_RPC_URL;
  try {
    const result = await exec(process.execPath, args, { cwd: plugin, timeout, maxBuffer: 262144, env });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { failure: classifySubprocessFailure({ error, stderr: error.stderr, exitCode: error.code, timedOut: error.killed === true }) };
  }
}

export async function readiness({ publicChain = false, pluginRoot = plugin, runProbe = probe, nodeVersion = process.versions.node, readPackage = readFile, canAccess = access, deploymentConfig } = {}) {
  const checks = [];
  const report = { kind: 'LOCAL_READINESS_NO_AUTHORIZATION', checkedAt: new Date().toISOString(), checks, owner: null, realPrepare: 'NOT_RUN', walletAcceptance: 'NOT_RUN' };
  const [major,minor] = nodeVersion.split('.').map(Number);
  checks.push({ check: 'node', state: major > 22 || (major === 22 && minor >= 18) ? 'pass' : 'blocked', version: nodeVersion });
  let host;
  try {
    const pkg = JSON.parse(await readPackage(resolve(pluginRoot,'node_modules/@metamask/agent-wallet/package.json'),'utf8'));
    if (pkg.version !== '6.2.0') throw Error('Different host version');
    const hostBinary = resolve(pluginRoot,'node_modules/@metamask/agent-wallet/dist/index.js');
    await canAccess(hostBinary);
    host = hostBinary;
    checks.push({ check: 'host-package', state: 'pass', version: pkg.version });
  } catch { checks.push({ check: 'host-package', state: 'blocked', reason: 'Install the pinned dependencies in WSL: npm run install:plugin.' }); }
  try { await canAccess(resolve(pluginRoot,'dist/commands/kuru/prepare.js')); checks.push({check:'plugin-build',state:'pass'}); }
  catch { checks.push({check:'plugin-build',state:'blocked',reason:'Run npm run build:plugin in WSL after dependency installation.'}); }
  if (host) {
    for (const key of ['experimentalPlugins','experimentalAllowUnverifiedInstalls']) checks.push(configCheck(key,await runProbe([host,'config','get',key,'--json'])));
  }
  checks.push({check:'plugin-install-and-consent',state:'pending',reason:'A source build is not a consented host install. Human verifies mm kuru --help and mm kuru demo after directory installation.'});
  checks.push({check:'authenticated-host-chain',state:'pending',reason:'After wallet setup, human checks mm chains list --json includes 10143. This diagnostic does not log in.'});
  checks.push({check:'owner-account-readiness',state:'unknown',reason:'No owner supplied. Registration, custody funds, slots, hook, fees and native gas balance have not been read.'});
  if (publicChain) {
    try {
      const deployment = deploymentConfig ?? (await import(pathToFileURL(resolve(pluginRoot,'dist/domain.js')).href)).DEPLOYMENT;
      const result = await runProbe(['--experimental-strip-types',resolve(pluginRoot,'scripts/check-deployment.ts')],45000);
      if (result.failure) checks.push({check:'public-deployment',state:'unknown',diagnosticFailure:true,failure:result.failure,reason:result.failure.stderr});
      else {
        const parsed = parseProbeOutput(result.stdout);
        if (parsed.failure) checks.push({check:'public-deployment',state:'unknown',diagnosticFailure:true,failure:parsed.failure,reason:parsed.failure.stderr});
        else {
          try { checks.push(checkDeployment(parsed.observation,deployment)); }
          catch (error) { checks.push({check:'public-deployment',state:'blocked',diagnosticFailure:true,failure:structuredFailure({failureKind:error.failureKind,stage:error.stage,rpcOperation:error.rpcOperation}),reason:error.message}); }
        }
      }
    } catch (error) {
      checks.push({check:'public-deployment',state:'unknown',diagnosticFailure:true,failure:structuredFailure({failureKind:'unknown'}),reason:'Public deployment check could not load its pinned deployment configuration.'});
    }
  } else checks.push({check:'public-deployment',state:'unknown',reason:'Not requested. Use --public-chain for the fixed public RPC read-only probe.'});
  return { ...report, result: summarize(checks), exitCode: readinessExitCode(checks) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  if (flags.some(x=>x !== '--public-chain') || flags.length > 1) {
    console.error('Usage: node scripts/readiness.mjs [--public-chain]'); process.exitCode = 1;
  } else {
    try { const report=await readiness({publicChain:flags.includes('--public-chain')}); console.log(JSON.stringify(report,null,2)); process.exitCode=report.exitCode; }
    catch { console.error('Readiness diagnostic could not complete.'); process.exitCode=1; }
  }
}
