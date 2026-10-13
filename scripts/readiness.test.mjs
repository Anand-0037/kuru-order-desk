import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configCheck, checkDeployment, summarize, readinessExitCode, readiness, classifySubprocessFailure, parseProbeOutput } from './readiness.mjs';

const addr=c=>'0x'+c.repeat(40), slot=a=>'0x'+'0'.repeat(24)+a.slice(2);
const expected={chainId:10143,market:addr('1'),baseToken:addr('0'),quoteToken:addr('2'),accountCore:addr('3'),marketImplementation:addr('4'),accountImplementation:addr('5')};
const now=1791000000000;
const observation={kind:'PUBLIC_READ_ONLY_NO_WALLET',rpcSource:'official-default',chainId:10143,market:expected.market,base:expected.baseToken,quote:expected.quoteToken,custody:expected.accountCore,params:[1000000,'1000000',1,'10000000','5000000000000','7000','4000'],implementationStorage:slot(expected.marketImplementation),accountImplementationStorage:slot(expected.accountImplementation),codePresent:[true,true,true,true],blockTimestamp:String(now/1000),blockNumber:'123',blockHash:'0x'+'6'.repeat(64)};

function injectedReadiness({ packageJson = '{"version":"6.2.0"}', missingPackage = false, missingBuild = false, missingHostBinary = false, publicChain = false, deploymentConfig = expected, runProbe = async () => ({stdout:'{"ok":true,"data":{"experimentalPlugins":false,"experimentalAllowUnverifiedInstalls":false}}'}) } = {}) {
  return readiness({
    pluginRoot: 'C:/fake/plugin',
    nodeVersion: '22.18.0',
    publicChain,
    deploymentConfig,
    readPackage: async () => { if (missingPackage) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return packageJson; },
    canAccess: async path => { if ((missingBuild && /dist[\\/]commands[\\/]kuru[\\/]prepare\.js$/.test(path)) || (missingHostBinary && /@metamask[\\/]agent-wallet[\\/]dist[\\/]index\.js$/.test(path))) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    runProbe
  });
}

test('missing package, wrong pinned version, and missing build are human blockers',async()=>{
  const missing=await injectedReadiness({missingPackage:true});
  assert.equal(missing.checks.find(c=>c.check==='host-package').state,'blocked');
  assert.equal(missing.exitCode,2);
  const wrong=await injectedReadiness({packageJson:'{"version":"6.3.0"}'});
  assert.equal(wrong.checks.find(c=>c.check==='host-package').state,'blocked');
  const noBuild=await injectedReadiness({missingBuild:true});
  assert.equal(noBuild.checks.find(c=>c.check==='plugin-build').state,'blocked');
  const noBinary=await injectedReadiness({missingHostBinary:true});
  assert.equal(noBinary.checks.find(c=>c.check==='host-package').state,'blocked');
  assert.equal(noBinary.checks.some(c=>c.check==='experimentalPlugins'),false);
});

test('config getter failures and malformed results are diagnostic failures; disabled flags are blockers',()=>{
  const key='experimentalPlugins';
  assert.equal(configCheck(key,{error:true}).diagnosticFailure,true);
  assert.equal(configCheck(key,{stdout:'{' }).diagnosticFailure,true);
  assert.equal(configCheck(key,{stdout:JSON.stringify({ok:true,data:{[key]:false}})}).state,'blocked');
  assert.equal(configCheck('experimentalAllowUnverifiedInstalls',{stdout:JSON.stringify({ok:true,data:{experimentalAllowUnverifiedInstalls:false}})}).state,'blocked');
  assert.equal(configCheck(key,{stdout:JSON.stringify({ok:true,data:{[key]:true}})}).state,'pass');
  const getterFailure={failure:{failureKind:'timeout',timedOut:true,stderr:'Public RPC request timed out.'}};
  assert.equal(configCheck(key,getterFailure).failure.failureKind,'timeout');
  assert.equal(configCheck(key,{stdout:'{}'}).state,'unknown');
});

test('an unreadable config getter preserves its structured subprocess failure in readiness',async()=>{
  let calls=0;
  const report=await injectedReadiness({runProbe:async()=>++calls===1
    ? {failure:{failureKind:'timeout',timedOut:true,exitCode:1,stderr:'Host getter timed out.'}}
    : {stdout:'{"ok":true,"data":{"experimentalAllowUnverifiedInstalls":true}}'}});
  const getter=report.checks.find(c=>c.check==='experimentalPlugins');
  assert.equal(getter.state,'unknown');
  assert.equal(getter.failure.failureKind,'timeout');
  assert.equal(report.exitCode,1);
});

test('subprocess timeout and structured public-probe diagnostics are classified without leaking raw stderr',()=>{
  const timeout=classifySubprocessFailure({error:Object.assign(new Error('timed out'),{code:'ETIMEDOUT',killed:true}),timedOut:true});
  assert.equal(timeout.failureKind,'timeout');
  assert.equal(timeout.timedOut,true);
  const diagnostic=classifySubprocessFailure({error:Object.assign(new Error('exit'),{code:1}),stderr:JSON.stringify({kind:'PUBLIC_READ_ONLY_FAILURE',failureKind:'network',stage:'finalized-head',rpcOperation:'eth_getBlockByNumber',causeCode:'EAI_AGAIN',message:'https://secret.example/token'})});
  assert.deepEqual({kind:diagnostic.failureKind,stage:diagnostic.stage,operation:diagnostic.rpcOperation,cause:diagnostic.causeCode},{kind:'network',stage:'finalized-head',operation:'eth_getBlockByNumber',cause:'EAI_AGAIN'});
  assert.equal(diagnostic.stderr.includes('secret'),false);
  assert.equal(diagnostic.exitCode,1);
  assert.equal(classifySubprocessFailure({stderr:JSON.stringify({kind:'PUBLIC_READ_ONLY_FAILURE',failureKind:'http-rpc-rejection',stage:'chain-id',rpcOperation:'eth_chainId',httpStatus:429})}).failureKind,'http-rpc-rejection');
  assert.equal(classifySubprocessFailure({stderr:JSON.stringify({kind:'PUBLIC_READ_ONLY_FAILURE',failureKind:'contract-call-decode',stage:'market-params',rpcOperation:'eth_call',rpcCode:-32000})}).failureKind,'contract-call-decode');
});

test('invalid probe JSON and malformed/unknown public failure fields are sanitized',()=>{
  assert.equal(parseProbeOutput('{bad').failure.failureKind,'malformed-json');
  const safe=classifySubprocessFailure({stderr:JSON.stringify({kind:'PUBLIC_READ_ONLY_FAILURE',failureKind:'wrong-chain',stage:'evil-path',rpcOperation:'https://secret',message:'leak'})});
  assert.equal(safe.failureKind,'wrong-chain');
  assert.equal(safe.stage,undefined);
  assert.equal(safe.rpcOperation,'none');
  assert.equal(safe.stderr.includes('leak'),false);
});

test('deployment validation distinguishes wrong chain, implementation, missing code, and finalized-head failures',()=>{
  assert.equal(checkDeployment(observation,expected,now).state,'pass');
  const cases=[
    [{chainId:1},'wrong-chain','chain-id'],
    [{rpcSource:undefined},'incomplete-observation','rpc-configuration'],
    [{rpcSource:'untrusted',params:undefined},'incomplete-observation','rpc-configuration'],
    [{params:[]},'incomplete-observation','market-params'],
    [{params:[1000000,'1000000',1,'10000000','5000000000000','7000']},'incomplete-observation','market-params'],
    [{params:[1000000,'1000000',1,'bad','5000000000000','7000','4000']},'incomplete-observation','market-params'],
    [{implementationStorage:slot(addr('8'))},'wrong-proxy-implementation','market-implementation'],
    [{accountImplementationStorage:slot(addr('8'))},'wrong-proxy-implementation','account-implementation'],
    [{codePresent:[false,true,true,true]},'missing-bytecode','market-code'],
    [{codePresent:[true,false,true,true]},'missing-bytecode','custody-code'],
    [{codePresent:[true,true,false,true]},'missing-bytecode','market-implementation-code'],
    [{codePresent:[true,true,true,false]},'missing-bytecode','account-implementation-code'],
    [{blockTimestamp:String(now/1000-31)},'stale-finalized-head','finalized-head'],
    [{blockTimestamp:String(now/1000+1)},'future-finalized-head','finalized-head']
  ];
  for(const [changes,kind,stage] of cases) assert.throws(()=>checkDeployment({...observation,...changes},expected,now),error=>error.failureKind===kind&&error.stage===stage);
  assert.throws(()=>checkDeployment({...observation,accountImplementationStorage:undefined},expected,now));
  assert.throws(()=>checkDeployment({...observation,blockHash:undefined},expected,now),error=>error.stage==='finalized-head');
  assert.throws(()=>checkDeployment({...observation,kind:undefined},expected,now),error=>error.failureKind==='incomplete-observation');
});

test('readiness never reports success while any prerequisite is pending or unknown',async()=>{
  assert.equal(summarize([]),'BLOCKED');
  assert.equal(summarize([{state:'pass'},{state:'pending'}]),'BLOCKED');
  assert.equal(summarize([{state:'unknown'}]),'BLOCKED');
  assert.equal(readinessExitCode([]),2);
  assert.equal(readinessExitCode([{state:'pass'},{state:'unknown'}]),2);
  assert.equal(readinessExitCode([{state:'blocked',diagnosticFailure:true}]),1);
  const report=await injectedReadiness();
  assert.equal(report.result,'BLOCKED');
  assert.equal(report.exitCode,2);
  assert.equal(report.realPrepare,'NOT_RUN');
});

test('a public probe failure preserves its sanitized root cause and forces diagnostic exit 1',async()=>{
  let calls=0;
  const report=await injectedReadiness({
    publicChain:true,
    runProbe:async()=>++calls<=2
      ? {stdout:'{"ok":true,"data":{"experimentalPlugins":false,"experimentalAllowUnverifiedInstalls":false}}'}
      : {failure:{failureKind:'network',stage:'chain-id',rpcOperation:'eth_chainId',causeCode:'ETIMEDOUT',timedOut:true,exitCode:1,stderr:'Public RPC request timed out.'}},
  });
  const publicCheck=report.checks.find(c=>c.check==='public-deployment');
  assert.equal(report.exitCode,1);
  assert.equal(publicCheck.failure.failureKind,'network');
  assert.equal(publicCheck.failure.rpcOperation,'eth_chainId');
  assert.equal(publicCheck.diagnosticFailure,true);
});
