import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OrderService,type ChainReader} from '../src/service.ts';
import {IntentStore} from '../src/store.ts';
import type {OrderEvidence} from '../src/evidence.ts';
import {input,snapshot,evidence,book,NOW,HASH,OWNER,CANCEL_HASH} from './fixtures.ts';

test('review: a one-slot cancellation cannot be confirmed by another operation index',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kuru-review-cancel-action-'));
  try{
    let calls=0;
    const observed:{events:unknown[]|undefined}={events:undefined};
    const chain:ChainReader={
      snapshot:async()=>snapshot({slots:Array.from({length:62},(_,n)=>calls===1&&n===3?'88':'0')}),
      evidence:async(i)=>evidence(i.clientOrderId,observed.events?{events:observed.events,slots:Array(62).fill('0')}:{}) as OrderEvidence,
      simulate:async()=>{},transactionOutcome:async()=>'success',
    };
    const service=new OrderService(new IntentStore(directory),chain,async()=>{calls++;return {hash:calls===1?HASH:CANCEL_HASH};},()=>NOW);
    const intent=await service.prepare(input());
    await service.submit(intent.id,intent.digest,true,OWNER);
    const preview=await service.previewCancel(intent.id);
    await service.cancel(intent.id,preview.digest,true,OWNER);
    observed.events=[book({clientOrderId:intent.clientOrderId}),book({blockNumber:'103',transactionHash:CANCEL_HASH,clientOrderId:preview.clientOrderId,live:false,outcome:7,operationIndex:1})];
    const status=await service.status(intent.id);
    assert.equal(status.cancellation?.confirmedByTrackedDeletion,false);
  }finally{await rm(directory,{recursive:true,force:true});}
});
