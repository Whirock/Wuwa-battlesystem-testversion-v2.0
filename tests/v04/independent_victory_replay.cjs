#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),P=require(path.join(root,'parameters.json')),Engine=require(path.join(root,'engine.js')),route=require('./independent_victory_route.cjs');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex'),sha256=Object.fromEntries(['engine.js','skill-effects.js','parameters.json'].map(f=>[f,digest(fs.readFileSync(path.join(root,f)))]));
assert.deepEqual(Object.keys(route.config).sort(),['difficulty','encounter','level','seed','stochastic','team'].sort(),'No initial resource/stat/stage/difficulty overrides');
assert.equal(route.config.level,40);assert.equal(route.config.encounter,'dreamless');assert.equal(route.config.difficulty,'standard');
const e=new Engine(P,route.config);for(const a of e.allies){assert.equal(a.hp,a.maxhp);assert.equal(a.sp,a.maxsp);assert.equal(a.bp,1);assert.equal(a.energy,0);assert.ok(!a.r2Pending&&!a.energyLocked);}assert.equal(e.enemies[0].level,40);assert.equal(e.enemies[0].hp,24000);assert.equal(e.enemies[0].q,156);const start=e.start();assert.equal(start.ok,true);e.validate();
const seenSlots=new Set(),payments=[];
for(const [i,c]of route.commands.entries()){
 assert.equal(e.currentId,c.actorId,`actor mismatch at step${i}`);assert.equal(e.round,c.round,`round mismatch at step${i}`);const a=e.current;
 const slot=`${e.round}:${a.id}`;assert.ok(!seenSlots.has(slot),`second normal action in same slot ${slot}`);seenSlots.add(slot);
 let res;if(c.enemy){assert.equal(a.side,'enemy');res=e.stepEnemy();}
 else{
  assert.equal(a.side,'ally');assert.ok(!Object.keys(c.options).some(k=>['forceMiss','forceCrit','initialHP','initialSP','initialEnergy','initialBP'].includes(k)));
  const before={sp:a.sp,bp:a.bp,energy:a.energy,round:e.round};res=e.act(c.key,c.targetId,c.options);assert.equal(res.ok,true,`rejected step${i}: ${res.reason}`);
  const commit=res.events.find(v=>v.event==='action_commit'&&v.actor===a.id);assert.ok(commit);assert.equal(before.sp-a.sp,commit.sp);const expectedBP=a.hp<=0?0:Math.min(5,before.bp-commit.bp+(e.round>before.round&&commit.bp===0?1:0));assert.equal(a.bp,expectedBP);payments.push({step:i,actor:a.key,sp:commit.sp,bp:commit.bp,energyCost:commit.energyCost});
 }
 assert.equal(res.ok,true);e.validate();for(const u of e.allies){assert.ok(u.sp>=0&&u.sp<=u.maxsp);assert.ok(u.bp>=0&&u.bp<=5);assert.ok(u.energy>=0&&u.energy<=u.energyCap);}
}
assert.equal(e.result?.outcome,'win');assert.equal(e.round,route.expected.rounds);assert.equal(e.enemies.find(x=>x.key==='dreamless').hp,0);assert.equal(e.allies.filter(x=>x.retreated).length,0);assert.equal(route.commands.length,143);
const eventHash=digest(JSON.stringify(e.log)),sameEvents=eventHash===route.expected.events_sha256;
if(Object.entries(sha256).every(([f,h])=>route.source_sha256[f]===h))assert.ok(sameEvents,'Same-code replay must be byte-identical');
const r={schema:'independent-victory-replay-test4-1',runAt:new Date().toISOString(),command:'node tests/v04/independent_victory_replay.cjs',sha256,scope:'Fresh actual engine; constructor configuration only, then recorded act/stepEnemy commands. No stat, resource, enemy, queue, status, phase or inventory writes.',config:route.config,passed:true,commands:route.commands.length,originalActionPayments:payments.length,enemyMainActions:route.commands.filter(x=>x.enemy).length,outcome:e.result,summary:e.summary(),eventCount:e.log.length,event_sha256:eventHash,byteIdenticalEvents:sameEvents,mechanismEvents:e.log.filter(x=>['break','spawn','reflection','special_interrupt','battle_end'].includes(x.event)),survivors:e.allies.filter(x=>x.hp>0).map(x=>({key:x.key,hp:x.hp,maxhp:x.maxhp})),payments};
console.log(JSON.stringify(r,null,2));
