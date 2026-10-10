'use strict';
module.exports=function(C){
 const {assert,O,P,result,test,close,keyOf,eventRows,fixture,actor,setTurn,act}=C;
 function prep(profile,s,bp){
  let f=fixture(profile.key,profile.key==='chisa'&&keyOf(s)==='E6'?{team:['chisa','lynae','rover_spectro']}:{});
  const {e,a,t,b}=f;const key=keyOf(s);
  const setup=(k,target=t,opts={})=>{a.sp=a.maxsp;a.bp=5;act(e,a,k,target,opts);};
  if(profile.key==='lynae'&&['E3','E4'].includes(key))setup('E2');
  if(profile.key==='mornye'&&['E3','E4'].includes(key))setup('E2');
  if(profile.key==='chisa'&&['E4','E5'].includes(key))setup('E3');
  if(profile.key==='denia'&&key==='E5')setup('E1');
  if(key==='R2'||(profile.key==='denia'&&key==='E3')){a.energy=a.energyCap;setup('R1');}
  if(key==='rover_electro_e1_state')setup('rover_electro_e2b');
  if(profile.key==='chisa'&&key==='E6'){
   const source=actor(e,'rover_spectro');act(e,source,'rover_spectro_e1',t);
  }
  setTurn(e,a);a.sp=a.maxsp;a.bp=5;a.energy=s.numeric_audit.energy_cost?a.energyCap:0;
  for(const target of e.enemies){target.hp=target.maxhp=1e8;target.q=target.maxq=1e6;}
  for(const ally of e.allies){ally.energy=ally===a?a.energy:0;ally.hp=Math.floor(ally.maxhp*.5);ally.cr=0;}
  let target=t,opts={bp};
  if(profile.key==='amy'&&key==='E5'){target=b;opts.allyTargetId=b.id;}
  if(profile.key==='lynae'&&key==='E5')opts.allyTargetId=b.id;
  if(profile.key==='mornye'&&['E1','E3'].includes(key))opts.allyTargetId=b.id;
  if(profile.key==='denia'&&key==='E5'){opts.targetIds=e.allies.slice(0,bp+1).map(x=>x.id);target=e.allies[0];}
  if(profile.key==='chisa'&&key==='E6'){opts.targetIds=[t.id];opts.abnormal='spectro_frazzle';}
  if(key==='rover_electro_s'){target=b;opts.allyTargetId=b.id;}
  if(key==='rover_aero_e3')opts.abnormal='none';
  return {...f,target,opts};
 }
 for(const p of O.profiles){for(const s of p.skills){const key=keyOf(s),id=p.key+':'+key;
  result.coverage[id]={name:s.name,bpTested:[],numeric:'pending',effects:'see focused suites'};
  for(let bp=0;bp<=3;bp++){
   if(!s.numeric_audit.legal_by_bp[bp])continue;
   test(`card:${id}:BP${bp}`,()=>{
    const {e,a,t,b,target,opts}=prep(p,s,bp),n=s.numeric_audit;
    const pre={sp:a.sp,bp:a.bp,energy:a.energy,round:e.round,q:e.enemies.map(x=>x.q),allyEnergy:e.allies.map(x=>x.energy)};
    const r=e.act(key,target.id,opts);assert.equal(r.ok,true,`legal frozen card rejected: ${r.reason}`);
    assert.equal(a.sp,pre.sp-n.sp,`SP cost`);assert.equal(a.bp,pre.bp-bp,`BP charged once`);
    assert.equal(eventRows(r,'action_commit').length,1,'one root');
    assert.equal(eventRows(r,'original_attack').length,n.original_attacks_by_bp[bp],'true original attack count');
    // Independently recompute original-body HP damage at zero DEF/resistance/CR.
    // Coordinated, attached, abnormal, field and response packets stay excluded.
    const count=n.original_attacks_by_bp[bp],body=(r.events||[]).filter(x=>x.event==='damage'&&x.kind==='original'&&x.target===t.id);
    if(count){
      const attackWeights=s.attack_sequence?.length===count?s.attack_sequence.map(x=>x.coefficient_atk):null;
      const baseWeight=attackWeights?.reduce((x,y)=>x+y,0)||1;
      let expected=0;
      for(let i=0;i<count;i++){
        const factor=n.role_class==='basic'?(i===0?1:.4):attackWeights?attackWeights[i]/baseWeight:1/count;
        const ac=(n.role_class==='basic'?n.damage_atk_by_bp[0]:n.damage_atk_by_bp[bp])*factor;
        const dc=(n.role_class==='basic'?(n.damage_def_by_bp?.[0]||0):(n.damage_def_by_bp?.[bp]||0))*factor;
        expected+=Math.max(1,Math.floor(ac*a.atk+dc*a.def));
      }
      assert.equal(body.reduce((v,x)=>v+x.hpDamage,0),expected,'independent per-attack original HP budget');
    }else assert.equal(body.length,0,'support is not a hidden attack');
    // The primary target gets the root Q budget, never attack-count multiplication.
    close(pre.q[0]-t.q,n.q_by_bp[bp],`primary Q`);
    if(n.energy_cost)close(a.energy,0,'ultimate paid full energy');
    else if(!a.energyLocked)close(a.energy-pre.energy,n.base_energy*a.er,'root self energy');
    for(let i=0;i<e.allies.length;i++){const u=e.allies[i];if(u!==a&&!u.energyLocked)close(u.energy-pre.allyEnergy[i],n.base_energy*.5*u.er,`receiver ${u.key} energy`);}
    result.coverage[id].bpTested.push(bp);result.coverage[id].numeric='passed executable cases';
   });
  }
 }}
 test('R2 rejects BP0/1/2 without mutation',()=>{for(const key of ['amy','denia'])for(let bp=0;bp<3;bp++){
  const p=O.profiles.find(x=>x.key===key),s=p.skills.find(x=>keyOf(x)==='R2');const {e,a,t}=prep(p,s,3);const before=e.snapshot();assert.equal(e.act('R2',t.id,{bp}).ok,false);assert.deepEqual(e.snapshot(),before);
 }});
};
