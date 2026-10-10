'use strict';
module.exports=function(C){
 const {assert,P,Engine,result,test,construct,inspectFinite,keys}=C;
 function legalCommand(e,rng){
  const a=e.current,rows=[];
  for(let bp=0;bp<=Math.min(3,a.bp);bp++)for(const row of e.availableActions(a.id,bp))if(row.enabled&&!/需要至少两名存活敌人的有效归群/.test(row.selectionReason||'')&&!(row.multiTarget?.kind==='abnormal'&&!row.multiTarget.ids?.length)&&!['escape','retreat','negotiate','wait'].includes(row.key))rows.push({row,bp});
  assert.ok(rows.length,'living normal slot has no legal action');
  const chosen=rows[Math.floor(rng()*rows.length)],r=chosen.row,opts={bp:chosen.bp};
  const targets=r.targets||[],allies=r.allyTargets||[];
  const targetId=targets.length?targets[Math.floor(rng()*targets.length)]:e.living('enemy')[0]?.id;
  if(allies.length)opts.allyTargetId=allies.find(id=>id!==a.id)||allies[0];
  if(r.choices?.length){const v=r.choices[Math.floor(rng()*r.choices.length)];opts.choice=typeof v==='string'?v:v.id||v.key||v.value;}
  if(r.multiTarget){const ids=(r.multiTarget.ids||targets).filter(id=>r.multiTarget.kind!=='extra_enemies'||id!==targetId);const cap=Math.min(r.multiTarget.max||chosen.bp+1,ids.length);opts.targetIds=ids.slice(0,cap);if(r.multiTarget.kind==='abnormal'&&opts.targetIds.length)opts.abnormal=Object.fromEntries(opts.targetIds.map(id=>[id,r.abnormalChoicesByTarget?.[id]?.[0]?.value]));}
  if(a.key==='chisa'&&r.key==='E6'){
   const t=e.getUnit(targetId);const available=['spectro_frazzle','aero_erosion','electro_flare','fusion_burst','havoc_bane'].filter(k=>t?.status?.[k]?.stacks>0);
   if(available.length&&!opts.abnormal)opts.abnormal=available[0];
  }
  if(a.key==='rover_aero'&&r.key==='rover_aero_e3'){
   const t=e.getUnit(targetId);opts.abnormal=['spectro_frazzle','electro_flare','fusion_burst','havoc_bane'].find(k=>t?.status?.[k]?.stacks>0)||'none';
  }
  return [r.key,targetId,opts];
 }
 function rng(seed){let x=seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
 function step(e,pick){if(e.current?.side==='enemy')return e.stepEnemy();const c=legalCommand(e,pick);const r=e.act(...c);assert.equal(r.ok,true,`advertised legal ${JSON.stringify(c)} rejected: ${r.reason}`);return r;}
 for(const key of keys)test(`persistence:${key}: JSON snapshot deterministic continuation`,()=>{
  let e=construct([key,key==='mornye'?'lynae':'mornye'],{encounter:'elite_humanoid',seed:713,stochastic:true});e.start();
  for(let i=0;i<12&&!e.result;i++)e.autoAction();
  const snap=JSON.parse(JSON.stringify(e.snapshot()));const b=Engine.restore(P,snap);assert.deepEqual(b.snapshot(),snap);
  for(let i=0;i<35&&!e.result;i++){const r1=e.autoAction(),r2=b.autoAction();assert.deepEqual(r2,r1);assert.deepEqual(b.snapshot(),e.snapshot());}
 });
 test('persistence rejects legacy AP and unknown schema',()=>{assert.throws(()=>Engine.restore(P,{schema:'battle-engine-v2-ap',parameter_version:'0.3.0',state:{ap:8}}));assert.throws(()=>Engine.restore(P,{schema:'battle-engine-v4-bp',version:3,state:{}}));});
 test('persistence rejects malformed nonfinite resources',()=>{const e=construct(['amy']);e.start();const s=e.snapshot();s.state.allies[0].bp=-1;assert.throws(()=>Engine.restore(P,s));});
 test('legal seeded policy: nine profile smoke',()=>{for(const key of keys){const e=construct([key,'lynae'===key?'mornye':'lynae'],{encounter:'normal',seed:101,stochastic:true});e.start();const pick=rng(501);for(let i=0;i<120&&!e.result;i++){step(e,pick);inspectFinite(e);e.validate();}}});
 if(process.env.INDEPENDENT_MATRIX==='0'){result.notRun.push('Full actual-team matrix explicitly disabled by INDEPENDENT_MATRIX=0');return;}
 const teams=[];for(let mask=1;mask<(1<<keys.length);mask++){const team=keys.filter((_,i)=>mask&(1<<i));if(team.length<=4&&team.filter(x=>x.startsWith('rover_')).length<=1)teams.push(team);}
 assert.equal(teams.length,134);result.matrix={kind:'unmodified real initial configurations, random legal policies',level:20,start:'full HP/SP, BP1, E0',teamCount:teams.length,rows:[],aggregate:{}};
 for(const encounter of Object.keys(P.encounters)){
  test(`actual matrix:${encounter}:134 legal team compositions`,()=>{
   const failures=[];
   for(let i=0;i<teams.length;i++){
    const team=teams[i],seed=0x4200+i,e=construct(team,{encounter,seed,stochastic:true});e.start();const pick=rng(seed^0x123456);let steps=0,issue=null;
    try{for(;steps<600&&!e.result;steps++){step(e,pick);inspectFinite(e);e.validate();}}catch(err){issue=err.message;failures.push({team,steps,issue});}
    const outcome=issue?'error':e.result||'bounded_600_actions';const out=typeof outcome==='string'?outcome:outcome.outcome;const row={team,seed,steps,round:e.round,outcome:out,hp:e.allies.map(a=>a.hp)};
    if(issue)row.issue=issue;result.matrix.rows.push({encounter,...row});result.matrix.aggregate[encounter+':'+out]=(result.matrix.aggregate[encounter+':'+out]||0)+1;
   }
   assert.equal(failures.length,0,JSON.stringify(failures.slice(0,8)));
  });
 }
};
