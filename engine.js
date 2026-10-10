/* Deterministic battle engine for 参数 v0.3.0. No DOM, network, clock, or dependencies.
 * CommonJS: const BattleEngine = require('./engine.js'); browser: window.BattleEngine.
 * Public mutation commands return {ok, reason, events, result}; rejected commands are mutation-free.
 * The current slot is excluded from queue. advance() never executes an enemy attack.
 */
(function (root, factory) {
  const BattleEngine = factory();
  if (typeof module === 'object' && module.exports) module.exports = BattleEngine;
  if (root) root.BattleEngine = BattleEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const round = value => Math.floor(value + 0.5);
  const resourceNames = {sync:'同步率',resonance:'谐振',color:'流彩',calibration:'校准',expectation:'期待',thread:'丝线',primary:'主要资源',dust:'尘微之声',umbra:'暗流',wind:'弦风息',surge:'电涌',energy:'共鸣能量'};
  const statusNames = {fusion:'聚爆',tune:'震谐标记',cutline:'切线',guard:'防御',brace:'架岩',charge:'蓄力',aim:'瞄准',taunt:'挑衅',outro:'延奏增伤',outro_guard:'延奏减伤',umbra:'暗涌',critical:'临界共鸣',status_outro:'异常增幅',counter:'止戈反击',overload:'超负荷',spectro_mark:'微光',wind_mark:'风蚀',barrier:'护盾',rend:'裂伤',exposed:'暴露'};
  const own = (o,k) => !!o && Object.prototype.hasOwnProperty.call(o,k);
  const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

  class BattleEngine {
    constructor(params, options = {}) {
      if (!params || !params.characters || !params.enemies || !params.encounters || !params.generic_skills) throw new Error('缺少完整战斗参数');
      this.params = clone(params);
      const team = options.team || ['amy','lynae','mornye'];
      if (!Array.isArray(team) || team.length < 1 || team.length > 4 || new Set(team).size !== team.length || team.some(k => !own(params.characters,k))) throw new Error('队伍必须由 1–4 名不重复的有效角色组成');
      const encounter = options.encounter || 'normal';
      const enemyKeys = Array.isArray(encounter) ? encounter : own(params.encounters,encounter) ? params.encounters[encounter] : null;
      if (!Array.isArray(enemyKeys) || enemyKeys.length < 1 || enemyKeys.length > 4 || enemyKeys.some(k => !own(params.enemies,k))) throw new Error('遭遇必须包含 1–4 个有效敌人');
      const level = options.level === undefined ? 20 : options.level;
      if (!Number.isInteger(level) || level < 1 || level > 60) throw new Error('等级必须是 1–60 的整数');
      const hpFraction = options.hp_fraction === undefined ? (options.hpFraction === undefined ? 1 : options.hpFraction) : options.hp_fraction;
      if (!finite(hpFraction,0,1)) throw new Error('初始生命比例必须在 0–1 之间');
      const hpScale = options.enemy_hp_scale === undefined ? 1 : options.enemy_hp_scale;
      const atkScale = options.enemy_atk_scale === undefined ? 1 : options.enemy_atk_scale;
      if (!finite(hpScale,0.001,1000) || !finite(atkScale,0,1000)) throw new Error('敌方缩放参数无效');
      const difficulty=options.difficulty===undefined?'standard':options.difficulty;
      if(!own(params.difficulties,difficulty))throw new Error('未知难度');
      const preset=params.difficulties[difficulty];
      if(options.auto_concerto!==undefined&&typeof options.auto_concerto!=='boolean')throw new Error('自动协奏选项必须为布尔值');
      this.options = clone({...options,team,encounter,level,hp_fraction:hpFraction,difficulty,auto_concerto:!!options.auto_concerto});
      this.allies = team.map((key,slot) => this._unit(key,'ally',slot,level,hpFraction));
      this.enemies = enemyKeys.map((key,slot) => this._unit(key,'enemy',slot,level,1));
      for (const a of this.allies) {
        a.mode = (options.mode || options.modes || {})[a.key] || a.mode_default || null;
        if(a.key==='rover'){const kit=a.mode_kits[a.mode];if(!kit)throw new Error('漂泊者属性无效');Object.assign(a,clone(kit));a.rsc=Object.fromEntries(Object.keys(a.resources).map(k=>[k,0]));a.mastery=Object.fromEntries(Object.entries(a.skills).map(([k,v])=>[k,v.mastery_initial||0]));}
        if (a.mode_options && !a.mode_options.includes(a.mode)) throw new Error(`${a.name}的模式无效`);
        if (options.initialHP && options.initialHP[a.key] !== undefined) {
          if (!finite(options.initialHP[a.key],0,a.maxhp)) throw new Error('继承生命值无效');
          a.hp = Math.floor(options.initialHP[a.key]);
        }
        a.dead = a.hp === 0;
        if(a.dead){a.ap=0;a.temp_ap=0;a.relay_pending=false;a.concerto=0;a.rsc=Object.fromEntries(Object.keys(a.rsc).map(k=>[k,0]));a.status={};a.overdrive=false;a.form=a.form_start||'normal';}
      }
      for (const e of this.enemies) {
        const hp=round(e.maxhp*hpScale*preset.hp_multiplier);if(hp<1)throw new Error('敌方生命缩放后必须至少为 1');
        e.hp=e.maxhp=hp;e.atk=round(e.atk*atkScale*preset.attack_multiplier);
        e.shield=e.maxshield=e.rank==='common'?0:Math.max(1,e.maxshield+preset.shield_offset);
        if(e.phase2_shield)e.phase2_shield=Math.max(1,e.phase2_shield+preset.shield_offset);
        if(e.difficulty_patterns)e.pattern=clone(e.difficulty_patterns[difficulty]);
      }
      this.inventory=clone(params.test_inventory);
      this.round=0;this.queue=[];this._currentId=null;this.result=null;this.log=[];
      this.field_until=0;this.count={};this.actions={};this.enemy_actions={};
      this.action_id=0;this.shield_budgets={};this.active_action=false;this.action_break_snapshot={};
      this.started=false;this.policy=options.policy || 'tactical';this.stochastic=!!options.stochastic;
      this.rngState=(Number(options.seed || 0)>>>0) || 0x6d2b79f5;
      this.start_hp=this.allies.reduce((n,a)=>n+a.hp,0);
    }
    _unit(key,side,slot,level,hpFraction) {
      const u=clone(this.params[side==='ally'?'characters':'enemies'][key]);
      Object.assign(u,{key,side,slot,id:`${side}:${slot}:${key}`,level});
      for (const stat of ['hp','atk','def']) u[stat]=round(u[stat]*(stat==='hp'?0.5+0.025*level:0.6+0.02*level));
      Object.assign(u,{maxhp:u.hp,hp:round(u.hp*hpFraction),rsc:Object.fromEntries(Object.keys(u.resources || {}).map(k=>[k,0])),concerto:0,form:u.form_start || 'normal',overdrive:false,broken_until:0,recovery_lock:false,status:{},pattern_i:0,phase:1,phase_pending:false,normal_count:0,concerto_round:0,intro_round:0,intro_received:0,dead:false,retreated:false,wait_round:0,revealed:false,phase_attack_pending:false,acted_round:0});
      Object.assign(u,{ap:side==='ally'?this.params.rules.ap_start:0,temp_ap:0,relay_pending:false,window_actions:0,window_skills:{},concerto_gain_round:0,skip_round:0,part:null});u.concerto=side==='ally'?this.params.rules.concerto_start:0;u.shield=u.shield||0;u.maxshield=u.shield || 0;u.mastery=Object.fromEntries(Object.entries(u.skills).map(([k,s])=>[k,s.mastery_initial || 0]));
      return u;
    }
    get current() {return this.getUnit(this._currentId);}
    get currentId() {return this._currentId;}
    getUnit(id) {if (id && typeof id==='object') id=id.id;return this.allies.concat(this.enemies).find(u=>u.id===id) || null;}
    living(side) {return (side==='ally'?this.allies:this.enemies).filter(u=>u.hp>0&&!u.retreated);}
    has(unit,status) {return !!unit && Object.prototype.hasOwnProperty.call(unit.status,status);}
    isweak() {return false;} // Legacy API: universal weaknesses are removed.
    getSkill(actor,key) {
      const a=this.getUnit(actor);if (!a) return null;
      const original=own(a.skills,key)?a.skills[key]:(a.side==='ally'&&own(this.params.generic_skills,key)?this.params.generic_skills[key]:null);
      if (!original) return null;
      const s=clone(original);if (s.form_overrides && s.form_overrides[a.form]) Object.assign(s,clone(s.form_overrides[a.form]));
      return s;
    }
    _bump(key,n=1,bucket=this.count) {bucket[key]=(bucket[key]||0)+n;}
    _record(event,data={},message='') {const row={id:this.log.length+1,round:this.round,event,message,...data};this.log.push(row);return row;}
    _random() {let x=this.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;this.rngState=x>>>0;return this.rngState/4294967296;}
    _reject(reason) {return {ok:false,reason,events:[],result:this.result};}
    _reply(start) {return {ok:true,reason:'',events:this.log.slice(start),result:this.result};}
    _status(u,key,value) {u.status[key]=value;this._record('status',{target:u.id,status:key,value:clone(value)},`${u.name}获得${statusNames[key]||key}`);}
    _removeOwnedMarkers(a) {for(const t of this.enemies) for(const key of ['tune','taunt','spectro_mark','wind_mark','fusion']) if(t.status[key]&&t.status[key].owner===a.id) delete t.status[key];}
    _resource(u,key,value) {if(key==='primary')key=u.primary;if(!Object.prototype.hasOwnProperty.call(u.resources||{},key))return 0;const before=u.rsc[key]||0;u.rsc[key]=Math.min(u.resources[key],Math.max(0,before+value));return u.rsc[key]-before;}
    _gainConcerto(u,value,source) {
      if(u.hp<=0||u.retreated||value<=0)return 0;
      const before=u.concerto,remaining=Math.max(0,this.params.rules.concerto_gain_cap_per_round-u.concerto_gain_round);
      u.concerto=Math.min(100,before+Math.min(remaining,value));const gain=u.concerto-before;u.concerto_gain_round+=gain;
      if(gain)this._record('concerto_gain',{actor:u.id,amount:gain,before,after:u.concerto,source},`${u.name}个人协奏 +${gain}（${u.concerto}/100；本轮${u.concerto_gain_round}/40）`);
      if(before<100&&u.concerto===100){this._bump('concerto_ready');this._record('concerto_ready',{actor:u.id,amount:100},`${u.name}协奏已满，可在本人付费动作后发动延奏并结束窗口`);}return gain;
    }
    _cleanse(a,t){let n=0;for(const key of ['rend','exposed'])if(this.has(t,key)){delete t.status[key];n++;this._record('cleanse',{actor:a.id,target:t.id,status:key},`${a.name}净化${t.name}的${statusNames[key]}`);}this._bump('cleansed',n);return n;}
    queuePreview(){const ids=this.living('ally').concat(this.living('enemy')).sort((a,b)=>b.speed-a.speed||(a.side===b.side?0:a.side==='ally'?-1:1)||a.slot-b.slot).map(u=>u.id);return {currentId:this.currentId,remainingIds:this.queue.filter(id=>{const u=this.getUnit(id);return u&&u.hp>0&&!u.retreated&&u.acted_round!==this.round;}),nextPreview:{ids,certainty:'conditional',reason:'按本轮固定速度预计；击倒、撤离、共振击破跳过改变可行动者，新增AP不会插队。'}};}
    describeStatus(unit,key){const u=this.getUnit(unit),v=u?.status[key];if(!v)return null;const texts={umbra:'下两次普攻系数+50%，每次仍支付2AP',critical:'下两次普攻附带0.25系数导电雷陨；无免费资源',rend:'治疗量×0.75；治疗/净化消耗AP与个人资源',exposed:'下一次受击伤害+15%；可净化，受击后消耗',tune:'另一队友的可触发技能命中：标记归属者0.35倍异常伤害，行动者+5主资源；不削共振',cutline:'敌攻击力×0.85；受到异常伤害+25%',brace:'所受伤害×0.7，主体首次直接受击反击一次；1AP佯攻可解除',charge:'已投入窗口蓄力；下一敌方窗口兑现；可共振打断/处理部件/提前防守',aim:'已锁定队友；下次射击兑现；后续挑衅不能改人',guard:'到下次本人窗口开始前伤害减半',outro:'接收者下一本人窗口全部直接动作增伤，到该窗口结束',outro_guard:'下一次受击伤害×0.85；最晚接收窗口末过期',status_outro:'下一次本人归属异常伤害+25%；最晚接收窗口末过期',barrier:'吸收伤害；刷新取高值不叠加',fusion:'累计3层触发0.6倍异常伤害',counter:'下一次受到主体直接攻击时承伤×0.6并反击一次；不插入正式窗口',overload:'队伍超负荷：当前和下轮直接伤害+10%',spectro_mark:'微光：该目标下一次受到衍射技能追加0.25系数伤害；不返资源',wind_mark:'风蚀：在该敌正式窗口末造成归属者0.2系数气动伤害；最多2层'};let detail=texts[key]||'';const owner=this.getUnit(v.owner);if(owner&&u.side==='enemy'&&['fusion','tune','wind_mark'].includes(key)){const el=key==='fusion'?'fusion':key==='wind_mark'?'aero':owner.element,coef=key==='fusion'?.6:key==='tune'?.35:.2*v.n;detail+=`；当前预计${this.previewPacket(owner,u,coef,el,true)}点${this.params.elements[el]}伤害，归属${owner.name}（不含未来状态变化）`;}return {name:statusNames[key]||key,description:detail,expires:v.expires,remainingRounds:Number.isFinite(v.expires)?Math.max(0,v.expires-this.round):null,...clone(v)};}

    _kill(u) {
      if(u.hp>0||u.dead)return;
      if(this.has(u,'charge')||this.has(u,'aim')){this._bump('charge_cancelled_ko');this._record('charge_cancelled',{actor:u.id,reason:'incapacitated'},`${u.name}失能，准备中的强攻取消`);}
      u.hp=0;u.dead=true;u.status={};u.temp_ap=0;u.relay_pending=false;u.ap=0;u.part=null;u.concerto=0;u.rsc=Object.fromEntries(Object.keys(u.rsc).map(k=>[k,0]));u.overdrive=false;u.form=u.form_start||'normal';
      this._removeOwnedMarkers(u);this._record('incapacitated',{unit:u.id,target:u.id},`${u.name}失去战斗能力`);this._bump('ko_'+u.side);
    }
    _heal(a,t,scale,flat) {
      if(t.hp<=0||t.retreated||this.policy==='no_healing')return 0;
      const value=Math.floor((a[a.damage_stat||'atk']*scale+flat*(0.6+0.02*a.level))*(this.has(t,'rend')?.75:1));
      const actual=Math.min(value,t.maxhp-t.hp),before=t.hp;t.hp+=actual;this._bump('heal',actual);
      this._record('heal',{actor:a.id,target:t.id,amount:actual,hp_before:before,hp_after:t.hp},`${a.name}为${t.name}恢复 ${actual} 点生命`);return actual;
    }
    _damage(a,t,coef,{amp=0,status_damage=false,element=null,joint=false}={}) {
      if(a.hp<=0||a.retreated||t.hp<=0||t.retreated)return 0;
      const damageElement=element||a.element;if((t.immune_elements||[]).includes(damageElement)){this._record('immune',{actor:a.id,target:t.id,element:damageElement,amount:0},`${t.name}免疫${this.params.elements[damageElement]||damageElement}伤害`);return 0;}
      let source=a[a.damage_stat||'atk'];if(a.side==='enemy'&&a.phase===2)source*=a.phase2_attack_multiplier||1;if(this.has(a,'cutline'))source*=0.85;
      const k=120+4*a.level;let mit=1;
      if(this.has(t,'guard'))mit*=0.5;if(this.has(t,'counter'))mit*=.6;if(this.has(t,'brace'))mit*=0.7;if(t.side==='ally'&&this.field_until>=this.round)mit*=0.8;
      if(this.has(t,'outro_guard')){mit*=0.85;delete t.status.outro_guard;}if(!this.has(t,'guard'))mit=Math.max(this.has(t,'counter')?(this.params.rules.counter_mitigation_floor??.6):this.params.rules.non_guard_mitigation_floor,mit);
      if(status_damage&&!joint&&this.has(t,'cutline'))amp+=0.25;
      if(status_damage&&!joint&&this.has(a,'status_outro')){amp+=a.status.status_outro.amp;delete a.status.status_outro;}
      if(this.has(t,'exposed')){mit*=1.15;delete t.status.exposed;this._bump('exposed_hits');}
      let broken=t.broken_until>=this.round&&t.broken_until>0;
      if(this.active_action&&a.side==='ally'&&Object.prototype.hasOwnProperty.call(this.action_break_snapshot,t.id))broken=this.action_break_snapshot[t.id];
      const factor=this.stochastic?0.95+0.1*this._random():1;
      let raw=Math.max(1,Math.floor(source*coef*k/(k+t.def)*((t.resist||{})[element||a.element]??1)*(1+Math.min(0.5,amp))*mit*factor));
      let absorbed=0;if(this.has(t,'barrier')){absorbed=Math.min(raw,t.status.barrier.amount);raw-=absorbed;t.status.barrier.amount-=absorbed;this._bump('absorbed',absorbed);if(t.status.barrier.amount<=0)delete t.status.barrier;}
      const before=t.hp,actual=Math.min(t.hp,raw);t.hp-=actual;this._bump('damage_'+a.side,actual);
      const unamplified=Math.max(1,Math.floor(source*coef*k/(k+t.def)*((t.resist||{})[element||a.element]??1)*mit*factor));
      const ampBenefit=Math.max(0,raw+absorbed-unamplified);
      const withoutMitigation=Math.max(1,Math.floor(source*coef*k/(k+t.def)*((t.resist||{})[element||a.element]??1)*(1+Math.min(0.5,amp))*factor));
      const prevented=t.side==='ally'?Math.max(0,withoutMitigation-(raw+absorbed))+absorbed:0;
      if(a.side==='ally'&&ampBenefit){this._bump('buff_bonus_damage',ampBenefit);this._record('buff_used',{actor:a.id,target:t.id,kind:status_damage?'status_amplifier':'damage_amplifier',amount:ampBenefit},`增益为${a.name}本段伤害提供约 ${ampBenefit} 点收益`);}
      if(this.has(a,'cutline')&&a.side==='enemy'){const cutBenefit=Math.max(0,Math.floor((raw+absorbed)/.85)-(raw+absorbed));this._bump('cutline_prevented',cutBenefit);this._record('buff_used',{actor:a.id,target:t.id,kind:'cutline_attack_reduction',amount:cutBenefit},`切线压低敌方伤害约 ${cutBenefit} 点`);}
      if(prevented){this._bump('mitigation_prevented',prevented);this._record('buff_used',{actor:a.id,target:t.id,kind:'mitigation',amount:prevented},`${t.name}的防护避免约 ${prevented} 点伤害`);}

      this._record('damage',{actor:a.id,target:t.id,amount:actual,absorbed,coefficient:coef,status_damage,damage_source:joint?'joint':status_damage?'status':'direct',broken_bonus:false,hp_before:before,hp_after:t.hp,element:element||a.element,amp_applied:Math.min(.5,amp),mitigation:mit,buff_bonus:ampBenefit,prevented},`${a.name}${status_damage?'的异常效果':''}对${t.name}造成 ${actual} 点伤害${absorbed?`（护盾吸收 ${absorbed}）`:''}`);
      if(t.key==='crownless'&&t.phase===1&&t.hp>0&&t.hp<=t.maxhp*(t.phase_hp_fraction||0.6)&&!t.phase_pending){t.phase_pending=true;this._record('phase_pending',{unit:t.id,target:t.id},`${t.name}准备展翼；下次阶段切换不会增加行动`);}
      this._kill(t);if(t.hp>0&&a.side==='enemy'&&t.side==='ally'&&!status_damage&&this.has(t,'counter')){delete t.status.counter;this._damage(t,a,.55,{status_damage:true});this._bump('rover_counters');}return actual;
    }
    _cancelCharge(t,reason,actor) {
      if(!this.has(t,'charge')&&!this.has(t,'aim'))return false;
      const pending=t.pattern[t.pattern_i%t.pattern.length];
      if(['rush','spin','descent','aimed'].includes(pending))t.pattern_i++;
      delete t.status.charge;delete t.status.aim;t.part=null;
      this._bump('charge_interrupts');this._record('charge_interrupted',{actor:actor?.id||null,target:t.id,skill:pending,reason},`${t.name}准备的${t.skills[pending]?.name||'强攻'}被${reason}取消`);return true;
    }
    _jointAttack(t) {
      const team=this.living('ally');if(!team.length||t.hp<=0)return;
      const coefficient=(this.params.rules.joint_attack_reference_coefficient||.72)/team.length;let total=0;
      for(const ally of team)if(t.hp>0)total+=this._damage(ally,t,coefficient,{joint:true});
      this._bump('joint_attacks');this._bump('joint_damage',total);
      this._record('joint_attack',{target:t.id,actors:team.map(a=>a.id),amount:total,reference_budget:80},`联合攻击共造成${total}伤害；80为200主属性/目标160DEF/中性抗性的总参考预算，无额外资源`);
    }
    _shieldDamage(a,t,points) {
      if(t.hp<=0||t.maxshield===0||t.shield===0||t.broken_until>=this.round&&t.broken_until>0)return 0;
      const key=`${this.action_id}|${t.id}`,remaining=Math.max(0,points-(this.shield_budgets[key]||0));
      const actual=Math.max(0,Math.min(remaining,t.shield)),before=t.shield;t.shield-=actual;
      this.shield_budgets[key]=(this.shield_budgets[key]||0)+actual;this._bump('shield_removed',actual);
      if(actual)this._record('shield',{actor:a.id,target:t.id,amount:actual,shield_before:before,shield_after:t.shield},`${t.name}共振 −${actual}`);
      if(t.shield===0){
        t.skip_round=t.acted_round===this.round?this.round+1:this.round;t.broken_until=t.skip_round;t.recovery_lock=false;
        this._cancelCharge(t,'共振击破',a);delete t.status.brace;t.part=null;
        this._bump('breaks');this._record('break',{actor:a.id,target:t.id,until:t.broken_until,skip_round:t.skip_round},`${t.name}共振击破！取消准备并跳过第${t.skip_round}轮的一个窗口，不附加易伤`);
        this._jointAttack(t);
      }return actual;
    }
    _damagePart(a,t,s) {
      const part=t.part;if(!part||part.hp<=0)return 0;
      const element=a.element;if((t.immune_elements||[]).includes(element))return 0;
      const k=120+4*a.level,raw=Math.max(1,Math.floor(a[a.damage_stat||'atk']*s.part_coefficient*k/(k+t.def)*((t.resist||{})[element]??1)));
      const actual=Math.min(part.hp,raw);part.hp-=actual;this._bump('part_damage',actual);
      this._record('part_damage',{actor:a.id,target:t.id,part:part.name,amount:actual,hp_after:part.hp},`${a.name}对${t.name}的${part.name}造成${actual}部件伤害（主体未受伤）`);
      if(part.hp===0){part.destroyed=true;this._bump('parts_destroyed');this._record('part_destroyed',{actor:a.id,target:t.id,part:part.name,effect:part.effect},`${part.name}被拆解：${part.effect==='cancel'?'本次危险技取消':'本次危险技伤害降至45%'}`);if(part.effect==='cancel')this._cancelCharge(t,'拆解锚点',a);}
      return actual;
    }
    _addMode(a,t,count=1) {
      if(t.hp<=0)return;
      if(a.mode==='fusion'){const n=(t.status.fusion?.n||0)+count;if(n>=3){delete t.status.fusion;this._damage(a,t,this.params.rules.fusion_packet_coefficient||.9,{status_damage:true,element:'fusion'});this._bump('fusion_procs');}else this._status(t,'fusion',{n,owner:a.id,expires:this.round+3});}
      else if(a.mode==='tune'||a.mode==='strain')this._status(t,'tune',{owner:a.id,expires:this.round+1});
    }
    start() {
      if(this.started)return [];
      const from=this.log.length;this.started=true;
      this._record('start',{team:this.allies.map(a=>a.id),enemies:this.enemies.map(e=>e.id)},'遭遇开始：个人资源0，普通AP4，协奏20');
      if(!this._checkResult())this.advance();return this.log.slice(from);
    }
    _beginRound() {
      this.round++;this.shield_budgets={};this._record('round',{number:this.round},`第 ${this.round} 回合`);
      for(const u of this.allies.concat(this.enemies)){
        if(u.side==='ally'){u.concerto_gain_round=0;u.window_actions=0;u.window_skills={};if(this.round>1&&u.hp>0&&!u.retreated){const before=u.ap;u.ap=Math.min(6,u.ap+4);this._bump('ap_recovery_overflow',Math.max(0,before+4-6));this._record('ap_gain',{actor:u.id,before,after:u.ap,amount:u.ap-before},`${u.name}普通AP ${before}→${u.ap}（+4，上限6）`);}}
        for(const [key,value] of Object.entries(u.status))if(!value.window_bound&&(value.expires??this.round)<this.round){delete u.status[key];this._record('status_expired',{target:u.id,status:key},`${u.name}的${statusNames[key]||key}结束`);}
        if(u.side==='enemy'&&u.hp>0){
          if(u.broken_until&&u.broken_until<this.round){u.broken_until=0;u.shield=u.maxshield;u.recovery_lock=false;u.skip_round=0;this._record('recover',{unit:u.id,target:u.id,shield:u.shield,recovery_lock:u.recovery_lock},`${u.name}恢复 ${u.shield} 点共振，无恢复硬保护`);}
          if(u.phase_pending&&!u.broken_until){u.phase=2;u.phase_pending=false;u.maxshield=u.phase2_shield;u.shield=Math.min(u.shield,u.maxshield);u.phase_attack_pending=true;this._bump('phase_changes');this._record('phase',{unit:u.id,target:u.id,phase:2},`${u.name}进入第二阶段；展翼震荡替换下一次普通行动`);}
        }
      }
      this.queue=this.living('ally').concat(this.living('enemy')).sort((a,b)=>b.speed-a.speed||(a.side===b.side?0:a.side==='ally'?-1:1)||a.slot-b.slot).map(u=>u.id);
    }
    advance() {
      if(!this.started||this.result)return null;
      if(this.current&&this.current.hp>0&&!this.current.retreated&&this.current.acted_round!==this.round)return this.current;
      this._currentId=null;
      while(!this._checkResult()){
        if(!this.queue.length)this._beginRound();
        const u=this.getUnit(this.queue.shift());if(!u||u.hp<=0||u.retreated||u.acted_round===this.round)continue;
        if(u.side==='enemy'&&u.skip_round===this.round){u.acted_round=this.round;this._bump('skipped_enemy_actions');this._record('skip',{actor:u.id,reason:'broken'},`${u.name}共振击破，跳过本轮窗口`);continue;}
        this._currentId=u.id;
        if(u.side==='ally'){u.window_actions=0;u.window_skills={};delete u.status.guard;delete u.status.counter;}
        this._record('turn',{actor:u.id,side:u.side},`轮到${u.name}行动`);return u;
      }
      return null;
    }
    _finish(a) {if(a.side==='ally'){if(a.temp_ap)this._bump('temp_ap_wasted',a.temp_ap);a.temp_ap=0;a.relay_pending=false;for(const k of ['outro','outro_guard','status_outro'])delete a.status[k];this._record('window_end',{actor:a.id,ap:a.ap,paid_actions:a.window_actions},`${a.name}结束窗口，保留${a.ap}普通AP`);}a.acted_round=this.round;this._currentId=null;this._checkResult();if(!this.result)this.advance();this.validate();}
    _checkResult() {
      if(this.result)return this.result;
      const allies=this.living('ally'),enemies=this.living('enemy');
      if(enemies.length&&allies.length)return null;
      const escaped=this.allies.filter(a=>a.retreated).length,ko=this.allies.filter(a=>a.hp===0).length;
      const outcome=!enemies.length?'win':escaped?(ko?'escaped_partial':'escaped'):'loss';
      this.result={...this.summary(),outcome};this._currentId=null;this.queue=[];
      this._record('result',{outcome},({win:'战斗胜利',loss:'战斗失败',escaped:'全员撤离',escaped_partial:'存活队员撤离，部分队员已失去战斗能力'})[outcome]);return this.result;
    }
    _windowReason(a) {
      if(!this.started)return '战斗尚未开始';if(this.result)return '战斗已结束';if(!a||a.side!=='ally')return '请选择我方角色';
      if(a.hp<=0)return '角色已失去战斗能力';if(a.retreated)return '角色已撤离';if(!this.current||this.current.id!==a.id)return '尚未轮到该角色';if(a.acted_round===this.round)return '本回合窗口已结束';return '';
    }
    _targets(a,s) {
      if(s.target==='self')return a.hp>0&&!a.retreated?[a.id]:[];
      const side=['ally','all_allies','other_ally'].includes(s.target)?'ally':'enemy';
      return this.living(side).filter(t=>(s.target!=='other_ally'||t.id!==a.id)&&(!s.effect||s.effect!=='feint'||this.has(t,'brace'))&&(s.effect!=='part'||t.part&&t.part.hp>0)&&(s.effect!=='enemy_specific'||this._canTaunt(t))).map(t=>t.id);
    }
    _canTaunt(t) {return t.hp>0&&!this.has(t,'charge')&&!this.has(t,'aim')&&t.skills&&Object.values(t.skills).some(s=>s.coef>0&&!s.aoe);}
    _skillReason(a,key,s) {
      if(!s)return '未知技能';if(s.item&&(this.inventory[s.item]||0)<1)return '本场测试库存已用完';if(key==='negotiate')return '此测试遭遇没有可协商的敌人';
      if(a.ap+a.temp_ap<(s.ap_cost||0))return `AP不足：需要${s.ap_cost}，当前${a.ap}+${a.temp_ap}`;
      if(s.once_per_window&&a.window_skills[key])return '本窗口已使用一次该支援技能';
      if(s.mode_required&&a.mode!==s.mode_required)return '当前属性不可使用';
      if(s.concerto_cost&&a.concerto<s.concerto_cost)return `协奏不足：此技能还需${s.concerto_cost}协奏`;
      if(a.key==='amy'){
        if(key==='overdrive'&&(a.overdrive||a.rsc.resonance!==0))return '需要未启动星辉，且谐振为 0';
        if(key==='heavy'&&a.rsc.resonance!==4)return '需要 4 点谐振';
        if(key==='finale'&&(a.rsc.sync!==200||a.rsc.resonance!==4))return '需要 200 同步率与 4 点谐振';
      }
      if(a.key==='denia'){
        if(['stage','breakdown'].includes(key)&&a.form!=='red')return '仅红形态可用';
        if(['blue','curtain'].includes(key)&&a.form!=='blue')return '仅蓝形态可用';
      }
      for(const [resource,cost] of Object.entries(s.cost||{}))if((a.rsc[resource]||0)<cost)return `${resourceNames[resource]||resource}不足：需要 ${cost}，当前 ${a.rsc[resource]||0}`;
      if(!this._targets(a,s).length)return s.target==='other_ally'?'需要另一名在场队友':'没有合法目标';return '';
    }
    validateAction(actor,key,target) {
      const a=this.getUnit(actor),window=this._windowReason(a);if(window)return window;
      const s=this.getSkill(a,key),reason=this._skillReason(a,key,s);if(reason)return reason;
      if(key==='wait')return '';
      const t=this.getUnit(target);if(!t||t.hp<=0||t.retreated)return '目标不存在、已失去战斗能力或已撤离';
      if(!this._targets(a,s).includes(t.id))return s.target==='self'?'该指令只能对自己使用':s.target==='other_ally'?'需要选择另一名队友':'目标阵营不符合技能要求';return '';
    }
    availableActions(actorId) {
      const a=this.getUnit(actorId||this._currentId);if(!a||a.side!=='ally')return [];
      return [...Object.keys(a.skills),...Object.keys(this.params.generic_skills).filter(k=>!own(a.skills,k))].map(key=>{
        const s=this.getSkill(a,key),reason=this._windowReason(a)||this._skillReason(a,key,s);
        const mastery=(1+0.02*(a.mastery[key]??s.mastery_reference??0))/(1+0.02*(s.mastery_reference||0));
        const healScale=s.heal_scale||s.team_heal_scale||0,healFlat=s.heal_flat||s.team_heal_flat||0;
        const healingPreview=healScale?{amount:Math.floor((a[a.damage_stat||'atk']*healScale+healFlat*(.6+.02*a.level))*mastery),level:a.level,before_target_debuff:true,mastery_multiplier:mastery}:null;
        const effectSummary=(s.effectSummary||s.description||'')+(healingPreview?` 当前等级/熟练预计恢复${healingPreview.amount}生命/人（受裂伤时×0.75；不超过缺失生命）。`:'');
        const category=s.category||(key==='basic'?'battle':'skills'),targetText=({self:'自己',ally:'单名在场队友',other_ally:'另一名在场队友',all_allies:'全体在场队友'})[s.target]||(s.aoe?'全体在场敌人':'单名在场敌人');
        return {...s,key,name:s.name,category,enabled:!reason,ready:!reason,reason,targets:key==='wait'?[a.id]:key==='negotiate'?[]:this._targets(a,s),cost:s.cost||{},gain:s.gain||{},aoe:!!s.aoe,normal_action_consumed:!!s.ends_window,apCost:s.ap_cost||0,resonanceDamage:s.resonance_damage||0,oncePerWindow:!!s.once_per_window,damagePreview:this.living('enemy').map(t=>this.previewDamage(a,key,t)),targetText,resourceCost:s.cost||{},resourceGain:s.gain||{},concertoGain:s.concerto||0,shieldDamage:s.resonance_damage||0,effectSummary,description:effectSummary,healingPreview,durationText:s.durationText||'即时',cooldownText:s.cooldownText||'无冷却',inventoryCount:s.item?this.inventory[s.item]:null};
      });
    }
    previewPacket(a,t,coefficient,element=a.element,status=false) {
      if((t.immune_elements||[]).includes(element))return 0;
      const k=120+4*a.level;let source=a[a.damage_stat||'atk']*(this.has(a,'cutline')?.85:1)*(a.side==='enemy'&&a.phase===2?(a.phase2_attack_multiplier||1):1),amp=0,mit=(this.has(t,'guard')?.5:1)*(this.has(t,'brace')?.7:1)*(this.has(t,'counter')?.6:1)*(t.side==='ally'&&this.field_until>=this.round?.8:1)*(this.has(t,'outro_guard')?.85:1);
      if(!this.has(t,'guard'))mit=Math.max(this.has(t,'counter')?(this.params.rules.counter_mitigation_floor??.6):this.params.rules.non_guard_mitigation_floor,mit);
      if(this.has(t,'exposed'))mit*=1.15;
      if(status)amp=(this.has(t,'cutline')?.25:0)+(a.status.status_outro?.amp||0);
      return Math.max(1,Math.floor(source*coefficient*k/(k+t.def)*((t.resist||{})[element]??1)*(1+Math.min(.5,amp))*mit));
    }
    previewDamage(actor,key,target) {
      const a=this.getUnit(actor),t=this.getUnit(target),s=this.getSkill(a,key);if(!a||!t||!s)return null;
      const elem=s.element||a.element,immune=(t.immune_elements||[]).includes(elem),k=120+4*a.level;
      const mastery=(1+.02*(a.mastery[key]??0))/(1+.02*(s.mastery_reference||0));
      const coefficient=(s.part_coefficient||s.coef||0)*(key==='basic'&&this.has(a,'umbra')?1.5:1),amp=Math.min(.5,(this.field_until>=this.round?.15:0)+(a.status.outro?.amp||0)+(this.has(a,'overload')?.1:0)+(s.damage_class==='liberation'?(a.status.outro?.liberation_extra||0):0));
      const mitigation=s.part_coefficient?1:(this.has(t,'brace')?.7:1);
      const amount=immune?0:coefficient>0?Math.max(1,Math.floor(a[a.damage_stat||'atk']*coefficient*mastery*k/(k+t.def)*((t.resist||{})[elem]??1)*(1+(s.part_coefficient?0:amp))*mitigation)):0;
      return {target:t.id,amount,element:elem,immune,part:!!s.part_coefficient,resonance:s.resonance_damage||0,deterministic:!this.stochastic,description:immune?'同属性免疫':s.part_coefficient?'仅部件，不伤主体':'直接伤害；不包含后续异常/联合'};
    }
    wait() {return this.end();}
    end() {return this.act('end',this.currentId);}
    act(key,targetId) {
      if(key==='wait')key='end';
      const a=this.current,reason=this.validateAction(a,key,targetId||a?.id);if(reason)return this._reject(reason);
      const t=this.getUnit(targetId||a.id),from=this.log.length,s=this.getSkill(a,key),cost=s.ap_cost||0;
      const temp=Math.min(a.temp_ap,cost);a.temp_ap-=temp;a.ap-=cost-temp;
      if(cost){a.window_actions++;a.window_skills[key]=(a.window_skills[key]||0)+1;this._bump('ap_spent',cost);this._bump('temp_ap_spent',temp);if(s.heal_scale||s.heal_fraction)this._bump('healing_ap',cost);this._record('ap_spent',{actor:a.id,skill:key,amount:cost,temporary:temp,normal:cost-temp,ap_after:a.ap,temp_ap_after:a.temp_ap},`${a.name}支付${cost}AP（临时${temp}），剩余${a.ap}+${a.temp_ap}`);this._actAlly(a,key,t);a.normal_count++;}
      if(s.ends_window||a.hp<=0||a.retreated)this._finish(a);
      else {this._checkResult();if(!this.result&&a.ap+a.temp_ap===0&&!this.availableConcertos().some(c=>c.actor===a.id&&c.enabled))this._finish(a);else this.validate();}
      return this._reply(from);
    }
    _actAlly(a,key,t) {
      this.action_id++;this.active_action=true;this.action_break_snapshot=Object.fromEntries(this.enemies.map(e=>[e.id,e.broken_until>=this.round&&e.broken_until>0]));
      const s=this.getSkill(a,key),mastery=(1+0.02*(a.mastery[key]??s.mastery_reference??0))/(1+0.02*(s.mastery_reference||0));
      s.coef*=mastery;if(key==='basic'&&this.has(a,'umbra'))s.coef*=1.5;for(const field of ['heal_scale','heal_flat','team_heal_scale','team_heal_flat'])if(s[field]!==undefined)s[field]*=mastery;
      let targets=s.aoe?this.living('enemy').slice():[t];if(s.target==='all_allies')targets=this.living('ally').slice();
      this._record('action',{actor:a.id,skill:key,skill_name:s.name,target:t.id,targets:targets.map(x=>x.id),resources_before:clone(a.rsc),form:a.form},`${a.name}使用「${s.name}」${targets.length===1?` → ${t.name}`:'（全体）'}`);
      for(const [k,v] of Object.entries(s.cost||{}))this._resource(a,k,-v);if(s.concerto_cost)a.concerto-=s.concerto_cost;if(s.item){this.inventory[s.item]--;this._record('item_used',{actor:a.id,target:t.id,item:s.item,remaining:this.inventory[s.item]},`${a.name}使用${s.name}，本场剩余 ${this.inventory[s.item]}`);}
      let effective=0,amp=(this.field_until>=this.round?0.15:0)+(this.has(a,'overload')?.1:0),actionBuff=0,teamworkGranted=false;
      if(s.coef>0&&this.has(a,'outro')){const buff=a.status.outro;actionBuff=buff.amp+(s.damage_class==='liberation'?(buff.liberation_extra||0):0);}
      amp+=actionBuff;
      for(const target of targets){
        if(a.hp<=0||a.retreated)break;
        if(s.cleanse)effective+=this._cleanse(a,target);
        if(s.heal_fraction){const value=Math.floor(target.maxhp*s.heal_fraction*(this.has(target,'rend')?.75:1)),actual=Math.min(value,target.maxhp-target.hp),before=target.hp;target.hp+=actual;effective+=actual;this._bump('heal',actual);this._record('heal',{actor:a.id,target:target.id,amount:actual,hp_before:before,hp_after:target.hp,item:true},`${s.name}为${target.name}恢复 ${actual} 生命`);}
        if(s.heal_scale){effective+=this._heal(a,target,s.heal_scale,s.heal_flat);if(s.barrier){const amount=Math.min(s.barrier,Math.floor(target.maxhp*0.25)),old=target.status.barrier?.amount||0;this._status(target,'barrier',{amount:Math.max(old,amount),expires:this.round+1});effective+=Math.max(0,amount-old);}}
        else if(s.coef>0){
          const retaliation=this.has(target,'brace')&&!target.status.brace.used;
          const tune=target.status.tune;let extra=0;if(tune&&tune.owner!==a.id&&s.tune_trigger){delete target.status.tune;extra=1;}
          const glow=this.has(target,'spectro_mark')&&a.element==='spectro';if(glow)delete target.status.spectro_mark;
          effective+=this._damage(a,target,s.coef,{amp});if(glow&&target.hp>0)this._damage(a,target,.25,{status_damage:true});if(key==='basic'&&this.has(a,'critical')&&target.hp>0)this._damage(a,target,.25,{status_damage:true,element:'electro'});this._shieldDamage(a,target,s.resonance_damage||0);
          if(extra&&target.hp>0){if(!teamworkGranted){const supplied=this._resource(a,'primary',5);teamworkGranted=true;this._bump('teamwork_resource',supplied);this._record('teamwork',{actor:a.id,target:target.id,owner:tune.owner,resource:a.primary,amount:supplied},`${a.name}接力震谐，${resourceNames[a.primary]} +${supplied}（每行动一次）`);}const owner=this.getUnit(tune.owner);if(owner&&owner.hp>0&&!owner.retreated){this._damage(owner,target,0.35,{status_damage:true});this._bump('tune_procs');}}
          if(s.effect==='tune'&&target.hp>0)this._status(target,'tune',{owner:a.id,expires:this.round+1});
          if(s.effect==='cutline'&&target.hp>0)this._status(target,'cutline',{actions:2,expires:this.round+3});
          if(['reveal','reveal_tune'].includes(s.effect)&&target.hp>0){if(s.effect==='reveal_tune')this._status(target,'tune',{owner:a.id,expires:this.round+1});target.revealed=true;this._record('reveal',{actor:a.id,target:target.id},`${target.name}的属性抗性已记录`);}
          if(s.applies_mode)this._addMode(a,target,a.key==='denia'&&a.form==='blue'?2:1);
          if(retaliation&&target.hp>0&&this.has(target,'brace')&&!(target.broken_until>=this.round)){target.status.brace.used=true;this._damage(target,a,0.8);this._bump('retaliations');}
        }
      }
      if(a.hp<=0||a.retreated){this._record('action_end',{actor:a.id,skill:key,resources_after:clone(a.rsc),concerto:a.concerto,form:a.form,interrupted_by_ko:true},`${a.name}失去战斗能力，取消本招剩余效果`);this._bump(key,1,this.actions);this.active_action=false;this.action_break_snapshot={};return;}
      if(s.team_heal_scale)for(const target of this.living('ally'))effective+=this._heal(a,target,s.team_heal_scale,s.team_heal_flat);
      if(s.effect==='field'){effective+=this.field_until<this.round+1?1:0;this.field_until=this.round+1;this._record('field',{actor:a.id,until:this.field_until},`星界定标持续至第 ${this.field_until} 回合结束：我方伤害 +15%，所受伤害 ×0.8`);}
      if(key==='guard')this._status(a,'guard',{expires:this.round+1,window_bound:true});
      if(s.effect==='feint'){delete t.status.brace;this._record('feint',{actor:a.id,target:t.id},`${a.name}花1AP卸去${t.name}架岩，无伤害或资源收益`);}
      if(s.effect==='part')this._damagePart(a,t,s);
      if(s.effect==='umbra')this._status(a,'umbra',{charges:2,expires:this.round+3});
      if(s.effect==='critical')this._status(a,'critical',{charges:2,expires:this.round+3});
      if(key==='basic')for(const mode of ['umbra','critical'])if(this.has(a,mode)){a.status[mode].charges--;if(!a.status[mode].charges)delete a.status[mode];}
      if(s.effect==='counter'){effective++;this._status(a,'counter',{expires:this.round+1,window_bound:true});}
      if(s.effect==='overload'){for(const ally of this.living('ally'))this._status(ally,'overload',{expires:this.round+1});effective++;}
      if(s.effect==='spectro_mark'&&t.hp>0)this._status(t,'spectro_mark',{owner:a.id,expires:this.round+2});
      if(s.effect==='wind_mark'&&t.hp>0)this._status(t,'wind_mark',{owner:a.id,n:Math.min(2,(t.status.wind_mark?.n||0)+1),expires:this.round+2});
      if(key==='taunt'){if(!this.has(t,'taunt')||t.status.taunt.owner!==a.id)effective++;this._status(t,'taunt',{owner:a.id,expires:this.round+2});}
      if(key==='retreat'){a.retreated=true;a.status={};a.temp_ap=0;a.relay_pending=false;a.ap=0;a.concerto=0;a.rsc=Object.fromEntries(Object.keys(a.rsc).map(k=>[k,0]));a.form=a.form_start||'normal';a.overdrive=false;this._removeOwnedMarkers(a);this._record('retreat',{actor:a.id},`${a.name}撤离，保留剩余生命并清空战斗资源`);}
      if(a.hp>0&&!a.retreated){
        if(effective>0){for(const [k,v] of Object.entries(s.gain||{}))this._resource(a,k,v);this._gainConcerto(a,s.concerto||0,key);}
        const before=a.form;
        if(key==='overdrive'){a.overdrive=true;a.form='mech';}if(a.key==='amy'&&key==='enhanced')a.form=a.form==='human'?'mech':'human';
        if(key==='finale'){a.overdrive=false;a.form='human';this._bump('finales');}
        if(key==='breakdown')a.form='blue';if(key==='curtain'){a.form='red';a.rsc.expectation=0;}
        if(a.key==='denia'&&a.form==='blue'&&a.rsc.expectation<20){a.form='red';a.rsc.expectation=0;}
        if(before!==a.form)this._record('form',{actor:a.id,from:before,to:a.form},`${a.name}切换为${{human:'人形',mech:'机兵',red:'红形态',blue:'蓝形态'}[a.form]||a.form}`);
      }
      this._record('action_end',{actor:a.id,skill:key,resources_after:clone(a.rsc),concerto:a.concerto,form:a.form},`${a.name}行动结束`);
      this._bump(key,1,this.actions);this.active_action=false;this.action_break_snapshot={};
    }
    validateConcerto(actor,target) {
      const a=this.getUnit(actor),t=this.getUnit(target),reason=this._windowReason(a);if(reason)return reason;
      if(a.window_actions<1)return '需要先在本人窗口完成至少一个付费动作';
      if(a.concerto<100)return `协奏能量不足：需要100，当前${a.concerto}`;
      if(a.concerto_round===this.round)return '该角色本轮已发动延奏';
      if(!t||t.side!=='ally'||t.hp<=0||t.retreated)return '请选择仍在场的队友';
      if(a.id===t.id)return '延奏不能指定自己';
      if(t.relay_pending)return '该队友已有待接续，不能叠加或刷新';return '';
    }
    availableConcertos() {return this.allies.map(a=>{const targets=this.living('ally').filter(t=>t.id!==a.id&&!t.relay_pending).map(t=>t.id),reason=this.validateConcerto(a,targets[0]);return {actor:a.id,name:a.name,enabled:!reason,ready:!reason,reason,targets,cost:100,effectSummary:`本人窗口末消耗100协奏并结束。接收者临时AP+2、下一本人窗口所有直接动作+${Math.round(a.outro.amp*100)}%伤害；${a.key==='lynae'?'解放额外+10%；':a.key==='mornye'?'下一次受击×0.85；':['denia','chisa'].includes(a.key)?'下一次本人异常+25%；':''}临时AP优先用，窗口末过期，不插队。`,durationText:'到接收者下一本人窗口结束；特殊一次性增益按描述消耗',normal_action_consumed:true};});}
    concerto(actorId,targetId,options={}) {
      const reason=this.validateConcerto(actorId,targetId);if(reason)return this._reject(reason);
      const from=this.log.length,a=this.getUnit(actorId),t=this.getUnit(targetId);a.concerto-=100;a.concerto_round=this.round;t.temp_ap=2;t.relay_pending=true;
      this._status(t,'outro',{amp:a.outro.amp,liberation_extra:a.outro.special==='liberation_extra_0.1_within_global_cap'?.1:0,expires:this.round+1,window_bound:true});
      if(a.outro.special==='next_mode_status_damage_x1.25')this._status(t,'status_outro',{amp:.25,expires:this.round+1,window_bound:true});
      if(a.key==='mornye')this._status(t,'outro_guard',{expires:this.round+1,window_bound:true});
      this._bump('concerto');this._bump(options.automatic?'automatic_concertos':'manual_concertos');this._bump('temp_ap_generated',2);
      this._record('concerto',{actor:a.id,target:t.id,amp:a.outro.amp,intro_gain:0,temp_ap:2,trigger:options.automatic?'automatic':'manual'},`${a.name}延奏给${t.name}：临时2AP及专属增益，来源窗口结束；不改变顺位`);
      this._finish(a);return this._reply(from);
    }
    _enemyTarget(a,random=true) {
      const alive=this.living('ally');if(!alive.length)return null;
      if(this.has(a,'aim')||this.has(a,'charge'))return alive.find(u=>u.id===(a.status.aim||a.status.charge).target)||alive.slice().sort((x,y)=>x.slot-y.slot)[0];
      if(this.has(a,'taunt')){const locked=alive.find(u=>u.id===a.status.taunt.owner);if(locked)return locked;}
      if(this.params.difficulties[this.options.difficulty].targeting==='lowest_fraction'&&a.rank!=='common')return alive.slice().sort((x,y)=>x.hp/x.maxhp-y.hp/y.maxhp||x.slot-y.slot)[0];
      if(this.stochastic&&random)return alive[Math.floor(this._random()*alive.length)];
      return alive[(a.normal_count+a.slot)%alive.length];
    }
    _enemySkill(a) {
      let key=a.phase_attack_pending&&!this.has(a,'charge')?'wingpulse':a.pattern[a.pattern_i%a.pattern.length];
      if(['rush','spin','descent'].includes(key)&&!this.has(a,'charge'))key=a.basic_key||a.pattern[0];if(key==='aimed'&&!this.has(a,'aim'))key='shot';
      return {key,skill:a.skills[key]};
    }
    enemyIntent(actorId) {
      const a=this.getUnit(actorId||this._currentId);if(!a||a.side!=='enemy'||a.hp<=0)return null;
      const {key,skill:s}=this._enemySkill(a),target=this._enemyTarget(a,false),committed=this.has(a,'charge')||this.has(a,'aim'),visible=committed||this.has(a,'brace')||a.phase_attack_pending;
      if(a.phase_pending&&!committed)return {actor:a.id,hidden:false,dangerous:true,phaseWarning:true,key:'wingpulse',name:'阶段预警·展翼震荡',aoe:true,coefficient:a.skills.wingpulse.coef,targets:this.living('ally').map(u=>u.id),committed:true,skipped:a.skip_round===this.round,description:'下轮进入第二阶段，以展翼震荡替换一次正常窗口；已承诺蓄力会先兑现。',effectSummary:'阶段群攻预警，未增加敌方窗口。',telegraphText:'下一轮开始转阶段；慢速队友现在可提前防御，快速队友也可下轮先应对。',counterplayText:'每人1AP防御并关窗；定标场/护盾/减攻花AP与个人资源；共振击破可延后该窗口。',costText:'替换一次敌方窗口',part:null};
      if(!visible)return {actor:a.id,hidden:true,key:null,name:'常规意图隐藏',targets:[],aoe:false,committed:false,skipped:a.skip_round===this.round,description:'常规招式与目标不提前公开；危险准备后会显示征兆。',effectSummary:'常规意图隐藏',part:null};
      const warning=committed?s:a.skills.brace||s;
      return {actor:a.id,hidden:false,dangerous:true,key:committed||a.phase_attack_pending?key:'brace',name:committed||a.phase_attack_pending?s.name:'架岩反击姿态',aoe:!!s.aoe,coefficient:s.coef,effect:s.effect||null,targets:committed?(s.aoe?this.living('ally').map(u=>u.id):target?[target.id]:[]):[],uncertain:false,skipped:a.skip_round===this.round,description:warning.effectSummary,effectSummary:warning.effectSummary,telegraphText:committed?'下次本人窗口兑现；已锁定，不受后续挑衅影响':warning.telegraphText,counterplayText:warning.counterplayText,costText:'消耗一次敌方窗口',durationText:'到下一次敌方窗口',chargeTurnsRemaining:committed?1:null,committed,part:a.part?clone(a.part):null};
    }
    stepEnemy() {
      if(!this.started)return this._reject('战斗尚未开始');if(this.result)return this._reject('战斗已结束');const a=this.current;
      if(!a||a.side!=='enemy')return this._reject('当前不是敌方行动');
      const from=this.log.length;if(a.skip_round===this.round){this._record('skip',{actor:a.id,reason:'broken'},`${a.name}共振击破，跳过窗口`);this._bump('skipped_enemy_actions');this._finish(a);return this._reply(from);}
      const {key,skill:s}=this._enemySkill(a);if(key==='wingpulse')a.phase_attack_pending=false;else a.pattern_i++;delete a.status.brace;
      const targets=s.aoe?this.living('ally').slice():[this._enemyTarget(a)];
      this.action_id++;this._record('enemy_action',{actor:a.id,skill:key,skill_name:s.name,target:targets[0]?.id,targets:targets.map(t=>t.id)},`${a.name}使用「${s.name}」${s.aoe?'（全体）':` → ${targets[0].name}`}`);
      if(s.coef){const amp=this.has(a,'taunt')&&!s.aoe?0.15:0;for(const t of targets){if(a.hp<=0||a.retreated)break;this._damage(a,t,s.coef*(a.part?.destroyed&&a.part.effect==='weaken'?a.part.damage_multiplier:1),{amp});}if(!s.aoe)delete a.status.taunt;}
      if(a.hp<=0||a.retreated){this._record('enemy_action_end',{actor:a.id,skill:key,interrupted_by_ko:true},`${a.name}被反击击倒，取消本招剩余目标与附加效果`);a.normal_count++;this._bump(key,1,this.enemy_actions);this._finish(a);return this._reply(from);}
      if(s.effect==='charge'&&a.part_spec){a.part={...clone(a.part_spec),hp:a.part_spec.maxhp,destroyed:false};this._record('part_exposed',{actor:a.id,target:a.id,part:clone(a.part)},`${a.name}暴露${a.part.name}（${a.part.hp}HP），2AP攻击部件不伤主体/不产资源`);}
      if(['aim','charge','brace'].includes(s.effect))this._status(a,s.effect,{expires:this.round+2,target:targets[0].id});
      if(['aim','charge'].includes(s.effect)){this._bump('charge_warnings');const next=a.pattern[a.pattern_i%a.pattern.length];this._record('charge_started',{actor:a.id,target:targets[0].id,targets:a.skills[next]?.aoe?this.living('ally').map(u=>u.id):[targets[0].id],skill:next,resolve_after_enemy_actions:1},`${a.name}预告「${a.skills[next]?.name||next}」：下次行动兑现，破防可打断，防御可减半`);}
      if(['rush','spin','descent','aimed'].includes(key)){this._bump('charge_releases');this._record('charge_released',{actor:a.id,skill:key,targets:targets.map(t=>t.id)},`${a.name}的蓄力兑现为「${s.name}」`);}
      if(['rend','expose'].includes(s.effect))for(const t of targets)if(t.hp>0)this._status(t,s.effect==='expose'?'exposed':'rend',{expires:this.round+1});
      if(['rush','spin','descent'].includes(key)){delete a.status.charge;a.part=null;}if(key==='aimed')delete a.status.aim;
      if(this.has(a,'cutline')){a.status.cutline.actions--;if(a.status.cutline.actions<=0)delete a.status.cutline;}
            if(this.has(a,'wind_mark')){const mark=a.status.wind_mark,owner=this.getUnit(mark.owner);if(owner&&owner.hp>0)this._damage(owner,a,.2*mark.n,{status_damage:true,element:'aero'});}
      a.recovery_lock=false;a.normal_count++;this._bump(key,1,this.enemy_actions);this._finish(a);return this._reply(from);
    }
    _selectTarget(a) {return this.living('enemy').slice().sort((x,y)=>(x.immune_elements||[]).includes(a.element)-(y.immune_elements||[]).includes(a.element)||x.hp-y.hp)[0];}
    _choose(a) {
      const actions=this.availableActions(a.id).filter(s=>s.enabled&&!['retreat','negotiate'].includes(s.key)),es=this.living('enemy'),t=this._selectTarget(a);
      const legal=(key,target=t)=>actions.some(s=>s.key===key&&s.targets.includes(target?.id));
      if(this.policy==='random_legal'){const choices=actions.flatMap(s=>s.targets.map(id=>[s.key,this.getUnit(id)]));return choices[Math.floor(this._random()*choices.length)];}
      if(this.policy==='basic_only')return legal('basic')?['basic',t]:['end',a];
      const danger=es.find(e=>this.enemyIntent(e)?.committed),worst=this.living('ally').slice().sort((x,y)=>(y.maxhp-y.hp)-(x.maxhp-x.hp))[0];
      if(!['no_healing','no_dedicated_heal'].includes(this.policy)&&worst.maxhp-worst.hp>=250){for(const key of ['heal','restore','mend'])if(legal(key,worst))return [key,worst];}
      if(danger&&this.policy!=='offense_only'){
        if(this.policy==='mechanism'&&legal('disrupt_part',danger))return ['disrupt_part',danger];
        if(this.policy==='mechanism'&&this.enemyIntent(danger).phaseWarning&&legal('guard',a))return ['guard',a];
        if(this.policy==='defensive'&&this.enemyIntent(danger).targets.includes(a.id)&&legal('guard',a))return ['guard',a];
        if(legal('disrupt_part',danger)&&danger.part.hp<=Math.floor(a[a.damage_stat||'atk']*.9*(120+4*a.level)/(120+4*a.level+danger.def)))return ['disrupt_part',danger];
        const intent=this.enemyIntent(danger);
        if(intent.targets.includes(a.id)&&a.hp/a.maxhp<.6&&legal('guard',a))return ['guard',a];
      }
      if(t&&this.has(t,'brace')&&legal('feint',t))return ['feint',t];
      if(this.policy!=='no_teamwork'&&legal('field',a)&&this.field_until<this.round)return ['field',a];
      if(a.key==='lynae'){
        if(this.policy==='break_focus'&&legal('skate'))return ['skate',t];
        if((this.policy==='break_focus'||danger&&t.shield<=48)&&legal('survey'))return ['survey',t];
        if(legal('spectrum'))return ['spectrum',t];
      }
      const order=['finale','liberation','curtain','breakdown','blue','chainsaw','release','enhanced','heavy','overdrive','skill','cut','basic'];
      for(const key of order)if(legal(key))return [key,t];
      return ['end',a];
    }
    autoAction() {
      if(!this.started)this.start();if(this.result)return this._reject('战斗已结束');if(this.current.side==='enemy')return this.stepEnemy();
      const a=this.current;
      if(this.options.auto_concerto&&!['no_concerto','no_teamwork'].includes(this.policy)&&a.window_actions>0&&a.concerto>=100){const choice=this.availableConcertos().find(c=>c.actor===a.id&&c.enabled);if(choice)return this.concerto(a.id,choice.targets[0],{automatic:true});}
      const choice=this._choose(a);if(!choice)return this.end();return this.act(choice[0],choice[1].id);
    }
    summary() {return {difficulty:this.options.difficulty,first_concerto_ready_round:this.log.find(e=>e.event==='concerto_ready')?.round||null,min_hp_fraction:Object.fromEntries(this.allies.map(a=>[a.key,Math.round(Math.min(this.options.initialHP?.[a.key]??round(a.maxhp*this.options.hp_fraction),a.hp,...this.log.filter(e=>e.target===a.id&&Number.isFinite(e.hp_after)).map(e=>e.hp_after))/a.maxhp*10000)/10000])),inventory:clone(this.inventory),outcome:this.result?.outcome||'inconclusive',rounds:this.round,ally_hp_fraction:Math.round(this.allies.reduce((n,a)=>n+a.hp,0)/this.allies.reduce((n,a)=>n+a.maxhp,0)*10000)/10000,survivors:this.living('ally').length,escaped_count:this.allies.filter(a=>a.retreated).length,ko_count:this.allies.filter(a=>a.hp===0).length,counts:clone(this.count),skills:clone(this.actions),enemy_skills:clone(this.enemy_actions),final_resources:Object.fromEntries(this.allies.map(a=>[a.key,clone(a.rsc)])),final_concerto:Object.fromEntries(this.allies.map(a=>[a.key,a.concerto])),final_ap:Object.fromEntries(this.allies.map(a=>[a.key,{normal:a.ap,temporary:a.temp_ap}])),first_break_round:this.log.find(e=>e.event==='break')?.round||null,enemy_effective_actions:this.log.filter(e=>e.event==='enemy_action'&&this.getUnit(e.actor)?.skills[e.skill]?.coef>0).length};}
    validate() {
      const ids=new Set();for(const u of this.allies.concat(this.enemies)){
        if(ids.has(u.id)||!finite(u.hp,0,u.maxhp)||!finite(u.concerto,0,100))throw new Error('战斗状态越界');ids.add(u.id);
        for(const [k,v] of Object.entries(u.rsc))if(!finite(v,0,(u.resources||{})[k]))throw new Error('资源越界');
        if(u.side==='enemy'&&!finite(u.shield,0,u.maxshield))throw new Error('共振越界');
        if(u.side==='ally'&&(!Number.isInteger(u.ap)||!finite(u.ap,0,6)||!Number.isInteger(u.temp_ap)||!finite(u.temp_ap,0,2)||u.temp_ap>0&&!u.relay_pending||!finite(u.concerto_gain_round,0,40)))throw new Error('AP/协奏资格越界');
      }
      if(new Set(this.queue).size!==this.queue.length||this.queue.some(id=>!ids.has(id))||this._currentId&&(!ids.has(this._currentId)||this.queue.includes(this._currentId)))throw new Error('行动队列无效');return true;
    }
    snapshot() {
      const state={};for(const k of ['options','allies','enemies','round','queue','_currentId','result','log','field_until','count','actions','enemy_actions','action_id','shield_budgets','active_action','action_break_snapshot','started','policy','stochastic','rngState','start_hp','inventory'])state[k]=clone(this[k]);
      return {schema:'battle-engine-v2-ap',parameter_version:this.params.schema_version,state};
    }
    static restore(params,snapshot) {
      if(!snapshot||snapshot.schema!=='battle-engine-v2-ap'||snapshot.parameter_version!==params.schema_version||!snapshot.state)throw new Error('存档格式或参数版本不匹配');
      const s=clone(snapshot.state),b=new BattleEngine(params,s.options),fail=()=>{throw new Error('存档状态无效或与当前参数不符');};
      const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
      const equal=(a,c)=>JSON.stringify(a)===JSON.stringify(c);
      const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
      const keysEqual=(a,c)=>plain(a)&&plain(c)&&equal(Object.keys(a).sort(),Object.keys(c).sort());
      const expectedKeys=Object.keys(b.snapshot().state);
      if(!keysEqual(s,b.snapshot().state)||!int(s.round)||!Array.isArray(s.allies)||!Array.isArray(s.enemies)||!Array.isArray(s.queue)||!Array.isArray(s.log)||typeof s.started!=='boolean'||s.active_action!==false||!plain(s.action_break_snapshot)||Object.keys(s.action_break_snapshot).length)fail();
      if(!int(s.action_id)||!int(s.rngState,0,0xffffffff)||!int(s.field_until,0,s.round+1)||!finite(s.start_hp,0,b.allies.reduce((n,a)=>n+a.maxhp,0))||typeof s.stochastic!=='boolean'||s.stochastic!==b.stochastic||s.policy!==b.policy)fail();
      for(const bucket of [s.count,s.actions,s.enemy_actions,s.shield_budgets])if(!plain(bucket)||Object.values(bucket).some(v=>!int(v)))fail();
      if(Object.values(s.shield_budgets).some(v=>v>1000))fail();
      if(!keysEqual(s.inventory,b.inventory)||Object.entries(s.inventory).some(([k,v])=>!int(v,0,b.inventory[k])))fail();
      const mutable=new Set(['hp','rsc','concerto','form','overdrive','broken_until','recovery_lock','status','pattern_i','phase','phase_pending','normal_count','concerto_round','intro_round','intro_received','dead','retreated','wait_round','revealed','phase_attack_pending','acted_round','maxshield','shield','mastery','ap','temp_ap','relay_pending','window_actions','window_skills','concerto_gain_round','skip_round','part']);
      for(const side of ['allies','enemies']){
        if(s[side].length!==b[side].length)fail();
        s[side].forEach((u,i)=>{
          const original=b[side][i];if(!keysEqual(u,original))fail();
          // Source definitions and stats are rebuilt from verified parameters, never trusted from a save.
          for(const key of Object.keys(original))if(!mutable.has(key)&&!equal(u[key],original[key]))fail();
          if(!int(u.hp,0,original.maxhp)||!int(u.concerto,0,100)||!keysEqual(u.rsc,original.rsc)||Object.entries(u.rsc).some(([k,v])=>!int(v,0,original.resources[k])))fail();
          for(const key of ['overdrive','recovery_lock','phase_pending','dead','retreated','revealed','phase_attack_pending'])if(typeof u[key]!=='boolean')fail();
          if(u.dead!==(u.hp===0)||u.retreated&&u.hp===0)fail();
          if(!int(u.ap,0,u.side==='ally'?6:0)||!int(u.temp_ap,0,u.side==='ally'?2:0)||typeof u.relay_pending!=='boolean'||u.temp_ap>0&&!u.relay_pending||!int(u.window_actions,0,8)||!plain(u.window_skills)||Object.entries(u.window_skills).some(([k,v])=>!own(u.skills,k)&&!own(params.generic_skills,k)||!int(v,1,8))||Object.values(u.window_skills).reduce((n,v)=>n+v,0)!==u.window_actions||!int(u.concerto_gain_round,0,40)||!int(u.skip_round,0,s.round+1))fail();
          if(u.side==='ally'&&(u.relay_pending!==!!u.status.outro||u.status.outro&&!u.status.outro.window_bound))fail();
          for(const [key,n] of Object.entries(u.window_skills)){const skill=b.getSkill(original,key);if(!skill||!skill.ap_cost||skill.once_per_window&&n>1)fail();}
          if(!int(u.normal_count,0,s.round*8)||!int(u.pattern_i,0,s.round*3+4)||!int(u.broken_until,0,s.round+1)||![1,2].includes(u.phase))fail();
          for(const key of ['concerto_round','intro_round','wait_round','acted_round'])if(!int(u[key],0,s.round))fail();
          if(!int(u.intro_received,0,20)||!keysEqual(u.mastery,original.mastery)||Object.values(u.mastery).some(v=>!int(v,0,5)))fail();
          const forms=u.key==='amy'?['human','mech']:u.key==='denia'?['red','blue']:[original.form_start||'normal'];
          if(!forms.includes(u.form)||u.key!=='amy'&&u.overdrive||!plain(u.status))fail();
          if(u.dead||u.retreated){if(u.ap||u.temp_ap||u.relay_pending||Object.keys(u.status).length||u.concerto||Object.values(u.rsc).some(Boolean)||u.overdrive||u.form!==(original.form_start||'normal'))fail();}
          if(u.side==='enemy'){
            if(u.part!==null){if(!plain(u.part)||!u.part_spec||!equal(Object.keys(u.part).sort(),[...Object.keys(u.part_spec),'hp','destroyed'].sort())||Object.keys(u.part_spec).some(k=>!equal(u.part[k],u.part_spec[k]))||!int(u.part.hp,0,u.part.maxhp)||typeof u.part.destroyed!=='boolean'||u.part.destroyed!==(u.part.hp===0)||!u.status.charge)fail();}
            if(u.phase===2&&u.key!=='crownless'||u.maxshield!==(u.phase===2?original.phase2_shield:original.maxshield)||!int(u.shield,0,u.maxshield))fail();
            if(u.hp>0&&u.broken_until>0&&(u.broken_until<s.round||u.shield!==0||u.skip_round!==u.broken_until)||u.recovery_lock)fail();
          }else if(u.part!==null||u.skip_round!==0||u.maxshield!==0||u.broken_until!==0||u.recovery_lock||u.phase!==1||u.phase_pending||u.phase_attack_pending)fail();
          b[side][i]={...original,...Object.fromEntries([...mutable].filter(k=>own(u,k)).map(k=>[k,u[k]]))};
        });
      }
      const all=b.allies.concat(b.enemies),ids=new Set(all.map(u=>u.id)),allyIds=new Set(b.allies.map(u=>u.id));
      const statusRules={rend:{side:'ally',fields:['expires'],duration:1},exposed:{side:'ally',fields:['expires'],duration:1},fusion:{side:'enemy',fields:['n','owner','expires'],duration:3},tune:{side:'enemy',fields:['owner','expires'],duration:1},cutline:{side:'enemy',fields:['actions','expires'],duration:3},guard:{side:'ally',fields:['expires','window_bound'],duration:1},brace:{side:'enemy',fields:['expires','target','used'],duration:2},charge:{side:'enemy',fields:['expires','target'],duration:2},aim:{side:'enemy',fields:['expires','target'],duration:2},taunt:{side:'enemy',fields:['owner','expires'],duration:2},outro:{side:'ally',fields:['amp','liberation_extra','expires','window_bound'],duration:1},outro_guard:{side:'ally',fields:['expires','window_bound'],duration:1},status_outro:{side:'ally',fields:['amp','expires','window_bound'],duration:2},umbra:{side:'ally',fields:['charges','expires'],duration:3},critical:{side:'ally',fields:['charges','expires'],duration:3},counter:{side:'ally',fields:['expires','window_bound'],duration:1},overload:{side:'ally',fields:['expires'],duration:1},spectro_mark:{side:'enemy',fields:['owner','expires'],duration:2},wind_mark:{side:'enemy',fields:['owner','n','expires'],duration:2},barrier:{side:'ally',fields:['amount','expires'],duration:1}};
      for(const u of all)for(const [key,value] of Object.entries(u.status)){
        const rule=own(statusRules,key)?statusRules[key]:null;
        if(!rule||rule.side!==u.side||!plain(value)||Object.keys(value).some(k=>!rule.fields.includes(k))||!int(value.expires,value.window_bound?Math.max(0,s.round-1):s.round,s.round+rule.duration))fail();
        if(own(value,'window_bound')&&value.window_bound!==true)fail();
        if(['tune','taunt','spectro_mark','wind_mark','fusion'].includes(key)&&(!allyIds.has(value.owner)||!b.living('ally').some(a=>a.id===value.owner)))fail();
        if(['aim','charge','brace'].includes(key)&&!allyIds.has(value.target))fail();
        if(key==='brace'&&own(value,'used')&&typeof value.used!=='boolean')fail();
        if(['umbra','critical'].includes(key)&&!int(value.charges,1,2))fail();
        if(key==='wind_mark'&&!int(value.n,1,2))fail();
        if(key==='fusion'&&!int(value.n,1,2)||key==='cutline'&&!int(value.actions,1,2)||key==='barrier'&&!int(value.amount,1,Math.floor(u.maxhp*0.25)))fail();
        if(key==='outro'&&(!finite(value.amp,0,0.25)||![0,0.1].includes(value.liberation_extra)))fail();
        if(key==='status_outro'&&value.amp!==0.25)fail();
      }
      // Copy only the known state fields, keeping reconstructed unit definitions.
      for(const key of expectedKeys)if(!['allies','enemies'].includes(key))b[key]=s[key];
      b.validate();
      if(!s.started){if(s.round!==0||s._currentId!==null||s.queue.length||s.result!==null||s.log.length)fail();}
      else if(s.result){
        if(!plain(s.result)||!['win','loss','escaped','escaped_partial'].includes(s.result.outcome)||s._currentId!==null||s.queue.length)fail();
        const alive=b.living('ally').length,enemies=b.living('enemy').length,escaped=b.allies.some(a=>a.retreated),ko=b.allies.some(a=>!a.hp);
        const expected=!enemies?'win':!alive?(escaped?(ko?'escaped_partial':'escaped'):'loss'):null;
        if(expected!==s.result.outcome)fail();
      }else{
        if(s.round<1||!b.living('ally').length||!b.living('enemy').length||!ids.has(s._currentId)||!b.current||b.current.hp<=0||b.current.retreated||b.current.acted_round===s.round)fail();
        if(b.current.side==='enemy'&&b.current.skip_round===s.round)fail();
        for(const u of all){const queued=b.queue.includes(u.id);if(queued&&u.acted_round===s.round)fail();if(u.hp>0&&!u.retreated&&u.acted_round!==s.round&&!queued&&s._currentId!==u.id)fail();}
      }
      if(s.log.some((e,i)=>!plain(e)||e.id!==i+1||!int(e.round,0,s.round)||typeof e.event!=='string'||typeof e.message!=='string'))fail();
      return b;
    }
  }
  BattleEngine.resourceNames=resourceNames;BattleEngine.statusNames=statusNames;
  return BattleEngine;
});
