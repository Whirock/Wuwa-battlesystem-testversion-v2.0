/* Pure presentation of the normalized runtime DSL. No battle simulation and no HTML.
 * Callers MUST escape the returned text before inserting it into HTML.
 * configure() must be refreshed whenever the candidate/data version changes. */
(function (root) {
  'use strict';
  let catalogue = {};
  const labels = {
    aemeath:'爱弥斯',lynae:'琳奈',mornye:'莫宁',denia:'达妮娅',chisa:'千咲',COMMON_A:'普通攻击',COMMON_D:'基础防御',
    energy:'能量',concerto:'协奏',sync:'同步',resonance_rate:'谐振率',rate:'谐振率',color_energy:'色能',true_color:'本色',relative_motion:'相对运动',reserve:'储备',conversion:'转化',conversion_progress:'转化进度',saw_remaining:'锯剩余量',saw_spent:'已支付锯量',
    action:'行动',deploy:'部署',mode:'模态',activation:'主动激活',passive:'被动',card:'卡牌',exhaust:'耗尽区',discard:'弃牌堆',hand:'手牌',draw:'抽牌堆',draw_top:'抽牌堆顶',draw_bottom:'抽牌堆底',deployed:'部署区',resolving:'结算区',
    fusion:'聚爆',fusion_burst:'聚爆',shock:'震谐·shock',tune:'集谐·tune',havoc:'湮灭',neutral:'无属性',glacio:'冷凝',electro:'导电',aero:'气动',spectro:'衍射',direct:'直接',basic:'普攻',resonance_skill:'共鸣技能',liberation:'共鸣解放',anomaly:'异常',break:'共振破坏',interference:'干涉',utility:'辅助',
    form:'形态',route:'路线',phase:'阶段',stance:'姿态',overload:'过载',release_window:'释放窗口',human:'人形',mech:'机兵',normal:'常态',response_ready:'响应就绪',AERIAL:'空中',GROUND:'地面',
    self_body:'自身共享身体',owner_template:'本技能所属角色',active_template:'当前模态角色',next_template_bound:'绑定的下一模态角色',chosen_enemy:'选定敌人',chosen_ally_body:'选定友方身体',all_enemies:'所有敌人',all_allies:'所有友方身体',deployment_owner:'部署所属身体',event_actor:'事件行动者',event_target:'事件目标',enemy_group:'主目标所在敌群',fixed_entities:'已锁定目标',cards:'所选卡牌',
    actor:'行动者',owner:'所属角色',active:'当前模态',target:'目标',body:'共享身体',body_id:'身体标识',role_id:'角色',private:'私池',history:'历史记录',contributors:'贡献来源',count:'数量',alive:'存活',status:'状态',stacks:'层数',progress:'进度',intent:'敌招',hit_count:'段数',skill:'技能',level:'等级',battle:'战斗',encounter:'场景',grouping_enabled:'允许聚怪',root_snapshot:'行动开始时快照',context:'本次结算',payment:'已实际支付',damage:'伤害',heal:'治疗',tags:'标签',element:'属性',kind:'类型',branch_id:'分支',ability_role_id:'技能所属角色',ability_hit_count:'技能段数',event:'事件',skill_id:'技能',switch:'切换',full_handoff:'完整交接',to_role_id:'切入角色',deployment:'部署',selected_deployment:'所选部署',paid_snapshot:'付费时快照',locked_target_dead:'锁定目标已死亡',remaining_uses:'剩余次数',selected_target_entity_ids:'选定目标',target_entity_ids:'目标集合',exists:'存在',definition_id:'定义',on_leave_destination:'离场去向',
    player_start:'我方回合开始',player_end:'我方回合结束',enemy_start:'敌方回合开始',enemy_end:'敌方回合结束',battle_end:'战斗结束',to_next_player_end:'至下个我方回合结束',next_root_action:'从下次行动开始',rounds:'回合数',boundary:'到期时点',expires_on_owner_exit:'所属角色退场时到期',duration:'持续',duration_rounds:'持续回合',uses:'次数',
    scaled_attack:'技能等级缩放后的来源攻击力',attack:'攻击力',flat:'固定值',source_damage:'来源伤害加成',target_damage:'目标承伤修正',cap_hit:'限制单段伤害',prevent_death:'避免致死',
    resource_id:'资源',amount:'数量',value:'值',token_id:'凭证',status_id:'状态',modifier_id:'修正',axis_id:'状态轴',coefficient_bp:'攻击系数（万分比）',flat_amount:'固定附加值',basis:'计算基准',damage_tags:'伤害标签',simultaneous:'同时结算',damage_filter:'适用伤害条件',amount_bp:'比例（万分比）',lane:'修正区间',policy:'规则',cap_bp:'上限比例（万分比）',on_consumed_heal:'消耗后治疗系数（万分比）',source_limit_per_battle:'每场来源次数上限',starts:'生效起点',
    selection:'选取方式',player:'由玩家选择',random:'随机',all:'全部',min:'最少',max:'最多',zones:'来源牌区',zone:'牌区',on_insufficient:'数量不足时',illegal:'禁止使用',up_to:'至多选择现有数量',exclude_origin_instance:'排除本牌',card_definition_id:'卡牌定义',owner_role_id:'所属角色',allow_dead:'允许死亡目标',snapshot:'锁定时点',root:'行动开始',primary_selector_id:'主目标选择',selector_id:'选择项',entity_ids:'目标',
    deployment_selector:'部署选择',context_current:'当前部署',by_stacking_key:'按共享槽查找',created_by_effect:'本次效果创建的部署',creator_effect_id:'创建效果',expected_definition_id:'要求的部署定义',stacking_key:'共享槽',source_card_instance:'来源卡实体',origin:'本牌',same_instance:'同一张实体牌',effect_only:'无实体牌',paid_activation_snapshot:'付费激活快照',fixed_target_selector:'固定目标选择',destination:'去向',reason:'原因',consumed:'已消耗',expired:'已到期',replaced:'已替换',
    payload:'附加数据',source_policy:'来源归属',original_owner:'原始所属角色',beneficiary_binding:'受益者绑定',beneficiary_role_id:'受益角色',beneficiary_body_id:'受益身体',route_snapshot:'路线快照',preserve_usage_marks:'保留已使用次数',max_cards:'最多卡数',source_cost_reference:'保留所需费用依据',group_id:'群组',elevation:'高度',event_type:'事件类型',history_id:'历史记录',intent_id:'敌招标识',current:'当前',delay:'延后',reduce:'削减',interrupt:'打断',cancel:'取消',
    per_battle:'每场最多',per_round:'每回合最多',per_root_action:'每次行动最多',per_deployment:'每个部署最多',limit_key:'共享次数标识',limit_id:'次数标识',count_selected:'所选数量',resource_cap:'资源上限',contributor_count:'贡献来源数量',zone_count:'符合条件的牌数',deployment_exists:'存在部署',status_stacks:'状态层数',
    learned_skill:'已学习技能',learned_inherent:'已学习固有技能',token:'凭证',tag:'标签',no_card_instance:'不产生实体牌',minimum_skill_level:'最低技能等级',card_after_resolution:'结算后牌区',after_resolution:'结算后',default_disposal:'默认去向',base_dispose:'基本去向',disposal:'去向',repeated_current_mode:'重复打出当前模态',requires_owner_active:'要求所属角色为当前模态',unlearned_effect:'未学习时效果',trigger_only:'仅触发使用',target_choices:'目标选项',choices:'附加选择',mode_target_role_id:'切入模态',replaces:'替代项',usage_counter_id:'次数共享标识',lifecycle:'生命周期',scope:'范围',resolution_binding:'结算绑定',off_template_policy:'非当前模态规则',ownership:'所有权',normal_damage_source:'普通伤害来源',effective_type_field:'实际类型依据',
    gather_target_ids:'聚怪目标',chosen_card:'选定卡牌',chosen_pair:'选定一对',definition_ids:'可选定义',enemies:'敌人数',movable_only:'仅可移动目标',movability:'可移动性',selector:'选择范围',living_enemies:'存活敌人',living_allies:'存活友方',binding:'绑定',must_exist:'必须存在',on_missing:'缺失时',reference_view:'引用视图',deployment_instance_id:'部署实体',source_role_id:'来源角色',adaptation_notice:'改编说明'
  };
  Object.assign(labels, {max_stacks:'层数上限',max_count:'数量上限',maxcount:'数量上限',expiry:'到期',owner_scope:'所属范围',stacking_policy:'叠加规则',stacking:'叠加规则',replacement:'替换规则',explicit_player_replace:'由玩家明确选择替换',reject_if_present:'已有同槽部署时禁止',replace:'替换已有状态',ignore_live_no_refresh:'已有时忽略且不刷新',owner_exit:'所属角色退场',persist:'保留',body_capacity:'身体部署容量',on_zero_uses:'次数归零时',expire_after_current_activation_or_hook:'当前激活或触发结算结束后到期',source_card_policy:'来源牌规则',activation_ability_ids:'可用激活能力',consume_use_on_activation:'激活时自动扣次数',persist_after_owner_death:'所属身体死亡后保留',exclusive_slot:'互斥槽',exclusive_slot_acquisition_id:'互斥槽学习要求',limit:'次数限制',per_owner_round:'所属方每回合最多',max_live_instances:'存续实例上限',allow_origin_event:'允许创建它的事件触发',consume_deployment_use:'触发时消耗部署次数',DAMAGE_APPLIED:'实际伤害结算后',STATUS_APPLIED:'状态施加后',MODE_SWITCHED:'模态切换后',ACTION_COMMITTED:'行动提交后',HEAL_APPLIED:'治疗结算后',hp_lost:'实际损失生命',actual_heal:'实际治疗量',origin_kind:'来源类型',root_action_id:'行动标识',origin_root_action_id:'创建行动标识',instance_id:'实例标识',status_instance_id:'状态实例标识',accepted_stacks:'实际接受层数',bound_token_count:'绑定凭证剩余数量',player_skill:'玩家技能',npc_skill:'NPC技能',no_use_xp:'不获得使用经验',no_baseline_concerto:'不获得基础协奏',source_owner:'触发来源归属',source_card_policy:'来源牌规则'});
  Object.assign(labels, {"prepare_human": "人形准备", "commit_mech": "机兵兑现", "human_guard": "人形防护", "return_guard": "收势防护", "sample": "取样", "spend_color": "消耗色能", "ordinary_guard": "基础防护", "color_dodge": "色能单击规避", "observe_strike": "观测攻击", "immediate_parry": "立即招架", "bank_protection": "预留防护", "build_reserve": "积累储备", "cash_all": "全部兑现", "leave_one_followup": "留给后继普攻", "prepare_shear": "剪击准备", "spend_one_shear": "消耗一份剪击", "fold_early": "提前收势", "human_prepare": "人形整备", "mech_prepare": "机兵整备", "wing": "光翼攻击", "wing_guard": "光翼防护", "charge": "蓄力", "response": "即刻响应", "response_route": "路线响应", "response_sweep": "横扫响应", "reserve_owned_finisher": "付费保留手中的终结牌", "flight": "付费升空", "paid_gather": "付费牵引聚怪", "set_optics": "部署光学器", "mix": "混色", "hold_impact": "付费保留视觉冲击", "impact": "视觉冲击", "paint": "留下颜料", "parry": "招架", "healing_field": "治疗场", "observation_field": "观测场", "observe": "观测", "break_now": "立即破坏", "solve": "解算", "array": "部署阵列", "proof_array": "凭证阵列", "scenery_prepare": "布景准备", "scenery_guard": "布景防护", "phantasm_convert": "幻灭转化", "scenery_cash": "布景兑现", "exile_all": "全部放逐", "curtain": "终景承诺", "clip": "剪击", "mark": "留下印记", "clip_early": "提前剪击", "start_saw": "启动锯环", "restore_blade": "收回刀势", "restore_saw": "收回锯势", "treatment": "治疗", "woven_prepare": "织构准备", "personal_conversion": "自身转化", "saw_basic": "锯环普攻", "abandon_saw": "放弃锯环余量", "ability": "当前行动能力", "cost": "费用", "energy_cost": "能量费用", "private_cost": "私池费用", "root_ability": "本次行动能力", "flight_permission": "飞行许可", "gather_permission": "聚怪许可"});
  Object.assign(labels, {"value_and_duration": "数量与持续依据", "source_stats_policy": "来源数值规则", "target_mark_slot": "是否占目标标记槽", "stat_policy": "数值快照规则", "target_binding": "目标绑定", "listen_current_root": "是否监听创建它的行动", "snapshot_schema": "快照结构", "extra_concerto_limit": "额外协奏限制", "inherent_id": "固有技能", "overflow": "超出限制时", "shared_extra_cap_with_equipment": "与装备共享的额外上限", "capacity_policy": "容量规则", "missing_owner_or_dead_target": "来源或目标失效时", "source": "来源", "shared_exclusive_slot": "共享互斥槽", "consuming_events": "消耗事件", "normalized_from": "规范化来源", "common_override_scope": "共同规则改写范围", "payload_schema": "附加信息结构", "beneficiary_event_match": "受益者事件匹配", "invalid_target_fallback": "目标失效处理", "additional_state": "附加状态", "activation_use_policy": "激活次数消耗规则", "damage_filters": "伤害筛选", "event_source_policy": "事件来源归属", "no_owned_card_created": "不生成收藏卡", "dead_locked_target_policy": "锁定目标死亡时", "named_mark_budget": "命名标记额度", "trigger_ids": "触发规则标识", "eligible": "合格触发条件", "consumingevents": "消耗事件", "bound_role_id": "绑定角色", "original_expiry": "原始到期时点", "slot": "槽位", "creation_defaults": "创建默认值", "binding_rule": "绑定规则", "max_live": "最多同时存续", "disposal_summary": "牌去向设计说明", "executable": "是否作为执行规则", "authority": "执行依据", "max_uses": "最多次数", "shield_definition": "护盾适用范围", "consume_use": "扣次数方式", "remaining_uses_view": "剩余次数显示来源", "source_lifecycle": "来源生命周期", "instance_binding": "实例绑定", "not_private_resource": "不是私有资源", "filter": "筛选条件", "bonus_lane": "加成区间", "consumption": "消耗规则", "family": "部署系列", "tier": "级别", "hook_target_binding": "触发目标绑定", "creation_round_tick": "创建回合首次触发", "replacement_cost": "替换代价", "source_notice": "来源说明", "target_death": "目标死亡处理", "not_fusion": "非聚爆效果", "no_contribution": "不计来源贡献", "card_id": "卡牌", "healing": "治疗", "discard_logged": "舍弃并记录", "none": "无", "idle": "未启动", "open": "开放", "spent": "已消耗", "overload_wait": "过载待响应", "overload_ready": "过载可响应", "overload_spent": "过载响应已用", "response_spent": "响应已用", "sample": "取样", "cruise": "巡游", "normal": "常态", "scenery": "布景", "phantasm": "幻灭", "illusion": "幻灭", "blade": "刀势", "saw": "锯势", "int": "整数", "bool": "是/否"});
  Object.assign(labels, {"snapshot original source owner ATK/skilllevel when created; current target mitigation; no active-template attribution": "创建时记录原来源的攻击力与技能等级；使用目标当前减伤，不改记为当前模态来源", "snapshot creating original owner ATK/skilllevel; current incoming mitigation": "创建时记录原来源攻击力与技能等级；承伤减免按当前状态计算", "common extra target marks max2; accepted0 TARGET_MARK_CAPACITY on full newkey; no refund": "额外目标标记最多2个；新标记在槽满时不生效、不退款，并记录容量不足", "no later damaging/healing work after body terminal; targetdead effects fizzle": "所属身体终局后不再造成伤害或治疗；目标死亡后的对应效果落空", "only specify previously-required Chisa consequence; common application/expiry unchanged": "仅明确千咲原先要求的效果；共同施加与到期规则不变", "snapshot source owner phase.route at grant": "授予时记录来源角色路线", "body_id captured from actual owner.body_id during fullhandoff": "完整交接时记录来源的真实身体", "role_id captured from immutable context.switch.to_role_id": "绑定实际切入角色，之后不改变", "actual event ability_template_id must equal bound template": "事件实际技能所属模态必须与绑定模态一致", "exact supplying shield operation args, coefficient snapshot atgrant": "数量与持续依施加护盾的实际参数；授予时锁定系数", "CHISA_I1 marked-target defeat; maximum3 successful grants perbattle": "千咲固有一：标记目标被击败时授予，每场最多成功3次", "LYNAE_I2 qualified learned intro": "琳奈固有二：实际已学变奏满足条件时授予", "next Lynae direct spectro root action": "琳奈下一次衍射直接行动", "denia_temporary_grant_slot; denia_fresh_followup and DENIA_ROUTE_GRANT replace each other only when I2 acquired": "达妮娅临时授予共用槽；已学固有二时，初始接力与路线授予互相替换", "snapshot sourceATK/skilllevel atcreation; current target mitigation; temporary buffs excluded from source snapshot": "创建时锁定来源攻击力与技能等级，不把临时增益计入快照；目标减伤按当前状态", "snapshot source ATK and creating skill level; current target mitigation; no ongoing temporary modifier resnapshot": "创建时锁定来源攻击力与该技能等级；目标减伤按当前状态，不重新采样后来的临时增益", "fixed target supplied by origin action": "锁定创建行动指定的目标", "qualifying event target": "满足触发条件的事件目标", "immutable unique tuple from validated root selector; empty only for mobile event-target fields": "使用行动验证后的去重目标集合并锁定；随触发事件选目标的场域可为空", "fusion|tune|null": "聚爆、集谐或无路线", "no substitution": "没有替代收益", "registered finite token grant; one modifier-backed status instance": "已登记的有限凭证授予；由一个修正状态实例承载", "fizzle dead locked target without retarget; voluntary activation requires live declared target unless self protection branch": "锁定目标死亡后效果落空且不重选；主动激活要求指定目标存活，自身保护分支除外", "dead fixed target unavailable, no retarget": "固定目标死亡后不可用，不重选目标", "next later paid player/NPC direct root; original granting root excluded; damage is 4000bp anomaly and never direct": "下一次后续付费的玩家或NPC直接行动触发，排除授予它的行动；追加伤害是攻击系数0.4的异常伤害，不算直接伤害", "enemy ability hit_count==1; first qualifying damage packet only": "只对应单段敌方能力的首个合格伤害包", "matching beneficiary STATUS_APPLIED": "绑定受益者实际施加状态", "B_L_H.hold_impact cost": "琳奈付费保留视觉冲击的费用", "actual next role": "实际切入角色", "immutable round": "已锁定的原始回合", "grant_token next_template_bound records common context.switch.to_template_id and its unique role; body from actual owner body; copied immutable": "凭证绑定实际切入模态与唯一角色，身体来自真实所属身体；记录后不改变", "derived from actual target alive flag, not independent": "从目标真实存活状态读取，不是额外独立计数", "Every nonclosing activation explicitly spends1 original use; explicit close consumes remaining work with one disposal; no automatic activation debit. Automatic hooks retain their separately declared consume flag.": "每次非关闭激活显式消耗原部署1次；关闭时放弃余下工作，实体牌只移动一次；激活不额外自动扣次，自动触发按自己的声明扣次", "original creating template; automatic ticks not direct, no use-XP or baseline concerto": "归属最初创建的模态；自动触发不算直接行动，不获得使用经验或基础协奏", "remaining charges persist to fixed expiry; B_C_I1 one paid re_mark may target new living enemy; no charge refill": "余下次数保留至原定到期；千咲固有一允许一次付费重标存活敌人，不补充次数", "effective card_type plus frozen base/branch keywords or DeploymentDefinition.on_leave_destination": "以实际卡牌类型、基础与分支关键词，或部署定义的离场去向为准", "explicit consume_token op only; remaining_uses is a UI view, never a second stored counter": "只由显式消耗凭证效果扣次；剩余次数仅供显示，不是另一份计数", "only enemy ability hit_count1 first packet; unused on multi-hit; no free consolation": "仅作用于敌方单段能力的首个伤害包；多段不消耗也不生效，没有替代收益", "10000bp fixed irrespective of saw_spent": "护盾攻击系数固定1.0，不随已消耗锯量变化", "hook owner is exact status instance; removed status cannot listen; bound token has identical absolute expiry and cannot bind a replacement instance": "触发绑定原状态实例；状态移除后不再监听，凭证与其同时到期，不转绑替代实例", "observing then breaking grants next direct action modifier; it does not itself claim Mornye interference. Mornye must use her own actual BREAK to count as source.": "观测后破坏授予下一次直接行动修正，本身不计莫宁干涉来源；莫宁必须实际使用自己的破坏才记来源", "does not apply fusion, extend caps, or count fusion contributor": "不施加聚爆、不扩上限，也不计聚爆贡献来源", "first eligible later root once; same root cannot benefit; no role-source contribution": "后续首个合格行动享受一次；创建它的同次行动不能受益，不增加角色来源贡献", "C_CHISA_H.salvage_eye pays1 energy and consumes it; no automatic card generation": "千咲对应回收分支付1能量并消耗该凭证；不会自动生成卡牌", "STATUS_APPLIED accepted>0 event.status_instance_id; unique per status instance, never template current": "绑定实际成功施加的状态实例；每个状态实例独立，不随当前模态改变", "event_target in deployment hook is prebound fixed target, not a new player choice": "部署触发中的事件目标使用预先绑定目标，不重新让玩家选取", "fixed_entities reads context.deployment.paid_snapshot.target_entity_ids; event_target keeps the actual event target": "固定目标来自付费时保存的目标集合；事件目标仍使用真实事件目标", "first PLAYER_TURN_END after creation; never on DEPLOYMENT_CREATED or creating root action": "创建后的首个我方回合结束时触发，不在部署创建事件或创建行动中触发", "PLAYER_TURN_END after creation, not creating root": "创建后的我方回合结束时触发，不在创建行动中触发", "discard all unused old ticks; old card follows its original printed exit destination; no return of energy/private costs": "放弃旧部署所有未用次数；旧牌按原离场去向移动，不退能量或私池费用", "R first destroys existing field and forfeits its remaining uses; new field has exactly2, not old+2": "终结先关闭原场并放弃余下次数；新场恰为2次，不在原次数上加2", "TARGET_DIED closes this exact field when its saved target dies; creating-root death is checked explicitly after deployment; original printed leave zone, no retarget or refund": "保存目标死亡时关闭这个场；创建行动击杀目标时也在部署后检查；按原定牌区离场，不换目标、不退款"});
  Object.assign(labels,{disillusion:'幻灭',scenic:'布景',entropy:'熵阶段',dormant:'未启动',resonance:'共振',PLAYER_TURN_END:'我方回合结束',TARGET_DIED:'目标死亡',DEPLOYMENT_CREATED:'部署创建后',root_ability:'本次行动能力',damage_applied:'实际伤害'});
  Object.assign(labels, {"reject_OWNER_NOT_ACTIVE; no silent generic fallback": "所属角色不是当前模态时不可用，不自动变成通用牌", "one card instance on learning; extra copies require COPY_ACQUIRED receipt": "学习取得一张实体牌，额外副本需要真实取得记录", "selected branch; no card copy": "采用所选分支类型，不复制卡牌", "mixed and Boss-only attempts permitted; at most3successfulMOVABLE percommonaddendum": "可选择混合敌群或仅选头目尝试；按空间规则最多成功牵引3个可移动目标", "SYSTEM_CONTRACT.resources.full_concerto_switch plus repeat/ordinary/first activation rules": "遵循满协奏交接，以及重复、普通切换和初次激活的共同规则", "legal zero-effect card consumption, no MODE_SWITCHED": "允许打出但无额外效果，仍消耗卡牌，不产生实际模态切换事件", "only qualified full-concerto handoff; never ordinary/repeat/first-neutral mode": "仅在满足条件的满协奏交接中触发；普通切换、重复模态和中立初次激活不触发", "status.original_owner_template_id, never active_template": "归属状态原始所属模态，不归当前激活模态", "actual DENIA_R.r1 after payment and primed entry, I2 learned": "达妮娅实际支付R1费用并进入准备阶段后触发，要求已学固有二", "next qualifying real fusion direct OR tune break root, route bound when granted": "下一次合格的聚爆路线直接行动或集谐破坏行动；路线在授予时绑定", "root ability energy/private cost": "本次行动实际支付的能量与私池费用", "committed as part of mode action before concerto payment": "作为模态行动的一部分，在支付协奏前确定", "replace same Chisa mark key with lost old remainder": "替换千咲同键标记，放弃旧标记余下次数", "common no stack/no refresh while present": "已有时不叠加，也不刷新", "actual new application from Chisa mark": "来自千咲标记的真实新施加", "frozen selected enemy IDs": "锁定已选敌人", "creating owner route when present": "记录创建者当时的路线（若有）", "B_A_HANDOFF actual beneficiary route status event": "爱弥斯交接中实际受益者施加路线状态的事件", "C6 burst-field inspiration only; consumes all actual stacks, unlike source nonremoval. Late paid card-native cashout, no six-chain unlock ladder.": "仅借鉴原作高链场域设计；本改编会消耗真实全部层数。属于后期付费卡牌兑现，不采用六链解锁阶梯", "common prepaid6 handoff only; neutral entry/repeated mode absent; target IDs must be included in mode action preview; no mode or passive XP": "仅用于预付6协奏的真实交接；中立激活和重复模态不触发；模态动作须明确目标，不给予模态或被动使用经验", "no branch; optional lower-damage advanced preparation alternative": "这是可选的较低伤害高级准备替代，不是免费追加分支收益", "optional alternative, not automatic bonus to ordinary attack": "可选替代效果，不自动叠加到普通攻击", "while saw phase all fresh COMMON_A branches unavailable; no saw-phase refill by prepare_shear": "锯阶段不能使用初始通用攻击分支，也不能借剪击准备补充锯量", "fresh fold_early while saw; legal at zero remaining, loses all finisher damage and paid history; not an unlearned rescue": "锯阶段可以提前收势，剩余量为0时也可用；放弃全部终结伤害和已支付历史，不额外取得未学能力", "the explicit consume_token op only; remaining_uses is a UI view, never a second stored counter": "仅由显式消耗凭证效果扣次；剩余次数只供显示，不另存第二份计数", "next eligible direct root only; no role contribution": "仅下一次合格直接行动受益，不额外计入角色贡献来源", "next direct root by the bound actual role with hp_lost>0; full absorption/immune does not consume or extend expiry": "绑定角色的下一次直接行动实际造成生命损失时消耗；完全吸收或免疫时不消耗，也不延长到期", "same absolute expiry as originating status instance": "与来源状态实例在同一时点到期", "R source attack and R skill level at creation": "创建时终结技能的来源攻击力与技能等级"});
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  function label(x) {
    if (x === null || x === undefined) return '无';
    const k=String(x), configured=catalogue.labels && own(catalogue.labels,k) && catalogue.labels[k];
    if (configured) return String(configured);
    for (const family of ['abilities','roles','statuses','tokens','deployments','modifiers','inherents']) {
      const d=catalogue[family] && catalogue[family][k];
      if (d && (d.name_zh || d.name)) return d.name_zh || d.name;
    }
    if(own(labels,k))return labels[k];
    const circuit=k.match(/^(?:[ABC]_)?(AEMEATH|LYNAE|MORNYE|DENIA|CHISA)_CIRCUIT$/);if(circuit)return label(circuit[1].toLowerCase())+'高级回路';
    const field=k.match(/^DENIA_FIELD_(FUSION|TUNE)_(\d+)$/);if(field)return `达妮娅·${field[1]==='FUSION'?'聚爆':'集谐'}场·${field[2]}`;
    return k;
  }
  function parameters(o, excluded=[]) {
    return Object.entries(o || {}).filter(([k])=>!excluded.includes(k)).map(([k,v])=>`${labels[k] || '说明待补全·参数 '+k}：${value(v)}`).join('；');
  }
  const missing = (kind,x) => `说明待补全（${kind}${x === undefined ? '' : '；'+parameters(x)}）`;
  function value(v) {
    if (v === undefined) return '说明待补全（缺少数值）';
    if (v === null) return '无';
    if (typeof v === 'boolean') return v?'是':'否';
    if (typeof v !== 'object') return label(v);
    if (Array.isArray(v)) return v.length?v.map(value).join('、'):'无';
    if (own(v,'ref') || own(v,'array_ref')) {
      const path=v.ref ?? v.array_ref;
      return String(path).split('.').map(label).join('·') + extras(v,['ref','array_ref']);
    }
    if (own(v,'calc')) {
      const a=(v.args||[]).map(value); let s;
      switch(v.calc) {
        case 'add':s=a.join(' + ');break; case 'sub':s=a.join(' − ');break; case 'mul':s=a.join(' × ');break;
        case 'floor_div':s=`${a[0]} ÷ ${a[1]}，向下取整`;break;
        case 'min':s=`取最小值：${a.join('、')}`;break; case 'max':s=`取最大值：${a.join('、')}`;break;
        case 'clamp':s=`将 ${a[0]} 限制在 ${a[1]} 至 ${a[2]}`;break;
        default:return missing('计算 '+v.calc,v);
      }
      return `（${s}）`+extras(v,['calc','args']);
    }
    if (own(v,'query')) {
      if (!['resource_cap','contributor_count','zone_count','deployment_exists','count_selected','status_stacks'].includes(v.query)) return missing('查询 '+v.query,v);
      return `${label(v.query)}（${parameters(v,['query'])}）`;
    }
    if (['all','any','not','cmp','has'].some(k=>own(v,k))) return condition(v);
    return parameters(v) || '无';
  }
  function extras(o,used) {const s=parameters(o,used); return s?`；${s}`:'';}
  function condition(p) {
    if (p === true || p === undefined) return '无额外条件';
    if (p === false) return '条件不成立，不能使用';
    if (!p || typeof p!=='object') return missing('条件',{value:p});
    if (own(p,'all')) {const parts=[...new Set(p.all.map(condition).filter(x=>x!=='无额外条件'))];return (parts.length>1?`同时满足（${parts.join('；且 ')}）`:parts[0]||'无额外条件')+extras(p,['all']);}
    if (own(p,'any')) return `满足任一（${p.any.map(condition).join('；或 ')}）`+extras(p,['any']);
    if (own(p,'not')) return `不满足（${condition(p.not)}）`+extras(p,['not']);
    if (own(p,'cmp')) {
      const cmp={eq:'等于',ne:'不等于',lt:'小于',le:'不大于',gt:'大于',ge:'不小于',in:'属于'}[p.cmp];
      return cmp?`${value(p.left)} ${cmp} ${value(p.right)}`+extras(p,['cmp','left','right']):missing('比较 '+p.cmp,p);
    }
    if (own(p,'has')) return ['learned_skill','learned_inherent','status','token','tag'].includes(p.has)?`${label(p.entity||'self_body')}具有${label(p.has)}「${label(p.id)}」`+extras(p,['has','entity','id']):missing('持有条件 '+p.has,p);
    return missing('条件',p);
  }
  function target(s) {
    if (!s) return '无目标';
    if (Array.isArray(s)) return s.map(target).join('；');
    const kinds=['self_body','owner_template','active_template','next_template_bound','chosen_enemy','chosen_ally_body','all_enemies','all_allies','deployment_owner','event_actor','event_target','enemy_group','fixed_entities','cards'];
    if (!kinds.includes(s.kind)) return missing('目标 '+s.kind,s);
    let t=label(s.kind);
    if (s.kind==='chosen_enemy'||s.kind==='chosen_ally_body') t+=`（${value(s.min??1)}–${value(s.max??1)}个）`;
    return t+extras(s,['kind','selector_id',...(['chosen_enemy','chosen_ally_body'].includes(s.kind)?['min','max']:[])]);
  }
  function cost(c={}) {
    const out=[`能量 ${value(c.energy??0)}`];
    for (const p of c.private||[]) out.push(`${label(p.resource_id)} ${value(p.amount)}`+extras(p,['resource_id','amount']));
    for (const p of c.tokens||[]) out.push(`消耗${label(p.token_id)} ${value(p.amount)}`+extras(p,['token_id','amount']));
    if (c.card_choices?.length) out.push(`费用选牌：${value(c.card_choices)}`);
    return out.join('；')+extras(c,['energy','private','tokens','card_choices']);
  }
  function scale(a) {
    let s;
    if (own(a,'coefficient_bp')) s=`${label(a.basis||'scaled_attack')} × ${typeof a.coefficient_bp==='number'?a.coefficient_bp/10000:`（${value(a.coefficient_bp)} ÷ 10000）`}`;
    else if (own(a,'amount')) s=value(a.amount);
    else if (own(a,'flat_amount')) s=value(a.flat_amount);
    else s='说明待补全（缺少数量或系数）';
    if (own(a,'coefficient_bp') && own(a,'flat_amount')) s+=` + ${value(a.flat_amount)}`;
    return `${s}（规则量，实际结果由引擎结算）`;
  }
  const operations={
    damage:['造成伤害',a=>`${scale(a)}${a.element?'；属性：'+(a.element==='fusion'?'热熔':label(a.element)):''}${a.damage_tags?'；伤害标签：'+value(a.damage_tags):''}`,['basis','coefficient_bp','amount','flat_amount','element','damage_tags']],
    block:['获得格挡',scale,['basis','coefficient_bp','amount','flat_amount']],heal:['恢复生命',scale,['basis','coefficient_bp','amount','flat_amount']],shield:['获得护盾',a=>`${label(a.status_id)}，${scale(a)}`,['status_id','basis','coefficient_bp','amount','flat_amount']],
    resource_gain:['获得资源',a=>`${label(a.resource_id)} +${value(a.amount)}`,['resource_id','amount']],resource_spend:['消耗资源',a=>`${label(a.resource_id)} ${value(a.amount)}`,['resource_id','amount']],resource_set:['设置资源',a=>`${label(a.resource_id)} = ${value(a.value??a.amount)}`,['resource_id','value','amount']],
    set_phase:['切换状态',a=>`${label(a.axis_id)} → ${value(a.value)}`,['axis_id','value']],apply_status:['施加状态',a=>`${label(a.status_id)}，${value(a.stacks??1)}层`,['status_id','stacks']],remove_status:['移除状态',a=>label(a.status_id),['status_id']],
    fusion_apply:['施加聚爆',a=>`${value(a.stacks)}层`,['stacks']],fusion_detonate:['引爆聚爆',()=> '消耗目标全部聚爆层数；攻击系数 = 0.4 × 实际层数（实际伤害由引擎结算）',[]],
    resonance_add:['增加共振进度',a=>value(a.amount),['amount']],resonance_offset:['施加共振偏移',a=>value(a.route),['route']],resonance_break:['触发共振破坏',()=> '要求进度已满6；清空进度与偏移，造成攻击系数1的伤害；存在偏移且目标存活时追加攻击系数0.5的干涉伤害；可打断敌招被取消（实际结果由引擎结算）',[]],
    extend_anomaly_cap:['设置聚爆上限',a=>'将目标聚爆层数上限设为 5；重复触发仍为 5，不累加；聚爆引爆后恢复为 3', ['status_id','amount']],
    deploy:['创建部署',a=>label(a.definition_id),['definition_id']],close_deployment:['关闭部署',a=>value(a.deployment_selector),['deployment_selector']],deployment_spend_uses:['消耗部署次数',a=>`${value(a.deployment_selector)}，${value(a.amount)}次`,['deployment_selector','amount']],deployment_retarget:['重新指定部署目标',a=>value(a.deployment_selector),['deployment_selector']],
    retain:['保留选牌',()=> '将该手牌保留至下个我方回合结束；同一身体最多同时保留 2 张',[]],draw:['抽牌',a=>`${value(a.count??a.amount)}张`,['count','amount']],discard:['弃置选牌',()=> '移入弃牌堆',[]],exhaust:['耗尽选牌',()=> '移入耗尽区',[]],recover:['回收选牌',a=>`移入${label(a.destination)}`,['destination']],generate:['生成临时牌',a=>`${label(a.card_definition_id)} × ${value(a.count)}，移入${label(a.destination)}`,['card_definition_id','count','destination']],
    grant_token:['获得凭证',a=>`${label(a.token_id)} × ${value(a.amount)}`,['token_id','amount']],consume_token:['消耗凭证',a=>`${label(a.token_id)} × ${value(a.amount)}`,['token_id','amount']],grant_modifier:['获得修正',a=>`${label(a.modifier_id)}，${label(a.lane)}：${typeof a.amount_bp==='number'?a.amount_bp/100+'%':`（${value(a.amount_bp)} ÷ 10000）`}`,['modifier_id','lane','amount_bp']],
    proof:['获得保命效果',a=>label(a.policy),['policy']],intent_control:['干预敌招',a=>label(a.kind),['kind']],gather:['聚怪',a=>`移入群组 ${label(a.group_id)}`,['group_id']],set_elevation:['改变高度',a=>label(a.elevation),['elevation']],emit_tagged_event:['产生规则事件',a=>label(a.event_type),['event_type']],history_add:['增加历史记录',a=>`${label(a.history_id)} +${value(a.amount)}`,['history_id','amount']],history_reset:['清零历史记录',a=>label(a.history_id),['history_id']],consume_source_set:['消耗贡献来源集合',a=>value(a.route),['route']]
  };
  function effect(e) {
    if (!e || typeof e!=='object') return missing('效果',{value:e});
    const a=e.args||{}, op=own(operations,e.op)?operations[e.op]:null;
    let out=op?`${op[0]}：${op[1](a)}${extras(a,op[2])}`:missing('效果操作 '+e.op,a);
    const gate=condition(e.when);out=`${gate!=='无额外条件'?'若 '+gate+'，则 ':''}对${target(e.target)}：${out}`;
    if (e.tags?.length) out+=`；效果标签：${value(e.tags)}`;
    return out+extras(e,['effect_id','op','args','target','when','tags']);
  }
  function compactEffect(e){return effect(e).replaceAll('技能等级缩放后的来源攻击力','有效攻击力').replaceAll('（规则量，实际结果由引擎结算）','').replaceAll('（实际结果由引擎结算）','').replaceAll(' + 0','').replaceAll('；同时结算：否','').replaceAll('（1–1个）；锁定时点：行动开始','').replaceAll('本次结算·已实际支付·私池·','本次已付').replaceAll('所属角色·私池·','自身').replaceAll('所属角色·阶段·','自身').replaceAll('行动开始时快照·所属角色·私池·','行动开始时自身');}
  const metadata=['id','name','name_zh','description','description_zh','card_definition_id','skill_id','acquisition_id','source_refs','source_anchors','value_kind','source_stats','numeric_growth_record','owned_copies_on_learning','extra_copy_receipt_required','copy_limit','printed_role','effective_source_template','origin','origin_kind','skill_xp','no_mode_XP','xp','xp_policy','source_role_id','owner_role_id'];
  function destination(a,base={}) {
    const type=a.card_type || base.card_type, keywords=[...(base.keywords||[]),...(a.keywords||[])];
    if (a.no_card_instance || base.no_card_instance || ['activation','passive'].includes(a.ability_kind||base.ability_kind)) return '无额外实体牌去向';
    if (type==='deploy') return `同一张实体牌进入部署区；关闭或到期后${keywords.includes('exhaust')?'移入耗尽区':'依部署离场规则移出'}`;
    if (type==='mode') return `切换至${label(a.owner_role_id||base.owner_role_id)}模态；结算后移入${keywords.includes('exhaust')?'耗尽区':'弃牌堆'}`;
    if (type==='action') return `结算后移入${keywords.includes('exhaust')?'耗尽区':'弃牌堆'}`;
    return '说明待补全（未提供卡牌类型，无法确定结算后去向）';
  }
  function section(a,base={},branch=false,brief=false) {
    const out=[`${branch?'追加费用':'基础费用'}：${cost(a.cost)}`,`使用条件：${condition(a.condition)}`];
    const t=a.targets_override||a.targets||base.targets;
    if (t) out.push(`目标：${target(t)}`);
    if (a.usage_limit) out.push(`次数限制：${value(a.usage_limit)}${branch?'；并且仍受基础次数限制':''}`);
    if (a.ability_tags?.length) out.push(`技能标签：${value(a.ability_tags)}`);
    if (a.keywords?.length) out.push(`关键词：${value(a.keywords)}`);
    if (a.choices && Object.keys(a.choices).length) out.push(`附加选择：${value(a.choices)}`);
    if ((a.effects||[]).length) out.push(`按顺序结算：${a.effects.map((e,i)=>`${i+1}. ${brief?compactEffect(e):effect(e)}`).join('；')}`);
    else out.push(branch?'本分支无追加效果':'无基础效果');
    if (branch || !(a.branches||[]).length) out.push(`牌的去向：${destination(a,base)}`);
    const remainder=parameters(a,[...metadata,'condition','cost','targets','targets_override','usage_limit','ability_tags','keywords','choices','effects','branches','ability_kind','card_type','no_card_instance']);
    if (remainder) out.push(remainder);
    return out.join('\n');
  }
  const actionFields=['id','card_type','ability_kind','owner_role_id','cost','condition','targets','targets_override','usage_limit','ability_tags','keywords','choices','effects','no_card_instance'];
  function actionOnly(a){return Object.fromEntries(Object.entries(a||{}).filter(([k])=>actionFields.includes(k)));}
  function selected(a,branchId){return (a.branches||[]).find(b=>b.id===branchId);}
  function describeAction(a,branchId=null){
    if(!a||typeof a!=='object')return '说明待补全（缺少能力定义）';
    const base=actionOnly(a), b=selected(a,branchId), out=[];
    if(a.branches?.length){base.branches=[{}];out.push(section(base,{},false,true));if(b)out.push('所选分支「'+(b.name_zh||label(b.id))+'」；基础费用与追加费用均需支付\n'+section(actionOnly(b),base,true,true));else out.push('请选择一个分支，查看该次行动的完整费用、条件与效果。');}
    else out.push(section(base,{},false,true));
    return out.join('\n')+'\n倍率中的有效攻击力含技能等级缩放；实际结果由引擎结算。';
  }
  function describeSelected(a,branchId=null){const b=selected(a,branchId),lines=[section(a)];if(b)lines.push('所选分支「'+(b.name_zh||label(b.id))+'」；基础费用与追加费用均需支付\n'+section(b,a,true));return lines.join('\n')+'\n'+referencedDefinitions({...a,branches:b?[b]:[]}).join('\n');}
  function describe(a) {
    if (!a || typeof a!=='object') return '说明待补全（缺少能力定义）';
    const out=[section(a)];
    if (a.branches?.length) {
      out.push(`选择一个合法分支；先执行基础效果，再执行所选分支。基础费用与追加费用均需支付（共${a.branches.length}个分支）：`);
      a.branches.forEach((b,i)=>out.push(`分支${i+1}「${b.name_zh||b.name||label(b.id)}」\n${section(b,a,true)}`));
    }
    out.push(...referencedDefinitions(a));
    return out.join('\n');
  }
  function referencedDefinitions(ability) {
    const queue=[], seen=new Set(), out=[];
    function enqueue(family,id) {
      if (!id || typeof id!=='string') return;
      const key=family+':'+id;
      if (!seen.has(key)) {seen.add(key);queue.push([family,id]);}
    }
    function scan(v) {
      if (!v || typeof v!=='object') return;
      if (Array.isArray(v)) {v.forEach(scan);return;}
      if (['apply_status','shield'].includes(v.op)) enqueue('statuses',v.args?.status_id);
      if (v.op==='grant_token') enqueue('tokens',v.args?.token_id);
      if (v.op==='grant_modifier') enqueue('modifiers',v.args?.modifier_id);
      if (v.op==='deploy') enqueue('deployments',v.args?.definition_id);
      Object.values(v).forEach(scan);
    }
    scan(ability);
    while (queue.length) {
      const [family,id]=queue.shift(), d=catalogue[family]?.[id];
      if (!d) {out.push(`关联规则「${label(id)}」：说明待补全（未提供${family}定义；持续、次数与触发不得推测）`);continue;}
      if (family==='abilities') {out.push(`部署激活「${label(id)}」\n${section(d)}`); for(const b of d.branches||[]) out.push(`激活分支「${b.name_zh||b.id}」\n${section(b,d,true)}`);scan(d);continue;}
      const parts=[`关联规则「${label(id)}」`];
      const fields=['duration','expiry','uses','remaining_uses','max_stacks','max_count','maxcount','owner_scope','stacking_policy','stacking','replacement','owner_exit','body_capacity','on_zero_uses','source_card_policy','on_leave_destination','consume_use_on_activation','persist_after_owner_death','exclusive_slot','exclusive_slot_acquisition_id'];
      for (const key of fields) if (own(d,key)) parts.push(`${label(key)}：${value(d[key])}`);
      for (const [key,title] of [['on_deploy_effects','创建时'],['expire_effects','离场时']]) if (d[key]?.length) parts.push(`${title}按顺序：${d[key].map((e,i)=>`${i+1}. ${effect(e)}`).join('；')}`);
      for (const h of d.hooks||[]) {
        parts.push(`触发：${label(h.event)}；条件：${condition(h.condition)}；次数限制：${value(h.limit||{})}；按顺序：${(h.effects||[]).map((e,i)=>`${i+1}. ${effect(e)}`).join('；')}${extras(h,['id','event','condition','limit','effects'])}`);
      }
      if (d.activation_ability_ids?.length) {parts.push(`激活需另付对应能力费用：${d.activation_ability_ids.map(label).join('、')}`);d.activation_ability_ids.forEach(id=>enqueue('abilities',id));}
      const remaining=parameters(d,[...fields,'id','name','name_zh','hooks','on_deploy_effects','expire_effects','activation_ability_ids','source_refs','source_anchors']);
      if (remaining) parts.push(remaining);
      out.push(parts.join('\n'));scan(d);
    }
    return out;
  }
  root.RuleText=Object.freeze({describe,describeAction,describeSelected,value,label,condition,target,cost,effect,configure(c){catalogue=c||{};},operations:Object.freeze(Object.keys(operations))});
  if (typeof module!=='undefined' && module.exports) module.exports=root.RuleText;
})(typeof globalThis!=='undefined'?globalThis:this);
