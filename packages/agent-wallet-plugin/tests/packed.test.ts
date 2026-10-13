import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeBookPayload,decodeTradePayload} from '../src/packed.ts';

// Public protocol fields are concatenated at their published byte widths.
// No SDK or production encoder contributes to expected values.
const book='0x00000000070385000061a800000000000000003b9aca0000000000000000580000000000000fa0';
const trade='0x00000000070315000061a8000000000000000017d78400000000000000005802000000000000000023c34600000fa0ff00000000000000000000000000000009';
test('independent book body decodes exact identity, amount and fee fields',()=>{
  assert.deepEqual(decodeBookPayload(book),[{makerId:7n,slotIdx:3,makerIsBuy:true,price:25000n,orderId:88n,makerFeePps:4000n,outcome:2,operationIndex:0,size:1000000000n,minSizeAfterBlock:0n,isLive:true,isSentinel:false}]);
});
test('independent trade body decodes match outcome and remainder',()=>{
  assert.deepEqual(decodeTradePayload(trade),[{makerId:7n,slotIdx:3,makerIsBuy:true,price:25000n,orderId:88n,makerFeePps:4000n,outcome:2,operationIndex:2,fillSize:400000000n,updatedSize:600000000n,tradeId:9n,makerIsPassive:false,matchEnd:true,replacementSlot:255}]);
});
test('body codecs reject non-hex, odd hex and partial records',()=>{
  for(const invalid of [null,1,{},'', '01','0x0','0xgg','0x01']) {
    assert.throws(()=>decodeBookPayload(invalid),/hex|length|record/i);
    assert.throws(()=>decodeTradePayload(invalid),/hex|length|record/i);
  }
  assert.deepEqual(decodeBookPayload('0x'),[]);
  assert.deepEqual(decodeTradePayload('0x'),[]);
});
