#!/usr/bin/env node
'use strict';
/* Quality gate: find and replay a legal same-level Dreamless victory.
 * No stat, phase, resource, turn or cooldown injections. Policy reads public previews
 * and the same pure legality check as the UI, then submits ordinary act commands.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),P=require(path.join(root,'parameters.json')),Engine=require(path.join(root,'engine.js'));
const TEAM=['amy','mornye','chisa','rover_aero'];
const defaults={qWeight:8,damageWeight:.05,bpPenalty:.5,healThreshold:.55,healBonus:200,healBP:2,fieldBonus:50,sawBonus:30,guardBonus:350,potionScore:35,potionThreshold:10,rBonus:0};
function choose(e,policy){
 const a=e.current,alive=e.living('ally'),worst=alive.reduce((x,y)=>x.hp/x.maxhp<y.hp/y.maxhp?x:y),boss=e.enemies.find(x=>x.key==='dreamless');
 const target=e.living('enemy').find(x=>x.mechanicUnit)||boss,projectile=!!target.mechanicUnit,candidates=[];
 for(let bp=0;bp<=Math.min(3,a.bp);bp++)for(const row of e.availableActions(a.id,bp,{targetId:target.id})){
  if((a.r2Pending&&a.bp<3&&bp>0)||(row.resolvedKey==='R1'&&bp>0))continue;
  if(!row.enabled||['wait','escape','negotiate'].includes(row.key)||row.multiTarget?.kind==='abnormal')continue;
  const options={bp,allyTargetId:worst.id};let t=target;
  if(row.target==='self')t=a;
  if(['ally','other_ally','all_allies'].includes(row.target))t=row.target==='other_ally'?alive.find(x=>x!==a):worst;
  if(!t)continue;
  if(row.key==='E5'&&a.key==='lynae')options.allyTargetId=alive.filter(x=>x!==a).sort((x,y)=>y.atk-x.atk)[0]?.id;
  if(row.key==='E5'&&a.key==='amy')options.allyTargetId=alive.find(x=>x!==a)?.id;
  if(row.choices?.length)options.choice=row.choices[0].value;
  if(a.key==='rover_aero'&&row.key==='rover_aero_e3')options.abnormal='none';
  const ctx=e._context(a,row.key,t.id,options);if(e._legality(ctx,true))continue;
  const preview=e.previewPacket(a,t,row.key,options);let score=preview.q*policy.qWeight+preview.damage*policy.damageWeight-bp*policy.bpPenalty;
  if(projectile)score=(preview.damage>=target.hp?1000:0)+preview.damage-bp*4;
  const healing=(a.key==='mornye'&&['E1','E3'].includes(row.key))||(a.key==='chisa'&&['E2','R'].includes(row.key))||(a.key==='rover_aero'&&['_e1','_r'].some(x=>row.key.endsWith(x)));
  if(worst.hp/worst.maxhp<policy.healThreshold&&healing)score+=policy.healBonus+bp*policy.healBP;
  if(row.key==='item_sp')score=a.sp<policy.potionThreshold?policy.potionScore:-1000;
  if(row.key==='item_repair')score=policy.repairThreshold&&worst.hp/worst.maxhp<policy.repairThreshold?policy.repairBonus||350:-1000;
  if(row.key==='item_cleanse')score=-1000;
  if(row.key==='guard')score=boss.charge&&boss.bossState!=='projectiles'?policy.guardBonus:-100;
  if(row.resolvedKey==='R2')score+=500;
  if(ctx.energyCost>0)score+=policy.rBonus;
  if(a.key==='mornye'&&row.key==='E2'&&!a.status.mornye_field)score+=policy.fieldBonus;
  if(a.key==='chisa'&&row.key==='E3'&&a.sp>=40)score+=policy.sawBonus;
  if(policy.finisherHP&&boss.hp<=policy.finisherHP&&!projectile)score=preview.damage-bp*.1;
  candidates.push({key:row.key,target:t.id,options,score,preview});
 }
 candidates.sort((a,b)=>b.score-a.score);assert(candidates.length,'No legal policy action');return candidates[0];
}
function runPolicy(policy,team=TEAM,record=false){
 const config={team,encounter:'dreamless',level:40,difficulty:'standard',seed:4204,stochastic:false};
 const e=new Engine(P,config);e.start();const commands=[],rounds=[];let step=0,lastRound=0;
 for(;step<600&&!e.result;step++){
  if(record&&e.round!==lastRound){lastRound=e.round;rounds.push({round:e.round,allies:e.allies.map(a=>({key:a.key,hp:a.hp,sp:a.sp,bp:a.bp,energy:a.energy,form:a.form})),boss:{hp:e.enemies[0].hp,q:e.enemies[0].q,phase:e.enemies[0].phase,bossState:e.enemies[0].bossState},inventory:{...e.inventory}});}
  const actor=e.current,round=e.round;
  if(actor.side==='enemy'){const r=e.stepEnemy();assert(r.ok,r.reason);e.validate();if(record)commands.push({step,round,actor:actor.key,actorId:actor.id,enemy:true,events:r.events.map(x=>x.id)});continue;}
  const choice=choose(e,policy),r=e.act(choice.key,choice.target,choice.options);assert(r.ok,r.reason);e.validate();
  if(record)commands.push({step,round,actor:actor.key,actorId:actor.id,key:choice.key,target:choice.target,options:choice.options,preview:choice.preview,events:r.events.map(x=>x.id)});
 }
 const boss=e.enemies.find(x=>x.key==='dreamless');
 return {policy,config,outcome:e.result?.outcome||'bounded',rounds:e.round,steps:step,bossHP:boss.hp,bossMaxHP:boss.maxhp,summary:e.summary(),survivors:e.allies.map(a=>({key:a.key,hp:a.hp,maxhp:a.maxhp,sp:a.sp,bp:a.bp,energy:a.energy})),...(record?{roundStates:rounds,commands,events:e.log}:{} )};
}
function replay(record){const e=new Engine(P,record.config);e.start();for(const c of record.commands){assert.equal(e.currentId,c.actorId);assert.equal(e.round,c.round);const r=c.enemy?e.stepEnemy():e.act(c.key,c.target,c.options);assert(r.ok,r.reason);e.validate();}assert.equal(e.result?.outcome,'win');assert.equal(e.enemies[0].hp,0);return {outcome:e.result.outcome,rounds:e.round,commands:record.commands.length,eventCount:e.log.length,byteIdenticalEvents:JSON.stringify(e.log)===JSON.stringify(record.events)};}
function main(){const attempts=[],variants=[];
 for(const patch of [{},{damageWeight:.1},{damageWeight:.2},{damageWeight:.4},{healThreshold:.6},{healThreshold:.5},{qWeight:6},{qWeight:10},{rBonus:30},{repairThreshold:.25,repairBonus:500},{potionThreshold:16,potionScore:80},{finisherHP:1000},{fieldBonus:100},{healBonus:300},{guardBonus:200}])variants.push({...defaults,...patch});
 let winner=null;
 for(const policy of variants){const trial=runPolicy(policy);attempts.push(trial);process.stderr.write(`${attempts.length}: ${trial.outcome} r${trial.rounds} boss=${trial.bossHP}\n`);if(trial.outcome==='win'){winner=runPolicy(policy,TEAM,true);break;}}
 const result={schema:'test4-boss-strategy-quality-gate-1',scope:'Level40 allies vs level40 standard Dreamless; full default HP/SP, BP1, energy0, normal inventory. No battle-state injections, no stat changes, no critical hits.',version:Engine.version,parameterFingerprint:Engine.parameterFingerprint(P),sha256:Object.fromEntries(['engine.js','skill-effects.js','parameters.json'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),attempts,winner,replay:winner?replay(winner):null};
 console.log(JSON.stringify(result,null,2));if(!winner)process.exitCode=1;
}
if(require.main===module)main();module.exports={choose,runPolicy,replay,defaults,TEAM};
