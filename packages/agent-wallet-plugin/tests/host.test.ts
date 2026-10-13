import {test} from 'node:test';import assert from 'node:assert/strict';
import type {CommandIO,PluginCommandContext} from '@metamask/agent-wallet/plugin';
import {selectedOwner,makeHostExecutor} from '../src/host.ts';
import {buildOrderTransaction} from '../src/transactions.ts';
import {prepareIntent} from '../src/planner.ts';
import {input,snapshot,NOW,OWNER,HASH} from './fixtures.ts';
const state=()=>({selectedWallet:{mode:'server',namespace:'evm',ref:{address:OWNER}},remoteWallets:[{address:OWNER,namespace:'evm'}],byokWallets:[]});

test('selected owner resolution uses matching metadata only and rejects ambiguous or missing wallet',()=>{
 assert.equal(selectedOwner(state()),OWNER);
 assert.throws(()=>selectedOwner({...state(),selectedWallet:{mode:'server',namespace:'solana',ref:{address:OWNER}}}));
 assert.throws(()=>selectedOwner({...state(),remoteWallets:[]}));
 assert.throws(()=>selectedOwner({...state(),remoteWallets:[{address:OWNER},{address:OWNER}]}));
});
test('only host walletExecutor receives fixed transaction and human intent; no signing bypass',async()=>{
 const requests:unknown[]=[];let source='';
 const context={walletStateManager:{read:state},walletExecutor:async(_io:unknown,name:string)=>{source=name;return async(req:unknown)=>{requests.push(req);return {kind:'transaction',hash:HASH,status:'BROADCASTED'};};}} as unknown as PluginCommandContext;
 const io={signal:new AbortController().signal} as CommandIO;
 const tx=buildOrderTransaction(prepareIntent(input(),snapshot(),NOW));
 const result=await makeHostExecutor(context,io,'kuru:submit')(tx,'Human-reviewed test order');
 assert.equal(result.hash,HASH);assert.equal(source,'kuru:submit');assert.equal(requests.length,1);
 assert.deepEqual(requests[0],{kind:'transaction',chainId:10143,transaction:{to:tx.to,data:tx.data,value:0n},intent:{action:'custom',summary:'Human-reviewed test order'}});
});
test('wallet changed after preflight stops before executor access',async()=>{
 let calls=0;
 const context={walletStateManager:{read:()=>({...state(),selectedWallet:{mode:'server',namespace:'evm',ref:{address:'0x2222222222222222222222222222222222222222'}}})},walletExecutor:async()=>{calls++;}} as unknown as PluginCommandContext;
 const tx=buildOrderTransaction(prepareIntent(input(),snapshot(),NOW));
 await assert.rejects(()=>makeHostExecutor(context,{signal:new AbortController().signal} as CommandIO,'kuru:submit')(tx,'Review'),/wallet/i);assert.equal(calls,0);
});
