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
  elif p=='/__fixture/npc-death':
   e=lab.battles[b['id']]['engine'];e.state['npcs']['NPC_01'].update(hp=0,alive=False);out=lab.snapshot(b['id'])
  elif p.endswith('/actions'):out=lab.apply(parts[3],b)
  elif '/export?' in p:out=lab.export(parts[3],p.split('=')[-1])
  else:out=lab.snapshot(parts[3])
  print(json.dumps({'ok':True,'data':out}),flush=True)
 except Exception as ex: print(json.dumps({'ok':False,'data':{'error':str(ex)}}),flush=True)
`],{cwd:path.resolve(__dirname,'../..'),stdio:['pipe','pipe','inherit']});
let buffer='',pending=[];bridge.stdout.on('data',chunk=>{buffer+=chunk;let ix;while((ix=buffer.indexOf('\n'))>=0){const response=JSON.parse(buffer.slice(0,ix));buffer=buffer.slice(ix+1);pending.shift()(response)}});
let actionPosts=0;const fetch=async(p,opt={})=>{if(p.endsWith('/actions'))actionPosts++;const result=await new Promise(resolve=>{pending.push(resolve);bridge.stdin.write(JSON.stringify({path:p,body:opt.body?JSON.parse(opt.body):undefined})+'\n')});return {ok:result.ok,status:result.ok?200:400,json:async()=>result.data}};
const memory=new Map();const sandbox={document,window,console,fetch,setTimeout,clearTimeout,Blob,URL,sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/rule-text.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8').replace(/boot\(\);\s*$/,''),sandbox);
const $=s=>document.querySelector(s);async function run(code){return vm.runInContext(code,sandbox)}
(async()=>{try{
await run('boot()');assert.equal($('#battle-mode').value,'rules');
$('#battle-mode').value='live';$('#battle-mode').onchange();assert.equal($('#scenario').querySelectorAll('option').length,6);
$('#scenario').value='LIVE_BOSS_01_ALLY';$('#scenario').onchange();
assert($('#encounter-preview').textContent.includes('未校准'));
assert($('#encounter-preview').textContent.includes('头目'));
assert($('#encounter-preview').textContent.includes('50%'));
for(const route of document.querySelectorAll('[data-route]')){route.value=route.querySelectorAll('option')[1].value;route.onchange();}
await $('#start').onclick();assert($('#allied-bodies'));assert.equal(document.querySelectorAll('[data-actor="NPC_01"]').length,1);
assert.equal(document.querySelectorAll('[data-actor="PLAYER_BODY_01"]').length,0,'player has one shared resource strip, no template body duplication');
assert(document.querySelector('[data-actor="NPC_01"]').textContent.includes('65 / 65'));
assert(document.querySelector('[data-actor="NPC_01"]').textContent.includes('行动点 1 / 1'));
assert(document.querySelector('[data-actor="NPC_01"]').textContent.includes('锁定目标：试验核心'));
assert(document.querySelector('[data-actor="ENEMY_01"]').textContent.includes('锁定目标：自主守护者'));
assert(document.querySelector('[data-actor="ENEMY_01"]').textContent.includes('防御、护盾、格挡前'));
assert.equal(document.querySelector('[data-actor="NPC_01"]').querySelectorAll('button').length,0,'no NPC command controls');
assert.equal(await run('battle.view.engine_version'),'shared-runtime-2.0');
const id=await run('battle.id'),rev=await run('battle.view.revision');const end=$('#end-turn');end.onclick();end.onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));assert.equal(actionPosts,1);assert.equal(await run('battle.view.revision'),rev+1);
const save=await run('api(`/api/battles/${battle.id}/export?kind=save`)');assert.equal(save.format,'wuwa-lab-private-save-v2');
const savedRevision=await run('battle.view.revision');await $('#end-turn').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));
await $('#restore-file').onchange({target:{files:[{text:async()=>JSON.stringify(save)}],value:'live-save'}});assert.equal(await run('battle.view.revision'),savedRevision);
// Pinned names are read from the battle observation, not a changed preparation catalog.
await run(`catalog.live_content.actors.PROTO_SENTINEL.display_name='WRONG_CURRENT_CATALOG';renderBattle()`);assert(!$('#app').textContent.includes('WRONG_CURRENT_CATALOG'));
// Explicit display fixture: real engine snapshot after a test-only NPC death state; not a gameplay outcome claim.
sandbox.fixtureBattleId=id;await run(`(async()=>{battle=await api('/__fixture/npc-death',{id:fixtureBattleId});renderBattle()})()`);
assert(document.querySelector('[data-actor="NPC_01"]').textContent.includes('已倒下'));
assert(document.querySelector('[data-actor="NPC_01"]').textContent.includes('0 / 65'));
assert.notEqual(await run('battle.view.outcome'),'defeat','ordinary NPC death alone is not a UI defeat');
await $('#restore-file').onchange({target:{files:[{text:async()=>JSON.stringify(save)}],value:'live-save'}});
const malformed={...save,format:'wuwa-lab-private-save-v1'};const current=await run('battle.id');
await $('#restore-file').onchange({target:{files:[{text:async()=>JSON.stringify(malformed)}],value:'bad-save'}});
assert($('#notice').textContent.includes('不会自动迁移'));assert.equal(await run('battle.id'),current);
await $('#retreat').onclick();$('#confirm-retreat').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));await $('#return').onclick();
$('#battle-mode').value='rules';$('#battle-mode').onchange();assert(!$('#scenario').querySelector('[value="LIVE_BOSS_01_ALLY"]'));
for(const route of document.querySelectorAll('[data-route]')){route.value=route.querySelectorAll('option')[1].value;route.onchange();}
await $('#start').onclick();assert(!$('#allied-bodies'));assert.equal(await run('battle.view.engine_version'),undefined);
const legacy=await run('api(`/api/battles/${battle.id}/export?kind=save`)');assert.equal(legacy.format,'wuwa-lab-private-save-v1');
await $('#retreat').onclick();$('#confirm-retreat').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));await $('#return').onclick();
$('#battle-mode').value='live';$('#battle-mode').onchange();
const allEncounterIds=[...$('#scenario').querySelectorAll('option')].map(x=>x.value);
for(const encounterId of allEncounterIds){
 $('#scenario').value=encounterId;$('#scenario').onchange();
 for(const route of document.querySelectorAll('[data-route]')){route.value=route.querySelectorAll('option')[1].value;route.onchange();}
 await $('#start').onclick();assert.equal(await run('battle.view.encounter.encounter_id'),encounterId);
 assert.equal(document.querySelectorAll('[data-actor="NPC_01"]').length,encounterId.endsWith('_ALLY')?1:0);
 assert($('#app').textContent.includes(encounterId.includes('PATROL')?'普通敌':encounterId.includes('ELITE')?'精英':'头目'));
 await $('#retreat').onclick();$('#confirm-retreat').onclick();while(await run('busy'))await new Promise(r=>setTimeout(r,10));await $('#return').onclick();
}
console.log('PASS live DOM: mode separation, six encounters, pinned actor/intent/target data, independent ally resources, no NPC commands, idempotent end turn, v2 restore/cross-route rejection, explicit NPC-death display fixture, legacy T/save regression. No browser or balance acceptance.');
}finally{bridge.kill();process.exitCode=0}})().catch(e=>{console.error(e);bridge.kill();process.exitCode=1});
