const E=require('../../engine.js'),P=require('../../parameters.json'),fs=require('fs');
function concertos(b){for(const donor of b.living('ally')){const targets=b.living('ally').filter(t=>t.acted_round!==b.round&&!b.has(t,'outro')&&(t.id!==donor.id||b.living('ally').length===1)).sort((x,y)=>(y.key==='amy')-(x.key==='amy')||y.atk-x.atk);if(targets[0]&&!b.validateConcerto(donor,targets[0]))b.concerto(donor.id,targets[0].id);}}
function canInterrupt(b,enemy){const sim=E.restore(P,b.snapshot());let n=0;while(!sim.result&&n++<20){const e=sim.getUnit(enemy.id);if(e.broken_until>=sim.round)return true;if(sim.current.id===e.id)return false;if(sim.current.side==='enemy')sim.stepEnemy();else{concertos(sim);const[k,t]=sim._choose(sim.current);const r=sim.act(k,t.id);if(!r.ok)return false;}}return false;}
function decision(b){const a=b.current,charged=b.living('enemy').find(e=>e.status.charge||e.status.aim),worst=b.living('ally').slice().sort((x,y)=>x.hp/x.maxhp-y.hp/y.maxhp)[0];
 if(charged&&!canInterrupt(b,charged)){
  const intent=b.enemyIntent(charged.id),atRisk=intent.targets.includes(a.id);
  if(a.key==='mornye'&&a.rsc.calibration>=60&&b.living('ally').filter(t=>t.hp/t.maxhp<.6).length>=2&&a.hp/a.maxhp>.55)return ['restore',worst];
  if(atRisk)return ['guard',a];
 }
 if(worst.hp/worst.maxhp<.24&&b.inventory.repair>0)return ['item_repair',worst];
 return b._choose(a);
}
const results=[];
for(const team of [['amy','lynae','mornye'],['amy','lynae','mornye','denia'],['lynae','mornye','denia','chisa'],['amy','lynae','mornye','chisa']]){let b=new E(P,{team,encounter:'boss',difficulty:'challenge'});b.start();while(!b.result&&b.round<70){if(b.current.side==='enemy')b.stepEnemy();else{concertos(b);const[k,t]=decision(b),r=b.act(k,t.id);if(!r.ok)throw Error(r.reason)}}results.push({team,...b.summary(),log:b.log});}
fs.writeFileSync(__dirname+'/reactive_policy_results.json',JSON.stringify({scope:'Supplemental, not an optimal-player or win-rate claim. All live actions public and legal. Charge planner clones the current state and checks the already visible fixed-speed pre-enemy sequence using the same base action policy; if no interrupt is predicted, exposed actors guard. Both charges and life-saving 30% repair items are finite/action-costed. No resource injection.',results},null,2));console.log(results.map(r=>({team:r.team,outcome:r.outcome,rounds:r.rounds,hp:r.ally_hp_fraction,ko:r.ko_count,guard:r.skills.guard,items:r.skills.item_repair,concerto:r.counts.manual_concertos})));
