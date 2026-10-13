import{test}from'node:test';import assert from'node:assert/strict';
import{presentIntent,presentStatus}from'../src/presentation.ts';import{prepareIntent}from'../src/planner.ts';import{reconcile}from'../src/evidence.ts';
import{input,snapshot,evidence,book,trade,NOW}from'./fixtures.ts';
test('review presents ordinary MON/USDC units beside exact immutable confirmation',()=>{
 const i=prepareIntent(input(),snapshot(),NOW),p=presentIntent(i);
 assert.equal(p.order,'Buy 1000 MON at a limit of 0.025 USDC/MON');assert.equal(p.funding,'25.01 USDC prefunded in AccountCore');assert.equal(p.confirmationDigest,i.digest);assert.equal(p.accountId,i.accountId);assert.match(p.fundingMeaning,/estimate/);
});
test('status clearly separates actual fills, open remainder and cancelled quantity',()=>{
 const i=prepareIntent(input(),snapshot(),NOW),s=reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:i.clientOrderId}),trade()]})),p=presentStatus(i,s);
 assert.equal(p.filled,'400 MON');assert.equal(p.open,'600 MON');assert.equal(p.cancelled,'0 MON');assert.equal(p.state,'partially-filled');
 const unknown=presentStatus(i,{...s,openQuantity:null,filledQuantity:null});assert.equal(unknown.open,'Unknown');assert.equal(unknown.filled,'Unknown');
 const provenance={schemaVersion:2 as const,chainId:10143,market:'0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9',intentOwner:i.owner,intentAccountId:i.accountId,submissionHash:'0x'+'a'.repeat(64),expectedSubmissionHash:'0x'+'a'.repeat(64),submissionHashMatches:true,receiptStatus:'success' as const,receiptBlock:'101',evidenceFromBlock:'101',evidenceToBlock:'105',finalizedHeadHash:'0x'+'b'.repeat(64),observedAtMs:NOW,requestMatches:true,finalized:true,complete:true,canonical:true};
 assert.deepEqual(presentStatus(i,{...s,reconciliationProvenance:provenance}).reconciliationProvenance,provenance);
});

test('cancellation review uses human MON units and its own confirmation digest',async()=>{
 const {presentCancel}=await import('../src/presentation.ts');
 const i=prepareIntent(input(),snapshot(),NOW),d='f'.repeat(64);
 const p=presentCancel(i,{digest:d,clientOrderId:`0x${d}`,orderId:'88',slot:3,quantity:'600000000',expiresAtMs:NOW+30000});
 assert.equal(p.remaining,'600 MON');assert.equal(p.confirmationDigest,d);assert.equal(p.mode,'REVIEW ONLY');assert.match(p.warning,/cannot.*undo|cannot.*reverse/i);
 const order=presentIntent(i);assert.equal(order.availableFunding,'1000 USDC free in AccountCore');assert.equal(order.makerFeeRate,'0.04% snapshot rate');
});
