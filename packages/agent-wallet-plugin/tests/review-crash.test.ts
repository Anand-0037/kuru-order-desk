import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {IntentStore} from '../src/store.ts';
import {OrderService,type ChainReader} from '../src/service.ts';
import {NOW,OWNER} from './fixtures.ts';

test('review: a real process crash after executor entry leaves a durable nonretryable barrier',{timeout:10_000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kuru-review-crash-'));
  const root=dirname(dirname(fileURLToPath(import.meta.url)));
  // The child runs only our source and a never-completing fake executor.
  // Only this test-owned process and temporary directory are affected.
  const script=`
    import {IntentStore} from './src/store.ts';
    import {OrderService} from './src/service.ts';
    import {input,snapshot,NOW,OWNER} from './tests/fixtures.ts';
    const chain={snapshot:async()=>snapshot(),evidence:async()=>{throw new Error('unused')},simulate:async()=>{}};
    let intent;
    const service=new OrderService(new IntentStore(${JSON.stringify(directory)}),chain,async()=>{
      process.stdout.write(JSON.stringify({id:intent.id})+'\\n');
      setInterval(()=>{},1000);
      return await new Promise(()=>{});
    },()=>NOW);
    intent=await service.prepare(input());
    await service.submit(intent.id,intent.digest,true,OWNER);
  `;
  const child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{cwd:root,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',(chunk:Buffer)=>{stderr+=chunk.toString();});
  try{
    const message=await new Promise<string>((resolve,reject)=>{
      let output='';
      child.once('error',reject);
      child.once('exit',(code)=>reject(new Error(`Child exited before barrier: ${code}; ${stderr}`)));
      child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();if(output.includes('\n'))resolve(output.split('\n')[0]!);});
    });
    const {id}=JSON.parse(message) as {id:string};
    const stopped=once(child,'exit');
    assert.equal(child.kill('SIGKILL'),true);
    const [code,signal]=await stopped;
    assert.equal(code,null);assert.equal(signal,'SIGKILL');
    const store=new IntentStore(directory);
    assert.equal((await store.read(id)).submission.phase,'started');
    await assert.rejects(()=>store.withLock(async()=>undefined),/locked/);
    // Explicit lock recovery is safe in this fixture only because we observed
    // that exact owned child exit. The durable operation barrier must remain.
    await unlink(join(directory,'.lock'));
    let calls=0;
    const chain:ChainReader={snapshot:async()=>{throw new Error('No reread needed');},evidence:async()=>{throw new Error('No hash to recover');},simulate:async()=>{throw new Error('Must not simulate');}};
    const service=new OrderService(store,chain,async()=>{calls++;throw new Error('Must not resend');},()=>NOW);
    const intent=(await store.read(id)).intent;
    await assert.rejects(()=>service.submit(id,intent.digest,true,OWNER),/started|do not resubmit/i);
    assert.equal((await service.status(id)).state,'needs-review');
    assert.equal(calls,0);
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    await rm(directory,{recursive:true,force:true});
  }
});
