"""Read-only presentation metadata. No combat rules or profile synthesis."""
from copy import deepcopy

ROLE_NAMES = {'aemeath':'爱弥斯','lynae':'琳奈','mornye':'莫宁','denia':'达妮娅','chisa':'千咲'}
CANDIDATE_GUIDES = {
 'A': {'title':'情境分支 · 同牌异解','focus':'根据当前资源、形态和公开敌招，选择同一张牌的不同用途。','benefit':'同一张牌提供不同情境下的选择。','tradeoff':'条件判断较多；资源准备与所需牌到手可能错位。'},
 'B': {'title':'有限部署 · 付费保留','focus':'把已抽到且真实持有的牌付费留下，跨回合准备后续行动。','benefit':'部分计划可以提前准备，减少再次等待该牌的需要。','tradeoff':'占共享部署槽，后续仍可能需要付费；到期或目标失效会损失计划。'},
 'C': {'title':'有限消耗 · 可回转运转','focus':'选择是否付出本场未来使用权，换取强分支，并改变后续牌库。','benefit':'可以主动权衡当前收益与后续可抽到的牌。','tradeoff':'消耗会减少未来可用牌；回收受学习、费用和次数限制。'},
}
ROLE_GUIDES = {
 'aemeath':'在同步准备、形态与过载阶段之间安排终结；震谐与聚爆路线分开。单人仍可使用基础终结，团队来源奖励另有条件。',
 'lynae':'权衡色能用于输出还是单击保护，本色来自实际投资；多段压力与单击压力不能同样处理。',
 'mornye':'权衡即时防护、延后的治疗与目标观测；未来收益需要满足对应触发条件。',
 'denia':'权衡储备立即兑现，还是留给后续行动；场域、目标和兑现时点取决于本候选。',
 'chisa':'权衡逐份投入与提前收势；剩余资源和未来机会都属于选择成本。',
}

def guide(data):
    result = deepcopy(CANDIDATE_GUIDES[data.candidate])
    result['status'] = '结构性特点与风险，未经真人趣味性或平衡性验证；正式合格 0'
    result['source_hash'] = data.candidate_hash
    return result

def resolve_profile(data, body):
    """UI selection order is not a gameplay rule. Resolve a set to its frozen row."""
    args = {k: body[k] for k in ('profile_id','stage','roles','deck','routes') if k in body}
    if 'roles' in args:
        roles = args['roles']
        if not isinstance(roles,list) or not 1 <= len(roles) <= 3 or any(not isinstance(r,str) or r not in data.roles for r in roles) or len(set(roles)) != len(roles):
            raise ValueError('请选择 1–3 个不同的已登记角色模板')
        if args.get('profile_id'):
            fixed=next((p for p in data.profiles if p['id']==args['profile_id']),None)
            if fixed is None or set(fixed['roles']) != set(roles):
                raise ValueError('指定档案与所选角色不一致')
        canonical = [r for r in data.roles if r in roles]
        stage = args.get('stage','early')
        if not args.get('profile_id') and stage != 'fresh_acquisition':
            match = next((p for p in data.profiles if p['stage']==stage and set(p['roles'])==set(canonical)),None)
            if match is None:
                raise ValueError('当前版本没有这组角色在所选阶段的合法成长档案')
            args['profile_id'] = match['id']
        args['roles'] = canonical
    return args

def role_details(data, profile):
    rows=[]
    for rid in profile['roles']:
        state = profile['role_states'][rid]
        cards = {did for did in profile['owned_cards'].values() if data.abilities[did].get('owner_role_id') == rid}
        mechanics=[]
        for did in sorted(cards):
            ability=data.abilities[did]
            branches=ability.get('branches',[]) or [ability]
            labels=[]
            if any(b.get('card_type',ability.get('card_type'))=='deploy' for b in branches):labels.append('可部署')
            if any('exhaust' in ability.get('keywords',[])+b.get('keywords',[]) for b in branches):labels.append('含本场耗尽选择')
            if any(e.get('op')=='retain' for b in branches for e in b.get('effects',[])):labels.append('含付费保留选择')
            if labels:mechanics.append({'card':ability.get('name_zh',did),'features':labels})
        rows.append({'id':rid,'name':ROLE_NAMES.get(rid,rid), 'summary':ROLE_GUIDES.get(rid,'按当前版本已学能力与规则行动。'),
                     'candidate':data.candidate,'stage':profile['stage'],'mechanics':mechanics, 'state':deepcopy(state),
                     'learned_cards':[{'id':did,'name':data.abilities[did].get('name_zh',did)} for did in sorted(cards)],
                     'mappings':deepcopy(data.mappings.get(rid,{})),
                     'note':'首次取得仅有模态与内在通用攻防；高级技能需另学。' if profile['stage']=='fresh_acquisition' else '仅列出本阶段真实持有的角色牌；介绍中的后学能力不等于已取得。'})
    return rows
