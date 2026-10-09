const fs=require('fs'),assert=require('assert/strict'),E=require('../../engine.js'),P=require('../../parameters.json');
const b=new E(P,{team:['amy','lynae','mornye','denia'],encounter:'boss',difficulty:'standard'});b.start();
// Real zero-resource opening. Keep the boss alive and preserve its first charge.
while(!b.result&&!b.enemies[0].status.charge){if(b.current.side==='enemy')b.stepEnemy();else b.act('guard',b.current.id);}
assert.ok(b.enemies[0].status.charge);const snapshot=b.snapshot(),from=b.log.length,results=[];
for(const strategy of ['guard','unguarded_basic','support_heal']){
 const c=E.restore(P,snapshot),boss=c.enemies[0];const preHP=Object.fromEntries(c.allies.map(a=>[a.key,a.hp]));
 while(!c.result&&!c.log.slice(from).some(e=>e.event==='charge_released')){
  if(c.current.side==='enemy')c.stepEnemy();else{
   const a=c.current;let key=strategy==='guard'?'guard':'basic',target=key==='guard'?a:boss;
   if(strategy==='support_heal'&&a.key==='mornye'){const worst=c.living('ally').sort((x,y)=>x.hp/x.maxhp-y.hp/y.maxhp)[0];const heal=c.availableActions().find(s=>s.key==='item_repair');if(heal.enabled){key='item_repair';target=worst;}}
   assert.ok(c.act(key,target.id).ok);
  }
 }
 const ev=c.log.slice(from);results.push({strategy,startRound:snapshot.state.round,preHP,postHP:Object.fromEntries(c.allies.map(a=>[a.key,a.hp])),chargeDamage:ev.filter(e=>e.event==='damage'&&e.actor===boss.id).map(e=>({target:e.target,amount:e.amount,mitigation:e.mitigation})),healing:ev.filter(e=>e.event==='heal'),skills:ev.filter(e=>e.event==='action').map(e=>({actor:e.actor,skill:e.skill})),release:ev.some(e=>e.event==='charge_released')});
}
assert.ok(results[0].chargeDamage.reduce((n,e)=>n+e.amount,0)<results[1].chargeDamage.reduce((n,e)=>n+e.amount,0));
fs.writeFileSync(__dirname+'/charge_counterplay_results.json',JSON.stringify({scope:'Three legal continuations of the exact same naturally reached charged boss snapshot. Guard avoids damage but forgoes attacks; unguarded attacks cause damage and build resources; repair uses finite inventory and one normal action. Successful natural break interrupts are independently shown in the full-battle matrix.',snapshot,results},null,2));
console.log(results.map(r=>({strategy:r.strategy,damage:r.chargeDamage.reduce((n,e)=>n+e.amount,0),postHP:r.postHP,release:r.release})));
