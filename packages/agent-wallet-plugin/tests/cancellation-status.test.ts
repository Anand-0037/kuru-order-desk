import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{OrderService,type ChainReader}from'../src/service.ts';import{IntentStore}from'../src/store.ts';import type{OrderEvidence}from'../src/evidence.ts';import{input,snapshot,evidence,book,NOW,HASH,OWNER,CANCEL_HASH}from'./fixtures.ts';
async function setup(){
 const store=new IntentStore(await mkdtemp(join(tmpdir(),'kuru-cancel-status-')));let calls=0;let events:unknown[]|undefined;let receipt:'success'|'pending'|'reverted'='pending';
 const chain:ChainReader={snapshot:async()=>snapshot({slots:Array.from({length:62},(_,n)=>calls===1&&n===3?'88':'0')}),evidence:async(i)=>evidence(i.clientOrderId,events?{events,slots:Array(62).fill('0')}:{})as OrderEvidence,simulate:async()=>{},transactionOutcome:async()=>receipt};
 const service=new OrderService(store,chain,async()=>{calls++;return{hash:calls===1?HASH:CANCEL_HASH};},()=>NOW),i=await service.prepare(input());await service.submit(i.id,i.digest,true,OWNER);const preview=await service.previewCancel(i.id);await service.cancel(i.id,preview.digest,true,OWNER);
 return{service,i,preview,setEvents:(e:unknown[])=>{events=e;},setReceipt:(s:typeof receipt)=>{receipt=s;}};
}
test('own cancellation remains pending even if another cancellation removed the order',async()=>{
 const f=await setup();f.setEvents([book({clientOrderId:f.i.clientOrderId}),book({blockNumber:'103',transactionHash:`0x${'f'.repeat(64)}`,clientOrderId:`0x${'e'.repeat(64)}`,live:false,outcome:7})]);
 const s=await f.service.status(f.i.id);assert.equal(s.state,'cancelled');assert.equal(s.cancellation?.receiptState,'pending');assert.equal(s.cancellation?.confirmedByTrackedDeletion,false);
});
test('own cancellation success requires matching receipt and exact action-bound deletion',async()=>{
 const f=await setup();f.setReceipt('success');f.setEvents([book({clientOrderId:f.i.clientOrderId}),book({blockNumber:'103',transactionHash:CANCEL_HASH,clientOrderId:f.preview.clientOrderId,live:false,outcome:7})]);
 const s=await f.service.status(f.i.id);assert.equal(s.cancellation?.receiptState,'success');assert.equal(s.cancellation?.confirmedByTrackedDeletion,true);
});
