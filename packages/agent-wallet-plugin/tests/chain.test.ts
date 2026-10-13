import {test} from 'node:test';import assert from 'node:assert/strict';
import {createPublicClient,custom,decodeFunctionData,encodeFunctionResult,type Abi} from 'viem';
import {abi} from '@toxicflow-labs/ts-sdk';
import {KuruReader} from '../src/chain.ts';
import {DEPLOYMENT} from '../src/domain.ts';
import {NOW,OWNER,BLOCK_HASH} from './fixtures.ts';

function rpcFixture(options:{chain?:string;changedHead?:boolean;fee?:number;headSkewMs?:number}={}){
 const calls:{method:string;params:readonly unknown[]}[]=[];let heads=0;
 const combined=[...abi.orderBookAbi,...abi.accountCoreAbi] as Abi;
 const transport=custom({request:async({method,params})=>{
  const p=(params??[]) as readonly unknown[];calls.push({method,params:p});
  if(method==='eth_chainId')return options.chain??'0x279f';
  if(method==='eth_getBlockByNumber'){heads++;return {number:'0x64',hash:heads>1&&options.changedHead?`0x${'c'.repeat(64)}`:BLOCK_HASH,parentHash:BLOCK_HASH,timestamp:`0x${Math.floor((NOW+(options.headSkewMs??0))/1000).toString(16)}`,transactions:[]};}
  if(method==='eth_getCode')return '0x60006000';
  if(method==='eth_getStorageAt')return `0x${'0'.repeat(24)}${String(p[0]).toLowerCase()===DEPLOYMENT.market?DEPLOYMENT.marketImplementation.slice(2):DEPLOYMENT.accountImplementation.slice(2)}`;
  if(method==='eth_getBalance')return '0xde0b6b3a7640000';
  if(method==='eth_call'){
   const tx=p[0] as {data:`0x${string}`};const d=decodeFunctionData({abi:combined,data:tx.data});
   const values:Record<string,unknown>={makerFeePps:4000n,getMarketParams:[1000000,1000000n,1,10000000n,5000000000000n,7000n,4000n],baseToken:DEPLOYMENT.baseToken,quoteToken:DEPLOYMENT.quoteToken,quoteTokenDecimals:6,baseSizeMultiplier:1000000000000n,
    spotBalanceAccountAddress:DEPLOYMENT.accountCore,marketState:0,protocolPaused:false,rootAccountIdOf:7,getAccountOwner:OWNER,getBalance:10000000000000000000000n,getSpotReservedBalance:0n,effectiveSpotMakerFeePps:options.fee??4000,getPostFillHook:DEPLOYMENT.baseToken,getOrderId:0n};
   if(!(d.functionName in values))throw new Error(`Unexpected read ${d.functionName}`);
   return encodeFunctionResult({abi:combined,functionName:d.functionName,result:values[d.functionName]});
  }
  throw new Error(`Unexpected RPC ${method}`);
 }});
 return {client:createPublicClient({transport}),calls};
}
test('snapshot reads official deployment and all 62 slots at one explicit block',async()=>{
 const f=rpcFixture(),s=await new KuruReader(f.client,()=>NOW).snapshot(OWNER);
 assert.equal(s.chainId,10143);assert.equal(s.accountId,'7');assert.equal(s.makerFeePps,'4000');assert.equal(s.slots.length,62);assert.equal(s.blockNumber,'100');
 const reads=f.calls.filter(c=>['eth_call','eth_getBalance','eth_getCode'].includes(c.method));assert.ok(reads.length>=70);assert.ok(reads.every(c=>c.params[1]==='0x64'));
});
test('wrong chain and changing pinned block fail closed before any write',async()=>{
 await new KuruReader(rpcFixture({headSkewMs:1000}).client,()=>NOW).snapshot(OWNER);
 await assert.rejects(()=>new KuruReader(rpcFixture({headSkewMs:3000}).client,()=>NOW).snapshot(OWNER),/future/);
 await assert.rejects(()=>new KuruReader(rpcFixture({chain:'0x1'}).client,()=>NOW).snapshot(OWNER),/chain/);
 await assert.rejects(()=>new KuruReader(rpcFixture({changedHead:true}).client,()=>NOW).snapshot(OWNER),/canonical|changed/);
});
