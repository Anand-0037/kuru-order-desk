import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData} from 'viem';
import {abi} from '@toxicflow-labs/ts-sdk';
import {prepareIntent} from '../src/planner.ts';
import {buildOrderTransaction,buildCancelTransaction} from '../src/transactions.ts';
import {DEPLOYMENT} from '../src/domain.ts';
import {input,snapshot,NOW} from './fixtures.ts';

test('order calldata round trips to one fixed-market post-only batch with unique client ID',()=>{
 const i=prepareIntent(input(),snapshot(),NOW),tx=buildOrderTransaction(i);
 assert.equal(tx.chainId,10143);assert.equal(tx.to,DEPLOYMENT.market);assert.equal(tx.from,i.owner);assert.equal(tx.value,'0x0');
 const decoded=decodeFunctionData({abi:abi.orderBookAbi,data:tx.data});
 assert.equal(decoded.functionName,'batch');assert.deepEqual(decoded.args,[7,[{side:0,quantity:1000000000n,price:25000,tif:0,executionInstruction:1,minSizeAfterBlock:0}],[],i.clientOrderId]);
});
test('cancel transaction can only address one validated slot in the fixed market',()=>{
 const i=prepareIntent(input(),snapshot(),NOW),clientId=`0x${'f'.repeat(64)}` as const,tx=buildCancelTransaction(i,3,clientId);
 const decoded=decodeFunctionData({abi:abi.orderBookAbi,data:tx.data});
 assert.equal(tx.to,DEPLOYMENT.market);assert.equal(decoded.functionName,'batch');assert.deepEqual(decoded.args,[7,[],[3],clientId]);
 for(const slot of [-1,62,1.5])assert.throws(()=>buildCancelTransaction(i,slot,clientId));
 assert.throws(()=>buildOrderTransaction({...i,market:'0x1111111111111111111111111111111111111111'}));
});
