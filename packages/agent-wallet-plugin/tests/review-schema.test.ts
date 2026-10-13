import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../src/store.ts';
import {digest,prepareIntent} from '../src/planner.ts';
import {input,snapshot,NOW,HASH} from './fixtures.ts';

function recordWithPreview(){
  const intent=prepareIntent(input(),snapshot(),NOW);
  const payload={intentDigest:intent.digest,orderId:'88',slot:3,quantity:intent.quantity,expiresAtMs:NOW+30_000};
  const d=digest(payload);
  return {version:1,intent,submission:{phase:'broadcast',hash:HASH,atMs:NOW},cancellation:{phase:'not-started'},
    cancelPreview:{digest:d,orderId:payload.orderId,slot:payload.slot,quantity:payload.quantity,expiresAtMs:payload.expiresAtMs,clientOrderId:`0x${d}`}};
}

test('review: a complete bound cancellation preview survives schema validation',()=>{
  const r=recordWithPreview();
  assert.deepEqual(validateRecord(r),r);
});

test('review: persisted cancellation preview requires a finite, valid expiry and complete schema',()=>{
  for(const value of [undefined,null,'tomorrow',Number.NaN,-1]){
    const r=recordWithPreview();
    assert.throws(()=>validateRecord({...r,cancelPreview:{...r.cancelPreview,expiresAtMs:value}}),(error:unknown)=>error instanceof Error,`expiry ${String(value)}`);
  }
  for(const change of [{slot:62},{slot:1.5},{quantity:'-1'},{orderId:'0'},{clientOrderId:'bad'},{digest:'bad'}]){
    const r=recordWithPreview();
    assert.throws(()=>validateRecord({...r,cancelPreview:{...r.cancelPreview,...change}}),(error:unknown)=>error instanceof Error,JSON.stringify(change));
  }
});

test('review: a persisted preview cannot silently change an approved field while retaining its digest',()=>{
  for(const change of [{expiresAtMs:NOW+60_000},{quantity:'999999999'},{orderId:'89'},{slot:4},{clientOrderId:`0x${'f'.repeat(64)}`}]){
    const r=recordWithPreview();
    assert.throws(()=>validateRecord({...r,cancelPreview:{...r.cancelPreview,...change}}),(error:unknown)=>error instanceof Error,JSON.stringify(change));
  }
});

test('review: a valid hash does not make an unsupported persisted intent version valid',()=>{
  const r=recordWithPreview();
  const original=Object.fromEntries(Object.entries(r.intent).filter(([key])=>!['id','digest','clientOrderId'].includes(key)));
  const payload={...original,version:99};
  const d=digest(payload);
  assert.throws(()=>validateRecord({...r,intent:{...payload,id:d,digest:d,clientOrderId:`0x${d}`},cancelPreview:undefined}));
});
