'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const R=require('../assets/rule-text.js');
const target={kind:'self_body',selector_id:'self'};
const fx=(op,args={},extra={})=>({op,args,target,when:true,...extra});
const card=(effects,extra={})=>({card_type:'action',cost:{energy:1,private:[],tokens:[],card_choices:[]},condition:true,targets:target,effects,branches:[],...extra});
assert.match(R.describe(card([fx('block',{coefficient_bp:8000,basis:'scaled_attack'})])),/攻击力 × 0\.8/);
assert.doesNotMatch(R.describe(card([fx('block',{coefficient_bp:8000,basis:'scaled_attack'})])),/格挡 无/);
assert.match(R.describe(card([],{default_disposal:'exhaust'})),/牌的去向：结算后移入弃牌堆/);
const multi=R.describe(card(Array.from({length:12},(_,i)=>fx('resource_gain',{resource_id:'energy',amount:i+1}))));
for(let i=1;i<=12;i++)assert.ok(multi.includes(`能量 +${i}`));
assert.doesNotMatch(multi,/另有|详见规则/);
const branches=R.describe(card([fx('draw',{count:1})],{usage_limit:{per_battle:3},branches:[{id:'branch',card_type:'action',cost:{energy:2,private:[{resource_id:'sync',amount:1}]},condition:{cmp:'ge',left:{ref:'owner.private.sync'},right:1},effects:[fx('damage',{coefficient_bp:{calc:'mul',args:[5000,{ref:'context.payment.private.sync'}]},element:'fusion'})],keywords:['exhaust'],usage_limit:{per_battle:1}}]}));
assert.match(branches,/基础费用：能量 1/);assert.match(branches,/追加费用：能量 2；同步 1/);assert.match(branches,/不小于 1/);assert.match(branches,/先执行基础效果/);assert.match(branches,/结算后移入耗尽区/);assert.match(branches,/实际结果由引擎结算/);assert.match(branches,/属性：热熔/);
assert.equal(R.value({ref:'owner.private.color_energy'}),'所属角色·私池·色能');
assert.equal(R.label('true_color'),'本色');
for(const calc of ['add','sub','mul','floor_div','min','max','clamp'])assert.doesNotMatch(R.value({calc,args:[2,1,4]}),/说明待补全/);
for(const cmp of ['eq','ne','lt','le','gt','ge','in'])assert.doesNotMatch(R.condition({cmp,left:1,right:2}),/说明待补全/);
for(const query of ['resource_cap','contributor_count','zone_count','deployment_exists','count_selected','status_stacks'])assert.doesNotMatch(R.value({query}),/说明待补全/);
for(const x of [{calc:'unknown',args:[1,2]},{query:'unknown',amount:3},{cmp:'unknown',left:1,right:2}])assert.match(R.value(x),/说明待补全/);
assert.match(R.effect(fx('unknown_op',{nested:{amount:99}})),/说明待补全.*unknown_op.*99/);
assert.match(R.effect(fx('__proto__',{amount:3})),/说明待补全/);
assert.match(R.effect(fx('draw',{count:1,future_arg:99})),/说明待补全·参数 future_arg：99/);
assert.match(R.describe(card([],{future_rule:{amount:77}})),/说明待补全·参数 future_rule：数量：77/);
assert.match(R.target({kind:'future_target',count:2}),/说明待补全.*future_target/);
const hostile='<img src=x onerror=alert(1)>';
assert.equal(R.value(hostile),hostile); // Intentionally plain text. HTML escaping belongs to caller.
R.configure({statuses:{mark:{name_zh:'观察',duration:{rounds:2,boundary:'player_end'},uses:1,hooks:[{event:'DAMAGE_APPLIED',condition:true,limit:{per_root_action:1},effects:[fx('apply_status',{status_id:'mark',stacks:1})]}]}}});
const linked=R.describe(card([fx('apply_status',{status_id:'mark',stacks:1})]));
assert.equal((linked.match(/关联规则「观察」/g)||[]).length,1);assert.match(linked,/回合数：2/);assert.match(linked,/次数：1/);assert.match(linked,/实际伤害结算后/);assert.match(linked,/每次行动最多：1/);
R.configure({deployments:{d:{remaining_uses:2,duration:{rounds:3,boundary:'player_start'},on_leave_destination:'exhaust',activation_ability_ids:['activate']}},abilities:{activate:card([fx('draw',{count:2})],{ability_kind:'activation',cost:{energy:2}})}});
const dep=R.describe(card([fx('deploy',{definition_id:'d'})],{card_type:'deploy'}));assert.match(dep,/剩余次数：2/);assert.match(dep,/离场去向：耗尽区/);assert.match(dep,/部署激活「activate」/);assert.match(dep,/基础费用：能量 2/);
R.configure();assert.match(R.describe(card([fx('apply_status',{status_id:'missing'})])),/未提供statuses定义/);
// Cover every operation and every normalized current ability, including live COMMON_A/D mappings.
const payload=JSON.parse(execFileSync('python',['-c',`
import json
from runtime.data import Data
out=[]
for candidate in 'ABC':
 d=Data(candidate,'packs/builtin')
 out.append({'candidate':candidate,'operations':list(d.dsl['operation_catalogue']), 'definitions':{k:getattr(d,k) for k in ['abilities','roles','statuses','tokens','modifiers','deployments','inherents']},'abilities':list(d.abilities.values())+[a for mapping in d.mappings.values() for a in mapping.values()]})
print(json.dumps(out,ensure_ascii=False))
`],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:20*1024*1024}));
let count=0;
for(const p of payload){
 assert.deepEqual([...R.operations].sort(),p.operations.sort());R.configure(p.definitions);
 for(const a of p.abilities){const s=R.describe(a);assert.ok(s.length>0);assert.doesNotMatch(s,/undefined|\[object Object\]/);assert.doesNotMatch(s,/说明待补全（效果操作/);count++;}
}
R.configure();
console.log(`rule-text: all tests passed; ${count} normalized abilities/mappings and ${R.operations.length} operations covered`);

const semantic=require('../assets/rule-text.js');
const cap=semantic.effect({op:'extend_anomaly_cap',target:{kind:'chosen_enemy'},args:{status_id:'fusion_burst',amount:2},when:true});
assert(cap.includes('设为 5')&&cap.includes('不累加')&&cap.includes('恢复为 3'));
assert(!cap.includes('增加 2'));
for(const id of ['reserve_owned_finisher','hold_impact','flight','paid_gather']) assert.notEqual(semantic.label(id),id);
assert(!semantic.value({ref:'root.ability.cost.energy'}).includes('ability'));

// Player face shows exactly one complete action, never every linked definition.
let maxAction=0, actions=0;
for(const p of payload){R.configure(p.definitions);for(const a of p.abilities){
 assert.doesNotMatch(R.describe(a),/说明待补全/,p.candidate+':'+a.id);
 for(const branch of a.branches?.length?a.branches:[{id:null}]){
  const text=R.describeAction(a,branch.id);maxAction=Math.max(maxAction,text.length);actions++;
  assert(text.length<=2200,p.candidate+':'+a.id+' action unexpectedly expanded');
  assert(text.includes('基础费用：')&&text.includes('使用条件：')&&text.includes('牌的去向：'));
  if(a.targets||branch.targets)assert(text.includes('目标：'));
  if(branch.id!==null)assert(text.includes('追加费用：'));
  if(branch.effects?.length)assert(text.includes(branch.effects.length+'. '),'all branch effects reachable');
  assert(!text.includes('关联规则「'),'linked rules belong in folded detail');
  const full=R.describeSelected(a,branch.id);assert(full.includes('使用条件：'));
 }
}}
assert(R.describeAction(card([fx('retain')])).includes('最多同时保留 2 张'));
console.log(`player descriptions: ${actions} action variants; maximum ${maxAction} characters; no unresolved known-schema parameter labels`);
// Inherent conditions use their actual candidate-specific names (not internal IDs).
for(const p of payload){
 R.configure(p.definitions);
 const id={A:'AEMEATH_I2',B:'B_A_I2',C:'AEM_I2'}[p.candidate];
 const abilityId={A:'AEMEATH_R',B:'B_A_OVERLOAD__R2',C:'C_AEMEATH_R'}[p.candidate];
 const branchId={A:'r2_shock',B:null,C:'R2_commit'}[p.candidate];
 assert.equal(R.label(id),'星与星之间');
 const a=p.abilities.find(a=>a.id===abilityId);
 const text=R.describeAction(a,branchId);
 assert(text.includes('星与星之间'),p.candidate+' actual R2 condition');
 assert(!text.includes(id),p.candidate+' should not expose named inherent ID');
 for(const family of ['abilities','roles','statuses','tokens','deployments','modifiers','inherents'])
  for(const [key,definition] of Object.entries(p.definitions[family]||{}))
   if(definition.name_zh||definition.name)assert.equal(R.label(key),definition.name_zh||definition.name);
}
const apiCatalog=JSON.parse(execFileSync('python',['-c',`import json,tempfile
from app import Lab
with tempfile.TemporaryDirectory() as temp:
 print(json.dumps(Lab(temp).catalog(),ensure_ascii=False))`],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:20*1024*1024}));
for(const c of apiCatalog.candidates){
 assert(c.rule_definitions.inherents,'actual API must include inherent definitions');
 R.configure(c.rule_definitions);
 assert.equal(R.label({A:'AEMEATH_I2',B:'B_A_I2',C:'AEM_I2'}[c.id]),'星与星之间');
}
