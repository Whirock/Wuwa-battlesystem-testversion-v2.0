'use strict';
// Genuine AP/resource accumulation before advanced actions; simulated renderer evidence only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),A=require('node:assert/strict');
const ROOT=process.env.QA_ROOT||process.cwd(),OUT=process.env.QA_OUT||__dirname;
const {boot,settle}=require(path.join(ROOT,'tests/independent/v03/dom_harness_v03.cjs'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
const files=['app.js','assets.js','assets/manifest.json','engine.js','parameters.js','tests/independent/v03/dom_harness_v03.cjs'],hashes=Object.fromEntries(files.map(f=>[f,hash(f)]));let results=[];
function select(h,key,category){h.click('#actorTrigger');h.click('[data-category='+category+']');h.click('[data-action='+key+']');}
async function execute(h,key,category){select(h,key,category);await h.frame(250);h.click('#confirmBtn');await settle(h);}
(async()=>{for(const form of ['male_default','male_school','female_default','female_school'])for(const mode of ['spectro','havoc','aero','electro'])for(const action of ['enhanced','liberation']){let h;try{
 h=await boot();await settle(h);Object.defineProperty(h.$('#stage'),'clientWidth',{value:1000});Object.defineProperty(h.$('#stage'),'clientHeight',{value:600});h.$('#battleCanvas').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:600});
 const assets=h.w.BattleLabDiagnostics.assets,key=assets.forms.rover[form].actions[mode+'_'+action],s=assets.slots[key];if(!s?.src||s.pending){results.push({form,mode,action,status:'not_run_pending_asset',slot:key});continue;}
 h.click('#setupBtn');for(const x of h.w.document.querySelectorAll('#teamChoices input'))x.checked=x.value==='rover';h.change('[data-appearance=rover]',form);h.change('[data-mode=rover]',mode);h.change('#difficultySelect','easy');h.change('#encounterSelect','boss');h.click('#startBtn');await settle(h);
 let prepActions=0,ready=false;
 for(let n=0;n<40&&!h.diag().result;n++){
  let snap=h.w.BattleLabDiagnostics.getSnapshot(),b=h.w.BattleEngine.restore(h.w.BATTLE_PARAMETERS,snap),a=b.current,option=b.availableActions().find(x=>x.key===action);A.equal(a.key,'rover');
  if(option?.enabled){ready=true;break;}
  const basic=b.availableActions().find(x=>x.key==='basic');await execute(h,basic?.enabled?'basic':'end','battle');prepActions++;
 }
 A.ok(ready,form+'/'+mode+'/'+action+' failed to earn resources in actual battle');
 let before=h.w.BattleLabDiagnostics.getSnapshot().state,a=before.allies[0],skill=a.skills[action],resourceBefore=JSON.parse(JSON.stringify(a.rsc));
 select(h,action,'skills');await h.frame(250);h.click('#confirmBtn');h.draws.length=0;await h.frame(180);
 let after=h.w.BattleLabDiagnostics.getSnapshot().state,paid=after.log.filter(x=>x.event==='action'&&x.actor===a.id&&x.skill===action);A.equal(paid.length,1);
 A.equal(after.allies[0].ap,a.ap-skill.ap_cost);A.ok(h.draws.some(x=>x.canvas==='battleCanvas'&&x.src===s.src),form+'/'+mode+'/'+action+' did not draw mapped pose');A.equal(h.errors.length,0);
 results.push({form,mode,action,pass:true,slot:key,src:s.src,sha256:s.sha256,prepActions,round:before.round,resourceBefore,resourceAfter:after.allies[0].rsc,apCost:skill.ap_cost});
 }catch(e){results.push({form,mode,action,pass:false,error:e.stack});}finally{h?.close();}}
 const out={evidence:'Independent actual battle/UI action-to-image mapping. Resource costs earned by ordinary paid basic actions against unmodified easy Boss, no artificial precharge. Simulated Canvas/Image/Audio/IDB/clock, not browser pixel or balance acceptance.',hashes,unchanged:files.every(f=>hash(f)===hashes[f]),passed:results.filter(x=>x.pass).length,failed:results.filter(x=>x.pass===false).length,notRun:results.filter(x=>x.status==='not_run_pending_asset').length,results};fs.writeFileSync(path.join(OUT,'advanced_assets_e_independent_results.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));process.exitCode=out.failed||!out.unchanged?1:0;
})();
