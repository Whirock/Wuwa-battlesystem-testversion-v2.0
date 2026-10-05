"""Version-isolated live actor engine. Legacy Engine remains byte-for-byte frozen."""
from fractions import Fraction
from itertools import combinations
from pathlib import Path
import hashlib
import json
from .engine import Engine, RuleError, EngineFault, BODY, clone, digest, canonical, snapshot_state
from .data import Growth
from .live_content import (content, validate_content, ENGINE_VERSION, SAVE_SCHEMA,
                           ACTOR_SCHEMA, ENCOUNTER_SCHEMA)


def choose_action(observation, abilities):
    """Pure policy: supplied observation deliberately has no cards, deck or RNG."""
    me=observation['self'];r=observation['round'];p=me['policy_id']
    friends=[x for x in observation['actors'] if x['alive'] and x['faction_id']==me['faction_id']]
    foes=[x for x in observation['actors'] if x['alive'] and x['faction_id']!=me['faction_id']]
    def ready(aid):
        a=abilities[aid]
        return aid in me['ability_ids'] and me['cooldowns'].get(aid,0)<=r and all(me['resources'].get(k,0)>=v for k,v in a['costs'].items())
    target=None
    if p=='raider':aid='heavy' if r%2==0 and ready('heavy') else 'jab'
    elif p=='shooter':aid='scatter' if r%2==0 and ready('scatter') else 'shot'
    elif p=='bulwark':aid=['brace','crush','strike'][me['policy_state']['cursor']%3]
    elif p=='core':aid=(['strike','charge','slam'] if me['policy_state']['phase']==1 else ['pulse','charge','slam'])[me['policy_state']['cursor']%3]
    elif p=='sentinel':
        injured=[x for x in friends if x['hp']*100<=60*x['max_hp']]
        if injured:target=min(injured,key=lambda x:(Fraction(x['hp'],x['max_hp']),x['entity_id']))['entity_id']
        else:
            incoming={x['entity_id']:0 for x in friends}
            for x in foes:
                i=x.get('intent') or {}
                if i.get('cancelled'):continue
                for tid in i.get('target_entity_ids',[]):
                    if tid in incoming:incoming[tid]+=i.get('damage',0)*i.get('hit_count',0)
            threatened=[x for x in friends if incoming[x['entity_id']]>=14]
            if threatened:target=min(threatened,key=lambda x:(-incoming[x['entity_id']],Fraction(x['hp'],x['max_hp']),x['entity_id']))['entity_id']
        aid='cover' if target and ready('cover') else 'stab'
    else:raise EngineFault('LIVE_UNKNOWN_POLICY')
    if not ready(aid):aid='strike' if p in ['core','bulwark'] and ready('strike') else 'wait'
    a=abilities[aid];selector=a['target_selector']
    if selector=='self':targets=[me['entity_id']]
    elif selector=='friendly_guard':targets=[target] if target else []
    elif not foes:aid='wait';targets=[me['entity_id']]
    elif selector=='all_hostile':targets=sorted(x['entity_id'] for x in foes)
    else:
        key={'lowest_hp_ratio':lambda x:(Fraction(x['hp'],x['max_hp']),x['entity_id']),
             'highest_hp_ratio':lambda x:(-Fraction(x['hp'],x['max_hp']),x['entity_id']),
             'lowest_hp':lambda x:(x['hp'],x['entity_id']),
             'prefer_player':lambda x:(x['entity_id']!=BODY,x['entity_id'])}[selector]
        targets=[min(foes,key=key)['entity_id']]
    return aid,targets


class LiveEngine(Engine):
    def __init__(self,candidate='A',root=None,data=None):
        super().__init__(candidate,root,data)
        self.live_content=validate_content(content());self.content_hash=digest(self.live_content)
        self.runtime_hash=digest({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).parent/n for n in ['engine.py','data.py','equipment.py','live_engine.py','live_content.py'])})

    def new_battle(self,*args,encounter_id='LIVE_PATROL_01',**kwargs):
        if args:raise RuleError('LIVE_KEYWORD_ARGUMENTS_REQUIRED')
        if 'enemy_id' in kwargs:raise RuleError('LIVE_LEGACY_ENCOUNTER_FORBIDDEN')
        if encounter_id not in self.live_content['encounters']:raise RuleError('UNKNOWN_LIVE_ENCOUNTER')
        return super().new_battle(enemy_id=encounter_id,**kwargs)

    def _create_enemies(self,encounter_id):
        definition=clone(self.live_content['encounters'][encounter_id])
        s=self.state;s.update(version=ENGINE_VERSION,npcs={},intent_revisions=[],phase_cursor=None,
                              live_content_hash=self.content_hash,live_schema=ACTOR_SCHEMA)
        s['body'].update(faction_id='allied',kind='player',display_name='玩家身体')
        s['encounter']=dict(definition,grouping_enabled=False)
        for field,destination,prefix in [('enemy_definitions','enemies','ENEMY'),('ally_definitions','npcs','NPC')]:
            for index,did in enumerate(definition[field],1):
                d=clone(self.live_content['actors'][did]);stats=d.pop('base_stats');eid=f'{prefix}_{index:02d}'
                d.update(stats,entity_id=eid,hp=stats['max_hp'],alive=True,block=0,power=0,
                         fusion=0,fusion_cap=3,resonance=0,offset=None,movable=False,
                         initiative=index,scale=stats['attack'],elevation='GROUND',
                         resources={k:v['initial'] for k,v in d['resource_definitions'].items()},
                         cooldowns={},policy_state={'phase':1,'cursor':0,'charged':False},intent=None)
                d['equipment_snapshot']['owner_body_id']=eid
                s[destination][eid]=d

    def actors(self,snapshot=None):
        s=snapshot or self.state
        return {BODY:s['body'],**s['enemies'],**s.get('npcs',{})}

    def _entity(self,eid,snapshot=None):
        s=snapshot or self.state
        if eid in s.get('npcs',{}):return s['npcs'][eid]
        return super()._entity(eid,snapshot)

    def _combat_hash(self):
        return digest({'legacy_state':super()._combat_hash(),
                       'npcs':self.state.get('npcs',{}),'encounter':self.state.get('encounter'),
                       'intent_revisions':self.state.get('intent_revisions',[]),
                       'phase_cursor':self.state.get('phase_cursor'),
                       'live_content_hash':self.state.get('live_content_hash')})

    def _emit(self,event_type,target=None,**fields):
        actor=self._ctx.get('actor_entity_id',BODY)
        if actor in self.state.get('npcs',{}) or actor in self.state['enemies']:
            fields.setdefault('character_ability_source',self._entity(actor)['character_ability_source'])
        source=fields.get('character_ability_source',self._ctx.get('owner_role'))
        route=None
        if source and self._ctx.get('origin_kind') in ['npc_skill','player_skill','deployment']:
            if event_type in ['FUSION_APPLIED','STATUS_APPLIED'] and fields.get('status_id')=='fusion_burst' and fields.get('accepted_stacks',0)>0:route='fusion_burst'
            if event_type=='INTERFERENCE_DAMAGE' and fields.get('interference_kind')=='shock' and fields.get('hp_lost',0)>0:route='shock'
            if route and source not in self.state['contributors'][route]:self.state['contributors'][route].append(source)
        fields.setdefault('source_entity_id',actor)
        fields.setdefault('owner_body_id',actor)
        return super()._emit(event_type,target,**fields)

    def _targets(self,sel,validate=False):
        if not sel or sel['kind'] not in ['chosen_ally_body','all_allies','deployment_owner','self_body']:
            return super()._targets(sel,validate)
        kind=sel['kind'];c=self._ctx
        owner=c.get('actor_entity_id',BODY)
        faction=self._entity(owner).get('faction_id','allied')
        pool={i for i,a in self.actors().items() if a['faction_id']==faction}
        if kind=='deployment_owner':ids=[c.get('deployment',{}).get('source_actor_entity_id',owner)]
        elif kind=='self_body':ids=[owner]
        elif kind=='all_allies':ids=sorted(pool)
        else:
            ids=c['request'].get('choices',{}).get(sel['selector_id'],c['selected_target_entity_ids'])
            if isinstance(ids,str):ids=[ids]
            if validate:
                if not sel.get('min',1)<=len(ids)<=sel.get('max',1):raise RuleError('TARGET_COUNT')
                if len(ids)!=len(set(ids)):raise RuleError('DUPLICATE_TARGET')
                if any(i not in pool for i in ids):raise RuleError('TARGET_SIDE')
        result=[]
        for eid in sorted(set(ids)):
            a=self._entity(eid)
            if not a['alive'] and not sel.get('allow_dead',False):
                if validate and kind=='chosen_ally_body':raise RuleError('DEAD_TARGET')
                continue
            old=c.get('target_id');c['target_id']=eid
            try:
                if self._pred(sel.get('filter',True)):result.append(eid)
            finally:
                if old is None:c.pop('target_id',None)
                else:c['target_id']=old
        return result

    def _target_options(self,selector):
        if selector['kind']!='chosen_ally_body':return super()._target_options(selector)
        pool=sorted(i for i,a in self.actors().items() if a['faction_id']=='allied' and a['alive'])
        return [list(x) for n in range(selector.get('min',1),min(selector.get('max',1),len(pool))+1) for x in combinations(pool,n)]

    def policy_observation(self,entity_id):
        keys=['entity_id','faction_id','hp','max_hp','alive','block','intent']
        me=self._entity(entity_id)
        own=['entity_id','faction_id','ability_ids','resources','cooldowns','policy_id','policy_state']
        return {'round':self.state['round'],'self':{k:clone(me[k]) for k in own},
                'actors':[{k:clone(a.get(k)) for k in keys} for _,a in sorted(self.actors().items())]}

    def _intents(self):
        for collection in ['enemies','npcs']:
            for eid,e in sorted(self.state[collection].items()):
                if not e['alive']:continue
                if e.get('delayed_intent'):
                    e['intent']=e.pop('delayed_intent');e['intent']['cancelled']=False
                    e['intent']['execution_round']=self.state['round']
                    i=e['intent'];i['revision']+=1
                    rev={'intent_id':i['intent_id'],'revision':i['revision'],'reason':'delay_resumed','execution_round':self.state['round']}
                    i['revisions'].append(rev);self.state['intent_revisions'].append(rev);self._emit('INTENT_REVISED',eid,revision=clone(rev));continue
                aid,targets=choose_action(self.policy_observation(eid),self.live_content['abilities'])
                a=self.live_content['abilities'][aid]
                e['intent']=dict(intent_id=f"{eid}:{self.state['round']}",revision=0,
                    actor_entity_id=eid,ability_id=aid,selected_round=self.state['round'],execution_round=self.state['round'],
                    target_rule=a['target_selector'],target_entity_ids=targets,locked_target_ids=clone(targets),
                    target_death_policy=a['target_death_policy'],damage=a['damage'],raw_damage_per_hit=a['damage'],
                    hit_count=a['hit_count'],hit_mask=a['hit_mask'],interruptible=a['interruptible'],
                    cancelled=False,costs=clone(a['costs']),cooldown=a['cooldown_rounds'],
                    public_modifiers=[],effects_summary={'effect':a['effect'],'amount':a['amount']},revisions=[],
                    public_followup=({'ability_id':a['followup_ability_id'],
                        'damage':self.live_content['abilities'][a['followup_ability_id']]['damage'],
                        'hit_count':self.live_content['abilities'][a['followup_ability_id']]['hit_count'],
                        'condition':'next_cycle_slot_unless_public_control_or_phase_change'} if a.get('followup_ability_id') else None))

    def _start_turn(self):
        s=self.state;s['round']+=1;s['phase']='player';s['phase_cursor']=None;s['root_actions_this_turn']=0
        self._expire('player_start')
        for a in self.actors().values():
            a['block']=0
            if a['kind']=='player' or not a['alive']:continue
            for k,d in a['resource_definitions'].items():
                a['resources'][k]=d['refresh'] if k=='ap' else min(d['cap'],a['resources'][k]+d['refresh'])
            if a['policy_id']=='core' and a['policy_state']['phase']==1 and a['hp']*2<=a['max_hp'] and not a.get('delayed_intent'):
                a['policy_state'].update(phase=2,cursor=0,charged=False)
                self._emit('PHASE_CHANGED',a['entity_id'],phase=2,reason='public_hp_threshold_next_round')
        s['body']['energy']=3;self._draw(5);self._intents();self._emit('PLAYER_TURN_START',BODY);self._drain()

    def _effects(self,effects):
        before={i:clone(a.get('intent')) for i,a in self.state['enemies'].items()}
        result=super()._effects(effects)
        for eid,old in before.items():
            new=self.state['enemies'][eid].get('intent')
            if old and new and new['revision']==old['revision'] and any(old.get(k)!=new.get(k) for k in ['damage','cancelled','delayed_once']):
                revision={'intent_id':new['intent_id'],'revision':new['revision']+1,
                          'root_action_id':self._ctx.get('root_action_id'),
                          'before':{k:old.get(k) for k in ['damage','cancelled','delayed_once']},
                          'after':{k:new.get(k) for k in ['damage','cancelled','delayed_once']}}
                new['revision']+=1;new['raw_damage_per_hit']=new['damage'];new['revisions'].append(revision)
                self.state['intent_revisions'].append(revision);self._emit('INTENT_REVISED',eid,revision=clone(revision))
                delayed=self.state['enemies'][eid].get('delayed_intent')
                if delayed:delayed['revision']=new['revision'];delayed['revisions']=clone(new['revisions'])
        return result

    def _equipment_event(self,event):
        if event.get('actor_entity_id',BODY)!=BODY:return
        return super()._equipment_event(event)

    def _terminal(self):
        if not self.state.get('outcome'):
            for eid in self.state.get('encounter',{}).get('protected_entity_ids',[]):
                if not self._entity(eid)['alive']:
                    self.state['outcome']='defeat';self.state['phase']='terminal'
                    self._emit('BATTLE_ENDED',BODY,outcome='defeat',reason='protected_actor_dead');break
        return super()._terminal()

    def _execute_actor(self,eid):
        e=self._entity(eid)
        if not e['alive'] or self.state['outcome'] or e['resources'].get('ap',0)<=0:return
        intent=e['intent'];a=self.live_content['abilities'][intent['ability_id']]
        saved=self._ctx;usage=self._usage;root=self._root_snapshot;derived=self._derived_events
        rid='autonomous:'+intent['intent_id'];self.state['phase_cursor']=eid
        self._ctx=self._context(None,{'action_id':rid,'target_entity_ids':intent['target_entity_ids'],'choices':{}},
            actor_entity_id=eid,owner_role=None,origin_kind='npc_skill' if e['kind']=='npc' else 'enemy_skill',
            ability_id=a['ability_id'],attack=e['attack'],level=1,ability_tags=['direct'],
            root_event_start=len(self.state['events']),selected_target_entity_ids=clone(intent['target_entity_ids']))
        self._usage={'modifiers':set(),'equipment':set()};self._derived_events=0;self._root_snapshot=snapshot_state(self.state)
        try:
            e['resources']['ap']=0
            if intent.get('cancelled'):
                if not e.get('delayed_intent'):
                    e['cooldowns'][a['ability_id']]=self.state['round']+a['cooldown_rounds']+1
                    e['policy_state']['cursor']+=1;e['policy_state']['charged']=False
                self._emit('AUTONOMOUS_CANCELLED',eid,intent_id=intent['intent_id']);self._drain();return
            for resource,cost in intent['costs'].items():
                if resource=='ap':continue
                if e['resources'].get(resource,0)<cost:
                    self._emit('AUTONOMOUS_FIZZLED',eid,reason='RESOURCE_UNAVAILABLE');self._drain();return
            for resource,cost in intent['costs'].items():
                if resource!='ap':e['resources'][resource]-=cost
            self._ctx['payment']={'energy':0,'private':{},'actor_resources':clone(intent['costs'])}
            e['cooldowns'][a['ability_id']]=self.state['round']+a['cooldown_rounds']+1
            self._emit('AUTONOMOUS_STARTED',eid,intent_id=intent['intent_id'],costs=clone(intent['costs']))
            targets=[tid for tid in intent['target_entity_ids'] if self._entity(tid)['alive']]
            for tid in intent['target_entity_ids']:
                if tid not in targets:self._emit('TARGET_UNAVAILABLE',tid,reason='locked_target_dead')
            if a['effect']=='block':
                e['block']+=a['amount'];self._emit('BLOCK_GRANTED',eid,amount_applied=a['amount'])
            elif a['effect']=='charge':e['policy_state']['charged']=True;self._emit('CHARGE_DECLARED',eid,next_ability_id='slam')
            elif a['effect']=='shield':
                for tid in targets:
                    for z in list(self.state['statuses'].values()):
                        if z.get('definition_id')=='LIVE_COVER' and z.get('source_actor_entity_id')==eid and z['target_entity_id']==tid:self._remove_status(z,'replaced')
                    iid=self._id('shield');self.state['statuses'][iid]=dict(instance_id=iid,definition_id='LIVE_COVER',
                        owner_role_id=None,source_actor_entity_id=eid,target_entity_id=tid,shield=True,
                        amount=a['amount'],stacks=1,damage_filter=True,hooks=[],ordinal=self.state['serial'],
                        source_attack=e['attack'],source_skill_level=1,ability_id=a['ability_id'],
                        origin_root_action_id=rid,expiry={'boundary':'player_start','round':self.state['round']+1})
                    self._emit('SHIELD_GRANTED',tid,amount_applied=a['amount'])
            for hit in range(intent['hit_count']):
                if self.state['outcome']:break
                self._ctx['simultaneous_group']=True
                for tid in targets:
                    self._damage(tid,{'basis':'fixed','fixed_amount':intent['damage'],'damage_tags':['direct'],'element':'neutral'},
                        {'ability_hit_count':intent['hit_count'],'hit_index':hit,'hit_mask':intent['hit_mask']})
                self._ctx.pop('simultaneous_group',None);self._terminal();self._drain()
            e['policy_state']['cursor']+=1
            if a['ability_id']=='slam':e['policy_state']['charged']=False
            self._emit('AUTONOMOUS_COMMITTED',eid,intent_id=intent['intent_id'])
            self._drain();self._settle_modifiers();self._drain()
        finally:
            self._ctx=saved;self._usage=usage;self._root_snapshot=root;self._derived_events=derived

    def _end_turn(self):
        self._emit('END_PLAYER',BODY);self._drain()
        if self.state['outcome']:return
        self._expire('player_end')
        for iid in list(self.state['zones']['hand']):
            a=self.data.abilities[self.state['cards'][iid]['definition_id']]
            if 'ethereal' in a.get('keywords',[]):self._move(iid,'exhaust')
            elif self.state['retained'].get(iid,0)>self.state['round']:continue
            else:self._move(iid,'discard');self.state['retained'].pop(iid,None)
        self.state['body']['energy']=0
        for phase,collection in [('allied','npcs'),('enemy','enemies')]:
            self.state['phase']=phase
            ordered=sorted(self.state[collection],key=(lambda i:i) if collection=='npcs' else (lambda i:(self.state[collection][i]['initiative'],i)))
            for eid in ordered:self._execute_actor(eid)
            if self.state['outcome']:break
        self.state['phase_cursor']=None
        if self.state['outcome']:self.state['phase']='terminal';return
        self._emit('END_ROUND',BODY);self._drain();self._expire('end_round');self._terminal()
        if not self.state['outcome'] and self.state['round']>=self.state['encounter']['round_limit']:
            self.state['outcome']='stalemate';self.state['phase']='terminal';self._emit('BATTLE_ENDED',BODY,outcome='stalemate');self._terminal_cleanup()
        if not self.state['outcome']:self._start_turn()

    def public_view(self):
        out=super().public_view();out.update(engine_version=ENGINE_VERSION,actor_schema=ACTOR_SCHEMA,
            content_version=self.live_content['content_version'],content_hash=self.content_hash,
            npcs=clone(self.state.get('npcs',{})),actors=clone(self.actors()),
            intent_revisions=clone(self.state.get('intent_revisions',[])))
        return out

    def _checkpoint(self,include_initial=True):
        result=super()._checkpoint(include_initial);result.update(engine_version=ENGINE_VERSION,
            save_schema=SAVE_SCHEMA,content_hash=self.content_hash,actor_schema=ACTOR_SCHEMA,
            encounter_schema=ENCOUNTER_SCHEMA,state_hash=self._combat_hash())
        return result

    @classmethod
    def load(cls,serialized):
        obj=json.loads(serialized) if isinstance(serialized,str) else clone(serialized)
        if not obj.get('committed') or obj.get('engine_version')!=ENGINE_VERSION or obj.get('save_schema')!=SAVE_SCHEMA:raise RuleError('UNSUPPORTED_LIVE_CHECKPOINT')
        engine=cls(obj['candidate'],obj['root'])
        if obj.get('runtime_hash')!=engine.runtime_hash or obj.get('contract_hash')!=engine.data.contract_hash or obj.get('source_hashes')!=engine.data.manifest or obj.get('content_hash')!=engine.content_hash:raise RuleError('LIVE_HASH_MISMATCH')
        if obj.get('actor_schema')!=ACTOR_SCHEMA or obj.get('encounter_schema')!=ENCOUNTER_SCHEMA:raise RuleError('LIVE_SCHEMA_MISMATCH')
        engine.state=obj['state']
        if engine.state.get('live_content_hash')!=engine.content_hash or engine.state['encounter']['id'] not in engine.live_content['encounters']:raise RuleError('LIVE_STATE_MISMATCH')
        engine._validate_live_state()
        if obj.get('state_hash')!=engine._combat_hash():raise RuleError('LIVE_STATE_HASH_MISMATCH')
        return engine

    def replay(self,actions=None):
        checkpoint=self.state.get('initial_checkpoint')
        if not checkpoint:raise RuleError('MISSING_INITIAL_CHECKPOINT')
        engine=type(self).load(checkpoint)
        engine.state['initial_checkpoint']=clone(checkpoint)
        for request in actions if actions is not None else self.state['actions']:
            receipt=engine.apply(request)
            if not receipt['accepted']:raise EngineFault('REPLAY_REJECTED:'+canonical(receipt))
        return engine

    def _damage(self,eid,args,extra=None):
        e=self._entity(eid);c=self._ctx;before_hash=None if self._dry else self._combat_hash()
        if c.get('origin_kind')=='enemy_skill' and (extra is None or 'ability_hit_count' not in extra):raise EngineFault('INCOMING_HIT_COUNT_REQUIRED')
        mask=(extra or {}).get('hit_mask')
        if eid==BODY and mask in ['GROUND_ONLY','AERIAL_ONLY'] and e['elevation'] != mask.split('_')[0]:
            self._hit_incompatible(eid,mask);return
        if not e.get('alive',True):return
        tags=args.get('damage_tags',[]);kind=(extra or {}).get('damage_kind') or ('direct' if 'direct'in tags else ('interference' if (extra or {}).get('interference_kind') else 'anomaly' if 'anomaly'in tags else 'other'))
        meta={'ability_role_id':c['owner_role'],'branch_id':c.get('source_branch_id',c['branch_id']),'element':args.get('element','neutral'),
            'kind':kind,'tags':tags,'offset_route':(extra or {}).get('offset_route'),'interference_kind':(extra or {}).get('interference_kind'),
            'ability_hit_count':(extra or {}).get('ability_hit_count',1)}
        c['damage']=meta
        c.setdefault('event',{'skill_id':c.get('skill_id')})
        raw=self._scaled(args);amount=raw
        # One lane sum followed by one floor, never sequential floor per modifier.
        for lane,cap in [('source_damage',10000),('equipment_damage',5000)]:
            lane_input=amount;mods=[]
            for z in sorted(self.state['statuses'].values(),key=self._instance_order):
                if c.get('origin_kind')=='deployment':continue
                if not z.get('modifier') or z['lane']!=lane or z['origin_root_action_id']==c['root_action_id']:continue
                if z['target_entity_id'] not in [c.get('actor_entity_id',BODY),c['owner_role']]:continue
                if self._pred(z.get('damage_filter',True)):mods.append(z)
            amount=amount*(10000+min(cap,sum(z['amount_bp'] for z in mods)))//10000
            if lane=='equipment_damage':
                equipment_bonus=self._equipment_damage_bonus(meta)
                # Recompute this lane from its input so all bonuses sum before floor.
                original_lane=lane_input
                amount=original_lane*(10000+min(cap,sum(z['amount_bp'] for z in mods)+equipment_bonus))//10000
            c.setdefault('packet_modifiers',[]).extend(z['instance_id'] for z in mods)
        amount=amount*100//(100+max(0,e.get('defense',0)))
        if eid==BODY and e['elevation']=='AERIAL' and (extra or {}).get('hit_rule')=='ground_only':amount=0
        amount=amount*(10000-e.get('reduction_bp',0))//10000
        proof=next((z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z.get('proof') and z['target_entity_id']==eid),None)
        shields=sorted([z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z.get('shield') and z['target_entity_id']==eid and self._pred(z.get('damage_filter',True))],key=lambda z:z.get('ordinal',int(z['instance_id'].split(':')[-1])))
        prediction=max(0,amount-e.get('block',0)-sum(z['amount'] for z in shields));reserve=False;consume=False
        if proof:
            if proof['policy'] in ['lethal_save','combined'] and prediction>=e['hp']:reserve=True;consume=True
            elif proof['policy'] in ['cap_hit','combined'] and amount>e['max_hp']*3//10:amount=e['max_hp']*3//10;consume=True
        after=amount;shield_lost=0
        for z in shields:
            take=min(amount,z['amount']);z['amount']-=take;amount-=take;shield_lost+=take
            if take and z.get('uses') is not None:z['uses']-=1
            if z['amount']==0 or z.get('uses')==0:self._remove_status(z,'consumed')
        block_lost=min(amount,e.get('block',0));e['block']=e.get('block',0)-block_lost;amount-=block_lost
        if reserve:amount=min(amount,e['hp']-1)
        lost=min(e['hp'],amount)
        if lost+block_lost>0:
            self._usage['modifiers'].update(c.get('packet_modifiers',[]))
            self._usage['equipment'].update(c.get('packet_equipment_grants',[]))
        c['packet_modifiers']=[];c['packet_equipment_grants']=[]
        overkill=max(0,amount-e['hp']);e['hp']-=lost
        self._emit('INTERFERENCE_DAMAGE' if (extra or {}).get('interference_kind') else 'DAMAGE_APPLIED',eid,
            raw=raw,after_mitigation=after,shield_lost=shield_lost,block_lost=block_lost,hp_lost=lost,overkill=overkill,
            amount_requested=raw,amount_applied=lost,tags=tags,pre_state_hash=before_hash,**(extra or {}))
        if consume:
            self._remove_status(proof,'consumed')
            if e['hp']>0 and proof['heal_coefficient']:
                saved=self._ctx;self._ctx=dict(saved,attack=proof['source_attack'],level=proof['source_skill_level'],actor_entity_id=proof.get('source_actor_entity_id',BODY),owner_role=proof['owner_role_id'],ability_id=proof['ability_id'],origin_kind='deployment')
                try:self._heal(eid,{'basis':'scaled_attack','coefficient_bp':proof['heal_coefficient']})
                finally:self._ctx=saved
        if e['hp']<=0 and e['alive']:
            e['alive']=False;e['fusion_cap']=3
            e.pop('delayed_intent',None)
            if e.get('intent'):e['intent']['cancelled']=True
            self._release_group('TARGET_DIED',[eid])
            pre=[z['definition_id'] for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['target_entity_id']==eid]
            self._emit('TARGET_DIED',eid,pre_death_status_ids=sorted(pre),killer_side='enemy' if c.get('origin_kind')=='enemy_skill' else 'none' if c.get('origin_kind')=='system' and c.get('owner_role') is None else 'allied')
            for z in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
                if z['target_entity_id']==eid:self._remove_status(z,'death')
        if not self._ctx.get('simultaneous_group'):self._terminal()


    def _execution_snapshot(self):
        return {k:clone(getattr(self,k)) for k in ['_ctx','_queue','_usage','_root_snapshot','_derived_events','_dry']}

    def _restore_execution(self,snapshot):
        for k,v in snapshot.items():setattr(self,k,v)

    def apply(self,request):
        context=self._execution_snapshot()
        try:return super().apply(request)
        finally:self._restore_execution(context)

    def legal_actions(self,*args,**kwargs):
        context=self._execution_snapshot()
        try:return super().legal_actions(*args,**kwargs)
        finally:self._restore_execution(context)

    def preview_action(self,request):
        context=self._execution_snapshot()
        try:return super().preview_action(request)
        finally:self._restore_execution(context)

    def _limit_ok(self,key,limit,consume=False):
        owner=self._ctx.get('actor_entity_id',BODY)
        return super()._limit_ok(owner+'|'+key,limit,consume)

    def _listeners(self,event):
        listeners=super()._listeners(event)
        if event.get('actor_entity_id',BODY)!=BODY:
            for hook,extra,instance in listeners:
                extra.update(payment={'energy':0,'private':{}},ability_tags=clone(self.data.abilities.get(extra.get('ability_id'),{}).get('ability_tags',[])),
                             source_character_ability_source=extra.get('owner_role'))
        return listeners

    def _resource(self,rid,n,operation):
        if self._ctx.get('actor_entity_id',BODY)!=BODY:raise EngineFault('LIVE_RESOURCE_OWNER_REQUIRED')
        return super()._resource(rid,n,operation)

    def _deploy(self,*args,**kwargs):
        if self._ctx.get('actor_entity_id',BODY)!=BODY:raise EngineFault('LIVE_ACTOR_DEPLOYMENT_UNSUPPORTED')
        return super()._deploy(*args,**kwargs)

    def _heal(self,eid,args):
        if self._ctx.get('actor_entity_id',BODY)!=BODY:raise EngineFault('LIVE_ACTOR_HAS_NO_HEAL_ABILITY')
        e=self._entity(eid)
        if not e.get('alive',True):return
        before_hash=None if self._dry else self._combat_hash()
        self._ctx['heal']={'ability_role_id':self._ctx['owner_role']}
        n=self._scaled(args);bonus=sum(effect.get('amount_bp',0) for effect in self.state.get('equipment_effects',[]) if effect.get('bonus_lane')=='equipment_heal_bonus_bp' and not isinstance(effect.get('trigger'),dict))
        modifiers=[z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['target_entity_id'] in [self._ctx.get('actor_entity_id',BODY),self._ctx.get('owner_role')] and self._ctx.get('origin_kind')!='deployment' and z.get('modifier') and z['lane']=='healing' and z['origin_root_action_id']!=self._ctx['root_action_id'] and self._pred(z.get('damage_filter',True))]
        bonus+=sum(z['amount_bp'] for z in modifiers)
        n=n*(10000+min(5000,bonus))//10000;actual=min(n,e['max_hp']-e['hp']);e['hp']+=actual
        if actual:self._usage['modifiers'].update(z['instance_id'] for z in modifiers)
        if actual:self._emit('HEAL_APPLIED',eid,actual_heal=actual,amount_requested=n,amount_applied=actual,pre_state_hash=before_hash)


    def _validate_live_state(self):
        s=self.state
        required={'npcs','enemies','body','intent_revisions','phase_cursor','live_schema','version'}
        if not required.issubset(s) or s['live_schema']!=ACTOR_SCHEMA or s['version']!=ENGINE_VERSION:raise RuleError('LIVE_STATE_SCHEMA')
        if s['phase'] not in ['player','terminal']:raise RuleError('LIVE_SAVE_NOT_COMMITTED_BOUNDARY')
        encounter=self.live_content['encounters'][s['encounter']['id']]
        if s['encounter']!={**encounter,'grouping_enabled':False}:raise RuleError('LIVE_ENCOUNTER_SNAPSHOT_MISMATCH')
        for collection,field,prefix in [('enemies','enemy_definitions','ENEMY'),('npcs','ally_definitions','NPC')]:
            expected={f'{prefix}_{i:02d}':did for i,did in enumerate(encounter[field],1)}
            if set(s[collection])!=set(expected):raise RuleError('LIVE_ACTOR_SET')
            for eid,a in s[collection].items():
                d=self.live_content['actors'][expected[eid]]
                if not {'resources','cooldowns','policy_state','hp','max_hp','alive','entity_id','intent','equipment_snapshot'}.issubset(a):raise RuleError('LIVE_ACTOR_FIELDS_REQUIRED')
                if not isinstance(a['resources'],dict) or not isinstance(a['cooldowns'],dict) or not isinstance(a['policy_state'],dict):raise RuleError('LIVE_ACTOR_FIELDS_TYPE')
                for key in ['definition_id','faction_id','kind','ability_ids','policy_id','character_ability_source','resource_definitions']:
                    if a.get(key)!=d[key]:raise RuleError('LIVE_ACTOR_DEFINITION_MISMATCH')
                for key in ['max_hp','attack','defense']:
                    if a.get(key)!=d['base_stats'][key]:raise RuleError('LIVE_ACTOR_STATS_MISMATCH')
                if type(a['hp'])!=int or not 0<=a['hp']<=a['max_hp'] or a['alive']!=(a['hp']>0):raise RuleError('LIVE_ACTOR_HP')
                for key,rd in d['resource_definitions'].items():
                    value=a['resources'].get(key)
                    if type(value)!=int or not 0<=value<=rd['cap']:raise RuleError('LIVE_ACTOR_RESOURCE')
                intent=a.get('intent')
                if intent and (intent['ability_id'] not in a['ability_ids'] or intent['actor_entity_id']!=eid or any(t not in self.actors() for t in intent['target_entity_ids'])):raise RuleError('LIVE_ACTOR_INTENT')
