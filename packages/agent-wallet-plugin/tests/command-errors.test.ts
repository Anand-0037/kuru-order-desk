import{test}from'node:test';import assert from'node:assert/strict';import{CommandError}from'@metamask/agent-wallet/plugin';import{withCommandErrors}from'../src/command-errors.ts';
test('guarded CLI error keeps the actual blocker with an actionable stop hint',async()=>{
 await assert.rejects(()=>withCommandErrors(async()=>{throw new Error('Tracked slot identity changed');}),(error:unknown)=>error instanceof CommandError&&error.code==='KURU_ACTION_STOPPED'&&error.message==='Tracked slot identity changed'&&/do not retry/i.test(error.hint));
});
test('unexpected RPC diagnostic details are not copied into user output',async()=>{
 await assert.rejects(()=>withCommandErrors(async()=>{throw new Error('RPC failed at https://gateway.example/secret\nAuthorization: private-data');}),(error:unknown)=>error instanceof CommandError&&!error.message.includes('secret')&&!error.message.includes('Authorization'));
});
