'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Effects=require('../../skill-effects.js');
const params=require('../../parameters.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(keys=['amy','lynae','mornye','denia','chisa','rover_spectro','rover_havoc','rover_aero','rover_electro'],count=3){
  const allies=keys.map((key,slot)=>({id:key,key,side:'ally',slot,hp:1000,maxhp:1000,sp:100,maxsp:100,atk:100,def:100,spd:100,cr:0,cdmg:1.5,er:1,level:20,status:{},cooldowns:{},form:params.characters[key].form_start,mode:params.characters[key].mode_default,roleState:{}}));
  const enemies=Array.from({length:count},(_,slot)=>({id:`enemy${slot}`,key:`enemy${slot}`,side:'enemy',slot,hp:100000,maxhp:100000,atk:100,def:0,level:20,status:{},q:10000}));
  const e={allies,enemies,round:1,packets:[],events:[],heals:[],activeContext:null,
    getUnit(id){return [...allies,...enemies].find(u=>u.id===id||u.key===id);},
    finalStat(u,k){const m=Effects.statModifiers(this,u,k);return (u[k]||0)*(1+(m.pct||0))+(m.flat||0);},
    addStatus(u,k,data){u.status[k]={...data};return u.status[k];},removeStatus(u,k){delete u.status[k];},
    control(a,t,type){return !(t.controlImmune || t[`${type}Immune`]);},
    _record(type,data){this.events.push({type,...data});},
    heal(src,t,n){if(t.hp<=0)return 0;const actual=Math.min(n,t.maxhp-t.hp);t.hp+=actual;this.heals.push({src:src.id,target:t.id,amount:actual});return actual;},
    shield(src,t,n,d,k){const old=t.status[k];if(!old||old.amount<n){t.status[k]={amount:n,expires:this.round+d-1,ownerId:src.id};return n-(old?old.amount:0);}return 0;},
    restoreSP(src,t,n){if(src===t)return 0;const amount=Math.min(n,t.maxsp-t.sp);t.sp+=amount;return amount;},
    damage(src,t,p){
      if(t.hp<=0||p.forceMiss||t.hitImmune)return {hit:false,target:t,source:src,damage:0,hpDamage:0,shieldDamage:0};
      const m=Effects.modifiers(this,src,t,p),base=p.base==null?(p.coef||0)*this.finalStat(src,'atk')+(p.defCoef||0)*this.finalStat(src,'def'):p.base;
      const amount=t.damageImmune?0:base*(1+(m.damageBonus||0))*(1+(m.amplify||0)+(m.allHpAmplify||0));
      const packet={...p,source:src,target:t,amount,afterDamage:[]};Effects.beforeIncomingDamage(this,packet);const beforeShield=packet.amount;let shieldDamage=0;
      for(const k of ['chisa_shield','test_shield']){const s=t.status[k];if(s){const n=Math.min(s.amount,packet.amount);s.amount-=n;packet.amount-=n;shieldDamage+=n;if(s.amount===0)delete t.status[k];}}
      Effects.beforeHPDamage(this,packet);const hpDamage=Math.min(t.hp,packet.amount);t.hp-=hpDamage;for(const fn of packet.afterDamage)fn(packet);
      const h={...p,source:src,target:t,damage:beforeShield,hpDamage,shieldDamage,hit:true,damageImmune:!!t.damageImmune};this.packets.push(h);if(t.hp<=0)Effects.onDown(this,t);return h;
    }
  };allies.forEach(u=>Effects.init(e,u));return e;
}
function skill(e,id,k){const a=e.getUnit(id),d=params.characters[a.key];return d.skills[k]||Object.values(d.skills).find(s=>s.slot===k);}
let serial=0;
function context(e,id,k,bp=0,options={},target=e.enemies[0]){
  const a=e.getUnit(id),s=skill(e,id,k),pr=Effects.preview(e,a,s,s.skill_id||k,bp,options),au=pr.audit,n=au.original_attacks_by_bp[bp],basic=s.slot==='A',total=(au.damage_atk_by_bp||[])[bp]||0,dt=(au.damage_def_by_bp||[])[bp]||0,q=(au.q_by_bp||[])[bp]||0;
  const aoe=/全体|全敌|全敵/.test(s.target),targets=aoe?e.enemies.filter(t=>t.hp>0):[target];
  return {actor:a,skill:s,key:s.skill_id||k,bp,options,target,targets,rootActionId:`root${++serial}`,startForm:a.form,category:pr.category,attacks:Array.from({length:n},(_,i)=>({attackId:`attack${serial}:${i}`,coef:basic?total/(1+.4*bp)*(i===0?1:.4):total/n,defCoef:basic?dt/(1+.4*bp)*(i===0?1:.4):dt/n,element:params.characters[id].element,q:basic?[6,2.1,1.5,1.2][i]:q/n})),hits:[],breaks:[],effective:false};
}
function execute(e,id,k,bp=0,options={},target=e.enemies[0]){
  const c=context(e,id,k,bp,options,target),reason=Effects.validate(e,c);assert.equal(reason,null,reason);Effects.prepare(e,c);e.activeContext=c;
  for(const attack of c.attacks){Effects.beforeAttack(e,c,attack);const hits=[];for(const t of attack.targets||c.targets){if(t.hp<=0)continue;const mod=attack.targetModifiers&&attack.targetModifiers[t.id]||{};
    const h=e.damage(c.actor,t,{...attack,coef:attack.coef*(mod.coefScale==null?1:mod.coefScale),defCoef:attack.defCoef,category:c.category,kind:'original',original:true,rootActionId:c.rootActionId,ctx:c});if(!h.hit)continue;
    if(t.hp>0&&t.q>0){const q=attack.q*(mod.qScale==null?1:mod.qScale);t.q=Math.max(0,t.q-q);if(!t.q)c.breaks.push({source:c.actor,target:t});}
    c.hits.push(h);hits.push(h);Effects.afterHit(e,c,h);
  }Effects.afterAttack(e,c,attack,hits);}
  Effects.afterRoot(e,c);for(const b of c.breaks)Effects.onBreak(e,b,c);Effects.afterBreaks(e,c);Effects.afterCounterQueue(e,c);e.activeContext=null;return c;
}
function next(e){Effects.roundEnd(e);e.round++;}
const derived=(e,kind)=>e.packets.filter(x=>x.kind===kind);

test('all 61 cards expose four numeric tiers and explicit mechanism coverage',()=>{
  assert.equal(Effects.cardCount,61);let total=0;const e=fixture();
  for(const [id,slots] of Object.entries(Effects.cardCoverage))for(const k of slots){total++;const s=skill(e,id,k);assert.ok(s,`${id}:${k}`);for(let bp=0;bp<4;bp++){const p=Effects.preview(e,e.getUnit(id),s,s.skill_id||k,bp,{});assert.equal(p.audit.q_by_bp.length,4);assert.equal(p.audit.original_attacks_by_bp.length,4);}}
  assert.equal(total,61);
});
test('human and mech variants select actual cost/Q without clearing R2',()=>{
  const e=fixture(['amy']);const a=e.allies[0],s=skill(e,'amy','E1');a.form='mech';a.r2Pending=true;
  const p=Effects.preview(e,a,s,'E1',3,{});assert.equal(p.audit.sp,16);assert.equal(p.audit.damage_atk_by_bp[3],3.69);
  execute(e,'amy','E1');assert.equal(a.form,'mech');a.hp=0;Effects.onDown(e,a);assert.equal(a.form,'mech');assert.equal(a.r2Pending,true);
});
test('Amy quick empowerment consumes on submission, buffs body only and is not granted by R1',()=>{
  const e=fixture(['amy']);execute(e,'amy','E4');assert.ok(e.allies[0].status.amy_quick);const c=execute(e,'amy','E2');assert.ok(Math.abs(c.attacks[0].coef-1.92)<1e-10);assert.equal(e.allies[0].status.amy_quick,undefined);
  execute(e,'amy','R1');assert.equal(e.allies[0].status.amy_quick,undefined);
});
test('own Break consumes only pre-root mark; new mark cannot retroactively reward itself',()=>{
  const e=fixture(['amy']);e.enemies[0].q=6;execute(e,'amy','A');assert.equal(derived(e,'response').length,0);assert.ok(e.enemies[0].status.rupture_shift);
  e.enemies[0].q=6;execute(e,'amy','A');assert.equal(derived(e,'response').length,1);assert.equal(e.enemies[0].status.rupture_shift,undefined);
});
test('teammate Break does not dispatch Amy response',()=>{
  const e=fixture(['amy','rover_spectro']);execute(e,'amy','A');e.enemies[0].q=6;execute(e,'rover_spectro','A');assert.equal(derived(e,'response').length,0);assert.ok(e.enemies[0].status.rupture_shift);
});
test('fusion E3 cannot explode twice after owner Break consumed its existing pool',()=>{
  const e=fixture(['amy']);e.allies[0].mode='fusion';Effects.applyAbnormal(e,e.allies[0],e.enemies[0],'fusion_burst',2);e.enemies[0].q=1;execute(e,'amy','E3');assert.equal(e.events.filter(x=>x.type==='fusion_burst').length,1);
});
test('Lynae carrier gives a full coordinated packet per true basic attack, never per target',()=>{
  const e=fixture(['lynae','chisa']);execute(e,'lynae','E2');assert.equal(derived(e,'coordinated').length,0);execute(e,'lynae','A',3);const hits=derived(e,'coordinated');assert.equal(hits.length,4);assert.deepEqual(hits.map(x=>x.coef),[.25,.25,.25,.25]);
  execute(e,'lynae','E3',3);assert.equal(derived(e,'coordinated').length,6);assert.ok(e.enemies.every(t=>t.status.lynae_paint));
});
test('Lynae paint snapshot survives consumption for chase; finisher then clears cruise',()=>{
  const e=fixture(['lynae']);execute(e,'lynae','E2');execute(e,'lynae','E3');e.packets=[];execute(e,'lynae','E4');assert.equal(derived(e,'attached').length,3);assert.equal(derived(e,'coordinated')[0].coef,.35);assert.equal(e.allies[0].form,'sampling');assert.equal(e.allies[0].status.lynae_chase,undefined);
});
test('Lynae locked first hit dying cancels chase without retargeting',()=>{
  const e=fixture(['lynae']);execute(e,'lynae','E2');e.packets=[];e.enemies[0].hp=1;execute(e,'lynae','E3');assert.equal(derived(e,'coordinated').length,1);assert.equal(derived(e,'coordinated')[0].target.id,'enemy1');
});
test('Lynae single carrier transfer replaces self and R pending basic expires on other action',()=>{
  const e=fixture(['lynae','chisa']);execute(e,'lynae','E2');execute(e,'lynae','E5',0,{allyTarget:'chisa'});assert.equal(e.allies[0].status.lynae_chase,undefined);assert.ok(e.allies[1].status.lynae_chase);
  execute(e,'lynae','R');const p=Effects.preview(e,e.allies[0],skill(e,'lynae','A'),'A',3,{});assert.deepEqual(p.audit.damage_atk_by_bp,[1.4,1.96,2.52,3.08]);execute(e,'lynae','E1');assert.equal(e.allies[0].status.lynae_empowered,undefined);
});
test('Mornye landing preserves field, field heals one lowest ratio, and R requires existing field',()=>{
  const e=fixture(['mornye','amy']);const mor=e.allies[0];execute(e,'mornye','R');assert.equal(mor.status.mornye_field,undefined);
  execute(e,'mornye','E2');execute(e,'mornye','E1');assert.equal(mor.form,'ground');assert.ok(mor.status.mornye_field);mor.hp=500;e.allies[1].hp=250;e.heals=[];Effects.roundEnd(e);assert.equal(e.heals.length,1);assert.equal(e.heals[0].target,'amy');
});
test('Mornye attack/healing branch does not double-boost',()=>{
  const e=fixture(['mornye']);execute(e,'mornye','E2');e.allies[0].hp=1;const c=execute(e,'mornye','E3',3,{choice:'healing'});assert.equal(c.attacks[0].defCoef,1.2);assert.equal(e.heals.at(-1).amount,(60+55)*1.75);
});
test('Mornye guard is one real attack with shared cap, followed by one root counter',()=>{
  const e=fixture(['mornye']);const mor=e.allies[0],enemy=e.enemies[0];execute(e,'mornye','E1');delete mor.status.mornye_bound;mor.cooldowns.E1=3;
  e.damage(enemy,mor,{base:150,kind:'original',attackId:'enemy-attack1',rootActionId:'enemy-root'});e.damage(enemy,mor,{base:150,kind:'original',attackId:'enemy-attack1',rootActionId:'enemy-root'});e.damage(enemy,mor,{base:150,kind:'original',attackId:'enemy-attack2',rootActionId:'enemy-root'});
  assert.equal(mor.hp,670);assert.equal(mor.status.mornye_guard.prevented,120);Effects.afterEnemyRoot(e,{actor:enemy,rootActionId:'enemy-root'});assert.equal(derived(e,'counter').length,1);assert.equal(mor.cooldowns.E1,2);assert.equal(mor.status.mornye_guard,undefined);
});
test('Mornye bound is after shields, heals only after third cap or actual fatal save',()=>{
  const e=fixture(['mornye','amy']);const mor=e.allies[0],a=e.allies[1],enemy=e.enemies[0];execute(e,'mornye','E1',0,{allyTarget:'amy'});delete a.status.mornye_guard;a.status.test_shield={amount:600};e.heals=[];
  e.damage(enemy,a,{base:500,kind:'status'});assert.equal(a.status.mornye_bound.uses,3);assert.equal(a.hp,1000);
  e.damage(enemy,a,{base:600,kind:'status'});assert.equal(a.hp,700);assert.equal(a.status.mornye_bound.uses,2);
  e.damage(enemy,a,{base:400,kind:'status'});e.damage(enemy,a,{base:400,kind:'status'});assert.equal(a.hp,180);assert.equal(a.status.mornye_bound,undefined);assert.equal(e.heals.length,1);
  execute(e,'mornye','E1',0,{allyTarget:'amy'});assert.equal(a.status.mornye_bound,undefined);
});
test('Mornye observation rewards actual ally Break only when preexisting',()=>{
  const e=fixture(['mornye','amy']);execute(e,'mornye','E2');e.enemies[0].q=1;execute(e,'mornye','E4');assert.equal(e.enemies[0].status.mornye_interference,undefined);
  e.enemies[0].q=1;execute(e,'amy','A');assert.ok(e.enemies[0].status.mornye_interference);assert.equal(e.enemies[0].status.mornye_observation,undefined);
});
test('Mornye support snapshots >=70% HP and consumes once for entire multi-hit root',()=>{
  const e=fixture(['mornye','amy']);execute(e,'mornye','E5',3);e.allies[1].hp=699;let c=execute(e,'amy','A',3);assert.equal(c.roleAmplify,0);assert.ok(e.allies[1].status.mornye_support);e.allies[1].hp=700;c=execute(e,'amy','A',3);assert.equal(c.roleAmplify,.2);assert.equal(e.allies[1].status.mornye_support,undefined);
});
test('Denia group excludes pull immunity and E3 primary Q does not leak to secondaries',()=>{
  const e=fixture(['denia']);e.enemies[2].pullImmune=true;execute(e,'denia','E1');assert.ok(e.enemies[0].status.denia_group);assert.equal(e.enemies[2].status.denia_group,undefined);e.allies[0].form='blue';const old=e.enemies[1].q;
  const c=execute(e,'denia','E3',3,{choice:'exile',extraTargets:['enemy1']});assert.equal(c.attacks[0].targetModifiers.enemy1.qScale,0);assert.equal(e.enemies[1].q,old);assert.equal(Effects.preview(e,e.allies[0],skill(e,'denia','E3'),'E3',3,{choice:'exile'}).audit.sp,24);
});
test('Denia explicit team Break response consumes old strain and only follows group members',()=>{
  const e=fixture(['denia','rover_spectro']);e.allies[0].mode='strain';execute(e,'denia','E1');execute(e,'denia','E2');e.enemies[0].q=1;execute(e,'rover_spectro','A');const ds=derived(e,'response');assert.equal(ds.length,3);assert.deepEqual(ds.map(x=>x.coef),[.45,.225,.225]);
});
test('Denia R2 field has no immediate tick, ticks twice, survives red form but not source down',()=>{
  const e=fixture(['denia']);const d=e.allies[0];d.form='blue';execute(e,'denia','R2',3);assert.equal(d.form,'red');assert.equal(derived(e,'field').length,0);next(e);assert.equal(derived(e,'field').length,3);next(e);assert.equal(derived(e,'field').length,6);assert.equal(d.status.denia_field,undefined);
});
test('Denia spill is root-once capped body budget and does not apply to multielement attacks',()=>{
  const e=fixture(['denia','rover_electro']);execute(e,'denia','E1');execute(e,'rover_electro','E2B');execute(e,'denia','E5',1,{allyTargets:['rover_electro']});e.packets=[];execute(e,'rover_electro','E1-state');assert.equal(derived(e,'response').length,0);assert.ok(e.allies[1].status.denia_spill);
  execute(e,'rover_electro','A',3);const spill=derived(e,'response');assert.equal(spill.length,1);assert.ok(Math.abs(spill[0].base-44)<1e-8);
});
test('Chisa mark is one target, does not retroactively mark its root, and requires real HP loss',()=>{
  const e=fixture(['chisa','amy']);execute(e,'chisa','E1');assert.equal(e.enemies[0].status.havoc_bane,undefined);e.enemies[0].status.test_shield={amount:1000};execute(e,'amy','A',3);assert.equal(e.enemies[0].status.havoc_bane,undefined);delete e.enemies[0].status.test_shield;execute(e,'amy','A',3);assert.equal(e.enemies[0].status.havoc_bane.stacks,1);execute(e,'amy','A');assert.equal(e.enemies[0].status.havoc_bane.stacks,1);
  execute(e,'chisa','E1',0,{},e.enemies[1]);assert.equal(e.enemies[0].status.chisa_unravel_mark,undefined);assert.ok(e.enemies[0].status.havoc_bane);
});
test('Chisa saw gates healing, preserves four true hits and only finisher grants shields',()=>{
  const e=fixture(['chisa']);execute(e,'chisa','E3');assert.ok(Effects.validate(e,context(e,'chisa','E2')));execute(e,'chisa','R');const c=execute(e,'chisa','E4',3);assert.equal(c.attacks.length,4);assert.ok(Math.abs(c.attacks.reduce((n,x)=>n+x.coef,0)-4.305*1.2)<1e-8);assert.equal(e.allies[0].status.chisa_wanlv,undefined);
  execute(e,'chisa','E5');assert.equal(e.allies[0].form,'scissors');assert.equal(e.allies[0].status.chisa_shield.amount,55);
  execute(e,'chisa','E3');delete e.allies[0].status.chisa_shield;next(e);next(e);next(e);assert.equal(e.allies[0].form,'scissors');assert.equal(e.allies[0].status.chisa_shield,undefined);
});
test('three periodic abnormal formulas, natural decay and final tick expiry',()=>{
  const e=fixture(['rover_spectro']);const src=e.allies[0],t=e.enemies[0];Effects.applyAbnormal(e,src,t,'spectro_frazzle',2);Effects.applyAbnormal(e,src,t,'aero_erosion',3);Effects.applyAbnormal(e,src,t,'electro_flare',4);
  next(e);assert.equal(t.status.spectro_frazzle.stacks,1);assert.equal(t.status.aero_erosion.stacks,3);assert.equal(t.status.electro_flare.stacks,2);next(e);assert.equal(t.status.spectro_frazzle,undefined);assert.equal(t.status.electro_flare.stacks,1);next(e);assert.equal(t.status.electro_flare,undefined);assert.equal(t.status.aero_erosion,undefined);assert.equal(derived(e,'status').length,8);
});
test('Spectro echo holds one natural decay but not expiry and is never extra damage',()=>{
  const e=fixture(['rover_spectro']);execute(e,'rover_spectro','E2');const t=e.enemies[0];assert.equal(t.status.spectro_frazzle.stacks,1);next(e);assert.equal(t.status.spectro_frazzle.stacks,1);assert.equal(t.status.spectro_echo_hold,undefined);next(e);assert.equal(t.status.spectro_frazzle,undefined);assert.equal(derived(e,'status').length,2);
});
test('Havoc surge overrides body and B, and field counts actual main actions only',()=>{
  const e=fixture(['rover_havoc']);execute(e,'rover_havoc','E2');const a=e.allies[0];assert.equal(Effects.preview(e,a,skill(e,'rover_havoc','A'),'A',0,{}).audit.base_energy,20);execute(e,'rover_havoc','S');e.packets=[];Effects.afterEnemyRoot(e,{actor:e.enemies[0],skipped:true});assert.equal(derived(e,'field').length,0);Effects.afterEnemyRoot(e,{actor:e.enemies[0],completed:true});assert.equal(derived(e,'field').length,1);Effects.afterEnemyRoot(e,{actor:e.enemies[0],completed:true});assert.equal(e.enemies[0].status.havoc_field,undefined);
});
test('Aero conversion preserves leftovers and refreshes only wind ownership, no marrow or explosion',()=>{
  const e=fixture(['amy','rover_aero','rover_electro']);const [amy,aero,electro]=e.allies,t=e.enemies[0];aero.atk=80;Effects.applyAbnormal(e,amy,t,'fusion_burst',4);execute(e,'rover_electro','S',3,{allyTarget:'rover_aero'});aero.sp=0;
  const originalExpiry=t.status.fusion_burst.expires,pr=Effects.convertAbnormal(e,aero,t,'fusion_burst');assert.equal(pr.move,3);assert.equal(t.status.fusion_burst.stacks,1);assert.equal(t.status.fusion_burst.expires,originalExpiry);assert.equal(t.status.aero_erosion.ownerId,aero.id);assert.equal(t.status.aero_erosion.owner_ATK_snapshot,80);assert.equal(aero.sp,0);assert.ok(aero.status.electro_marrow);assert.equal(e.events.filter(x=>x.type==='fusion_burst').length,0);
});
test('Aero full-cap conversion is exact no-op and cap modifiers max rather than add',()=>{
  const e=fixture(['rover_aero','chisa']);const [a,chisa]=e.allies,t=e.enemies[0];execute(e,'rover_aero','S');Effects.addCapacity(e,chisa,t,'aero_erosion',1,3,'chisa_capacity');assert.equal(Effects.capacity(e,t,'aero_erosion'),5);Effects.applyAbnormal(e,a,t,'aero_erosion',5);Effects.applyAbnormal(e,chisa,t,'spectro_frazzle',3);const old=clone(t.status);assert.equal(Effects.convertAbnormal(e,a,t,'spectro_frazzle').move,0);assert.deepEqual(t.status,old);next(e);next(e);assert.equal(t.status.aero_erosion.stacks,4);assert.equal(Effects.capacity(e,t,'aero_erosion'),4);
});
test('Electro marrow is conditional directed SP; relay can enable any teammate and is not self SP',()=>{
  const e=fixture(['rover_electro','lynae']);const [r,l]=e.allies;execute(e,'rover_electro','E2A');execute(e,'rover_electro','S',3,{allyTarget:'lynae'});l.sp=1;execute(e,'lynae','A',3);assert.equal(l.sp,25);assert.equal(l.status.electro_relay,undefined);assert.equal(l.status.electro_marrow,undefined);assert.equal(e.enemies[0].status.electro_flare.stacks,1);assert.equal(e.enemies[0].status.electro_flare.ownerId,l.id);assert.ok(Effects.validate(e,context(e,'rover_electro','S',0,{allyTarget:'rover_electro'})));
});
test('Electro critical finisher is exactly four elements and Q weighted root budget',()=>{
  const e=fixture(['rover_electro']);execute(e,'rover_electro','E2B');const c=execute(e,'rover_electro','E1-state',3);assert.deepEqual(c.attacks.map(x=>x.element),['衍射','湮灭','气动','导电']);assert.ok(Math.abs(c.attacks.reduce((n,x)=>n+x.coef,0)-7.38)<1e-8);assert.deepEqual(c.attacks.map(x=>x.q),[6.48,6.48,4.32,4.32]);
});
test('source ownership replacement prevents old owner death from clearing the new pool',()=>{
  const e=fixture(['rover_aero','chisa']);const [a,c]=e.allies,t=e.enemies[0];Effects.applyAbnormal(e,c,t,'aero_erosion',1);Effects.applyAbnormal(e,a,t,'aero_erosion',1);c.hp=0;Effects.onDown(e,c);assert.equal(t.status.aero_erosion.stacks,2);a.hp=0;Effects.onDown(e,a);assert.equal(t.status.aero_erosion,undefined);
});
test('same effect refresh has no hidden charges and duplicate same-round support is ineffective',()=>{
  const e=fixture(['mornye']);execute(e,'mornye','E5');const c=execute(e,'mornye','E5');assert.equal(c.effective,false);assert.equal(e.allies[0].status.mornye_support.uses,1);
});

test('retreated targets and sources cannot keep or receive a role effect',()=>{
  const e=fixture(['mornye','amy']);e.allies[1].retreated=true;execute(e,'mornye','E5');assert.equal(e.allies[1].status.mornye_support,undefined);e.allies[0].retreated=true;Effects.onDown(e,e.allies[0]);assert.equal(e.allies[0].status.mornye_support,undefined);
});
test('Amy successful lethal E4 still grants own next-action qualification',()=>{
  const e=fixture(['amy']);e.enemies[0].hp=1;execute(e,'amy','E4');assert.ok(e.allies[0].status.amy_quick);
});
test('next-action qualifications expire after generic committed action but not waiting',()=>{
  const e=fixture(['lynae','mornye','amy']);execute(e,'lynae','R');Effects.onActionEnd(e,e.allies[0],{skill:{generic:true},key:'wait'});assert.ok(e.allies[0].status.lynae_empowered);Effects.onActionEnd(e,e.allies[0],{skill:{generic:true},key:'guard'});assert.equal(e.allies[0].status.lynae_empowered,undefined);
  execute(e,'amy','E4');Effects.onActionEnd(e,e.allies[2],{skill:{generic:true},key:'item_sp'});assert.equal(e.allies[2].status.amy_quick,undefined);
  execute(e,'mornye','E1');Effects.onActionEnd(e,e.allies[1],{skill:{generic:true},key:'guard'});assert.equal(e.allies[1].status.mornye_guard,undefined);
});
test('area attack uses selected main target first for Lynae chase locking',()=>{
  const e=fixture(['lynae']);execute(e,'lynae','E2');e.packets=[];execute(e,'lynae','E3',0,{},e.enemies[2]);assert.deepEqual(derived(e,'coordinated').map(p=>p.target.id),['enemy2','enemy2']);
});
test('Denia spill prelocks secondary and never retargets after that secondary dies',()=>{
  const e=fixture(['denia','amy']);execute(e,'denia','E1');execute(e,'denia','E5',0,{allyTargets:['amy']});const c=context(e,'amy','A');Effects.prepare(e,c);assert.equal(c.spillTargetId,'enemy1');e.enemies[1].hp=0;Effects.onDown(e,e.enemies[1]);c.hitTargets.enemy0=true;Effects.afterBreaks(e,c);assert.equal(derived(e,'response').length,0);assert.ok(e.allies[1].status.denia_spill);
});
test('Aero conversion against destination application immunity is atomic no-op',()=>{
  const e=fixture(['rover_aero']);const a=e.allies[0],t=e.enemies[0];Effects.applyAbnormal(e,a,t,'fusion_burst',4);t.abnormalImmunity=['aero_erosion'];const before=clone(t.status);assert.equal(Effects.convertAbnormal(e,a,t,'fusion_burst').move,0);assert.deepEqual(t.status,before);
});
test('snapshot role schema rejects missing fields, forged strengths, owners and side',()=>{
  const e=fixture(['mornye','amy']);execute(e,'mornye','E5');assert.equal(Effects.validateState(e),true);const a=e.allies[1],s=clone(a.status.mornye_support);
  delete a.status.mornye_support.amount;assert.throws(()=>Effects.validateState(e));a.status.mornye_support=clone(s);a.status.mornye_support.amount=12;assert.throws(()=>Effects.validateState(e));a.status.mornye_support=clone(s);a.status.mornye_support.ownerId=a.id;a.status.mornye_support.sourceId=a.id;assert.throws(()=>Effects.validateState(e));a.status.mornye_support=clone(s);assert.equal(Effects.validateState(e),true);
});
test('Havoc field keeps cast source bonuses instead of reading a later boost',()=>{
  const e=fixture(['rover_havoc']);e.allies[0].status.damage_boost={amount:.15};execute(e,'rover_havoc','S');assert.equal(e.enemies[0].status.havoc_field.damageBonusSnapshot,.15);e.allies[0].status.damage_boost.amount=.75;Effects.afterEnemyRoot(e,{actor:e.enemies[0],completed:true});const p=derived(e,'field').at(-1);assert.equal(p.damageBonus,.15);assert.equal(p.snapshotSourceBonuses,true);
});

test('invalid auxiliary selections are rejected before mutation rather than defaulted or crashing',()=>{
  const e=fixture(['mornye','denia','chisa','rover_aero']);
  assert.ok(Effects.validate(e,context(e,'mornye','E1',0,{allyTarget:'missing'})));
  assert.ok(Effects.validate(e,context(e,'denia','E5',0,{allyTargets:'not-an-array'})));
  assert.ok(Effects.validate(e,context(e,'chisa','E6',0,{abnormalSelections:[null]})));
  assert.ok(Effects.validate(e,context(e,'rover_aero','E3',0,{abnormal:{enemy0:'fusion_burst'}})));
});
test('Mornye interference boosts allied abnormal HP damage but not enemy-owned reflection',()=>{
  const e=fixture(['mornye','amy']);execute(e,'mornye','E2');execute(e,'mornye','E4');e.enemies[0].q=1;execute(e,'amy','A');const t=e.enemies[0];assert.equal(Effects.modifiers(e,e.allies[1],t,{kind:'status'}).allHpAmplify,.12);assert.equal(Effects.modifiers(e,t,t,{kind:'reflection'}).allHpAmplify,undefined);
});

test('Lynae liberation support consumes only R/R1/R2, never liberation-class skills or blue A',()=>{
  const e=fixture(['lynae','amy','denia']);execute(e,'lynae','E5',0,{allyTarget:'amy'});let c=execute(e,'amy','E2');assert.equal(c.roleAmplify,0);assert.ok(e.allies[1].status.lynae_r_support);c=execute(e,'amy','R1');assert.equal(c.roleAmplify,.10);assert.equal(e.allies[1].status.lynae_r_support,undefined);
  execute(e,'lynae','E5',0,{allyTarget:'denia'});e.allies[2].form='blue';c=execute(e,'denia','A');assert.equal(c.roleAmplify,0);assert.ok(e.allies[2].status.lynae_r_support);c=execute(e,'denia','R2',3);assert.equal(c.roleAmplify,.10);assert.equal(e.allies[2].status.lynae_r_support,undefined);
});
test('Denia spill uses DEF-scaled original body for Mornye, subject to Denia cap',()=>{
  const e=fixture(['denia','mornye']);e.allies[1].atk=1;e.allies[1].def=200;execute(e,'denia','E1');execute(e,'denia','E5',0,{allyTargets:['mornye']});e.packets=[];execute(e,'mornye','A');assert.equal(derived(e,'response')[0].base,36);
});
