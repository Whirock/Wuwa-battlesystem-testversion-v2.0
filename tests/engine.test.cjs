'use strict';
/* Run: node --test tests/engine.test.cjs (Node 18+). All tests execute the shipped JS engine. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BattleEngine = require('../engine.js');
const P = JSON.parse(fs.readFileSync(path.join(__dirname,'../parameters.json'),'utf8'));
const create = (team=['amy'],encounter='boss',extra={}) => {const b=new BattleEngine(P,{team,encounter,...extra});b.start();return b;};
const state = b => JSON.stringify(b.snapshot());
function turn(b,key) {
  // Integration tests advance intervening REAL enemy slots and use explicit guard for other allies.
  let n=0;while(!b.result&&b.current.key!==key&&n++<100){const r=b.current.side==='enemy'?b.stepEnemy():b.act('guard',b.current.id);assert.ok(r.ok,r.reason);}
  assert.equal(b.current?.key,key);return b.current;
}
function action(b,actor,key,target) {const a=turn(b,actor);return b.act(key,(target||b.living('enemy')[0]||a).id);}
function fixture(team=['amy'],encounter='boss') {
  const b=create(team,encounter,{enemy_atk_scale:0});for(const e of b.enemies)e.hp=e.maxhp=1000000;return b;
}
function run(b,roundLimit=60) {let steps=0;while(!b.result&&b.round<=roundLimit&&steps++<5000){const r=b.autoAction();assert.ok(r.ok,`${b.current?.key}: ${r.reason}`);}assert.ok(steps<5000,'progress bound');return b.summary();}
function lowLevelAction(b,a,key,t) {const reason=b._skillReason(a,key,b.getSkill(a,key));assert.equal(reason,'');b._actAlly(a,key,t);b.validate();}

test('CommonJS and browser export the same constructor API',()=>{
  assert.equal(typeof BattleEngine,'function');const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8'),context);assert.equal(typeof context.BattleEngine,'function');
});
test('constructor enforces 1–4 unique allies, encounter and level; params stay unmodified',()=>{
  const before=JSON.stringify(P);for(const team of [[],['amy','amy'],Object.keys(P.characters),['not-found']])assert.throws(()=>new BattleEngine(P,{team}));
  for(const level of [0,61,NaN,10.5])assert.throws(()=>new BattleEngine(P,{level}));
  assert.throws(()=>new BattleEngine(P,{encounter:[]}));assert.throws(()=>new BattleEngine(P,{mode:{amy:'invalid'}}));
  const b=create(['amy'],'boss',{level:1});assert.equal(b.allies[0].maxhp,945);assert.equal(b.allies[0].atk,149);assert.equal(b.allies[0].speed,110);assert.equal(JSON.stringify(P),before);
});
test('start is idempotent; constructor does not execute actions; inspect methods have no side effects',()=>{
  const b=new BattleEngine(P,{team:['amy'],encounter:'boss'});assert.equal(b.round,0);assert.equal(b.current,null);assert.equal(b.availableActions(b.allies[0].id)[0].enabled,false);b.start();const before=state(b);assert.deepEqual(b.start(),[]);b.availableActions();b.availableConcertos();b.enemyIntent(b.enemies[0].id);b.validateAction(b.current,'finale',b.enemies[0]);b.advance();assert.equal(state(b),before);
});
test('fixed speed order, ally tie priority, and FIFO wait retain exactly one token',()=>{
  const b=create(['lynae','amy','mornye'],'normal');assert.equal(b.current.key,'lynae');const actor=b.current,roundNo=b.round,prior=b.queue.slice();assert.ok(b.wait().ok);assert.equal(actor.wait_round,roundNo);assert.deepEqual(b.queue,prior.slice(1).concat(actor.id));assert.equal(b.current.key,'predator');
  turn(b,'lynae');const before=state(b);assert.equal(b.wait().ok,false);assert.equal(state(b),before);assert.ok(b.act('basic',b.enemies[0].id).ok);assert.equal(b.log.filter(x=>x.round===roundNo&&x.event==='action'&&x.actor===actor.id).length,1);
  const p=JSON.parse(JSON.stringify(P));p.characters.amy.speed=p.enemies.crownless.speed;const tied=new BattleEngine(p,{team:['amy'],encounter:'boss'});tied.start();assert.equal(tied.current.side,'ally');
});
test('normal actions cannot run an ally twice or execute enemy attacks implicitly',()=>{
  const b=create(['amy'],'boss');const before=b.allies[0].hp;assert.ok(b.act('basic',b.enemies[0].id).ok);assert.equal(b.current.side,'enemy');assert.equal(b.allies[0].hp,before);const saved=state(b);assert.equal(b.act('basic',b.enemies[0].id).ok,false);assert.equal(state(b),saved);assert.ok(b.stepEnemy().ok);assert.ok(b.allies[0].hp<before);assert.equal(b.round,2);
});
test('every invalid action is atomic and includes Chinese disabled reasons',()=>{
  const b=create(['amy'],'boss');for(const [key,target] of [['finale',b.enemies[0].id],['enhanced',b.enemies[0].id],['heavy',b.enemies[0].id],['basic',b.current.id],['guard',b.enemies[0].id],['basic','missing'],['encourage',b.current.id],['negotiate',b.enemies[0].id],['xxx',b.enemies[0].id],['__proto__',b.enemies[0].id],['constructor',b.enemies[0].id],['toString',b.enemies[0].id]]){const before=state(b),r=b.act(key,target);assert.equal(r.ok,false);assert.match(r.reason,/[\u3400-\u9fff]/);assert.deepEqual(r.events,[]);assert.equal(state(b),before);}
  for(const a of b.availableActions())if(!a.enabled)assert.ok(a.reason);
});
test('legal targets respect ally, other ally, self, enemy, KO and retreat',()=>{
  const b=create(['lynae','mornye','amy'],'boss');let a=b.current;assert.deepEqual(b.availableActions().find(s=>s.key==='encourage').targets,b.allies.slice(1).map(u=>u.id));assert.deepEqual(b.availableActions().find(s=>s.key==='guard').targets,[a.id]);
  b.allies[1].hp=0;b._kill(b.allies[1]);assert.ok(!b.availableActions().find(s=>s.key==='encourage').targets.includes(b.allies[1].id));
  assert.ok(b.act('retreat',a.id).ok);a=turn(b,'amy');assert.deepEqual(b.availableActions().find(s=>s.key==='encourage').targets,[]);
});
test('effective action gains once per AOE, overheal grants nothing, resources capped',()=>{
  const b=create(['denia'],'normal');turn(b,'denia');assert.ok(b.act('stage',b.enemies[0].id).ok);assert.equal(b.allies[0].rsc.expectation,35);assert.equal(b.allies[0].concerto,30);
  const h=fixture(['mornye']);const a=turn(h,'mornye');a.hp=a.maxhp;a.rsc.calibration=30;assert.ok(h.act('heal',a.id).ok);assert.equal(a.concerto,0);assert.equal(a.rsc.calibration,0);
  h._resource(a,'calibration',1000);assert.equal(a.rsc.calibration,100);h._resource(a,'calibration',-1000);assert.equal(a.rsc.calibration,0);
});
test('healing cannot resurrect and rejected KO-target heals are mutation free',()=>{
  const b=fixture(['amy','mornye']);b.allies[0].hp=0;b._kill(b.allies[0]);b._currentId=null;b.advance();const a=turn(b,'mornye');a.rsc.calibration=30;const before=state(b);assert.equal(b.act('heal',b.allies[0].id).ok,false);assert.equal(state(b),before);assert.equal(b.allies[0].hp,0);
});
test('KO clears resources, form, buffs, concerto, and owner-dependent enemy markers',()=>{
  const b=fixture(['amy','lynae']);const a=b.allies[0],e=b.enemies[0];a.rsc={sync:200,resonance:4};a.concerto=100;a.form='mech';a.overdrive=true;a.status.guard={expires:2};e.status.tune={owner:a.id,expires:2};a.hp=0;b._kill(a);assert.equal(a.form,'human');assert.equal(a.overdrive,false);assert.equal(a.concerto,0);assert.deepEqual(a.rsc,{sync:0,resonance:0});assert.deepEqual(a.status,{});assert.equal(e.status.tune,undefined);
});
test('weakness is element OR weapon; repeated shield packets share a 3 point action budget',()=>{
  const b=fixture();const a=b.allies[0],e=b.enemies[0];assert.ok(b.isweak(a,e));e.shield=8;for(let i=0;i<8;i++)b._shieldDamage(a,e,2);assert.equal(e.shield,5);e.weak_elements=[];e.weak_weapons=[];b.action_id++;b._shieldDamage(a,e,3);assert.equal(e.shield,5);b._shieldDamage(a,e,1,true);assert.equal(e.shield,4);
});
test('pry plus tune remains exactly one shield, with separate status damage',()=>{
  const b=fixture(['amy','lynae']);const a=turn(b,'amy'),e=b.enemies[0];e.status.tune={owner:b.allies[1].id,expires:b.round+1};const shield=e.shield;assert.ok(b.act('pry',e.id).ok);assert.equal(e.shield,shield-1);assert.ok(b.log.some(x=>x.event==='damage'&&x.status_damage));
});
test('breaking packet and same-action status use action-start multiplier, following action gets 1.5x',()=>{
  const b=fixture(['amy','lynae']);const a=turn(b,'amy'),e=b.enemies[0];e.shield=1;e.status.tune={owner:b.allies[1].id,expires:b.round+1};const r=b.act('basic',e.id),damage=r.events.filter(x=>x.event==='damage');assert.equal(damage[0].amount,133);assert.equal(damage[1].amount,58);assert.ok(damage.every(x=>!x.broken_bonus));const n=b._damage(a,e,1);assert.equal(n,200);
});
test('break lasts through r+1, skips enemy, restores r+2 and protects elite until real action',()=>{
  const b=fixture();const a=b.allies[0],e=b.enemies[0];e.shield=1;assert.ok(b.act('basic',e.id).ok);assert.equal(e.broken_until,2);assert.equal(b.round,2);assert.equal(b.current.id,a.id);assert.equal(e.normal_count,0);assert.ok(b.act('guard',a.id).ok);assert.equal(b.round,3);assert.equal(e.broken_until,0);assert.equal(e.shield,P.enemies.crownless.shield);assert.equal(e.recovery_lock,true);
  for(let i=0;i<20;i++){b.action_id++;b._shieldDamage(a,e,3);}assert.equal(e.shield,1);assert.ok(b.act('guard',a.id).ok);assert.equal(b.current.id,e.id);assert.ok(b.stepEnemy().ok);assert.equal(e.recovery_lock,false);b.action_id++;b._shieldDamage(a,e,1);assert.equal(e.shield,0);
});
test('Amy alternate route reaches finisher and form/resource pools remain shared',()=>{
  const b=fixture();const a=b.allies[0],e=b.enemies[0];for(const key of ['basic','basic','enhanced','basic','basic','enhanced','heavy','finale'])assert.ok(action(b,'amy',key,e).ok,key);assert.deepEqual(a.rsc,{sync:0,resonance:0});assert.equal(a.form,'human');assert.equal(b.count.finales,1);assert.equal(a.maxhp,1800);
});
test('Denia blue entries 80/90/100 have legal exits; blue basic uses override cost/gain',()=>{
  for(const start of [80,90,100]){const b=fixture(['denia']),a=turn(b,'denia'),e=b.enemies[0];a.rsc.expectation=start;assert.ok(b.act('breakdown',e.id).ok);assert.equal(a.form,'blue');assert.deepEqual(b.getSkill(a,'basic').gain,{});assert.equal(b.getSkill(a,'basic').cost.expectation,20);assert.ok(action(b,'denia','blue',e).ok);assert.ok(action(b,'denia','blue',e).ok);if(a.form==='blue')assert.ok(action(b,'denia','basic',e).ok);assert.equal(a.form,'red');assert.equal(a.rsc.expectation,0);}
});
test('concerto paid, personal, once per round, no turn used, intro capped per recipient',()=>{
  const b=fixture(['lynae','amy','mornye']),a=b.allies[0],t=b.allies[1];for(const u of b.allies)u.concerto=100;const token=b.current.id,queue=b.queue.slice();assert.ok(b.concerto(a.id,t.id).ok);assert.equal(a.concerto,0);assert.equal(t.concerto,100);assert.equal(t.rsc.sync,20);assert.equal(b.current.id,token);assert.deepEqual(b.queue,queue);a.concerto=100;const before=state(b);assert.equal(b.concerto(a.id,t.id).ok,false);assert.equal(state(b),before);assert.ok(b.concerto(b.allies[2].id,t.id).ok);assert.equal(t.rsc.sync,20);
});
test('concerto rejects self in multi-party and rejects enemy, KO, retreat, enemy-window targets',()=>{
  const b=fixture(['lynae','amy']);const a=b.allies[0],t=b.allies[1];a.concerto=100;for(const id of [a.id,b.enemies[0].id,'missing']){const before=state(b);assert.equal(b.concerto(a.id,id).ok,false);assert.equal(state(b),before);}t.retreated=true;assert.equal(b.concerto(a.id,t.id).ok,false);t.retreated=false;assert.ok(b.act('guard',a.id).ok);assert.ok(b.act('guard',t.id).ok);assert.equal(b.current.side,'enemy');assert.equal(b.concerto(a.id,t.id).ok,false);
});
test('solo concerto grants half direct amp, with no intro or special channel',()=>{
  const b=fixture(['lynae']),a=b.allies[0];a.concerto=100;assert.ok(b.concerto(a.id,a.id).ok);assert.equal(a.status.outro.amp,0.125);assert.equal(a.status.outro.liberation_extra,0);assert.equal(a.rsc.color,0);assert.equal(a.concerto,0);
});
test('strongest direct/extra channels preserved independently; field plus max direct/encourage',()=>{
  const b=fixture(['lynae','amy','mornye']),t=b.allies[2];b.allies[0].concerto=b.allies[1].concerto=100;assert.ok(b.concerto(b.allies[0].id,t.id).ok);assert.ok(b.concerto(b.allies[1].id,t.id).ok);assert.equal(t.status.outro.amp,0.25);assert.equal(t.status.outro.liberation_extra,0.1);
  const c=fixture(['amy','lynae']),a=c.allies[0],e=c.enemies[0];c.field_until=2;a.status.outro={amp:0.2,expires:2};lowLevelAction(c,c.allies[1],'encourage',a);const hp=e.hp;lowLevelAction(c,a,'basic',e);assert.equal(hp-e.hp,Math.floor(240*200/360*1.4));
});
test('status-outro survives nonproc direct action, applies to delayed fusion, then consumes',()=>{
  const b=fixture(['denia','chisa']),a=turn(b,'denia'),e=b.enemies[0];e.status.fusion={n:1,expires:4};b.allies[1].concerto=100;assert.ok(b.concerto(b.allies[1].id,a.id).ok);assert.ok(b.act('basic',e.id).ok);assert.ok(a.status.status_outro);assert.ok(action(b,'denia','basic',e).ok);assert.equal(a.status.status_outro,undefined);assert.equal(b.log.filter(x=>x.event==='damage'&&x.status_damage).at(-1).amount,179);
});
test('recipient-owned tune can consume status-outro on later ally trigger',()=>{
  const b=fixture(['lynae','amy','chisa']),a=b.allies[0],e=b.enemies[0];a.rsc.color=100;b.allies[2].concerto=100;assert.ok(b.concerto(b.allies[2].id,a.id).ok);assert.ok(b.act('spectrum',e.id).ok);assert.ok(a.status.status_outro);assert.ok(b.act('basic',e.id).ok);assert.equal(a.status.status_outro,undefined);assert.equal(a.rsc.color,0);assert.equal(a.concerto,35);
});
test('derived status packets generate no resources or concerto; cap status amp at +50%',()=>{
  const b=fixture(['denia']),a=b.allies[0],e=b.enemies[0];const r=JSON.stringify(a.rsc),c=a.concerto;e.status.cutline={actions:2,expires:3};a.status.status_outro={amp:0.25,expires:3};assert.equal(b._damage(a,e,0.9,{status_damage:true,element:'fusion'}),161);assert.equal(JSON.stringify(a.rsc),r);assert.equal(a.concerto,c);
});
test('guard halves damage, support mitigation bounded, barriers absorb without extra actions',()=>{
  const b=fixture(),a=b.allies[0],e=b.enemies[0];e.atk=440;let d=b._damage(e,a,1);a.hp=a.maxhp;a.status.guard={expires:2};let d2=b._damage(e,a,1);assert.ok(Math.abs(d2-d*0.5)<=1);a.hp=a.maxhp;delete a.status.guard;a.status.barrier={amount:150,expires:2};const before=e.normal_count;b._damage(e,a,1);assert.equal(e.normal_count,before);assert.equal(b.count.absorbed,150);assert.equal(a.status.barrier,undefined);
});
test('guard expires at next opportunity even when waiting, rather than lasting through wait',()=>{
  const b=fixture(['lynae','amy']),a=b.current;assert.ok(b.act('guard',a.id).ok);turn(b,'lynae');assert.equal(a.status.guard,undefined);assert.ok(b.wait().ok);assert.equal(a.status.guard,undefined);
});
test('braced enemy retaliation cancels when the same attack breaks it',()=>{
  const b=fixture(['chisa'],['bracer']),a=turn(b,'chisa'),e=b.enemies[0];e.shield=1;e.status.brace={expires:2};const hp=a.hp;assert.ok(b.act('pry',e.id).ok);assert.equal(e.broken_until,2);assert.equal(a.hp,hp);assert.equal(e.status.brace,undefined);
});
test('aim retains target; explicit taunt redirects committed single shot',()=>{
  const b=fixture(['amy','lynae'],['predator']),e=b.enemies[0];e.atk=240;e.pattern_i=1;turn(b,'predator');let r=b.stepEnemy();const target=r.events.find(x=>x.event==='enemy_action').targets[0];assert.equal(e.status.aim.target,target);turn(b,'lynae');assert.ok(b.act('taunt',e.id).ok);turn(b,'predator');r=b.stepEnemy();const event=r.events.find(x=>x.event==='enemy_action');assert.equal(event.skill,'aimed');assert.deepEqual(event.targets,[b.allies[1].id]);assert.equal(e.status.aim,undefined);
});
test('breaking cancels charge or aim; missing charge never silently upgrades next hit',()=>{
  const b=fixture(['amy'],['carapace']),e=b.enemies[0],a=b.allies[0];e.pattern_i=2;e.status.charge={expires:4,target:a.id};e.shield=1;b.action_id++;b._shieldDamage(a,e,1);assert.equal(e.status.charge,undefined);assert.equal(e.pattern_i,3);e.broken_until=0;e.shield=5;e.pattern_i=2;assert.equal(b.enemyIntent(e.id).key,'slash');
});
test('boss threshold marks pending only; announcement replaces a normal slot, no extra action',()=>{
  const b=fixture(),a=b.allies[0],e=b.enemies[0];e.hp=e.maxhp*0.6+100;e.shield=2;b._damage(a,e,2);assert.ok(e.phase_pending);assert.equal(e.shield,2);assert.equal(e.normal_count,0);assert.equal(e.phase,1);b._beginRound();assert.equal(e.phase,2);assert.equal(e.maxshield,P.enemies.crownless.phase2_shield);assert.equal(e.shield,2);assert.ok(e.phase_attack_pending);assert.equal(b.enemyIntent(e.id).key,'wingpulse');
  // Reset selection to this new round's legitimate slot before exercising public turn execution.
  b._currentId=null;b.advance();assert.ok(b.act('guard',a.id).ok);const r=b.stepEnemy();assert.equal(r.events.find(x=>x.event==='enemy_action').skill,'wingpulse');assert.equal(e.normal_count,1);assert.equal(e.phase_attack_pending,false);
});
test('survey reveals weaknesses; all explicit attack metadata suitable for UI animation',()=>{
  const b=fixture(['lynae']),a=b.current,e=b.enemies[0];const r=b.act('survey',e.id);assert.equal(e.revealed,true);const evt=r.events.find(x=>x.event==='action');assert.equal(evt.actor,a.id);assert.equal(evt.target,e.id);assert.deepEqual(evt.targets,[e.id]);assert.equal(evt.skill,'survey');assert.ok(evt.message);assert.ok(r.events.every(x=>x.id>0&&typeof x.message==='string'));
});
test('mastery ratio is applied once relative to nonzero reference',()=>{
  const b=fixture(),a=b.current,e=b.enemies[0];a.mastery.basic=5;const before=e.hp;assert.ok(b.act('basic',e.id).ok);assert.equal(before-e.hp,Math.floor(240*200/360*1.1/1.08));
});
test('retreat preserves HP, clears resource/marker/form, removes token, and is not victory/death',()=>{
  const b=fixture(['amy']),a=b.current,e=b.enemies[0];a.rsc.sync=100;a.form='mech';e.status.tune={owner:a.id,expires:2};const hp=a.hp;assert.ok(b.act('retreat',a.id).ok);assert.equal(b.result.outcome,'escaped');assert.equal(a.hp,hp);assert.equal(a.dead,false);assert.equal(a.form,'human');assert.equal(a.rsc.sync,0);assert.equal(e.status.tune,undefined);assert.equal(b.current,null);assert.deepEqual(b.queue,[]);
});
test('win, loss, partial escape and inconclusive are distinct; no timeout forced defeat',()=>{
  const b=create(['amy'],['snip']);b.enemies[0].hp=1;assert.ok(b.act('basic',b.enemies[0].id).ok);assert.equal(b.result.outcome,'win');const before=state(b);assert.equal(b.act('guard',b.allies[0].id).ok,false);assert.equal(state(b),before);
  const c=create(['amy'],'boss',{hp_fraction:0});assert.equal(c.result.outcome,'loss');
  const d=create(['amy','mornye'],'boss');d.allies[1].hp=0;d._kill(d.allies[1]);assert.ok(d.act('retreat',d.current.id).ok);assert.equal(d.result.outcome,'escaped_partial');
  const f=fixture();for(let i=0;i<10;i++){assert.ok(f.act('guard',f.current.id).ok);assert.ok(f.stepEnemy().ok);}assert.equal(f.result,null);assert.equal(f.summary().outcome,'inconclusive');
});
test('snapshot restores exactly, random continuation is reproducible and snapshots detached',()=>{
  const b=create(['amy','lynae','mornye','chisa'],'boss',{seed:72,stochastic:true});for(let i=0;i<12;i++)assert.ok(b.autoAction().ok);const snapshot=b.snapshot(),r=BattleEngine.restore(P,snapshot);assert.equal(state(r),state(b));for(let i=0;i<30&&!b.result;i++){assert.deepEqual(r.autoAction(),b.autoAction());assert.equal(state(r),state(b));}
  snapshot.state.allies[0].hp=0;assert.notEqual(b.allies[0].hp,0);const bad=b.snapshot();bad.state.allies[0].hp=-1;assert.throws(()=>BattleEngine.restore(P,bad));assert.throws(()=>BattleEngine.restore(P,{schema:'invalid'}));
});
test('16 v0.2 deterministic JS goldens retain explicit difficulty and automatic-concerto settings',()=>{
 const refs=[[["amy", "lynae", "mornye"], "tune", [["win", 4, 0.9584, 2], ["win", 9, 0.984, 3], ["win", 7, 0.6793, 2], ["win", 16, 0.3717, 3]]], [["amy", "denia", "chisa"], "fusion", [["win", 3, 0.9103, 3], ["win", 9, 0.875, 2], ["win", 7, 0.6971, 2], ["loss", 11, 0, 1]]], [["amy", "lynae", "mornye", "chisa"], "tune", [["win", 4, 0.9572, 3], ["win", 6, 1, 2], ["win", 6, 0.9179, 2], ["win", 13, 0.6384, 3]]], [["lynae", "mornye", "denia", "chisa"], "tune", [["win", 3, 0.9565, 3], ["win", 7, 0.9389, 2], ["win", 6, 0.9228, 2], ["win", 16, 0.7732, 3]]]];
 for(const [team,mode,rows] of refs)Object.keys(P.encounters).forEach((encounter,i)=>{const b=create(team,encounter,{mode:{amy:mode},difficulty:'standard',auto_concerto:true}),r=run(b);assert.deepEqual([r.outcome,r.rounds,r.ally_hp_fraction,r.counts.breaks||0],rows[i],`${team}/${encounter}`);});
});
test('120 roster/encounter combinations and levels 1/10/20/40/60 finish or remain honestly inconclusive',()=>{
  const keys=Object.keys(P.characters);let cases=0;for(let mask=1;mask<(1<<keys.length);mask++){const team=keys.filter((k,i)=>mask&(1<<i));if(team.length>4)continue;for(const encounter of Object.keys(P.encounters)){const b=create(team,encounter),r=run(b);assert.ok(['win','loss','inconclusive'].includes(r.outcome));assert.ok(b.validate());cases++;}}
  assert.equal(cases,120);for(const level of [1,10,20,40,60]){const b=create(['amy','lynae','mornye'],'boss',{level});run(b);assert.ok(b.validate());}
});
test('1000 seeded random-legal traces exercise all characters/encounters without invalid actions or state violations',()=>{
  const keys=Object.keys(P.characters),encounters=Object.keys(P.encounters);let actions=0;const observed=new Set();
  for(let seed=0;seed<1000;seed++){
    const size=seed%4+1,team=Array.from({length:size},(_,i)=>keys[(seed+i)%keys.length]);const b=create(team,encounters[seed%4],{seed,stochastic:true,policy:'random_legal'});
    while(!b.result&&b.round<=35){const a=b.current,roundNo=b.round,prior=a.normal_count,r=b.autoAction();assert.ok(r.ok,`${seed}: ${r.reason}`);assert.equal(a.normal_count,prior+1);assert.equal(a.acted_round,roundNo);assert.ok(b.validate());actions++;if(a.side==='ally')observed.add(a.key);}
    if(seed%100===0){const restored=BattleEngine.restore(P,b.snapshot());assert.equal(state(restored),state(b));}
  }
  assert.equal(observed.size,5);assert.ok(actions>20000);console.log(`Seeded stress: 1000 battles, ${actions} legal normal actions, all five characters.`);
});


test('restore rejects malformed definitions, resource keys, forms, status channels and token ownership',()=>{
  const base=create().snapshot();
  const invalid=[s=>s.state._currentId=null,s=>s.state.allies[0].form='invalid',s=>s.state.allies[0].skills={},s=>s.state.allies[0].speed='oops',s=>s.state.allies[0].acted_round=s.state.round,s=>s.state.allies[0].hp=0,s=>s.state.allies[0].dead=true,s=>s.state.allies[0].status.outro={amp:999,expires:1e9},s=>delete s.state.allies[0].rsc.sync,s=>s.state.queue=[],s=>s.state.enemies[0].hp=NaN];
  for(const mutate of invalid){const bad=JSON.parse(JSON.stringify(base));mutate(bad);assert.throws(()=>BattleEngine.restore(P,bad));}
});
test('initial HP inheritance has no automatic heal and always resets all battle resources',()=>{
  const b=create(['amy','mornye'],'normal',{initialHP:{amy:1200,mornye:0}});assert.equal(b.allies[0].hp,1200);assert.equal(b.allies[1].hp,0);assert.equal(b.allies[1].dead,true);assert.equal(b.living('ally').length,1);for(const a of b.allies){assert.equal(a.concerto,0);assert.ok(Object.values(a.rsc).every(v=>v===0));}assert.doesNotThrow(()=>BattleEngine.restore(P,b.snapshot()));
});
test('all legal status combinations survive snapshot restoration at every decision window',()=>{
  let checkpoints=0;for(let seed=0;seed<20;seed++){const keys=Object.keys(P.characters),team=keys.filter((k,i)=>(seed+i)%5!==0).slice(0,seed%4+1);const b=create(team,Object.keys(P.encounters)[seed%4],{seed,stochastic:true,policy:seed%2?'random_legal':'tactical'});while(!b.result&&b.round<=40){const c=BattleEngine.restore(P,b.snapshot());assert.equal(state(c),state(b));assert.ok(b.autoAction().ok);checkpoints++;}assert.doesNotThrow(()=>BattleEngine.restore(P,b.snapshot()));}assert.ok(checkpoints>500);
});

test('v0.2 difficulties alter shield, target selection and rotation as well as stats',()=>{
  assert.throws(()=>new BattleEngine(P,{difficulty:'unknown'}));
  const easy=create(['amy','lynae'],'boss',{difficulty:'easy'}),normal=create(['amy','lynae'],'boss'),hard=create(['amy','lynae'],'boss',{difficulty:'challenge'});
  assert.ok(easy.enemies[0].shield<normal.enemies[0].shield&&normal.enemies[0].shield<hard.enemies[0].shield);
  assert.notDeepEqual(easy.enemies[0].pattern,hard.enemies[0].pattern);assert.ok(easy.enemies[0].maxhp<normal.enemies[0].maxhp);
  hard.allies[1].hp=100;assert.equal(hard.enemyIntent(hard.enemies[0].id).targets[0],hard.allies[1].id);
  assert.doesNotThrow(()=>BattleEngine.restore(P,hard.snapshot()));
});
test('old parameter saves are rejected clearly without changing supplied snapshot',()=>{
  const b=create(),s=b.snapshot();s.parameter_version='0.1.2-candidate';const before=JSON.stringify(s);assert.throws(()=>BattleEngine.restore(P,s),/版本不匹配/);assert.equal(JSON.stringify(s),before);
});
test('ordinary and single-step autoAction never silently release a full concerto by default',()=>{
  const b=create(['amy','lynae','mornye'],'boss');let n=0;while(!b.result&&!b.allies.some(a=>a.concerto===100)&&n++<100)b.autoAction();assert.ok(b.allies.some(a=>a.concerto===100));
  const donor=b.allies.find(a=>a.concerto===100),previous=b.count.concerto||0;for(let i=0;i<3&&!b.result;i++)b.autoAction();assert.equal(donor.concerto,100);assert.equal(b.count.concerto||0,previous);assert.ok(b.log.some(e=>e.event==='concerto_ready'));
});
test('natural zero-resource manual concerto reaches ready, records manual trigger and keeps the ordinary token',()=>{
  const b=create(['amy','lynae','mornye'],'boss');for(const a of b.allies){assert.equal(a.concerto,0);assert.ok(Object.values(a.rsc).every(v=>v===0));}
  for(let n=0;n<200&&!b.result;n++){if(b.current.side==='ally'&&b.availableConcertos().some(c=>c.enabled))break;assert.ok(b.autoAction().ok);}
  const c=b.availableConcertos().find(c=>c.enabled);assert.ok(c);const token=b.currentId,q=b.queue.slice();assert.ok(b.concerto(c.actor,c.targets[0]).ok);assert.equal(b.currentId,token);assert.deepEqual(b.queue,q);assert.equal(b.log.filter(e=>e.event==='concerto').at(-1).trigger,'manual');assert.equal(b.count.manual_concertos,1);
});
test('explicit automatic-concerto option records every automatic release',()=>{
  const b=create(['amy','lynae','mornye'],'boss',{auto_concerto:true});run(b);const events=b.log.filter(e=>e.event==='concerto');assert.ok(events.length);assert.ok(events.every(e=>e.trigger==='automatic'));assert.equal(b.count.automatic_concertos,events.length);
});
test('all action cards have useful category, description, target and exact dynamic resource metadata',()=>{
  const b=create(['lynae','amy','mornye','denia'],'normal');for(const a of b.allies)for(const s of b.availableActions(a.id)){assert.ok(P.ui_categories[s.category]);assert.ok(s.effectSummary);assert.ok(s.durationText);assert.ok(s.cooldownText);assert.equal(s.ready,s.enabled);assert.deepEqual(s.resourceCost,s.cost);assert.equal(typeof s.concertoGain,'number');}
  const d=b.allies.find(a=>a.key==='denia');d.form='blue';assert.equal(b.availableActions(d.id).find(s=>s.key==='basic').cost.expectation,20);assert.equal(b.availableActions().find(s=>s.key==='wait').category,'battle');
});
test('queue and enemy previews are mutation-free and RNG-free including pending charge and KO',()=>{
  const b=create(['amy','lynae','mornye'],'boss',{stochastic:true,seed:44});let before=state(b);for(let i=0;i<20;i++){b.queuePreview();b.enemyIntent(b.enemies[0].id);b.availableActions();}assert.equal(state(b),before);
  b.allies[2].hp=0;b._kill(b.allies[2]);assert.ok(!b.queuePreview().nextPreview.ids.includes(b.allies[2].id));assert.equal(b.queuePreview().nextPreview.certainty,'conditional');
});
test('phase replacement preserves rotation index and committed charge resolves before phase attack',()=>{
  const b=fixture(['amy'],'boss'),e=b.enemies[0];e.phase_attack_pending=true;e.pattern_i=1;turn(b,'crownless');const i=e.pattern_i;assert.ok(b.stepEnemy().ok);assert.equal(e.pattern_i,i);assert.equal(e.phase_attack_pending,false);
  turn(b,'crownless');assert.equal(b.enemyIntent(e.id).key,'charge');assert.ok(b.stepEnemy().ok);e.phase_attack_pending=true;turn(b,'crownless');assert.equal(b.enemyIntent(e.id).key,'descent');assert.ok(b.stepEnemy().ok);assert.equal(e.phase_attack_pending,true);turn(b,'crownless');assert.equal(b.enemyIntent(e.id).key,'wingpulse');
});
test('repeated charge interrupts skip only the pending heavy and future cycles can still charge',()=>{
  const b=fixture(['amy'],['carapace']),a=b.allies[0],e=b.enemies[0];e.pattern_i=2;e.status.charge={expires:b.round+2,target:a.id};e.shield=1;b.action_id++;b._shieldDamage(a,e,1,true);assert.equal(e.pattern_i,3);assert.equal(b.count.charge_interrupts,1);assert.ok(b.log.some(x=>x.event==='charge_interrupted'&&x.skill==='spin'));
  e.broken_until=0;e.shield=e.maxshield;e.pattern_i=4;assert.equal(b.enemyIntent(e.id).key,'charge');
});
test('bracer charge locks a living target and taunt redirects that single heavy',()=>{
  const b=fixture(['amy','lynae'],['bracer']),e=b.enemies[0];turn(b,'bracer');b.stepEnemy();turn(b,'bracer');b.stepEnemy();const locked=e.status.charge.target;assert.equal(b.enemyIntent(e.id).targets[0],locked);const a=turn(b,'lynae');assert.ok(b.act('taunt',e.id).ok);assert.equal(b.enemyIntent(e.id).targets[0],a.id);
});
test('boss all-target attacks are unaffected by taunt targeting',()=>{
  const b=fixture(['amy','lynae'],'boss'),e=b.enemies[0];e.pattern_i=2;e.status.charge={expires:b.round+2,target:b.allies[0].id};e.status.taunt={expires:b.round+2,owner:b.allies[0].id};const intent=b.enemyIntent(e.id);assert.equal(intent.aoe,true);assert.deepEqual(intent.targets,b.allies.map(a=>a.id));
});
test('tune supply is bounded to ten primary per whole AOE and status packets grant no additional concerto',()=>{
  const b=fixture(['lynae','denia'],['bracer','bracer']),a=turn(b,'denia'),owner=b.allies[0];for(const e of b.enemies)e.status.tune={owner:owner.id,expires:b.round+1};assert.ok(b.act('stage',b.enemies[0].id).ok);assert.equal(a.rsc.expectation,45);assert.equal(b.count.teamwork_resource,10);assert.equal(a.concerto,30);assert.equal(b.count.tune_procs,2);
});
test('survey has a functional support mark and records real resource supply on allied weak hit',()=>{
  const b=fixture(['lynae','amy']),l=b.allies[0],a=b.allies[1],e=b.enemies[0];assert.ok(b.act('survey',e.id).ok);assert.equal(e.status.tune.owner,l.id);assert.ok(b.act('basic',e.id).ok);assert.equal(a.rsc.sync,60);assert.equal(b.count.teamwork_resource,10);assert.ok(b.log.some(x=>x.event==='teamwork'));
});
test('field mitigation and direct buff have separately visible bounded benefit logs',()=>{
  const b=fixture(['amy','mornye']),a=b.allies[0],m=b.allies[1],e=b.enemies[0];e.atk=400;let d1=b._damage(e,a,1);a.hp=a.maxhp;b.field_until=b.round+1;let d2=b._damage(e,a,1);assert.ok(Math.abs(d2-d1*.8)<=1);assert.ok(b.count.mitigation_prevented>0);lowLevelAction(b,a,'basic',e);assert.ok(b.count.buff_bonus_damage>0);assert.ok(b.log.some(x=>x.event==='buff_used'));
});
test('rend reduces healing until cleansed, exposed consumes once and remains guardable',()=>{
  const b=fixture(['mornye']),a=turn(b,'mornye'),e=b.enemies[0];a.hp=100;a.status.rend={expires:b.round+1};const h=b._heal(a,a,2,100);assert.equal(h,345);b._cleanse(a,a);a.hp=100;assert.equal(b._heal(a,a,2,100),460);
  a.hp=a.maxhp;e.atk=400;const d=b._damage(e,a,1);a.hp=a.maxhp;a.status.exposed={expires:b.round+1};a.status.guard={expires:b.round+1};const guarded=b._damage(e,a,1);assert.ok(Math.abs(guarded-d*.575)<=1);assert.equal(a.status.exposed,undefined);
});
test('test items use isolated finite inventory, consume an action, never revive or grant concerto',()=>{
  const b=fixture(['amy','mornye']),a=b.allies[0];a.hp=100;const before=a.concerto,hp=a.hp;assert.ok(b.act('item_repair',a.id).ok);assert.equal(b.inventory.repair,1);assert.equal(a.hp,hp+540);assert.equal(a.concerto,before);assert.equal(a.acted_round,b.round);
  turn(b,'amy');assert.ok(b.act('item_repair',a.id).ok);turn(b,'amy');const saved=state(b);assert.equal(b.act('item_repair',a.id).ok,false);assert.equal(state(b),saved);assert.equal(b.inventory.repair,0);
  const fresh=create(['amy']);assert.equal(fresh.inventory.repair,2);
});
test('cleanse item removes only negative statuses and preserves beneficial shields',()=>{
  const b=fixture(),a=b.allies[0];a.hp=100;a.status.rend={expires:b.round+1};a.status.exposed={expires:b.round+1};a.status.barrier={amount:100,expires:b.round+1};assert.ok(b.act('item_cleanse',a.id).ok);assert.equal(a.status.rend,undefined);assert.equal(a.status.exposed,undefined);assert.ok(a.status.barrier);assert.equal(b.inventory.cleanse,0);
});
test('effective utility gives bounded concerto but repeating an unconsumed identical buff grants nothing',()=>{
  const b=fixture(['lynae','amy']),l=b.allies[0],a=b.allies[1];lowLevelAction(b,l,'encourage',a);assert.equal(l.concerto,15);lowLevelAction(b,l,'encourage',a);assert.equal(l.concerto,15);for(let i=0;i<10;i++)b._gainConcerto(l,999,'unit_test');assert.equal(l.concerto,100);assert.equal(b.log.filter(x=>x.event==='concerto_ready').length,1);
});
test('new inventory and debuff states strictly restore; overfull inventory is rejected',()=>{
  const b=create(['amy','mornye'],'boss');b.allies[0].status.rend={expires:b.round+1};b.allies[0].status.exposed={expires:b.round+1};b.inventory.repair=1;const restored=BattleEngine.restore(P,b.snapshot());assert.equal(state(restored),state(b));const bad=b.snapshot();bad.state.inventory.repair=999;assert.throws(()=>BattleEngine.restore(P,bad));
});

test('difficulty defaults only when absent, rejecting malformed explicit selections',()=>{for(const difficulty of [null,0,'',false,[],{}])assert.throws(()=>new BattleEngine(P,{difficulty}));assert.equal(new BattleEngine(P).options.difficulty,'standard');});
test('AOE does not consume a pending single-target taunt',()=>{const b=fixture(['amy','lynae']),e=b.enemies[0],a=b.allies[0];e.pattern_i=3;e.status.taunt={owner:a.id,expires:b.round+2};turn(b,'crownless');assert.equal(b.enemyIntent(e.id).key,'sweep');assert.ok(b.stepEnemy().ok);assert.ok(e.status.taunt);});
test('enemy KO during charge has an explicit cancellation event',()=>{const b=fixture(),a=b.allies[0],e=b.enemies[0];e.status.charge={expires:b.round+2,target:a.id};e.hp=1;assert.ok(b.act('basic',e.id).ok);assert.equal(b.count.charge_cancelled_ko,1);assert.ok(b.log.some(x=>x.event==='charge_cancelled'));});

test('healing tooltips expose current level/mastery values and full status duration',()=>{
  for(const level of [1,20,60]){const b=create(['mornye'],'boss',{level,enemy_atk_scale:0}),a=turn(b,'mornye'),card=b.availableActions().find(s=>s.key==='heal'),s=b.getSkill(a,'heal');const expected=Math.floor(a.def*s.heal_scale+s.heal_flat*(.6+.02*level));assert.equal(card.healingPreview.amount,expected);assert.match(card.effectSummary,new RegExp(String(expected)));}
  assert.match(P.generic_skills.taunt.durationText,/第2回合末/);assert.match(P.characters.chisa.skills.mend.durationText,/护盾.*下回合末/);
});
