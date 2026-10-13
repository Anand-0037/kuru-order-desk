import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {CommandIO,PluginCommandContext} from '@metamask/agent-wallet/plugin';
import {makeHostExecutor} from '../src/host.ts';
import {buildOrderTransaction} from '../src/transactions.ts';
import {prepareIntent} from '../src/planner.ts';
import {input,snapshot,NOW,OWNER,HASH} from './fixtures.ts';

test('review: selected owner changing while host executor factory awaits must stop before execution',async()=>{
  let owner=OWNER,calls=0;
  const context={
    walletStateManager:{read:()=>({selectedWallet:{mode:'server',namespace:'evm',ref:{address:owner}},remoteWallets:[{address:owner,namespace:'evm'}],byokWallets:[]})},
    walletExecutor:async()=>{
      // MetaMask's returned executor resolves selected state when invoked.
      // This models an ordinary selection change during async host setup.
      owner='0x2222222222222222222222222222222222222222';
      return async()=>{calls++;return {kind:'transaction',hash:HASH,status:'BROADCASTED'};};
    },
  } as unknown as PluginCommandContext;
  const io={signal:new AbortController().signal} as CommandIO;
  const tx=buildOrderTransaction(prepareIntent(input(),snapshot(),NOW));
  await assert.rejects(()=>makeHostExecutor(context,io,'kuru:submit')(tx,'Reviewed order'),/wallet|owner|changed/i);
  assert.equal(calls,0);
});
