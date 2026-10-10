'use strict';
// Simulated geometry only. Element dimensions and canvas are mocked: this is not
// a browser screenshot/layout review. Preserve the persistent drawing RAF when
// app focus callbacks request one-shot RAFs (the legacy harness has one slot).
const {boot,settle}=require('../independent/v02/dom_harness.cjs');
const assert=require('assert'),fs=require('fs'),path=require('path');
(async()=>{const checks=[];
 for(const width of [620,650,700,1000]){
  const h=await boot();await settle(h);
  const drawRAF=h.w.requestAnimationFrame;
  h.w.requestAnimationFrame=fn=>fn.name==='drawStage'?drawRAF(fn):(Promise.resolve().then(()=>fn(h.w.performance.now())),0);
  const height=600,stage=h.$('#stage');
  Object.defineProperty(stage,'clientWidth',{value:width,configurable:true});
  Object.defineProperty(stage,'clientHeight',{value:height,configurable:true});
  h.$('#battleCanvas').getBoundingClientRect=()=>({left:0,top:0,width,height});
  for(let i=0;i<4;i++){
   // Legacy fake timers can rewind `now` while settling. Move beyond old frames.
   await h.frame(1000000*(i+1));h.click('#actorTrigger');await h.frame(1000);
   const unit=h.diag().current,layout=h.w.BattleLabDiagnostics.getStageLayout(),b=layout.bounds.find(x=>x.id===unit),p=layout.positions.find(x=>x.id===unit),detail=h.$('#actionDetail');
   assert.equal(b.x,p.x,'Drawing RAF must use the current formation, not stale bounds');
   const edge=parseFloat(detail.style.left)+parseFloat(detail.style.width);
   assert(edge<=b.left-10,`${width}: details touch ${unit}: right ${edge}, actor left ${b.left}`);
   checks.push({name:`${width}x600 details clear ${unit}`,pass:true,detailRight:edge,actorLeft:b.left});
   h.click('[data-category=battle]');h.click('[data-action=end]');await h.frame(250);h.click('#confirmBtn');await settle(h);
  }
  assert.deepStrictEqual(h.errors,[]);h.close();
 }
 const result={kind:'Simulated canvas/DOM coordinate regression, not real browser layout',createdAt:new Date().toISOString(),passed:checks.length,checks};
 fs.writeFileSync(path.join(__dirname,'ui_overlay_clearance_results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
