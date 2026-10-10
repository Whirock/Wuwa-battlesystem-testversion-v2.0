#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),P=require(path.join(root,'parameters.json')),Engine=require(path.join(root,'engine.js'));
const record={schema:'independent-dreamless-normal-strategy-1',runAt:new Date().toISOString(),command:'node tests/v04/independent_dreamless_strategy.cjs',scope:'Unmodified level20 and level40 default HP/SP/BP1/E0 vs fixed level40 Dreamless; no stat or phase injection.',strategy:'Prioritize living projectiles with lethal preview; otherwise highest legal Q / heal below 55%; reserve BP for pending R2, prioritize its legal finisher, guard committed high-risk charges, SP items only on depletion.',sha256:{},runs:[]};
for(const f of ['engine.js','skill-effects.js','parameters.json'])record.sha256[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const teams=[['amy','mornye','chisa','rover_aero'],['amy','lynae','mornye','chisa'],['amy','denia','chisa','rover_aero']];
for(const level of [20,40])for(const team of teams){const e=new Engine(P,{team,encounter:'dreamless',level,seed:4204,stochastic:false});e.start();let step=0,commands=[];
 for(;step<400&&!e.result;step++){
  if(e.current.side==='enemy'){const r=e.stepEnemy();assert(r.ok,r.reason);e.validate();continue;}
  const a=e.current,alive=e.living('ally'),worst=alive.reduce((x,y)=>x.hp/x.maxhp<y.hp/y.maxhp?x:y),target=e.living('enemy').find(x=>x.mechanicUnit)||e.enemies.find(x=>x.key==='dreamless'),projectile=!!target.mechanicUnit,candidates=[];
  for(let bp=0;bp<=Math.min(3,a.bp);bp++)for(const row of e.availableActions(a.id,bp,{targetId:target.id})){
   if((a.r2Pending&&a.bp<3&&bp>0)||(row.resolvedKey==='R1'&&bp>0))continue;
   if(!row.enabled||['wait','escape','negotiate'].includes(row.key)||row.multiTarget?.kind==='abnormal')continue;
   const opts={bp,allyTargetId:worst.id};let t=target;
   if(row.target==='self')t=a;if(['ally','other_ally','all_allies'].includes(row.target))t=row.target==='other_ally'?alive.find(x=>x!==a):worst;
   if(!t)continue;
   if(row.key==='E5'&&a.key==='lynae')opts.allyTargetId=alive.filter(x=>x!==a).sort((x,y)=>y.atk-x.atk)[0]?.id;
   if(row.key==='E5'&&a.key==='amy')opts.allyTargetId=alive.find(x=>x!==a)?.id;
   if(row.choices?.length)opts.choice=row.choices[0].value;
   if(a.key==='rover_aero'&&row.key==='rover_aero_e3')opts.abnormal='none';
   const ctx=e._context(a,row.key,t.id,opts);if(e._legality(ctx,true))continue;
   const p=e.previewPacket(a,t,row.key,opts);let score=p.q*8+p.damage*.05-bp*.5;
   if(projectile)score=(p.damage>=target.hp?1000:0)+p.damage-bp*4;
   if(worst.hp/worst.maxhp<.55&&((a.key==='mornye'&&['E1','E3'].includes(row.key))||(a.key==='chisa'&&['E2','R'].includes(row.key))||(a.key==='rover_aero'&&['_e1','_r'].some(x=>row.key.endsWith(x)))))score+=200+(bp*2);
   if(row.key==='item_sp')score=a.sp<10?35:-1000;if(row.key==='guard')score=e.enemies.some(x=>x.key==='dreamless'&&x.charge&&x.bossState!=='projectiles')?350:-100;
   if(row.resolvedKey==='R2')score+=500;
   if(a.key==='mornye'&&row.key==='E2'&&!a.status.mornye_field)score+=50;
   if(a.key==='chisa'&&row.key==='E3'&&a.sp>=40)score+=30;
   candidates.push({key:row.key,target:t.id,opts,score});
  }
  candidates.sort((a,b)=>b.score-a.score);const c=candidates[0];assert(c,'No legal strategy command');const r=e.act(c.key,c.target,c.opts);assert(r.ok,r.reason);e.validate();commands.push({round:e.round,actor:a.key,key:c.key,target:c.target,bp:c.opts.bp});
 }
 record.runs.push({level,team,seed:4204,steps:step,outcome:e.result||'bounded_400',summary:e.summary(),finalEnemies:e.enemies.map(u=>({key:u.key,hp:u.hp,maxhp:u.maxhp,q:u.q,maxq:u.maxq,phase:u.phase,retreated:u.retreated})),commands,mechanismEvents:e.log.filter(x=>['break','break_recover','spawn','reflection','special_interrupt','enemy_action','charge'].includes(x.event))});
}
record.established={normalInitialResources:true,anyBreak:record.runs.some(x=>x.mechanismEvents.some(v=>v.event==='break')),anyProjectiles:record.runs.some(x=>x.mechanismEvents.some(v=>v.event==='spawn')),anyReflection:record.runs.some(x=>x.mechanismEvents.some(v=>v.event==='reflection'))};
console.log(JSON.stringify(record,null,2));process.exitCode=Object.values(record.established).every(Boolean)?0:1;
