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
let actionPosts=0;const fetch=async(p,opt={})=>{if(p.endsWith('/actions'))actionPosts++;const result=await new Promise(resolve=>{pending.push(resolve);bridge.stdin.write(JSON.stringify({path:p,body:opt.body?JSON.parse(opt.body):undefined})+'\n')});return {ok:result.ok,status:result.ok?200:400,json:async()=>result.data}};
const memory=new Map();const sandbox={document,window,console,fetch,setTimeout,clearTimeout,Blob,URL,sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/visual-ui.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/rule-text.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8').replace(/boot\(\);\s*$/,''),sandbox);
const $=s=>document.querySelector(s);async function run(code){return vm.runInContext(code,sandbox)}
(async()=>{try{await run('boot()');assert($('#start'));
assert(!$('#profile-select'),'no mandatory preset selector');
const inspector=document.querySelector('[data-read-branch]');assert(inspector,'branch preview selector');
const panel=inspector.closest('.ability-reading');assert(!panel.querySelector('details').hasAttribute('open'),'linked rules folded initially');
assert(panel.querySelector('.action-description').textContent.includes('使用条件：'));
assert(panel.querySelector('.action-description').textContent.includes('追加费用：'));
const optionCount=inspector.querySelectorAll('option').length;assert(optionCount>0);
if(optionCount>1){inspector.value=inspector.querySelectorAll('option')[1].value;inspector.onchange();assert(panel.querySelector('.action-description').textContent.includes('所选分支'));}
assert(!panel.querySelector('.action-description').textContent.includes('关联规则「'));

assert.equal(document.querySelectorAll('[name=role]:not([disabled])').length,5);
const roleInput=id=>document.querySelector(`[name=role][value=${id}]`);
roleInput('aemeath').checked=false;await roleInput('aemeath').onchange();assert(roleInput('aemeath').checked,'cannot select zero');
for(const id of ['denia','mornye']){roleInput(id).checked=true;await roleInput(id).onchange();}
roleInput('lynae').checked=true;await roleInput('lynae').onchange();assert(!roleInput('lynae').checked,'cannot select four');
assert.equal(await run('profile.roles.length'),3);
await $('#clear-deck').onclick();assert($('#start').disabled);
const previousKey=await run('draftKey()');$('#candidate').value='B';await $('#candidate').onchange({target:$('#candidate')});
assert.equal(await run('candidate.id'),'B');assert.equal(await run('profile.roles.length'),3);
$('#candidate').value='A';await $('#candidate').onchange({target:$('#candidate')});assert.equal(await run('draftKey()'),previousKey);assert.equal(await run('deck.length'),0,'empty draft restored, not replaced');
await $('#default-deck').onclick();
roleInput('aemeath').checked=false;await roleInput('aemeath').onchange();
roleInput('lynae').checked=true;await roleInput('lynae').onchange();
assert.equal((await run('profile.roles.join(",")')),'lynae,mornye,denia');
assert(document.querySelector('#role-introductions').textContent.includes('达妮娅'));
assert(document.querySelectorAll('[data-count]').length>0);await $('#clear-deck').onclick();assert($('#start').disabled);await $('#default-deck').onclick();for(const route of document.querySelectorAll('[data-route]')){route.value=route.querySelectorAll('option')[1].value;route.onchange();}await $('#start').onclick();assert($('#end-turn'));
const contributorsBefore=await run('JSON.stringify(battle.view.contributors)');
assert($('#contributor-panel'),'real battle public-view contribution panel');
for(const el of document.querySelectorAll('.contributor-count'))assert.equal(el.textContent,'0');
const realBattleBefore=await run('JSON.stringify(battle)');
await run(`battle.view.contributors={shock:['aemeath','aemeath','lynae'],fusion_burst:['<img src=x onerror=alert(1)>']};renderBattle()`);
assert.equal(document.querySelector('[data-contributor=shock] .contributor-count').textContent,'2');
assert(document.querySelector('[data-contributor=shock] .contributor-names').textContent.includes('爱弥斯、琳奈'));
assert.equal(document.querySelector('[data-contributor=fusion_burst] .contributor-count').textContent,'1');
assert(document.querySelector('[data-contributor=fusion_burst] .contributor-names').textContent.includes('<img'));
assert(!$('#contributor-panel img'),'unknown IDs escaped');
await run(`battle={...battle,id:'different-battle',view:{...battle.view,contributors:{shock:[],fusion_burst:[]}}};renderBattle()`);
assert(!$('#contributor-panel').textContent.includes('爱弥斯'));
for(const el of document.querySelectorAll('.contributor-count'))assert.equal(el.textContent,'0','no stale contributor across battles');
sandbox.restoreContributionBattle=realBattleBefore;await run('battle=JSON.parse(restoreContributionBattle);renderBattle()');
assert.equal(await run('JSON.stringify(battle.view.contributors)'),contributorsBefore);
let revision=await run('battle.view.revision');const end=$('#end-turn');end.onclick();end.onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));assert.equal(actionPosts,1,'double-click sends once');assert.equal(await run('battle.view.revision'),revision+1);
const playable=document.querySelector('[data-card]:not([disabled])');if(playable){playable.onclick();assert(dialog.open);const branch=document.querySelector('[data-branch]:not([disabled])');assert(branch);branch.onclick();assert(document.querySelector('[data-request]'));document.querySelector('[data-request]').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));assert(!dialog.open)}
const saved=await run('api(`/api/battles/${battle.id}/export?kind=save`)');const savedRevision=await run('battle.view.revision');await $('#end-turn').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));await $('#restore-file').onchange({target:{files:[{text:async()=>JSON.stringify(saved)}],value:'save.json'}});assert.equal(await run('battle.view.revision'),savedRevision,'restore exact committed revision');
await $('#retreat').onclick();document.querySelector('#confirm-retreat').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));assert($('#return'));await $('#return').onclick();assert($('#start'));$('#stage').value='fresh_acquisition';await $('#stage').onchange({target:$('#stage')});assert([...document.querySelectorAll('[name="role"]')].every(x=>!x.disabled));
// Synthetic display fixtures verify costs and complete read-only rules without executing them.
await run(`battle=fixtureForTest={view:{hand:[{instance_id:'cost-card',definition_id:'COST',ability:{id:'COST',cost:{energy:1},condition:{ref:'condition-sentinel'},branches:[{id:'branch',name_zh:'费用测试',cost:{energy:2},effects:Array.from({length:6},(_,i)=>({op:'draw',args:{amount:1,duration:'duration-'+i},when:true}))}]}}]},legal:[{command:'play_card',card_instance_id_or_null:'cost-card',branch_id_or_null:'branch',target_entity_ids:[],choices:{}}],blocked:[],abilities:{DEP:{id:'DEP',cost:{energy:2,private:[{resource_id:'sync',amount:3}]},effects:[{op:'unknown',args:{duration:'deployment-duration'}}]}}};chooseCard('cost-card')`);
assert($('#choice-content').textContent.includes('合计能量 3；基础：能量 1；分支追加：能量 2'));assert($('#choice-content').textContent.includes('duration-5'));assert($('#choice-content details pre').textContent.includes('duration-5'));assert($('#choice-content details pre').textContent.includes('condition-sentinel'));$('#choice-content details').open=true;assert($('#choice-content details').open);
$('[data-branch]').onclick();assert($('#choice-content').textContent.includes('合计能量 3；基础：能量 1；分支追加：能量 2'));
await run(`chooseRequests('部署',[{command:'activate_deployment',choices:{ability_id:'DEP'},target_entity_ids:[]}])`);assert($('#choice-content').textContent.includes('部署激活费用：能量 2'));assert($('#choice-content').textContent.includes('同步 3'));assert($('#choice-content pre').textContent.includes('deployment-duration'));
await run(`battle.abilities.DEP.cost.energy={ref:'body.energy'};chooseRequests('动态部署',[{command:'activate_deployment',choices:{ability_id:'DEP'},target_entity_ids:[]}])`);assert($('#choice-content').textContent.includes('动态值'));assert($('#choice-content').textContent.includes('body.energy'));assert(!$('#choice-content').textContent.includes('NaN'));
await run(`openDialog('安全测试',ruleDetails({condition:'<img src=x onerror=alert(1)>',duration:'<script>bad()</script>'}))`);assert(!$('#choice-content img'));assert(!$('#choice-content script'));assert($('#choice-content pre').textContent.includes('<img'));
console.log('PASS: actual DOM + actual Python Engine API bridge: setup, deck editing, start, double-click deduplication, branch/target selection, end turn, save/restore, retreat, return, fresh profile, additive/dynamic/deployment costs, full-rule disclosure, DOM XSS. No visual/browser acceptance claimed.');}finally{bridge.kill();process.exitCode=0}})().catch(e=>{console.error(e);bridge.kill();process.exitCode=1});
