'use strict';
// Actual app focus/keydown handlers with multi-callback RAF simulation.
// This isolates deferred focus stealing; it does not diagnose pointer geometry.
const {boot,settle}=require('../independent/v03/dom_harness_v03.cjs');
const assert=require('assert'),fs=require('fs'),path=require('path');
(async()=>{const h=await boot();await settle(h);const checks=[];
 const check=(name,fn)=>{fn();checks.push({name,pass:true});};
 const enter=()=>h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 const state=()=>JSON.stringify(h.w.BattleLabDiagnostics.getSnapshot());
 h.click('#actorTrigger');h.click('[data-category=battle]');const end=h.$('[data-action=end]');end.focus();await h.frame(20);
 check('Opening-menu focus cannot overwrite a later user focus on End',()=>assert.equal(h.w.document.activeElement,end));
 enter();check('Enter after that frame selects End rather than the first action',()=>assert.equal(h.diag().selected,'end'));
 h.click('#cancelBtn');h.click('[data-action=basic]');const before=state();h.$('#cancelBtn').focus();await h.frame(250);
 check('Opening-target focus cannot overwrite a later user focus on Cancel',()=>assert.equal(h.w.document.activeElement,h.$('#cancelBtn')));
 enter();check('Enter on early-focused Cancel returns without AP or battle mutation',()=>{assert.equal(h.diag().selected,null);assert.equal(state(),before);});
 assert.deepStrictEqual(h.errors,[]);h.close();
 const result={kind:'Simulated focus/keyboard timing regression; not pointer/browser geometry evidence',createdAt:new Date().toISOString(),passed:checks.length,checks};
 if(!process.env.QA_ROOT)fs.writeFileSync(path.join(__dirname,'ui_focus_timing_results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
