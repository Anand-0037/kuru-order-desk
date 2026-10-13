import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareIntent} from '../src/planner.ts';
import {buildOrderTransaction,buildCancelTransaction} from '../src/transactions.ts';
import {input,snapshot,NOW} from './fixtures.ts';

// Literal independent arithmetic checks: these expected values are not computed
// with production amount helpers or SDK encoders/decoders.
test('review: one-atom floor/ceiling and fee boundaries remain distinct',()=>{
  const i=prepareIntent(input({quantity:'400.000001'}),snapshot(),NOW);
  assert.equal(i.quantity,'400000001');
  assert.equal(i.quoteNotionalAtoms,'10000000');
  assert.equal(i.funding.estimatedMakerFeeQuoteAtoms,'4001');
  assert.equal(i.funding.requiredAtoms,'10004002');
  assert.equal(i.baseAtoms,'400000001000000000000');
  assert.throws(()=>prepareIntent(input({quantity:'399.999999'}),snapshot(),NOW),/notional/);
  assert.throws(()=>prepareIntent(input({quantity:'400.000001'}),snapshot({quoteFreeAtoms:'10004001'}),NOW),/balance/);
  assert.equal(prepareIntent(input({quantity:'400.000001'}),snapshot({quoteFreeAtoms:'10004002'}),NOW).funding.requiredAtoms,'10004002');
});

test('review: two-stage protocol floor is not accidentally replaced with single rational floor',()=>{
  const i=prepareIntent(input({price:'5.01',quantity:'1.999999'}),snapshot({priceScale:'100',minQuoteAtoms:'0'}),NOW);
  // 501 * 1,999,999 / 1,000,000 floors to 1,001; multiplied by 10,000
  // gives 10,010,000, while the conservative rational ceiling is 10,019,995.
  assert.equal(i.quoteNotionalAtoms,'10010000');
  assert.equal(i.funding.estimatedMakerFeeQuoteAtoms,'4008');
  assert.equal(i.funding.requiredAtoms,'10024003');
});

function word(value:bigint|number){return BigInt(value).toString(16).padStart(64,'0');}
// batch(uint40,(uint8,uint96,uint32,uint8,uint8,uint32)[],uint8[],bytes32)
// Selector and ABI layout are independently fixed here; no imported SDK ABI is
// used to decode the SDK's own output. This checks integration compatibility,
// not the deployed contract's behavior or bytecode.
const BATCH_SELECTOR='0x6947f147';

for(const side of ['buy','sell'] as const){
  test(`review: ${side} calldata equals an independently constructed ABI vector`,()=>{
    const i=prepareIntent(input({side}),snapshot(),NOW);
    const expected=BATCH_SELECTOR+
      [7,128,352].map(word).join('')+i.clientOrderId.slice(2)+
      [1,side==='buy'?0:1,1_000_000_000,25_000,0,1,0,0].map(word).join('');
    assert.equal(buildOrderTransaction(i).data,expected);
  });
}

test('review: cancellation calldata contains no orders, exactly one physical slot and no hidden extra arguments',()=>{
  const i=prepareIntent(input(),snapshot(),NOW),clientId=`0x${'f'.repeat(64)}` as const;
  const expected=BATCH_SELECTOR+[7,128,160].map(word).join('')+clientId.slice(2)+[0,1,3].map(word).join('');
  assert.equal(buildCancelTransaction(i,3,clientId).data,expected);
});
