// Optional DOM integration test: npm install --prefix /tmp/wuwa-ui-test linkedom
// No graphics engine: passing this test does not establish visual QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),path=require('node:path');
let parseHTML;try{({parseHTML}=require('linkedom'))}catch{({parseHTML}=require(process.env.LINKEDOM_PATH||'/tmp/wuwa-ui-test/node_modules/linkedom'))}
const {document,window}=parseHTML(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'));
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??''},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.getAttribute('value')===v)}});
Object.defineProperty(window.HTMLInputElement.prototype,'checked',{get(){return this.hasAttribute('checked')},set(v){this.toggleAttribute('checked',!!v)}});
const dialog=document.querySelector('dialog');dialog.showModal=function(){this.open=true};dialog.close=function(){this.open=false};
const bridge=cp.spawn('python',['-u','-c',`import json,sys,tempfile
from app import Lab
lab=Lab(user=tempfile.mkdtemp())
for line in sys.stdin:
 try:
  msg=json.loads(line);p=msg['path'];b=msg.get('body');parts=p.split('/')
  if p=='/api/session': out={'csrf_token':lab.token}
  elif p=='/api/catalog': out=lab.catalog()
  elif p=='/api/updates':out=lab.updates.status()
  elif p=='/api/profile':out=lab.profile(b)
  elif p=='/api/battles':out=lab.create(b)
  elif p=='/api/restore':out=lab.restore(b)
  elif p.endswith('/actions'):out=lab.apply(parts[3],b)
  elif '/export?' in p:out=lab.export(parts[3],p.split('=')[-1])
  else:out=lab.snapshot(parts[3])
  print(json.dumps({'ok':True,'data':out}),flush=True)
 except Exception as ex: print(json.dumps({'ok':False,'data':{'error':str(ex)}}),flush=True)
`],{cwd:path.resolve(__dirname,'../..'),stdio:['pipe','pipe','inherit']});
let buffer='',pending=[];bridge.stdout.on('data',chunk=>{buffer+=chunk;let ix;while((ix=buffer.indexOf('\n'))>=0){const response=JSON.parse(buffer.slice(0,ix));buffer=buffer.slice(ix+1);pending.shift()(response)}});
let actionPosts=0; const submitted=[];const fetch=async(p,opt={})=>{if(p.endsWith('/actions'))actionPosts++;if(p==='/api/battles')submitted.push(JSON.parse(opt.body));const result=await new Promise(resolve=>{pending.push(resolve);bridge.stdin.write(JSON.stringify({path:p,body:opt.body?JSON.parse(opt.body):undefined})+'\n')});return {ok:result.ok,status:result.ok?200:400,json:async()=>result.data}};
const memory=new Map();const sandbox={document,window,console,fetch,setTimeout,clearTimeout,Blob,URL,sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/asset-catalog.js'),'utf8'),sandbox);for(const file of ['technical-assets.js','technical-preview.js','enemy-visual-assets.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets',file),'utf8'),sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/visual-ui.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/rule-text.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8').replace(/boot\(\);\s*$/,''),sandbox);
const $=s=>document.querySelector(s);async function run(code){return vm.runInContext(code,sandbox)}

(async()=>{try {
  await run('boot()');
  assert.equal(await run('catalog.app_version'),'0.3.1');
  await run("candidate=catalog.candidates.find(c=>c.id==='B'); selectedRoleIds=['aemeath','lynae','denia']; setup(); loadProfile()");
  const expected={aemeath:[['fusion','聚爆'],['shock','震谐']],lynae:[['shock','震谐'],['tune','集谐']],denia:[['fusion','聚爆'],['tune','集谐']]};
  for(const [role,values] of Object.entries(expected)) {
    const el=$(`[data-route=${role}]`);
    assert.deepEqual([...el.querySelectorAll('option')].slice(1).map(o=>[o.value,o.textContent]),values);
  }
  assert.equal(await run("name('TUNE')"),'集谐');
  assert.equal(await run("RuleText.label('tune')"),'集谐·tune');
  assert.equal(await run("RuleText.label('shock')"),'震谐·shock');
  assert.equal(await run("RuleText.label('DENIA_FIELD_TUNE_1')"),'达妮娅·集谐场·1');
  assert.equal(await run("RuleText.label('fusion|tune|null')"),'聚爆、集谐或无路线');
  // Explicit presentation-only tag fixture; live data does not currently declare tune ability_tags.
  assert((await run("RuleText.describeAction({ability_tags:['shock','tune']})")).includes('集谐·tune'));
  assert((await run("RuleText.describeAction({ability_tags:['shock','tune']})")).includes('震谐·shock'));
  for(const chosen of ['shock','tune']) {
    for(const [role,value] of Object.entries({aemeath:'shock',lynae:chosen,denia:'tune'})) {
      const el=$(`[data-route=${role}]`);el.value=value;el.onchange();
    }
    assert(!$('#start').disabled);
    await $('#start').onclick();
    assert($('#end-turn'),'actual battle started');
    assert.equal(submitted.at(-1).routes.lynae,chosen);
    assert.equal(submitted.at(-1).routes.denia,'tune');
    assert.equal(await run('battle.view.roles.lynae.phase.route'),chosen);
    assert.equal(await run('battle.view.roles.denia.phase.route'),'tune');
    const sidebar=$('.side-panel').textContent;
    assert(sidebar.includes(chosen==='shock'?'震谐':'集谐'));
    const saved=await run('api(`/api/battles/${battle.id}/export?kind=save`)');
    sandbox.saved=saved;
    await run('api("/api/restore",{save:saved}).then(result=>{battle=result;renderBattle()})');
    assert.equal(await run('battle.view.roles.lynae.phase.route'),chosen);
    await run('setup();loadProfile()');
    assert.equal($('[data-route=lynae]').value,chosen,'route draft preserved');
  }
  for(const stage of ['mid','late']) {
    sandbox.stage=stage;await run('selectedStage=stage;setup();loadProfile()');
    for(const [role,values] of Object.entries(expected))assert.deepEqual([...$(`[data-route=${role}]`).querySelectorAll('option')].slice(1).map(o=>[o.value,o.textContent]),values);
  }
  await run("selectedStage='fresh_acquisition';setup();loadProfile()");
  assert.equal(document.querySelectorAll('[data-route]').length,0);
  console.log('PASS: real catalogue/profile/DOM route labels, ability tags, distinct submitted values, battle state, save/restore, drafts, stages, Lynae/Denia/Aemeath. No visual browser QA claimed.');
} finally {bridge.kill();}})().catch(e=>{console.error(e);bridge.kill();process.exitCode=1});
