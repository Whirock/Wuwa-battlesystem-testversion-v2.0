'use strict';
// Independent small policies, not an optimal solver and not the implementation's AI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),A=require('node:assert/strict');
const ROOT=process.env.QA_ROOT||process.cwd(),OUT=process.env.QA_OUT||__dirname,E=require(path.join(ROOT,'engine.js')),P=JSON.parse(fs.readFileSync(path.join(ROOT,'parameters.json')));
const teams=[['amy','lynae','mornye','chisa'],['amy','lynae','denia','chisa'],['rover','lynae','mornye','chisa'],['rover','amy','denia','mornye']];
const hashes=Object.fromEntries(['engine.js','parameters.json'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')]));
function choose(b,policy){
 const a=b.current,e=b.living('enemy')[0],actions=b.availableActions().filter(x=>x.enabled),intent=b.enemyIntent(e.id),budget=a.ap+a.temp_ap;
 const legal=k=>actions.find(x=>x.key===k),act=(k,t=e)=>[k,t.id];
 if(policy==='basic')return legal('basic')?act('basic'):act('end',a);
 const danger=intent&&!intent.hidden&&(intent.aoe||intent.targets?.includes(a.id)||intent.part);
 if(policy==='part'&&e.part&&e.part.hp>0&&legal('disrupt_part'))return act('disrupt_part');
 if((policy==='guard'||policy==='part')&&danger&&budget<=3&&legal('guard'))return act('guard',a);
 if(policy==='guard'||policy==='part')return legal('basic')?act('basic'):act('end',a);
 // Fully reactive policy uses explicit paid resource/health/counterplay decisions.
 if(a.concerto>=100&&a.window_actions>0&&budget<=1){let c=b.availableConcertos().find(x=>x.actor===a.id&&x.enabled);if(c)return ['concerto',c.targets[0]];}
 const worst=b.living('ally').slice().sort((x,y)=>(y.maxhp-y.hp)-(x.maxhp-x.hp))[0],missing=worst.maxhp-worst.hp;
 if(missing>=300){let heals=actions.filter(x=>x.targets.includes(worst.id)&&(x.heal_scale||x.heal_fraction));heals.sort((x,y)=>(y.healingPreview?.amount||worst.maxhp*y.heal_fraction||0)-(x.healingPreview?.amount||worst.maxhp*x.heal_fraction||0));if(heals.length&&(worst.hp/worst.maxhp<.65||missing>650))return act(heals[0].key,worst);}
 if(e.part&&e.part.hp>0&&legal('disrupt_part'))return act('disrupt_part');
 if(e.status.brace&&legal('feint')&&budget>=3)return act('feint');
 if(danger&&budget<=3&&legal('guard'))return act('guard',a);
 if(legal('field')&&b.field_until<b.round&&b.living('ally').length>=3)return act('field',a);
 let damage=actions.filter(s=>s.targets.includes(e.id)&&s.coef>0&&s.key!=='retreat');
 damage.sort((x,y)=>{const score=s=>{let v=b.previewDamage(a.id,s.key,e.id)?.amount||0;return(v+(danger?5:1.5)*(s.resonanceDamage||s.resonance_damage||0))/s.apCost;};return score(y)-score(x)});
 if(damage.length)return act(damage[0].key);return act('end',a);
}
let results=[];
for(const team of teams)for(const policy of ['basic','guard','part','reactive'])for(let seed=1;seed<=10;seed++){
 let b=new E(P,{team,encounter:'boss',difficulty:'standard',seed,stochastic:true,auto_concerto:false});b.start();let steps=0,error=null;
 try{while(!b.result&&b.round<=40&&steps++<3000){let r;if(b.current.side==='enemy')r=b.stepEnemy();else{const [key,target]=choose(b,policy);r=key==='concerto'?b.concerto(b.current.id,target):b.act(key,target);}A.ok(r.ok,r.reason);}E.restore(P,b.snapshot());}catch(e){error=e.stack;}
 const s=b.summary();results.push({team,policy,seed,steps,error,...s,damageWindows:b.log.filter(x=>x.event==='enemy_action'&&b.getUnit(x.actor).skills[x.skill].coef>0).length,firstBreakRound:b.log.find(x=>x.event==='break')?.round||null});
}
const groups=[];for(let team of teams)for(let policy of ['basic','guard','part','reactive']){let rows=results.filter(x=>x.policy===policy&&JSON.stringify(x.team)===JSON.stringify(team)),mean=k=>Math.round(rows.reduce((n,x)=>n+(typeof k==='function'?k(x):x[k]||0),0)/rows.length*100)/100;groups.push({team,policy,runs:rows.length,wins:rows.filter(x=>x.outcome==='win').length,losses:rows.filter(x=>x.outcome==='loss').length,inconclusive:rows.filter(x=>x.outcome==='inconclusive').length,errors:rows.filter(x=>x.error).length,meanRounds:mean('rounds'),meanDamageWindows:mean('damageWindows'),meanBreaks:mean(x=>x.counts.breaks||0),meanReleases:mean(x=>x.counts.charge_releases||0),meanHealingAP:mean(x=>x.counts.healing_ap||0),meanJointDamage:mean(x=>x.counts.joint_damage||0)});}
let out={scope:'Independent 160 standard level20 Boss runs, 4 teams x 4 bounded policies x 10 stochastic seeds. Basic: only basic/end. Guard: basic, reserving1AP to guard warned threats. Part: attacks exposed parts, otherwise guard/basic. Reactive: greedy damage/paid healing/parts/field/outro. None is proven optimal or human-play certification.',hashes,unchanged:Object.entries(hashes).every(([f,h])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')===h),groups,results};fs.writeFileSync(path.join(OUT,'boss_e_independent_results.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({unchanged:out.unchanged,groups,errors:results.filter(x=>x.error)},null,2));process.exitCode=results.some(x=>x.error)||!out.unchanged?1:0;
