import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OrderService,type ChainReader,type Executor} from '../src/service.ts';
import {IntentStore} from '../src/store.ts';
import type {PreparedIntent} from '../src/domain.ts';
import type {OrderEvidence} from '../src/evidence.ts';
import {input,snapshot,evidence,book,trade,NOW,OWNER,HASH,CANCEL_HASH} from './fixtures.ts';
class FixtureChain implements ChainReader{
 snapshotChange:Record<string,unknown>={};evidenceChange:Record<string,unknown>={};simulationFailure=false;
 async snapshot(){return snapshot(this.snapshotChange);}
 async evidence(i:PreparedIntent){return evidence(i.clientOrderId,this.evidenceChange) as OrderEvidence;}
 async simulate(){if(this.simulationFailure)throw new Error('Simulation reverted');}
}
async function setup(executor?:Executor){const store=new IntentStore(await mkdtemp(join(tmpdir(),'kuru-service-'))),chain=new FixtureChain();let calls=0;const exec:Executor=executor??(async()=>{calls++;chain.snapshotChange={slots:Array.from({length:62},(_,n)=>calls===1&&n===3?'88':'0')};return {hash:calls===1?HASH:CANCEL_HASH};});return {store,chain,get calls(){return calls;},service:new OrderService(store,chain,exec,()=>NOW),exec};}

test('prepare and duplicate submit persist one broadcast through supplied wallet executor',async()=>{
 const f=await setup(),i=await f.service.prepare(input());
 const one=await f.service.submit(i.id,i.digest,true,OWNER);await f.service.submit(i.id,i.digest,true,OWNER);
 const status=await f.service.status(i.id);
 assert.equal(f.calls,1);assert.equal(one.submission.hash,HASH);assert.equal(status.state,'open');
 assert.deepEqual(status.reconciliationProvenance,{schemaVersion:2,chainId:10143,market:'0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9',intentOwner:OWNER,intentAccountId:'7',submissionHash:HASH,expectedSubmissionHash:HASH,submissionHashMatches:true,receiptStatus:'success',receiptBlock:'101',evidenceFromBlock:'101',evidenceToBlock:'105',finalizedHeadHash:'0x'+'b'.repeat(64),observedAtMs:NOW,requestMatches:true,finalized:true,complete:true,canonical:true});
});
test('status refuses provenance whose observed submission hash differs from the persisted transaction',async()=>{
 const f=await setup(),i=await f.service.prepare(input());await f.service.submit(i.id,i.digest,true,OWNER);
 f.chain.evidenceChange={submissionHash:CANCEL_HASH};
 const status=await f.service.status(i.id),provenance=status.reconciliationProvenance!;
 assert.equal(status.state,'needs-review');
 assert.match(status.reasons[0]!,/does not match persisted transaction/);
 assert.equal(provenance.submissionHash,CANCEL_HASH);
 assert.equal(provenance.expectedSubmissionHash,HASH);
 assert.equal(provenance.submissionHashMatches,false);
 assert.equal(provenance.requestMatches,true);
});
test('status canonicalizes equivalent transaction hash casing in provenance',async()=>{
 const f=await setup(),i=await f.service.prepare(input());await f.service.submit(i.id,i.digest,true,OWNER);
 f.chain.evidenceChange={submissionHash:`0x${HASH.slice(2).toUpperCase()}`};
 const status=await f.service.status(i.id),provenance=status.reconciliationProvenance!;
 assert.equal(status.state,'open');
 assert.equal(provenance.submissionHash,HASH);
 assert.equal(provenance.expectedSubmissionHash,HASH);
 assert.equal(provenance.submissionHashMatches,true);
});
test('wrong confirmation, owner, stale snapshot, changed fee and missing exclusive declaration never invoke executor',async()=>{
 const f=await setup(),i=await f.service.prepare(input());
 await assert.rejects(()=>f.service.submit(i.id,'bad',true,OWNER),/confirmation/);
 await assert.rejects(()=>f.service.submit(i.id,i.digest,false,OWNER),/exclusive/);
 await assert.rejects(()=>f.service.submit(i.id,i.digest,true,'0x2222222222222222222222222222222222222222'),/wallet/);
 for(const change of [{makerFeePps:'5000'},{observedAtMs:NOW-30001}]){f.chain.snapshotChange=change;await assert.rejects(()=>f.service.submit(i.id,i.digest,true,OWNER));}
 assert.equal(f.calls,0);assert.equal((await f.store.read(i.id)).submission.phase,'not-started');
});
test('simulation failure occurs before durable executor barrier',async()=>{
 const f=await setup(),i=await f.service.prepare(input());f.chain.simulationFailure=true;
 await assert.rejects(()=>f.service.submit(i.id,i.digest,true,OWNER),/Simulation/);
 assert.equal((await f.store.read(i.id)).submission.phase,'not-started');assert.equal(f.calls,0);
});
test('ambiguous executor timeout survives restart and never resubmits',async()=>{
 let calls=0;const exec:Executor=async()=>{calls++;throw new Error('Connection lost after submit');};
 const f=await setup(exec),i=await f.service.prepare(input());
 await assert.rejects(()=>f.service.submit(i.id,i.digest,true,OWNER),/unknown/);
 const restart=new OrderService(new IntentStore(f.store.directory),f.chain,exec,()=>NOW);
 await assert.rejects(()=>restart.submit(i.id,i.digest,true,OWNER),/unknown|started/);
 assert.equal(calls,1);assert.equal((await restart.status(i.id)).state,'needs-review');
});
test('known transaction reconciles after restart without signing again',async()=>{
 const f=await setup(),i=await f.service.prepare(input());await f.service.submit(i.id,i.digest,true,OWNER);
 const restart=new OrderService(new IntentStore(f.store.directory),f.chain,async()=>{throw new Error('Must not execute');},()=>NOW);
 assert.equal((await restart.status(i.id)).state,'open');
});
test('cancel preview binds remainder and duplicate cancel sends only once',async()=>{
 const f=await setup(),i=await f.service.prepare(input());await f.service.submit(i.id,i.digest,true,OWNER);
 const preview=await f.service.previewCancel(i.id);await f.service.cancel(i.id,preview.digest,true,OWNER);await f.service.cancel(i.id,preview.digest,true,OWNER);
 assert.equal(f.calls,2);assert.equal((await f.store.read(i.id)).cancellation.hash,CANCEL_HASH);
});
test('fill racing cancellation preview requires a new review instead of sending stale remainder',async()=>{
 const f=await setup(),i=await f.service.prepare(input());await f.service.submit(i.id,i.digest,true,OWNER);const preview=await f.service.previewCancel(i.id);
 f.chain.evidenceChange={events:[book({clientOrderId:i.clientOrderId}),trade()]};
 await assert.rejects(()=>f.service.cancel(i.id,preview.digest,true,OWNER),/changed/);assert.equal(f.calls,1);
});
test('a second active intent for the same owner cannot be prepared',async()=>{
 const f=await setup();await f.service.prepare(input());await assert.rejects(()=>f.service.prepare(input({price:'0.026'})),/active intent/);
});
test('pending or hashless wallet result becomes unknown instead of success',async()=>{
 const f=await setup(async()=>({status:'AWAITING_MFA'})),i=await f.service.prepare(input());
 await assert.rejects(()=>f.service.submit(i.id,i.digest,true,OWNER),/unknown/);assert.equal((await f.store.read(i.id)).submission.phase,'unknown');
});

test('host authorization summary repeats human MON and USDC units for order and cancellation',async()=>{
 const summaries:string[]=[];
 const f=await setup(async(_tx,summary)=>{summaries.push(summary);return{hash:summaries.length===1?HASH:CANCEL_HASH};});
 const i=await f.service.prepare(input());await f.service.submit(i.id,i.digest,true,OWNER);
 assert.match(summaries[0]!,/1000 MON/);assert.match(summaries[0]!,/0\.025 USDC\/MON/);assert.doesNotMatch(summaries[0]!,/size units|price units/);
 f.chain.snapshotChange={slots:Array.from({length:62},(_,n)=>n===3?'88':'0')};
 f.chain.evidenceChange={events:[book({clientOrderId:i.clientOrderId}),trade()]};
 const p=await f.service.previewCancel(i.id);await f.service.cancel(i.id,p.digest,true,OWNER);assert.match(summaries[1]!,/600 MON/);
});
