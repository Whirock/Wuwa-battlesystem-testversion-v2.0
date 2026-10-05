"""Original test prototypes only. Fixed standard-1 numbers; uncalibrated."""
from copy import deepcopy

ENGINE_VERSION = 'shared-runtime-2.0'
DATA_SCHEMA = 'wuwa-data-v2'
ACTOR_SCHEMA = 'combat-actors-v1'
ENCOUNTER_SCHEMA = 'combat-encounters-v1'
SAVE_SCHEMA = 'combat-save-v2'
CONTENT_VERSION = 'original-prototypes-0.1'


def content():
    import json
    from pathlib import Path
    return json.loads((Path(__file__).resolve().parents[1]/'live-data'/'prototypes-v1.json').read_text(encoding='utf8'))


def validate_content(data):
    if data.get('data_schema')!=DATA_SCHEMA or data.get('actor_schema')!=ACTOR_SCHEMA or data.get('encounter_schema')!=ENCOUNTER_SCHEMA:
        raise ValueError('LIVE_SCHEMA_MISMATCH')
    for key,a in data['abilities'].items():
        if key!=a['ability_id'] or a['target_selector'] not in {'self','lowest_hp_ratio','highest_hp_ratio','prefer_player','all_hostile','lowest_hp','friendly_guard'}:raise ValueError('LIVE_ABILITY')
        if a.get('followup_ability_id') and a['followup_ability_id'] not in data['abilities']:raise ValueError('LIVE_FOLLOWUP_REFERENCE')
        if a['effect'] not in {None,'block','shield','charge'}:raise ValueError('LIVE_EFFECT')
        if a['target_death_policy']!='locked_fizzle_pay':raise ValueError('LIVE_TARGET_POLICY')
        for n in [a['damage'],a['hit_count'],a['cooldown_rounds'],a['amount'],*a['costs'].values()]:
            if type(n)!=int or not 0<=n<=10000:raise ValueError('LIVE_NUMBER')
        if type(a['interruptible'])!=bool or a['costs']['ap']!=1:raise ValueError('LIVE_COST')
    for key,a in data['actors'].items():
        if key!=a['definition_id'] or a['kind'] not in {'npc','enemy'} or a['faction_id'] not in {'allied','hostile'}:raise ValueError('LIVE_ACTOR')
        if (a['kind']=='npc') != (a['faction_id']=='allied'):raise ValueError('LIVE_FACTION')
        if a['policy_id'] not in {'raider','shooter','bulwark','core','sentinel'}:raise ValueError('LIVE_POLICY')
        if any(x not in data['abilities'] for x in a['ability_ids']) or 'wait' not in a['ability_ids']:raise ValueError('LIVE_ABILITY_REFERENCE')
        if a['equipment_snapshot']['effects']:raise ValueError('LIVE_NPC_EQUIPMENT_NOT_SUPPORTED')
        for n in a['base_stats'].values():
            if type(n)!=int or n<0:raise ValueError('LIVE_STATS')
        if a['base_stats']['max_hp']<=0:raise ValueError('LIVE_HP')
    for key,e in data['encounters'].items():
        if key!=e['encounter_id'] or not key.startswith('LIVE_'):raise ValueError('LIVE_ENCOUNTER')
        if not e['enemy_definitions']:raise ValueError('LIVE_ENEMIES_REQUIRED')
        for faction,field in [('hostile','enemy_definitions'),('allied','ally_definitions')]:
            if any(data['actors'].get(a,{}).get('faction_id')!=faction for a in e[field]):raise ValueError('LIVE_ENCOUNTER_FACTION')
    return data
