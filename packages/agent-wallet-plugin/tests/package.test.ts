import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{PluginCommand,PluginManifestSchema}from'@metamask/agent-wallet/plugin';
import Prepare from'../src/commands/kuru/prepare.ts';import Submit from'../src/commands/kuru/submit.ts';import Status from'../src/commands/kuru/status.ts';import Cancel from'../src/commands/kuru/cancel.ts';import Demo from'../src/commands/kuru/demo.ts';
test('all commands inherit real host PluginCommand and request least-privilege testnet capabilities',async()=>{
 const p=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.equal(p.private,true,'npm publication stays disabled while SDK rights are unresolved');assert.ok(PluginManifestSchema.safeParse(p.mm).success);assert.deepEqual(p.mm.capabilities,[]);
 assert.ok(p.files.every((entry:string)=>!/[?*]/.test(entry)),'oclif local installer checks package files as literal paths');
 const ids=['kuru:prepare','kuru:submit','kuru:status','kuru:cancel','kuru:demo'];assert.deepEqual(p.mm.commands.map((x:{id:string})=>x.id),ids);
 for(const command of [Prepare,Submit,Status,Cancel,Demo])assert.ok(command.prototype instanceof PluginCommand);
 for(const command of p.mm.commands)assert.deepEqual(command.targetChains,[10143]);
 for(const id of ['kuru:prepare','kuru:status','kuru:demo'])assert.equal(p.mm.commands.find((x:{id:string})=>x.id===id).capabilities.includes('wallet-submit'),false);
 assert.equal(Demo.requiresAuth,false);assert.equal(Demo.requiresInit,false);assert.equal(Submit.requiresAuth,true);
});
test('agent skill and README ship explicit human authorization and fixture boundaries',async()=>{
 const skill=await readFile(new URL('../skills/kuru-order-desk/SKILL.md',import.meta.url),'utf8'),readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
 assert.match(skill,/walletExecutor/);assert.match(skill,/human/i);assert.match(skill,/OFFLINE FIXTURE/);assert.match(readme,/UNLICENSED/);assert.match(readme,/file:\$PWD/);assert.match(readme,/Not yet verified|NOT YET VERIFIED/);
});
