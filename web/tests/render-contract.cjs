// No browser required. Exercises actual rendering functions against real Engine observations.
// This is NOT a substitute for layout/accessibility/browser acceptance.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const fixture=JSON.parse(cp.execFileSync('python',['-c',`import json
from app import Lab
import tempfile
lab=Lab(user=tempfile.mkdtemp()); catalog=lab.catalog(); c=catalog['candidates'][0]
p=lab.profile({'candidate':'A','stage':'fresh_acquisition','roles':['aemeath']})
b=lab.create({'candidate':'A','stage':'fresh_acquisition','roles':['aemeath']})
print(json.dumps({'catalog':catalog,'profile':p,'battle':b,'updates':lab.updates.status()}))`],{cwd:require('node:path').resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:20*1024*1024}));
const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,hidden:false,open:false,dataset:{},className:'',setAttribute(){},removeAttribute(){},append(){},click(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
const doc={querySelector:get,querySelectorAll:()=>[],body:{setAttribute(){},removeAttribute(){}},createElement:()=>({click(){}})};
const sandbox={document:doc,console,setTimeout:()=>1,clearTimeout(){},URL,Blob,sessionStorage:{setItem(){},removeItem(){},getItem(){return null}},fetch:async()=>{throw Error('unexpected fetch')}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/rule-text.js'),'utf8'),sandbox);let code=fs.readFileSync(require('node:path').join(__dirname,'../assets/app.js'),'utf8').replace(/boot\(\);\s*$/,'');vm.runInContext(code,sandbox);
sandbox.fixture=fixture;vm.runInContext(`catalog=fixture.catalog;candidate=catalog.candidates[0];profile=fixture.profile.profile;updates=fixture.updates;selectedProfile='fresh';deck=[...profile.deck];setup();renderProfile();`,sandbox);
assert(get('#app').innerHTML.includes('实验版，未入合格池'));assert(get('#collection').innerHTML.includes('data-count'));assert(get('#updates').innerHTML.includes('暂无可安装版本'));assert(/id="install-version"[^>]*disabled/.test(get('#updates').innerHTML));assert(!get('#start').disabled);
vm.runInContext(`deck=[];updatePreview()`,sandbox);assert(get('#start').disabled);
vm.runInContext(`battle=fixture.battle;renderBattle()`,sandbox);assert(get('#app').innerHTML.includes('敌方战线'));assert(get('#app').innerHTML.includes('牌库组成（无顺序）'));assert(!get('#app').innerHTML.includes('style='));assert(get('#app').innerHTML.includes('<meter'));
const playable=fixture.battle.legal.find(r=>r.command==='play_card');assert(playable);sandbox.cardId=playable.card_instance_id_or_null;vm.runInContext(`chooseCard(cardId)`,sandbox);assert(get('#choice-content').innerHTML.includes('第一步'));vm.runInContext(`chooseRequests('选择目标',battle.legal.filter(r=>r.card_instance_id_or_null===cardId))`,sandbox);assert(get('#choice-content').innerHTML.includes('第二步'));assert(get('#choice-content').innerHTML.includes('data-request'));
// Cost presentation must preserve additive components and never evaluate dynamic DSL.
assert.equal(vm.runInContext(`combinedCost({cost:{energy:1}},{cost:{energy:2}})`,sandbox),'基础：能量 1；分支追加：能量 2');
const dynamic=vm.runInContext(`costText({energy:{ref:'body.energy'},private:[{resource_id:'sync',amount:{calc:'test'}}]})`,sandbox);assert(dynamic.includes('动态值'));assert(dynamic.includes('body.energy'));assert(!dynamic.includes('NaN'));
vm.runInContext(`battle.abilities.TEST_DEP={id:'TEST_DEP',cost:{energy:2,private:[{resource_id:'sync',amount:3}],card_choices:[{choice_id:'discard',count:1}]},effects:[{op:'unknown',args:{duration:'to_next_player_end'}}]};chooseRequests('部署技能',[{command:'activate_deployment',choices:{ability_id:'TEST_DEP'},target_entity_ids:[]}])`,sandbox);assert(get('#choice-content').innerHTML.includes('部署激活费用：能量 2'));assert(get('#choice-content').innerHTML.includes('同步 3'));assert(get('#choice-content').innerHTML.includes('另需选牌'));assert(get('#choice-content').innerHTML.includes('to_next_player_end'));
const longText=vm.runInContext(`effectText({effects:Array.from({length:6},(_,i)=>({op:'draw',args:{amount:1},when:i===5?{ref:'condition'}:true}))})`,sandbox);assert(longText.includes('condition'));
assert(vm.runInContext(`ruleDetails({condition:{ref:'condition'},effects:[{op:'unknown',args:{duration:'duration-sentinel',consume:'consume-sentinel'}}]})`,sandbox).includes('consume-sentinel'));
// Malicious data must remain text. Exercise actual ability/branch/error display paths.
sandbox.evil='<img src=x onerror=alert(1)>';vm.runInContext(`battle.view.hand[0].ability.name_zh=evil;battle.view.hand[0].ability.description_zh=evil;battle.abilities[battle.view.hand[0].definition_id]=battle.view.hand[0].ability;renderBattle();`,sandbox);assert(!get('#app').innerHTML.includes('<img'));assert(get('#app').innerHTML.includes('&lt;img'));vm.runInContext(`openDialog(evil,esc(evil));say(evil,true)`,sandbox);assert(!get('#choice-content').innerHTML.includes('<img'));assert.equal(get('#notice').textContent,sandbox.evil);
vm.runInContext(`battle.view.hand[0].ability.branches=[{id:'evil',name_zh:evil,cost:{energy:1}}];chooseCard(battle.view.hand[0].instance_id)`,sandbox);assert(!get('#choice-content').innerHTML.includes('<img'));assert(get('#choice-content').innerHTML.includes('&lt;img'));
vm.runInContext(`battle.view.hand=[];battle.legal=[];battle.view.outcome='victory';renderBattle()`,sandbox);assert(get('#app').innerHTML.includes('返回准备页'));assert(get('#app').innerHTML.includes('手牌为空'));
vm.runInContext(`battle.view.outcome=null;battle.view.active_role=null;battle.view.roles={};renderBattle()`,sandbox);assert(get('#app').innerHTML.includes('无模态'));
console.log('PASS: actual Engine fixture + UI render contract; preparation, zero-card prevention, hand, legal branch/choice, terminal/empty/no-mode, CSP, text escaping. Browser layout remains unverified.');
