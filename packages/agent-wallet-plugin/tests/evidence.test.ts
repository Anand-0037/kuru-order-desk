import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareIntent} from '../src/planner.ts';
import {reconcile} from '../src/evidence.ts';
import {snapshot,input,NOW,evidence,book,trade,HASH,CANCEL_HASH} from './fixtures.ts';
const p=()=>prepareIntent(input(),snapshot(),NOW);

test('successful receipt plus matching live event establishes an open order',()=>{
 const i=p(),s=reconcile(i,evidence(i.clientOrderId));
 assert.equal(s.state,'open'); assert.equal(s.openQuantity,'1000000000'); assert.equal(s.filledQuantity,'0'); assert.equal(s.orderId,'88'); assert.equal(s.slot,3);
});
test('maker fill in another trader header is counted exactly once',()=>{
 const i=p(),b=book({clientOrderId:i.clientOrderId}),t=trade();
 const s=reconcile(i,evidence(i.clientOrderId,{events:[t,b,t]}));
 assert.equal(s.state,'partially-filled'); assert.equal(s.filledQuantity,'400000000'); assert.equal(s.openQuantity,'600000000');
});
test('cancel race retains fills and counts only the exact deleted remainder',()=>{
 const i=p(),s=reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:i.clientOrderId}),trade(),book({blockNumber:'103',transactionHash:CANCEL_HASH,clientOrderId:`0x${'f'.repeat(64)}`,size:'600000000',live:false,outcome:7})],slots:Array(62).fill('0')}));
 assert.equal(s.state,'partially-filled-cancelled'); assert.equal(s.filledQuantity,'400000000'); assert.equal(s.cancelledQuantity,'600000000'); assert.equal(s.openQuantity,'0');
});
test('full fill before cancel stays filled without a delete log',()=>{
 const i=p(),s=reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:i.clientOrderId}),trade({fillSize:'1000000000',updatedSize:'0'})],slots:Array(62).fill('0')}));
 assert.equal(s.state,'filled'); assert.equal(s.filledQuantity,'1000000000'); assert.equal(s.cancelledQuantity,'0');
});
test('post-only skipped is different from filled and requires its sentinel',()=>{
 const i=p(),s=reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:i.clientOrderId,makerId:'0',orderId:'0',slot:255,price:'0',size:'0',live:false,sentinel:true,outcome:6})],slots:Array(62).fill('0')}));
 assert.equal(s.state,'not-placed'); assert.equal(s.filledQuantity,'0');
});
test('missing, stale, incomplete, unfinalized or conflicting evidence is never promoted to completion',()=>{
 const i=p();
 for(const change of [{events:[]},{slots:Array(62).fill('0')},{complete:false},{canonical:false},{finalized:false},{requestMatches:false},{fromBlock:'102'},{chainId:1},{events:[book({clientOrderId:i.clientOrderId}),trade(),trade({fillSize:'1'})]}]){
  const s=reconcile(i,evidence(i.clientOrderId,change)); assert.ok(['needs-review','unconfirmed'].includes(s.state),JSON.stringify(change)); assert.equal(s.openQuantity,null);
 }
});
test('slot reuse and overfill do not produce false cancellation or negative amounts',()=>{
 const i=p();
 for(const change of [{slots:Array.from({length:62},(_,n)=>n===3?'99':'0')},{events:[book({clientOrderId:i.clientOrderId}),trade({fillSize:'1000000001',updatedSize:'0'})]},{events:[book({clientOrderId:i.clientOrderId}),book({transactionHash:CANCEL_HASH,blockNumber:'103',live:false,size:'1',outcome:7})],slots:Array(62).fill('0')}]) assert.equal(reconcile(i,evidence(i.clientOrderId,change)).state,'needs-review');
});
test('unrelated owner, order or market cannot provide this order evidence',()=>{
 const i=p(),s=reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:i.clientOrderId}),trade({makerId:'8'}),trade({orderId:'99',tradeId:'124',recordIndex:1}),trade({market:'0x0000000000000000000000000000000000000001'})]}));
 assert.equal(s.filledQuantity,'0'); assert.equal(s.state,'open');
});
test('unexpected post-only taker flow and wrong receipt action are refused',()=>{
 const i=p();
 assert.equal(reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:i.clientOrderId}),trade({transactionHash:HASH,clientOrderId:i.clientOrderId,actionAccountId:'7'})]})).state,'needs-review');
 assert.equal(reconcile(i,evidence(i.clientOrderId,{events:[book({clientOrderId:`0x${'f'.repeat(64)}`})]})).state,'needs-review');
});
