/* Role mechanics for the v0.4 battle runtime. No DOM, timers, network, or hidden resources.
 * Original attacks, successful hits, root actions and derived packets are distinct clocks.
 * The engine owns payments, action slots, Q/Break, hit rolls and HP arithmetic.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SkillEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const DEFAULT_FORM = {amy:'human',aemeath:'human',lynae:'sampling',mornye:'ground',denia:'red',chisa:'scissors',rover_spectro:'normal',rover_havoc:'normal',rover_aero:'normal',rover_electro:'normal'};
  const ABNORMAL = {
    spectro_frazzle:{name:'光噪',cap:6,duration:3,element:'衍射',factor:n=>.10*n+.02*n*(n-1)},
    aero_erosion:{name:'风蚀',cap:3,duration:3,element:'气动',factor:n=>.18*n},
    electro_flare:{name:'电磁',cap:4,duration:3,element:'导电',factor:n=>.22*n},
    fusion_burst:{name:'聚爆',cap:5,duration:3,element:'热熔',factor:n=>.15*n},
    havoc_bane:{name:'虚湮',cap:3,duration:2,element:'湮灭'}
  };
  const NAMES = {rupture_shift:'震谐·偏移',strain_shift:'集谐·偏移',amy_quick:'迅应',amy_escort:'护航',lynae_cruise:'绮彩巡游',lynae_chase:'追色',lynae_paint:'颜料',lynae_r_support:'兜风·解放支援',lynae_empowered:'向着多彩的明天！',mornye_air:'广域观测',mornye_field:'谐振场',mornye_field_def:'强谐振场·防御',mornye_guard:'格挡',mornye_bound:'有界',mornye_observation:'观测',mornye_interference:'干涉',mornye_support:'稳态支援',denia_group:'归群',denia_spill:'连景',denia_field:'蚀域',chisa_saw:'电锯',chisa_unravel_mark:'虚无绞痕',chisa_wanlv:'万缕·汇终',spectro_echo_hold:'留响',stasis_delay:'凝滞',role_slow:'减速',dark_surge:'暗涌',havoc_field:'唤声',aero_cap_aura:'蚀境象',critical_resonance:'临界共鸣',electro_relay:'援阵',electro_marrow:'电髓'};
  const SLOTS = {amy:['A','E1','E2','E3','E4','E5','R1','R2'],lynae:['A','E1','E2','E3','E4','E5','R'],mornye:['A','E1','E2','E3','E4','E5','R'],denia:['A','E1','E2','E3','E4','E5','R1','R2'],chisa:['A','E1','E2','E3','E4','E5','E6','R'],rover_spectro:['A','E1','E2','S','R'],rover_havoc:['A','E1','E2','S','R'],rover_aero:['A','E1','E2','E3','S','R'],rover_electro:['A','E1','E2A','E2B','E1-state','S','R']};
  const keyOf = u => u && (u.key==='aemeath'?'amy':u.key || u.combat_profile_id);
  const alive = u => !!u && u.hp>0 && !u.retreated && !u.left && !u.offField && u.present!==false;
  const all = e => [...(e.allies || []),...(e.enemies || [])];
  const get = (e,id) => typeof id==='object'?id : (e.getUnit ? e.getUnit(id) : all(e).find(u=>u.id===id || u.key===id));
  const stat = (e,u,k) => e.finalStat ? e.finalStat(u,k) : Number(u[k] || 0);
  const status = (u,k) => u && u.status && u.status[k];
  const liveStatus = (e,u,k) => {const s=status(u,k);return s && (s.expires==null || s.expires>=e.round) && (s.startsRound==null || s.startsRound<=e.round) ? s:null;};
  const team = (e,u) => (u.side==='enemy'?e.enemies:e.allies).filter(alive);
  const enemies = (e,u) => (u.side==='enemy'?e.allies:e.enemies).filter(alive);
  const owner = (e,s) => get(e,s && (s.ownerId || s.sourceId || s.owner_actor_id));
  const slot = (s,k) => s.slot || (/^rover_/.test(k||'')?(k.match(/_e1_state$/)?'E1-state':k.split('_').pop().toUpperCase()):(k||s.id));
  const isFusion = u => /fusion|聚爆/i.test(u.mode||'') || (keyOf(u)==='denia' && !/strain|集谐/i.test(u.mode||''));
    const log = (e,type,data) => {if(e._record)e._record(type,data);};
  function remove(e,u,k) {if(!u || !u.status || !u.status[k])return false;if(e.removeStatus)e.removeStatus(u,k);else delete u.status[k];return true;}
  function put(e,u,k,src,rounds,extra,ctx) {
    if(!alive(u)||!alive(src))return null;
    const old=status(u,k), expires=rounds==null?null:e.round+rounds-1;
    const data={id:k,key:k,name:NAMES[k] || (ABNORMAL[k]&&ABNORMAL[k].name) || k,roleEffect:true,ownerId:src.id,sourceId:src.id,expires,...extra};
    if(old && ['mornye_support','mornye_interference'].includes(k))data.amount=Math.max(old.amount||0,data.amount||0);
    data.description=describeStatus(k,data);
    const changed=!old || Object.keys(data).some(field=>JSON.stringify(old[field])!==JSON.stringify(data[field]));
    data.token=old&&old.token || ++e._roleStatusSerial;
    data.order=old&&old.order || ++e._roleOrder;
    data.appliedRound=old&&old.appliedRound!=null?old.appliedRound:e.round;
    if(e.addStatus)e.addStatus(u,k,data);else {u.status=u.status||{};u.status[k]=data;}
    // The host may decorate statuses; retain the mechanics fields unchanged.
    if(!u.status[k])return null;
    Object.assign(u.status[k],data);
    if(changed && ctx)ctx.effective=true;
    return u.status[k];
  }
  function clearOwned(e,src,keys) {for(const u of all(e))for(const k of Object.keys(u.status||{})){const s=u.status[k];if((!keys || keys.includes(k)) && s && s.ownerId===src.id)remove(e,u,k);}}
  function setForm(e,u,form,ctx) {if(u.form!==form){u.form=form;if(ctx)ctx.effective=true;log(e,'form',{actor:u.id,form});}}
  function init(e,u) {
    e._roleStatusSerial=e._roleStatusSerial||0;e._roleOrder=e._roleOrder||0;
    u.status=u.status||{};u.roleState=u.roleState||{};
    if(keyOf(u) in DEFAULT_FORM && !u.form)u.form=DEFAULT_FORM[keyOf(u)];
    if(u.r2Pending && keyOf(u)==='amy')u.form='mech';
    if(u.r2Pending && keyOf(u)==='denia')u.form='blue';
  }
  function describeStatus(k,s={}) {
    if(s.capStatus)return `${ABNORMAL[s.capStatus].name}上限+${s.capBonus}；多个扩容取最高，不加层、不刷新异常，到期立即无伤害裁层。`;
    const descriptions={
      rupture_shift:'爱弥斯震谐模态本人击破预存标记时消费，造成0.60ATK响应；队友击破不触发。',
      strain_shift:'达妮娅集谐模态在己方击破预存标记后消费，主目标0.45ATK、最多两名同组敌人各0.225ATK。',
      amy_quick:'下一次正常行动若用二段蓄力，本体伤害×1.20并消费；选择其他行动也会失效。',
      amy_escort:`下一次主动攻击根与紧随反击队列中，第一条可防护反击减伤${Math.round((s.reduction||0)*100)}%，最多减免来源ATK×${s.capCoef}；该根结束清除。`,
      lynae_cruise:'绮彩巡游；可用幻光折跃与视觉冲击，结束或交接时回取样态。',
      lynae_chase:'载体每次原始攻击首次命中后触发琳奈追色0.25ATK；攻击开始时目标有颜料则0.35ATK。无每行动封顶，不递归。',
      lynae_paint:'追色系数提高到0.35ATK；视觉冲击命中消费并附0.40ATK，附伤不随BP缩放。',
      lynae_r_support:'下一次R、R1或R2整根伤害加深10%，提交即消费；解放分类E或蓝态普攻不消费。',
      lynae_empowered:'下一次正常行动若选择普攻，首击1.40ATK、追加每击0.56ATK；选择其他行动也到期。',
      mornye_air:'广域观测空中态，可使用分布式阵列、反演。落地不取消已有谐振场。',
      mornye_field:s.strong?'轮末治疗HP比例最低的一名友方，治疗(30+0.25DEF)×1.40；存续时全队DEF+10%。':'轮末治疗HP比例最低的一名友方30+0.25DEF，包含本人；平手按固定槽位。',
      mornye_field_def:'最终DEF+10%；同名取高，不叠加。',
      mornye_guard:`保护下一次可格挡敌原始攻击，防减后盾前减伤60%，剩余减免预算${Number(s.remainingCap||0).toFixed(1)}；敌根结束反击1.10DEF。`,
      mornye_bound:'最多3次把盾后HP伤害封顶为最大HP的30%；仍会致命时保留1HP并结束。第三次封顶或免死后治疗40+0.40DEF。',
      mornye_observation:'己方实际击破预存观测目标后消费，在根结束施加两轮12%受伤加深；新挂不回溯。',
      mornye_interference:'所受己方全部HP伤害加深12%，包含异常；同名取高，不叠加。',
      mornye_support:`下一次原始攻击根开始HP≥70%时伤害加深${Math.round((s.amount||0)*100)}%，该根一次消费；不强化他人协同。`,
      denia_group:'同组成员可供聚爆扩散、轻唤/放逐/织梦重击副目标与连景读取；无减速或跳行动。',
      denia_spill:'下一次合格单目标单属性原始根命中后，向另一同组敌人溅射本体税前伤害20%，上限为达妮娅0.60ATK；成功触发才消费。',
      denia_field:'轮末对全敌造成0.45ATK快照场伤，之后按模态加1层聚爆或刷新集谐偏移；不触发协同或主动异常钩子。',
      chisa_saw:'电锯态：可疾攻/终结，不能断命之铗；自然到期回剪刀且不获得终结盾。',
      chisa_unravel_mark:'每轮首次受到后续原始根攻击的实际HP伤害后加1层虚湮；同根多击只一次，协同与异常不触发。',
      chisa_wanlv:'下一次锯环·疾攻或终结本体伤害×1.20；提交即消费，不增加攻击次数。',
      spectro_echo_hold:'下一次光噪自然跳伤照常，但免除一次自然减1层；不阻止转换、主动消耗或异常到期。',
      stasis_delay:'目标下一次可延后主行动移到当轮其他既定行动之后一次，不删除行动或延长危险蓄力截止。',
      role_slow:`仅下一轮排序SPD降低${Math.round((s.pct||0)*100)}%。`,
      dark_surge:'暗涌：普攻首击1.45ATK、追加0.58ATK且根B20；行刃替换为命刈2.60ATK。',
      havoc_field:'目标接下来两次实际主行动结束各结算一次快照湮灭场伤；跳过或延后不计一次。',
      aero_cap_aura:'敌方风蚀容量+2；队伍主动施加風蚀前同步给新目标容量，不送层。与其他扩容取最高。',
      critical_resonance:'临界共鸣：雷引替换为千声翻涌，四次真实攻击依序衍射、湮灭、气动、导电。',
      electro_relay:'下一次原始攻击首次非伤害免疫命中，受益者主动施加1层电磁并消费一次；协同不能消费。',
      electro_marrow:`受益者下一次成功主动施加异常后恢复${s.amount}SP并消费；转换/场/持续异常不触发，溢出浪费。`,
      spectro_frazzle:'轮末按[0.10n+0.02n(n−1)]×施加者ATK快照造成衍射异常伤害，然后自然减少1层。',
      aero_erosion:'轮末按0.18n×施加者ATK快照造成气动异常伤害，不自然消层，到期清除。',
      electro_flare:'轮末按0.22n×施加者ATK快照造成导电异常伤害，跳后层数取原层数的一半向下取整。',
      fusion_burst:'到有效上限即引爆实际层数×0.15ATK快照热熔异常伤害并清层；同组其余敌人各受一半基数。',
      havoc_bane:'每层DEF−3%，进入公共防御削弱池；整组到期清除。'
    };return descriptions[k] || '';
  }
  function normOptions(o={}) {
    const n={...o};n.allyTarget=n.allyTarget || n.allyTargetId;
    if(n.abnormal && typeof n.abnormal==='object'){n.abnormalSelections=Object.entries(n.abnormal).map(([targetId,statusId])=>({targetId,statusId}));n.abnormal=undefined;}
    return n;
  }
  function chosenAlly(e,c,allowSelf=true) {const o=normOptions(c.options);if(o.allyTarget!=null)return get(e,o.allyTarget);return (c.target&&c.target.side===c.actor.side?c.target:null) || (allowSelf?c.actor:null);}
  function selectedAllies(e,c) {const o=normOptions(c.options);return (o.allyTargets || o.targetIds || (o.allyTarget?[o.allyTarget]:[c.actor.id])).map(x=>get(e,x));}
  function selectedAbnormals(e,c) {const o=normOptions(c.options);return o.abnormalSelections || (typeof o.abnormal==='string' && c.target?[{targetId:c.target.id,statusId:o.abnormal}]:[]);}
  function groupMembers(e,t) {const g=liveStatus(e,t,'denia_group');if(!g || !alive(owner(e,g)))return [];return e.enemies.filter(u=>alive(u) && !u.pullImmune && !u.pull_immune && !u.mechanicUnit && (!e.effectPolicy||e.effectPolicy(u,'pull')!=='immune') && liveStatus(e,u,'denia_group') && status(u,'denia_group').groupId===g.groupId);}
  function choices(e,a,s,k,bp,o={}) {
    const id=keyOf(a),q=slot(s,k),out={},friends=team(e,a),foes=enemies(e,a),target=get(e,o.target || o.targetId);
    if((id==='amy'&&q==='E5') || (id==='lynae'&&q==='E5') || (id==='rover_electro'&&q==='S'))out.allyTargets=friends.filter(x=>x.id!==a.id).map(x=>x.id);
    if(id==='mornye' && ['E1','E3'].includes(q))out.allyTargets=friends.map(x=>x.id);
    if((id==='mornye'&&q==='E3') || (id==='chisa'&&q==='E2'))out.choices=[{value:'attack',label:'攻势'},{value:'healing',label:'续航'}];
    if(id==='denia'&&q==='E3')out.choices=[{value:'call',label:'轻唤（18SP）'},{value:'exile',label:'放逐（24SP）'}];
    if(id==='denia'&&['E3','E4'].includes(q))out.multiTarget={kind:'extra_enemies',ids:(target?groupMembers(e,target).filter(x=>x!==target):foes.filter(x=>groupMembers(e,x).length>1)).map(x=>x.id),max:2,min:0};
    if(id==='denia'&&q==='E5')out.multiTarget={kind:'allies',ids:friends.map(x=>x.id),max:bp+1,min:1};
    if(id==='chisa'&&q==='E6') {
      out.multiTarget={kind:'abnormal',ids:foes.filter(x=>Object.keys(ABNORMAL).some(k=>status(x,k))).map(x=>x.id),max:bp+1,min:1,perTargetAbnormal:true};
      out.abnormalChoices=Object.keys(ABNORMAL).map(value=>({value,label:ABNORMAL[value].name}));
      out.abnormalChoicesByTarget=Object.fromEntries(foes.map(t=>[t.id,Object.keys(ABNORMAL).filter(k=>status(t,k)&&status(t,k).stacks>0).map(value=>({value,label:ABNORMAL[value].name}))]));
    }
    if(id==='rover_aero'&&q==='E3') {
      out.abnormalChoices=[{value:'none',label:'只攻击，不转换'},...['spectro_frazzle','fusion_burst','havoc_bane','electro_flare'].filter(k=>!target || status(target,k)).map(value=>({value,label:ABNORMAL[value].name}))];
      if(target)out.conversionPreview=conversionPreview(e,a,target,o.abnormal||'none');
    }
    if(target&&liveStatus(e,a,'denia_spill'))out.spillTargets=groupMembers(e,target).filter(t=>t!==target).map(t=>t.id);
    return out;
  }
  function preview(e,a,s,k,bp,o={}) {
    const q=slot(s,k),id=keyOf(a);o=normOptions(o);let audit=copy(s.numeric_audit || {}),category=s.category || s.damage_type || s.damage_category;
    const variants=s.conditional_variants || [];
    if(id==='amy' && (a.form==='mech'||a.r2Pending) && ['A','E1','E2','E3'].includes(q) && variants[0])audit=copy(variants[0].numeric_audit);
    if(id==='denia' && q==='A' && (a.form==='blue'||a.r2Pending)){if(variants[0])audit=copy(variants[0].numeric_audit);category='liberation';}
    if(id==='denia'&&q==='E3'&&o.choice==='exile'&&variants[0])audit=copy(variants[0].numeric_audit);
    if(id==='chisa'&&q==='A'&&a.form==='saw')category='liberation';
    if(id==='lynae'&&q==='A'&&liveStatus(e,a,'lynae_empowered'))audit.damage_atk_by_bp=[1.4,1.96,2.52,3.08];
    if(id==='rover_havoc'&&liveStatus(e,a,'dark_surge')&&audit.state_overrides&&audit.state_overrides.dark_surge){const v=audit.state_overrides.dark_surge;audit={...audit,...v,base_energy:v.base_B || audit.base_energy};}
    if(o.choice==='healing') {
      if(id==='mornye'&&q==='E3')audit.damage_def_by_bp=[1.2,1.2,1.2,1.2];
      if(id==='chisa'&&q==='E2')audit.damage_atk_by_bp=[1.15,1.15,1.15,1.15];
    }
    return {audit,category};
  }
  function validate(e,c) {
    const a=c.actor,id=keyOf(a),q=slot(c.skill,c.key),o=normOptions(c.options),f=a.form;
    for(const field of ['allyTarget','spillTarget','spillTargetId'])if(o[field]!=null&&typeof o[field]!=='string')return '目标ID必须是字符串';
    for(const field of ['allyTargets','extraTargets','targetIds'])if(o[field]!=null&&(!Array.isArray(o[field])||o[field].some(x=>typeof x!=='string')))return '多选目标必须是ID列表';
    if(o.abnormalSelections!=null&&(!Array.isArray(o.abnormalSelections)||o.abnormalSelections.some(x=>!x||typeof x!=='object'||typeof x.targetId!=='string'||typeof x.statusId!=='string')))return '请选择合法的敌人和异常';
    if(id==='rover_aero'&&q==='E3'&&c.options?.abnormal!=null&&typeof c.options.abnormal!=='string')return '请选择一种异常，或只攻击';
    const requires = id==='lynae'?{E2:'sampling',E3:'cruise',E4:'cruise'}:id==='mornye'?{E2:'ground',E3:'air',E4:'air'}:id==='denia'?{E1:'red',E3:'blue',R1:'red'}:id==='chisa'?{E2:'scissors',E3:'scissors',E4:'saw',E5:'saw'}:{};
    if(requires[q] && f!==requires[q])return `当前形态不可使用${c.skill.name || q}`;
    if(id==='rover_electro' && q==='E1-state' && !liveStatus(e,a,'critical_resonance'))return '需要临界共鸣';
    if(id==='rover_electro' && q==='E1' && liveStatus(e,a,'critical_resonance'))return '临界期间使用千声翻涌';
    if((id==='amy'&&q==='E5') || (id==='lynae'&&q==='E5') || (id==='rover_electro'&&q==='S')){const t=chosenAlly(e,c,false);if(!alive(t)||t.side!==a.side||t.id===a.id)return '请选择另一名在场存活队友';}
    if(id==='mornye'&&['E1','E3'].includes(q)){const t=chosenAlly(e,c);if(!alive(t)||t.side!==a.side)return '请选择在场存活的格挡或有界受益者';}
    if(id==='denia'&&q==='E5'){
      if(!enemies(e,a).some(t=>groupMembers(e,t).length>=2))return '需要至少两名存活敌人的有效归群';
      const selected=selectedAllies(e,c);if(!selected.length || selected.length>c.bp+1 || selected.some(t=>!alive(t)||t.side!==a.side) || new Set(selected.map(t=>t.id)).size!==selected.length)return '连景目标必须为不重复的存活队友，数量不超过BP档位';
    }
    if(id==='denia'&&['E3','E4'].includes(q)){
      const extra=(o.extraTargets || o.targetIds || []).map(x=>get(e,x));
      if(extra.length>2 || new Set(extra.map(x=>x&&x.id)).size!==extra.length || extra.some(t=>!alive(t)||t===c.target||!groupMembers(e,c.target).includes(t)))return '副目标必须为主目标同组的至多两名其他存活敌人';
    }
    if(id==='chisa'&&q==='E6'){
      const selected=selectedAbnormals(e,c);if(!selected.length || selected.length>c.bp+1 || new Set(selected.map(x=>x.targetId)).size!==selected.length)return '请选择本档允许数量的不同敌人及其已有异常';
      for(const x of selected){const t=get(e,x.targetId);if(!alive(t)||t.side===a.side||!ABNORMAL[x.statusId]||!status(t,x.statusId)||status(t,x.statusId).stacks<1)return '扩容只能选择敌人已有的已实现异常';}
    }
    if(id==='rover_aero'&&q==='E3' && o.abnormal && o.abnormal!=='none' && !['spectro_frazzle','fusion_burst','havoc_bane','electro_flare'].includes(o.abnormal))return '该异常不可转换';
    if(id==='rover_aero'&&q==='E3' && o.abnormal && o.abnormal!=='none' && !status(c.target,o.abnormal))return '所选目标没有该异常；可选择只攻击';
    if(o.choice && ((id==='mornye'&&q==='E3')||(id==='chisa'&&q==='E2'))&&!['attack','healing'].includes(o.choice))return '请选择攻势或续航';
    if(id==='denia'&&q==='E3'&&o.choice&&!['call','exile'].includes(o.choice))return '请选择轻唤或放逐';
    if(o.spillTarget&&(!liveStatus(e,a,'denia_spill')||!groupMembers(e,c.target).some(t=>t!==c.target&&t.id===o.spillTarget)))return '连景副目标必须为主目标同组的另一名存活敌人';
    return null;
  }
  function snapshot(e,c) {
    c.markerSnapshot={};c.hitTargets={};c.roleProcessed={};c.roleAttack={};c.roleAmplify=0;
    for(const t of enemies(e,c.actor)) {
      c.markerSnapshot[t.id]={};
      for(const k of ['rupture_shift','strain_shift','fusion_burst','mornye_observation','chisa_unravel_mark','lynae_paint']){const s=liveStatus(e,t,k);if(s)c.markerSnapshot[t.id][k]={token:s.token,ownerId:s.ownerId};}
      c.markerSnapshot[t.id].wasBroken=!!(t.breakPending || t.broken || t.breakRemaining>0 || t.breakSkip>0 || status(t,'break') || status(t,'broken'));
    }
  }
  function scaleBody(c,m) {for(const attack of c.attacks||[]){attack.coef=(attack.coef||0)*m;attack.defCoef=(attack.defCoef||0)*m;}c.fixedBodyMultiplier=(c.fixedBodyMultiplier||1)*m;}
  function prepare(e,c) {
    const a=c.actor,id=keyOf(a),q=slot(c.skill,c.key);c.options=normOptions(c.options);snapshot(e,c);c.startForm=c.startForm||a.form;c.roleSlot=q;
    c.atkSnapshot=stat(e,a,'atk');c.defSnapshot=stat(e,a,'def');
    if(c.target&&(c.targets||[]).includes(c.target))c.targets=[c.target,...c.targets.filter(t=>t!==c.target)];
    if(liveStatus(e,a,'denia_spill'))c.spillTargetId=c.options.spillTarget||c.options.spillTargetId||groupMembers(e,c.target).find(t=>t!==c.target)?.id||null;
    if(id==='mornye')clearOwned(e,a,['mornye_guard']);
    for(const k of ['amy_quick','lynae_empowered']){const s=liveStatus(e,a,k);if(s)c.roleProcessed[k]=s.token;}
    if(id==='amy' && q==='E2' && liveStatus(e,a,'amy_quick')){scaleBody(c,1.2);remove(e,a,'amy_quick');}
    if(id==='chisa' && ['E4','E5'].includes(q) && liveStatus(e,a,'chisa_wanlv')){scaleBody(c,1.2);remove(e,a,'chisa_wanlv');}
    if((c.attacks||[]).length) {
      const support=liveStatus(e,a,'mornye_support');if(support&&alive(owner(e,support))&&a.hp>=a.maxhp*.7){c.roleAmplify+=support.amount;remove(e,a,'mornye_support');}
      const rs=liveStatus(e,a,'lynae_r_support');if(rs&&alive(owner(e,rs))&&['R','R1','R2'].includes(q)){c.roleAmplify+=.10;remove(e,a,'lynae_r_support');}
      const escort=liveStatus(e,a,'amy_escort');if(escort&&alive(owner(e,escort)))escort.activeRoot=c.rootActionId;
    }
    if(id==='amy'&&q==='R1')setForm(e,a,'mech',c);
    if(id==='denia'&&q==='R1')setForm(e,a,'blue',c);
    if(id==='mornye'&&q==='R')c.roleCrBonus=Math.min(.20,Math.max(0,stat(e,a,'er')-1)*.20);
    if(id==='denia'&&['E3','E4'].includes(q)){
      const extras=(c.options.extraTargets || c.options.targetIds || []).map(x=>get(e,x)).filter(t=>alive(t)&&t!==c.target);
      c.targets=[c.target,...extras];
      for(const attack of c.attacks){attack.targets=c.targets;attack.targetModifiers={};if(q==='E3')for(const t of extras)attack.targetModifiers[t.id]={coefScale:(c.options.choice==='exile'?.65/2.2:.4/1.7),qScale:0};}
    }
    if(id==='rover_electro'&&q==='E1-state'){
      const weights=[1/3,1/3,1/6,1/6],qs=[.3,.3,.2,.2],elements=['衍射','湮灭','气动','导电'];
      const total=c.attacks.reduce((n,x)=>n+(x.coef||0),0),totalQ=c.attacks.reduce((n,x)=>n+(x.q||0),0);
      c.attacks=c.attacks.map((x,i)=>({...x,coef:total*weights[i],q:totalQ*qs[i],element:elements[i]}));
    }
    if(id==='rover_electro'&&q==='E1'&&c.attacks.length===2){const total=c.attacks.reduce((n,x)=>n+(x.coef||0),0),totalQ=c.attacks.reduce((n,x)=>n+(x.q||0),0);c.attacks[0].coef=total*.6;c.attacks[1].coef=total*.4;c.attacks[0].q=totalQ*.6;c.attacks[1].q=totalQ*.4;}
  }
  function beforeAttack(e,c,attack) {
    const id=attack.attackId || attack.id || c.currentAttackId || `attack:${Object.keys(c.roleAttack||{}).length}`;
    attack._roleId=id;c.roleAttack=c.roleAttack||{};
    const paint={};for(const t of c.targets||[])paint[t.id]=!!liveStatus(e,t,'lynae_paint');
    c.roleAttack[id]={paint,firstHit:null};
  }
  function mark(e,c,t,k,n=1) {const src=c.actor;return k==='fusion_burst'?applyAbnormal(e,src,t,k,n,{ctx:c,active:true}):put(e,t,k,src,2,{},c);}
  function ownOnce(c,t,k) {const key=`${t.id}:${k}`;if(c.roleProcessed[key])return false;c.roleProcessed[key]=true;return true;}
  function afterHit(e,c,h) {
    if(h.original===false)return;
    const a=c.actor,id=keyOf(a),q=c.roleSlot||slot(c.skill,c.key),t=h.target;
    c.hitTargets[t.id]=true;
    const attackId=h.attackId || c.currentAttackId;
    let ar=c.roleAttack[attackId];if(!ar){ar={paint:{},firstHit:null};c.roleAttack[attackId]=ar;}
    if(!ar.firstHit)ar.firstHit=h;
    if(id==='amy'&&q==='E4'&&ownOnce(c,t,'amy_quick_grant'))put(e,a,'amy_quick',a,null,{uses:1},c);
    if(!alive(t))return;
    if(id==='amy' && ((['A','E1'].includes(q)&&c.startForm==='human')||q==='E4') && ownOnce(c,t,'amy_intrinsic')) {
      mark(e,c,t,isFusion(a)?'fusion_burst':'rupture_shift');
    }
    if(id==='denia'&&['A','E2','R1'].includes(q)&&ownOnce(c,t,'denia_intrinsic'))mark(e,c,t,isFusion(a)?'fusion_burst':'strain_shift',q==='A'?1:2);
    if(id==='lynae'&&q==='E4' && c.markerSnapshot[t.id]&&c.markerSnapshot[t.id].lynae_paint && ownOnce(c,t,'paint_consume')){
      e.damage(a,t,{coef:.40,element:'衍射',category:'normal',kind:'attached',canCrit:false,q:0,ctx:c,rootActionId:c.rootActionId});remove(e,t,'lynae_paint');
    }
    if(id==='mornye'&&q==='E4'&&ownOnce(c,t,'observation'))put(e,t,'mornye_observation',a,3,{},c);
    if(id==='chisa'&&q==='E1'&&ownOnce(c,t,'unravel')){
      clearOwned(e,a,['chisa_unravel_mark']);put(e,t,'chisa_unravel_mark',a,3,{lastTriggeredRound:-1},c);
      slow(e,a,t,.15,c);
    }
    if(id==='rover_spectro'&&['E1','R'].includes(q)&&ownOnce(c,t,'spectro'))applyAbnormal(e,a,t,'spectro_frazzle',2,{active:true,ctx:c});
    if(id==='rover_aero'&&q==='E2')applyAbnormal(e,a,t,'aero_erosion',1,{active:true,ctx:c});
    if(id==='rover_electro'&&q==='E1')applyAbnormal(e,a,t,'electro_flare',1,{active:true,ctx:c});
    const relay=liveStatus(e,a,'electro_relay');
    if(relay&&alive(owner(e,relay))&&!h.damageImmune){remove(e,a,'electro_relay');applyAbnormal(e,a,t,'electro_flare',1,{active:true,ctx:c});}
  }
  function afterAttack(e,c,attack,hits=[]) {
    const ar=c.roleAttack[attack._roleId || attack.attackId || attack.id] || {},first=ar.firstHit || hits.find(h=>h.hit!==false),carrier=c.actor;
    const chase=liveStatus(e,carrier,'lynae_chase'),src=owner(e,chase);
    if(!first || !chase || !alive(src) || !alive(carrier) || !alive(first.target))return;
    e.damage(src,first.target,{coef:ar.paint&&ar.paint[first.target.id]?.35:.25,element:'衍射',category:'normal',kind:'coordinated',q:0,ctx:c,rootActionId:c.rootActionId});
  }
  function healTeam(e,c,amount) {for(const t of team(e,c.actor))if(e.heal(c.actor,t,amount)>0)c.effective=true;}
  function grantBound(e,c,t) {if(c.actor.roleState.boundGranted)return;put(e,t,'mornye_bound',c.actor,2,{uses:3},c);c.actor.roleState.boundGranted=true;}
  function setChase(e,c,t,n) {clearOwned(e,c.actor,['lynae_chase','lynae_r_support']);put(e,t,'lynae_chase',c.actor,n,{},c);}
  function slow(e,a,t,pct,c) {if(!e.control || e.control(a,t,'slow'))put(e,t,'role_slow',a,2,{startsRound:e.round+1,pct},c);}
  function afterRoot(e,c) {
    const a=c.actor,id=keyOf(a),q=c.roleSlot||slot(c.skill,c.key),bp=c.bp,o=c.options||{},foes=enemies(e,a),hasHit=t=>!!(t&&c.hitTargets[t.id]);
    // A mark installed by this root can never reward this same root.
    for(const t of foes){const old=c.markerSnapshot[t.id]&&c.markerSnapshot[t.id].chisa_unravel_mark,s=liveStatus(e,t,'chisa_unravel_mark');if(old&&s&&s.token===old.token&&s.lastTriggeredRound!==e.round&&(c.hits||[]).some(h=>h.target.id===t.id&&h.original!==false&&h.hpDamage>0)){const src=owner(e,s);if(alive(src)){s.lastTriggeredRound=e.round;applyAbnormal(e,src,t,'havoc_bane',1,{active:false,ctx:c});}}}
    if(id==='amy'&&q==='E5')put(e,chosenAlly(e,c,false),'amy_escort',a,2,{uses:1,reduction:[.25,.35,.45,.55][bp],capCoef:[.60,.85,1.10,1.35][bp],activeRoot:null},c);
    if(id==='lynae') {
      if(q==='E2'){setForm(e,a,'cruise',c);put(e,a,'lynae_cruise',a,3,{},c);setChase(e,c,a,3);}
      if(q==='E3')for(const t of foes)if(hasHit(t))put(e,t,'lynae_paint',a,2,{},c);
      if(q==='E4'){remove(e,a,'lynae_cruise');setForm(e,a,'sampling',c);clearOwned(e,a,['lynae_chase','lynae_r_support']);}
      if(q==='E5'){remove(e,a,'lynae_cruise');setForm(e,a,'sampling',c);const t=chosenAlly(e,c,false);setChase(e,c,t,2);put(e,t,'lynae_r_support',a,2,{uses:1},c);}
      if(q==='R')put(e,a,'lynae_empowered',a,null,{uses:1},c);
    }
    if(id==='mornye') {
      if(q==='E1'){
        healTeam(e,c,(40+.35*stat(e,a,'def'))*[1,1.25,1.5,1.75][bp]);remove(e,a,'mornye_air');setForm(e,a,'ground',c);
        const t=chosenAlly(e,c);put(e,t,'mornye_guard',a,null,{remainingCap:1.20*stat(e,a,'def'),lockedAttackId:null,lockedRootId:null,prevented:0,attackerId:null},c);grantBound(e,c,t);
      }
      if(q==='E2'){setForm(e,a,'air',c);put(e,a,'mornye_air',a,3,{},c);put(e,a,'mornye_field',a,3,{roleField:true,strong:false},c);clearOwned(e,a,['mornye_field_def']);}
      if(q==='E3'){healTeam(e,c,(60+.55*stat(e,a,'def'))*(o.choice==='healing'?[1,1.25,1.5,1.75][bp]:1));grantBound(e,c,chosenAlly(e,c));}
      if(q==='E5')for(const t of team(e,a))put(e,t,'mornye_support',a,2,{uses:1,amount:[.12,.15,.18,.20][bp]},c);
      if(q==='R'&&liveStatus(e,a,'mornye_field')){put(e,a,'mornye_field',a,2,{roleField:true,strong:true,name:'强谐振场'},c);for(const t of team(e,a))put(e,t,'mornye_field_def',a,2,{pct:.10},c);}
    }
    if(id==='denia') {
      if(q==='E1'){const groupId=`${a.id}:${c.rootActionId}`;for(const t of foes)if(hasHit(t)&&(!e.control||e.control(a,t,'pull')))put(e,t,'denia_group',a,2,{groupId},c);}
      if(q==='E5')for(const t of selectedAllies(e,c))put(e,t,'denia_spill',a,2,{uses:1},c);
    }
    if(id==='chisa') {
      if(q==='E2'&&Object.keys(c.hitTargets).length)healTeam(e,c,(35+.35*stat(e,a,'atk'))*(o.choice==='healing'?[1,1.3,1.55,1.75][bp]:1));
      if(q==='E3'){setForm(e,a,'saw',c);put(e,a,'chisa_saw',a,3,{},c);}
      if(q==='E5'){remove(e,a,'chisa_saw');setForm(e,a,'scissors',c);for(const t of team(e,a))if(e.shield(a,t,30+.25*stat(e,a,'atk'),2,'chisa_shield')>0)c.effective=true;}
      if(q==='E6')for(const x of selectedAbnormals(e,c))addCapacity(e,a,get(e,x.targetId),x.statusId,1,2,'chisa_capacity',c);
      if(q==='R'){healTeam(e,c,80+.65*stat(e,a,'atk'));put(e,a,'chisa_wanlv',a,3,{uses:1},c);}
    }
    if(id==='rover_spectro'){
      if(q==='E2'&&alive(c.target)&&hasHit(c.target)){applyAbnormal(e,a,c.target,'spectro_frazzle',1,{active:true,ctx:c});put(e,c.target,'spectro_echo_hold',a,2,{uses:1},c);}
      if(q==='S'){if(!e.control||e.control(a,c.target,'delay'))put(e,c.target,'stasis_delay',a,2,{uses:1},c);slow(e,a,c.target,[.10,.15,.20,.25][bp],c);}
    }
    if(id==='rover_havoc'){
      if(q==='E2'){put(e,a,'dark_surge',a,2,{},c);setForm(e,a,'dark_surge',c);}
      if(q==='S')for(const t of foes)put(e,t,'havoc_field',a,3,{uses:2,coef:[.9,1.26,1.575,1.845][bp],atkSnapshot:stat(e,a,'atk'),levelSnapshot:a.level,damageBonusSnapshot:a.status.damage_boost?.amount||0},c);
    }
    if(id==='rover_aero'){
      if(['E1','R'].includes(q)){const n=(c.skill.numeric_audit.healing_by_bp||[])[bp];if(n)healTeam(e,c,n.atk*stat(e,a,'atk')+n.caster_max_hp*a.maxhp+(n.flat||0));}
      if(q==='E3'&&alive(c.target)&&hasHit(c.target)&&o.abnormal&&o.abnormal!=='none')convertAbnormal(e,a,c.target,o.abnormal,c);
      if(q==='S'){const duration=[2,3,4,5][bp];put(e,a,'aero_cap_aura',a,duration,{},c);for(const t of foes)addCapacity(e,a,t,'aero_erosion',2,duration,'aero_capacity',c);}
    }
    if(id==='rover_electro'){
      if(q==='E2A')for(const t of team(e,a))if(t!==a)put(e,t,'electro_relay',a,2,{uses:1},c);
      if(q==='E2B'){put(e,a,'critical_resonance',a,2,{},c);setForm(e,a,'critical',c);}
      if(q==='S')put(e,chosenAlly(e,c,false),'electro_marrow',a,2,{uses:1,amount:[12,16,20,24][bp]},c);
    }
    for(const k of ['amy_quick','lynae_empowered'])if(c.roleProcessed[k]&&status(a,k)&&status(a,k).token===c.roleProcessed[k])remove(e,a,k);
  }
  function eligibleMark(e,c,t,k) {const snap=c.markerSnapshot&&c.markerSnapshot[t.id]&&c.markerSnapshot[t.id][k],s=liveStatus(e,t,k);return snap&&s&&snap.token===s.token?s:null;}
  function onBreak(e,event,c) {
    const src=get(e,event.source || event.sourceId || event.source_actor_id || event.actorId || event.breakerId),t=get(e,event.target || event.targetId || event.target_id);
    if(!alive(t))return;
    if(src&&keyOf(src)==='amy'&&alive(src)){
      if(isFusion(src)){if(eligibleMark(e,c,t,'fusion_burst'))burst(e,t,c);}
      else if(eligibleMark(e,c,t,'rupture_shift')){remove(e,t,'rupture_shift');e.damage(src,t,{coef:.6,element:'热熔',category:'response',kind:'response',canCrit:false,q:0,ctx:c});}
    }
    if(!alive(t))return;
    const strain=eligibleMark(e,c,t,'strain_shift');
    if(strain){const denia=team(e,c.actor).find(u=>keyOf(u)==='denia'&&!isFusion(u));if(denia){remove(e,t,'strain_shift');e.damage(denia,t,{coef:.45,element:'热熔',category:'response',kind:'response',canCrit:false,q:0,ctx:c});if(alive(t))for(const x of groupMembers(e,t).filter(x=>x!==t).slice(0,2))e.damage(denia,x,{coef:.225,element:'热熔',category:'response',kind:'response',canCrit:false,q:0,ctx:c});}}
    if(!alive(t))return;
    const observation=eligibleMark(e,c,t,'mornye_observation'),mor=owner(e,observation);
    if(observation&&alive(mor)){remove(e,t,'mornye_observation');put(e,t,'mornye_interference',mor,2,{amount:.12},c);}
  }
  function afterBreaks(e,c) {
    const a=c.actor,id=keyOf(a),q=c.roleSlot;
    if(id==='amy'){
      if(q==='E3'&&isFusion(a)&&alive(c.target))burst(e,c.target,c);
      if(['E1','E3'].includes(q))setForm(e,a,a.r2Pending?'mech':c.startForm==='human'?'mech':'human',c);
      if(q==='R2')setForm(e,a,'human',c);
    }
    if(id==='denia'&&q==='R2'){setForm(e,a,'red',c);put(e,a,'denia_field',a,2,{roleField:true,atkSnapshot:stat(e,a,'atk'),levelSnapshot:a.level,fusion:isFusion(a)},c);}
    const spill=liveStatus(e,a,'denia_spill'),denia=owner(e,spill),target=c.target;
    const isSingle=(c.targets||[]).length===1 && (c.attacks||[]).length>0;
    const elements=new Set((c.attacks||[]).map(x=>x.element||a.element));
    if(spill&&alive(denia)&&isSingle&&elements.size===1&&alive(target)&&c.hitTargets[target.id]){
      const members=groupMembers(e,target).filter(x=>x!==target),secondary=get(e,c.spillTargetId);
      if(alive(secondary)&&members.includes(secondary)){
        const base=(c.attacks||[]).reduce((n,x)=>n+(x.coef||0)*c.atkSnapshot+(x.defCoef||0)*c.defSnapshot,0);
        e.damage(denia,secondary,{base:Math.min(base*.2,stat(e,denia,'atk')*.6),element:[...elements][0],category:'spill',kind:'response',canCrit:false,q:0,ctx:c,ignoreSourceBonuses:true});remove(e,a,'denia_spill');
      }
    }
  }
  function modifiers(e,source,target,p={}) {
    const out={};const c=p.ctx;
    if(c&&source&&c.actor&&source.id===c.actor.id&&(p.kind==='original'||p.kind==='attached'||!p.kind)){
      out.amplify=c.roleAmplify||0;out.crBonus=c.roleCrBonus||0;
      if(p.kind!=='attached'&&keyOf(source)==='amy'&&c.roleSlot==='R2'&&c.markerSnapshot&&c.markerSnapshot[target.id]&&c.markerSnapshot[target.id].wasBroken)out.damageBonus=.10;
    }
    const bane=liveStatus(e,target,'havoc_bane');if(bane)out.defShred=.03*bane.stacks;
    const interference=liveStatus(e,target,'mornye_interference');if(interference&&alive(owner(e,interference))&&source&&source.side===owner(e,interference).side)out.allHpAmplify=interference.amount;
    return out;
  }
  function statModifiers(e,u,k) {
    let pct=0;
    if(k==='def'){const s=liveStatus(e,u,'mornye_field_def');if(s&&alive(owner(e,s)))pct=Math.max(pct,s.pct);}
    if(k==='spd'){const s=liveStatus(e,u,'role_slow');if(s&&alive(owner(e,s)))pct-=s.pct;}
    return {pct,flat:0};
  }
  function beforeIncomingDamage(e,p) {
    if(!(p.amount>0))return;
    const t=p.target,guard=liveStatus(e,t,'mornye_guard'),mor=owner(e,guard);
    if(guard&&alive(mor)&&p.source&&p.source.side!==t.side&&(p.kind==='original'||p.original===true)&&p.blockable!==false&&(!guard.lockedAttackId||guard.lockedAttackId===p.attackId)) {
      const prevented=Math.min(p.amount*.60,guard.remainingCap);p.amount-=prevented;
      if(!p.preview&&prevented>0){guard.lockedAttackId=p.attackId;guard.lockedRootId=p.rootActionId;guard.attackerId=p.source.id;guard.remainingCap-=prevented;guard.prevented+=prevented;}
    }
    const escort=liveStatus(e,t,'amy_escort'),amy=owner(e,escort);
    if(escort&&alive(amy)&&escort.activeRoot!=null&&!escort.used&&p.kind==='counter'&&p.protectable!==false){const reduction=Math.min(p.amount*escort.reduction,stat(e,amy,'atk')*escort.capCoef);p.amount-=reduction;if(!p.preview)escort.used=true;}
  }
  function beforeHPDamage(e,p) {
    const s=liveStatus(e,p.target,'mornye_bound'),mor=owner(e,s);if(!s||!alive(mor)||p.amount<=0)return;
    let used=false,finish=false;
    if(p.amount>.30*p.target.maxhp){p.amount=.30*p.target.maxhp;used=true;finish=s.uses<=1;}
    if(p.amount>=p.target.hp){p.amount=Math.max(0,p.target.hp-1);finish=true;}
    if(!p.preview){if(used)s.uses--;if(finish){remove(e,p.target,'mornye_bound');p.afterDamage=p.afterDamage||[];p.afterDamage.push(()=>{if(alive(p.target)&&alive(mor))e.heal(mor,p.target,40+.40*stat(e,mor,'def'));});}}
  }
  function afterEnemyRoot(e,c) {
    const enemy=c.actor || c.source;
    for(const t of all(e)){
      const s=liveStatus(e,t,'mornye_guard');if(!s||!s.lockedAttackId||s.lockedRootId!==c.rootActionId)continue;
      const mor=owner(e,s),attacker=get(e,s.attackerId),prevented=s.prevented;remove(e,t,'mornye_guard');
      if(prevented>0&&alive(mor)){
        mor.cooldowns=mor.cooldowns||{};if(mor.cooldowns.E1!=null)mor.cooldowns.E1=Math.max(e.round+1,mor.cooldowns.E1-1);
        if(alive(attacker))e.damage(mor,attacker,{coef:1.10,base:1.10*stat(e,mor,'def'),element:'热熔',category:'skill',kind:'counter',q:0,ctx:c});
      }
    }
    if(!enemy||c.skipped||c.completed===false||c.kind==='counter'||!alive(enemy))return;
    const field=liveStatus(e,enemy,'havoc_field'),src=owner(e,field);
    if(field&&alive(src)){e.damage(src,enemy,{base:field.coef*field.atkSnapshot,atkSnapshot:field.atkSnapshot,levelSnapshot:field.levelSnapshot,element:'湮灭',category:'field',kind:'field',canCrit:false,q:0,snapshotSourceBonuses:true,damageBonus:field.damageBonusSnapshot||0});if(alive(enemy)&&status(enemy,'havoc_field')){field.uses--;if(field.uses<=0)remove(e,enemy,'havoc_field');}}
  }
  function onActionEnd(e,a,c) {if(c&&c.skill&&c.skill.generic&&c.key!=='wait'){remove(e,a,'amy_quick');remove(e,a,'lynae_empowered');if(keyOf(a)==='mornye')clearOwned(e,a,['mornye_guard']);}}
  function afterCounterQueue(e,c) {const s=liveStatus(e,c.actor,'amy_escort');if(s&&s.activeRoot===c.rootActionId)remove(e,c.actor,'amy_escort');}
  function capacity(e,t,k) {
    let bonus=0;
    for(const s of Object.values(t.status||{}))if(s&&s.capStatus===k&&(s.expires==null||s.expires>=e.round)&&alive(owner(e,s)))bonus=Math.max(bonus,s.capBonus||0);
    return (ABNORMAL[k]?ABNORMAL[k].cap:0)+bonus;
  }
  function addCapacity(e,src,t,k,n,duration,prefix,ctx) {
    if(!ABNORMAL[k])return null;
    return put(e,t,`${prefix}:${k}:${src.id}`,src,duration,{name:`${ABNORMAL[k].name}容量+${n}`,capStatus:k,capBonus:n},ctx);
  }
  function trimCapacity(e,t) {for(const k of Object.keys(ABNORMAL)){const s=status(t,k);if(s)s.stacks=Math.min(s.stacks,capacity(e,t,k));}}
  function applyAbnormal(e,src,t,k,n,opts={}) {
    if(!alive(src)||!alive(t)||!ABNORMAL[k]||!(n>0))return false;
    const immune=t.statusImmunity || t.abnormalImmunity || t.abnormal_immunity;
    if(immune===true || (Array.isArray(immune)&&immune.includes(k)) || (immune&&immune[k]))return false;
    if(k==='aero_erosion'&&opts.active)for(const ally of team(e,src)){const aura=liveStatus(e,ally,'aero_cap_aura');if(aura)addCapacity(e,ally,t,k,2,aura.expires-e.round+1,'aero_capacity',opts.ctx);}
    const old=status(t,k),def=ABNORMAL[k];
    const s=put(e,t,k,src,def.duration,{stacks:Math.min(capacity(e,t,k),(old?old.stacks:0)+n),owner_ATK_snapshot:stat(e,src,'atk'),owner_level_snapshot:src.level,owner_actor_id:src.id,last_tick_round:old?old.last_tick_round:null,derived_status:!opts.active},opts.ctx);
    log(e,'abnormal_apply',{source:src.id,target:t.id,status:k,stacks:s.stacks,active:!!opts.active,rootActionId:opts.ctx&&opts.ctx.rootActionId});
    // Successful positive applications count even at capacity; conversion never enters this hook.
    if(opts.active){const marrow=liveStatus(e,src,'electro_marrow'),giver=owner(e,marrow);if(marrow&&alive(giver)&&giver.id!==src.id){remove(e,src,'electro_marrow');e.restoreSP(giver,src,marrow.amount);}}
    if(k==='fusion_burst'&&!opts.noBurst&&s.stacks>=capacity(e,t,k))burst(e,t,opts.ctx);
    return true;
  }
  function burst(e,t,c) {
    const s=status(t,'fusion_burst');if(!s||!s.stacks||!alive(t))return false;
    const src=owner(e,s);if(!alive(src)){remove(e,t,'fusion_burst');return false;}
    const base=.15*s.stacks*s.owner_ATK_snapshot,others=groupMembers(e,t).filter(x=>x!==t);
    remove(e,t,'fusion_burst');
    const p={base,element:'热熔',category:'abnormal',kind:'status',canCrit:false,q:0,atkSnapshot:s.owner_ATK_snapshot,levelSnapshot:s.owner_level_snapshot,ignoreSourceBonuses:true,ctx:c};
    e.damage(src,t,p);for(const x of others)if(alive(x))e.damage(src,x,{...p,base:base*.5});
    log(e,'fusion_burst',{source:src.id,target:t.id,base});return true;
  }
  function abnormalImmune(t,k) {const v=t.statusImmunity || t.abnormalImmunity || t.abnormal_immunity;return v===true || (Array.isArray(v)&&v.includes(k)) || !!(v&&v[k]);}
  function conversionPreview(e,a,t,k) {
    const source=status(t,k),wind=status(t,'aero_erosion'),cap=capacity(e,t,'aero_erosion');
    const x=!abnormalImmune(t,'aero_erosion') && ['spectro_frazzle','fusion_burst','havoc_bane','electro_flare'].includes(k)&&source?Math.min(3,source.stacks,Math.max(0,cap-(wind?wind.stacks:0))):0;
    return {from:k,move:x,sourceRemaining:source?source.stacks-x:0,windAfter:(wind?wind.stacks:0)+x,capacity:cap,newOwner:x?a.id:wind&&wind.ownerId||null};
  }
  function convertAbnormal(e,a,t,k,c) {
    const preview=conversionPreview(e,a,t,k),x=preview.move;if(!x)return preview;
    // Atomic, silent transfer: no application callbacks, no source burst, no new cap aura.
    const s=status(t,k);s.stacks-=x;if(s.stacks<=0)remove(e,t,k);
    applyAbnormal(e,a,t,'aero_erosion',x,{active:false,noBurst:true,ctx:c});
    log(e,'abnormal_convert',{source:a.id,target:t.id,...preview,derived_status:true});return preview;
  }
  function roundEnd(e) {
    const fields=[];for(const u of all(e))for(const [key,s] of Object.entries(u.status||{}))if(s&&s.roleField&&s.expires>=e.round)fields.push({u,key,s});
    fields.sort((a,b)=>a.s.order-b.s.order);
    for(const {u,key,s} of fields){const src=owner(e,s);if(!alive(src)||!alive(u))continue;
      if(key==='mornye_field'){
        const targets=team(e,src).slice().sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp || (a.slot||0)-(b.slot||0));
        if(targets[0])e.heal(src,targets[0],(30+.25*stat(e,src,'def'))*(s.strong?1.40:1));
      }
      if(key==='denia_field')for(const t of enemies(e,src)){
        e.damage(src,t,{base:.45*s.atkSnapshot,atkSnapshot:s.atkSnapshot,levelSnapshot:s.levelSnapshot,element:'热熔',category:'liberation',kind:'field',canCrit:false,q:0});
        if(alive(t)){if(s.fusion)applyAbnormal(e,src,t,'fusion_burst',1,{active:false});else put(e,t,'strain_shift',src,2,{});}
      }
    }
    const ticks=[];for(const t of (e.enemies||[]).filter(alive).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id))))for(const k of ['spectro_frazzle','aero_erosion','electro_flare']){const s=status(t,k);if(s&&s.expires>=e.round&&s.last_tick_round!==e.round)ticks.push({t,k,token:s.token});}
    for(const {t,k,token} of ticks){const s=status(t,k);if(!alive(t)||!s||s.token!==token)continue;const src=owner(e,s);if(!alive(src)){remove(e,t,k);continue;}s.last_tick_round=e.round;
      e.damage(src,t,{base:ABNORMAL[k].factor(s.stacks)*s.owner_ATK_snapshot,atkSnapshot:s.owner_ATK_snapshot,levelSnapshot:s.owner_level_snapshot,element:ABNORMAL[k].element,category:'abnormal',kind:'status',canCrit:false,q:0,ignoreSourceBonuses:true});
      if(!alive(t)||!status(t,k))continue;
      if(k==='spectro_frazzle'){if(liveStatus(e,t,'spectro_echo_hold'))remove(e,t,'spectro_echo_hold');else s.stacks--;}
      if(k==='electro_flare')s.stacks=Math.floor(s.stacks/2);
      if(s.stacks<=0)remove(e,t,k);
    }
    for(const u of all(e))for(const [k,s] of Object.entries(u.status||{}))if(s&&s.roleEffect&&s.expires!=null&&s.expires<=e.round)remove(e,u,k);
    for(const u of all(e)){trimCapacity(e,u);syncForm(e,u);}
  }
  function syncForm(e,u) {
    const id=keyOf(u);
    if(id==='amy'&&u.r2Pending)u.form='mech';
    if(id==='denia'&&u.r2Pending)u.form='blue';
    if(id==='lynae'&&!status(u,'lynae_cruise'))u.form='sampling';
    if(id==='mornye'&&!status(u,'mornye_air'))u.form='ground';
    if(id==='chisa'&&!status(u,'chisa_saw'))u.form='scissors';
    if(id==='rover_havoc'&&!status(u,'dark_surge'))u.form='normal';
    if(id==='rover_electro'&&!status(u,'critical_resonance'))u.form='normal';
  }
  function onDown(e,u) {
    for(const t of all(e))for(const [k,s] of Object.entries(t.status||{}))if(s&&s.roleEffect&&(t.id===u.id||s.ownerId===u.id))remove(e,t,k);
    if(keyOf(u)==='amy'&&u.r2Pending)u.form='mech';else if(keyOf(u)==='denia'&&u.r2Pending)u.form='blue';else if(DEFAULT_FORM[keyOf(u)])u.form=DEFAULT_FORM[keyOf(u)];
    for(const t of all(e)){trimCapacity(e,t);syncForm(e,t);}
  }
  const ROLE_FORMS={amy:['human','mech'],lynae:['sampling','cruise'],mornye:['ground','air'],denia:['red','blue'],chisa:['scissors','saw'],rover_spectro:['normal'],rover_havoc:['normal','dark_surge'],rover_aero:['normal'],rover_electro:['normal','critical']};
  function validateState(e) {
    const fail=message=>{throw new Error(`角色状态快照无效：${message}`);};
    const number=(v,lo=0,hi=1e12)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
    const integer=(v,lo=0,hi=1e12)=>Number.isInteger(v)&&v>=lo&&v<=hi;
    const ids=new Set(all(e).map(u=>u.id));
    const common=['id','key','name','description','roleEffect','ownerId','sourceId','expires','token','order','appliedRound'];
    const special={
      amy_quick:['uses'],amy_escort:['uses','reduction','capCoef','activeRoot','used'],
      lynae_r_support:['uses'],lynae_empowered:['uses'],
      mornye_field:['roleField','strong'],mornye_field_def:['pct'],
      mornye_guard:['remainingCap','lockedAttackId','lockedRootId','prevented','attackerId'],
      mornye_bound:['uses'],mornye_interference:['amount'],mornye_support:['uses','amount'],
      denia_group:['groupId'],denia_spill:['uses'],denia_field:['roleField','atkSnapshot','levelSnapshot','fusion'],
      chisa_unravel_mark:['lastTriggeredRound'],chisa_wanlv:['uses'],spectro_echo_hold:['uses'],
      stasis_delay:['uses'],role_slow:['startsRound','pct'],havoc_field:['uses','coef','atkSnapshot','levelSnapshot','damageBonusSnapshot'],
      electro_relay:['uses'],electro_marrow:['uses','amount']
    };
    const abnormalFields=['stacks','owner_ATK_snapshot','owner_level_snapshot','owner_actor_id','last_tick_round','derived_status'];
    for(const u of all(e)){
      const id=keyOf(u);if(u.side==='ally'&&ROLE_FORMS[id]&&!ROLE_FORMS[id].includes(u.form))fail('未知形态');
      if(u.roleState!=null){if(typeof u.roleState!=='object'||Array.isArray(u.roleState)||Object.keys(u.roleState).some(k=>k!=='boundGranted')||('boundGranted'in u.roleState&&typeof u.roleState.boundGranted!=='boolean'))fail('未知角色战斗记录');}
      if(u.r2Pending && ((id==='amy'&&u.form!=='mech')||(id==='denia'&&u.form!=='blue')))fail('待续R2形态不匹配');
      for(const [k,s] of Object.entries(u.status||{})){
        if(!s || !s.roleEffect)continue;
        const cap=/^(chisa_capacity|aero_capacity):/.test(k);
        if(!NAMES[k]&&!ABNORMAL[k]&&!cap)fail('未知状态');
        if(s.roleEffect!==true||s.key!==k||s.id!==k||!ids.has(s.ownerId)||s.sourceId!==s.ownerId)fail('状态身份或来源不匹配');
        if(!alive(owner(e,s))||!alive(u))fail('离场来源或目标仍持有状态');
        if(!integer(s.token,1)||!integer(s.order,1)||!integer(s.appliedRound,0,e.round))fail('状态时钟无效');
        if(s.expires!==null&&!integer(s.expires,e.round,e.round+4))fail('状态期限无效');
        if(s.expires===null&&!['amy_quick','lynae_empowered','mornye_guard'].includes(k))fail('非法永久状态');
        const allowed=new Set([...common,...(ABNORMAL[k]?abnormalFields:cap?['capStatus','capBonus']:special[k]||[])]);
        if(Object.keys(s).some(x=>!allowed.has(x)))fail('未知状态字段');
        for(const required of [...common,...(ABNORMAL[k]?abnormalFields:cap?['capStatus','capBonus']:special[k]||[])])if(required!=='used'&&!Object.prototype.hasOwnProperty.call(s,required))fail('缺少必要状态字段');
        if(typeof s.name!=='string'||typeof s.description!=='string')fail('状态说明类型无效');
        const requiredOwners={amy_quick:'amy',amy_escort:'amy',lynae_cruise:'lynae',lynae_chase:'lynae',lynae_paint:'lynae',lynae_r_support:'lynae',lynae_empowered:'lynae',mornye_air:'mornye',mornye_field:'mornye',mornye_field_def:'mornye',mornye_guard:'mornye',mornye_bound:'mornye',mornye_observation:'mornye',mornye_interference:'mornye',mornye_support:'mornye',denia_group:'denia',denia_spill:'denia',denia_field:'denia',chisa_saw:'chisa',chisa_unravel_mark:'chisa',chisa_wanlv:'chisa',spectro_echo_hold:'rover_spectro',dark_surge:'rover_havoc',havoc_field:'rover_havoc',aero_cap_aura:'rover_aero',critical_resonance:'rover_electro',electro_relay:'rover_electro',electro_marrow:'rover_electro'};
        if(requiredOwners[k]&&keyOf(owner(e,s))!==requiredOwners[k])fail('状态来源角色不匹配');
        if(k==='mornye_support'&&![.12,.15,.18,.20].includes(s.amount)||k==='mornye_interference'&&s.amount!==.12||k==='mornye_field_def'&&s.pct!==.10||k==='electro_marrow'&&![12,16,20,24].includes(s.amount)||k==='havoc_field'&&![.9,1.26,1.575,1.845].includes(s.coef))fail('状态强度不匹配');
        if(k==='amy_escort'&&[.60,.85,1.10,1.35][[.25,.35,.45,.55].indexOf(s.reduction)]!==s.capCoef)fail('护航档位不匹配');
        if(cap&&(k.startsWith('aero_capacity:')&&(s.capStatus!=='aero_erosion'||s.capBonus!==2||keyOf(owner(e,s))!=='rover_aero')||k.startsWith('chisa_capacity:')&&(s.capBonus!==1||keyOf(owner(e,s))!=='chisa')))fail('扩容来源或强度不匹配');
        if(['amy_quick','lynae_cruise','lynae_empowered','mornye_air','mornye_field','denia_field','chisa_saw','chisa_wanlv','dark_surge','aero_cap_aura','critical_resonance'].includes(k)&&u.id!==s.ownerId)fail('自身状态载体不匹配');
        if((ABNORMAL[k]||cap||['rupture_shift','strain_shift','lynae_paint','mornye_observation','mornye_interference','denia_group','chisa_unravel_mark','spectro_echo_hold','stasis_delay','role_slow','havoc_field'].includes(k))&&u.side===owner(e,s).side)fail('敌方状态载体不匹配');
        if(['amy_escort','lynae_r_support','electro_relay','electro_marrow'].includes(k)&&u.id===s.ownerId)fail('支援状态不能授予本人');
        if(s.uses!==undefined&&!integer(s.uses,1,k==='mornye_bound'?3:k==='havoc_field'?2:1))fail('次数无效');
        for(const x of ['amount','pct','remainingCap','prevented','atkSnapshot','owner_ATK_snapshot','damageBonusSnapshot','coef','capCoef','reduction'])if(s[x]!==undefined&&!number(s[x]))fail('状态数值无效');
        for(const x of ['levelSnapshot','owner_level_snapshot'])if(s[x]!==undefined&&!integer(s[x],1,90))fail('快照等级无效');
        if(s.pct!==undefined&&s.pct>.25)fail('属性比例超出上限');
        if(s.reduction!==undefined&&s.reduction>.55)fail('护航减伤超出上限');
        if(s.capCoef!==undefined&&s.capCoef>1.35)fail('护航上限超出范围');
        if(s.startsRound!==undefined&&!integer(s.startsRound,e.round,e.round+1))fail('状态起效轮无效');
        if(s.lastTriggeredRound!==undefined&&!integer(s.lastTriggeredRound,-1,e.round))fail('根触发轮无效');
        if(s.last_tick_round!=null&&!integer(s.last_tick_round,0,e.round))fail('异常跳伤轮无效');
        if(s.attackerId!=null&&!ids.has(s.attackerId))fail('格挡攻击者无效');
        if(cap&&(!ABNORMAL[s.capStatus]||![1,2].includes(s.capBonus)||!k.endsWith(`:${s.capStatus}:${s.ownerId}`)))fail('异常容量无效');
        if(ABNORMAL[k]&&(!integer(s.stacks,1,capacity(e,u,k))||s.owner_actor_id!==s.ownerId||!number(s.owner_ATK_snapshot)||!integer(s.owner_level_snapshot,1,90)))fail('异常层数或归属快照无效');
        if(k==='denia_group'&&(typeof s.groupId!=='string'||!s.groupId.length))fail('归群身份无效');
        for(const x of ['strong','fusion','used','derived_status'])if(s[x]!==undefined&&typeof s[x]!=='boolean')fail('状态标志无效');
        if(k==='mornye_field'&&s.roleField!==true||k==='denia_field'&&s.roleField!==true)fail('场时钟无效');
      }
    }
    return true;
  }
  return {validateState,roleUnitFields:['form','roleState'],roleEngineFields:['_roleStatusSerial','_roleOrder'],describeStatus,version:'0.4',cardCount:Object.values(SLOTS).reduce((n,x)=>n+x.length,0),cardCoverage:SLOTS,init,preview,validate,choices,prepare,beforeAttack,afterHit,afterAttack,afterRoot,onBreak,afterBreaks,modifiers,statModifiers,beforeIncomingDamage,beforeHPDamage,afterEnemyRoot,onActionEnd,afterCounterQueue,roundEnd,onDown,onLeave:onDown,applyAbnormal,addCapacity,capacity,conversionPreview,convertAbnormal,burst};
});
