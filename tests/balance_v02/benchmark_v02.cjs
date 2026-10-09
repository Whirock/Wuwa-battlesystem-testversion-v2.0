'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),E=require(root+'/engine.js'),P=require(root+'/parameters.json');
const teams={relay3:['amy','lynae','mornye'],mixed4:['amy','lynae','mornye','denia'],status4:['lynae','mornye','denia','chisa'],duo2:['amy','mornye']};
// Calls the same public manual command as the UI. This is a scripted API test, not a human playtest.
function step(b,cooperate){
 if(b.current.side==='enemy')return b.stepEnemy();
 if(cooperate)for(const donor of b.living('ally')){
  const targets=b.living('ally').filter(t=>t.acted_round!==b.round&&!b.has(t,'outro')&&(t.id!==donor.id||b.living('ally').length===1)).sort((x,y)=>(y.key==='amy')-(x.key==='amy')||y.atk-x.atk);
  if(targets[0]&&!b.validateConcerto(donor.id,targets[0].id))assert.ok(b.concerto(donor.id,targets[0].id).ok);
 }
 const [skill,target]=b._choose(b.current);assert.ok(b.availableActions().find(s=>s.key===skill&&s.enabled));return b.act(skill,target.id);
}
const results=[],logs={};
for(const [teamName,team] of Object.entries(teams))for(const difficulty of Object.keys(P.difficulties))for(const encounter of Object.keys(P.encounters))for(const style of ['cooperative','no_concerto','self_focus']){
 const policy=style==='self_focus'?'no_teamwork':'tactical',b=new E(P,{team,difficulty,encounter,policy,level:20,auto_concerto:false});b.start();let steps=0;
 while(!b.result&&b.round<=60&&steps++<3000){const r=step(b,style==='cooperative');assert.ok(r.ok,r.reason);b.validate();}
 const s=b.summary(),row={teamName,team,difficulty,encounter,style,policy,steps,...s,firstReadyByActor:Object.fromEntries(b.allies.map(a=>[a.key,b.log.find(e=>e.event==='concerto_ready'&&e.actor===a.id)?.round||null])),enemySpecialSkills:Object.fromEntries(Object.entries(b.enemy_actions).filter(([k,v])=>b.enemies.some(e=>e.skills[k]?.special))),chargeWarnings:b.count.charge_warnings||0,chargeInterrupts:b.count.charge_interrupts||0,chargeReleases:b.count.charge_releases||0,manualConcertos:b.count.manual_concertos||0,automaticConcertos:b.count.automatic_concertos||0,firstConcerto:b.log.find(e=>e.event==='concerto')?.round||null,benefits:{directAndStatusBonus:b.count.buff_bonus_damage||0,mitigationAndBarrier:b.count.mitigation_prevented||0,cutline:b.count.cutline_prevented||0,tuneResource:b.count.teamwork_resource||0,healing:b.count.heal||0,cleanses:b.count.cleansed||0},roles:Object.fromEntries(b.allies.map(a=>[a.key,Object.fromEntries(Object.keys(a.skills).map(k=>[k,b.log.filter(e=>e.event==='action'&&e.actor===a.id&&e.skill===k).length]))]))};
 results.push(row);
 if((teamName==='relay3'||teamName==='mixed4'||teamName==='status4')&&encounter==='boss'&&style!=='self_focus')logs[`${teamName}_${difficulty}_${style}`]=b.log;
}
fs.writeFileSync(__dirname+'/benchmark_v02_results.json',JSON.stringify({scope:'JavaScript-only deterministic fixed-policy matrix. All live commands public; no injected resources, HP, or enemy state. Same damage/heal choices for cooperative/no_concerto; self_focus skips optional survey/field/cut and concerto but incidental marks from offensive skills remain. Test items available to all but not used by these policies. Sixty rounds is observation limit, not automatic defeat.',parameters:P.schema_version,results},null,2));
fs.writeFileSync(__dirname+'/benchmark_v02_boss_logs.json',JSON.stringify(logs,null,2));
console.log('cases',results.length,'outcomes',results.reduce((a,r)=>(a[r.outcome]=(a[r.outcome]||0)+1,a),{}));
console.log(results.filter(r=>r.style==='cooperative'&&r.teamName!=='duo2').map(r=>({team:r.teamName,difficulty:r.difficulty,encounter:r.encounter,outcome:r.outcome,rounds:r.rounds,HP:r.ally_hp_fraction,min:Math.min(...Object.values(r.min_hp_fraction)),KO:r.ko_count,ready:r.first_concerto_ready_round,manual:r.manualConcertos,charge:[r.chargeWarnings,r.chargeInterrupts,r.chargeReleases],skills:r.enemySpecialSkills})));
