import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OrderService,type ChainReader,type Executor} from '../src/service.ts';
import {IntentStore} from '../src/store.ts';
import type {PreparedIntent} from '../src/domain.ts';
import type {OrderEvidence} from '../src/evidence.ts';
import {input,snapshot,evidence,book,trade,NOW,OWNER,HASH,CANCEL_HASH} from './fixtures.ts';

// These local-only scenarios challenge owner reuse while a cancel-by-slot can
// still be in flight. No provider, wallet, signing key, or chain is involved.
class ReviewChain implements ChainReader {
  live=false;
  filled=false;
  async snapshot(){return snapshot({slots:Array.from({length:62},(_,n)=>this.live&&n===3?'88':'0')});}
  async evidence(i:PreparedIntent):Promise<OrderEvidence>{
    return evidence(i.clientOrderId,this.filled?{
      events:[book({clientOrderId:i.clientOrderId}),trade({fillSize:i.quantity,updatedSize:'0'})],
      slots:Array(62).fill('0'),
    }:{}) as OrderEvidence;
  }
  async simulate(){}
  async transactionOutcome(){return 'pending' as const;}
}

for(const outcome of ['unknown','broadcast'] as const){
  test(`review: ${outcome} cancellation still blocks owner reuse after original fills and restart`,async()=>{
    const directory=await mkdtemp(join(tmpdir(),'kuru-review-barrier-'));
    try{
      const chain=new ReviewChain();let calls=0;
      const executor:Executor=async()=>{
        calls++;
        if(calls===1){chain.live=true;return {hash:HASH};}
        if(outcome==='unknown')throw new Error('Transport closed after cancellation executor entry');
        return {hash:CANCEL_HASH};
      };
      const service=new OrderService(new IntentStore(directory),chain,executor,()=>NOW);
      const intent=await service.prepare(input());
      await service.submit(intent.id,intent.digest,true,OWNER);
      const preview=await service.previewCancel(intent.id);
      if(outcome==='unknown')await assert.rejects(()=>service.cancel(intent.id,preview.digest,true,OWNER),/unknown/);
      else await service.cancel(intent.id,preview.digest,true,OWNER);
      chain.filled=true;chain.live=false;
      const restart=new OrderService(new IntentStore(directory),chain,executor,()=>NOW);
      assert.equal((await restart.status(intent.id)).state,'filled');
      await assert.rejects(()=>restart.prepare(input({price:'0.026'})),/cancellation|active intent|unresolved/i);
      assert.equal(calls,2,'Owner reuse must not cause any additional executor call');
    }finally{await rm(directory,{recursive:true,force:true});}
  });
}

test('review: executor sees a persisted started barrier through an independent store object',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kuru-review-before-entry-'));
  try{
    const chain=new ReviewChain();let id='';let calls=0;
    const executor:Executor=async()=>{
      calls++;
      const persisted=await new IntentStore(directory).read(id);
      assert.equal(persisted.submission.phase,'started');
      assert.equal(persisted.intent.id,id);
      return {hash:HASH};
    };
    const service=new OrderService(new IntentStore(directory),chain,executor,()=>NOW);
    const intent=await service.prepare(input());id=intent.id;
    await service.submit(intent.id,intent.digest,true,OWNER);
    assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
