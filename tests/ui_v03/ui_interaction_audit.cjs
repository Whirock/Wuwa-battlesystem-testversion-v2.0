'use strict';
/* DOM + real-engine integration. Canvas, timers, layout, audio and IDB are simulated.
   This is not pixel, real-browser, sound-codec, Windows or human usability evidence. */
const {boot,settle}=require('../independent/v02/dom_harness.cjs');
const assert=require('assert'),fs=require('fs'),path=require('path');
const checks=[];
const check=(name,fn)=>{fn();checks.push({name,pass:true});};
(async()=>{const h=await boot();await settle(h);await h.frame(1000);
 const key=(key,repeat=false)=>h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key,repeat,bubbles:true,cancelable:true}));
 const snap=()=>h.w.BattleLabDiagnostics.getSnapshot();
 const state=()=>snap().state;
 const actor=()=>state().allies.find(u=>u.id===state()._currentId);
 const stage=h.$('#stage');Object.defineProperty(stage,'clientWidth',{configurable:true,value:1000});Object.defineProperty(stage,'clientHeight',{configurable:true,value:600});
 await h.frame();
 check('Default stage has no command panel; active actor has native accessible trigger',()=>{assert(!h.diag().menuOpen);assert(h.$('#commandPanel').classList.contains('hidden'));assert(h.$('#actorTrigger').getAttribute('aria-label').includes('行动点'));});
 let before=snap(),id=h.diag().current,ap=actor().ap;
 h.click('#actorTrigger');
 check('Actor opens focus mode without spending AP',()=>{assert(h.diag().menuOpen);assert(stage.classList.contains('focus-mode'));assert.deepStrictEqual(snap(),before);});
 check('Top menu contains battle, skill, outro, negotiate, escape only',()=>assert.deepStrictEqual([...h.w.document.querySelectorAll('[data-category]')].map(x=>x.dataset.category),['battle','skills','outro','negotiate','escape']));
 h.click('[data-category="battle"]');
 check('Guard and items nested under battle; removed pry and encourage absent',()=>{const all=[...h.w.document.querySelectorAll('[data-action]')].map(x=>x.dataset.action);assert(all.includes('guard'));assert(all.includes('item_repair'));assert(!all.includes('pry'));assert(!all.includes('encourage'));});
 h.click('[data-action="basic"]');
 check('Selecting action hides command and detail while showing target dock',()=>{assert(h.$('#commandPanel').classList.contains('hidden'));assert(h.$('#actionDetail').classList.contains('hidden'));assert(!h.$('#targetArea').classList.contains('hidden'));assert(!stage.classList.contains('focus-mode'));assert.deepStrictEqual(snap(),before);});
 h.$('#cancelBtn').focus();key('Enter');check('Enter on focused Cancel returns without confirmation or AP payment',()=>{assert(!h.diag().selected);assert.deepStrictEqual(snap(),before);});h.click('[data-action="basic"]');const first=h.diag().targetId;key('ArrowDown');const second=h.diag().targetId;
 check('Arrow navigation selects another valid target',()=>assert.notEqual(first,second));
 key('Escape');
 check('Escape restores the originating battle submenu at no cost',()=>{assert.equal(h.diag().menuCategory,'battle');assert(h.diag().menuOpen);assert(!h.diag().selected);assert.deepStrictEqual(snap(),before);});
 h.click('[data-action="basic"]');await h.frame(250);h.click('#confirmBtn');const after=snap();h.click('#confirmBtn');key('Enter',true);key('Enter');
 check('Confirmation pays once; duplicate click/repeat Enter/animation input cannot mutate again',()=>{assert(h.diag().busy);assert.deepStrictEqual(snap(),after);assert.equal(actor().ap,ap-2);});
 await settle(h);
 check('One action closes menu but retains the same actor window and 2 remaining AP',()=>{assert(!h.diag().menuOpen);assert.equal(h.diag().current,id);assert.equal(actor().ap,2);assert(!stage.classList.contains('focus-mode'));});
 h.click('#actorTrigger');check('Same actor can reopen after paid action',()=>assert(h.diag().menuOpen));
 h.$('#battleCanvas').dispatchEvent(new h.w.MouseEvent('click',{clientX:2,clientY:2,bubbles:true}));
 check('Blank canvas click dismisses focus mode without consuming AP',()=>{assert(!h.diag().menuOpen);assert.deepStrictEqual(snap(),after);});
 h.$('#actorTrigger').focus();key('Enter');check('Keyboard Enter opens actor menu',()=>assert(h.diag().menuOpen));key('Escape');
 check('Escape from root fully closes command mode and returns focus to actor',()=>{assert(!h.diag().menuOpen);assert.equal(h.w.document.activeElement.id,'actorTrigger');});
 h.click('#actorTrigger');h.click('[data-category="battle"]');h.click('[data-action="guard"]');await h.frame(250);h.click('#confirmBtn');await settle(h);
 check('Guard ends actor window and status is an underlined focusable tooltip trigger',()=>{assert.notEqual(h.diag().current,id);const status=h.$('[data-tooltip]');assert(status);status.focus();assert(!h.$('#statusTooltip').classList.contains('hidden'));assert(h.$('#statusTooltip').textContent.length>0);});
 check('Normal enemy cards have no resonance/shield or weaknesses displayed',()=>{assert.equal(h.w.document.querySelectorAll('#enemyCards .shield-num').length,0);assert.equal(h.w.document.querySelectorAll('#enemyCards .weaknesses').length,0);assert(h.$('#enemyCards').textContent.includes('常规意图隐藏'));});
 check('Each ally has exactly six regular and two temporary AP slots',()=>{for(const card of h.w.document.querySelectorAll('#partyCards .unit-card')){assert.equal(card.querySelectorAll('.ap-normal i').length,6);assert.equal(card.querySelectorAll('.ap-temp i').length,2);}});
 for(const [w,height]of [[1000,600],[600,500],[365,370]]){Object.defineProperty(stage,'clientWidth',{configurable:true,value:w});Object.defineProperty(stage,'clientHeight',{configurable:true,value:height});await h.frame();const layout=h.w.BattleLabDiagnostics.getStageLayout();check(`Formation coordinates are finite and inside nominal ${w}x${height} stage`,()=>{for(const p of layout.positions){assert(p.x>0&&p.x<w);assert(p.y>0&&p.y<height);}});}
 h.click('#assetsBtn');check('Asset workbench retains sprite replacement and original-size review',()=>{assert(h.$('#spriteFile'));assert(h.$('#inspectSpriteBtn'));});h.click('#inspectSpriteBtn');check('Original-size image review preserves actual asset URL without mirroring',()=>assert(h.$('#spriteFullImage').src.includes('assets/')));h.click('[data-close="spriteZoomDialog"]');h.click('[data-close="assetDialog"]');
 h.change('#speedSelect','4');let steps=0;while(!h.diag().result&&h.diag().round<5&&steps<180){await settle(h);if(h.diag().result)break;h.click('#stepBtn');await settle(h);steps++;}
 check('At least four real-engine rounds or a terminal result run through DOM step controls without errors',()=>{assert(h.diag().round>=5||h.diag().result);assert.equal(h.errors.length,0);});
 const result={kind:'DOM/event integration only',browserVerified:false,pixelVerified:false,createdAt:new Date().toISOString(),passed:checks.length,checks,round:h.diag().round,steps,errors:h.errors,limits:['Canvas, timers, audio, viewport layout and IndexedDB mocked by jsdom harness.','Real Chromium launch blocked by sandbox Unix sockets; escalated launch blocked by bwrap infrastructure.','No Windows launch, audio codec or human gameplay certification.']};fs.writeFileSync(path.join(__dirname,'ui_interaction_results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));h.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
