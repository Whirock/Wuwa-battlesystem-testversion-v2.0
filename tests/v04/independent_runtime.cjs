#!/usr/bin/env node
'use strict';
/* Independent runtime tests. Fixtures exercise the actual engine; never a mock battle. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const O=require('./independent_oracle.cjs');
const P=JSON.parse(fs.readFileSync(path.join(root,'parameters.json'),'utf8'));
const Engine=require(path.join(root,'engine.js'));
const result={schema:'independent-test4-runtime-1',runAt:new Date().toISOString(),command:'node tests/v04/independent_runtime.cjs',sha256:{},scope:'Real new engine; fixture cases are not normal-game victories.',passed:[],failed:[],notRun:[],coverage:{}};
for(const f of ['engine.js','skill-effects.js','parameters.json','storage.js'])if(fs.existsSync(path.join(root,f)))result.sha256[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
function test(name,fn){try{fn();result.passed.push(name);}catch(e){result.failed.push({name,error:String(e.message),stack:e.stack.split('\n').slice(0,4)});}}
function close(a,b,msg=''){assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-6,`${msg}: got ${a}, expected ${b}`);}
function keyOf(s){return s.id||s.skill_id;}
function eventRows(r,k){return (r.events||[]).filter(x=>x.event===k);}
function eqSnapshot(a,b){assert.deepEqual(a,b);}
function fallbackEncounter(){return Object.keys(P.encounters||{})[0];}
function construct(team,opts={}){return new Engine(P,{team,encounter:fallbackEncounter(),level:20,stochastic:false,...opts});}
function actor(e,key){return e.allies.find(a=>a.key===key);}
function fixture(key,opts={}){
 const partner=key==='lynae'?'mornye':'lynae';
 const elite=Object.keys(P.enemies||{}).find(k=>P.enemies[k].rank==='elite');
 const e=construct([key,partner],{encounter:elite?[elite,elite]:fallbackEncounter(),enemy_hp_scale:100,enemy_atk_scale:0,...opts});e.start();
 const a=actor(e,key);e._currentId=a.id;a.actedRound=0;a.bp=5;a.sp=a.maxsp;a.energy=0;a.cr=0;
 for(const t of e.enemies){t.hp=t.maxhp=1e8;t.q=t.maxq=1e6;t.cr=0;t.def=0;t.resist=Object.fromEntries(['glacio','fusion','electro','aero','spectro','havoc'].map(k=>[k,0]));}
 return {e,a,t:e.enemies[0],b:actor(e,partner)};
}
function setTurn(e,a,{advanceRound=false}={}){if(advanceRound)e.round++;e._currentId=a.id;a.actedRound=0;}
function act(e,a,key,t,opts={}){setTurn(e,a);const r=e.act(key,t?.id||t,{bp:0,...opts});assert.equal(r.ok,true,`${a.key}:${key}: ${r.reason}`);return r;}
function inspectFinite(e){
 for(const u of e.allies.concat(e.enemies)){
  for(const k of ['hp','maxhp','atk','def'])assert.ok(Number.isFinite(u[k]),`${u.key}.${k} finite`);
  assert.ok(u.hp>=0&&u.hp<=u.maxhp,`${u.key} HP bounds`);
  if(u.side==='ally'){for(const k of ['sp','maxsp','bp','energy','energyCap'])assert.ok(Number.isFinite(u[k]),`${u.key}.${k} finite`);assert.ok(u.sp>=0&&u.sp<=u.maxsp);assert.ok(u.bp>=0&&u.bp<=5);assert.ok(u.energy>=0&&u.energy<=u.energyCap);}
  else assert.ok(u.q>=0&&u.q<=u.maxq,`${u.key} Q bounds`);
 }
}
// Deliberate fail-closed gate: old AP implementation must not be reported as new framework coverage.
const keys=O.profiles.map(p=>p.key);
const missing=keys.filter(k=>!P.characters?.[k]);
if(missing.length){result.notRun.push(`New framework unavailable: missing profiles ${missing.join(', ')}`);process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=2;return;}
try{const e=construct(['amy']);if(!('bp' in e.allies[0])||!('sp' in e.allies[0])||'ap' in e.allies[0])throw Error('new BP/SP state absent or old AP present');}
catch(e){result.notRun.push(`New framework unavailable: ${e.message}`);process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=2;return;}

test('roster: exactly 9 configurations / 61 cards',()=>{assert.equal(keys.length,9);assert.equal(O.profiles.reduce((n,p)=>n+p.skills.length,0),61);for(const p of O.profiles)for(const s of p.skills)assert.ok(P.characters[p.key].skills[keyOf(s)],`${p.key}:${keyOf(s)} missing`);});
test('roster: reject two Rover configurations',()=>assert.throws(()=>construct(['rover_spectro','rover_havoc'])));
test('roster: reject duplicate actor and five members',()=>{assert.throws(()=>construct(['amy','amy']));assert.throws(()=>construct(['amy','lynae','mornye','denia','chisa']));});
test('initial resources: full HP/SP, BP1, energy0',()=>{for(const k of keys){const e=construct([k]);const a=e.allies[0];assert.equal(a.hp,a.maxhp);assert.equal(a.sp,a.maxsp);assert.equal(a.bp,1);assert.equal(a.energy,0);}});
for(const p of O.growth.profiles){
 const key=p[0]==='aemeath'?'amy':p[0];
 test(`growth: ${key} levels 1..90 / eight stats`,()=>{for(let L=1;L<=90;L++){
  const a=construct([key],{level:L}).allies[0];const t=(L-1)/89,g=.7*t+.3*t*t;
  const vals=p.slice(3);const pairs={maxhp:[0,g],maxsp:[2,t],atk:[4,g],def:[6,g],spd:[8,t]};
  for(const [stat,[i,alpha]]of Object.entries(pairs))assert.equal(a[stat],Math.floor(vals[i]+(vals[i+1]-vals[i])*alpha+.5),`${key} ${L} ${stat}`);
  const cr=Math.round((vals[10]+(vals[11]-vals[10])*t)*10)/10;
  const er=Math.round((vals[12]+(vals[13]-vals[12])*t)*10)/10+(key==='mornye'?10:0);
  close(a.cr,cr/100,`${key} ${L} cr`);close(a.er,er/100,`${key} ${L} er`);close(a.cdmg,1.5);close(a.energyCap,vals[14]);
 }});
}
for(const key of keys){
 test(`basic:${key}: BP0..3 real attacks and root energy`,()=>{for(let bp=0;bp<=3;bp++){
  const {e,a,t,b}=fixture(key);const sk=O.profiles.find(p=>p.key===key).skills.find(s=>s.numeric_audit.role_class==='basic');
  const before={sp:a.sp,bp:a.bp,q:t.q,be:b.energy};const r=act(e,a,keyOf(sk),t,{bp});
  assert.equal(eventRows(r,'action_commit').length,1);assert.equal(eventRows(r,'original_attack').length,bp+1);assert.equal(a.sp,before.sp);assert.equal(a.bp,before.bp-bp);
  close(before.q-t.q,[6,8.1,9.6,10.8][bp],`${key} Q`);close(a.energy,15*a.er,`${key} self B`);close(b.energy-before.be,15*.5*b.er,`${key} shared B`);
 }});
}
test('illegal BP mutation-free',()=>{for(const bp of [-1,4,1.5,NaN]){const {e,a,t}=fixture('amy');const before=e.snapshot();const r=e.act('A',t.id,{bp});assert.equal(r.ok,false);eqSnapshot(e.snapshot(),before);}});
test('insufficient SP mutation-free',()=>{const {e,a,t}=fixture('amy');a.sp=0;const before=e.snapshot();assert.equal(e.act('E2',t.id,{bp:0}).ok,false);eqSnapshot(e.snapshot(),before);});
test('invalid target mutation-free',()=>{const {e}=fixture('amy');const before=e.snapshot();assert.equal(e.act('E2','enemy:nonexistent',{bp:0}).ok,false);eqSnapshot(e.snapshot(),before);});
test('dead target mutation-free',()=>{const {e,t}=fixture('amy');t.hp=0;t.dead=true;const before=e.snapshot();assert.equal(e.act('E2',t.id,{bp:0}).ok,false);eqSnapshot(e.snapshot(),before);});
test('one action per normal actor slot',()=>{const {e,a,t}=fixture('amy');const r=e.act('A',t.id,{bp:0});assert.equal(r.ok,true);assert.notEqual(e.currentId,a.id);});
test('energy uses receiver ER and ignores producer cap',()=>{const {e,a,t,b}=fixture('amy');a.energy=a.energyCap;a.er=3;b.er=2;const r=act(e,a,'A',t);assert.equal(r.ok,true);close(b.energy,15);close(a.energy,a.energyCap);});
test('normal enemy has no resonance gauge',()=>{const commons=Object.keys(P.enemies).filter(k=>P.enemies[k].rank==='common');assert.ok(commons.length);for(const key of commons){const e=construct(['amy'],{encounter:[key]});assert.equal(e.enemies[0].maxq,0);}});
// Additional focused, card-matrix, persistence and legal-strategy tests are registered below.
const context={assert,fs,path,root,O,P,Engine,result,test,close,keyOf,eventRows,eqSnapshot,fallbackEncounter,construct,actor,fixture,setTurn,act,inspectFinite,keys};
for(const f of ['independent_cards.cjs','independent_effects.cjs','independent_variants.cjs','independent_boss.cjs','independent_persistence.cjs','independent_matrix.cjs']){if(fs.existsSync(path.join(__dirname,f)))require('./'+f)(context);else result.notRun.push(`${f} not yet implemented`);}
if(process.env.INDEPENDENT_MATRIX==='0')result.command='INDEPENDENT_MATRIX=0 node tests/v04/independent_runtime.cjs';
result.totals={passed:result.passed.length,failed:result.failed.length,notRun:result.notRun.length};
process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=result.failed.length?1:0;
