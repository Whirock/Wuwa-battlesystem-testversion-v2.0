"""Finite shared-body equipment adapter. The input appendix is authoritative."""
import json
from collections import defaultdict

class EquipmentError(ValueError):pass

def validate_loadout(gear,appendix):
    if gear.get('owner_body_id','PLAYER_BODY_01')!='PLAYER_BODY_01':raise EquipmentError('GEAR_OWNER_MISMATCH')
    weapon=gear.get('weapon');echoes=gear.get('echoes',[None]*5)
    if (weapon or any(echoes)) and gear.get('owner_body_id')!='PLAYER_BODY_01':raise EquipmentError('GEAR_OWNER_REQUIRED')
    if len(echoes)!=5:raise EquipmentError('FIVE_ECHO_SLOTS')
    ids=[x.get('echo_instance_id',x.get('instance_id')) for x in echoes if x]
    if len(ids)!=len(set(ids)) or None in ids:raise EquipmentError('ECHO_INSTANCE_OWNERSHIP')
    if sum(x.get('cost',0) for x in echoes if x)>12:raise EquipmentError('ECHO_COST')
    if any(x.get('cost') not in [1,3,4] for x in echoes if x):raise EquipmentError('ECHO_COST_CLASS')
    if any(not x.get('acquisition_receipt_id') for x in echoes if x):raise EquipmentError('ECHO_ACQUISITION')
    if weapon:
        if not weapon.get('instance_id'):raise EquipmentError('WEAPON_INSTANCE')
        ids={x['id'] for x in appendix['weapon_profiles']}
        if weapon.get('archetype_id') not in ids:raise EquipmentError('WEAPON_ARCHETYPE')
        matching=weapon.get('matching_profile_id')
        if matching is not None:
            m=next((x for x in appendix['matching_profiles'] if x['id']==matching),None)
            if m is None or m['archetype_id']!=weapon['archetype_id']:raise EquipmentError('MATCHING_PROFILE')
    return True

def active_effects(gear,appendix):
    validate_loadout(gear,appendix);result=[];weapon=gear.get('weapon')
    if weapon:
        w=next(w for w in appendix['weapon_profiles'] if w['id']==weapon['archetype_id'])
        result.extend(dict(e,equipment_instance_id=weapon['instance_id']) for e in w['effects'])
        mid=weapon.get('matching_profile_id')
        if mid:result.append(dict(next(m for m in appendix['matching_profiles'] if m['id']==mid),equipment_instance_id=weapon['instance_id']))
    sets=defaultdict(set)
    for e in gear.get('echoes',[]):
        if e:sets[e['set_id']].add(e['echo_definition_id'])
    for definition in appendix['echo_set_profiles']:
        for threshold in definition['thresholds']:
            if len(sets[definition['id']])>=threshold['pieces']:result.append(dict(threshold,equipment_instance_id=definition['id']))
    return result

def trigger_matches(effect,event,state,payment):
    trigger=effect.get('trigger')
    if not isinstance(trigger,dict):return False
    etype=event['event_type']
    if etype=='RESONANCE_OFFSET_APPLIED':etype='STATUS_APPLIED'
    if trigger['event']!=etype:return False
    if event['actor_entity_id']!='PLAYER_BODY_01' or event['origin_kind'] not in ['player_skill','deployment']:return False
    if etype=='STATUS_APPLIED' and event.get('accepted_stacks',0)<=0:return False
    if etype=='HEAL_APPLIED' and event.get('actual_heal',0)<=0:return False
    if etype=='ACTION_COMMITTED' and not (payment.get('energy',0)>=1 or any(payment.get('private',{}).values())):return False
    # Parse only the fixed appendix's closed condition vocabulary, never execute text.
    for cond in trigger.get('conditions',[]):
        if 'status_id in [' in cond:
            accepted=cond.split('[',1)[1].split(']',1)[0].replace(' ','').split(',')
            if event.get('status_id') not in accepted:return False
        elif cond.startswith('status_id == '):
            if event.get('status_id')!=cond.split(' == ')[1]:return False
        elif 'ability_tags contains ' in cond:
            if cond.split('ability_tags contains ')[1] not in event.get('ability_tags',[]):return False
        elif 'source_template_id resolves to ' in cond:
            if event.get('ability_role_id')!=cond.split('resolves to ')[1]:return False
        elif 'active_template.role_id == ' in cond:
            if state['active_role']!=cond.split(' == ')[1]:return False
        elif cond=='origin_kind == player_skill' and event['origin_kind']!='player_skill':return False
    return True

def filter_matches(effect,damage,active_role):
    f=effect.get('eligible_damage_filter',effect.get('damage_filter',{}))
    if damage['kind']!='direct':return False
    if f.get('element') and damage['element']!=f['element']:return False
    if f.get('required_damage_tag') and f['required_damage_tag'] not in damage['tags']:return False
    if f.get('ability_role_id') and damage['ability_role_id']!=f['ability_role_id']:return False
    if effect.get('match_role_id') and active_role!=effect['match_role_id']:return False
    return True
