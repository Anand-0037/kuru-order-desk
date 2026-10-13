import {test} from 'node:test';import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,toHex} from 'viem';
import {abi} from '@toxicflow-labs/ts-sdk';
import {decodeMarketLogs} from '../src/decode.ts';
import {DEPLOYMENT} from '../src/domain.ts';
import {BLOCK_HASH,HASH,OWNER} from './fixtures.ts';

function rawBook(packed:`0x${string}`){return {address:DEPLOYMENT.market,blockNumber:101n,blockHash:BLOCK_HASH,transactionHash:HASH,transactionIndex:0,logIndex:0,removed:false,
 topics:encodeEventTopics({abi:abi.orderBookAbi,eventName:'BookUpdatesPacked',args:{accountId:7,executor:OWNER}}),
 data:encodeAbiParameters([{type:'bytes32'},{type:'bytes'}],[HASH as `0x${string}`,packed])};}

function validBookPayload():`0x${string}`{
 const word=(7n<<216n)|(3n<<208n)|(133n<<200n)|(25000n<<168n)|(1000000000n<<72n)|(88n<<8n);
 return `${toHex(word,{size:32})}${toHex(0,{size:4}).slice(2)}${toHex(4000,{size:3}).slice(2)}` as `0x${string}`;
}

test('documented packed decoder preserves a synthetic 39-byte receipt order identity',()=>{
 const [e]=decodeMarketLogs([rawBook(validBookPayload())]);
 assert.equal(e?.kind,'book');assert.equal(e?.orderId,'88');assert.equal(e?.makerId,'7');assert.equal(e?.clientOrderId,HASH);assert.equal(e?.side,'buy');
 if(e?.kind==='book'){assert.equal(e.size,'1000000000');assert.equal(e.outcome,2);assert.equal(e.live,true);assert.equal(e.sentinel,false);}
});
test('negative mined log positions are rejected by the decoder',()=>{
 const valid=rawBook(validBookPayload());
 assert.throws(()=>decodeMarketLogs([{...valid,transactionIndex:-1}]),/Unmined or incomplete/);
 assert.throws(()=>decodeMarketLogs([{...valid,logIndex:-1}]),/Unmined or incomplete/);
});
test('malformed expected event data and removed logs fail closed',()=>{
 assert.throws(()=>decodeMarketLogs([rawBook('0x01')]),/record|length|bytes|packed/i);
 assert.throws(()=>decodeMarketLogs([{...rawBook('0x'),removed:true}]),/Removed/);
 assert.deepEqual(decodeMarketLogs([{...rawBook('0x01'),address:OWNER}]),[]);
});
