import{test}from'node:test';import assert from'node:assert/strict';import{runDemo}from'../src/demo.ts';
test('offline demo exercises partial fill, cancellation, restart and repeated calls without RPC',async()=>{
 const r=await runDemo();assert.equal(r.mode,'OFFLINE FIXTURE · NO LIVE TRANSACTIONS');assert.equal(r.executorCalls,2);assert.equal(r.final.filled,'400 MON');assert.equal(r.final.cancelled,'600 MON');assert.equal(r.final.open,'0 MON');assert.equal(r.final.cancellationRequest?.confirmedByTrackedDeletion,true);assert.equal(r.restart.state,'partially-filled-cancelled');assert.ok(r.steps.length>=6);
});
