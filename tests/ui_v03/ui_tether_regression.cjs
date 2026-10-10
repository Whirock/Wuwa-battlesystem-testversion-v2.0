'use strict';
// Real UI events and engine state; simulated canvas/RAF/geometry, not screenshots.
const {boot,settle}=require('../independent/v03/dom_harness_v03.cjs');
const assert=require('assert'),fs=require('fs'),path=require('path');
(async()=>{const checks=[];
 const check=(name,fn)=>{fn();checks.push({name,pass:true});};
 for(const form of ['male_default','male_school','female_default','female_school'])for(const reduced of [false,true]){
  const h=await boot();await settle(h);let width=1000,height=600;const stage=h.$('#stage');
  Object.defineProperty(stage,'clientWidth',{get:()=>width});Object.defineProperty(stage,'clientHeight',{get:()=>height});
  h.$('#battleCanvas').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.click('#setupBtn');for(const n of h.w.document.querySelectorAll('#teamChoices input'))n.checked=n.value==='rover';h.change('[data-appearance=rover]',form);h.change('[data-mode=rover]','electro');h.change('#difficultySelect','easy');h.click('#startBtn');await settle(h);await h.frame(40);
  if(reduced){h.click('#assetsBtn');h.click('[data-tab=project]');h.$('#reduceMotion').checked=true;h.$('#reduceMotion').dispatchEvent(new h.w.Event('change',{bubbles:true}));h.click('[data-close=assetDialog]');}
  const label=form+(reduced?' reduced':' motion'),snapshot=()=>h.w.BattleLabDiagnostics.getSnapshot(),layout=()=>h.w.BattleLabDiagnostics.getStageLayout();
  function select(){h.click('#actorTrigger');h.click('[data-category=skills]');h.click('[data-action=skill]');}
  const beforeCancel=JSON.stringify(snapshot());select();h.click('#cancelBtn');await h.frame(40);
  check(label+' cancel creates no rope and changes no battle state',()=>{assert.equal(layout().effects.length,0);assert.equal(JSON.stringify(snapshot()),beforeCancel);});
  h.click('[data-action=skill]');const targets=[...h.w.document.querySelectorAll('[data-target]')],chosen=targets[targets.length-1];chosen.click();const target=chosen.dataset.target;await h.frame(250);
  const before=snapshot(),expected=h.w.BattleEngine.restore(h.w.BATTLE_PARAMETERS,before);expected.act('skill',target);h.click('#confirmBtn');h.click('#confirmBtn');await h.frame(reduced?20:120);
  check(label+' rope uses the actual target and declared right-palm anchor',()=>{const fx=layout().effects;assert.equal(fx.length,1);assert.equal(fx[0].target,target);const a=layout().bounds.find(x=>x.id===fx[0].actor);assert.equal(fx[0].from.x,Math.round(a.castX));assert.equal(fx[0].from.y,Math.round(a.castY));assert(fx[0].points.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)));});
  check(label+' graphics and repeated confirmation do not mutate extra gameplay',()=>assert.equal(JSON.stringify(snapshot()),JSON.stringify(expected.snapshot())));
  width=730;height=480;await h.frame(1);
  check(label+' resize recalculates both rope endpoints',()=>{const fx=layout().effects[0],a=layout().bounds.find(x=>x.id===fx.actor),b=layout().bounds.find(x=>x.id===target);assert.equal(fx.from.x,Math.round(a.castX));assert.equal(fx.to.x,Math.round(b.x));});
  h.click('#restartBtn');await h.frame(20);
  check(label+' restart clears the transient rope immediately',()=>assert.equal(layout().effects.length,0));
  await settle(h);await h.frame(40);select();await h.frame(250);h.click('#confirmBtn');await h.frame(1000);
  check(label+' rope expires after the short animation without cleanup clicks',()=>assert.equal(layout().effects.length,0));
  check(label+' no DOM runtime errors',()=>assert.deepStrictEqual(h.errors,[]));h.close();
 }
 const h=await boot();await settle(h);h.click('#assetsBtn');h.change('#assetEntity','rover');h.change('#assetForm','female_school');h.change('#assetSlot','rover.female_school.03-CM');
 check('Revised female-school critical preserves rejection history and awaits user acceptance',()=>{const s=h.w.BattleLabDiagnostics.assets.slots['rover.female_school.03-CM'];assert.equal(s.assetStatus,'static_revision_pass');assert.equal(s.acceptanceStatus,'user_acceptance_pending');assert.equal(s.userConfirmed,false);assert.equal(s.revisionHistory[0].status,'user_rejected');assert(h.$('#assetPanel').textContent.includes('待用户确认'));assert(s.src.includes('RVF-S-03-CM_v004'));});h.close();
 const result={kind:'Simulated DOM/Canvas tether lifecycle and state regression',createdAt:new Date().toISOString(),passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'ui_tether_results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
