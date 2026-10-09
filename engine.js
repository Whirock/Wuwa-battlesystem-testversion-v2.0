/* Deterministic battle engine for 参数 v0.2.0. No DOM, network, clock, or dependencies.
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
  const resourceNames = {sync:'同步率',resonance:'谐振',color:'流彩',calibration:'校准',expectation:'期待',thread:'丝线',primary:'主要资源'};
  const statusNames = {fusion:'聚爆',tune:'震谐标记',cutline:'切线',guard:'防御',brace:'架岩',charge:'蓄力',aim:'瞄准',taunt:'挑衅',outro:'延奏增伤',outro_guard:'延奏减伤',status_outro:'异常增幅',encourage:'鼓舞',barrier:'护盾',rend:'裂伤',exposed:'暴露'};
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
        if (a.mode_options && !a.mode_options.includes(a.mode)) throw new Error(`${a.name}的模式无效`);
        if (options.initialHP && options.initialHP[a.key] !== undefined) {
          if (!finite(options.initialHP[a.key],0,a.maxhp)) throw new Error('继承生命值无效');
          a.hp = Math.floor(options.initialHP[a.key]);
        }
        a.dead = a.hp === 0;
      }
      for (const e of this.enemies) {
        const hp=round(e.maxhp*hpScale*preset.hp_multiplier);if(hp<1)throw new Error('敌方生命缩放后必须至少为 1');
        e.hp=e.maxhp=hp;e.atk=round(e.atk*atkScale*preset.attack_multiplier);
        e.shield=e.maxshield=Math.max(1,e.maxshield+(e.rank==='common'?0:preset.shield_offset));
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
      u.maxshield=u.shield || 0;u.mastery=Object.fromEntries(Object.entries(u.skills).map(([k,s])=>[k,s.mastery_initial || 0]));
      return u;
    }
    get current() {return this.getUnit(this._currentId);}
    get currentId() {return this._currentId;}
    getUnit(id) {if (id && typeof id==='object') id=id.id;return this.allies.concat(this.enemies).find(u=>u.id===id) || null;}
    living(side) {return (side==='ally'?this.allies:this.enemies).filter(u=>u.hp>0&&!u.retreated);}
    has(unit,status) {return !!unit && Object.prototype.hasOwnProperty.call(unit.status,status);}
    isweak(actor,target) {const a=this.getUnit(actor)||actor,t=this.getUnit(target)||target;return !!a&&!!t&&((t.weak_elements||[]).includes(a.element)||(t.weak_weapons||[]).includes(a.weapon));}
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
    _removeOwnedMarkers(a) {for(const t of this.enemies) for(const key of ['tune','taunt']) if(t.status[key]&&t.status[key].owner===a.id) delete t.status[key];}
    _resource(u,key,value) {if(key==='primary')key=u.primary;if(!Object.prototype.hasOwnProperty.call(u.resources||{},key))return 0;const before=u.rsc[key]||0;u.rsc[key]=Math.min(u.resources[key],Math.max(0,before+value));return u.rsc[key]-before;}
    _gainConcerto(u,value,source) {
      if(u.hp<=0||u.retreated||value<=0)return 0;
      const before=u.concerto;u.concerto=Math.min(100,u.concerto+Math.min(this.params.rules.concerto_hard_gain_cap_per_normal_action,value));
      const gain=u.concerto-before;if(gain)this._record('concerto_gain',{actor:u.id,amount:gain,before,after:u.concerto,source},`${u.name}个人协奏 +${gain}（${u.concerto}/100）`);
      if(before<100&&u.concerto===100){this._bump('concerto_ready');this._record('concerto_ready',{actor:u.id,amount:100},`${u.name}协奏已满！可在我方行动窗口手动选择接收者，不消耗普通行动`);}return gain;
    }
    _cleanse(a,t){let n=0;for(const key of ['rend','exposed'])if(this.has(t,key)){delete t.status[key];n++;this._record('cleanse',{actor:a.id,target:t.id,status:key},`${a.name}净化${t.name}的${statusNames[key]}`);}this._bump('cleansed',n);return n;}
    queuePreview(){const ids=this.living('ally').concat(this.living('enemy')).sort((a,b)=>b.speed-a.speed||(a.side===b.side?0:a.side==='ally'?-1:1)||a.slot-b.slot).map(u=>u.id);return {currentId:this.currentId,remainingIds:this.queue.filter(id=>{const u=this.getUnit(id);return u&&u.hp>0&&!u.retreated&&u.acted_round!==this.round;}),nextPreview:{ids,certainty:'conditional',reason:'按当前在场角色的固定速度预计；击倒、撤离、破防跳过会改变实际可行动者。'}};}
    describeStatus(unit,key){const u=this.getUnit(unit),v=u?.status[key];if(!v)return null;const texts={rend:'治疗量×0.75；可净化',exposed:'下一次受击伤害+15%；可净化，受击后消耗',tune:'另一队友弱点命中：追加异常伤害、削韧与10主资源',cutline:'敌攻击力×0.85；受到异常伤害+25%',brace:'所受伤害×0.7；非弱点命中反击最多一次',charge:'已投入行动蓄力；下次敌方行动兑现，破防可打断',aim:'已瞄准锁定目标；下次射击兑现，破防可打断',guard:'下次自身行动机会前伤害减半',outro:'下次直接攻击增伤，和鼓舞取高值',outro_guard:'下一次受击伤害×0.85',status_outro:'下一次本人归属的异常伤害+25%',encourage:'下次直接攻击伤害+25%；和延奏取高值',barrier:'吸收伤害，刷新取更高值',fusion:'累计3层触发1.2倍异常伤害'};return {name:statusNames[key]||key,description:texts[key]||'',expires:v.expires,remainingRounds:Math.max(0,v.expires-this.round),...clone(v)};}

    _kill(u) {
      if(u.hp>0||u.dead)return;
      if(this.has(u,'charge')||this.has(u,'aim')){this._bump('charge_cancelled_ko');this._record('charge_cancelled',{actor:u.id,reason:'incapacitated'},`${u.name}失能，准备中的强攻取消`);}
      u.hp=0;u.dead=true;u.status={};u.concerto=0;u.rsc=Object.fromEntries(Object.keys(u.rsc).map(k=>[k,0]));u.overdrive=false;u.form=u.form_start||'normal';
      this._removeOwnedMarkers(u);this._record('incapacitated',{unit:u.id,target:u.id},`${u.name}失去战斗能力`);this._bump('ko_'+u.side);
    }
    _heal(a,t,scale,flat) {
      if(t.hp<=0||t.retreated||this.policy==='no_healing')return 0;
      const value=Math.floor((a[a.damage_stat||'atk']*scale+flat*(0.6+0.02*a.level))*(this.has(t,'rend')?.75:1));
      const actual=Math.min(value,t.maxhp-t.hp),before=t.hp;t.hp+=actual;this._bump('heal',actual);
      this._record('heal',{actor:a.id,target:t.id,amount:actual,hp_before:before,hp_after:t.hp},`${a.name}为${t.name}恢复 ${actual} 点生命`);return actual;
    }
    _damage(a,t,coef,{amp=0,status_damage=false,element=null}={}) {
      if(t.hp<=0||t.retreated)return 0;
      let source=a[a.damage_stat||'atk'];if(a.side==='enemy'&&a.phase===2)source*=a.phase2_attack_multiplier||1;if(this.has(a,'cutline'))source*=0.85;
      const k=120+4*a.level;let mit=1;
      if(this.has(t,'guard'))mit*=0.5;if(this.has(t,'brace'))mit*=0.7;if(t.side==='ally'&&this.field_until>=this.round)mit*=0.8;
      if(this.has(t,'outro_guard')){mit*=0.85;delete t.status.outro_guard;}if(!this.has(t,'guard'))mit=Math.max(0.65,mit);
      if(status_damage&&this.has(t,'cutline'))amp+=0.25;
      if(status_damage&&this.has(a,'status_outro')){amp+=a.status.status_outro.amp;delete a.status.status_outro;}
      if(this.has(t,'exposed')){mit*=1.15;delete t.status.exposed;this._bump('exposed_hits');}
      let broken=t.broken_until>=this.round&&t.broken_until>0;
      if(this.active_action&&a.side==='ally'&&Object.prototype.hasOwnProperty.call(this.action_break_snapshot,t.id))broken=this.action_break_snapshot[t.id];
      const factor=this.stochastic?0.95+0.1*this._random():1;
      let raw=Math.max(1,Math.floor(source*coef*k/(k+t.def)*((t.resist||{})[element||a.element]??1)*(broken?1.5:1)*(1+Math.min(0.5,amp))*mit*factor));
      let absorbed=0;if(this.has(t,'barrier')){absorbed=Math.min(raw,t.status.barrier.amount);raw-=absorbed;t.status.barrier.amount-=absorbed;this._bump('absorbed',absorbed);if(t.status.barrier.amount<=0)delete t.status.barrier;}
      const before=t.hp,actual=Math.min(t.hp,raw);t.hp-=actual;this._bump('damage_'+a.side,actual);
      const unamplified=Math.max(1,Math.floor(source*coef*k/(k+t.def)*((t.resist||{})[element||a.element]??1)*(broken?1.5:1)*mit*factor));
      const ampBenefit=Math.max(0,raw+absorbed-unamplified);
      const withoutMitigation=Math.max(1,Math.floor(source*coef*k/(k+t.def)*((t.resist||{})[element||a.element]??1)*(broken?1.5:1)*(1+Math.min(0.5,amp))*factor));
      const prevented=t.side==='ally'?Math.max(0,withoutMitigation-(raw+absorbed))+absorbed:0;
      if(a.side==='ally'&&ampBenefit){this._bump('buff_bonus_damage',ampBenefit);this._record('buff_used',{actor:a.id,target:t.id,kind:status_damage?'status_amplifier':'damage_amplifier',amount:ampBenefit},`增益为${a.name}本段伤害提供约 ${ampBenefit} 点收益`);}
      if(this.has(a,'cutline')&&a.side==='enemy'){const cutBenefit=Math.max(0,Math.floor((raw+absorbed)/.85)-(raw+absorbed));this._bump('cutline_prevented',cutBenefit);this._record('buff_used',{actor:a.id,target:t.id,kind:'cutline_attack_reduction',amount:cutBenefit},`切线压低敌方伤害约 ${cutBenefit} 点`);}
      if(prevented){this._bump('mitigation_prevented',prevented);this._record('buff_used',{actor:a.id,target:t.id,kind:'mitigation',amount:prevented},`${t.name}的防护避免约 ${prevented} 点伤害`);}

      this._record('damage',{actor:a.id,target:t.id,amount:actual,absorbed,coefficient:coef,status_damage,broken_bonus:broken,hp_before:before,hp_after:t.hp,element:element||a.element,amp_applied:Math.min(.5,amp),mitigation:mit,buff_bonus:ampBenefit,prevented},`${a.name}${status_damage?'的异常效果':''}对${t.name}造成 ${actual} 点伤害${absorbed?`（护盾吸收 ${absorbed}）`:''}`);
      if(t.key==='crownless'&&t.phase===1&&t.hp>0&&t.hp<=t.maxhp*(t.phase_hp_fraction||0.6)&&!t.phase_pending){t.phase_pending=true;this._record('phase_pending',{unit:t.id,target:t.id},`${t.name}准备展翼；下次阶段切换不会增加行动`);}
      this._kill(t);return actual;
    }
    _shieldDamage(a,t,points,universal=false) {
      if(t.hp<=0||!t.shield||(t.broken_until>0&&t.broken_until>=this.round)||(!universal&&!this.isweak(a,t)))return 0;
      // Budget belongs to the whole normal action/target, not the number of animation hits.
      const key=`${this.action_id}|${t.id}`,remaining=3-(this.shield_budgets[key]||0),floor=t.recovery_lock?1:0;
      const actual=Math.max(0,Math.min(remaining,points,t.shield-floor)),before=t.shield;t.shield-=actual;this._bump('shield_removed',actual);this.shield_budgets[key]=(this.shield_budgets[key]||0)+actual;
      if(actual)this._record('shield',{actor:a.id,target:t.id,amount:actual,shield_before:before,shield_after:t.shield},`${t.name}韧性 −${actual}`);
      if(t.shield===0){t.broken_until=this.round+1;if(this.has(t,'charge')||this.has(t,'aim')){const pending=t.pattern[t.pattern_i%t.pattern.length];if(['rush','spin','descent','aimed'].includes(pending))t.pattern_i++;this._bump('charge_interrupts');this._record('charge_interrupted',{actor:a.id,target:t.id,skill:pending},`${t.name}的${t.skills[pending]?.name||'蓄力'}被破防打断！该次强攻取消`);}delete t.status.charge;delete t.status.aim;delete t.status.brace;this._bump('breaks');this._record('break',{actor:a.id,target:t.id,until:t.broken_until},`${t.name}破防！持续至第 ${t.broken_until} 回合结束`);}
      return actual;
    }
    _addMode(a,t,count=1) {
      if(t.hp<=0)return;
      if(a.mode==='fusion'){const n=(t.status.fusion?.n||0)+count;if(n>=3){delete t.status.fusion;this._damage(a,t,this.params.rules.fusion_packet_coefficient||.9,{status_damage:true,element:'fusion'});this._bump('fusion_procs');}else this._status(t,'fusion',{n,expires:this.round+3});}
      else if(a.mode==='tune'||a.mode==='strain')this._status(t,'tune',{owner:a.id,expires:this.round+1});
    }
    start() {
      if(this.started)return [];
      const from=this.log.length;this.started=true;
      this._record('start',{team:this.allies.map(a=>a.id),enemies:this.enemies.map(e=>e.id)},'遭遇开始，所有资源从零开始');
      if(!this._checkResult())this.advance();return this.log.slice(from);
    }
    _beginRound() {
      this.round++;this.shield_budgets={};this._record('round',{number:this.round},`第 ${this.round} 回合`);
      for(const u of this.allies.concat(this.enemies)){
        for(const [key,value] of Object.entries(u.status))if((value.expires??this.round)<this.round){delete u.status[key];this._record('status_expired',{target:u.id,status:key},`${u.name}的${statusNames[key]||key}结束`);}
        if(u.side==='enemy'&&u.hp>0){
          if(u.broken_until&&u.broken_until<this.round){u.broken_until=0;u.shield=u.maxshield;u.recovery_lock=u.rank!=='common';this._record('recover',{unit:u.id,target:u.id,shield:u.shield,recovery_lock:u.recovery_lock},`${u.name}恢复 ${u.shield} 点韧性${u.recovery_lock?'，首次普通行动前韧性最低为 1':''}`);}
          if(u.phase_pending&&!u.broken_until){u.phase=2;u.phase_pending=false;u.maxshield=u.phase2_shield;u.phase_attack_pending=true;this._bump('phase_changes');this._record('phase',{unit:u.id,target:u.id,phase:2},`${u.name}进入第二阶段；展翼震荡替换下一次普通行动`);}
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
        if(u.side==='enemy'&&u.broken_until>=this.round&&u.broken_until>0){u.acted_round=this.round;this._bump('skipped_enemy_actions');this._record('skip',{actor:u.id,reason:'broken'},`${u.name}处于破防，本回合无法行动`);continue;}
        this._currentId=u.id;
        if(u.side==='ally'&&this.has(u,'guard'))delete u.status.guard;
        this._record('turn',{actor:u.id,side:u.side},`轮到${u.name}行动`);return u;
      }
      return null;
    }
    _finish(a) {a.acted_round=this.round;this._currentId=null;this._checkResult();if(!this.result)this.advance();this.validate();}
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
      if(a.hp<=0)return '角色已失去战斗能力';if(a.retreated)return '角色已撤离';if(!this.current||this.current.id!==a.id)return '尚未轮到该角色';if(a.acted_round===this.round)return '本回合已执行普通行动';return '';
    }
    _targets(a,s) {
      if(s.target==='self')return a.hp>0&&!a.retreated?[a.id]:[];
      const side=['ally','all_allies','other_ally'].includes(s.target)?'ally':'enemy';
      return this.living(side).filter(t=>s.target!=='other_ally'||t.id!==a.id).map(t=>t.id);
    }
    _skillReason(a,key,s) {
      if(!s)return '未知技能';if(s.item&&(this.inventory[s.item]||0)<1)return '本场测试库存已用完';if(key==='negotiate')return '此测试遭遇没有可协商的敌人';
      if(key==='wait')return a.wait_round===this.round?'本回合已等待一次':'';
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
      if(!this._targets(a,s).includes(t.id))return s.target==='self'?'该指令只能对自己使用':s.target==='other_ally'?'鼓舞需要选择另一名队友':'目标阵营不符合技能要求';return '';
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
        return {...s,key,name:s.name,category,enabled:!reason,ready:!reason,reason,targets:key==='wait'?[a.id]:key==='negotiate'?[]:this._targets(a,s),cost:s.cost||{},gain:s.gain||{},aoe:!!s.aoe,normal_action_consumed:key!=='wait',targetText,resourceCost:s.cost||{},resourceGain:s.gain||{},concertoGain:s.concerto||0,shieldDamage:s.break_points||0,effectSummary,description:effectSummary,healingPreview,durationText:s.durationText||'即时',cooldownText:s.cooldownText||'无冷却',inventoryCount:s.item?this.inventory[s.item]:null};
      });
    }
    wait() {
      const a=this.current,reason=this.validateAction(a,'wait',a);if(reason)return this._reject(reason);
      const from=this.log.length;a.wait_round=this.round;this.queue.push(a.id);this._currentId=null;this._bump('wait');this._record('wait',{actor:a.id},`${a.name}等待，原行动移至本回合队尾`);this.advance();return this._reply(from);
    }
    act(key,targetId) {
      if(key==='wait')return this.wait();
      const a=this.current,reason=this.validateAction(a,key,targetId);if(reason)return this._reject(reason);
      const t=this.getUnit(targetId),from=this.log.length;this._actAlly(a,key,t);a.normal_count++;this._finish(a);return this._reply(from);
    }
    _actAlly(a,key,t) {
      this.action_id++;this.active_action=true;this.action_break_snapshot=Object.fromEntries(this.enemies.map(e=>[e.id,e.broken_until>=this.round&&e.broken_until>0]));
      const s=this.getSkill(a,key),mastery=(1+0.02*(a.mastery[key]??s.mastery_reference??0))/(1+0.02*(s.mastery_reference||0));
      s.coef*=mastery;for(const field of ['heal_scale','heal_flat','team_heal_scale','team_heal_flat'])if(s[field]!==undefined)s[field]*=mastery;
      let targets=s.aoe?this.living('enemy').slice():[t];if(s.target==='all_allies')targets=this.living('ally').slice();
      this._record('action',{actor:a.id,skill:key,skill_name:s.name,target:t.id,targets:targets.map(x=>x.id),resources_before:clone(a.rsc),form:a.form},`${a.name}使用「${s.name}」${targets.length===1?` → ${t.name}`:'（全体）'}`);
      for(const [k,v] of Object.entries(s.cost||{}))this._resource(a,k,-v);if(s.item){this.inventory[s.item]--;this._record('item_used',{actor:a.id,target:t.id,item:s.item,remaining:this.inventory[s.item]},`${a.name}使用${s.name}，本场剩余 ${this.inventory[s.item]}`);}
      let effective=0,amp=this.field_until>=this.round?0.15:0,actionBuff=0,teamworkGranted=false;
      if(s.coef>0&&this.has(a,'outro')){const buff=a.status.outro;delete a.status.outro;actionBuff=buff.amp+(s.damage_class==='liberation'?(buff.liberation_extra||0):0);}
      if(s.coef>0&&this.has(a,'encourage')){actionBuff=Math.max(actionBuff,a.status.encourage.amp);delete a.status.encourage;}amp+=actionBuff;
      for(const target of targets){
        if(s.cleanse)effective+=this._cleanse(a,target);
        if(s.heal_fraction){const value=Math.floor(target.maxhp*s.heal_fraction*(this.has(target,'rend')?.75:1)),actual=Math.min(value,target.maxhp-target.hp),before=target.hp;target.hp+=actual;effective+=actual;this._bump('heal',actual);this._record('heal',{actor:a.id,target:target.id,amount:actual,hp_before:before,hp_after:target.hp,item:true},`${s.name}为${target.name}恢复 ${actual} 生命`);}
        if(s.heal_scale){effective+=this._heal(a,target,s.heal_scale,s.heal_flat);if(s.barrier){const amount=Math.min(s.barrier,Math.floor(target.maxhp*0.25)),old=target.status.barrier?.amount||0;this._status(target,'barrier',{amount:Math.max(old,amount),expires:this.round+1});effective+=Math.max(0,amount-old);}}
        else if(s.coef>0){
          const retaliation=this.has(target,'brace')&&!this.isweak(a,target)&&!target.status.brace.used;
          const tune=target.status.tune;let extra=0;if(tune&&tune.owner!==a.id&&this.isweak(a,target)){delete target.status.tune;extra=1;}
          effective+=this._damage(a,target,s.coef,{amp});this._shieldDamage(a,target,s.break_points+(s.universal_break?0:extra),!!s.universal_break);
          if(extra&&target.hp>0){if(!teamworkGranted){const supplied=this._resource(a,'primary',10);teamworkGranted=true;this._bump('teamwork_resource',supplied);this._record('teamwork',{actor:a.id,target:target.id,owner:tune.owner,resource:a.primary,amount:supplied},`${a.name}接力震谐，${resourceNames[a.primary]} +${supplied}（每行动一次）`);}const owner=this.getUnit(tune.owner);if(owner&&owner.hp>0&&!owner.retreated){this._damage(owner,target,0.5,{status_damage:true});this._bump('tune_procs');}}
          if(s.effect==='tune'&&target.hp>0)this._status(target,'tune',{owner:a.id,expires:this.round+1});
          if(s.effect==='cutline'&&target.hp>0)this._status(target,'cutline',{actions:2,expires:this.round+3});
          if(['reveal','reveal_tune'].includes(s.effect)&&target.hp>0){if(s.effect==='reveal_tune')this._status(target,'tune',{owner:a.id,expires:this.round+1});target.revealed=true;this._record('reveal',{actor:a.id,target:target.id},`${target.name}的弱点已校准显示`);}
          if(s.applies_mode)this._addMode(a,target,a.key==='denia'&&a.form==='blue'?2:1);
          if(retaliation&&target.hp>0&&this.has(target,'brace')&&!(target.broken_until>=this.round)){target.status.brace.used=true;this._damage(target,a,0.8);this._bump('retaliations');}
        }
      }
      if(s.team_heal_scale)for(const target of this.living('ally'))effective+=this._heal(a,target,s.team_heal_scale,s.team_heal_flat);
      if(s.effect==='field'){this.field_until=this.round+1;this._record('field',{actor:a.id,until:this.field_until},`星界定标持续至第 ${this.field_until} 回合结束：我方伤害 +15%，所受伤害 ×0.8`);}
      if(key==='guard')this._status(a,'guard',{expires:this.round+1});
      if(key==='encourage'){if(!this.has(t,'encourage'))effective++;this._status(t,'encourage',{amp:0.25,expires:this.round+1});}
      if(key==='taunt'){if(!this.has(t,'taunt')||t.status.taunt.owner!==a.id)effective++;this._status(t,'taunt',{owner:a.id,expires:this.round+2});}
      if(key==='retreat'){a.retreated=true;a.status={};a.concerto=0;a.rsc=Object.fromEntries(Object.keys(a.rsc).map(k=>[k,0]));a.form=a.form_start||'normal';a.overdrive=false;this._removeOwnedMarkers(a);this._record('retreat',{actor:a.id},`${a.name}撤离，保留剩余生命并清空战斗资源`);}
      if(a.hp>0&&!a.retreated){
        if(effective>0){for(const [k,v] of Object.entries(s.gain||{}))this._resource(a,k,v);this._gainConcerto(a,s.concerto||0,key);}
        const before=a.form;
        if(key==='overdrive'){a.overdrive=true;a.form='mech';}if(key==='enhanced')a.form=a.form==='human'?'mech':'human';
        if(key==='finale'){a.overdrive=false;a.form='human';this._bump('finales');}
        if(key==='breakdown')a.form='blue';if(key==='curtain'){a.form='red';a.rsc.expectation=0;}
        if(a.key==='denia'&&a.form==='blue'&&a.rsc.expectation<20){a.form='red';a.rsc.expectation=0;}
        if(before!==a.form)this._record('form',{actor:a.id,from:before,to:a.form},`${a.name}切换为${{human:'人形',mech:'机兵',red:'红形态',blue:'蓝形态'}[a.form]||a.form}`);
      }
      this._record('action_end',{actor:a.id,skill:key,resources_after:clone(a.rsc),concerto:a.concerto,form:a.form},`${a.name}行动结束`);
      this._bump(key,1,this.actions);this.active_action=false;this.action_break_snapshot={};
    }
    validateConcerto(actor,target) {
      if(!this.started)return '战斗尚未开始';if(this.result)return '战斗已结束';if(!this.current||this.current.side!=='ally')return '请在我方行动窗口使用协奏';
      const a=this.getUnit(actor),t=this.getUnit(target);
      if(!a||a.side!=='ally'||a.hp<=0||a.retreated)return '协奏发起者不在场';
      if(a.concerto<100)return `协奏能量不足：需要 100，当前 ${a.concerto}`;
      if(a.concerto_round===this.round)return '该角色本回合已发动协奏';
      if(!t||t.side!=='ally'||t.hp<=0||t.retreated)return '请选择仍在场的我方目标';
      if(a.id===t.id&&this.living('ally').length>1)return '多人队伍的协奏不能对自己使用';return '';
    }
    availableConcertos() {return this.allies.map(a=>{const targets=this.living('ally').filter(t=>t.id!==a.id||this.living('ally').length===1).map(t=>t.id);const reason=this.validateConcerto(a,targets[0]);return {actor:a.id,name:a.name,enabled:!reason,ready:!reason,reason,targets,cost:100,effectSummary:`延奏：下一次直接攻击增伤${Math.round(a.outro.amp*100)}%；${a.key==='lynae'?'解放额外+10%；':a.key==='mornye'?'下次受击×0.85；':['denia','chisa'].includes(a.key)?'下次异常伤害+25%；':''}变奏供给接收者最多20主资源。单人仅半额直接增伤。`,durationText:'直接增益至下回合末；异常增益至第2回合末，均触发一次',normal_action_consumed:false};});}
    concerto(actorId,targetId,options={}) {
      const reason=this.validateConcerto(actorId,targetId);if(reason)return this._reject(reason);
      const from=this.log.length,a=this.getUnit(actorId),t=this.getUnit(targetId);a.concerto-=100;a.concerto_round=this.round;
      const solo=a.id===t.id,amp=a.outro.amp*(solo?0.5:1),old=t.status.outro||{},extra=!solo&&a.outro.special==='liberation_extra_0.1_within_global_cap'?0.1:0;
      this._status(t,'outro',{amp:Math.max(amp,old.amp||0),liberation_extra:Math.max(extra,old.liberation_extra||0),expires:this.round+1});
      if(!solo&&a.outro.special==='next_mode_status_damage_x1.25')this._status(t,'status_outro',{amp:0.25,expires:this.round+2});
      if(a.key==='mornye'&&!solo)this._status(t,'outro_guard',{expires:this.round+1});
      let gain=0;if(!solo){if(t.intro_round!==this.round){t.intro_round=this.round;t.intro_received=0;}gain=Math.min(20-t.intro_received,t.intro.primary_gain);this._resource(t,'primary',gain);t.intro_received+=gain;}
      this._bump('concerto');this._bump(options.automatic?'automatic_concertos':'manual_concertos');this._record('concerto',{actor:a.id,target:t.id,amp,intro_gain:gain,solo,trigger:options.automatic?'automatic':'manual'},`${a.name}向${t.name}发动协奏${solo?'（单人半额增伤）':`，变奏资源 +${gain}`}，不消耗普通行动`);this.validate();return this._reply(from);
    }
    _enemyTarget(a,random=true) {
      const alive=this.living('ally');if(!alive.length)return null;
      if(this.has(a,'taunt')){const locked=alive.find(u=>u.id===a.status.taunt.owner);if(locked)return locked;}
      if(this.has(a,'aim')||this.has(a,'charge'))return alive.find(u=>u.id===(a.status.aim||a.status.charge).target)||alive.slice().sort((x,y)=>x.slot-y.slot)[0];
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
      const {key,skill:s}=this._enemySkill(a),target=this._enemyTarget(a,false);
      return {actor:a.id,key,name:s.name,aoe:!!s.aoe,coefficient:s.coef,effect:s.effect||null,targets:s.aoe?this.living('ally').map(u=>u.id):target?[target.id]:[],uncertain:!!this.stochastic&&!s.aoe&&!this.has(a,'aim')&&!this.has(a,'charge')&&!this.has(a,'taunt')&&!(a.rank!=='common'&&this.params.difficulties[this.options.difficulty].targeting==='lowest_fraction'),skipped:a.broken_until>0&&a.broken_until>=this.round,description:s.effectSummary,effectSummary:s.effectSummary,telegraphText:s.telegraphText,counterplayText:s.counterplayText,costText:s.costText,cooldownText:s.cooldownText,durationText:s.durationText,chargeTurnsRemaining:(this.has(a,'charge')||this.has(a,'aim'))?1:null,committed:!!(this.has(a,'charge')||this.has(a,'aim')),targeting:this.params.difficulties[this.options.difficulty].targeting};
    }
    stepEnemy() {
      if(!this.started)return this._reject('战斗尚未开始');if(this.result)return this._reject('战斗已结束');const a=this.current;
      if(!a||a.side!=='enemy')return this._reject('当前不是敌方行动');
      const from=this.log.length;if(a.broken_until>0&&a.broken_until>=this.round){this._record('skip',{actor:a.id,reason:'broken'},`${a.name}处于破防，跳过行动`);this._bump('skipped_enemy_actions');this._finish(a);return this._reply(from);}
      const {key,skill:s}=this._enemySkill(a);if(key==='wingpulse')a.phase_attack_pending=false;else a.pattern_i++;delete a.status.brace;
      const targets=s.aoe?this.living('ally').slice():[this._enemyTarget(a)];
      this.action_id++;this._record('enemy_action',{actor:a.id,skill:key,skill_name:s.name,target:targets[0]?.id,targets:targets.map(t=>t.id)},`${a.name}使用「${s.name}」${s.aoe?'（全体）':` → ${targets[0].name}`}`);
      if(s.coef){const amp=this.has(a,'taunt')&&!s.aoe?0.15:0;for(const t of targets)this._damage(a,t,s.coef,{amp});if(!s.aoe)delete a.status.taunt;}
      if(['aim','charge','brace'].includes(s.effect))this._status(a,s.effect,{expires:this.round+2,target:targets[0].id});
      if(['aim','charge'].includes(s.effect)){this._bump('charge_warnings');const next=a.pattern[a.pattern_i%a.pattern.length];this._record('charge_started',{actor:a.id,target:targets[0].id,targets:a.skills[next]?.aoe?this.living('ally').map(u=>u.id):[targets[0].id],skill:next,resolve_after_enemy_actions:1},`${a.name}预告「${a.skills[next]?.name||next}」：下次行动兑现，破防可打断，防御可减半`);}
      if(['rush','spin','descent','aimed'].includes(key)){this._bump('charge_releases');this._record('charge_released',{actor:a.id,skill:key,targets:targets.map(t=>t.id)},`${a.name}的蓄力兑现为「${s.name}」`);}
      if(['rend','expose'].includes(s.effect))for(const t of targets)if(t.hp>0)this._status(t,s.effect==='expose'?'exposed':'rend',{expires:this.round+1});
      if(['rush','spin','descent'].includes(key))delete a.status.charge;if(key==='aimed')delete a.status.aim;
      if(this.has(a,'cutline')){a.status.cutline.actions--;if(a.status.cutline.actions<=0)delete a.status.cutline;}
      if(a.recovery_lock)this._record('recovery_unlock',{actor:a.id},`${a.name}已完成恢复后的首次普通行动，韧性保护解除`);
      a.recovery_lock=false;a.normal_count++;this._bump(key,1,this.enemy_actions);this._finish(a);return this._reply(from);
    }
    _selectTarget(a) {return this.living('enemy').slice().sort((x,y)=>(x.rank==='common'?x.hp/x.maxhp:2)-(y.rank==='common'?y.hp/y.maxhp:2)||(this.isweak(a,x)?0:1)-(this.isweak(a,y)?0:1)||x.hp-y.hp)[0];}
    _choose(a) {
      const t=this._selectTarget(a),es=this.living('enemy'),friends=this.living('ally'),r=a.rsc,c=a.key;
      if(this.policy==='random_legal'){
        const choices=this.availableActions(a.id).filter(s=>s.enabled&&!['wait','retreat','negotiate'].includes(s.key)).flatMap(s=>s.targets.map(id=>[s.key,this.getUnit(id)]));
        return choices[Math.floor(this._random()*choices.length)];
      }
      if(this.policy==='basic_only')return ['basic',t];if(this.policy==='pry_only')return ['pry',t];
      const worst=friends.slice().sort((x,y)=>(y.maxhp-y.hp)-(x.maxhp-x.hp))[0];
      if(!['no_healing','no_dedicated_heal'].includes(this.policy)){
        if(c==='mornye'){if(r.calibration>=60&&friends.filter(x=>x.maxhp-x.hp>=270).length>=2)return ['restore',worst];if(r.calibration>=30&&worst.maxhp-worst.hp>=350)return ['heal',worst];}
        if(c==='chisa'&&r.thread>=60&&worst.maxhp-worst.hp>=520)return ['mend',worst];
      }
      const broken=t.broken_until>0&&t.broken_until>=this.round;
      if(c==='amy'){if(r.sync===200&&r.resonance===4)return ['finale',t];if(r.resonance===4&&r.sync<200)return ['heavy',t];if(r.sync>=50&&r.resonance===0&&!a.overdrive)return ['overdrive',t];if(r.sync>=100&&r.resonance<4)return ['enhanced',t];}
      else if(c==='lynae'){if(!['no_teamwork','basic_only'].includes(this.policy)&&!this.has(t,'tune')&&friends.some(f=>f.id!==a.id&&f.acted_round!==this.round&&this.isweak(f,t))&&r.color<60)return ['survey',t];if(r.color>=100)return ['spectrum',t];if(r.color>=60&&!broken&&t.shield<=2)return ['skate',t];}
      else if(c==='mornye'){if(this.policy!=='no_teamwork'&&r.calibration>=60&&this.field_until<this.round)return ['field',t];}
      else if(c==='denia'){if(a.form==='red'){if(r.expectation>=80)return ['breakdown',t];if(es.length>1)return ['stage',t];}else if(r.expectation>=40)return [broken||r.expectation===40?'curtain':'blue',t];}
      else if(c==='chisa'){if(r.thread>=100)return ['release',t];if(es.length>1&&r.thread>=60)return ['chainsaw',t];if(this.policy!=='no_teamwork'&&r.thread>=30&&!broken&&(t.shield<=2||t.rank==='boss')&&!this.has(t,'cutline'))return ['cut',t];}
      if(!this.isweak(a,t)&&!broken&&['tactical','no_concerto','no_healing','no_dedicated_heal','wait_strategy'].includes(this.policy)&&t.shield<=2)return ['pry',t];return ['basic',t];
    }
    autoAction() {
      if(!this.started)this.start();if(this.result)return this._reject('战斗已结束');if(this.current.side==='enemy')return this.stepEnemy();
      const from=this.log.length,a=this.current;
      if(this.policy==='wait_strategy'&&a.key==='amy'&&a.rsc.sync===200&&a.rsc.resonance===4&&a.wait_round!==this.round&&this.queue.some(id=>this.getUnit(id)?.side==='ally')&&!this.living('enemy').every(e=>e.broken_until>=this.round))return this.wait();
      if(this.options.auto_concerto&&!['no_concerto','no_teamwork'].includes(this.policy))for(const donor of this.living('ally')){
        if(donor.concerto<100||donor.concerto_round===this.round)continue;
        const targets=this.living('ally').filter(t=>t.acted_round!==this.round&&!this.has(t,'outro')&&(t.id!==donor.id||this.living('ally').length===1)).sort((x,y)=>(y.key==='amy')-(x.key==='amy')||y.atk-x.atk);
        if(targets.length)this.concerto(donor.id,targets[0].id,{automatic:true});
      }
      const [key,target]=this._choose(a);const response=this.act(key,target.id);if(!response.ok)return response;return this._reply(from);
    }
    summary() {return {difficulty:this.options.difficulty,first_concerto_ready_round:this.log.find(e=>e.event==='concerto_ready')?.round||null,min_hp_fraction:Object.fromEntries(this.allies.map(a=>[a.key,Math.round(Math.min(this.options.initialHP?.[a.key]??round(a.maxhp*this.options.hp_fraction),a.hp,...this.log.filter(e=>e.target===a.id&&Number.isFinite(e.hp_after)).map(e=>e.hp_after))/a.maxhp*10000)/10000])),inventory:clone(this.inventory),outcome:this.result?.outcome||'inconclusive',rounds:this.round,ally_hp_fraction:Math.round(this.allies.reduce((n,a)=>n+a.hp,0)/this.allies.reduce((n,a)=>n+a.maxhp,0)*10000)/10000,survivors:this.living('ally').length,escaped_count:this.allies.filter(a=>a.retreated).length,ko_count:this.allies.filter(a=>a.hp===0).length,counts:clone(this.count),skills:clone(this.actions),enemy_skills:clone(this.enemy_actions),final_resources:Object.fromEntries(this.allies.map(a=>[a.key,clone(a.rsc)])),final_concerto:Object.fromEntries(this.allies.map(a=>[a.key,a.concerto]))};}
    validate() {
      const ids=new Set();for(const u of this.allies.concat(this.enemies)){
        if(ids.has(u.id)||!finite(u.hp,0,u.maxhp)||!finite(u.concerto,0,100))throw new Error('战斗状态越界');ids.add(u.id);
        for(const [k,v] of Object.entries(u.rsc))if(!finite(v,0,(u.resources||{})[k]))throw new Error('资源越界');
        if(u.side==='enemy'&&!finite(u.shield,0,u.maxshield))throw new Error('韧性越界');
      }
      if(new Set(this.queue).size!==this.queue.length||this.queue.some(id=>!ids.has(id))||this._currentId&&(!ids.has(this._currentId)||this.queue.includes(this._currentId)))throw new Error('行动队列无效');return true;
    }
    snapshot() {
      const state={};for(const k of ['options','allies','enemies','round','queue','_currentId','result','log','field_until','count','actions','enemy_actions','action_id','shield_budgets','active_action','action_break_snapshot','started','policy','stochastic','rngState','start_hp','inventory'])state[k]=clone(this[k]);
      return {schema:'battle-engine-v1',parameter_version:this.params.schema_version,state};
    }
    static restore(params,snapshot) {
      if(!snapshot||snapshot.schema!=='battle-engine-v1'||snapshot.parameter_version!==params.schema_version||!snapshot.state)throw new Error('存档格式或参数版本不匹配');
      const s=clone(snapshot.state),b=new BattleEngine(params,s.options),fail=()=>{throw new Error('存档状态无效或与当前参数不符');};
      const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
      const equal=(a,c)=>JSON.stringify(a)===JSON.stringify(c);
      const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
      const keysEqual=(a,c)=>plain(a)&&plain(c)&&equal(Object.keys(a).sort(),Object.keys(c).sort());
      const expectedKeys=Object.keys(b.snapshot().state);
      if(!keysEqual(s,b.snapshot().state)||!int(s.round)||!Array.isArray(s.allies)||!Array.isArray(s.enemies)||!Array.isArray(s.queue)||!Array.isArray(s.log)||typeof s.started!=='boolean'||s.active_action!==false||!plain(s.action_break_snapshot)||Object.keys(s.action_break_snapshot).length)fail();
      if(!int(s.action_id)||!int(s.rngState,0,0xffffffff)||!int(s.field_until,0,s.round+1)||!finite(s.start_hp,0,b.allies.reduce((n,a)=>n+a.maxhp,0))||typeof s.stochastic!=='boolean'||s.stochastic!==b.stochastic||s.policy!==b.policy)fail();
      for(const bucket of [s.count,s.actions,s.enemy_actions,s.shield_budgets])if(!plain(bucket)||Object.values(bucket).some(v=>!int(v)))fail();
      if(Object.values(s.shield_budgets).some(v=>v>3))fail();
      if(!keysEqual(s.inventory,b.inventory)||Object.entries(s.inventory).some(([k,v])=>!int(v,0,b.inventory[k])))fail();
      const mutable=new Set(['hp','rsc','concerto','form','overdrive','broken_until','recovery_lock','status','pattern_i','phase','phase_pending','normal_count','concerto_round','intro_round','intro_received','dead','retreated','wait_round','revealed','phase_attack_pending','acted_round','maxshield','shield','mastery']);
      for(const side of ['allies','enemies']){
        if(s[side].length!==b[side].length)fail();
        s[side].forEach((u,i)=>{
          const original=b[side][i];if(!keysEqual(u,original))fail();
          // Source definitions and stats are rebuilt from verified parameters, never trusted from a save.
          for(const key of Object.keys(original))if(!mutable.has(key)&&!equal(u[key],original[key]))fail();
          if(!int(u.hp,0,original.maxhp)||!int(u.concerto,0,100)||!keysEqual(u.rsc,original.rsc)||Object.entries(u.rsc).some(([k,v])=>!int(v,0,original.resources[k])))fail();
          for(const key of ['overdrive','recovery_lock','phase_pending','dead','retreated','revealed','phase_attack_pending'])if(typeof u[key]!=='boolean')fail();
          if(u.dead!==(u.hp===0)||u.retreated&&u.hp===0)fail();
          if(!int(u.normal_count,0,s.round)||!int(u.pattern_i,0,s.round*3+4)||!int(u.broken_until,0,s.round+1)||![1,2].includes(u.phase))fail();
          for(const key of ['concerto_round','intro_round','wait_round','acted_round'])if(!int(u[key],0,s.round))fail();
          if(!int(u.intro_received,0,20)||!keysEqual(u.mastery,original.mastery)||Object.values(u.mastery).some(v=>!int(v,0,5)))fail();
          const forms=u.key==='amy'?['human','mech']:u.key==='denia'?['red','blue']:[original.form_start||'normal'];
          if(!forms.includes(u.form)||u.key!=='amy'&&u.overdrive||!plain(u.status))fail();
          if(u.dead||u.retreated){if(Object.keys(u.status).length||u.concerto||Object.values(u.rsc).some(Boolean)||u.overdrive||u.form!==(original.form_start||'normal'))fail();}
          if(u.side==='enemy'){
            if(u.phase===2&&u.key!=='crownless'||u.maxshield!==(u.phase===2?original.phase2_shield:original.maxshield)||!int(u.shield,0,u.maxshield))fail();
            if(u.hp>0&&u.broken_until>0&&(u.broken_until<s.round||u.shield!==0)||u.recovery_lock&&(u.shield<1||u.rank==='common'))fail();
          }else if(u.maxshield!==0||u.broken_until!==0||u.recovery_lock||u.phase!==1||u.phase_pending||u.phase_attack_pending)fail();
          b[side][i]={...original,...Object.fromEntries([...mutable].filter(k=>own(u,k)).map(k=>[k,u[k]]))};
        });
      }
      const all=b.allies.concat(b.enemies),ids=new Set(all.map(u=>u.id)),allyIds=new Set(b.allies.map(u=>u.id));
      const statusRules={rend:{side:'ally',fields:['expires'],duration:1},exposed:{side:'ally',fields:['expires'],duration:1},fusion:{side:'enemy',fields:['n','expires'],duration:3},tune:{side:'enemy',fields:['owner','expires'],duration:1},cutline:{side:'enemy',fields:['actions','expires'],duration:3},guard:{side:'ally',fields:['expires'],duration:1},brace:{side:'enemy',fields:['expires','target','used'],duration:2},charge:{side:'enemy',fields:['expires','target'],duration:2},aim:{side:'enemy',fields:['expires','target'],duration:2},taunt:{side:'enemy',fields:['owner','expires'],duration:2},outro:{side:'ally',fields:['amp','liberation_extra','expires'],duration:1},outro_guard:{side:'ally',fields:['expires'],duration:1},status_outro:{side:'ally',fields:['amp','expires'],duration:2},encourage:{side:'ally',fields:['amp','expires'],duration:1},barrier:{side:'ally',fields:['amount','expires'],duration:1}};
      for(const u of all)for(const [key,value] of Object.entries(u.status)){
        const rule=own(statusRules,key)?statusRules[key]:null;
        if(!rule||rule.side!==u.side||!plain(value)||Object.keys(value).some(k=>!rule.fields.includes(k))||!int(value.expires,s.round,s.round+rule.duration))fail();
        if(['tune','taunt'].includes(key)&&(!allyIds.has(value.owner)||!b.living('ally').some(a=>a.id===value.owner)))fail();
        if(['aim','charge','brace'].includes(key)&&!allyIds.has(value.target))fail();
        if(key==='brace'&&own(value,'used')&&typeof value.used!=='boolean')fail();
        if(key==='fusion'&&!int(value.n,1,2)||key==='cutline'&&!int(value.actions,1,2)||key==='barrier'&&!int(value.amount,1,Math.floor(u.maxhp*0.25)))fail();
        if(key==='outro'&&(!finite(value.amp,0,0.25)||![0,0.1].includes(value.liberation_extra)))fail();
        if(['encourage','status_outro'].includes(key)&&value.amp!==0.25)fail();
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
        if(b.current.side==='enemy'&&b.current.broken_until>=s.round)fail();
        for(const u of all){const queued=b.queue.includes(u.id);if(queued&&u.acted_round===s.round)fail();if(u.hp>0&&!u.retreated&&u.acted_round!==s.round&&!queued&&s._currentId!==u.id)fail();}
      }
      if(s.log.some((e,i)=>!plain(e)||e.id!==i+1||!int(e.round,0,s.round)||typeof e.event!=='string'||typeof e.message!=='string'))fail();
      return b;
    }
  }
  BattleEngine.resourceNames=resourceNames;BattleEngine.statusNames=statusNames;
  return BattleEngine;
});
