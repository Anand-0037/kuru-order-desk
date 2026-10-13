import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient,custom,encodeAbiParameters,encodeEventTopics,toHex} from 'viem';
import {abi} from '@toxicflow-labs/ts-sdk';
import {KuruReader} from '../src/chain.ts';
import {DEPLOYMENT} from '../src/domain.ts';
import {prepareIntent} from '../src/planner.ts';
import {buildOrderTransaction} from '../src/transactions.ts';
import {reconcile} from '../src/evidence.ts';
import {input,snapshot,NOW,OWNER,HASH} from './fixtures.ts';

const RECEIPT_BLOCK=`0x${'1'.repeat(64)}` as const;
const HEAD_BLOCK=`0x${'2'.repeat(64)}` as const;
const ORPHAN_BLOCK=`0x${'3'.repeat(64)}` as const;
const OTHER_HASH=`0x${'4'.repeat(64)}` as const;
const intent=prepareIntent(input(),snapshot(),NOW);
const tx=buildOrderTransaction(intent);

function rawBook({orphan=false,index=0,size=1_000_000_000n,maker=7n}={}){
  const word=(maker<<216n)|(3n<<208n)|(133n<<200n)|(25000n<<168n)|(size<<72n)|(88n<<8n);
  const packed=`${toHex(word,{size:32})}${toHex(0,{size:4}).slice(2)}${toHex(4000,{size:3}).slice(2)}` as `0x${string}`;
  return {address:DEPLOYMENT.market,blockNumber:'0x65',blockHash:orphan?ORPHAN_BLOCK:RECEIPT_BLOCK,transactionHash:HASH,
    transactionIndex:'0x0',logIndex:toHex(index),removed:false,
    topics:encodeEventTopics({abi:abi.orderBookAbi,eventName:'BookUpdatesPacked',args:{accountId:7,executor:OWNER}}),
    data:encodeAbiParameters([{type:'bytes32'},{type:'bytes'}],[intent.clientOrderId,packed])};
}

function fixture(options:{orphanLog?:boolean;changedReceiptPayload?:boolean;wrongReceiptHash?:boolean;wrongTransactionHash?:boolean;slowReplay?:boolean;finalizedHead?:bigint}={}){
  let now=NOW;
  const methods:string[]=[];
  const transport=custom({request:async({method,params})=>{
    methods.push(method);
    const p=(params??[]) as readonly unknown[];
    if(method==='eth_chainId')return '0x279f';
    if(method==='eth_getBlockByNumber'){
      const n=p[0]==='finalized'?toHex(options.finalizedHead??105n):String(p[0]);
      return {number:n,hash:n==='0x65'?RECEIPT_BLOCK:HEAD_BLOCK,parentHash:RECEIPT_BLOCK,
        timestamp:toHex(BigInt(NOW/1000)),transactions:[]};
    }
    if(method==='eth_getCode')return '0x60006000';
    if(method==='eth_getStorageAt')return `0x${'0'.repeat(24)}${String(p[0]).toLowerCase()===DEPLOYMENT.market?DEPLOYMENT.marketImplementation.slice(2):DEPLOYMENT.accountImplementation.slice(2)}`;
    if(method==='eth_getTransactionByHash')return {blockHash:RECEIPT_BLOCK,blockNumber:'0x65',chainId:'0x279f',from:OWNER,to:DEPLOYMENT.market,
      hash:options.wrongTransactionHash?OTHER_HASH:HASH,input:tx.data,value:'0x0',gas:'0x100000',gasPrice:'0x1',nonce:'0x0',transactionIndex:'0x0',type:'0x0',v:'0x1b',r:'0x1',s:'0x1'};
    if(method==='eth_getTransactionReceipt')return {transactionHash:options.wrongReceiptHash?OTHER_HASH:HASH,transactionIndex:'0x0',blockHash:RECEIPT_BLOCK,blockNumber:'0x65',from:OWNER,to:DEPLOYMENT.market,
      cumulativeGasUsed:'0x1',gasUsed:'0x1',effectiveGasPrice:'0x1',contractAddress:null,status:'0x1',type:'0x0',logsBloom:`0x${'0'.repeat(512)}`,
      logs:[rawBook({size:options.changedReceiptPayload?999_999_999n:1_000_000_000n})]};
    if(method==='eth_getLogs'){
      if(options.slowReplay)now+=31_000;
      const first=rawBook({orphan:options.orphanLog});
      // A second canonical log in that same block used to overwrite the first
      // hash in the adapter's Map before canonicality validation.
      return options.orphanLog?[first,{...rawBook({index:1,maker:8n}),topics:encodeEventTopics({abi:abi.orderBookAbi,eventName:'BookUpdatesPacked',args:{accountId:8,executor:OWNER}})}]:[first];
    }
    if(method==='eth_call'){
      const call=p[0] as {data:`0x${string}`};
      const slot=BigInt(`0x${call.data.slice(-64)}`);
      return toHex(slot===3n?88n:0n,{size:32});
    }
    throw new Error(`Unexpected read-only fixture RPC: ${method}`);
  },retryCount:0});
  return {reader:new KuruReader(createPublicClient({transport}),()=>now),methods};
}

test('review: complete consistent fake-RPC evidence reaches open status and finalized success',async()=>{
  const {reader}=fixture();
  assert.equal(await reader.transactionOutcome(tx,HASH),'success');
  const observed=await reader.evidence(intent,HASH);
  assert.equal(observed.complete,true);
  assert.equal(reconcile(intent,observed).state,'open');
});

test('review: disagreeing hashes in one log block are rejected even when canonical hash occurs last',async()=>{
  await assert.rejects(()=>fixture({orphanLog:true}).reader.evidence(intent,HASH),/canonical|hash|block|receipt|conflict/i);
});

test('review: receipt and range cannot disagree on the payload at an identical observation position',async()=>{
  await assert.rejects(()=>fixture({changedReceiptPayload:true}).reader.evidence(intent,HASH),/receipt|conflict|payload|mismatch/i);
});

test('review: finalized operation outcome also rejects receipt/range payload disagreement',async()=>{
  await assert.rejects(()=>fixture({changedReceiptPayload:true}).reader.transactionOutcome(tx,HASH),/receipt|conflict|payload|mismatch|differ/i);
});

for(const option of ['wrongReceiptHash','wrongTransactionHash'] as const){
  test(`review: ${option} cannot establish a finalized transaction outcome`,async()=>{
    await assert.rejects(()=>fixture({[option]:true}).reader.transactionOutcome(tx,HASH),/transaction|receipt|hash|match/i);
  });
}

test('review: a long replay does not refresh the age of its old finalized snapshot',async()=>{
  await assert.rejects(()=>fixture({slowReplay:true}).reader.evidence(intent,HASH),/stale|fresh|head|age/i);
});

test('review: replay beyond the supported range fails before log reads and explains the unresolved gate',async()=>{
  const f=fixture({finalizedHead:100_102n});
  await assert.rejects(()=>f.reader.evidence(intent,HASH),/Automated archival recovery is not implemented.*new intents for this owner remain blocked/i);
  assert.equal(f.methods.includes('eth_getLogs'),false);
});
