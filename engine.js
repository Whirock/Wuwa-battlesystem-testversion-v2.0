/* v0.4 deterministic SP / cooldown / BP battle runtime. No DOM, clock or network.
 * One normal command per registered slot. Rejected commands never mutate state.
 * SkillEffects owns authored role effects; this module owns timing and arithmetic.
 */
(function (root, factory) {
  const effects = typeof module === 'object' && module.exports ? (() => { try { return require('./skill-effects.js'); } catch (e) { if (e.code === 'MODULE_NOT_FOUND' && e.message.includes("'./skill-effects.js'")) return {}; throw e; } })() : root.SkillEffects;
  const BattleEngine = factory(effects || {});
  if (typeof module === 'object' && module.exports) module.exports = BattleEngine;
  if (root) root.BattleEngine = BattleEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Effects) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const fingerprint = value => {const text=JSON.stringify(value);let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return 'fnv1a-'+(h>>>0).toString(16).padStart(8,'0');};
  const own = (x,k) => !!x && Object.prototype.hasOwnProperty.call(x,k);
  const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
  const finite = (x,a=0,b=1e12) => typeof x==='number' && Number.isFinite(x) && x>=a && x<=b;
  const int = (x,a=0,b=1e12) => Number.isInteger(x)&&x>=a&&x<=b;
  const quant = x => Math.round(x*10000)/10000;
  const elements = {冷凝:'glacio',热熔:'fusion',導電:'electro',导电:'electro',气动:'aero',氣動:'aero',衍射:'spectro',湮灭:'havoc',湮滅:'havoc'};
  const elementKey = x => elements[x] || x || 'spectro';
  const generic = {
    guard:{name:'防御',target:'self',generic:true},wait:{name:'等待',target:'self',generic:true},
    item_sp:{name:'SP恢复剂',target:'ally',generic:true},item_repair:{name:'修复药剂',target:'ally',generic:true},item_cleanse:{name:'净化药剂',target:'ally',generic:true},escape:{name:'逃跑',target:'self',generic:true},
    negotiate:{name:'交涉',target:'enemy',generic:true}
  };
  class BattleEngine {
    constructor(params, options={}) {
      if (!params || !params.characters || !params.enemies || !params.encounters) throw new Error('缺少战斗参数');
      this.params=clone(params);
      const team=options.team || ['amy','lynae','mornye'];
      if (!Array.isArray(team)||team.length<1||team.length>4||new Set(team).size!==team.length||team.some(k=>!own(params.characters,k))||team.filter(k=>k==='rover'||k.startsWith('rover_')).length>1) throw new Error('队伍需要1–4名不重复角色，且只能有一个漂泊者');
      const encounter=options.encounter||'normal';
      const entry=Array.isArray(encounter)?encounter:params.encounters[encounter];
      const enemyKeys=Array.isArray(entry)?entry:entry?.enemies;
      if(!Array.isArray(enemyKeys)||enemyKeys.length<1||enemyKeys.length>4||enemyKeys.some(k=>!own(params.enemies,k)||params.enemies[k].mechanism===true||params.enemies[k].rank==='mechanism')) throw new Error('遭遇需要1–4名有效敌人');
      if(options.difficulty!==undefined&&params.difficulties&&!own(params.difficulties,options.difficulty))throw new Error('未知难度');if(options.stochastic!==undefined&&typeof options.stochastic!=='boolean')throw new Error('随机选项必须为布尔值');if(options.seed!==undefined&&!int(options.seed,0,0xffffffff))throw new Error('随机种子无效');
      const level=options.level??20;
      if(!int(level,1,90))throw new Error('等级必须为1–90');
      const hpFraction=options.hp_fraction??options.hpFraction??1;
      const hpScale=options.enemy_hp_scale??1,atkScale=options.enemy_atk_scale??1;
      if(!finite(hpFraction,0,1)||!finite(hpScale,.001,1000)||!finite(atkScale,0,1000))throw new Error('初始缩放参数无效');
      this.options=clone({...options,team,encounter,level,hp_fraction:hpFraction});
      this.round=0;this.started=false;this.queue=[];this._currentId=null;this.result=null;this.log=[];
      this.count={};this.actions={};this.enemy_actions={};this.action_id=0;this.attack_id=0;this.hit_id=0;this.projectile_id=0;
      this.rngState=(Number(options.seed??0)>>>0)||0x6d2b79f5;this.stochastic=!!options.stochastic;
      this.activeContext=null;this.active_action=false;this.fields=[];
      this.inventory={sp:3,repair:2,cleanse:1,...clone(params.test_inventory||{})};
      this.allies=team.map((k,i)=>this._unit(k,'ally',i,level));
      this.enemies=enemyKeys.map((k,i)=>this._unit(k,'enemy',i,params.enemies[k].level||20));
      for(const a of this.allies){
        a.hp=Math.floor(a.maxhp*hpFraction);
        for(const [name,field,max] of [['initialHP','hp','maxhp'],['initialSP','sp','maxsp'],['initialEnergy','energy','energyCap'],['initialBP','bp',null]])if(options[name]?.[a.key]!==undefined){const v=options[name][a.key];if(!finite(v,0,max?a[max]:5)||(field==='bp'&&!int(v,0,5)))throw new Error('初始资源无效');a[field]=v;}
        a.mode=(options.modes||options.mode||{})[a.key]||a.mode_default||a.mode||null;
        if(a.mode_options&&!a.mode_options.includes(a.mode))throw new Error('角色模态无效');
        a.dead=a.hp===0;if(a.dead){a.bp=0;a.energy=0;}
        this._hook('init',a);
      }
      const difficulty=this.params.difficulties?.[options.difficulty||'standard']||{};
      for(const e of this.enemies){e.maxhp=e.hp=Math.max(1,Math.round(e.maxhp*hpScale*(difficulty.hp_multiplier??1)));e.atk=Math.round(e.atk*atkScale*(difficulty.attack_multiplier??1));}
    }
    _unit(key,side,slot,level) {
      const def=clone(this.params[side==='ally'?'characters':'enemies'][key]);
      const growth=def.growth_by_level?.[level]||def.growth_by_level?.[String(level)]||def;
      const hp=growth.hp??growth.HP??def.hp??1000,sp=growth.sp??growth.SP??def.sp??80;
      const u={...def,key,side,slot,id:`${side}:${slot}:${key}`,level,maxhp:hp,hp,maxsp:side==='ally'?sp:0,sp:side==='ally'?sp:0,
        atk:growth.atk??growth.ATK??def.atk??200,def:growth.def??growth.DEF??def.def??100,spd:growth.spd??growth.speed??growth.SPD??def.spd??def.speed??100,
        cr:growth.cr??growth.CR??def.cr??(side==='ally'?.05:0),cdmg:growth.cdmg??growth.CDMG??def.cdmg??1.5,er:growth.er??growth.ER??def.er??1,
        bp:side==='ally'?1:0,energy:0,energyCap:side==='ally'?(def.energy_cap??def.energyCap??125):0,cooldowns:{},status:{},
        form:def.form_start||def.initial_form||(key==='amy'?'human':key==='denia'?'red':'normal'),r2Pending:false,energyLocked:false,
        spentBPRound:0,actedRound:0,slotStartedRound:0,waitRound:0,defendPriority:false,dead:false,retreated:false,
        phase:1,phasePending:false,mainActions:0,breakPending:false,breakCount:0,firstBreakRecovered:false,specialDone:false,
        bossState:'normal',charge:null,recovering:false,q:0,maxq:0};
      delete u.growth_by_level;
      u.element=elementKey(def.element);
      u.resist=clone(def.resist||def.resistances||Object.fromEntries(['glacio','fusion','electro','aero','spectro','havoc'].map(k=>[k,.1])));
      u.skills=clone(def.skills||{});
      if(side==='enemy')u.q=u.maxq=def.q_capacity??(key==='crownless'?112:key==='dreamless'?156:def.rank==='elite'?72:0);
      return u;
    }
    _hook(name,...args){return typeof Effects[name]==='function'?Effects[name](this,...args):undefined;}
    get current(){return this.getUnit(this._currentId);}
    get currentId(){return this._currentId;}
    getUnit(id){if(id&&typeof id==='object')return id.id?this.allies.concat(this.enemies).find(x=>x.id===id.id)||null:null;return this.allies.concat(this.enemies).find(x=>x.id===id)||null;}
    living(side){return (side==='ally'?this.allies:this.enemies).filter(x=>x.hp>0&&!x.retreated);}
    has(u,key){u=this.getUnit(u);return !!u&&own(u.status,key);}
    isweak(){return false;}
    _record(event,data={},message=''){const row={id:this.log.length+1,round:this.round,event,...data,message};this.log.push(row);this.count[event]=(this.count[event]||0)+1;return row;}
    _random(){let x=this.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;this.rngState=x>>>0;return this.rngState/4294967296;}
    _reject(reason){return {ok:false,reason,events:[],result:this.result};}
    _reply(start){return {ok:true,reason:'',events:this.log.slice(start),result:this.result};}
    finalStat(unit,stat){const u=this.getUnit(unit);if(!u)return 0;const alias={speed:'spd',HP:'maxhp',SP:'maxsp',ATK:'atk',DEF:'def',SPD:'spd',CR:'cr',CDMG:'cdmg',ER:'er'};stat=alias[stat]||stat;const m=this._hook('statModifiers',u,stat)||0;return Math.max(0,(u[stat]||0)*(1+(typeof m==='number'?m:m.pct||0))+(typeof m==='object'?m.flat||0:0));}
    addStatus(target,key,data={},duration){const t=this.getUnit(target);if(!t||t.hp<=0||t.retreated)return false;const value=clone(data);if(duration!==undefined)value.expires=this.round+duration-1;const changed=JSON.stringify(t.status[key])!==JSON.stringify(value);t.status[key]=value;if(changed){this._record('status',{target:t.id,status:key,value:clone(value)},`${t.name}获得${value.name||key}`);if(this.activeContext)this.activeContext.effective=true;}return changed;}
    removeStatus(target,key){const t=this.getUnit(target);if(!t||!own(t.status,key))return false;delete t.status[key];this._record('status_removed',{target:t.id,status:key});return true;}
    _status(...args){return this.addStatus(...args);}
    heal(source,target,amount){const s=this.getUnit(source),t=this.getUnit(target);if(!s||!t||s.hp<=0||s.retreated||t.hp<=0||t.retreated||t.mechanicUnit)return 0;const n=Math.min(t.maxhp-t.hp,Math.max(0,Math.floor(amount)));if(n){t.hp+=n;this._record('heal',{source:s.id,target:t.id,amount:n,hp_after:t.hp});if(this.activeContext)this.activeContext.effective=true;}return n;}
    shield(source,target,amount,duration=2,key='barrier'){const s=this.getUnit(source),t=this.getUnit(target);if(!s||!t||s.hp<=0||s.retreated||t.hp<=0||t.retreated)return 0;const old=t.status[key]?.amount||0;const n=Math.max(0,Math.floor(amount));this.addStatus(t,key,{owner:s.id,amount:Math.max(old,n),shield:true},duration);return Math.max(0,n-old);}
    restoreSP(source,target,amount){const s=this.getUnit(source),t=this.getUnit(target);if(!s||!t||s.hp<=0||s.retreated||s.id===t.id||t.hp<=0||t.retreated)return 0;const n=Math.min(t.maxsp-t.sp,Math.max(0,Math.floor(amount)));if(n){t.sp+=n;this._record('sp',{source:s.id,target:t.id,amount:n,sp_after:t.sp});if(this.activeContext)this.activeContext.effective=true;}return n;}
    _gainEnergy(target,amount,source,shared=false){const t=this.getUnit(target);if(!t||t.hp<=0||t.retreated||t.energyLocked||amount<=0)return 0;const n=quant(Math.min(t.energyCap-t.energy,amount));t.energy=quant(t.energy+n);if(n)this._record('energy',{source:source?.id||source||t.id,target:t.id,amount:n,shared,energy_after:t.energy});return n;}
    distributeEnergy(producer,base){const a=this.getUnit(producer);if(!a||base<=0)return;for(const t of this.living('ally'))this._gainEnergy(t,base*(t.id===a.id?1:.5)*this.finalStat(t,'er'),a,t.id!==a.id);}
    _resolveKey(a,key){if(key==='retreat')key='escape';if(key==='R'&&a?.skills.R1)return a.r2Pending?'R2':'R1';if(own(a?.skills,key)||own(generic,key))return key;if(a?.key?.startsWith('rover_')){const alias=`${a.key}_${String(key).toLowerCase()}`;if(own(a.skills,alias))return alias;}return key;}
    getSkill(actor,key){const a=this.getUnit(actor);if(!a)return null;key=this._resolveKey(a,key);return clone(a.skills[key]||(generic[key]?{...generic[key],...(this.params.generic_skills?.[key]||{}),generic:true}:null));}
    _options(options={}){const o=clone(options||{});if(o.allyTargetId)o.allyTarget=o.allyTargetId;if(o.targetIds){o.extraTargets=o.extraTargets||o.targetIds;o.allyTargets=o.allyTargets||o.targetIds;}if(o.abnormal&&typeof o.abnormal==='object'&&!Array.isArray(o.abnormal))o.abnormalSelections=Object.entries(o.abnormal).map(([targetId,statusId])=>({targetId,statusId}));return o;}
    _numeric(a,skill,key,bp,options){const p=this._hook('preview',a,skill,key,bp,options)||{};const audit=clone(p.audit||skill.numeric_audit||{});return {audit,category:p.category||skill.damage_category||(/_a$|^A$/.test(key)?'普攻':/R|_r$/.test(key)?'共鸣解放':'技能'),target:p.target||skill.target||'enemy',name:p.name||skill.name};}
    _targetMode(a,skill,key,numeric){if(key==='guard'||key==='wait'||key==='escape')return 'self';if(key.startsWith('item_'))return 'ally';const text=numeric?.target||skill.target||'';if(/全敌|全敵|敌全体|敵全体|all_enemies/.test(text))return 'all_enemies';if(/敌|敵|enemy/.test(text))return 'enemy';if(/另一|其他|禁止施法者/.test(text))return 'other_ally';if(/全部|全体|全队|all_allies/.test(text))return 'all_allies';if(/队员|队友|友方|ally/.test(text))return 'ally';if(/自身|本人|self/.test(text))return 'self';return 'enemy';}
    _cooldownKey(key,skill){return skill.cooldown_group||(/rover_electro_e2[ab]$/.test(key)?'rover_electro_e2':key==='R1'||key==='R2'?'R':key);}
    _context(a,key,targetId,options={}){key=this._resolveKey(a,key);const skill=this.getSkill(a,key);if(!skill)return null;const o=this._options(options),bp=o.bp??0;const numeric=this._numeric(a,skill,key,bp,o),n=numeric.audit;
      const mode=this._targetMode(a,skill,key,numeric),target=this.getUnit(targetId||o.targetId);
      let targets=mode==='all_enemies'?this.living(a.side==='ally'?'enemy':'ally'):mode==='all_allies'?this.living(a.side):mode==='self'?[a]:target?[target]:[];
      const count=n.original_attacks_by_bp?.[bp]||0,total=n.damage_atk_by_bp?.[bp]||0,defTotal=n.damage_def_by_bp?.[bp]||0,q=n.q_by_bp?.[bp]||0;
      const basic=n.role_class==='basic';const base=n.damage_atk_by_bp?.[0]||0,defBase=n.damage_def_by_bp?.[0]||0;
      const attacks=Array.from({length:count},(_,i)=>({coef:basic?base*(i?0.4:1):total/count,defCoef:basic?defBase*(i?0.4:1):defTotal/count,element:a.element,q:basic?[6,2.1,1.5,1.2][i]:q/count,index:i}));
      return {actor:a,skill,key,bp,options:o,target,targets,targetMode:mode,audit:n,category:numeric.category,name:numeric.name,attacks,rootActionId:this.action_id+1,startForm:a.form,effective:false,hits:[],breaks:[],markerSnapshot:{},baseEnergy:n.base_energy??skill.base_energy_gain??0,spCost:n.sp??skill.sp_cost??0,energyCost:n.energy_cost??skill.resonance_energy_cost??0,cooldown:n.cd??skill.cooldown_rounds??0,coef:total,coefDef:defTotal,q};
    }
    _legality(ctx,selection=true){if(!ctx)return '未知技能';const a=ctx.actor;if(!this.started)return '战斗尚未开始';if(this.result)return '战斗已结束';if(a.side!=='ally'||a.hp<=0||a.retreated)return '角色无法行动';if(this.currentId!==a.id||a.actedRound===this.round)return '当前没有正常行动';if(!int(ctx.bp,0,3))return 'BP必须为0–3整数';if(ctx.bp>a.bp)return 'BP不足';if(ctx.skill.generic&&ctx.bp!==0)return '此指令不接受BP强化';if(ctx.audit.legal_by_bp&&!ctx.audit.legal_by_bp[ctx.bp])return ctx.key==='R2'?'R2固定需要3BP':'该BP档不可用';
      if(ctx.key==='R2'){if(!a.r2Pending)return '尚未获得R2资格';if(ctx.bp!==3)return 'R2固定需要3BP';}
      else {if((a.cooldowns[this._cooldownKey(ctx.key,ctx.skill)]||0)>this.round)return '技能冷却中';if((ctx.key==='R1'||ctx.energyCost>0)&&a.r2Pending)return '必须先完成R2';if(ctx.energyCost>0&&a.energy+1e-8<a.energyCap)return '共鸣能量未满';}
      if(a.sp<ctx.spCost)return 'SP不足';
      if(ctx.key==='wait'&&(a.waitRound===this.round||!this.queue.some(id=>{const t=this.getUnit(id);return t&&t.hp>0&&!t.retreated&&t.actedRound!==this.round;})))return '本轮不能再次等待或已无可延后槽';
      if(ctx.key.startsWith('item_')&&(this.inventory[ctx.key.slice(5)]||0)<=0)return '道具不足';
      if(selection){const ts=ctx.targets;if(ctx.targetMode==='all_enemies'&&ctx.target&&(ctx.target.side===a.side||ctx.target.hp<=0||ctx.target.retreated))return '主目标已失效';if(!ts.length)return '请选择合法目标';if(ts.some(t=>!t||t.hp<=0||t.retreated))return '目标已失效';if(ctx.targetMode==='enemy'&&ctx.target?.side===a.side)return '需要敌方目标';if(['ally','other_ally'].includes(ctx.targetMode)&&ctx.target?.side!==a.side)return '需要友方目标';if(ctx.targetMode==='other_ally'&&ctx.target?.id===a.id)return '不能指定本人';if(ctx.key==='negotiate'&&!ctx.target?.negotiation)return '此敌人不可交涉';const reason=this._hook('validate',ctx);if(reason)return typeof reason==='string'?reason:reason.reason||'技能条件不满足';}
      return '';
    }
    availableActions(actorId=this.currentId,bp=0,options={}){const a=this.getUnit(actorId);if(!a||a.side!=='ally')return [];let keys=Object.keys(a.skills);if(a.skills.R1){keys=keys.filter(k=>!['R1','R2'].includes(k));keys.push('R');}keys.push(...Object.keys(generic));return keys.map(publicKey=>{const key=this._resolveKey(a,publicKey),ctx=this._context(a,key,options.targetId,{...options,bp});const s=ctx.skill;const candidates=ctx.targetMode==='enemy'||ctx.targetMode==='all_enemies'?this.living('enemy'):ctx.targetMode==='self'?[a]:this.living('ally').filter(t=>ctx.targetMode!=='other_ally'||t.id!==a.id);const choices=this._hook('choices',a,s,key,bp,ctx.options)||{};let reason=this._legality(ctx,false);if(!reason&&candidates.length===0)reason='没有合法目标';let previewReason='';if(!reason){const sample=options.targetId||candidates[0]?.id;const c=this._context(a,key,sample,{...options,bp});previewReason=this._hook('validate',c)||'';/* Selection errors belong to the target picker, not the skill menu. */if(typeof previewReason==='string'&&/形态|姿态|模式|尚未|不处于|仅限|^需要|^临界期间/.test(previewReason))reason=previewReason;}
        if(!reason&&choices.allyTargets&&choices.allyTargets.length===0)reason='没有合法其他队友';if(!reason&&choices.multiTarget?.min>0&&choices.multiTarget.ids.length<choices.multiTarget.min)reason='没有符合条件的目标';
        return {...s,key:publicKey,resolvedKey:key,skill:s,name:ctx.name,enabled:!reason,ready:!reason,reason,selectionReason:previewReason,spCost:ctx.spCost,energyCost:ctx.energyCost,cooldownRemaining:key==='R2'?0:Math.max(0,(a.cooldowns[this._cooldownKey(key,s)]||0)-this.round),bp,requiredBP:key==='R2'?3:null,target:ctx.targetMode,targetText:ctx.targetMode==='other_ally'?'另一名存活队友':s.target||'',targets:candidates.map(t=>t.id),...choices,preview:{coef:ctx.coef,coefDef:ctx.coefDef,q:ctx.q,attacks:ctx.attacks.length,sp:ctx.spCost,energyCost:ctx.energyCost,bp,bodyText:ctx.coefDef?`${quant(ctx.coefDef)}×DEF`:ctx.coef?`${quant(ctx.coef)}×ATK`:'支援效果'}};});}
    start(){if(this.started)return this._reject('战斗已开始');const n=this.log.length;this.started=true;this._checkResult();if(!this.result){this._beginRound();this._advance();}return this._reply(n);}
    _beginRound(){this.round++;for(const a of this.living('ally')){if(this.round>1&&a.spentBPRound!==this.round-1)a.bp=Math.min(5,a.bp+1);if(a.r2Pending){a.energyLocked=true;a.form=a.key==='amy'?'mech':a.key==='denia'?'blue':a.form;}}
      this._hook('roundStart');const units=this.living('ally').concat(this.living('enemy').filter(e=>!e.mechanicUnit));units.sort((a,b)=>Number(b.defendPriority)-Number(a.defendPriority)||this.finalStat(b,'spd')-this.finalStat(a,'spd')||(a.side===b.side?a.slot-b.slot:a.side==='ally'?-1:1));this.queue=units.map(u=>u.id);this._record('round_start',{queue:this.queue.slice()},`第${this.round}轮`);}
    _endRound(){this._record('round_end');this._hook('roundEnd');for(const u of this.allies.concat(this.enemies))for(const [k,v] of Object.entries(u.status))if(!v.roleEffect&&Number.isFinite(v.expires)&&v.expires<=this.round&&!v.slotBound)delete u.status[k];this._checkResult();}
    _advance(){this._currentId=null;let guard=0;while(!this.result&&guard++<1000){if(!this.queue.length){this._endRound();if(this.result)break;this._beginRound();}const u=this.getUnit(this.queue.shift());if(!u||u.hp<=0||u.retreated||u.actedRound===this.round||u.mechanicUnit)continue;
        if(u.slotStartedRound!==this.round){u.slotStartedRound=this.round;delete u.status.guard;u.defendPriority=false;if(u.side==='enemy'){delete u.status.counter_stance;if(u.steadfastActions>0)u.steadfastActions--;}
          this._hook('onActionStart',u);this._record('slot_start',{actor:u.id});}
        if(u.status.stasis_delay?.uses>0&&u.side==='enemy'&&u.rank!=='boss'){u.status.stasis_delay.uses--;if(!u.status.stasis_delay.uses)delete u.status.stasis_delay;if(this.queue.length){this.queue.push(u.id);this._record('delay',{target:u.id});continue;}}
        if(u.side==='ally'&&u.status.stun){u.actedRound=this.round;this._record('control_skip',{actor:u.id});this._registerOpportunity(u);continue;}
        this._currentId=u.id;return;
      }if(guard>=1000)throw new Error('行动队列未推进');}
    advance(){if(this.currentId)return this._reject('当前行动尚未提交');const n=this.log.length;this._advance();return this._reply(n);}
    _registerOpportunity(actor){for(const e of this.living('enemy'))if(e.charge?.opportunities&&own(e.charge.opportunities,actor.id))e.charge.opportunities[actor.id]++;}
    _finishCommand(ctx){ctx.actor.actedRound=this.round;if(ctx.actor.side==='ally')this._registerOpportunity(ctx.actor);this._hook('onActionEnd',ctx.actor,ctx);this._checkResult();this.activeContext=null;this.active_action=false;if(!this.result)this._advance();}
    act(key,targetId,options={}){if(!options||typeof options!=='object'||Array.isArray(options)||(options.bp!==undefined&&!int(options.bp,0,3)))return this._reject('BP必须为0–3整数');const a=this.current;if(!a)return this._reject(this.result?'战斗已结束':'当前没有角色');const ctx=this._context(a,key,targetId,options);const reason=this._legality(ctx,true);if(reason)return this._reject(reason);const n=this.log.length;
      if(ctx.key==='wait'){a.waitRound=this.round;this.queue.push(a.id);this._record('wait',{actor:a.id});this._advance();return this._reply(n);}
      this.action_id++;ctx.rootActionId=this.action_id;this.activeContext=ctx;this.active_action=true;a.sp-=ctx.spCost;a.bp-=ctx.bp;if(ctx.bp)a.spentBPRound=this.round;
      if(ctx.key!=='R2'&&ctx.cooldown>0)a.cooldowns[this._cooldownKey(ctx.key,ctx.skill)]=this.round+ctx.cooldown;
      if(ctx.energyCost>0)a.energy=0;
      if(ctx.key==='R1'){a.r2Pending=true;a.energyLocked=true;}
      ctx.crit=false;
      this.actions[`${a.key}:${ctx.key}`]=(this.actions[`${a.key}:${ctx.key}`]||0)+1;
      this._record('action_commit',{actor:a.id,source:a.id,skill:ctx.key,rootActionId:ctx.rootActionId,bp:ctx.bp,sp:ctx.spCost,energyCost:ctx.energyCost,targets:ctx.targets.map(t=>t.id)},`${a.name}：${ctx.name}`);
      if(ctx.skill.generic)this._generic(ctx);else{
        this._hook('prepare',ctx);ctx.crit=this.stochastic&&ctx.attacks.length>0?this._random()<Math.min(1,this.finalStat(a,'cr')+(ctx.roleCrBonus||0)):false;this._executeOriginal(ctx);this._hook('afterRoot',ctx);
        for(const event of ctx.breaks)if(this.getUnit(event.target)?.hp>0)this._hook('onBreak',event,ctx);
        this._hook('afterBreaks',ctx);
        if(ctx.key==='R2'){a.r2Pending=false;a.energyLocked=false;if(a.key==='amy')a.form='human';if(a.key==='denia')a.form='red';}
        if(ctx.effective||ctx.launchedAttacks>0)this.distributeEnergy(a,ctx.baseEnergy);
        this._enemyCounters(ctx);this._hook('afterCounterQueue',ctx);
      }
      this._record('action_end',{actor:a.id,rootActionId:ctx.rootActionId});this._finishCommand(ctx);return this._reply(n);
    }
    _generic(ctx){const a=ctx.actor,t=ctx.target;switch(ctx.key){case'guard':this.addStatus(a,'guard',{owner:a.id,slotBound:true});a.defendPriority=true;break;case'item_sp':{this.inventory.sp--;const target=t||a;const value=Math.min(ctx.skill.recovery??40,target.maxsp-target.sp);target.sp+=value;this._record('item',{actor:a.id,target:target.id,item:'sp',amount:value});break;}case'item_repair':this.inventory.repair--;this.heal(a,t,t.maxhp*(ctx.skill.heal_fraction??.25));break;case'item_cleanse':this.inventory.cleanse--;for(const [k,v] of Object.entries(t.status))if(v.debuff||v.cleanseable||['stun','role_slow','stasis_delay'].includes(k))this.removeStatus(t,k);break;case'escape':a.retreated=true;a.bp=0;a.energy=0;this._hook('onDown',a);a.status={};this._record('retreat',{actor:a.id});break;case'negotiate':if(t&&t.negotiation){t.retreated=true;this._hook('onDown',t);this._record('negotiate',{actor:a.id,target:t.id});}break;}}
    _executeOriginal(ctx){const a=ctx.actor;ctx.launchedAttacks=0;for(const attack of ctx.attacks){if(a.hp<=0||a.retreated||this.result)break;const targets=(attack.targets||ctx.targets).map(t=>this.getUnit(t)).filter(t=>t&&t.hp>0&&!t.retreated);if(!targets.length)break;attack.attackId=++this.attack_id;attack.rootActionId=ctx.rootActionId;ctx.launchedAttacks++;ctx.currentAttack=attack;this._hook('beforeAttack',ctx,attack);this._record('original_attack',{source:a.id,actor:a.id,rootActionId:ctx.rootActionId,attackId:attack.attackId,targets:targets.map(t=>t.id),index:attack.index});const hits=[];
        for(const t of targets){if(a.hp<=0||t.hp<=0||t.retreated||this.result)continue;const scale=attack.targetModifiers?.[t.id]||{};const packets=attack.packets||[{coef:attack.coef,defCoef:attack.defCoef,element:attack.element}];let total={damage:0,hpDamage:0,shieldDamage:0,damageImmune:true,hit:true};const hitId=++this.hit_id;
          for(const p of packets){if(t.hp<=0)break;const d=this.damage(a,t,{...p,coef:(p.coef||0)*(scale.coefScale??1),defCoef:(p.defCoef||0)*(scale.coefScale??1),category:ctx.category,kind:'original',attackId:attack.attackId,hitId,rootActionId:ctx.rootActionId,ctx,crit:ctx.crit,forceMiss:attack.forceMiss||ctx.options.forceMiss===true||ctx.options.forceMiss?.includes?.(attack.index)});total.damage+=d.damage;total.hpDamage+=d.hpDamage;total.shieldDamage+=d.shieldDamage;total.damageImmune=total.damageImmune&&d.damageImmune;total.hit=total.hit&&d.hit;}
          if(total.hit){const hit={...total,source:a,target:t,rootActionId:ctx.rootActionId,attackId:attack.attackId,hitId,element:attack.element,coef:attack.coef,defCoef:attack.defCoef,original:true};ctx.hits.push(hit);hits.push(hit);this._record('successful_hit',{source:a.id,target:t.id,rootActionId:ctx.rootActionId,attackId:attack.attackId,hitId,...total});if(t.hp>0&&!total.damageImmune)this.applyQ(a,t,(attack.q||0)*(scale.qScale??1),ctx);this._hook('afterHit',ctx,hit);}
        }
        this._hook('afterAttack',ctx,attack,hits);
      }delete ctx.currentAttack;}
    _damageMath(source,target,p={}){const m=this._hook('modifiers',source,target,p)||{};const level=p.levelSnapshot??source.level,K=100+5*level;
      const atk=p.atkSnapshot??this.finalStat(source,'atk'),defSource=p.defSnapshot??this.finalStat(source,'def');const base=p.base??((p.coef||0)*atk+(p.defCoef||0)*defSource+(p.hpCoef||0)*source.maxhp+(p.flat||0));
      const element=elementKey(p.element||source.element);const immune=(target.immune_elements||[]).map(elementKey).includes(element)||target.damageImmune===true||target.damageImmunities?.includes(element);
      const miss=!!p.forceMiss||!!target.hitImmune;const shred=clamp((m.defShred||0)+(p.defShred||0),0,.6),ignore=clamp((m.defIgnore||0)+(p.defIgnore||0),0,.5);
      const defense=this.finalStat(target,'def')*(1-shred)*(1-ignore);let res=target.resist?.[element];if(res===undefined){const cn=Object.entries(elements).find(([,v])=>v===element)?.[0];res=target.resist?.[cn]??.1;}
      res+=(m.resistance||0);res-=m.resShred||0;res-=Math.max(0,res)*(m.resPenetration||p.resPenetration||0)+(m.resIgnore||p.resIgnore||0);res=clamp(res,-.5,.9);const resistMultiplier=res<0?1-res/2:res<.75?1-res:1/(1+4*res);
      let reduction=Math.max(m.reduction||0,p.reduction||0);if(target.status.guard)reduction=Math.max(reduction,.5);reduction=clamp(reduction,0,.75);
      const noSource=p.ignoreSourceBonuses||p.kind==='status'||p.kind==='reflection';const bonus=noSource?1:p.snapshotSourceBonuses?1+(p.damageBonus||0):1+(m.damageBonus||0)+(p.damageBonus||0)+(source.status.damage_boost?.amount||0);const amp=1+(m.allHpAmplify||0)+(p.kind==='status'?(m.statusAmplify||0)+(p.statusAmplify||0):noSource?0:p.snapshotSourceBonuses?(p.amplify||0):(m.amplify||0)+(p.amplify||0));
      const crit=p.canCrit===false?false:!!p.crit;const critMultiplier=crit?this.finalStat(source,'cdmg')+(m.cdmgBonus||0):1;
      const raw=base*bonus*amp*critMultiplier*K/(K+defense)*resistMultiplier*(1-reduction);
      const damage=!miss&&!immune&&base>0?Math.max(1,Math.floor(raw)):0;
      return {damage,base,element,immune,damageImmune:immune,hit:!miss,crit,defense,resistance:res,K,defMultiplier:K/(K+defense),resistMultiplier};}
    damage(source,target,packet={}){const s=this.getUnit(source),t=this.getUnit(target);if(!s||!t||s.hp<=0||s.retreated||t.hp<=0||t.retreated)return {damage:0,hpDamage:0,shieldDamage:0,hit:false,damageImmune:false};const ctx=packet.ctx||this.activeContext;const p={...packet,ctx,rootActionId:packet.rootActionId??ctx?.rootActionId,source:s,target:t,kind:packet.kind||'attached'};if(p.crit===undefined&&p.canCrit!==false&&this.stochastic&&['coordinated','counter'].includes(p.kind))p.crit=this._random()<this.finalStat(s,'cr');const calc=this._damageMath(s,t,p);let amount=calc.damage;p.amount=amount;p.element=calc.element;p.damageImmune=calc.damageImmune;p.hit=calc.hit;p.afterDamage=[];
      if(t.side==='ally'&&calc.hit)this._hook('beforeIncomingDamage',p);amount=Math.max(0,Math.floor(p.amount));let remaining=amount,shieldDamage=0;
      for(const [key,value] of Object.entries(t.status)){if(!remaining)break;if(value.shield||key==='barrier'){const absorbed=Math.min(remaining,value.amount||0);remaining-=absorbed;shieldDamage+=absorbed;value.amount-=absorbed;if(value.amount<=0)delete t.status[key];}}
      p.amount=remaining;p.shieldDamage=shieldDamage;if(t.side==='ally'&&calc.hit)this._hook('beforeHPDamage',p);const hpDamage=Math.min(t.hp,Math.max(0,Math.floor(p.amount)));t.hp-=hpDamage;p.hpDamage=hpDamage;p.damage=shieldDamage+hpDamage;
      this._record('damage',{source:s.id,actor:s.id,target:t.id,kind:p.kind,category:p.category,element:p.element,damage:p.damage,hpDamage,shieldDamage,damageImmune:calc.damageImmune,hit:calc.hit,crit:calc.crit,hp_after:t.hp,rootActionId:p.rootActionId,attackId:p.attackId,hitId:p.hitId},`${s.name} → ${t.name} ${p.damage}`);
      if(ctx&&(hpDamage>0||shieldDamage>0))ctx.effective=true;for(const f of p.afterDamage)if(typeof f==='function')f(p);
      if(t.hp<=0)this._down(t,s,p);else this._phaseFacts(t);
      if((p.q||0)>0&&t.hp>0)this.applyQ(s,t,p.q,ctx,p.kind==='reflection');
      return {...calc,damage:p.damage,hpDamage,shieldDamage};}
    applyQ(source,target,amount,ctx=this.activeContext,noResponse=false){const s=this.getUnit(source),t=this.getUnit(target);if(!s||!t||t.hp<=0||!t.maxq||t.q<=0||t.breakPending||t.bossState==='special_interrupted'||amount<=0)return 0;const before=t.q;t.q=quant(Math.max(0,t.q-amount));const delta=quant(before-t.q);this._record('q_damage',{source:s.id,target:t.id,amount:delta,q_after:t.q,rootActionId:ctx?.rootActionId});
      if(t.q===0){t.breakPending=true;t.breakCount++;this._cancelCharge(t,true);delete t.status.counter_stance;const event=this._record('break',{source:s.id,breaker:s.id,target:t.id,rootActionId:ctx?.rootActionId,noResponse},`${t.name}共振击破`);if(ctx&&!noResponse)ctx.breaks.push(event);}
      if(t.key==='dreamless'&&t.bossState==='projectiles'&&t.q<t.maxq*.5)this._interruptSpecial(t);
      return delta;}
    _phaseFacts(t){if(t.key==='crownless'&&t.phase===1&&t.hp<=t.maxhp*.7)t.phasePending=true;if(t.key==='dreamless'&&t.hp<=t.maxhp*.35){t.phasePending=true;if(t.specialDone&&t.bossState==='normal')t.phase=3;}}
    _down(t,source,packet){if(t.dead)return;t.hp=0;t.dead=true;t.bp=0;t.energy=0;this._record('down',{target:t.id,source:source?.id});this._hook('onDown',t);if(t.mechanicUnit){this._reflect(t,source,packet);return;}t.status={};if(t.r2Pending){t.energyLocked=true;t.form=t.key==='amy'?'mech':t.key==='denia'?'blue':t.form;}if(t.key==='dreamless')this._removeProjectiles(t);this._checkResult();}
    revive(target,hp){const t=this.getUnit(target);if(!t||t.hp>0||t.mechanicUnit||hp<=0)return false;t.hp=Math.min(t.maxhp,Math.max(1,Math.floor(hp)));t.dead=false;t.actedRound=this.round;t.bp=0;t.energy=0;if(t.r2Pending){t.energyLocked=true;t.form=t.key==='amy'?'mech':'blue';}this._record('revive',{target:t.id,hp:t.hp});return true;}
    _selectTarget(actor){const alive=this.living(actor.side==='ally'?'enemy':'ally');if(!alive.length)return null;const taunt=actor.status.taunt?.owner&&this.getUnit(actor.status.taunt.owner);if(taunt&&taunt.hp>0&&!taunt.retreated)return taunt;return alive.slice().sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp||a.slot-b.slot)[0];}
    effectPolicy(target,type){const t=this.getUnit(target);if(!t)return 'immune';if(t.mechanicUnit)return 'immune';if(type==='slow')return 'apply';if(type==='pull')return t.rank==='boss'||t.pull_immune?'immune':'apply';if(t.rank!=='boss')return 'apply';if(t.charge){const training=this.options.difficulty==='easy'&&this.params.difficulties?.easy?.allow_charge_control_once===true;return training&&!t.charge.controlDelayed?'delay_once':'immune';}if(t.key==='crownless'&&t.status.counter_stance&&!t.steadfastActions)return 'suppress_reaction';return 'immune';}
    control(source,target,type='bind'){const s=this.getUnit(source),t=this.getUnit(target);if(!s||!t||t.hp<=0)return false;const policy=this.effectPolicy(t,type);if(policy==='immune'){this._record('control_immune',{source:s.id,target:t.id,type,policy});return false;}if(type==='pull'||type==='slow')return true;
      if(t.status.interruption_guard?.uses>0){t.status.interruption_guard.uses--;if(!t.status.interruption_guard.uses)delete t.status.interruption_guard;return false;}
      if(policy==='suppress_reaction'){t.status.counter_stance.suppressedUses=1;t.steadfastActions=2;this._record('reaction_suppressed',{source:s.id,target:t.id});return true;}
      if(policy==='delay_once'){t.charge.controlDelayed=true;if(t.charge.opportunities)t.charge.required++;else t.charge.delaySlots=1;this._record('charge_delayed',{source:s.id,target:t.id});return true;}
      if(t.status.counter_stance)t.status.counter_stance.suppressed=true;
      if(t.charge){if(t.charge.controlDelayed)return false;t.charge.controlDelayed=true;t.charge.delaySlots=1;}
      else this.addStatus(t,'stasis_delay',{owner:s.id,uses:1},2);
      this._record('control',{source:s.id,target:t.id,type});return true;
    }
    _prepareCharge(e,type,required=1){delete e.status.counter_stance;e.charge={type,startedRound:this.round,required,opportunities:Object.fromEntries(this.living('ally').map(a=>[a.id,0])),controlDelayed:false,delaySlots:0};this._record('charge',{source:e.id,type,required,targets:this.living('ally').map(a=>a.id)},`${e.name}正在蓄力`);}
    _canRelease(e){return e.charge&&this.living('ally').filter(a=>own(e.charge.opportunities||{},a.id)).every(a=>(e.charge.opportunities[a.id]||0)>=e.charge.required);}
    _cancelCharge(e,broken=false){if(!e.charge)return;if(e.key==='crownless')e.cooldowns.wing_charge=this.round+5;if(e.key==='dreamless'&&e.bossState==='projectiles'){this._interruptSpecial(e);return;}e.charge=null;this._record('charge_cancelled',{source:e.id,broken});}
    _spawnProjectiles(e){for(let i=0;i<2;i++){const key='dreamless_projectile';const def=this.params.enemies[key]||{};const slot=this.enemies.length;const u={...clone(def),key,asset_key:key,id:`enemy:projectile:${++this.projectile_id}`,side:'enemy',slot,level:e.level,name:`可反弹投射物${i+1}`,maxhp:e.projectile_hp||180,hp:e.projectile_hp||180,atk:e.atk,def:e.projectile_def||90,spd:0,cr:0,cdmg:1.5,er:1,maxsp:0,sp:0,bp:0,energy:0,energyCap:0,cooldowns:{},status:{},form:'normal',r2Pending:false,energyLocked:false,spentBPRound:0,actedRound:this.round,slotStartedRound:0,waitRound:0,defendPriority:false,dead:false,retreated:false,phase:1,phasePending:false,mainActions:0,breakPending:false,breakCount:0,firstBreakRecovered:false,specialDone:false,bossState:'normal',charge:null,recovering:false,q:0,maxq:0,rank:'mechanism',mechanism:true,mechanicUnit:true,owner:e.id,reflected:false,element:'havoc',skills:{},resist:Object.fromEntries(['glacio','fusion','electro','aero','spectro','havoc'].map(k=>[k,.1])),control_immune:['pull','bind','stun','heal','revive','negotiate']};this.enemies.push(u);this._record('spawn',{source:e.id,target:u.id,kind:'projectile'});}}
    _removeProjectiles(e){for(const p of this.enemies)if(p.mechanicUnit&&p.owner===e.id){if(!p.retreated){p.retreated=true;this._record('despawn',{target:p.id});}this._hook('onDown',p);p.status={};}}
    _reflect(p,source,packet){if(p.reflected)return;p.reflected=true;p.retreated=true;const e=this.getUnit(p.owner);if(!e||e.hp<=0)return;this._record('reflection',{source:p.id,target:e.id,actor:source?.id,q:e.reflection_q??54.6});this.damage(e,e,{coef:e.reflection_coefficient??3,element:'havoc',kind:'reflection',category:'反弹',canCrit:false,ignoreSourceBonuses:true,levelSnapshot:e.level,q:e.reflection_q??54.6,ctx:packet.ctx});}
    _interruptSpecial(e){if(e.bossState==='special_interrupted')return;e.bossState='special_interrupted';e.charge=null;this._removeProjectiles(e);this._record('special_interrupt',{target:e.id,q:e.q,threshold:e.maxq*.5},`${e.name}蓄能中断`);}
    _finishSpecial(e){e.specialDone=true;e.phase=e.phasePending?3:2;e.bossState='normal';e.charge=null;e.lastHighRiskAction=e.mainActions;this._removeProjectiles(e);}
    _recoverBreak(e){e.breakPending=false;e.q=e.maxq;e.firstBreakRecovered=true;this._record('break_recover',{target:e.id,q:e.q});}
    _ready(e,key){return (e.cooldowns[key]||0)<=this.round;}
    _enemyPlan(e){const target=this._selectTarget(e);if(e.breakPending)return {key:'break_recover',name:'失衡收势',skip:true};
      if(e.key==='dreamless'&&e.bossState==='special_interrupted')return {key:'special_recover',name:'中断收势',skip:true};
      if(e.charge){if(e.charge.delaySlots>0)return {key:'charge_delay',name:'受控延后',skip:true};if(!this._canRelease(e))return {key:'charge_maintain',name:'维持蓄能',skip:true};return {key:'charge_release',name:e.key==='crownless'?'展翼裁决':e.key==='dreamless'?'毁灭放射':e.key==='predator'?'猎手狙击':'轮刃回旋',coef:e.key==='crownless'?12:e.key==='dreamless'?9:e.key==='predator'?2.8:2.6,aoe:e.key!=='predator',targetId:e.charge.targetId,release:true};}
      if(e.key==='crownless'){
        if(!e.mainActions)return {key:'opening',name:'跃击',coef:1.8};
        if(e.phasePending&&e.phase===1)return {key:'transform',name:'持枪转段',transform:true};
        if(e.recovering)return {key:'basic',name:'收势短连',coef:1.8,recovery:true};
        if(e.phase===1)return this._ready(e,'uppercut')?{key:'uppercut',name:'升击',coef:2.8,cd:2}:{key:'basic',name:'短连',coef:1.8};
        if(this._ready(e,'wing_charge'))return {key:'wing_charge',name:'展翼蓄力',prepare:true};
        if(this._ready(e,'stance'))return {key:'stance',name:'反击架势',stance:true,coef:0,cd:3};
        if(this._ready(e,'sweep'))return {key:'sweep',name:'枪刃横扫',coef:1.8,aoe:true,cd:3};
        if(this._ready(e,'spear'))return {key:'spear',name:'枪刃',coef:3.6,cd:2};return {key:'basic',name:'短连',coef:1.8};
      }
      if(e.key==='dreamless'){
        if(e.firstBreakRecovered&&!e.specialDone)return {key:'projectiles',name:'投射物蓄能',prepare:true,projectiles:true};
        if(e.recovering)return {key:'basic',name:'收势短剑',coef:2.2,recovery:true};
        if(e.phase===3&&e.mainActions-(e.lastHighRiskAction??-4)>=4)return {key:'highrisk',name:'高危蓄力',prepare:true};
        if(e.phase>=2&&this._ready(e,'heavy'))return {key:'heavy',name:'重连击',coef:4.2,cd:3};
        if(this._ready(e,'scythe'))return {key:'scythe',name:'镰刃回旋',coef:3.2,cd:2};
        if(this._ready(e,'sweep'))return {key:'sweep',name:'翼刃扫荡',coef:1.6,aoe:true,cd:3};return {key:'basic',name:'短剑连段',coef:2.2};
      }
      if(e.key==='bracer'&&this._ready(e,'stance'))return {key:'stance',name:'架岩',stance:true,cd:3};
      if(['predator','carapace'].includes(e.key)&&this._ready(e,'charge'))return {key:'charge',name:e.key==='predator'?'瞄准':'旋刃蓄力',prepare:true,targetId:target?.id};
      if(/prism$/.test(e.key)){
        if(e.status.attack_link){const linked=this.getUnit(e.status.attack_link.target);if(!linked||linked.hp<=0||linked.retreated)return {key:'link_lost',name:'连线中断',skip:true};return {key:'linked_attack',name:'连线脉冲',coef:1.4};}
        if(this._ready(e,'support')&&this.living('enemy').some(t=>t.id!==e.id&&!t.mechanicUnit))return {key:'support',name:'棱镜支援',support:true,cd:3};
      }
      return {key:'basic',name:'普通攻击',coef:e.key==='bracer'?1.6:e.key==='carapace'?1.8:/prism$/.test(e.key)?1.2:1.4};
    }
    enemyIntent(actorId){const e=this.getUnit(actorId);if(!e||e.side!=='enemy')return null;if(e.mechanicUnit)return {visible:true,dangerous:false,committed:false,phase:1,name:'可反弹投射物',targets:[e.owner],description:'没有独立行动槽。可被正常单体和群体攻击；击毁后反弹54.6共振。免疫牵引、束缚、治疗、复活与交涉。',q:0,maxq:0,controlPolicy:'immune'};const isCharge=!!e.charge,visible=isCharge||e.breakPending||e.bossState==='special_interrupted'||e.phasePending&&e.key==='crownless';const p=this._enemyPlan(e);return {visible,dangerous:isCharge,committed:isCharge,phase:e.phase,name:visible?p.name:'行动未公开',targets:isCharge?(e.charge.targetId?[e.charge.targetId]:this.living('ally').map(a=>a.id)):[],description:e.bossState==='projectiles'?`击毁投射物可反弹54.6共振；当前${e.q}/${e.maxq}，严格低于${e.maxq*.5}中断。每名存活队友有${e.charge?.required||2}次应对机会。`:isCharge?`${p.name}；控制策略：${this.effectPolicy(e,'bind')==='immune'?'霸体，普通束缚无效':'可干预一次'}；共振击破可中断。`:visible?p.name:'普通招式不预先公开',q:e.q,maxq:e.maxq,controlPolicy:this.effectPolicy(e,'bind')};}
    _enemyHit(ctx,targets,coef,kind='original'){const e=ctx.actor;ctx.crit=false;const attackId=++this.attack_id;for(const t of targets){if(!t||t.hp<=0||t.retreated||e.hp<=0||this.result)continue;const d=this.damage(e,t,{coef,element:e.element,category:'敌方攻击',kind,attackId,rootActionId:ctx.rootActionId,ctx,canCrit:false,original:kind==='original'});ctx.hits.push({source:e,target:t,attackId,rootActionId:ctx.rootActionId,...d});if(d.hpDamage+d.shieldDamage>0&&!ctx.receivedEnergy.has(t.id)){ctx.receivedEnergy.add(t.id);this._gainEnergy(t,4*this.finalStat(t,'er'),e,false);if(e.status.energy_drain)t.energy=quant(Math.max(0,t.energy-8));}}
    }
    _prismSupport(e){const target=this.living('enemy').filter(t=>t.id!==e.id&&!t.mechanicUnit).sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp||a.slot-b.slot)[0];if(!target)return;switch(e.element){case'glacio':this.addStatus(target,'interruption_guard',{owner:e.id,uses:1},2);break;case'fusion':this.addStatus(target,'damage_boost',{owner:e.id,amount:.15},2);break;case'aero':this.addStatus(e,'attack_link',{owner:e.id,target:target.id});break;case'spectro':this.shield(e,target,250,2);break;case'havoc':this.addStatus(target,'energy_drain',{owner:e.id,amount:8},2);break;}}
    stepEnemy(){const e=this.current;if(!e||e.side!=='enemy'||this.result)return this._reject('当前不是敌方行动');const start=this.log.length,p=this._enemyPlan(e);this.action_id++;const ctx={actor:e,key:p.key,skill:p,rootActionId:this.action_id,category:'敌方攻击',hits:[],breaks:[],receivedEnergy:new Set(),effective:false,skipped:!!p.skip};this.activeContext=ctx;this.active_action=true;e.mainActions++;this.enemy_actions[`${e.key}:${p.key}`]=(this.enemy_actions[`${e.key}:${p.key}`]||0)+1;this._record('enemy_action',{actor:e.id,source:e.id,skill:p.key,rootActionId:ctx.rootActionId},`${e.name}：${p.name}`);
      if(p.key==='break_recover'){const special=e.bossState==='special_interrupted';this._recoverBreak(e);if(special)this._finishSpecial(e);}
      else if(p.key==='special_recover')this._finishSpecial(e);
      else if(p.key==='charge_delay')e.charge.delaySlots--;
      else if(p.key==='link_lost')delete e.status.attack_link;
      else if(p.transform){e.phase=2;e.phasePending=false;this._record('phase',{target:e.id,phase:2});}
      else if(p.prepare){this._prepareCharge(e,p.key,p.projectiles?e.projectile_responses||2:1);if(p.targetId)e.charge.targetId=p.targetId;if(p.projectiles){e.bossState='projectiles';this._spawnProjectiles(e);if(e.q<e.maxq*.5)this._interruptSpecial(e);}if(p.key==='highrisk')e.lastHighRiskAction=e.mainActions;}
      else if(p.stance)this.addStatus(e,'counter_stance',{owner:e.id,coef:e.key==='crownless'?2.3:1.8,suppressed:false,slotBound:true});
      else if(p.support)this._prismSupport(e);
      else if(!p.skip){
        if(p.release&&e.key==='dreamless'&&e.bossState==='projectiles'){const living=this.living('ally');let index=0;for(const projectile of this.living('enemy').filter(x=>x.mechanicUnit&&x.owner===e.id)){this._enemyHit(ctx,[living[index++%living.length]],1.6);projectile.retreated=true;this._hook('onDown',projectile);projectile.status={};}}
        const targets=p.aoe?this.living('ally'):[this.getUnit(p.targetId)||this._selectTarget(e)];this._enemyHit(ctx,targets,p.coef||0);
        if(p.release){if(e.key==='crownless'){e.cooldowns.wing_charge=this.round+5;e.recovering=true;}else if(e.key==='dreamless'){if(e.bossState==='projectiles')this._finishSpecial(e);else e.recovering=true;}else e.cooldowns.charge=this.round+3;e.charge=null;}
        if(p.recovery)e.recovering=false;
      }
      if(p.cd)e.cooldowns[p.key]=this.round+p.cd;
      this._hook('afterEnemyRoot',ctx);this._record('action_end',{actor:e.id,rootActionId:ctx.rootActionId});this._finishCommand(ctx);return this._reply(start);
    }
    _enemyCounters(ctx){if(!ctx.launchedAttacks||ctx.actor.hp<=0||this.result)return;const threatened=new Set(ctx.targets.map(t=>t.id));for(const e of this.living('enemy')){const stance=e.status.counter_stance;if(!stance||stance.suppressed||e.breakPending||!threatened.has(e.id)||ctx.actor.hp<=0||this.result)continue;if(stance.suppressedUses>0){stance.suppressedUses--;this._record('counter_suppressed',{source:e.id,target:ctx.actor.id,rootActionId:ctx.rootActionId});continue;}this._record('counter',{source:e.id,target:ctx.actor.id,rootActionId:ctx.rootActionId});const c={actor:e,key:'counter',rootActionId:ctx.rootActionId,hits:[],receivedEnergy:new Set(),breaks:[],isCounter:true,kind:'counter',category:'反击'};this._enemyHit(c,[ctx.actor],stance.coef,'counter');this._hook('afterEnemyRoot',c);}}
    _checkResult(){if(this.result)return this.result;let outcome=null;if(!this.living('enemy').some(e=>!e.mechanicUnit))outcome='win';else if(!this.living('ally').length)outcome=this.allies.some(a=>a.retreated)?this.allies.some(a=>a.hp<=0)?'escaped_partial':'escaped':'loss';if(!outcome)return null;this.result={outcome,rounds:this.round};this._currentId=null;this.queue=[];for(const a of this.allies){a.r2Pending=false;a.energyLocked=false;}this._record('battle_end',{outcome});return this.result;}
    queuePreview(){const remaining=[this.currentId,...this.queue].filter(Boolean).map(id=>this.getUnit(id)).filter(u=>u&&u.hp>0&&!u.retreated);return remaining.map(u=>({id:u.id,key:u.key,name:u.name,side:u.side,spd:this.finalStat(u,'spd'),current:u.id===this.currentId,acted:u.actedRound===this.round}));}
    _previewArgs(actor,target,key,options){const a=this.getUnit(actor);if(typeof target==='string'&&(a?.skills[target]||generic[target]||target==='R')&&this.getUnit(key)){const swap=key;key=target;target=swap;}return {a,t:this.getUnit(target),key,options:options||{}};}
    _previewClone(){const e=Object.create(BattleEngine.prototype);Object.assign(e,this);const unit=u=>({...u,status:clone(u.status),cooldowns:clone(u.cooldowns),roleState:clone(u.roleState||{}),charge:clone(u.charge)});e.allies=this.allies.map(unit);e.enemies=this.enemies.map(unit);e.log=[];e.count={};e.queue=this.queue.slice();e.result=null;e.activeContext=null;e.fields=clone(this.fields);return e;}
    previewPacket(actor,target,key,options={}){const {a,t,key:k,options:o}=this._previewArgs(actor,target,key,options);if(!a||!t)return {damage:0,coef:0,coefDef:0,q:0,attacks:0,immune:false,sp:0,bp:o.bp||0};const e=this._previewClone(),src=e.getUnit(a),dst=e.getUnit(t),ctx=e._context(src,k,dst.id,o);if(!ctx)return {damage:0};e.activeContext=ctx;ctx.crit=false;e._hook('prepare',ctx);let damage=0,q=0,immune=true,coef=0,coefDef=0;const packets=[];for(const attack of ctx.attacks){const scale=attack.targetModifiers?.[dst.id]||{};const list=attack.packets||[{coef:attack.coef,defCoef:attack.defCoef,element:attack.element}];let immuneAttack=true;for(const packet of list){const p={...packet,coef:(packet.coef||0)*(scale.coefScale??1),defCoef:(packet.defCoef||0)*(scale.coefScale??1),category:ctx.category,kind:'original',ctx,crit:false,canCrit:false,attackId:attack.index+1};coef+=p.coef;coefDef+=p.defCoef;const d=e._damageMath(src,dst,p);damage+=d.damage;immune=immune&&d.immune;immuneAttack=immuneAttack&&d.immune;packets.push({element:d.element,damage:d.damage,coef:p.coef,coefDef:p.defCoef,immune:d.immune});}if(!immuneAttack)q+=(attack.q||0)*(scale.qScale??1);}return {damage,coef,coefDef,q:dst.maxq?quant(q):0,attacks:ctx.attacks.length,element:a.element,packets,immune,sp:ctx.spCost,bp:ctx.bp,energyCost:ctx.energyCost,category:ctx.category,nonCritical:true};}
    previewDamage(actor,target,key,options={}){return this.previewPacket(actor,target,key,options).damage;}
    describeStatus(id,key){const u=this.getUnit(id),s=u?.status[key];if(!s)return '';return `${s.name||key}${s.owner?` · 来源${this.getUnit(s.owner)?.name||s.owner}`:''}${Number.isFinite(s.expires)?` · 至第${s.expires}轮末`:''}${s.uses!==undefined?` · 余${s.uses}次`:''}${s.stacks!==undefined?` · ${s.stacks}层`:''}`;}
    autoAction(){const a=this.current;if(!a)return this._reject('没有当前行动');if(a.side==='enemy')return this.stepEnemy();const enemy=this.living('enemy').sort((x,y)=>Number(y.mechanicUnit)-Number(x.mechanicUnit)||x.hp-y.hp)[0];const bp=a.r2Pending&&a.bp>=3?3:a.bp>=3?3:0;
      const candidates=[];for(const spend of [...new Set([bp,0])])for(const row of this.availableActions(a.id,spend)){if(!row.enabled||['wait','escape','negotiate','guard'].includes(row.key))continue;const target=row.target==='self'?a:row.target==='ally'||row.target==='other_ally'?this.living('ally').filter(t=>row.target!=='other_ally'||t.id!==a.id).sort((x,y)=>(y.maxhp-y.hp)-(x.maxhp-x.hp))[0]:enemy;if(!target)continue;const opts={bp:spend,allyTargetId:(row.allyTargets||[]).find(id=>id!==a.id)||a.id};if(row.choices?.length)opts.choice=row.choices[0].value;if(row.abnormalChoices?.length)opts.abnormal=row.abnormalChoices[0].value;if(row.multiTarget){const ids=row.multiTarget.ids||[];opts.targetIds=ids.slice(0,row.multiTarget.max||1);if(row.multiTarget.perTargetAbnormal){opts.abnormal={};for(const id of opts.targetIds){const t=this.getUnit(id);const k=Object.keys(t?.status||{}).find(k=>['spectro_frazzle','aero_erosion','electro_flare','fusion_burst','havoc_bane'].includes(k));if(k)opts.abnormal[id]=k;}}}
        const ctx=this._context(a,row.key,target.id,opts);if(this._legality(ctx,true))continue;let score=this.previewDamage(a,target,row.key,opts);if(row.resolvedKey==='R2')score+=10000;if(ctx.energyCost>0)score+=100;if(row.key==='item_sp')score=a.sp<12?500:-500;if(row.key==='item_repair')score=target.hp<target.maxhp*.45?600:-500;if(ctx.attacks.length===0&&!row.skill.generic)score+=this.living('ally').reduce((n,t)=>n+(t.maxhp-t.hp)*.1,0)+30;candidates.push({score,row,target,opts});}
      candidates.sort((x,y)=>y.score-x.score);if(candidates.length){const c=candidates[0];return this.act(c.row.key,c.target.id,c.opts);}return this.act('guard',a.id,{bp:0});}
    summary(){return {outcome:this.result?.outcome||'inconclusive',rounds:this.round,survivors:this.living('ally').length,escaped_count:this.allies.filter(a=>a.retreated).length,ko_count:this.allies.filter(a=>a.hp===0).length,ally_hp_fraction:this.allies.reduce((n,a)=>n+a.hp,0)/this.allies.reduce((n,a)=>n+a.maxhp,0),counts:clone(this.count),skills:clone(this.actions),enemy_skills:clone(this.enemy_actions),inventory:clone(this.inventory),final_resources:Object.fromEntries(this.allies.map(a=>[a.key,{sp:a.sp,bp:a.bp,energy:a.energy,r2Pending:a.r2Pending}])),first_break_round:this.log.find(e=>e.event==='break')?.round||null,enemy_effective_actions:this.log.filter(e=>e.event==='enemy_action'&&!['break_recover','special_recover','charge_maintain'].includes(e.skill)).length};}
    snapshot(){if(this.active_action)throw new Error('不能保存未完成指令');const state={};for(const k of Object.keys(this))if(!['params','options','activeContext'].includes(k))state[k]=clone(this[k]);return {schema_version:'battle-v04',version:4,parameter_fingerprint:fingerprint(this.params),options:clone(this.options),state};}
    static restore(params,snapshot){
      const fail=message=>{throw new Error(message||'非法战斗存档');};
      if(!snapshot||snapshot.schema_version!=='battle-v04'||snapshot.version!==4||!snapshot.state||!snapshot.options||snapshot.parameter_fingerprint!==fingerprint(params))fail('存档版本或参数不兼容；请开始新测试');
      const top=['schema_version','version','parameter_fingerprint','options','state'];if(Object.keys(snapshot).some(k=>!top.includes(k))||top.some(k=>!own(snapshot,k)))fail();
      const b=new BattleEngine(params,snapshot.options),s=clone(snapshot.state);
      const allowed=Object.keys(b).filter(k=>!['params','options','activeContext'].includes(k));
      if(Object.keys(s).some(k=>!allowed.includes(k))||allowed.some(k=>!own(s,k)))fail('存档包含未知状态字段');
      if(!Array.isArray(s.allies)||!Array.isArray(s.enemies)||s.allies.length!==b.allies.length||s.enemies.length<b.enemies.length||s.enemies.length>b.enemies.length+2)fail('非法存档单位');
      if(s.enemies.length>b.enemies.length){const boss=b.enemies.find(e=>e.key==='dreamless');if(!boss||s.enemies.length!==b.enemies.length+2)fail('非法机制单位');b._spawnProjectiles(boss);}
      const mutable=new Set(['hp','sp','bp','energy','cooldowns','status','form','r2Pending','energyLocked','spentBPRound','actedRound','slotStartedRound','waitRound','defendPriority','dead','retreated','phase','phasePending','mainActions','breakPending','breakCount','firstBreakRecovered','specialDone','bossState','charge','recovering','q','roleState','lastHighRiskAction','steadfastActions','reflected']);
      const units={};for(const side of ['allies','enemies'])units[side]=s[side].map((u,i)=>{const original=b[side][i];if(!u||typeof u!=='object'||Array.isArray(u))fail();for(const key of Object.keys(u))if(!own(original,key)&&!mutable.has(key))fail('存档包含未知单位字段');for(const key of Object.keys(original))if(!mutable.has(key)&&JSON.stringify(u[key])!==JSON.stringify(original[key]))fail('存档静态定义不匹配');const result={...original};for(const key of mutable){if(own(u,key))result[key]=u[key];else if(own(original,key))fail('存档缺少运行状态');}return result;});
      for(const key of allowed)if(!['allies','enemies'].includes(key))b[key]=s[key];b.allies=units.allies;b.enemies=units.enemies;b.activeContext=null;b.validate();return b;
    }
    validate(){
      const fail=message=>{throw new Error(message||'非法战斗状态');};
      const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
      if(!int(this.round,0,100000)||!Array.isArray(this.queue)||new Set(this.queue).size!==this.queue.length||!Array.isArray(this.log)||!int(this.rngState,0,0xffffffff)||this.active_action!==false||typeof this.started!=='boolean'||typeof this.stochastic!=='boolean')fail('非法战斗时序');
      for(const k of ['action_id','attack_id','hit_id','projectile_id','_roleStatusSerial','_roleOrder'])if(this[k]!==undefined&&!int(this[k],0,1e9))fail('非法事件计数');
      for(const bucket of [this.count,this.actions,this.enemy_actions,this.inventory])if(!plain(bucket)||Object.values(bucket).some(v=>!int(v,0,1e9)))fail('非法计数或背包');
      const forms={amy:['human','mech'],lynae:['sampling','cruise'],mornye:['ground','air'],denia:['red','blue'],chisa:['scissors','saw'],rover_spectro:['normal'],rover_havoc:['normal','dark_surge'],rover_aero:['normal'],rover_electro:['normal','critical']};
      const ids=new Set();const all=this.allies.concat(this.enemies);
      for(const u of all){
        if(!u||ids.has(u.id))fail('单位ID重复');ids.add(u.id);
        if(!finite(u.hp,0,u.maxhp)||!finite(u.sp,0,u.maxsp)||!int(u.bp,0,5)||!finite(u.energy,0,u.energyCap)||!finite(u.q,0,u.maxq)||u.dead!==(u.hp===0))fail('非法单位资源');
        if(['dead','retreated','r2Pending','energyLocked','defendPriority','phasePending','breakPending','firstBreakRecovered','specialDone','recovering'].some(k=>typeof u[k]!=='boolean'))fail('非法单位布尔值');
        if(u.dead&&(u.bp||u.energy)||u.dead&&u.retreated&&!u.mechanicUnit)fail('倒下资源状态无效');
        if(u.r2Pending!==u.energyLocked||u.r2Pending&&u.key!=='amy'&&u.key!=='denia')fail('非法R2资格');
        if(u.r2Pending&&(u.energy!==0||u.form!==(u.key==='amy'?'mech':'blue')))fail('非法R2形态或能量');
        if(u.side==='ally'&&!forms[u.key]?.includes(u.form))fail('未知角色形态');
        for(const key of ['spentBPRound','actedRound','slotStartedRound','waitRound'])if(!int(u[key],0,this.round))fail('非法行动轮');
        if(!int(u.mainActions,0,this.round)||!int(u.breakCount,0,1e9)||!int(u.phase,1,3)||u.steadfastActions!==undefined&&!int(u.steadfastActions,0,2))fail('非法阶段计数');
        if(!plain(u.status)||!plain(u.cooldowns)||Object.values(u.cooldowns).some(v=>!int(v,0,100005)))fail('非法状态或CD');
        const cds=new Set([...Object.keys(u.skills||{}),'R','rover_electro_e2','wing_charge','uppercut','stance','sweep','spear','scythe','heavy','charge','support']);if(Object.keys(u.cooldowns).some(k=>!cds.has(k)))fail('未知CD');
        if(u.roleState&&(!plain(u.roleState)||Object.keys(u.roleState).some(k=>k!=='boundGranted')||u.roleState.boundGranted!==undefined&&typeof u.roleState.boundGranted!=='boolean'))fail('非法角色一次性资格');
        if(['ap','temp_ap','concerto','rsc'].some(k=>own(u,k)))fail('旧框架资源禁止混入');
        if(u.breakPending&&(u.q!==0||!u.maxq))fail('非法失衡');
        if(!['normal','projectiles','special_interrupted'].includes(u.bossState)||u.bossState!=='normal'&&u.key!=='dreamless')fail('非法Boss阶段');
        if(u.phase===3&&u.key!=='dreamless'||u.phase!==1&&u.side==='ally'||u.phase!==1&&u.side==='enemy'&&!['dreamless','crownless'].includes(u.key))fail('阶段与单位不匹配');if(u.bossState==='projectiles'&&(!u.charge||u.charge.type!=='projectiles'||u.specialDone)||u.bossState==='special_interrupted'&&u.charge)fail('特殊阶段与蓄力不匹配');
        if(u.charge){const c=u.charge;if(!plain(c)||Object.keys(c).some(k=>!['type','startedRound','required','opportunities','controlDelayed','delaySlots','targetId'].includes(k))||!['wing_charge','projectiles','highrisk','charge'].includes(c.type)||!int(c.startedRound,1,this.round)||!int(c.required,1,3)||!plain(c.opportunities)||typeof c.controlDelayed!=='boolean'||!int(c.delaySlots,0,1))fail('非法蓄力');for(const [id,n] of Object.entries(c.opportunities))if(!this.allies.some(a=>a.id===id)||!int(n,0,this.round-c.startedRound+1))fail('非法应对次数');if(c.targetId&&!this.allies.some(a=>a.id===c.targetId))fail('非法锁定对象');}
      }
      const baseStatuses={guard:['owner','slotBound'],counter_stance:['owner','coef','suppressed','suppressedUses','slotBound'],stasis_delay:['owner','uses','expires'],interruption_guard:['owner','uses','expires'],damage_boost:['owner','amount','expires'],attack_link:['owner','target'],barrier:['owner','amount','shield','expires'],chisa_shield:['owner','amount','shield','expires'],energy_drain:['owner','amount','expires'],stun:['owner','expires','debuff','cleanseable']};
      for(const u of all)for(const [key,status] of Object.entries(u.status)){
        if(!plain(status))fail('非法状态记录');if(status.roleEffect){if(typeof Effects.validateState!=='function') {if(!status.id||!ids.has(status.ownerId))fail('非法角色状态来源');}continue;}
        const allowed=baseStatuses[key];if(!allowed||Object.keys(status).some(k=>!allowed.includes(k)))fail('未知状态或字段');
        if(status.suppressedUses!==undefined&&!int(status.suppressedUses,0,1))fail('非法反击压制次数');if(status.owner&&!ids.has(status.owner)||status.target&&!ids.has(status.target))fail('非法状态引用');if(status.expires!==undefined&&!int(status.expires,this.round,100005))fail('非法状态期限');if(status.amount!==undefined&&!finite(status.amount,0,1e9)||status.uses!==undefined&&!int(status.uses,1,10))fail('非法状态数值');
      }
      this._hook('validateState');if(!Array.isArray(this.fields)||this.fields.length)fail('非法场记录');for(const u of all)for(const value of Object.values(u.status)){if(value.roleEffect&&(!int(this._roleStatusSerial,value.token||0,1e9)||!int(this._roleOrder,value.order||0,1e9)))fail('状态序号倒退');}
      if(this.queue.some(id=>!ids.has(id))||this.currentId&&!ids.has(this.currentId)||this.currentId&&this.queue.includes(this.currentId))fail('非法行动队列');
      if(this.started&&!this.result){for(const u of all)if(u.hp>0&&!u.retreated&&!u.mechanicUnit&&u.actedRound!==this.round&&u.id!==this.currentId&&!this.queue.includes(u.id))fail('正常行动槽遗失');}
      if(this.current&&(this.current.hp<=0||this.current.retreated||this.current.actedRound===this.round||this.current.mechanicUnit))fail('非法当前行动');
      if(!this.started&&(this.round||this.currentId||this.queue.length||this.log.length||this.result))fail('未开战状态无效');
      if(this.result){if(this.currentId||this.queue.length||!plain(this.result)||!['win','loss','escaped','escaped_partial'].includes(this.result.outcome))fail('非法结束状态');const outcome=!this.living('enemy').some(e=>!e.mechanicUnit)?'win':!this.living('ally').length?this.allies.some(a=>a.retreated)?this.allies.some(a=>a.hp<=0)?'escaped_partial':'escaped':'loss':null;if(outcome!==this.result.outcome)fail('伪造胜负');}
      const check=(x,depth=0)=>{if(depth>30)fail('状态嵌套过深');if(typeof x==='number'&&!Number.isFinite(x))fail('非法数值');if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){if(['__proto__','constructor','prototype'].includes(k))fail('非法字段');check(v,depth+1);}};for(const u of all)check(u.status);check(this.log);return true;
    }

  }
  BattleEngine.version='3.0.0-test.4';
  BattleEngine.parameterFingerprint=fingerprint;
  BattleEngine.elements=Object.freeze(['glacio','fusion','electro','aero','spectro','havoc']);
  return BattleEngine;
});
