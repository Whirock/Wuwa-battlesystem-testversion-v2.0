'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=process.env.QA_ROOT||process.cwd(),OUT=process.env.QA_OUT||__dirname;
const Engine=require(path.join(ROOT,'engine.js')),P=JSON.parse(fs.readFileSync(path.join(ROOT,'parameters.json')));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
const hashes=Object.fromEntries(['engine.js','parameters.json','parameters.js'].map(f=>[f,sha(f)]));
const keys=Object.keys(P.characters);let teams=keys.map(k=>[k]);
for(let i=0;i<keys.length;i++)teams.push([keys[i],keys[(i+1)%keys.length]]);
for(let i=0;i<keys.length;i++)teams.push([keys[i],keys[(i+1)%keys.length],keys[(i+2)%keys.length]]);
for(let i=0;i<keys.length;i++)teams.push([keys[i],keys[(i+1)%keys.length],keys[(i+2)%keys.length],keys[(i+3)%keys.length]]);
teams=teams.filter((t,i)=>teams.findIndex(u=>JSON.stringify(u)===JSON.stringify(t))===i);
const scenarios=teams.map(team=>({team,mode:null}));for(let mode of ['havoc','aero','electro'])for(let team of [['rover'],['rover','lynae','mornye','chisa']])scenarios.push({team,mode});
const results=[],errors=[];let checks=0,steps=0;
function rng(seed){let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
for(let scenario of scenarios)for(let encounter of Object.keys(P.encounters))for(let difficulty of Object.keys(P.difficulties))for(let policy of ['auto','mixed']){
 const {team,mode}=scenario;const seed=1000+results.length*17,random=rng(seed);let b=new Engine(P,{team,encounter,difficulty,stochastic:true,seed,...(mode?{mode:{rover:mode}}:{})}),n=0,restores=0; b.start();
 try{
  while(!b.result&&b.round<=60&&n++<6000){
   let before=b.snapshot(),restored=Engine.restore(P,before);assert.deepStrictEqual(restored.snapshot(),before);restores++;checks++;
   let r,mirror;
   if(policy==='auto'||b.current.side==='enemy') {r=b.autoAction();mirror=restored.autoAction();}
   else{
    const options=b.availableActions().filter(a=>a.enabled&&!['retreat','negotiate','wait'].includes(a.key));
    const relays=b.availableConcertos().filter(c=>c.enabled&&c.actor===b.current.id);
    if(relays.length&&random()<.45){const c=relays[0],target=c.targets[Math.floor(random()*c.targets.length)];r=b.concerto(c.actor,target);mirror=restored.concerto(c.actor,target);}
    else {let choices=options.filter(a=>a.key!=='end');if(!choices.length||random()<.12)choices=options;assert.ok(choices.length,'no legal progress');let a=choices[Math.floor(random()*choices.length)],target=a.targets?.[Math.floor(random()*a.targets.length)]||b.current.id;r=b.act(a.key,target);mirror=restored.act(a.key,target);}
   }
   assert.ok(r.ok,r.reason);assert.deepStrictEqual(r,mirror);assert.deepStrictEqual(b.snapshot(),restored.snapshot());
   for(let a of b.allies){assert.ok(Number.isInteger(a.ap)&&a.ap>=0&&a.ap<=6);assert.ok(Number.isInteger(a.temp_ap)&&a.temp_ap>=0&&a.temp_ap<=2);assert.ok(a.concerto>=0&&a.concerto<=100);}
   for(let e of b.enemies){assert.ok(e.shield>=0&&e.shield<=e.maxshield);if(e.rank==='common')assert.equal(e.shield,0);}
   b.validate();steps++;
  }
  assert.ok(n<6000,'action bound reached');
  results.push({team,mode,encounter,difficulty,policy,seed,steps:n,restores,...b.summary(),actual_enemy_windows:b.enemies.reduce((n,e)=>n+e.normal_count,0),enemy_damaging_windows:b.log.filter(x=>x.event==='enemy_action'&&b.getUnit(x.actor)?.skills[x.skill]?.coef>0).length,first_break_round:b.log.find(x=>x.event==='break')?.round||null});
 }catch(e){errors.push({team,mode,encounter,difficulty,policy,seed,step:n,error:e.stack});results.push({team,mode,encounter,difficulty,policy,seed,error:e.message});}
}
const out={scope:'Independent actual engine runs; auto is implementation policy, mixed is seeded independent legal-action policy, 60-round observation window. Not human fun testing or optimal-balance certification.',timestamp:new Date().toISOString(),hashes,unchanged:Object.entries(hashes).every(([f,h])=>sha(f)===h),teamCount:teams.length,scenarioCount:scenarios.length,runCount:results.length,steps,restoreChecks:checks,errors,results};
fs.writeFileSync(path.join(OUT,'matrix_e_independent_results.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify({runCount:out.runCount,steps,restoreChecks:checks,errorCount:errors.length,unchanged:out.unchanged,outcomes:results.reduce((o,x)=>(o[x.error?'error':x.outcome]=(o[x.error?'error':x.outcome]||0)+1,o),{}),errors:errors.slice(0,4)},null,2));process.exitCode=errors.length||!out.unchanged?1:0;
