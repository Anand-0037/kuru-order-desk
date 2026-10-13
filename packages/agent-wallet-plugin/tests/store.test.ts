import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmod,mkdtemp,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {IntentStore} from '../src/store.ts';
import {prepareIntent} from '../src/planner.ts';
import {input,snapshot,NOW} from './fixtures.ts';
async function store(){return new IntentStore(await mkdtemp(join(tmpdir(),'kuru-store-')));}

test('state directory permissions are private or rejected',async t=>{
 if(process.platform==='win32'){
  t.skip('Windows ACL privacy cannot be checked with POSIX mode bits');
  return;
 }
 const created=join(await mkdtemp(join(tmpdir(),'kuru-store-parent-')),'state');
 await new IntentStore(created).list();
 assert.equal((await stat(created)).mode&0o077,0);

 const permissive=await mkdtemp(join(tmpdir(),'kuru-store-permissive-'));
 await chmod(permissive,0o755);
 await assert.rejects(()=>new IntentStore(permissive).list(),/accessible by group or others/);
});

test('native Windows state storage fails closed when ACL privacy cannot be checked',async t=>{
 if(process.platform!=='win32'){
  t.skip('Only applies to native Windows');
  return;
 }
 const s=await store();
 await assert.rejects(()=>s.list(),/ACL privacy cannot be verified on Windows/);
});

test('durable atomic intent survives a fresh process object',async()=>{
 const s=await store(),i=prepareIntent(input(),snapshot(),NOW);
 await s.withLock(()=>s.create(i));
 assert.deepEqual((await new IntentStore(s.directory).read(i.id)).intent,i);
 assert.equal((await s.list()).length,1);
});
test('exclusive state-directory lock rejects overlapping mutation',async()=>{
 const s=await store(); let release!:()=>void;
 const hold=new Promise<void>(r=>{release=r;});
 let ready!:()=>void;const entered=new Promise<void>(r=>{ready=r;});
 const first=s.withLock(async()=>{ready();await hold;}); await entered;
 await assert.rejects(()=>s.withLock(async()=>undefined),/locked/); release(); await first;
 assert.equal(await s.withLock(async()=>42),42);
});
test('path traversal, corrupted state and duplicate creation are rejected',async()=>{
 const s=await store(),i=prepareIntent(input(),snapshot(),NOW);
 await assert.rejects(()=>s.read('../elsewhere'),/intent id/);
 await s.withLock(()=>s.create(i));
 await assert.rejects(()=>s.withLock(()=>s.create(i)),/exists/);
 await writeFile(join(s.directory,`${i.id}.json`),JSON.stringify({version:1,intent:{...i,price:'26'},submission:{phase:'not-started'},cancellation:{phase:'not-started'}}));
 await assert.rejects(()=>s.read(i.id),/Invalid/);
});
test('unknown submission survives restart without reverting to not-started',async()=>{
 const s=await store(),i=prepareIntent(input(),snapshot(),NOW);await s.withLock(()=>s.create(i));
 await s.withLock(async()=>{const r=await s.read(i.id);r.submission={phase:'unknown',atMs:NOW,error:'Executor outcome uncertain'};await s.save(r);});
 assert.equal((await new IntentStore(s.directory).read(i.id)).submission.phase,'unknown');
});
