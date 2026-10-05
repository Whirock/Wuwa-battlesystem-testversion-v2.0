"""One deterministic, transactional interpreter for the frozen common combat DSL.

Candidate differences are data. No eval, executable callbacks, or candidate switch
exists in effect execution. Private checkpoints are intentionally distinct from
public observations supplied to policies.
"""
from __future__ import annotations
import copy, hashlib, itertools, json, math
from pathlib import Path
try:
    from .data import Data, Growth
    from .equipment import active_effects, trigger_matches, filter_matches, validate_loadout
except ImportError:
    from data import Data, Growth
    from equipment import active_effects, trigger_matches, filter_matches, validate_loadout

VERSION = 'shared-runtime-1.0'
BODY = 'PLAYER_BODY_01'
class RuleError(Exception): pass
class EngineFault(Exception): pass

def canonical(x): return json.dumps(x, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
def digest(x): return hashlib.sha256(canonical(x).encode()).hexdigest()
def clone(x): return copy.deepcopy(x)
def snapshot_state(s):
    # Committed event/receipt records and frozen profile/checkpoint are immutable.
    excluded={'events','receipts','actions','initial_checkpoint','profile'}
    out=copy.deepcopy({k:v for k,v in s.items() if k not in excluded})
    out['events']=list(s['events']);out['receipts']=dict(s['receipts']);out['actions']=list(s['actions']);out['profile']=s['profile']
    if 'initial_checkpoint' in s:out['initial_checkpoint']=s['initial_checkpoint']
    return out

def walk(x):
    if isinstance(x, dict):
        yield x
        for y in x.values(): yield from walk(y)
    elif isinstance(x, list):
        for y in x: yield from walk(y)

class Engine:
    def __init__(self, candidate='A', root=None, data=None):
        self.data = data if data is not None else Data(candidate, root=root)
        if self.data.candidate!=candidate:raise RuleError('DATA_CANDIDATE_MISMATCH')
        if not hasattr(self.data,'compiler_result'):self.data.compiler_result=self.data.compile_registry()
        self.candidate = candidate
        self.root = str(self.data.root)
        self.state = None
        self._ctx = {}; self._queue = []; self._root_snapshot = None
        self._dry = False
        self._usage={'modifiers':set(),'equipment':set()};self._derived_events=0
        self.equipment_appendix=self.data.equipment
        self.runtime_hash=digest({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).parent/n for n in ['engine.py','data.py','equipment.py'])})

    def _rng(self, domain, upper, stable_context=''):
        if upper <= 0: raise EngineFault('RNG_RANGE')
        key=domain+'|'+stable_context
        limit=(1<<64)-((1<<64)%upper)
        while True:
            n=self.state['rng'].get(key,0)
            raw=hashlib.sha256(f"{self.data.system['contract_id']}|{self.state['seed']}|{domain}|{stable_context}|{n}".encode()).digest()
            self.state['rng'][key]=n+1
            value=int.from_bytes(raw[:8],'big')
            if value < limit:return value%upper

    def _shuffle(self, values, domain='initial_shuffle'):
        for i in range(len(values)-1,0,-1):
            j=self._rng(domain,i+1,str(i));values[i],values[j]=values[j],values[i]

    def new_battle(self, profile_id=None, stage='early', roles=None, enemy_id='T1', seed=1,
                   battle_id='b1', deck=None, starting_hp=None, battle_kind='simulation', **kwargs):
        if kwargs.get('profile') is not None:
            p=clone(kwargs['profile']);self.data.validate_profile(p)
            if p.get('in_battle'):raise RuleError('PROFILE_ALREADY_IN_BATTLE')
            p['role_states'],p['required_choices']=self.data.initial_role_states(p['roles'],p['learned'],p.get('routes'))
        else:p = self.data.profile(profile_id=profile_id, stage=stage, roles=roles or ['aemeath'], deck=deck, routes=kwargs.get('routes'))
        if kwargs.get('gear') is not None:
            p['gear']=clone(kwargs['gear']);validate_loadout(p['gear'],self.equipment_appendix)
            p['body_stats']['attack']=p['body_stats'].get('base_attack',p['body_stats']['attack'])+(p['gear'].get('weapon') or {}).get('flat_attack',0)+sum(e.get('flat_stats',{}).get('attack',0) for e in p['gear'].get('echoes',[]) if e)
        if p.get('required_choices'):raise RuleError('PREBATTLE_CHOICES_REQUIRED:'+canonical(p['required_choices']))
        Growth(self.data,p).begin_battle(battle_id)
        stats = p['body_stats']; maxhp = stats['max_hp'];self._derived_events=0
        self.state = dict(version=VERSION,candidate=self.candidate,contract_hash=self.data.contract_hash,
            battle_id=battle_id, profile=clone(p), seed=seed, rng={}, revision=0, round=0,
            phase='initializing',outcome=None, body=dict(entity_id=BODY,hp=maxhp if starting_hp is None else starting_hp,
            max_hp=maxhp,attack=stats['attack'],defense=stats['defense'],block=0,alive=True,
            energy=0,concerto=0,elevation='GROUND',elevation_expires=None,elevation_source=None),
            active_role=None, roles=clone(p['role_states']), cards={}, zones={k:[] for k in ['draw','hand','resolving','discard','exhaust','deployed']},
            enemies={},deployments={},statuses={},tokens={},limits={},events=[],receipts={},actions=[],
            pending_xp={},retained={},serial=0,battle_kind=battle_kind,root_actions_this_turn=0,
            equipment_effects=active_effects(p['gear'],self.equipment_appendix),equipment_grants={},equipment_counters={},
            encounter={'id':enemy_id,'grouping_enabled':False},contributors={'shock':[],'fusion_burst':[]})
        if not 0 < self.state['body']['hp'] <= maxhp: raise RuleError('START_HP')
        for role,rs in self.state['roles'].items():
            rs.update(role_id=role,body_id=BODY)
            for k in ['private','caps','history','history_caps','phase']: rs.setdefault(k,{})
        for iid,did in p['owned_cards'].items(): self.state['cards'][iid]={'instance_id':iid,'definition_id':did,'temporary':False}
        self.state['zones']['draw']=list(p['deck'])
        self._create_enemies(enemy_id)
        self._shuffle(self.state['zones']['draw'])
        self._root_snapshot=snapshot_state(self.state)
        self._ctx=self._context(None, {'action_id':'BATTLE_START','target_entity_ids':[],'choices':{}})
        self._emit('BATTLE_START',BODY)
        self._drain()
        self._start_turn()
        self.state['initial_checkpoint']=self._checkpoint(include_initial=False)
        return self.public_view()

    @staticmethod
    def _instance_order(instance):
        identifier=str(instance.get('instance_id',''))
        tail=identifier.rsplit(':',1)[-1]
        return (instance.get('ordinal',int(tail) if tail.isdigit() else 0),identifier)

    def _id(self,prefix):
        self.state['serial']+=1; return f'{prefix}:{self.state["serial"]}'

    def _entity(self,eid, snapshot=None):
        s=snapshot or self.state
        if eid==BODY: return s['body']
        if eid in s['roles']: return s['roles'][eid]
        if eid in s['enemies']: return s['enemies'][eid]
        raise RuleError('UNKNOWN_ENTITY:'+str(eid))

    def _skill_level(self,skill_id):
        profile=self.state['profile']
        return profile.get('battle_skill_snapshot',profile['skills']).get(skill_id,{}).get('level',1)

    def _context(self, ability, request, **extras):
        role=(ability or {}).get('owner_role_id')
        if ability is not None and role in [None,'common']: role=self.state['active_role']
        aid=(ability or {}).get('id')
        skill=(ability or {}).get('skill_id')
        level=self._skill_level(skill)
        c={'owner_role':role,'ability_id':aid,'skill_id':skill,'level':level,'attack':self.state['body']['attack'],
           'origin_kind':'player_skill' if ability is not None else 'system','origin_instance_id':request.get('card_instance_id_or_null'),
           'request':request,'root_action_id':request['action_id'],'branch_id':request.get('branch_id_or_null'),
           'payment':{'energy':0,'private':{}},'selected_target_entity_ids':list(request.get('target_entity_ids',[])),
           'ability_tags':list((ability or {}).get('ability_tags',[])), 'action':{'ability_role_id':role,'branch_id':request.get('branch_id_or_null')}, 'depth':0,'parent_event_id':None}
        c.update(extras);return c

    def _ref(self,path):
        snapshot=None
        if path.startswith('root_snapshot.'):
            snapshot=self._root_snapshot;path=path[14:]
        s=snapshot or self.state;c=self._ctx
        if snapshot and path.startswith('context.'):
            c=dict(c)
            for name,collection in [('selected_deployment','deployments'),('deployment','deployments'),('status','statuses'),('token','tokens')]:
                if name in c:
                    instance=c[name].get('instance_id')
                    if instance not in snapshot[collection]:raise EngineFault('ROOT_SNAPSHOT_SCOPE:'+name)
                    c[name]=snapshot[collection][instance]
        path=path.replace('owner.contribution.','owner.contributors.').replace('owner.contributions.','owner.contributors.')
        path=path.replace('context.damage.role_id','context.damage.ability_role_id')
        path=path.replace('target.resonance_progress','target.status.resonance.progress').replace('target.status.resonance_progress.stacks','target.status.resonance.progress')
        if path.startswith('owner.phase.') and len(path.split('.'))==3:
            role=c.get('owner_role');axis=path.split('.')[2]
            if role not in s['roles']:raise EngineFault('OWNER_PHASE_SCOPE')
            if axis not in s['roles'][role]['phase']:return self._registered_phase_initial(role,axis)
        if path.startswith('owner.contributors.'):
            route=path.split('.')[2]; return len(s['contributors'][route])
        if path.startswith('actor.deployment.'):
            _,_,key,field=path.split('.')
            if key not in {d['stacking_key'] for d in self.data.deployments.values()}: raise EngineFault('UNKNOWN_DEPLOYMENT_KEY:'+key)
            deps=[d for d in s['deployments'].values() if d['stacking_key']==key and d.get('owner_body_id',BODY)==BODY]
            d=deps[0] if deps else None
            if field=='exists':return d is not None
            if field=='has_source_card':return bool(d and d['source_card'])
            if field=='on_leave_destination':return d['destination'] if d and d['source_card'] else None
            raise EngineFault('UNKNOWN_DEPLOYMENT_VIEW:'+field)
        target=self._entity(c.get('target_id', (c.get('selected_target_entity_ids') or [BODY])[0]),snapshot)
        if path=='target.intent.hit_count':
            selected=c.get('selected_target_entity_ids',[])
            enemy=next((i for i in selected if i in s['enemies']),None)
            if enemy is None:raise EngineFault('PUBLIC_INTENT_TARGET_SCOPE')
            return s['enemies'][enemy]['intent']['hit_count']
        if path.startswith('context.event.pre_root_status.') and path.endswith('.source_role_id'):
            sid=path.split('.')[3]
            if sid not in self.data.statuses:raise EngineFault('UNKNOWN_STATUS:'+sid)
            if 'event' not in c or not c['event'].get('root_action_id'):raise EngineFault('PRE_ROOT_EVENT_SCOPE')
            return c['event'].get('pre_root_status',{}).get(sid,{}).get('source_role_id')
        if path.startswith('target.status.'):
            bits=path.split('.');sid=bits[2];field=bits[3]
            if sid=='fusion_burst' and field=='stacks':return target.get('fusion',0)
            if sid=='resonance' and field=='progress':return target.get('resonance',0)
            if sid not in self.data.statuses:raise EngineFault('UNKNOWN_STATUS:'+sid)
            matches=[x for x in s['statuses'].values() if x['target_entity_id']==target.get('entity_id') and x['definition_id']==sid]
            return matches[0].get(field,0) if matches else 0
        if path.startswith('context.deployment.'):
            dep=c.get('deployment')
            if dep is None:raise EngineFault('DEPLOYMENT_SCOPE:'+path)
            if path.endswith('fixed_target.alive') or path.endswith('locked_target_dead'):
                tids=dep['paid_snapshot']['target_entity_ids']
                if len(tids)!=1:raise EngineFault('FIXED_TARGET_SCOPE')
                alive=self._entity(tids[0])['alive']
                return not alive if path.endswith('locked_target_dead') else alive
        if path=='context.status.bound_token_count':
            status=c.get('status')
            if status is None:raise EngineFault('STATUS_SCOPE')
            bound=[t for t in s['tokens'].values() if t.get('status_instance_id')==status['instance_id']]
            if any(self.data.tokens[t['definition_id']].get('source')!=status['definition_id'] for t in bound) or len(bound)>1:raise EngineFault('STATUS_TOKEN_BINDING_MISMATCH')
            return sum(t['count'] for t in bound)
        roots={'actor':s['body'],'owner':s['roles'].get(c['owner_role'],{}),'active':{'role_id':s['active_role']},
            'target':target,'battle':s,'skill':{'level':c['level']},'context':c}
        roots['context']=c
        try:
            result=roots
            for k in path.split('.'):result=result[k]
            return result
        except (KeyError,TypeError):raise EngineFault('UNRESOLVED_REF:'+path)

    def _value(self,x):
        if isinstance(x,(int,str,bool)) or x is None:return x
        if isinstance(x,list):return [self._value(v) for v in x]
        if 'ref' in x:return self._ref(x['ref'])
        if 'array_ref' in x:return self._ref(x['array_ref'])
        if 'calc' in x:
            a=[self._value(v) for v in x['args']]
            if any(type(v)!=int for v in a):raise EngineFault('NONINTEGER_ARITHMETIC')
            op=x['calc']
            if op=='add':return sum(a)
            if op=='sub':return a[0]-a[1]
            if op=='mul':return math.prod(a)
            if op=='floor_div':
                if a[1]<=0:raise RuleError('DIVISOR')
                return a[0]//a[1]
            if op=='min':return min(a)
            if op=='max':return max(a)
            if op=='clamp':return max(a[1],min(a[0],a[2]))
            raise EngineFault('UNKNOWN_CALC:'+op)
        if 'query' in x:
            q=x['query']
            if q=='resource_cap':return self._owner()['caps'][x['resource_id']]
            if q=='contributor_count':return len(self.state['contributors'][x['route']])
            if q=='zone_count':return len(self._card_candidates(x['selector']))
            if q=='deployment_exists':return any(d['stacking_key']==x['stacking_key'] and d.get('owner_body_id',BODY)==BODY and (x.get('owner','actor')=='actor' or d['owner_role_id']==self._ctx['owner_role']) for d in sorted(self.state['deployments'].values(),key=self._instance_order))
            if q=='count_selected':return len(self._ctx['request'].get('choices',{}).get(x['selector_id'],self._ctx['selected_target_entity_ids']))
            if q=='status_stacks':
                eid=self._ctx.get('target_id',BODY) if x['entity']=='target' else BODY
                return sum(z['stacks'] for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['target_entity_id']==eid and z['definition_id']==x['status_id'])
            raise EngineFault('UNKNOWN_QUERY:'+q)
        raise EngineFault('UNKNOWN_VALUE:'+canonical(x))

    def _pred(self,p):
        if isinstance(p,bool):return p
        if 'all'in p:return all(self._pred(v) for v in p['all'])
        if 'any'in p:return any(self._pred(v) for v in p['any'])
        if 'not'in p:return not self._pred(p['not'])
        if 'cmp'in p:
            a,b=self._value(p['left']),self._value(p['right']);op=p['cmp']
            if op=='eq':return a==b
            if op=='ne':return a!=b
            if op=='lt':return a<b
            if op=='le':return a<=b
            if op=='gt':return a>b
            if op=='ge':return a>=b
            if op=='in':return a in b
            raise EngineFault('UNKNOWN_COMPARISON')
        if 'has'in p:
            kind,ident=p['has'],p['id']
            if kind=='learned_skill':return ident in self.state['profile']['learned'] or ident in self.state['profile']['skills']
            if kind=='learned_inherent':return ident in self.state['profile']['inherents']
            eid=self._ctx.get('target_id',BODY) if p.get('entity')=='target' else (self._ctx['owner_role'] if p.get('entity')=='owner_template' else BODY)
            if kind=='status':return any(z['definition_id']==ident and z['target_entity_id']==eid for z in sorted(self.state['statuses'].values(),key=self._instance_order))
            if kind=='token':return self._token_count(ident,eid)>0
            if kind=='tag':return ident in self._entity(eid).get('tags',[])
            raise EngineFault('UNKNOWN_HAS:'+kind)
        raise EngineFault('UNKNOWN_PREDICATE:'+canonical(p))

    def _registered_phase_initial(self,role,axis):
        definition=self.data.roles.get(role,{}).get('phase_axes',{}).get(axis)
        if definition is None:raise EngineFault('UNKNOWN_PHASE:'+axis)
        acquisition=definition.get('acquisition')
        if acquisition=='circuit':acquisition=self.data.roles[role]['circuit_id']
        learned=set(self.state['profile']['learned']);learned|={self.data.acquisition_aliases.get(item,item) for item in learned}
        if acquisition in [None,'template','first_mode_intrinsic'] or self.data.acquisition_aliases.get(acquisition,acquisition) in learned:raise EngineFault('MISSING_ACQUIRED_PHASE:'+axis)
        if 'initial' not in definition or definition['initial'] not in definition.get('states',[]) or definition['initial']=='build_choice':raise EngineFault('PHASE_INITIAL_UNRESOLVED:'+axis)
        return definition['initial']

    def _owner(self):
        role=self._ctx['owner_role']
        if role not in self.state['roles']:raise RuleError('OWNER_REQUIRED')
        return self.state['roles'][role]

    def _targets(self,sel,validate=False):
        if not sel:return []
        kind=sel['kind']; c=self._ctx; s=self.state
        if kind=='cards':return self._select_cards(sel)
        if kind in ['self_body','deployment_owner']:ids=[BODY]
        elif kind=='owner_template':ids=[c['owner_role']]
        elif kind=='active_template':ids=[s['active_role']]
        elif kind=='next_template_bound':
            bound=c.get('status',{}).get('bound_template_id') or c.get('token',{}).get('beneficiary_role_id') or c.get('switch',{}).get('to_template_id')
            if bound is None:raise EngineFault('NEXT_TEMPLATE_BINDING_SCOPE')
            ids=[bound]
        elif kind in ['chosen_enemy','chosen_ally_body']:
            ids=c['request'].get('choices',{}).get(sel['selector_id'],c['selected_target_entity_ids'])
            if isinstance(ids,str):ids=[ids]
            if validate:
                if len(ids)<sel.get('min',1) or len(ids)>sel.get('max',1):raise RuleError('TARGET_COUNT')
                if len(ids)!=len(set(ids)):raise RuleError('DUPLICATE_TARGET')
                if kind=='chosen_enemy' and any(i not in s['enemies'] for i in ids):raise RuleError('TARGET_SIDE')
                if kind=='chosen_ally_body' and any(i!=BODY for i in ids):raise RuleError('TARGET_SIDE')
        elif kind=='all_enemies':ids=list(s['enemies'])
        elif kind=='all_allies':ids=[BODY]
        elif kind=='fixed_entities':ids=self._value(sel['entity_ids'])
        elif kind=='event_actor':ids=[c['event']['actor_entity_id']]
        elif kind=='event_target':ids=[c['event']['target_entity_id']]
        elif kind=='enemy_group':
            binding=c['request'].get('choices',{}).get(sel.get('primary_selector_id'),c['selected_target_entity_ids'])
            if isinstance(binding,str):binding=[binding]
            primary=(binding or [None])[0]
            if primary and not self._entity(primary).get('alive',False):return []
            group=self._entity(primary).get('group') if primary else None
            ids=[i for i,e in s['enemies'].items() if group and e.get('group')==group] if group else [primary]
        else:raise EngineFault('UNKNOWN_SELECTOR:'+kind)
        out=[]
        for eid in sorted(set(i for i in ids if i is not None)):
            e=self._entity(eid)
            if not e.get('alive',True) and not sel.get('allow_dead',False):
                if validate and kind in ['chosen_enemy','chosen_ally_body']:raise RuleError('DEAD_TARGET')
                continue
            old=c.get('target_id');c['target_id']=eid
            try:allowed=self._pred(sel.get('filter',True))
            finally:
                if old is None:c.pop('target_id',None)
                else:c['target_id']=old
            if allowed:out.append(eid)
        return out

    def _card_candidates(self,sel):
        out=[]
        for zone in sel['zones']:
            for iid in self.state['zones'][zone]:
                card=self.state['cards'][iid];a=self.data.abilities[card['definition_id']]
                if sel.get('exclude_origin_instance',True) and iid==self._ctx['origin_instance_id']:continue
                if sel.get('owner_role_id','any') not in ['any',a.get('owner_role_id')]:continue
                if sel.get('skill_id','any') not in ['any',a.get('skill_id')]:continue
                if sel.get('card_definition_id') and sel['card_definition_id']!=card['definition_id']:continue
                if not set(sel.get('tags_all',[])).issubset(set(a.get('ability_tags',[]))):continue
                out.append(iid)
        return out

    def _select_cards(self,sel):
        eligible=self._card_candidates(sel);n=self._value(sel.get('count',1));selection=sel.get('selection','player')
        if selection=='player':
            chosen=self._ctx['request'].get('choices',{}).get(sel['selector_id'],sel.get('instance_ids',[]))
            if isinstance(chosen,str):chosen=[chosen]
        elif selection in ['top','oldest']:chosen=eligible[:n]
        elif selection=='stable_id':chosen=sorted(eligible)[:n]
        elif selection=='random':
            candidates=eligible[:];chosen=[]
            while candidates and len(chosen)<n:chosen.append(candidates.pop(self._rng('card_effect',len(candidates),self._ctx['root_action_id']+'|'+sel['selector_id'])))
        else:raise EngineFault('CARD_SELECTION')
        if len(set(chosen))!=len(chosen) or any(i not in eligible for i in chosen):raise RuleError('CARD_CHOICE')
        if len(chosen)>n or (len(chosen)<n and sel.get('on_insufficient','illegal')=='illegal'):raise RuleError('CARD_CHOICE_COUNT')
        return chosen

    def _move(self,iid,destination,pre_hash=None):
        before_hash=pre_hash if pre_hash is not None else (None if self._dry else self._combat_hash())
        for zone,ids in self.state['zones'].items():
            if iid in ids:ids.remove(iid)
        if destination=='draw_top':self.state['zones']['draw'].insert(0,iid)
        else:self.state['zones'][destination].append(iid)
        self._emit('CARD_MOVED',BODY,card_instance_id=iid,destination=destination,pre_state_hash=before_hash)

    def _draw(self,n):
        for _ in range(n):
            if len(self.state['zones']['hand'])>=10:break
            before_hash=None if self._dry else self._combat_hash()
            if not self.state['zones']['draw']:
                self.state['zones']['draw']=self.state['zones']['discard'];self.state['zones']['discard']=[]
                self.state['reshuffles']=self.state.get('reshuffles',0)+1
                self._shuffle(self.state['zones']['draw'], 'reshuffle_'+str(self.state['reshuffles']))
            if not self.state['zones']['draw']:break
            self._move(self.state['zones']['draw'][0],'hand',pre_hash=before_hash)

    def _emit(self,event_type,target=None,**fields):
        c=self._ctx;s=self.state
        event={'event_id':self._id('event'),'battle_id':s['battle_id'],'root_action_id':c.get('root_action_id'),
            'parent_event_id':c.get('parent_event_id'),'effect_definition_id':c.get('effect_definition_id'),'ordinal':len(s['events']), 'event_type':event_type,
            'actor_entity_id':c.get('actor_entity_id',BODY),'ability_role_id':c.get('owner_role'),
            'character_ability_source':c.get('owner_role'),'origin_kind':c.get('origin_kind','system'),
            'origin_instance_id':c.get('origin_instance_id'),'origin_action_id':c.get('origin_root_action_id',c.get('root_action_id')),
            'target_entity_id':target,'ability_id':c.get('action_ability_id',c.get('ability_id')),
            'origin_ability_id':c.get('ability_id'),'skill_id':c.get('skill_id'),'branch_id':c.get('branch_id'),
            'ability_tags':c.get('ability_tags',[]),'tags':[],'amount_requested':0,'amount_applied':0,
            'depth':c.get('depth',0),'source_attack':c.get('attack',s['body']['attack']),
            'source_skill_level':c.get('level',1),'pre_state_hash':None,'post_state_hash':None}
        event.update(fields)
        if event['depth']>0:
            self._derived_events+=1
            if self._derived_events>64:raise EngineFault('DERIVED_EVENT_BUDGET')
        if target and self._root_snapshot:
            pre_status={z['definition_id']:{'source_role_id':z['owner_role_id']} for z in self._root_snapshot['statuses'].values() if z['target_entity_id']==target}
            pre_status.setdefault('havoc_bane',{'source_role_id':None});event['pre_root_status']=pre_status
        role=event.get('ability_role_id')
        if role and event['origin_kind'] not in ['equipment','system','enemy_skill']:
            route=None
            if event_type in ['FUSION_APPLIED','STATUS_APPLIED'] and event.get('status_id')=='fusion_burst' and event.get('accepted_stacks',0)>0:route='fusion_burst'
            if event_type=='INTERFERENCE_DAMAGE' and event.get('interference_kind')=='shock' and event.get('hp_lost',0)>0:route='shock'
            if route and role not in s['contributors'][route]:s['contributors'][route].append(role)
        # Event hashes cover observable combat state, excluding the event ledger itself.
        event['post_state_hash']=None if self._dry else self._combat_hash()
        event['pre_state_hash']=fields.get('pre_state_hash',c.get('pre_effect_hash',event['post_state_hash']))
        s['events'].append(event);self._queue.append(event)
        if len(s['events'])-c.get('root_event_start',len(s['events']))>256:raise EngineFault('EVENT_BUDGET')
        return event

    def _combat_hash(self):
        return digest({k:self.state[k] for k in ['body','active_role','roles','cards','zones','enemies','deployments','statuses','tokens','round','phase','outcome','contributors','rng','limits','pending_xp','retained','equipment_grants','equipment_counters']})

    def _limit_ok(self,key,limit,consume=False):
        for scope,value in (limit or {}).items():
            if scope not in ['per_root_action','per_owner_round','per_battle','per_deployment'] or value is None:continue
            suffix={'per_root_action':self._ctx['root_action_id'],'per_owner_round':self.state['round'],
                'per_battle':self.state['battle_id'],'per_deployment':self._ctx.get('deployment',{}).get('instance_id','none')}[scope]
            counter=f'{key}|{scope}|{suffix}'
            if self.state['limits'].get(counter,0)>=value:return False
        if consume:
            for scope,value in (limit or {}).items():
                if scope not in ['per_root_action','per_owner_round','per_battle','per_deployment'] or value is None:continue
                suffix={'per_root_action':self._ctx['root_action_id'],'per_owner_round':self.state['round'],
                    'per_battle':self.state['battle_id'],'per_deployment':self._ctx.get('deployment',{}).get('instance_id','none')}[scope]
                counter=f'{key}|{scope}|{suffix}';self.state['limits'][counter]=self.state['limits'].get(counter,0)+1
        return True

    def _listeners(self,event):
        result=[]
        for spec in sorted(self.data.hooks,key=lambda h:(0 if h.get('acquisition_id') in self.data.acquisitions and not self.data.acquisitions[h['acquisition_id']].get('inherent') else 1,h['hook']['id'])):
            role=spec['owner_role_id']
            if role not in self.state['roles']:continue
            acq=spec.get('acquisition_id')
            if acq and acq not in self.state['profile']['learned']+self.state['profile']['inherents']:continue
            result.append((spec['hook'],dict(owner_role=role,actor_entity_id=BODY,ability_id=spec.get('source_ability_id',spec.get('acquisition_id')),source_branch_id=None,attack=self.state['body']['attack'],level=1,origin_kind='player_skill'), 'passive:'+spec['hook']['id']))
        for token in list(sorted(self.state['tokens'].values(),key=self._instance_order)):
            for hook in self.data.tokens[token['definition_id']].get('hooks',[]):result.append((hook,{'owner_role':token['owner_role_id'],'actor_entity_id':token.get('source_actor_entity_id',BODY),'token':token,
                'attack':token['source_attack'],'level':token['source_skill_level'],'source_branch_id':token.get('source_branch_id'),'origin_instance_id':token['instance_id'],
                'origin_root_action_id':token['origin_root_action_id'],'ability_id':token['ability_id'],'origin_kind':'deployment'},token['instance_id']))
        for status in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
            for hook in status.get('hooks',[]):result.append((hook,{'owner_role':status['owner_role_id'],'actor_entity_id':status.get('source_actor_entity_id',BODY),'status':status,
                'attack':status['source_attack'],'level':status['source_skill_level'],'source_branch_id':status.get('source_branch_id'),'origin_instance_id':status['instance_id'],
                'origin_root_action_id':status['origin_root_action_id'],'ability_id':status['ability_id'],'origin_kind':'deployment'},status['instance_id']))
        for dep in sorted(sorted(self.state['deployments'].values(),key=self._instance_order),key=lambda d:d['ordinal']):
            for hook in self.data.deployments[dep['definition_id']].get('hooks',[]):result.append((hook,{'owner_role':dep['owner_role_id'],'actor_entity_id':dep.get('source_actor_entity_id',BODY),
                'deployment':dep,'attack':dep['source_attack'],'level':dep['source_skill_level'],'source_branch_id':dep.get('source_branch_id'),'origin_instance_id':dep['instance_id'],
                'origin_root_action_id':dep['origin_root_action_id'],'ability_id':dep['ability_id'],'origin_kind':'deployment'},dep['instance_id']))
        return result

    def _drain(self):
        saved=self._ctx
        derived=0
        try:
            while self._queue:
                event=self._queue.pop(0)
                if self.state['outcome']:continue
                if event['event_type'] in ['RESOURCE_GAINED','CONCERTO_GAINED','STATUS_APPLIED','RESONANCE_OFFSET_APPLIED'] and event.get('accepted_stacks',event.get('accepted',event.get('amount_applied',1)))==0:continue
                if event['event_type']=='DEPLOYMENT_EXPIRED' and event.get('reason')=='REPLACED':continue
                for hook,extra,instance in self._listeners(event):
                    aliases=[event['event_type']]
                    if event.get('status_id')=='fusion_burst' and event['event_type']=='STATUS_APPLIED':aliases+=['FUSION_APPLIED']
                    if event['event_type']=='RESONANCE_OFFSET_APPLIED':aliases+=['STATUS_APPLIED']
                    if hook['event'] not in aliases:continue
                    if 'token' in extra and instance not in self.state['tokens']:continue
                    if 'status' in extra and instance not in self.state['statuses']:continue
                    if 'status' in extra and self.data.statuses[extra['status']['definition_id']].get('owner_scope') in ['target','target_enemy'] and event['event_type'] in ['DAMAGE_APPLIED','HEAL_APPLIED','STATUS_APPLIED','TARGET_DIED','RESONANCE_PROGRESS','RESONANCE_OFFSET_APPLIED','RESONANCE_BREAK','INTERFERENCE_DAMAGE'] and event.get('target_entity_id')!=extra['status']['target_entity_id']:continue
                    if 'deployment' in extra and instance not in self.state['deployments']:continue
                    if extra.get('origin_root_action_id')==event['root_action_id'] and not hook.get('allow_origin_event',False):continue
                    c=clone(saved);c.update(extra,event=event,target_id=event['target_entity_id'] or BODY,
                        parent_event_id=event['event_id'],depth=event['depth']+1)
                    c['action_ability_id']=saved.get('ability_id');c.pop('damage',None);c.pop('heal',None);self._ctx=c
                    if c['depth']>8:raise EngineFault('TRIGGER_DEPTH')
                    key=instance+':'+hook['id']
                    if not self._limit_ok(key,hook.get('limit')) or not self._pred(hook.get('condition',True)):continue
                    self._limit_ok(key,hook.get('limit'),True)
                    derived+=1
                    if derived>64:raise EngineFault('TRIGGER_BUDGET')
                    dep=extra.get('deployment')
                    if dep and hook.get('consume_deployment_use'):
                        if dep['remaining_uses']<=0:continue
                        dep['remaining_uses']-=1
                    self._effects(hook.get('effects',[]))
                    if dep and dep['instance_id'] in self.state['deployments'] and dep['remaining_uses']==0:self._close_dep(dep,'consumed')
                self._ctx=saved
                if not self.state['outcome']:self._equipment_event(event)
        finally:self._ctx=saved

    def _expiry(self,duration):
        if isinstance(duration,str):
            if duration=='to_next_player_end':return {'round':self.state['round']+1,'boundary':'player_end'}
            raise EngineFault('UNLOWERED_DURATION:'+duration)
        if not isinstance(duration,dict) or duration.get('rounds') not in [1,2,3] or duration.get('boundary') not in ['player_start','player_end','end_round']:raise RuleError('DURATION_REQUIRED_OR_INVALID')
        d=duration
        return {'round':self.state['round']+d['rounds'],'boundary':d['boundary'],
                'owner_exit':d.get('expires_on_owner_exit',False)}

    def _token_count(self,tid,eid):
        status=self._ctx.get('status')
        return sum(t['count'] for t in sorted(self.state['tokens'].values(),key=self._instance_order) if t['definition_id']==tid and (t['beneficiary_entity_id']==eid or eid in self.state['roles'] and t.get('beneficiary_role_id')==eid)
            and (not status or not t.get('status_instance_id') or t.get('status_instance_id')==status['instance_id']))

    def _token(self,tid,eid,n,grant,args=None):
        if tid not in self.data.tokens:raise EngineFault('UNKNOWN_TOKEN:'+tid)
        if type(n)!=int or n<0:raise RuleError('TOKEN_AMOUNT')
        if n==0:return
        if not grant:
            matches=[t for t in self.state['tokens'].values() if t['definition_id']==tid and (t['beneficiary_entity_id']==eid or eid in self.state['roles'] and t.get('beneficiary_role_id')==eid)]
            authorized=[t for t in matches if (t.get('beneficiary_role_id') or t.get('owner_role_id'))==self._ctx.get('owner_role') and (not self._ctx.get('status') or t.get('status_instance_id')==self._ctx['status']['instance_id'])]
            if sum(t['count'] for t in authorized)<n:raise RuleError('FOREIGN_TOKEN' if matches and not authorized else 'TOKEN_COST')
            for key,t in list(self.state['tokens'].items()):
                if t not in authorized:continue
                if t['definition_id']!=tid or not (t['beneficiary_entity_id']==eid or eid in self.state['roles'] and t.get('beneficiary_role_id')==eid):continue
                if self._ctx.get('status') and t.get('status_instance_id')!=self._ctx['status']['instance_id']:continue
                take=min(n,t['count']);t['count']-=take;n-=take
                if t['count']==0:del self.state['tokens'][key]
                if n==0:break
            return
        args=args or {};status=self._ctx.get('status');key=self._id('token')
        definition=self.data.tokens[tid]
        if status and definition.get('source')!=status['definition_id']:raise EngineFault('STATUS_TOKEN_BINDING_MISMATCH')
        beneficiary_role=eid if eid in self.state['roles'] else self._ctx.get('switch',{}).get('to_role_id')
        if args.get('beneficiary_binding')=='next_template_bound':eid=BODY
        existing=[t for t in sorted(self.state['tokens'].values(),key=self._instance_order) if t['definition_id']==tid and t['beneficiary_entity_id']==eid and t.get('status_instance_id')==(status['instance_id'] if status else None)]
        if existing:return
        self._clear_exclusive_slot(definition)
        payload=dict(definition.get('creation_defaults',{}),**args.get('payload',{}))
        self.state['tokens'][key]={'instance_id':key,'definition_id':tid,'count':min(n,definition.get('cap',definition.get('max_count',3))),
            'beneficiary_entity_id':eid,'beneficiary_body_id':BODY,'beneficiary_role_id':beneficiary_role,
            'owner_role_id':self._ctx['owner_role'],'status_instance_id':status['instance_id'] if status else None,
            'payload':self._resolve_payload(payload),'source_actor_entity_id':self._ctx.get('actor_entity_id',BODY),'source_attack':self._ctx['attack'],'source_skill_level':self._ctx['level'],
            'origin_root_action_id':self._ctx['root_action_id'],'source_branch_id':self._ctx.get('source_branch_id',self._ctx['branch_id']),'ability_id':self._ctx['ability_id'], 'expiry':clone(status['expiry']) if status else self._expiry(args.get('duration'))}

    def _resolve_payload(self,payload):
        return {k:clone(self._value(v)) if isinstance(v,dict) and any(x in v for x in ['ref','array_ref','calc','query']) else clone(v) for k,v in payload.items()}

    def _status(self,sid,eid,args):
        if sid not in self.data.statuses:raise EngineFault('UNKNOWN_STATUS:'+sid)
        definition=self.data.statuses[sid];n=self._value(args.get('stacks',1));c=self._ctx
        old=[z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['definition_id']==sid and z['target_entity_id']==eid]
        policy=definition.get('stacking_policy',definition.get('stacking','replace'))
        if old and ('ignore' in str(policy) or sid=='havoc_bane'):
            self._emit('STATUS_APPLIED',eid,status_id=sid,status_instance_id=None,accepted_stacks=0,amount_applied=0,reason='IGNORED_LIVE');return
        if not old and eid in self.state['enemies'] and len([z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['target_entity_id']==eid and not z.get('modifier')])>=2:
            self._emit('STATUS_REJECTED',eid,status_id=sid,accepted_stacks=0,reason='TARGET_MARK_CAPACITY');return
        for z in old:self._remove_status(z,'replaced')
        iid=self._id('status');st={'instance_id':iid,'definition_id':sid,'target_entity_id':eid,'owner_role_id':c['owner_role'],
            'stacks':min(n,definition.get('max_stacks',definition.get('cap',1))), 'payload':self._resolve_payload(args.get('payload',{})),
            'expiry':self._expiry(args.get('duration',definition.get('duration'))),'origin_root_action_id':c['root_action_id'],
            'source_actor_entity_id':c.get('actor_entity_id',BODY),'source_attack':c['attack'],'source_skill_level':c['level'],'source_branch_id':c.get('source_branch_id',c['branch_id']),'ability_id':c['ability_id'],'hooks':clone(definition.get('hooks',[])),
            'ordinal':self.state['serial'],'bound_template_id':eid if eid in self.state['roles'] else c.get('switch',{}).get('to_template_id')}
        before_hash=None if self._dry else self._combat_hash();self.state['statuses'][iid]=st
        self._emit('STATUS_APPLIED',eid,status_id=sid,status_instance_id=iid,accepted_stacks=st['stacks'],amount_applied=st['stacks'],pre_state_hash=before_hash)

    def _remove_status(self,status,reason):
        iid=status['instance_id']
        if iid not in self.state['statuses']:return
        before_hash=None if self._dry else self._combat_hash()
        del self.state['statuses'][iid]
        for key,t in list(self.state['tokens'].items()):
            if t.get('status_instance_id')==iid:del self.state['tokens'][key]
        self._emit('STATUS_REMOVED',status['target_entity_id'],status_id=status['definition_id'],status_instance_id=iid,reason=reason,pre_state_hash=before_hash)

    def _resource(self,rid,n,operation):
        if type(n)!=int or n<0:raise RuleError('RESOURCE_AMOUNT')
        before_hash=None if self._dry else self._combat_hash()
        common=rid in ['energy','concerto'];o=self.state['body'] if common else self._owner()['private']
        cap={'energy':10,'concerto':6}[rid] if common else self._owner()['caps'].get(rid)
        if cap is None or rid not in o:raise RuleError('UNACQUIRED_RESOURCE:'+rid)
        old=o[rid];requested=n
        if operation=='spend':
            if old<n:raise RuleError('RESOURCE_COST:'+rid)
            o[rid]-=n;accepted=n;kind='RESOURCE_SPENT'
        else:
            if rid=='concerto' and not self._ctx.get('baseline_concerto'):
                key='extra_concerto|'+self._ctx['root_action_id'];remaining=max(0,1-self.state['limits'].get(key,0));n=min(n,remaining);self.state['limits'][key]=1 if n else self.state['limits'].get(key,0)
            o[rid]=min(cap,n if operation=='set' else old+n);accepted=abs(o[rid]-old);kind='RESOURCE_GAINED' if o[rid]>=old else 'RESOURCE_SPENT'
        overflow=max(0,requested-cap) if operation=='set' else max(0,requested-accepted) if operation=='gain' else 0
        if accepted or overflow:self._emit('CONCERTO_GAINED' if accepted and rid=='concerto' and kind=='RESOURCE_GAINED' else kind,
            BODY if common else self._ctx['owner_role'],resource_id=rid,amount_requested=requested,amount_applied=accepted,accepted=accepted,overflow=overflow,pre_state_hash=before_hash)

    def _scaled(self,args):
        if args.get('basis','scaled_attack')=='fixed':return max(0,self._value(args.get('fixed_amount',args.get('amount',0))))
        scale=[10000,10500,11000,11500,12000,12500,13000,13500,14000,15000][self._ctx['level']-1]
        return max(0,self._ctx['attack']*self._value(args['coefficient_bp'])*scale//100000000+self._value(args.get('flat_amount',0)))

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
                if z['target_entity_id'] not in [BODY,c['owner_role']]:continue
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
            self._release_group('TARGET_DIED',[eid])
            pre=[z['definition_id'] for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['target_entity_id']==eid]
            self._emit('TARGET_DIED',eid,pre_death_status_ids=sorted(pre),killer_side='enemy' if c.get('origin_kind')=='enemy_skill' else 'none' if c.get('origin_kind')=='system' and c.get('owner_role') is None else 'allied')
            for z in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
                if z['target_entity_id']==eid:self._remove_status(z,'death')
        if not self._ctx.get('simultaneous_group'):self._terminal()

    def _heal(self,eid,args):
        e=self._entity(eid)
        if not e.get('alive',True):return
        before_hash=None if self._dry else self._combat_hash()
        self._ctx['heal']={'ability_role_id':self._ctx['owner_role']}
        n=self._scaled(args);bonus=sum(effect.get('amount_bp',0) for effect in self.state.get('equipment_effects',[]) if effect.get('bonus_lane')=='equipment_heal_bonus_bp' and not isinstance(effect.get('trigger'),dict))
        modifiers=[z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if self._ctx.get('origin_kind')!='deployment' and z.get('modifier') and z['lane']=='healing' and z['origin_root_action_id']!=self._ctx['root_action_id'] and self._pred(z.get('damage_filter',True))]
        bonus+=sum(z['amount_bp'] for z in modifiers)
        n=n*(10000+min(5000,bonus))//10000;actual=min(n,e['max_hp']-e['hp']);e['hp']+=actual
        if actual:self._usage['modifiers'].update(z['instance_id'] for z in modifiers)
        if actual:self._emit('HEAL_APPLIED',eid,actual_heal=actual,amount_requested=n,amount_applied=actual,pre_state_hash=before_hash)

    def _terminal(self):
        if self.state['outcome']:
            self._terminal_cleanup();return
        if not self.state['body']['alive']:self.state['outcome']='defeat'
        elif all(not e['alive'] for e in self.state['enemies'].values()):self.state['outcome']='victory'
        if self.state['outcome']:
            self.state['phase']='terminal';self._emit('BATTLE_ENDED',BODY,outcome=self.state['outcome']);self._terminal_cleanup()

    def _dep_select(self,selector):
        if selector=='context_current':
            d=self._ctx.get('deployment')
            if d is None:
                iid=self._ctx.get('last_created_deployment_instance_id');d=self.state['deployments'].get(iid)
            if d is None:raise RuleError('DEPLOYMENT_CONTEXT')
        elif selector=='explicitinstance' or isinstance(selector,dict) and selector['kind']=='request_choice':
            iid=self._ctx['request']['choices'].get('deployment_instance_id');d=self.state['deployments'].get(iid)
            if d is None:raise RuleError('DEPLOYMENT_CHOICE_REQUIRED')
        elif isinstance(selector,dict) and selector['kind']=='by_stacking_key':
            found=[x for x in sorted(self.state['deployments'].values(),key=self._instance_order) if x['stacking_key']==selector['stacking_key'] and x['owner_role_id']==self._ctx['owner_role']]
            if len(found)!=1:raise RuleError('DEPLOYMENT_SELECTION')
            d=found[0]
        elif isinstance(selector,dict) and selector['kind']=='created_by_effect':
            iid=self._ctx.get('created_by_effect',{}).get(selector['creator_effect_id']);d=self.state['deployments'].get(iid)
            if not d or d['definition_id']!=selector['expected_definition_id']:raise RuleError('CREATED_DEPLOYMENT_BINDING')
        else:raise EngineFault('UNKNOWN_DEPLOYMENT_SELECTOR:'+canonical(selector))
        if d['owner_role_id']!=self._ctx['owner_role'] or d.get('owner_body_id',BODY)!=BODY:raise RuleError('FOREIGN_DEPLOYMENT')
        if isinstance(selector,dict):
            if selector.get('expected_owner_role') and selector['expected_owner_role']!=d['owner_role_id']:raise RuleError('DEPLOYMENT_OWNER_BINDING')
            if selector.get('expected_stacking_key') and selector['expected_stacking_key']!=d['stacking_key']:raise RuleError('DEPLOYMENT_KEY_BINDING')
            if selector.get('expected_definition_id') and selector['expected_definition_id']!=d['definition_id']:raise RuleError('DEPLOYMENT_DEFINITION_BINDING')
        return d

    def _deploy(self,args,effect):
        did=args['definition_id']
        if did not in self.data.deployments:raise EngineFault('UNKNOWN_DEPLOYMENT:'+did)
        definition=self.data.deployments[did];key=definition['stacking_key']
        old=[d for d in sorted(self.state['deployments'].values(),key=self._instance_order) if d['stacking_key']==key]
        if old:raise RuleError('DEPLOYMENT_REJECT_IF_PRESENT' if definition.get('replacement')=='reject_if_present' else 'REPLACEMENT_CHOICE_REQUIRED')
        if len(self.state['deployments'])>=2:raise RuleError('DEPLOYMENT_CAPACITY')
        c=self._ctx;iid=self._id('deployment')
        source=c['origin_instance_id'] if definition['source_card_policy']!='effect_only' else None
        if source and any(d['source_card']==source for d in self.state['deployments'].values()):raise RuleError('SOURCE_CARD_ALREADY_DEPLOYED')
        payload=self._resolve_payload(args.get('paid_activation_snapshot',{}))
        payload.setdefault('target_entity_ids',clone(c['selected_target_entity_ids']))
        payload.setdefault('route',self._owner()['phase'].get('route'))
        d={'instance_id':iid,'definition_id':did,'stacking_key':key,'owner_role_id':c['owner_role'],'owner_body_id':BODY,
            'remaining_uses':definition['remaining_uses'],'expiry':self._expiry(definition.get('duration')),
            'source_actor_entity_id':c.get('actor_entity_id',BODY),'source_attack':c['attack'],'source_skill_level':c['level'],'source_branch_id':c.get('source_branch_id',c['branch_id']),'source_card':source,
            'destination':'exhaust' if c.get('exhaust') else definition.get('on_leave_destination','discard'),
            'origin_root_action_id':c['root_action_id'],'ability_id':c['ability_id'],'ordinal':self.state['serial'],
            'paid_snapshot':payload}
        before_hash=None if self._dry else self._combat_hash();self.state['deployments'][iid]=d
        c['last_created_deployment_instance_id']=iid;c.setdefault('created_by_effect',{})[effect['effect_id']]=iid
        if source:self._move(source,'deployed')
        self._emit('DEPLOYMENT_CREATED',BODY,deployment_instance_id=iid,definition_id=did,amount_applied=d['remaining_uses'],pre_state_hash=before_hash)
        self._effects(definition.get('on_deploy_effects',[]))

    def _close_dep(self,d,reason,destination=None):
        iid=d['instance_id']
        if iid not in self.state['deployments']:return
        before_hash=None if self._dry else self._combat_hash()
        del self.state['deployments'][iid]
        if d['source_card']:self._move(d['source_card'],destination or d['destination'])
        for status in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
            if status.get('linked_deployment_instance_id')==iid:self._remove_status(status,'replaced' if reason=='replaced' else reason)
        for key,token in list(self.state['tokens'].items()):
            if token.get('linked_deployment_instance_id')==iid:del self.state['tokens'][key]
        self._emit('DEPLOYMENT_EXPIRED',BODY,deployment_instance_id=iid,reason='REPLACED' if reason=='replaced' else reason,
            expired=reason=='expired',fulfilled=reason=='consumed',forfeited_uses=d['remaining_uses'] if reason=='replaced' else 0,
            source_snapshot=clone(d),ability_role_id=d['owner_role_id'],character_ability_source=d['owner_role_id'],
            origin_kind='deployment',origin_ability_id=d['ability_id'],origin_action_id=d['origin_root_action_id'],
            origin_instance_id=iid,actor_entity_id=d.get('source_actor_entity_id',BODY),pre_state_hash=before_hash)
        saved=self._ctx;self._ctx=dict(saved,owner_role=d['owner_role_id'],deployment=d,attack=d['source_attack'],level=d['source_skill_level'],is_mode=False,
            ability_id=d['ability_id'],source_branch_id=d.get('source_branch_id'),actor_entity_id=d.get('source_actor_entity_id',BODY),
            origin_kind='deployment',origin_instance_id=iid,origin_root_action_id=d['origin_root_action_id'])
        effects=self.data.deployments[d['definition_id']].get('expire_effects',[])
        if reason=='replaced':effects=[effect for effect in effects if effect['op'] in ['set_phase','history_reset']]
        try:self._effects(effects)
        finally:self._ctx=saved

    def _effects(self,effects):
        for effect in effects:
            if self.state['outcome']:break
            op=effect['op'];args=effect['args'];c=self._ctx;c['effect_definition_id']=effect['effect_id'];c.pop('damage',None);c.pop('heal',None)
            if op not in self.data.dsl['operation_catalogue']:raise EngineFault('UNKNOWN_OP:'+op)
            if op=='apply_status' and args.get('status_id') in ['fusion_burst','shock_offset','tune_offset']:
                sid=args['status_id'];op='fusion_apply' if sid=='fusion_burst' else 'resonance_offset';args={'stacks':args.get('stacks',1)} if sid=='fusion_burst' else {'route':sid.removesuffix('_offset')}
            c['pre_effect_hash']=None if self._dry else self._combat_hash()
            # A selected target establishes predicate scope before the effect resolves.
            targets=self._targets(effect['target'])
            if op=='gather':
                self._gather(effect);continue
            if op=='damage' and args.get('simultaneous'):c['simultaneous_group']=True
            for eid in targets:
                c['target_id']=eid
                if not self._pred(effect.get('when',True)):continue
                e=self._entity(eid) if effect['target']['kind']!='cards' else None
                if op=='damage':self._damage(eid,args)
                elif op=='heal':self._heal(eid,args)
                elif op=='block':
                    n=self._scaled(args);e['block']=e.get('block',0)+n
                    if n:self._emit('BLOCK_GRANTED',eid,amount_applied=n)
                elif op in ['resource_gain','resource_spend','resource_set']:
                    if args['resource_id'] not in ['energy','concerto'] and eid!=c['owner_role']:raise RuleError('FOREIGN_PRIVATE_RESOURCE')
                    val=args.get('value',args.get('amount'));val=(self.state['body'][args['resource_id']] if args['resource_id'] in ['energy','concerto'] else self._owner()['private'][args['resource_id']]) if val=='all' else self._value(val)
                    self._resource(args['resource_id'],val,{'resource_gain':'gain','resource_spend':'spend','resource_set':'set'}[op])
                elif op=='set_phase':
                    axis=args['axis_id'];value=self._value(args['value'])
                    if eid!=c['owner_role']:raise RuleError('FOREIGN_PHASE')
                    phases=self._owner()['phase'];acquired=axis in phases
                    current=phases[axis] if acquired else self._registered_phase_initial(c['owner_role'],axis)
                    if not acquired and value!=current:raise RuleError('UNACQUIRED_PHASE:'+axis)
                    if value not in self.data.roles[c['owner_role']]['phase_axes'][axis]['states']:raise RuleError('UNREGISTERED_PHASE_VALUE')
                    transitions=self.data.roles[c['owner_role']]['transitions']
                    if not any(row['effect_id']==effect['effect_id'] and row['axis_id']==axis and row['to']==value and current in row['from'] for row in transitions):raise RuleError('UNREGISTERED_PHASE_TRANSITION')
                    if not acquired:continue
                    phases[axis]=value;self._emit('PHASE_CHANGED',eid,axis_id=axis,value=value)
                elif op in ['history_add','history_reset']:
                    hid=args['history_id'];o=self._owner()
                    if eid!=c['owner_role']:raise RuleError('FOREIGN_HISTORY')
                    if hid not in o['history']:raise RuleError('UNACQUIRED_HISTORY')
                    if op=='history_reset':
                        sources=self.data.history_reset_sources.get(effect['effect_id'],[])
                        authorized=any(source['family']=='abilities' and source['container_id']==c.get('ability_id') or source['family']=='deployments' and source['container_id']==c.get('deployment',{}).get('definition_id') for source in sources)
                        if not authorized or c.get('is_mode') or self.data.abilities.get(c.get('ability_id'),{}).get('card_type')=='mode' or self.data.history_reset_registry.get(effect['effect_id'])!=args:raise RuleError('HISTORY_RESET_SCOPE')
                        o['history'][hid]=0
                    else:
                        amount=self._value(args['amount'])
                        if type(amount)!=int or amount<0:raise RuleError('HISTORY_AMOUNT')
                        paid=c.get('payment',{}).get('private',{})
                        backing=sum(min(paid.get(event.get('resource_id'),0),event.get('amount_applied',0)) for event in self.state['events'] if event['root_action_id']==c['root_action_id'] and event['event_type']=='RESOURCE_SPENT' and event.get('ability_role_id')==c['owner_role'] and event.get('resource_id') in o['private'])
                        if amount>backing:raise RuleError('HISTORY_REQUIRES_ACTUAL_PAYMENT')
                        key='history:'+c['owner_role']+':'+hid+':'+c['root_action_id']
                        if amount and not self.state['limits'].get(key):
                            o['history'][hid]=min(o['history_caps'][hid],o['history'][hid]+amount);self.state['limits'][key]=amount
                elif op=='apply_status':self._status(args['status_id'],eid,args)
                elif op=='remove_status':
                    for z in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
                        if z['definition_id']==args['status_id'] and z['target_entity_id']==eid:
                            if z.get('modifier') and z['owner_role_id']!=c['owner_role']:raise RuleError('FOREIGN_MODIFIER')
                            self._remove_status(z,args['reason'])
                elif op=='fusion_apply':
                    n=self._value(args['stacks']);old=e.get('fusion',0);e['fusion']=min(e.get('fusion_cap',3),old+n);accepted=e['fusion']-old
                    self._emit('STATUS_APPLIED',eid,status_id='fusion_burst',accepted_stacks=accepted,amount_applied=accepted,source_role_id=c['owner_role'])
                elif op=='fusion_detonate':
                    n=e.get('fusion',0)
                    if n<=0:raise RuleError('FUSION_EMPTY')
                    e['fusion']=0;e['fusion_cap']=3;self._emit('FUSION_DETONATED',eid,stacks=n)
                    self._damage(eid,{'coefficient_bp':4000*n,'element':'fusion','damage_tags':['anomaly']})
                elif op=='extend_anomaly_cap':e['fusion_cap']=5
                elif op=='resonance_add':
                    old=e.get('resonance',0);e['resonance']=min(6,old+self._value(args['amount']));accepted=e['resonance']-old
                    if accepted:self._emit('RESONANCE_PROGRESS',eid,accepted=accepted,amount_applied=accepted)
                elif op=='resonance_offset':
                    route=self._value(args['route']);old=e.get('offset');e['offset']=route
                    self._emit('RESONANCE_OFFSET_APPLIED',eid,status_id=route+'_offset',accepted_stacks=int(old!=route),amount_applied=int(old!=route))
                elif op=='resonance_break':
                    if e.get('resonance',0)<6:raise RuleError('RESONANCE_NOT_FULL')
                    e['resonance']=0;offset=e.get('offset');e['offset']=None
                    self._emit('RESONANCE_BREAK',eid,offset_route=offset)
                    self._damage(eid,{'coefficient_bp':10000,'element':'neutral','damage_tags':['break']},{'offset_route':offset,'damage_kind':'resonance_break'})
                    if offset and e['alive']:self._damage(eid,{'coefficient_bp':5000,'element':'neutral','damage_tags':['interference']},{'offset_route':offset,'interference_kind':offset,'damage_kind':'interference'})
                    if e.get('intent',{}).get('interruptible'):e['intent']['cancelled']=True
                elif op=='deploy':self._deploy(args,effect)
                elif op=='close_deployment':self._close_dep(self._dep_select(args['deployment_selector']),args['reason'],args.get('destination'))
                elif op=='deployment_spend_uses':
                    d=self._dep_select(args['deployment_selector']);n=self._value(args['amount'])
                    if d['remaining_uses']<n:raise RuleError('DEPLOYMENT_USES')
                    d['remaining_uses']-=n
                elif op=='deployment_retarget':
                    if c['payment']['energy']<1:raise RuleError('RETARGET_PAYMENT')
                    d=self._dep_select(args['deployment_selector']);d['paid_snapshot']['target_entity_ids']=[eid]
                elif op=='draw':self._draw(self._value(args['count']))
                elif op in ['discard','exhaust']:self._move(eid,op)
                elif op=='recover':
                    card=self.state['cards'][eid];ability=self.data.abilities[card['definition_id']];profile=self.state['profile'];skill=ability.get('skill_id')
                    if not card.get('temporary') and eid not in profile['owned_cards']:raise RuleError('RECOVER_UNOWNED')
                    if skill and skill not in profile.get('battle_skill_snapshot',{}) and skill not in profile.get('skills',{}) and ability['id'] not in profile.get('learned',[]):raise RuleError('RECOVER_UNLEARNED')
                    if args['destination']=='hand' and len(self.state['zones']['hand'])>=10:
                        if effect['target'].get('on_insufficient')=='up_to':continue
                        raise RuleError('HAND_CAPACITY')
                    self._move(eid,args['destination'])
                elif op=='retain':
                    if eid not in self.state['zones']['hand']:raise RuleError('RETAIN_ZONE')
                    if len(self.state['retained'])>=2 and eid not in self.state['retained']:raise RuleError('RETAIN_CAPACITY')
                    self.state['retained'][eid]=self.state['round']+1
                elif op=='generate':
                    did=args['card_definition_id']
                    if did not in self.data.abilities:raise EngineFault('GENERATE_UNKNOWN')
                    ability=self.data.abilities[did]
                    if did!='ENEMY_BURDEN' and ability.get('skill_id') not in self.state['profile']['skills']:raise RuleError('GENERATE_UNLEARNED')
                    count=self._value(args['count'])
                    if count not in [1,2,3]:raise RuleError('GENERATE_COUNT')
                    for _ in range(count):
                        iid=self._id('generated');self.state['cards'][iid]={'instance_id':iid,'definition_id':did,'temporary':True};self._move(iid,args['destination'])
                elif op in ['grant_token','consume_token']:self._token(args['token_id'],eid,self._value(args['amount']),op=='grant_token',args)
                elif op=='grant_modifier':
                    mid=args['modifier_id']
                    if mid not in self.data.modifiers:raise EngineFault('UNKNOWN_MODIFIER:'+mid)
                    existing=any(z['definition_id']==mid and z['target_entity_id']==eid for z in sorted(self.state['statuses'].values(),key=self._instance_order))
                    policy=str(self.data.modifiers[mid].get('stacking_policy',self.data.modifiers[mid].get('stacking','replace')))
                    if existing and 'ignore' in policy:continue
                    self._clear_exclusive_slot(self.data.modifiers[mid])
                    for z in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
                        if z['target_entity_id']==eid and z['definition_id']==mid:self._remove_status(z,'replaced')
                    iid=self._id('modifier');self.state['statuses'][iid]={'instance_id':iid,'definition_id':mid,'target_entity_id':eid,
                        'owner_role_id':c['owner_role'],'modifier':True,'lane':args['lane'],'amount_bp':self._value(args['amount_bp']),
                        'damage_filter':clone(args.get('damage_filter',True)),'uses':args['uses'],'expiry':self._expiry(args['duration']),
                        'origin_root_action_id':c['root_action_id'],'hooks':[],'source_actor_entity_id':c.get('actor_entity_id',BODY),'source_attack':c['attack'],'source_skill_level':c['level'],'ability_id':c['ability_id']}
                elif op=='shield':
                    sid=args['status_id'];self._status(sid,eid,dict(args,stacks=1))
                    z=next(z for z in sorted(self.state['statuses'].values(),key=self._instance_order) if z['definition_id']==sid and z['target_entity_id']==eid)
                    z.update(shield=True,amount=self._scaled(args),uses=args.get('uses'),damage_filter=args.get('damage_filter',True));self._emit('SHIELD_GRANTED',eid,amount_applied=z['amount'])
                elif op=='proof':
                    key='proof:'+str(c['owner_role'])
                    if self.state['limits'].get(key):raise RuleError('PROOF_ONCE')
                    self.state['limits'][key]=1;iid=self._id('proof')
                    self.state['statuses'][iid]={'instance_id':iid,'definition_id':key,'target_entity_id':eid,'owner_role_id':c['owner_role'],
                        'proof':True,'policy':args['policy'],'heal_coefficient':args.get('on_consumed_heal',0),'expiry':self._expiry(args['duration']),
                        'origin_root_action_id':c['root_action_id'],'hooks':[],'source_actor_entity_id':c.get('actor_entity_id',BODY),'source_attack':c['attack'],'source_skill_level':c['level'],'ability_id':c['ability_id']}
                elif op=='intent_control':
                    intent=e['intent'];kind=args['kind']
                    if kind=='reduce':intent['damage']=max(0,intent['damage']-self._value(args['amount']))
                    elif kind=='delay' and not intent.get('delayed_once'):
                        intent['delayed_once']=True;e['delayed_intent']=clone(intent);intent['cancelled']=True
                    elif kind in ['interrupt','cancel'] and intent.get('interruptible'):intent['cancelled']=True
                elif op=='set_elevation':
                    if args['elevation']=='AERIAL' and args['duration_rounds'] not in [1,2,3] or args['elevation']=='GROUND' and args['duration_rounds']!=0:raise RuleError('ELEVATION_DURATION')
                    before=e['elevation'];e['elevation']=args['elevation'];e['elevation_expires']=self.state['round']+args['duration_rounds']-1
                    e['elevation_source']={'effect_definition_id':effect['effect_id'],'character_ability_source':c['owner_role'],'root_action_id':c['root_action_id'],'actor_entity_id':c.get('actor_entity_id',BODY),'origin_kind':c['origin_kind'],'ability_id':c['ability_id']}
                    if e['elevation']=='GROUND':e['elevation_expires']=None;e['elevation_source']=None
                    self._emit('ELEVATION_CHANGED',eid,elevation=e['elevation'],**self._spatial_row(effect['effect_id'],[eid],[eid],[],elevation={'before':before,'after':e['elevation']},expiry=e['elevation_expires'] if e['elevation']=='AERIAL' else None))
                elif op=='emit_tagged_event':self._emit(args['event_type'],eid,**self._resolve_payload(args.get('payload',{})))
                elif op=='consume_source_set':
                    if c['owner_role']!='aemeath' or 'aemeath_r2' not in c['ability_tags']:raise RuleError('SOURCE_SET_AUTHORITY')
                    self.state['contributors'][self._value(args['route'])]=[]
                else:raise EngineFault('UNIMPLEMENTED_OP:'+op)
            if c.pop('simultaneous_group',False):self._terminal()
            c.pop('target_id',None)
        self._ctx.pop('effect_definition_id',None);self._ctx.pop('pre_effect_hash',None)

    def _ability(self,iid):
        did=self.state['cards'][iid]['definition_id'];ability=self.data.abilities[did]
        if did in ['COMMON_A','COMMON_D'] and self.state['active_role']:
            ability=self.data.mappings[self.state['active_role']][did]
        return ability

    def _admit_selected_effects(self,effects,choices):
        for effect in effects:
            selector=effect['target']
            if selector['kind'] in ['chosen_enemy','chosen_ally_body']:
                key=selector['selector_id']
                if key in choices and isinstance(choices[key],dict) and choices[key].get('selector') in ['living_enemies','living_allies'] and key not in self._ctx['request'].get('choices',{}):raise RuleError('TARGET_CHOICE_REQUIRED:'+key)
                self._targets(selector,validate=True)

    def _pay(self,costs,commit=True):
        energy=sum(self._value(c.get('energy',0)) for c in costs);private={};tokens={};choices=[]
        for cost in costs:
            for r in cost.get('private',[]):private[r['resource_id']]=private.get(r['resource_id'],0)+self._value(r['amount'])
            for t in cost.get('tokens',[]):tokens[t['token_id']]=tokens.get(t['token_id'],0)+self._value(t['amount'])
            for ch in cost.get('card_choices',[]):
                sel=clone(ch['selector']);sel['count']=self._value(ch['count']);sel['selector_id']=ch['choice_id']
                choices.extend((iid,ch['destination']) for iid in self._select_cards(sel))
        if energy<0 or energy>self.state['body']['energy']:raise RuleError('ENERGY_COST')
        for rid,n in private.items():
            if n<0 or self._owner()['private'].get(rid,-1)<n:raise RuleError('PRIVATE_COST:'+rid)
        for tid,n in tokens.items():
            if self._token_count(tid,self._ctx['owner_role'])<n and self._token_count(tid,BODY)<n:raise RuleError('TOKEN_COST:'+tid)
        if len({i for i,_ in choices})!=len(choices):raise RuleError('DUPLICATE_COST_CARD')
        self._ctx['payment']={'energy':energy,'private':private}
        plan={'energy':energy,'private':private,'tokens':tokens,'choices':choices}
        if commit:self._commit_payment(plan)
        return plan

    def _commit_payment(self,plan):
        energy,private,tokens,choices=plan['energy'],plan['private'],plan['tokens'],plan['choices']
        if energy:self._resource('energy',energy,'spend')
        for rid,n in private.items():
            if n:self._resource(rid,n,'spend')
        for tid,n in tokens.items():self._token(tid,self._ctx['owner_role'] if self._token_count(tid,self._ctx['owner_role'])>=n else BODY,n,False)
        for iid,zone in choices:self._move(iid,zone)

    def _switch(self,to_role):
        old=self.state['active_role'];c=self._ctx
        if to_role==old:return
        full=old is not None and self.state['body']['concerto']==6
        c['switch']={'full_handoff':full,'from_template_id':old,'to_template_id':to_role,'to_role_id':to_role}
        if full:
            for role,side in [(old,'outro'),(to_role,'intro')]:
                aid=self.data.handoff.get(role,{}).get(side+'_ability_id')
                if aid and aid in self.state['profile']['learned']:self._targets(self.data.abilities[aid].get('targets'),validate=True)
            self._resource('concerto',6,'spend')
        if old:
            for key,t in list(self.state['tokens'].items()):
                if t.get('beneficiary_role_id')==old and t['expiry'].get('owner_exit'):del self.state['tokens'][key]
            for z in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
                if z['target_entity_id']==old and z['expiry'].get('owner_exit'):self._remove_status(z,'owner_exit')
            for d in list(sorted(self.state['deployments'].values(),key=self._instance_order)):
                if d['owner_role_id']==old and self.data.deployments[d['definition_id']].get('owner_exit')=='expire':self._close_dep(d,'owner_exit')
        if full:self._handoff(old,'outro')
        if self.state['outcome']:return
        self.state['active_role']=to_role;self._emit('MODE_SWITCHED',BODY,from_template_id=old,to_template_id=to_role,full_handoff=full)
        if full:self._handoff(to_role,'intro')

    def _handoff(self,role,side):
        aid=self.data.handoff.get(role,{}).get(side+'_ability_id')
        if not aid or aid not in self.state['profile']['learned']:return
        a=self.data.abilities[aid];saved=self._ctx
        self._ctx=dict(saved,owner_role=role,ability_id=aid,level=self._skill_level(a.get('skill_id')),ability_tags=a.get('ability_tags',[]),action_ability_id=saved['ability_id'])
        try:
            if self._pred(a.get('condition',True)):self._effects(a.get('effects',[]))
        finally:self._ctx=saved

    def _execute(self,request):
        if self.state['outcome']:raise RuleError('TERMINAL')
        if request.get('battle_id')!=self.state['battle_id']:raise RuleError('BATTLE_ID')
        if request.get('actor_entity_id')!=BODY:raise RuleError('ACTOR')
        if self.state['phase']!='player':raise RuleError('NOT_PLAYER_PHASE')
        self._usage={'modifiers':set(),'equipment':set()};self._derived_events=0
        self._root_snapshot=snapshot_state(self.state);start=len(self.state['events']);cmd=request['command']
        if cmd=='play_card':
            iid=request.get('card_instance_id_or_null')
            if iid not in self.state['zones']['hand']:raise RuleError('CARD_NOT_IN_HAND')
            a=self._ability(iid);branchid=request.get('branch_id_or_null');branches=a.get('branches',[])
            if branches:
                branch=next((b for b in branches if b['id']==branchid),None)
                if branch is None:raise RuleError('BRANCH_REQUIRED')
            else:
                if branchid is not None:raise RuleError('UNEXPECTED_BRANCH')
                branch={}
            self._ctx=self._context(a,request);self._ctx['root_event_start']=start
            if a.get('owner_role_id') not in [None,'common'] and a['owner_role_id'] not in self.state['roles']:raise RuleError('UNSELECTED_ROLE')
            if request.get('choices',{}).get('deployment_instance_id'):
                self._ctx['selected_deployment']=self._dep_select('explicitinstance')
            sel=branch.get('targets_override',branch.get('targets',a.get('targets')))
            selected=self._targets(sel,validate=True)
            if sel and branch.get('card_type',a.get('card_type'))!='mode' and sel['kind'] not in ['owner_template','active_template','next_template_bound','cards']:self._ctx['selected_target_entity_ids']=list(selected)
            if not self._pred(a.get('condition',True)) or not self._pred(branch.get('condition',True)):raise RuleError('CONDITION')
            if self._ctx['level']<branch.get('minimum_skill_level',1):raise RuleError('SKILL_LEVEL')
            limit_specs={}
            for default_key,lim in [(a['id']+':base',a.get('usage_limit') or {}),(a['id']+':'+str(branchid),branch.get('usage_limit') or {})]:
                key=lim.get('limit_key',default_key);merged=limit_specs.setdefault(key,{})
                for scope,value in lim.items():
                    if scope!='limit_key' and value is not None:merged[scope]=min(merged.get(scope,value),value)
            if any(not self._limit_ok(key,lim) for key,lim in limit_specs.items()):raise RuleError('USAGE_LIMIT')
            self._admit_selected_effects(a.get('effects',[])+branch.get('effects',[]),branch.get('choices',{}))
            for d in walk(branch):
                if d.get('kind')=='request_choice' and d.get('choice_id')=='deployment_instance_id':self._ctx['selected_deployment']=self._dep_select(d)
            payment_plan=self._pay([a.get('cost',{}),branch.get('cost',{})],commit=False)
            replacement=self._prepare_replacement(a.get('effects',[])+branch.get('effects',[]))
            self._commit_payment(payment_plan)
            for key,lim in limit_specs.items():self._limit_ok(key,lim,True)
            self._move(iid,'resolving')
            self._ctx['ability_tags']=list(dict.fromkeys(a.get('ability_tags',[])+branch.get('ability_tags',[])))
            self._ctx['exhaust']='exhaust' in a.get('keywords',[])+branch.get('keywords',[])
            card_type=branch.get('card_type',a.get('card_type','action'));self._ctx['is_mode']=card_type=='mode'
            if replacement:self._close_dep(replacement,'replaced')
            if card_type=='mode':self._switch(a['owner_role_id'])
            else:self._effects(a.get('effects',[])+branch.get('effects',[]))
            self._drain()
            if iid in self.state['zones']['resolving']:self._move(iid,'exhaust' if self._ctx['exhaust'] else 'discard')
            for dep in list(sorted(self.state['deployments'].values(),key=self._instance_order)):
                if dep['remaining_uses']==0:self._close_dep(dep,'consumed')
            if card_type!='mode':self._commit_action(a,start)
        elif cmd=='activate_deployment':
            iid=request.get('choices',{}).get('deployment_instance_id');dep=self.state['deployments'].get(iid)
            if not dep:raise RuleError('DEPLOYMENT_CHOICE_REQUIRED')
            definition=self.data.deployments[dep['definition_id']];aid=request.get('choices',{}).get('ability_id')
            if aid not in definition.get('activation_ability_ids',[]):raise RuleError('ACTIVATION_ABILITY')
            a=self.data.abilities[aid];self._ctx=self._context(a,request,deployment=dep,selected_deployment=dep,
                attack=dep['source_attack'],level=dep['source_skill_level'],origin_kind='player_skill',root_event_start=start)
            selected=self._targets(a.get('targets'),validate=True)
            if a.get('targets') and a['targets']['kind'] not in ['owner_template','active_template','next_template_bound','cards']:self._ctx['selected_target_entity_ids']=list(selected)
            if not self._pred(a.get('condition',True)):raise RuleError('CONDITION')
            lim=a.get('usage_limit') or {};key=lim.get('limit_key',a['id']+':base')
            if not self._limit_ok(key,lim):raise RuleError('USAGE_LIMIT')
            self._admit_selected_effects(a.get('effects',[]),a.get('choices',{}))
            payment_plan=self._pay([a.get('cost',{})],commit=False);replacement=self._prepare_replacement(a.get('effects',[]))
            self._commit_payment(payment_plan);self._limit_ok(key,lim,True)
            if replacement:self._close_dep(replacement,'replaced')
            if definition.get('consume_use_on_activation'):
                if dep['remaining_uses']<=0:raise RuleError('DEPLOYMENT_USES')
                dep['remaining_uses']-=1
            self._effects(a.get('effects',[]));self._drain()
            if iid in self.state['deployments'] and dep['remaining_uses']==0:self._close_dep(dep,'consumed')
            self._commit_action(a,start)
        elif cmd=='end_turn':
            self._ctx=self._context(None,request,origin_kind='system',root_event_start=start);self._end_turn()
        elif cmd=='retreat':
            self._ctx=self._context(None,request,origin_kind='system',root_event_start=start)
            self.state['outcome']='retreat';self.state['phase']='terminal';self._emit('BATTLE_ENDED',BODY,outcome='retreat')
        else:raise RuleError('UNKNOWN_COMMAND')
        if cmd not in ['end_turn','retreat']:
            self.state['root_actions_this_turn']+=1
            if self.state['root_actions_this_turn']>24:raise EngineFault('ROOT_ACTION_BUDGET')
        self._drain();self._settle_modifiers();self._terminal()
        return start

    def _commit_action(self,a,start):
        events=self.state['events'][start:];paid=self._ctx['payment']['energy']>=1 or any(self._ctx['payment']['private'].values())
        qualifies=any((e['event_type']=='DAMAGE_APPLIED' and e.get('hp_lost',0)>0) or
            e['event_type'] in ['BLOCK_GRANTED','SHIELD_GRANTED','HEAL_APPLIED','RESONANCE_PROGRESS','DEPLOYMENT_CREATED'] and e.get('amount_applied',0)>0 or
            e['event_type']=='RESOURCE_GAINED' and e.get('resource_id') not in ['energy','concerto'] and e.get('amount_applied',0)>0 or
            e['event_type']=='STATUS_APPLIED' and e.get('status_id')=='fusion_burst' and e.get('accepted_stacks',0)>0 for e in events)
        if paid and qualifies:
            self._ctx['baseline_concerto']=True;self._resource('concerto',1,'gain');self._ctx.pop('baseline_concerto')
        self._emit('ACTION_COMMITTED',BODY,actual_heal=sum(e.get('actual_heal',0) for e in events))
        skill=a.get('skill_id')
        if skill:
            self.state['pending_xp'][skill]=self.state['pending_xp'].get(skill,0)+10
            self._emit('SKILL_XP_PENDING',BODY,skill_id=skill,amount_applied=10)

    def apply(self,request):
        request=clone(request);aid=request.get('action_id')
        if not aid:return {'accepted':False,'code':'ACTION_ID_REQUIRED'}
        payload=digest(request);existing=self.state['receipts'].get(aid)
        if existing:
            if existing['payload_hash']!=payload:return {'accepted':False,'code':'ID_PAYLOAD_CONFLICT','action_id':aid}
            return clone(existing['receipt'])
        if request.get('expected_revision')!=self.state['revision']:
            receipt={'accepted':False,'code':'STALE_REVISION','action_id':aid,'revision':self.state['revision']}
            self.state['receipts'][aid]={'payload_hash':payload,'receipt':receipt};return clone(receipt)
        before=snapshot_state(self.state);self._queue=[]
        try:
            start=self._execute(request);self.state['revision']+=1
            if self.state['outcome'] and not self.state.get('settlement'):
                self.state['profile']=clone(self.state['profile'])
                self.state['settlement']=Growth(self.data,self.state['profile']).commit_xp(self.state['battle_id']+':'+str(self.state['revision']),self.state['outcome'],self.state['pending_xp'])
            receipt={'accepted':True,'code':'OK','action_id':aid,'revision':self.state['revision'],
                     'outcome':self.state['outcome'],'events':clone(self.state['events'][start:]),'state_hash':self._combat_hash()}
            self.state['actions'].append(request)
        except RuleError as ex:
            self.state=before;receipt={'accepted':False,'code':str(ex),'action_id':aid,'revision':self.state['revision']}
        except Exception as ex:
            self.state=before;receipt={'accepted':False,'code':'ENGINE_FAULT','detail':type(ex).__name__+': '+str(ex),'action_id':aid,'revision':self.state['revision']}
        self._queue=[];self.state['receipts'][aid]={'payload_hash':payload,'receipt':clone(receipt)}
        return receipt

    def _request(self,command,card=None,branch=None,targets=None,choices=None):
        r={'battle_id':self.state['battle_id'],'action_id':'','expected_revision':self.state['revision'],'actor_entity_id':BODY,
            'command':command,'card_instance_id_or_null':card,'branch_id_or_null':branch,'target_entity_ids':targets or [],'choices':choices or {}}
        r['action_id']='action:'+str(self.state['revision'])+':'+digest(r)[:16];return r

    def _target_options(self,selector):
        pool=sorted(i for i,e in self.state['enemies'].items() if e['alive']) if selector['kind']=='chosen_enemy' else [BODY]
        minimum=selector.get('min',1);maximum=min(selector.get('max',1),len(pool))
        return [list(ids) for count in range(minimum,maximum+1) for ids in itertools.combinations(pool,count)]

    def _choice_combinations(self,a,branch,request):
        self._ctx=self._context(a,request);selectors={}
        for obj in walk([a.get('cost',{}),branch.get('cost',{}),a.get('effects',[]),branch.get('effects',[]) ]):
            if obj.get('kind')=='cards' and obj.get('selection','player')=='player':selectors[obj['selector_id']]=obj
            if 'choice_id' in obj and 'selector'in obj:
                z=clone(obj['selector']);z['selector_id']=obj['choice_id'];z['count']=obj['count'];selectors[z['selector_id']]=z
        options=[{}]
        explicit_enemy_selectors={obj['selector_id']:obj for obj in walk([a.get('effects',[]),branch.get('effects',[])]) if obj.get('kind') in ['chosen_enemy','chosen_ally_body'] and obj.get('selector_id') in branch.get('choices',{}) and branch['choices'][obj['selector_id']].get('selector') in ['living_enemies','living_allies']}
        for sid,selector in explicit_enemy_selectors.items():options=[dict(option,**{sid:ids}) for option in options for ids in self._target_options(selector)]
        for sid,sel in selectors.items():
            n=self._value(sel.get('count',1));pool=self._card_candidates(sel);counts=range(0,n+1) if sel.get('on_insufficient')=='up_to' else [n]
            choices=[list(ids) for k in counts for ids in itertools.combinations(pool,k)]
            options=[dict(o,**{sid:ids}) for o in options for ids in choices]
        selected_scope=[a.get('condition',True),a.get('cost',{}),a.get('effects',[]),branch]
        needs_dep=any(str(obj.get('ref','')).startswith('context.selected_deployment.') for obj in walk(selected_scope)) or any(obj.get('deployment_selector')=='explicitinstance' or isinstance(obj.get('deployment_selector'),dict) and obj['deployment_selector'].get('kind')=='request_choice' for obj in walk(selected_scope))
        if needs_dep:options=[dict(o,deployment_instance_id=iid) for o in options for iid,d in self.state['deployments'].items() if d['owner_role_id']==self._ctx['owner_role']]
        if any(obj.get('op')=='deploy' for obj in walk([a.get('effects',[]),branch.get('effects',[])])):
            options=[dict(o,**({} if rid is None else {'replace_deployment_instance_id':rid})) for o in options for rid in [None]+sorted(i for i,d in self.state['deployments'].items() if d.get('owner_body_id',BODY)==BODY)]
        return options

    def legal_actions(self,include_blocked=False):
        if self.state['outcome']:return {'legal':[],'blocked':[]} if include_blocked else []
        original=snapshot_state(self.state);context=self._ctx;result=[];errors=[];blocked=[]
        candidates=[];result=[self._request('end_turn'),self._request('retreat')]
        for iid in original['zones']['hand']:
            a=self._ability(iid)
            for branch in a.get('branches') or [{}]:
                sel=branch.get('targets_override',branch.get('targets',a.get('targets',{})))
                target_options=[[]]
                if sel.get('kind') in ['chosen_enemy','chosen_ally_body']:target_options=self._target_options(sel)
                elif a.get('card_type')=='mode' and original['body']['concerto']==6 and original['active_role'] and original['active_role']!=a.get('owner_role_id'):
                    handoffs=[self.data.handoff.get(role,{}).get(side+'_ability_id') for role,side in [(original['active_role'],'outro'),(a.get('owner_role_id'),'intro')]]
                    selectors=[obj for aid in handoffs if aid in original['profile']['learned'] for obj in walk(self.data.abilities[aid]) if obj.get('kind')=='chosen_enemy']
                    target_options=self._target_options({'kind':'chosen_enemy','min':min([obj.get('min',1) for obj in selectors]+[0]),'max':max([obj.get('max',1) for obj in selectors]+[0])})
                for targets in target_options:
                    r=self._request('play_card',iid,branch.get('id'),targets)
                    try:choices=self._choice_combinations(a,branch,r)
                    except RuleError:continue
                    for choice in choices:candidates.append(self._request('play_card',iid,branch.get('id'),targets,choice))
        for iid,dep in original['deployments'].items():
            for aid in self.data.deployments[dep['definition_id']].get('activation_ability_ids',[]):
                a=self.data.abilities[aid];sel=a.get('targets',{})
                target_options=self._target_options(sel) if sel.get('kind') in ['chosen_enemy','chosen_ally_body'] else [[]]
                for targets in target_options:
                    base={'deployment_instance_id':iid,'ability_id':aid};request=self._request('activate_deployment',targets=targets,choices=base)
                    for choices in self._choice_combinations(a,{},request):candidates.append(self._request('activate_deployment',targets=targets,choices=dict(base,**choices)))
        try:
            for request in candidates:
                self.state=snapshot_state(original);self._queue=[];self._dry=True
                try:self._execute(request);result.append(request)
                except RuleError as ex:blocked.append({'request':request,'reason':str(ex)})
                except Exception as ex:errors.append({'request':request,'detail':type(ex).__name__+': '+str(ex)})
        finally:self.state=original;self._ctx=context;self._queue=[];self._dry=False
        self.last_legal_errors=errors;self.last_blocked_actions=blocked
        if errors:raise EngineFault('LEGAL_QUERY_FAULT:'+canonical(errors[:2]))
        return {'legal':result,'blocked':blocked} if include_blocked else result

    def preview_action(self,request):
        saved=clone(self.state);ctx=self._ctx;queue=self._queue
        try:
            result=self.apply(request)
            return {'receipt':result,'observation':self.public_view()}
        finally:self.state=saved;self._ctx=ctx;self._queue=queue

    def public_view(self):
        s=self.state
        out={k:clone(s[k]) for k in ['battle_id','revision','round','phase','outcome','body','active_role','roles','enemies','deployments','statuses','tokens','contributors','encounter','retained','equipment_grants']}
        out['hand']=[dict(clone(s['cards'][i]),ability=clone(self._ability(i))) for i in s['zones']['hand']]
        out['zone_counts']={k:len(v) for k,v in s['zones'].items()}
        out['discard']=[clone(s['cards'][i]) for i in s['zones']['discard']]
        out['exhaust']=[clone(s['cards'][i]) for i in s['zones']['exhaust']]
        out['draw_composition']=[clone(s['cards'][i]) for i in sorted(s['zones']['draw'])]
        out['deployed_cards']=[clone(s['cards'][i]) for i in s['zones']['deployed']]
        out['limits']=clone(s['limits']);out['equipment_counters']=clone(s['equipment_counters'])
        out['equipment_loadout']=clone(s['profile']['gear']);out['root_actions_this_turn']=s['root_actions_this_turn'];out['serial']=s['serial']
        out['pending_xp']=clone(s['pending_xp'])
        out['skills']=clone(s['profile']['skills'] if s['outcome'] else s['profile'].get('battle_skill_snapshot',s['profile']['skills']));out['learned']=clone(s['profile']['learned']);out['inherents']=clone(s['profile']['inherents'])
        return out

    def _checkpoint(self,include_initial=True):
        state=clone(self.state)
        if not include_initial:state.pop('initial_checkpoint',None)
        return {'engine_version':VERSION,'runtime_hash':self.runtime_hash,'candidate':self.candidate,'root':self.root,'contract_hash':self.data.contract_hash,'source_hashes':self.data.manifest,'state':state,'committed':True}

    def serialize(self):return canonical(self._checkpoint())

    def save(self,path):
        path=Path(path);tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(self.serialize(),encoding='utf8');tmp.replace(path)

    @classmethod
    def load(cls,serialized):
        obj=json.loads(serialized) if isinstance(serialized,str) else clone(serialized)
        if not obj.get('committed') or obj.get('engine_version')!=VERSION:raise RuleError('UNSUPPORTED_CHECKPOINT')
        engine=cls(obj['candidate'],obj['root'])
        if obj.get('runtime_hash')!=engine.runtime_hash or obj['contract_hash']!=engine.data.contract_hash or obj.get('source_hashes')!=engine.data.manifest:raise RuleError('CONTRACT_HASH_MISMATCH')
        engine.state=obj['state'];return engine

    def replay(self,actions=None):
        checkpoint=self.state.get('initial_checkpoint')
        if not checkpoint:raise RuleError('MISSING_INITIAL_CHECKPOINT')
        engine=Engine.load(checkpoint)
        for request in actions if actions is not None else self.state['actions']:
            receipt=engine.apply(request)
            if not receipt['accepted']:raise EngineFault('REPLAY_REJECTED:'+canonical(receipt))
        return engine

    def _create_enemies(self,enemy_id):
        spatial=self.data.spatial['supplemental_fixture']
        if enemy_id==spatial['fixture_id']:
            self.state['encounter']['grouping_enabled']=True;self._enemy_definition=spatial
            for row in spatial['entities']:
                self.state['enemies'][row['entity_id']]={'entity_id':row['entity_id'],'hp':row['hp'],'max_hp':row['hp'],'defense':row['DEF'],
                    'alive':True,'block':0,'power':0,'fusion':0,'fusion_cap':3,'resonance':0,'offset':None,'movable':row['mobility']=='MOVABLE',
                    'initiative':row['initiative'],'cycle':row['policy_cycle'],'catalogue':clone(spatial['ability_catalogue'])}
            return
        cat=next((x for x in self.data.system['enemy_catalogues'] if x['id']==enemy_id or x['id'].split('_')[0]==enemy_id),None)
        if not cat:raise RuleError('UNKNOWN_ENCOUNTER:'+enemy_id)
        self.state['encounter']['id']=cat['id'];scale=self.state['body']['attack']
        # The six fixed policies are canonical common-system definitions, never candidate-specific.
        cycles={'T1_SINGLE':['cut','cut','heavy_cut'],'T2_MULTI':['double'],'T3_CHARGE':['charge','slam','poke'],
                'T4_SCALE':['rally','strike','strike'],'T5_HAND':['jam','jab','jab'],'T6_OBJECTIVE':['harass','guard','harass','barrage','guard','barrage']}
        for i,hp in enumerate(cat['base_hp']):
            eid=f'ENEMY_{i+1:02d}';n=hp*scale//12
            self.state['enemies'][eid]={'entity_id':eid,'hp':n,'max_hp':n,'defense':0,'alive':True,'block':0,'power':0,
                'fusion':0,'fusion_cap':3,'resonance':0,'offset':None,'movable':False,'initiative':i,
                'cycle':cycles[cat['id']],'catalogue':clone(cat['abilities']),'scale':scale}

    def _intents(self):
        for eid,e in self.state['enemies'].items():
            if not e['alive']:continue
            if e.get('delayed_intent'):
                e['intent']=e.pop('delayed_intent');e['intent']['cancelled']=False;continue
            aid=e['cycle'][(self.state['round']-1)%len(e['cycle'])];a=e['catalogue'][aid]
            damage=a.get('damage',0)
            if damage=='10+power':damage=10+e['power']
            damage=damage*e.get('scale',12)//12
            e['intent']={'intent_id':f"{eid}:{self.state['round']}",'ability_id':aid,'damage':damage,'hit_count':a.get('hits',0),
                'interruptible':a.get('interruptible',False),'hit_mask':a.get('hit_mask','UNIVERSAL'),'cancelled':False,
                'target_entity_ids':[BODY] if a.get('target')!='self' else [eid]}

    def _expire(self,boundary):
        for z in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
            if z['expiry']['boundary']==boundary and z['expiry']['round']<=self.state['round']:self._remove_status(z,'expired')
        for iid,t in list(self.state['tokens'].items()):
            if t['expiry']['boundary']==boundary and t['expiry']['round']<=self.state['round']:del self.state['tokens'][iid]
        for d in list(sorted(self.state['deployments'].values(),key=self._instance_order)):
            if d['expiry']['boundary']==boundary and d['expiry']['round']<=self.state['round']:self._close_dep(d,'expired')
        for key,grant in list(self.state.get('equipment_grants',{}).items()):
            if boundary=='player_end' and grant['expiry_round']<=self.state['round']:del self.state['equipment_grants'][key]
        if boundary=='end_round':
            if self.state['body']['elevation']=='AERIAL' and self.state['body']['elevation_expires']<=self.state['round']:
                before_hash=None if self._dry else self._combat_hash();source=self.state['body'].get('elevation_source') or {};self.state['body']['elevation']='GROUND';self.state['body']['elevation_expires']=None;self.state['body']['elevation_source']=None
                self._emit('ELEVATION_CHANGED',BODY,reason='EXPIRED',source_snapshot=source,pre_state_hash=before_hash,**self._spatial_row(source.get('effect_definition_id'),[BODY],[BODY],[],elevation={'before':'AERIAL','after':'GROUND'}))
            self._release_group('EXPIRED',[i for i,e in self.state['enemies'].items() if e.get('group_expires',0)<=self.state['round']])

    def _start_turn(self):
        self.state['round']+=1;self.state['phase']='player';self.state['root_actions_this_turn']=0
        self._expire('player_start');self.state['body']['block']=0;self.state['body']['energy']=3
        self._draw(5);self._intents();self._emit('PLAYER_TURN_START',BODY);self._drain()

    def _end_turn(self):
        self._emit('END_PLAYER',BODY);self._drain()
        if self.state['outcome']:return
        self._expire('player_end')
        for iid in list(self.state['zones']['hand']):
            a=self.data.abilities[self.state['cards'][iid]['definition_id']]
            if 'ethereal' in a.get('keywords',[]):self._move(iid,'exhaust')
            elif self.state['retained'].get(iid,0)>self.state['round']:continue
            else:self._move(iid,'discard');self.state['retained'].pop(iid,None)
        self.state['body']['energy']=0;self.state['phase']='enemy';saved=self._ctx
        for eid,e in sorted(self.state['enemies'].items(),key=lambda p:(p[1]['initiative'],p[0])):
            if self.state['outcome'] or not e['alive']:continue
            intent=e['intent']
            if intent['cancelled']:continue
            self._ctx=dict(saved,actor_entity_id=eid,owner_role=None,origin_kind='enemy_skill',ability_id=intent['ability_id'],
                attack=e.get('scale',12),level=1,branch_id=None,target_id=BODY)
            aid=intent['ability_id']
            if aid=='rally':e['power']+=2
            if aid=='jam':
                iid=self._id('burden');self.state['cards'][iid]={'instance_id':iid,'definition_id':'ENEMY_BURDEN','temporary':True};self._move(iid,'draw_top')
            if aid=='guard':e['block']+=8*e.get('scale',12)//12
            for hit in range(intent['hit_count']):
                if self.state['outcome']:break
                mask=intent['hit_mask'];elevation=self.state['body']['elevation']
                if (mask=='GROUND_ONLY' and elevation!='GROUND') or (mask=='AERIAL_ONLY' and elevation!='AERIAL'):
                    self._hit_incompatible(BODY,mask);continue
                self._damage(BODY,{'basis':'fixed','fixed_amount':intent['damage'],'damage_tags':['enemy'],'element':'neutral'},
                    {'ability_hit_count':intent['hit_count'],'hit_index':hit,'hit_mask':mask})
                self._drain()
        self._ctx=saved;self._emit('END_ROUND',BODY);self._drain();self._expire('end_round');self._terminal()
        if not self.state['outcome'] and self.state['encounter']['id']=='T6_OBJECTIVE' and self.state['round']>=6:
            self.state['outcome']='victory';self.state['phase']='terminal';self._emit('BATTLE_ENDED',BODY,outcome='victory')
        if not self.state['outcome'] and self.state['round']>=50:
            self.state['outcome']='stalemate';self.state['phase']='terminal';self._emit('BATTLE_ENDED',BODY,outcome='stalemate')
        if not self.state['outcome']:self._start_turn()

    def _equipment_event(self,event):
        for effect in self.state.get('equipment_effects',[]):
            if not trigger_matches(effect,event,self.state,self._ctx.get('payment',{})):continue
            key=effect['equipment_instance_id']+':'+effect['effect_id'];turn=key+':turn:'+str(self.state['round'])
            counters=self.state['equipment_counters']
            if counters.get(turn):continue
            counters[turn]=1
            if effect.get('resource')=='concerto':
                if counters.get(key,0)>=effect.get('max_procs_per_combat',2):continue
                before=self.state['body']['concerto'];saved=self._ctx
                self._ctx=dict(saved,origin_kind='equipment')
                try:self._resource('concerto',effect['delta'],'gain')
                finally:self._ctx=saved
                if self.state['body']['concerto']>before:counters[key]=counters.get(key,0)+1
                continue
            if key in self.state['equipment_grants']:continue
            if counters.get(key,0)>=effect.get('max_successful_grants_per_combat',999):continue
            counters[key]=counters.get(key,0)+1
            self.state['equipment_grants'][key]={'grant_id':key,'effect':clone(effect),'uses':1,
                'origin_root_action_id':event['root_action_id'],'trigger_event_id':event['event_id'],
                'source_role_id':event['ability_role_id'],'expiry_round':self.state['round']+1,'recipient_body_id':BODY}

    def _equipment_damage_bonus(self,meta):
        if self._ctx.get('origin_kind') not in ['player_skill'] or self._ctx.get('is_mode'):return 0
        total=0;packet=[]
        for effect in self.state.get('equipment_effects',[]):
            if not isinstance(effect.get('trigger'),dict) and effect.get('bonus_lane')=='equipment_damage_bonus_bp' and filter_matches(effect,meta,self.state['active_role']):total+=effect['amount_bp']
        for key,g in self.state.get('equipment_grants',{}).items():
            if g['origin_root_action_id']==self._ctx['root_action_id']:continue
            if filter_matches(g['effect'],meta,self.state['active_role']):total+=g['effect']['amount_bp'];packet.append(key)
        self._ctx['packet_equipment_grants']=packet
        return total

    def _settle_modifiers(self):
        for iid in sorted(self._usage['modifiers']):
            z=self.state['statuses'].get(iid)
            if z:
                z['uses']-=1
                if z['uses']==0:self._remove_status(z,'consumed')
        for key in sorted(self._usage['equipment']):
            self.state['equipment_grants'].pop(key,None)


    def _clear_exclusive_slot(self,definition):
        slot=definition.get('exclusive_slot')
        acquisition=definition.get('exclusive_slot_acquisition_id')
        if not slot or acquisition and acquisition not in self.state['profile']['learned']+self.state['profile']['inherents']:return
        for key,token in list(self.state['tokens'].items()):
            if self.data.tokens[token['definition_id']].get('exclusive_slot')==slot:del self.state['tokens'][key]
        for status in list(sorted(self.state['statuses'].values(),key=self._instance_order)):
            if self.data.modifiers.get(status['definition_id'],{}).get('exclusive_slot')==slot:self._remove_status(status,'replaced')


    def _terminal_cleanup(self):
        if self.state.get('terminal_cleanup_done'):return
        self.state['terminal_cleanup_done']=True
        if self.state['body']['elevation']=='AERIAL':
            before_hash=None if self._dry else self._combat_hash();source=self.state['body'].get('elevation_source') or {};self.state['body']['elevation']='GROUND';self.state['body']['elevation_expires']=None;self.state['body']['elevation_source']=None
            self._emit('ELEVATION_CHANGED',BODY,reason='BATTLE_ENDED',source_snapshot=source,pre_state_hash=before_hash,**self._spatial_row(source.get('effect_definition_id'),[BODY],[BODY],[],elevation={'before':'AERIAL','after':'GROUND'}))
        self.state['body']['elevation_expires']=None;self.state['body']['elevation_source']=None
        self._release_group('BATTLE_ENDED')
        # No expiry/listener callbacks are run after terminal. Owned physical
        # deployed cards move once; effect-only fields have no phantom card.
        for dep in list(sorted(self.state['deployments'].values(),key=self._instance_order)):
            if dep['source_card']:self._move(dep['source_card'],dep['destination'])
        self.state['deployments'].clear();self.state['statuses'].clear();self.state['tokens'].clear()
        self.state['equipment_grants'].clear();self.state['retained'].clear()
        self.state['contributors']={'shock':[],'fusion_burst':[]}

    def _spatial_row(self,effect_id,requested,accepted,rejected,group=None,elevation=None,expiry=None):
        return {'effect_definition_id':effect_id,'requested_target_ids':list(requested),'accepted_target_ids':list(accepted),
            'rejected_target_ids_with_reason':rejected,'group_id_or_null':group,
            'elevation_before_after_or_null':elevation,'expires_at_end_round_or_null':expiry,
            'actual_cost_ledger_ref':{'root_action_id':self._ctx['root_action_id'],'payment':clone(self._ctx.get('payment',{}))}}

    def _gather(self,effect):
        args=effect['args'];duration=args['duration_rounds']
        if duration not in [1,2,3]:raise RuleError('GROUP_DURATION')
        selector=dict(effect['target'],allow_dead=True);requested=self._targets(selector)
        self._ctx['target_id']=requested[0] if requested else BODY
        if not self._pred(effect.get('when',True)):self._ctx.pop('target_id',None);return
        self._ctx.pop('target_id',None)
        if not self.state['encounter']['grouping_enabled']:
            self._emit('GATHER_RESOLVED',None,**self._spatial_row(effect['effect_id'],requested,[],[]),diagnostic='SPATIAL_DISABLED_NO_EFFECT',source_snapshot=None);return
        accepted=[];rejected=[]
        for eid in requested:
            enemy=self._entity(eid)
            if not enemy.get('alive',False):rejected.append({'target_entity_id':eid,'reason':'TARGET_DIED_BEFORE_EFFECT'})
            elif not enemy.get('movable',False):rejected.append({'target_entity_id':eid,'reason':'IMMOVABLE'})
            elif self.state['encounter']['grouping_enabled']:accepted.append(eid)
        if len(accepted)>3:raise RuleError('TARGET_CAPACITY_EXCEEDED')
        deadline=self.state['round']+duration-1
        source={'actor_entity_id':self._ctx.get('actor_entity_id',BODY),'character_ability_source':self._ctx['owner_role'],
            'origin_kind':self._ctx['origin_kind'],'root_action_id':self._ctx['root_action_id'],
            'ability_id':self._ctx['ability_id'],'effect_definition_id':effect['effect_id']}
        if accepted:
            self._release_group('REPLACED')
            for eid in accepted:
                self._entity(eid).update(group=args['group_id'],group_expires=deadline,group_source=clone(source))
        row=self._spatial_row(effect['effect_id'],requested,accepted,rejected,args['group_id'] if accepted else None,None,deadline if accepted else None)
        self._emit('GATHER_RESOLVED',None,**row,source_snapshot=source)

    def _release_group(self,reason,ids=None):
        members=sorted(i for i,e in self.state['enemies'].items() if e.get('group') and (ids is None or i in ids))
        if not members:return
        before_hash=None if self._dry else self._combat_hash()
        first=self._entity(members[0]);source=clone(first.get('group_source',{}));group=first['group']
        for eid in members:
            enemy=self._entity(eid);enemy.pop('group',None);enemy.pop('group_expires',None);enemy.pop('group_source',None)
        row=self._spatial_row(source.get('effect_definition_id'),members,[],[{'target_entity_id':i,'reason':reason} for i in members],group)
        self._emit('GROUP_RELEASED',None,**row,source_snapshot=source,pre_state_hash=before_hash,character_ability_source=source.get('character_ability_source'),reason=reason)


    def _hit_incompatible(self,eid,mask):
        ability=self._ctx.get('ability_id')
        if not ability:raise EngineFault('INCOMING_ABILITY_PROVENANCE_REQUIRED')
        effect_id=ability+'.damage'
        row=self._spatial_row(effect_id,[eid],[],[{'target_entity_id':eid,'reason':'HIT_INCOMPATIBLE','hit_mask':mask,'elevation':self._entity(eid)['elevation']}])
        row['actual_cost_ledger_ref']={'root_action_id':self._ctx['root_action_id'],'payment':{'energy':0,'private':{}},'payer_entity_id':self._ctx.get('actor_entity_id')}
        self._emit('HIT_INCOMPATIBLE',eid,hp_lost=0,shield_lost=0,block_lost=0,hit_mask=mask,**row,
            source_snapshot={'ability_id':ability,'actor_entity_id':self._ctx.get('actor_entity_id'),'origin_kind':self._ctx.get('origin_kind'),'damage_effect':'damage'})

    def _prepare_replacement(self,effects):
        """Pure admission against quoted costs; no field/phase is changed here."""
        selected=self._ctx['request'].get('choices',{}).get('replace_deployment_instance_id')
        chosen=self.state['deployments'].get(selected) if selected is not None else None
        if selected is not None and (chosen is None or chosen.get('owner_body_id',BODY)!=BODY):raise RuleError('INVALID_REPLACEMENT_TARGET')
        projected=dict(self.state['deployments']);created={};last_created=None;replacement=None
        for effect in effects:
            if effect['op'] not in ['close_deployment','deploy']:continue
            if not self._pred(effect.get('when',True)):continue
            args=effect['args']
            if effect['op']=='close_deployment':
                selector=args['deployment_selector']
                if isinstance(selector,dict) and selector.get('kind')=='created_by_effect':iid=created.get(selector['creator_effect_id'])
                elif selector=='context_current' and not self._ctx.get('deployment'):iid=last_created
                else:iid=self._dep_select(selector)['instance_id']
                projected.pop(iid,None)
                continue
            definition=self.data.deployments[args['definition_id']];key=definition['stacking_key']
            same=[iid for iid,d in projected.items() if d['stacking_key']==key]
            if same and definition.get('replacement')=='reject_if_present':raise RuleError('DEPLOYMENT_REJECT_IF_PRESENT')
            if same or len(projected)>=2:
                if chosen is None:raise RuleError('REPLACEMENT_CHOICE_REQUIRED')
                if selected not in projected:raise RuleError('INVALID_REPLACEMENT_TARGET')
                if same and selected not in same:raise RuleError('REPLACEMENT_KEY_MISMATCH')
                replacement=chosen;projected.pop(selected)
            placeholder='new:'+effect['effect_id'];projected[placeholder]={'stacking_key':key,'owner_body_id':BODY}
            created[effect['effect_id']]=placeholder;last_created=placeholder
        if selected is not None and replacement is None:raise RuleError('UNNEEDED_REPLACEMENT_TARGET')
        return replacement
