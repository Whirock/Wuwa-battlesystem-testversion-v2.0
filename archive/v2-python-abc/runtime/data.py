"""Frozen-data adapter and receipt-based growth for the common combat runtime.

Only serialization differences are lowered here. Candidate combat rules remain
finite declarative DSL objects; no candidate-specific battle callbacks exist.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re


_DATA_CACHE = {}


class DataError(ValueError):
    """Invalid frozen data, profile, or external receipt."""


def _index(values):
    if isinstance(values, dict):
        return {k: dict(deepcopy(v), id=v.get('id', k)) for k, v in values.items()}
    return {v['id']: deepcopy(v) for v in values}


def _all(*conditions):
    conditions = [c for c in conditions if c is not True]
    return True if not conditions else conditions[0] if len(conditions) == 1 else {'all': conditions}


def _has(identifier, inherent=False):
    return {'has': 'learned_inherent' if inherent else 'learned_skill', 'entity': 'owner_template', 'id': identifier}


def _cmp(path, op, value):
    return {'cmp': op, 'left': {'ref': path}, 'right': value}


def _cost(energy=0, private=None):
    return {'energy': energy, 'private': private or [], 'tokens': [], 'card_choices': []}


def _selector(kind):
    return {'selector_id': kind, 'kind': kind, **({'min': 1, 'max': 1} if kind == 'chosen_enemy' else {})}


def _effect(identifier, op, target, **args):
    return {'effect_id': identifier, 'op': op, 'target': _selector(target), 'args': args, 'when': True, 'tags': []}


def normalize(value):
    """Approved syntax aliases only; arbitrary reference helpers are not evaluated."""
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if not isinstance(value, dict):
        return value
    out = {k: normalize(v) for k, v in value.items()}
    if isinstance(out.get('ref'), str):
        ref = out['ref']
        ref = ref.replace('owner.contribution.', 'owner.contributors.').replace('owner.contributions.', 'owner.contributors.')
        ref = ref.replace('context.deployment.payload.', 'context.deployment.paid_snapshot.')
        ref = {'context.full_handoff': 'context.switch.full_handoff',
               'context.damage.role_id': 'context.damage.ability_role_id',
               'context.event.hit_count': 'context.damage.ability_hit_count',
               'context.event.ability_hit_count': 'context.damage.ability_hit_count',
               'context.event.incoming.ability.hit_count': 'context.damage.ability_hit_count',
               'context.token.bound_role_id': 'context.token.beneficiary_role_id',
               'target.resonance_progress': 'target.status.resonance.progress',
               'target.status.resonance_progress.stacks': 'target.status.resonance.progress',
               'context.event.pre_root_havoc_bane.source_role_id': 'context.event.pre_root_status.havoc_bane.source_role_id'}.get(ref, ref)
        out['ref'] = ref
    return out


class Data:
    """Load one candidate through the same canonical schema and common mappings."""
    def __init__(self, candidate, root=None):
        self.root = Path(root) if root else Path(__file__).resolve().parents[1]
        if not (self.root / 'system_contract').exists() and (self.root / 'batch_design_review').exists():
            self.root = self.root / 'batch_design_review'
        self.candidate = str(candidate).upper()
        if self.candidate not in ('A', 'B', 'C'):
            raise DataError('candidate must be A, B or C')
        source_paths = [self.root / 'system_contract' / x for x in ('SYSTEM_CONTRACT.json', 'COMMON_EFFECT_DSL.json', 'INTERFACE_COMPATIBILITY_CLOSURE.json', 'SPATIAL_TAGS_ADDENDUM.json', 'CORE_BENCHMARK_LOADOUT.json', 'parts/equipment_profiles.json')] + [self.root / 'batch_01' / x / 'CANDIDATE.json' for x in ('A', 'B', 'C')]
        cache_key = (self.candidate, str(self.root.resolve()), Path(__file__).stat().st_mtime_ns, tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in source_paths))
        if cache_key in _DATA_CACHE:
            self.__dict__.update(deepcopy(_DATA_CACHE[cache_key]))
            return
        self.manifest = {}
        def read(relative):
            p = self.root / relative
            content = p.read_bytes()
            self.manifest[relative] = hashlib.sha256(content).hexdigest()
            return json.loads(content)
        self.system = read('system_contract/SYSTEM_CONTRACT.json')
        self.contract = self.system
        self.contract_hash = self.manifest['system_contract/SYSTEM_CONTRACT.json']
        self.dsl = read('system_contract/COMMON_EFFECT_DSL.json')
        self.closure = read('system_contract/INTERFACE_COMPATIBILITY_CLOSURE.json')
        self.spatial = read('system_contract/SPATIAL_TAGS_ADDENDUM.json')
        self.gear_contract = read('system_contract/CORE_BENCHMARK_LOADOUT.json')
        # Equipment appendix is an explicit referenced normative input.
        self.equipment = read('system_contract/' + self.system['equipment']['appendix'])
        self.raw = normalize(read('batch_01/' + self.candidate + '/CANDIDATE.json'))
        self.candidate_hash = self.manifest['batch_01/' + self.candidate + '/CANDIDATE.json']
        for variant in ('A', 'B', 'C'):
            path = 'batch_01/' + variant + '/CANDIDATE.json'
            self.manifest.setdefault(path, hashlib.sha256((self.root / path).read_bytes()).hexdigest())
        self.abilities, self.roles, self.acquisitions, self.skill_catalogue = {}, {}, {}, {}
        self.hooks, self.mappings, self.required_choices = [], {}, []
        self.statuses, self.tokens, self.modifiers, self.deployments = {}, {}, {}, {}
        self.inherents = {}
        self.source_aliases = deepcopy(self.raw.get('source_aliases', {}))
        self.reference_registry = deepcopy(self.raw.get('reference_registry', self.raw.get('reference_bindings', self.raw.get('derived_view_registry', {}))))
        self.limits = _index(self.raw.get('finite_limit_registry', []))
        self._load_candidate()
        self._load_common()
        self._load_mappings()
        self._bind_lifecycle_hooks()
        self._normalize_hook_sources()
        self._normalize_exclusive_slots()
        self._normalize_transitions()
        def reset_nodes(value):
            if isinstance(value, dict):
                if value.get('op') == 'history_reset': yield value
                for child in value.values(): yield from reset_nodes(child)
            elif isinstance(value, list):
                for child in value: yield from reset_nodes(child)
        self.history_reset_registry = {}
        self.history_reset_sources = {}
        for family_name in ('abilities', 'deployments', 'statuses', 'tokens'):
            for identifier, definition in getattr(self, family_name).items():
                for effect in reset_nodes(definition):
                    self.history_reset_registry[effect['effect_id']] = deepcopy(effect['args'])
                    self.history_reset_sources.setdefault(effect['effect_id'], []).append({'family': family_name, 'container_id': identifier})
        self.profiles = self._load_profiles()
        self.role_registry = self.roles
        self.frozen_input_hashes = self.manifest
        self.registered_refs = self._registered_references()
        # Cached templates are never returned directly; even caller edits to a
        # Data instance cannot contaminate another engine or frozen profile.
        _DATA_CACHE[cache_key] = deepcopy(self.__dict__)
        if len(_DATA_CACHE) > 6:
            del _DATA_CACHE[next(iter(_DATA_CACHE))]

    def _ability(self, obj):
        obj = deepcopy(obj)
        obj.setdefault('owner_role_id', obj.get('role_id'))
        obj.setdefault('skill_id', None)
        obj.setdefault('card_definition_id', obj['id'])
        obj.setdefault('cost', _cost())
        obj.setdefault('condition', True)
        obj.setdefault('targets', _selector('self_body'))
        obj.setdefault('branches', [])
        obj.setdefault('effects', [])
        obj.setdefault('keywords', [])
        obj.setdefault('ability_tags', [])
        obj.setdefault('ability_kind', 'passive' if obj.get('card_type') == 'passive' else 'card')
        if obj['ability_kind'] in ('passive', 'activation'):
            obj['card_type'] = None
        for branch in obj['branches']:
            branch.setdefault('condition', True)
            branch.setdefault('cost', _cost())
            branch.setdefault('keywords', [])
            branch.setdefault('effects', [])
            branch.setdefault('choices', {})
            branch.setdefault('card_type', obj.get('card_type'))
            branch.setdefault('targets', branch.get('targets_override', deepcopy(obj['targets'])))
        self.abilities[obj['id']] = obj
        return obj

    def _register_acquisition(self, identifier, role, prerequisites=(), cards=(), skill_id=None, inherent=False, aliases=()):
        item = {'id': identifier, 'owner_role_id': role, 'prerequisites': list(prerequisites),
                'card_definitions': list(cards), 'skill_id': skill_id, 'inherent': inherent, 'aliases': list(aliases)}
        self.acquisitions[identifier] = item

    def _load_candidate(self):
        d = self.raw
        if self.candidate == 'A':
            reg = d['state_registry']
            for role in self.system['role_contracts']:
                rid = role['role_id']
                self.roles[rid] = {'role_id': rid, 'private_dimensions': [deepcopy(v) for v in reg['private_dimensions'] if v['owner_role_id'] == rid],
                                   'phase_axes': deepcopy(reg['phase_axes'][rid]), 'circuit_id': rid.upper() + '_CIRCUIT'}
            for obj in d['card_definitions'] + d['mode_card_definitions'] + d['auto_handoff_abilities']['intro'] + d['auto_handoff_abilities']['outro']:
                self._ability(obj)
            self.deployments = _index(d['deployment_definitions'])
            self.statuses = _index(reg['statuses'])
            self.statuses.update(_index(reg['shield_definitions']))
            self.tokens = _index(reg['tokens'])
            self.inherents = _index(d['inherents'])
            for obj in d['skills_and_growth']:
                self.skill_catalogue[obj['id']] = deepcopy(obj)
                self._register_acquisition(obj['id'], obj['role_id'], obj['acquisition_prerequisites'], obj['card_definitions'], obj['id'])
            for obj in d['noncard_ability_acquisitions']:
                self._register_acquisition(obj['id'], obj['role_id'], obj['prerequisites'])
            for obj in d['inherents']:
                self._register_acquisition(obj['id'], obj['role_id'], obj['prerequisites'], inherent=True)
                imp = obj.get('implementation')
                for hook in imp.get('hooks', []) if isinstance(imp, dict) else []:
                    self.hooks.append({'owner_role_id': obj['role_id'], 'acquisition_id': obj['id'], 'hook': deepcopy(hook)})
            for obj in d['common_card_extension_rules']:
                if 'hook' in obj:
                    self.hooks.append({'owner_role_id': obj['owner_role_id'], 'acquisition_id': obj['acquisition_id'], 'hook': deepcopy(obj['hook'])})
            self.handoff = {x['role_id']: deepcopy(x) for x in d['handoff_bindings']}
        else:
            for raw_role in d['roles']:
                rid = raw_role['role_id']
                role = deepcopy(raw_role)
                circuit = raw_role['advanced_circuit']['id'] if self.candidate == 'B' else 'C_' + rid.upper() + '_CIRCUIT'
                dims = deepcopy(raw_role.get('private_pools', raw_role.get('private_resources', [])))
                dims += [dict(deepcopy(x), kind='history') for x in raw_role.get('history_dimensions', [])]
                fresh = next(x for x in self.system['fresh_mode_mapping']['roles'] if x['role_id'] == rid)
                for dim in dims:
                    dim['id'] = dim.get('id', dim.get('resource_id'))
                    dim.setdefault('kind', 'history' if dim.get('history_numeric') else 'pool')
                    dim.setdefault('fresh_cap', fresh['resource']['cap'] if dim['id'] == fresh['resource']['id'] else None)
                    dim['advanced_cap'] = dim['cap']
                    dim.setdefault('advanced_cap_acquisition', circuit)
                    dim.setdefault('acquisition', rid.upper() + '_TEMPLATE' if dim['fresh_cap'] is not None else circuit)
                axes = raw_role.get('categorical_axes', raw_role.get('phase_axes', []))
                if isinstance(axes, list):
                    axes = {x['id']: deepcopy(x) for x in axes}
                else:
                    axes = deepcopy(axes)
                for key, axis in axes.items():
                    axis.setdefault('acquisition', 'template' if rid == 'aemeath' and key == 'form' else circuit)
                    axis.setdefault('states', axis.get('values', []))
                role.update(private_dimensions=dims, phase_axes=axes, circuit_id=circuit)
                self.roles[rid] = role
            for obj in d.get('abilities', []) + d.get('card_definitions', []) + d.get('passive_abilities', []):
                self._ability(obj)
            if self.candidate == 'B':
                self.deployments = _index(d['deployments'])
                self.statuses, self.tokens, self.modifiers = (_index(d[x]) for x in ('statuses', 'tokens', 'modifiers'))
                self.handoff = deepcopy(d['handoff_bindings'])
                for obj in d['skill_growth_catalogue']:
                    self.skill_catalogue[obj['id']] = deepcopy(obj)
                for obj in d['acquisition_registry']:
                    sid = obj['ability_id']
                    self._register_acquisition(sid, obj['requires_owned_template'], obj['requires_learned'], [sid] if obj['grants_card'] else [], sid, aliases=[obj['unique_receipt']])
                for role in d['roles']:
                    rid, cir = role['role_id'], role['advanced_circuit']
                    self._register_acquisition(cir['id'], rid, [rid.upper() + '_TEMPLATE'], skill_id=cir['id'], aliases=[cir['receipt']])
                    for inherent in role['inherents']:
                        self.inherents[inherent['id']] = deepcopy(inherent)
                        self._register_acquisition(inherent['id'], rid, inherent['acquisition']['requires_learned'], inherent=True, aliases=[inherent['acquisition']['unique_receipt']])
                self._unbound_hooks = deepcopy(d['passive_hooks'])
            else:
                self.deployments = _index(d['deployment_definitions'])
                self.statuses, self.tokens = _index(d['status_definitions']), _index(d['token_definitions'])
                self.inherents = _index(d['inherents'])
                self.handoff = {x['role_id']: deepcopy(x) for x in d['intro_outro_bindings']}
                for obj in d['skill_definitions']:
                    self.skill_catalogue[obj['id']] = deepcopy(obj)
                    self._register_acquisition(obj['id'], obj['owner_role_id'], obj['learning_prerequisites'], obj['granted_card_definitions'], obj['id'], aliases=[obj['acquisition_receipt']])
                for obj in d['circuit_acquisition_definitions']:
                    self._register_acquisition(obj['id'], obj['owner_role_id'], [obj['owner_role_id'].upper() + '_TEMPLATE'], aliases=[obj['acquisition_id']])
                for obj in d['passive_abilities']:
                    self._register_acquisition(obj['id'], obj['owner_role_id'], aliases=[obj['acquisition_id']])
                for obj in d['inherents']:
                    self._register_acquisition(obj['id'], obj['owner_role_id'], obj['acquisition']['requires_learned_skills'], inherent=True, aliases=[obj['acquisition']['unique_receipt']])
                    for hook in obj.get('hooks', []):
                        self.hooks.append({'owner_role_id': obj['owner_role_id'], 'acquisition_id': obj['id'], 'hook': deepcopy(hook)})
        for rid in self.roles:
            self.roles[rid].setdefault('element', next(x['element'] for x in self.system['fresh_mode_mapping']['roles'] if x['role_id'] == rid))
            self._register_acquisition(rid.upper() + '_TEMPLATE', rid, aliases=['FIRST_' + rid.upper()])
        self.acquisition_aliases = {}
        for key, acq in self.acquisitions.items():
            self.acquisition_aliases[key] = key
            for alias in acq['aliases']:
                self.acquisition_aliases[alias] = key
        # Canonical predicate membership permits acquired capability IDs, not fabricated XP records.
        for ability in self.abilities.values():
            acq = ability.get('acquisition_id')
            if acq in self.acquisition_aliases:
                ability['acquisition_id'] = self.acquisition_aliases[acq]

    def _load_common(self):
        for sid, operation, coefficient, target in [('COMMON_A', 'damage', 10000, 'chosen_enemy'), ('COMMON_D', 'block', 8000, 'self_body')]:
            args = {'basis': 'scaled_attack', 'coefficient_bp': coefficient}
            if operation == 'damage':
                args.update(element='physical', damage_tags=['direct', 'basic'], flat_amount=0)
            self._ability({'id': sid, 'owner_role_id': None, 'skill_id': sid, 'card_type': 'action', 'cost': _cost(1),
                           'targets': _selector(target), 'effects': [_effect(sid + '.baseline', operation, target, **args)]})
            self.skill_catalogue[sid] = {'id': sid, 'owner_role_id': None}
            self._register_acquisition(sid, None, skill_id=sid)
        self._ability({'id': 'ENEMY_BURDEN', 'owner_role_id': None, 'skill_id': None, 'card_type': 'action', 'cost': _cost(),
                       'condition': False, 'keywords': ['ethereal']})
        for rid in self.roles:
            for mid in {'MODE_' + rid.upper(), 'MODE_' + rid}:
                if mid not in self.abilities:
                    self._ability({'id': mid, 'owner_role_id': rid, 'skill_id': None, 'card_type': 'mode',
                                   'cost': _cost(), 'acquisition_id': rid.upper() + '_TEMPLATE',
                                   'condition': _has(rid.upper() + '_TEMPLATE'), 'mode_target_role_id': rid})
        self.statuses.setdefault('havoc_bane', {'id': 'havoc_bane', 'owner_scope': 'target_enemy', 'max_stacks': 1, 'hooks': []})
        self.statuses['lynae_fresh_guard'] = {'id': 'lynae_fresh_guard', 'owner_role_id': 'lynae', 'owner_scope': 'body', 'stacking_policy': 'replace', 'hooks': []}
        self.statuses['mornye_fresh_guard'] = {'id': 'mornye_fresh_guard', 'owner_role_id': 'mornye', 'owner_scope': 'body', 'stacking_policy': 'replace', 'hooks': []}
        self.modifiers['denia_fresh_followup'] = {'id': 'denia_fresh_followup', 'owner_role_id': 'denia', 'owner_scope': 'body', 'stacking_policy': 'replace', 'uses': 1, 'hooks': []}

    def _load_mappings(self):
        for role in self.system['fresh_mode_mapping']['roles']:
            rid, resource = role['role_id'], role['resource']['id']
            self.mappings[rid] = {}
            for suffix in ('A', 'D'):
                sid = 'COMMON_' + suffix
                ability = {'id': rid + '__' + sid, 'card_definition_id': sid, 'owner_role_id': rid, 'skill_id': sid, 'card_type': 'action',
                           'cost': _cost(), 'condition': _cmp('active.role_id', 'eq', rid), 'targets': _selector('chosen_enemy' if suffix == 'A' else 'self_body'), 'branches': [], 'effects': []}
                for raw in role[suffix + '_branches']:
                    bid = raw['id']
                    branch = {'id': bid, 'condition': True, 'cost': _cost(1), 'effects': [], 'card_type': 'action'}
                    cond = raw.get('condition', 'always')
                    if cond != 'always':
                        match = re.fullmatch(r'(\w+)(>=|=)(\w+)', cond)
                        if not match:
                            raise DataError('Unsupported fresh condition: ' + cond)
                        key, op, val = match.groups()
                        path = 'owner.phase.' + key if key == 'form' else 'owner.private.' + key
                        branch['condition'] = _cmp(path, 'ge' if op == '>=' else 'eq', int(val) if val.isdigit() else val)
                    amount = raw.get('spend_' + resource)
                    if raw.get('spend') == 'all ' + resource:
                        amount = {'ref': 'root_snapshot.owner.private.' + resource}
                    if amount is not None:
                        branch['cost']['private'].append({'resource_id': resource, 'amount': amount})
                    def add(operation, target, **args):
                        branch['effects'].append(_effect(ability['id'] + '.' + bid + '.' + str(len(branch['effects'])), operation, target, **args))
                    coefficient = raw.get('damage_bp')
                    if 'damage_bp_formula' in raw:
                        if raw['damage_bp_formula'] != '8000+5000*actual_reserve_spent':
                            raise DataError('Unsupported fresh damage formula')
                        coefficient = {'calc': 'add', 'args': [8000, {'calc': 'mul', 'args': [5000, {'ref': 'context.payment.private.reserve'}]}]}
                    if coefficient is not None:
                        add('damage', 'chosen_enemy', basis='scaled_attack', coefficient_bp=coefficient, flat_amount=0,
                            element=role['element'], damage_tags=role['A_damage_tags'])
                    if raw.get('gain_' + resource):
                        add('resource_gain', 'owner_template', resource_id=resource, amount=raw['gain_' + resource])
                    if raw.get('block_bp'):
                        add('block', 'self_body', basis='scaled_attack', coefficient_bp=raw['block_bp'])
                    if 'set_form' in raw:
                        add('set_phase', 'owner_template', axis_id='form', value=raw['set_form'])
                    if 'grant_conditional_shield_bp' in raw:
                        add('shield', 'self_body', basis='scaled_attack', coefficient_bp=raw['grant_conditional_shield_bp'],
                            status_id='lynae_fresh_guard', stacking_key='lynae_fresh_guard', uses=1,
                            duration={'rounds': 1, 'boundary': 'player_start'}, damage_filter=_cmp('context.damage.ability_hit_count', 'eq', 1))
                    if 'grant_shield_bp' in raw:
                        add('shield', 'self_body', basis='scaled_attack', coefficient_bp=raw['grant_shield_bp'], status_id=raw['stacking_key'],
                            stacking_key=raw['stacking_key'], uses=None, duration={'rounds': 2, 'boundary': 'player_start'}, damage_filter=True)
                    if 'grant' in raw:
                        add('grant_modifier', 'self_body', modifier_id='denia_fresh_followup', lane='source_damage',
                            amount_bp={'calc': 'mul', 'args': [4000, {'ref': 'context.payment.private.reserve'}]},
                            damage_filter=_all(_cmp('context.event.skill_id', 'eq', 'COMMON_A'), {'cmp': 'in', 'left': 'direct', 'right': {'ref': 'context.damage.tags'}}),
                            uses=1, duration={'rounds': 1, 'boundary': 'player_end'}, starts='next_root_action')
                    ability['branches'].append(branch)
                self.mappings[rid][sid] = self._ability(ability)
        # A's added branch is already a fully expanded common DSL ability.
        for extension in self.raw.get('common_card_extension_rules', []):
            if 'branches' in extension:
                mapping = self.mappings[extension['owner_role_id']][extension['bind_to']]
                for raw_branch in extension['branches']:
                    branch = deepcopy(raw_branch)
                    branch['condition'] = _all(extension['condition'], branch['condition'])
                    # This additional branch is flattened from its own ability.
                    # Preserve that source ability's declared root tags on only
                    # this branch, not on unrelated common/fresh alternatives.
                    branch['ability_tags'] = list(dict.fromkeys(extension.get('ability_tags', []) + branch.get('ability_tags', [])))
                    mapping['branches'].append(branch)
        # B's declarative override retains the fresh behavior until acquired.
        for override in self.raw.get('advanced_mapping_overrides', []):
            acquisition = override['learning_skill_id']
            rid = self.acquisitions[acquisition]['owner_role_id']
            gate = _has(acquisition)
            mapping = self.mappings[rid][override['common_card_id']]
            for rule in override['replacement_rules']:
                branch = next(b for b in mapping['branches'] if b['id'] == rule['branch_id'])
                if 'additional_condition' in rule:
                    branch['condition'] = _all(branch['condition'], {'any': [{'not': gate}, rule['additional_condition']]})
                for effect in rule.get('after_effects', []):
                    effect = deepcopy(effect)
                    effect['when'] = _all(gate, effect.get('when', True))
                    branch['effects'].append(effect)
        # C expresses exact restrictions in finite, approved local mapping prose.
        extensions = self.raw.get('learned_circuit_rules', {}).get('mapping_extensions', {})
        for rid, entries in extensions.items():
            if not isinstance(entries, list):
                continue
            for raw_branch in entries:
                mapping = self.mappings[rid][raw_branch['card_id']]
                replacement = raw_branch.get('replaces', '')
                affected = []
                if replacement == 'while saw phase all fresh COMMON_A branches unavailable; no saw-phase refill by prepare_shear':
                    affected = list(mapping['branches'])
                elif replacement == 'fresh fold_early while saw; legal at zero remaining, loses all finisher damage and paid history; not an unlearned rescue':
                    affected = [b for b in mapping['branches'] if b['id'] == 'fold_early']
                for branch in affected:
                    branch['condition'] = _all(branch['condition'], {'not': deepcopy(raw_branch['condition'])})
                branch = deepcopy(raw_branch)
                branch['id'] = branch.pop('branch_id')
                branch.setdefault('card_type', 'action')
                branch.setdefault('keywords', [])
                branch.setdefault('targets', deepcopy(mapping['targets']))
                mapping['branches'].append(branch)

    def _bind_lifecycle_hooks(self):
        # B's trigger_ids bind the exact live status/token, rather than global listeners.
        used = set()
        for obj in list(self.statuses.values()) + list(self.tokens.values()):
            for identifier in obj.get('trigger_ids', []):
                hook = next((h for h in getattr(self, '_unbound_hooks', []) if h['id'] == identifier), None)
                if hook is None:
                    raise DataError('Missing lifecycle hook ' + identifier)
                obj.setdefault('hooks', []).append(deepcopy(hook))
                used.add(identifier)
        for hook in getattr(self, '_unbound_hooks', []):
            if hook['id'] not in used:
                self.hooks.append({'owner_role_id': hook['source_role_id'], 'hook': hook})
        # The common modifier backing is exactly one status instance.
        for ability in list(self.abilities.values()) + list(self.statuses.values()) + list(self.tokens.values()) + list(self.deployments.values()) + self.hooks:
            def visit(value):
                if isinstance(value, dict):
                    if value.get('op') == 'grant_modifier':
                        mid = value['args']['modifier_id']
                        if mid not in self.modifiers:
                            if mid in self.statuses:
                                self.modifiers[mid] = deepcopy(self.statuses[mid])
                            elif mid in self.tokens:
                                self.modifiers[mid] = deepcopy(self.tokens[mid])
                                self.modifiers[mid]['normalized_from'] = 'registered finite token grant; one modifier-backed status instance'
                                self.modifiers[mid]['uses'] = self.tokens[mid].get('max_count', self.tokens[mid].get('maxcount'))
                            else:
                                raise DataError('Unregistered modifier at ' + value['effect_id'] + ': ' + mid)
                    for v in value.values():
                        visit(v)
                elif isinstance(value, list):
                    for v in value:
                        visit(v)
            visit(ability)
        for obj in list(self.statuses.values()) + list(self.tokens.values()) + list(self.modifiers.values()):
            obj.setdefault('hooks', [])
            if 'expiry' in obj and 'duration' not in obj:
                obj['duration'] = deepcopy(obj['expiry'])
            if 'maxcount' in obj:
                obj.setdefault('max_count', obj['maxcount'])
        for obj in self.deployments.values():
            if obj.get('source_card_policy') == 'effect_only':
                obj['on_leave_destination'] = None

    def _normalize_hook_sources(self):
        """Attribute character-passive emitters to registered acquired abilities.

        The triggering root, its skill, and its branch are separate causal
        metadata. An inherent/circuit emitter must never borrow those identifiers
        or invent an independent XP record from its hook ID.
        """
        self.passive_emitters = {}
        for spec in self.hooks:
            owner, hook_id = spec['owner_role_id'], spec['hook']['id']
            source_id = spec.get('acquisition_id')
            if source_id is None:
                links = self.roles[owner].get('inherent_effect_links', {})
                matches = [identifier for identifier, hooks in links.items() if hook_id in hooks]
                if len(matches) != 1:
                    raise DataError('Global hook emitter association is missing or ambiguous: ' + hook_id)
                source_id = matches[0]
                spec['acquisition_id'] = source_id
            source_id = self.acquisition_aliases.get(source_id, source_id)
            registered = self.acquisitions.get(source_id)
            if registered is None or registered['owner_role_id'] != owner:
                raise DataError('Global hook source is not its registered owner ability: ' + hook_id)
            spec['source_ability_id'] = source_id
            spec['source_skill_id'] = registered['skill_id']
            spec['source_branch_id'] = None
            spec['source_kind'] = 'character_passive'
            spec['source_registration'] = 'acquisitions'
            self.passive_emitters[source_id] = {
                'id': source_id, 'owner_role_id': owner,
                'skill_id': registered['skill_id'], 'ability_kind': 'passive',
                'acquisition_id': source_id, 'source_kind': 'character_passive',
                'event_origin_kind_policy': 'player_skill or npc_skill according to actual source body; not triggering root',
            }

    def _normalize_exclusive_slots(self):
        """Finite group labels from frozen declarations, never inferred by role."""
        self.exclusive_slot_groups = {}
        registries = (self.modifiers, self.tokens, self.statuses)
        def bind(slot, members, acquisition_id=None):
            self.exclusive_slot_groups[slot] = {'members': list(members), 'acquisition_id': acquisition_id}
            for member in members:
                found = False
                for registry in registries:
                    if member in registry:
                        registry[member]['exclusive_slot'] = slot
                        if acquisition_id is not None:
                            registry[member]['exclusive_slot_acquisition_id'] = acquisition_id
                        found = True
                # The one explicit shared proof is a core operation-owned slot,
                # not permission to manufacture another token definition.
                if not found and member != 'common_mornye_proof':
                    raise DataError('Exclusive slot member is unregistered: ' + member)
        for slot, members in self.raw.get('temporary_slot_registry', {}).items():
            bind(slot, members)
        seen = set()
        for definition in list(self.tokens.values()) + list(self.modifiers.values()):
            declaration = definition.get('shared_exclusive_slot')
            if not declaration or declaration in seen:
                continue
            seen.add(declaration)
            match = re.fullmatch(r'([A-Za-z0-9_]+); ([A-Za-z0-9_]+) and ([A-Za-z0-9_]+) replace each other only when I2 acquired', declaration)
            if not match:
                raise DataError('Unsupported exclusive-slot declaration: ' + declaration)
            slot, first, second = match.groups()
            role = definition.get('owner_role_id')
            second_inherents = [x['id'] for x in self.inherents.values() if x.get('owner_role_id', x.get('role_id')) == role and x['id'].endswith('_I2')]
            if len(second_inherents) != 1:
                raise DataError('Ambiguous I2 exclusive-slot acquisition: ' + declaration)
            bind(slot, (first, second), second_inherents[0])

    def _normalize_transitions(self):
        """Bind frozen phase graphs to exact existing finite set_phase effects."""
        for role in self.roles.values():
            role['transitions'] = []
        effects = {}
        for aid, ability in self.abilities.items():
            containers = [(None, ability.get('effects', []))] + [(b['id'], b.get('effects', [])) for b in ability.get('branches', [])]
            for branch_id, sequence in containers:
                for effect in sequence:
                    if effect.get('op') == 'set_phase':
                        effects[effect['effect_id']] = {'owner_role_id': ability['owner_role_id'], 'ability_id': aid, 'branch_id': branch_id,
                                                      'axis_id': effect['args']['axis_id'], 'to': effect['args']['value'],
                                                      'effect_id': effect['effect_id'], 'guard': deepcopy(effect.get('when', True)), 'source_kind': 'ability'}
        for dep in self.deployments.values():
            for effect in dep.get('expire_effects', []):
                if effect.get('op') == 'set_phase':
                    effects[effect['effect_id']] = {'owner_role_id': dep.get('owner_role_id'), 'ability_id': dep['id'], 'branch_id': None,
                                                  'axis_id': effect['args']['axis_id'], 'to': effect['args']['value'],
                                                  'effect_id': effect['effect_id'], 'guard': deepcopy(effect.get('when', True)), 'source_kind': 'deployment_lifecycle', 'lifecycle': 'expire'}
        covered = set()
        def add(role_id, record, sources, source_declaration):
            if role_id not in self.roles or record['axis_id'] not in self.roles[role_id]['phase_axes']:
                raise DataError('Transition targets undeclared role/axis')
            states = self.roles[role_id]['phase_axes'][record['axis_id']]['states']
            if record['to'] not in states or any(value not in states for value in sources):
                raise DataError('Transition targets undeclared phase value')
            normalized = deepcopy(record)
            normalized['from'] = list(dict.fromkeys(sources))
            normalized['owner_role_id'] = role_id
            normalized['source_declaration'] = source_declaration
            self.roles[role_id]['transitions'].append(normalized)
            covered.add(record['effect_id'])
        if self.candidate == 'A':
            for row in self.raw['state_registry']['transitions']:
                matches = [effect for effect in effects.values() if effect['owner_role_id'] == row['role_id'] and effect['ability_id'] == row['ability_id'] and effect['branch_id'] == row['branch_id'] and effect['axis_id'] == row['axis_id'] and effect['to'] == row['to']]
                if not matches:
                    raise DataError('Transition has no actual effect: ' + str(row))
                for effect in matches:
                    add(row['role_id'], effect, row['from'], 'state_registry.transitions')
        elif self.candidate == 'B':
            tables = {(x['role_id'], x['axis_id']): x for x in self.raw['phase_transition_tables']}
            for effect in effects.values():
                table = tables.get((effect['owner_role_id'], effect['axis_id']))
                if table is None:
                    raise DataError('Set-phase effect has no declared phase table: ' + effect['effect_id'])
                sources = [t['from'] for t in table['transitions'] if t['to'] == effect['to']]
                if not sources:
                    raise DataError('Set-phase effect is outside phase table: ' + effect['effect_id'])
                add(effect['owner_role_id'], effect, sources, 'phase_transition_tables plus exact declared set_phase effect')
        else:
            for role in self.raw['roles']:
                for row in role['transitions']:
                    effect = effects.get(row['exact_effect_id'])
                    if effect is None or effect['axis_id'] != row['axis'] or effect['to'] != row['to']:
                        raise DataError('Transition exact effect mismatch: ' + row['exact_effect_id'])
                    add(role['role_id'], effect, row['from_values'], 'roles.transitions exact_effect_id')
        # The common first-acquisition mapping itself explicitly declares these
        # changes. Importing them does not grant an advanced circuit or axis.
        for rid, mappings in self.mappings.items():
            for mapping in mappings.values():
                for branch in mapping['branches']:
                    for effect in branch['effects']:
                        if effect.get('op') != 'set_phase' or effect['effect_id'] in covered:
                            continue
                        if not effect['effect_id'].startswith(mapping['id'] + '.'):
                            raise DataError('Learned mapping phase effect lacks transition declaration: ' + effect['effect_id'])
                        record = effects[effect['effect_id']]
                        sources = self.roles[rid]['phase_axes'][record['axis_id']]['states']
                        add(rid, record, sources, 'SYSTEM_CONTRACT.fresh_mode_mapping')
        missing = set(effects) - covered
        if missing:
            raise DataError('Undeclared phase effects: ' + ', '.join(sorted(missing)))

    def _gear(self, stage):
        if stage == 'fresh_acquisition':
            return {'loadout_id': 'UNEQUIPPED', 'owner_body_id': 'PLAYER_BODY_01', 'weapon': None, 'echoes': [None] * 5, 'flat_attack': 0}
        weapon = deepcopy(self.gear_contract['weapon'])
        weapon.update(instance_id='COREGEAR_WEAPON_' + stage, flat_attack=weapon['flat_attack_by_recorded_snapshot'][stage])
        return {'loadout_id': self.gear_contract['fixture_id'], 'owner_body_id': 'PLAYER_BODY_01', 'weapon': weapon,
                'echoes': deepcopy(self.gear_contract['echoes']), 'flat_attack': weapon['flat_attack'], 'matching_profile_id': None,
                'provenance': 'frozen explicit benchmark equipment history; not a body-level reward'}

    def _base_profile(self, identifier, stage, roles):
        stats = self.system['growth_snapshots']['early' if stage == 'fresh_acquisition' else stage]
        return {'id': identifier, 'stage': stage, 'roles': list(roles), 'body_id': 'PLAYER_BODY_01',
                'body_stats': {k: stats[k] for k in ('max_hp', 'attack', 'defense')}, 'skills': {}, 'learned': [], 'inherents': [],
                'owned_cards': {}, 'deck': [], 'role_states': {}, 'receipts': [], 'gear': self._gear(stage),
                'starting_active_template': None, 'heart_demon_qualification': {}, 'plus_one_items': 0, 'required_choices': []}

    def _finalize_profile(self, p):
        p['body_stats']['base_attack'] = p['body_stats']['attack']
        p['body_stats']['weapon_attack'] = p['gear']['flat_attack']
        p['body_stats']['attack'] += p['gear']['flat_attack']
        p['learned'] = list(dict.fromkeys(p['learned'] + list(p['skills'])))
        for role in p['roles']:
            tid = role.upper() + '_TEMPLATE'
            if tid not in p['learned']:
                p['learned'].append(tid)
        p['role_states'], p['required_choices'] = self.initial_role_states(p['roles'], p['learned'])
        for skill, rec in p['skills'].items():
            rec.setdefault('xp', 0)
            rec.setdefault('template_role_id', self.skill_catalogue.get(skill, {}).get('owner_role_id', self.skill_catalogue.get(skill, {}).get('role_id')))
        return p

    def _load_profiles(self):
        profiles = []
        d = self.raw
        if self.candidate == 'A':
            for raw in d['profiles_and_decks']:
                p = self._base_profile(raw['profile_id'], raw['stage'], raw['selected_template_ids'])
                p['body_stats'] = {'max_hp': raw['body_stats']['max_hp'], 'attack': raw['body_stats']['base_ATK'], 'defense': raw['body_stats']['DEF']}
                p['skills'] = {x['skill_id']: deepcopy(x) for x in raw['skill_records']}
                p['learned'] = [x['ability_id'] for x in raw['learned_noncard_records']]
                p['inherents'] = [x for x in p['learned'] if x in self.inherents]
                p['owned_cards'] = {x['copy_id']: x['card_definition_id'] for x in raw['owned_card_instances']}
                p['deck'] = list(raw['deck_card_instance_ids'])
                p['receipts'] = deepcopy(raw['receipts'])
                profiles.append(self._finalize_profile(p))
        elif self.candidate == 'B':
            for raw in d['decklists_75']:
                stage = raw['stage']
                p = self._base_profile(raw['id'], stage, raw['selected_template_ids'])
                level = {'early': 1, 'mid': 5, 'late': 9}[stage]
                p['skills'] = {sid: {'level': level, 'xp': 0, 'template_role_id': None} for sid in ('COMMON_A', 'COMMON_D')}
                p['owned_cards'] = {sid + '_' + str(i): sid for sid in ('COMMON_A', 'COMMON_D') for i in range(1, 6)}
                for rid in p['roles']:
                    grow = d['growth_snapshots'][stage]['roles'][rid]
                    p['learned'] += grow['learned_ability_ids']
                    p['inherents'] += grow['inherent_ids']
                    p['learned'] += grow['inherent_ids']
                    p['skills'].update({sid: {'level': lv, 'xp': 0, 'template_role_id': rid} for sid, lv in grow['levels'].items()})
                    p['receipts'] += deepcopy(grow['learning_receipts'] + grow['recorded_upgrade_items'])
                    p['owned_cards']['B_MODE_' + rid + '_01'] = 'MODE_' + rid
                    for sid in grow['learned_ability_ids']:
                        if sid in self.abilities and self.abilities[sid]['ability_kind'] == 'card':
                            p['owned_cards']['B_OWN_' + rid + '_' + sid + '_01'] = sid
                p['deck'] = deepcopy(raw['card_instance_ids'])
                for inst, sid in zip(raw['card_instance_ids'], raw['card_definition_ids']):
                    if p['owned_cards'].get(inst) != sid:
                        raise DataError('B deck/ownership mismatch ' + inst)
                profiles.append(self._finalize_profile(p))
        else:
            for raw in d['deck_configurations']:
                p = self._base_profile(raw['id'], raw['stage'], raw['selected_template_ids'])
                p['body_stats'] = {k: raw['body_stats'][k] for k in ('max_hp', 'attack', 'defense')}
                p['skills'] = {sid: {'level': lv, 'xp': raw.get('skill_progress_xp', {}).get(sid, 0)} for sid, lv in raw['skill_levels'].items()}
                p['receipts'] = deepcopy(raw['learning_receipts'] + raw['breakthrough_receipts'])
                p['learned'] = [self.acquisition_aliases[x] for x in raw['learning_receipts'] if x in self.acquisition_aliases]
                p['inherents'] = list(raw['learned_inherent_ids'])
                p['heart_demon_qualification'] = deepcopy(raw['heart_demon_qualification'])
                p['owned_cards'] = {sid + '#' + str(i): sid for sid, count in raw['ownership'].items() for i in range(1, count + 1)}
                p['deck'] = [x['card_instance_id'] for x in raw['deck']]
                profiles.append(self._finalize_profile(p))
        return profiles

    def initial_role_states(self, roles, learned, routes=None):
        learned = set(learned)
        learned |= {self.acquisition_aliases.get(x, x) for x in learned}
        states, required = {}, []
        def acquired(value, rid):
            if value in (None, 'template', 'first_mode_intrinsic'):
                return True
            if value == 'circuit':
                value = self.roles[rid]['circuit_id']
            return self.acquisition_aliases.get(value, value) in learned
        for rid in roles:
            role = self.roles[rid]
            state = {'private': {}, 'caps': {}, 'history': {}, 'history_caps': {}, 'phase': {}}
            for dim in role['private_dimensions']:
                advanced = acquired(dim.get('advanced_cap_acquisition', dim.get('advanced_cap_requires', role['circuit_id'])), rid)
                cap = dim['advanced_cap'] if advanced else dim.get('fresh_cap')
                if cap is None or not acquired(dim.get('acquisition'), rid):
                    continue
                history = dim['kind'] == 'history'
                state['history' if history else 'private'][dim['id']] = dim.get('initial', 0)
                state['history_caps' if history else 'caps'][dim['id']] = cap
            for axis_id, axis in role['phase_axes'].items():
                if not acquired(axis.get('acquisition'), rid):
                    continue
                initial = axis['initial']
                if axis_id == 'route' and rid in (routes or {}):
                    initial = routes[rid]
                    if initial == 'fusion' and 'fusion_burst' in axis['states']:
                        initial = 'fusion_burst'
                    elif initial == 'fusion_burst' and 'fusion' in axis['states']:
                        initial = 'fusion'
                    if initial not in axis['states']:
                        raise DataError('Invalid route for ' + rid)
                elif initial == 'build_choice':
                    initial = None
                    required.append({'role_id': rid, 'axis_id': axis_id, 'allowed': list(axis['states'])})
                state['phase'][axis_id] = initial
            states[rid] = state
        return states, required

    def profile(self, profile_id=None, stage='early', roles=None, deck=None, routes=None):
        roles = ['aemeath'] if roles is None else list(roles)
        if profile_id is not None:
            matches = [p for p in self.profiles if p['id'] == profile_id]
        else:
            matches = [p for p in self.profiles if p['stage'] == stage and p['roles'] == roles]
        if matches:
            p = deepcopy(matches[0])
        elif profile_id is None and stage == 'fresh_acquisition':
            p = self.fresh_profile(roles)
        else:
            raise DataError('No frozen profile matches requested ID/stage/roles')
        if routes is not None:
            p['role_states'], p['required_choices'] = self.initial_role_states(p['roles'], p['learned'], routes)
            p['routes'] = deepcopy(routes)
        if deck is not None:
            p['deck'] = list(deck)
        self.validate_profile(p)
        return p

    def fresh_profile(self, roles):
        p = self._base_profile(self.candidate + '_fresh_acquisition_' + '_'.join(roles), 'fresh_acquisition', roles)
        p['skills'] = {sid: {'level': 1, 'xp': 0, 'template_role_id': None} for sid in ('COMMON_A', 'COMMON_D')}
        p['owned_cards'] = {sid + '#' + str(i): sid for sid in ('COMMON_A', 'COMMON_D') for i in range(1, 6)}
        p['deck'] = [sid + '#' + str(i) for sid in ('COMMON_A', 'COMMON_D') for i in range(1, 4)]
        for role in roles:
            sid = 'MODE_' + role.upper()
            p['owned_cards'][sid + '#1'] = sid
            p['deck'].append(sid + '#1')
            p['receipts'].append({'id': 'FIRST_' + role.upper(), 'kind': 'TEMPLATE_FIRST_ACQUIRED', 'subject': role, 'external_fixture': True})
        return self._finalize_profile(p)

    def validate_profile(self, profile):
        roles = profile['roles']
        if not 1 <= len(roles) <= 3 or len(roles) != len(set(roles)) or any(r not in self.roles for r in roles):
            raise DataError('Selected templates must be 1..3 unique registered roles')
        deck, owned = profile['deck'], profile['owned_cards']
        if not 1 <= len(deck) <= 30 or len(deck) != len(set(deck)):
            raise DataError('Deck must contain 1..30 distinct physical instances')
        counts = Counter()
        for instance in deck:
            if instance not in owned or owned[instance] not in self.abilities:
                raise DataError('Unknown or unowned card ' + instance)
            definition = owned[instance]
            ability = self.abilities[definition]
            if ability.get('ability_kind') != 'card' or definition == 'ENEMY_BURDEN' or '__COMMON_' in definition:
                raise DataError('Non-collectible ability cannot be in deck ' + definition)
            if ability.get('owner_role_id') and ability['owner_role_id'] not in roles:
                raise DataError('Card owner is not a selected template ' + definition)
            acquisition = ability.get('acquisition_id', ability.get('skill_id'))
            if acquisition and acquisition not in profile['learned'] and acquisition not in profile['skills']:
                raise DataError('Card ability has not been acquired ' + definition)
            definition_key = 'MODE_' + ability['owner_role_id'] if ability.get('card_type') == 'mode' else definition
            counts[definition_key] += 1
        if any(n > 3 for n in counts.values()):
            raise DataError('At most three copies per card definition')
        return True


    def _registered_references(self):
        refs = {k for k in self.closure['sections']['read_only_registry'] if '<' not in k}
        refs |= {'active.role_id', 'skill.level', 'battle.round', 'context.event.hp_lost',
                 'context.event.status_id', 'context.event.ability_tags',
                 'context.damage.raw', 'context.damage.after_mitigation',
                 'context.damage.shield_lost', 'context.damage.block_lost', 'context.damage.hp_lost'}
        for subject in ('actor', 'target'):
            refs |= {subject + '.' + x for x in ('entity_id', 'body_id', 'hp', 'max_hp', 'attack', 'defense', 'alive', 'faction_id')}
        refs |= {'owner.' + x for x in ('role_id', 'template_id', 'body_id')}
        refs |= {'context.event.' + x for x in self.system['event_schema']['required']}
        refs |= {'context.event.' + x for x in ('skill_id', 'resource_id', 'actual_heal', 'ability_id', 'origin_ability_id', 'branch_id', 'accepted_stacks', 'pre_death_status_ids', 'killer_side', 'status_instance_id')}
        refs |= {'context.switch.' + x for x in ('full_handoff', 'from_template_id', 'to_template_id', 'to_role_id')}
        refs |= {'context.payment.energy', 'context.deployment.remaining_uses', 'target.status.fusion_burst.stacks', 'target.status.resonance.progress'}
        refs |= {'context.event.pre_root_status.' + identifier + '.source_role_id' for identifier in self.statuses}
        for role in self.roles.values():
            for dim in role['private_dimensions']:
                refs.add('owner.' + ('history.' if dim['kind'] == 'history' else 'private.') + dim['id'])
                if dim['kind'] != 'history':
                    refs.add('context.payment.private.' + dim['id'])
            refs |= {'owner.phase.' + x for x in role['phase_axes']}
        for route in ('shock', 'fusion_burst'):
            refs.add('owner.contributors.' + route + '.count')
        for did, dep in self.deployments.items():
            for field in ('exists', 'on_leave_destination'):
                refs.add('actor.deployment.' + dep['stacking_key'] + '.' + field)
            for field in ('target_entity_ids', 'route'):
                refs.add('context.deployment.paid_snapshot.' + field)
        for definition in list(self.statuses.values()) + list(self.tokens.values()):
            prefix = 'context.token.payload.' if definition['id'] in self.tokens else 'context.status.payload.'
            fields = definition.get('payload_schema', {})
            if isinstance(fields, dict):
                refs |= {prefix + x for x in fields}
            elif isinstance(fields, list):
                refs |= {prefix + x for x in fields if isinstance(x, str)}
        # A's registry supplies finite payload bindings inside status definitions.
        for definition in self.statuses.values():
            fields = definition.get('payload_bindings', definition.get('creation_defaults', {}))
            if isinstance(fields, dict):
                refs |= {'context.status.payload.' + x for x in fields}
        # Read explicit finite payload keys carried by accepted creation effects.
        def payloads(value):
            if isinstance(value, dict):
                if value.get('op') in ('apply_status', 'grant_token'):
                    prefix = 'context.status.payload.' if value['op'] == 'apply_status' else 'context.token.payload.'
                    fields = value.get('args', {}).get('payload', {})
                    if isinstance(fields, dict):
                        refs.update(prefix + x for x in fields)
                for child in value.values():
                    payloads(child)
            elif isinstance(value, list):
                for child in value:
                    payloads(child)
        payloads(self.abilities)
        result = refs | {'root_snapshot.' + x for x in refs if not x.startswith('root_snapshot.')}
        # No current-root deployment exists yet in the prepayment snapshot.
        result.discard('root_snapshot.context.last_created_deployment_instance_id')
        return frozenset(result)

    def _validate_creation_bindings(self, definition):
        """Prove same-sequence creator bindings without evaluating candidate code.

        Guard proof is deliberately conservative: exact Boolean AST facts and
        conjunction/disjunction implication only. Unsupported proof obligations
        reject rather than assuming a conditional deploy succeeded.
        """
        creation_ref = 'context.last_created_deployment_instance_id'
        def descendants(value):
            if isinstance(value, dict):
                yield value
                for child in value.values():
                    yield from descendants(child)
            elif isinstance(value, list):
                for child in value:
                    yield from descendants(child)
        def literal_key(value):
            return json.dumps(value, sort_keys=True, separators=(',', ':'))
        def conflicts(term):
            equalities = {}
            atoms = set(term)
            for atom in atoms:
                node = json.loads(atom)
                if isinstance(node, dict) and 'not' in node and literal_key(node['not']) in atoms:
                    return True
                if not isinstance(node, dict) or node.get('cmp') != 'eq':
                    continue
                left, right = node.get('left'), node.get('right')
                if isinstance(right, dict) and 'ref' in right:
                    left, right = right, left
                if isinstance(left, dict) and 'ref' in left and not isinstance(right, (dict, list)):
                    key, value = left['ref'], literal_key(right)
                    if key in equalities and equalities[key] != value:
                        return True
                    equalities[key] = value
            return False
        def terms(predicate):
            if predicate is True:
                return [frozenset()]
            if predicate is False:
                return []
            if isinstance(predicate, dict) and 'all' in predicate:
                result = [frozenset()]
                for child in predicate['all']:
                    result = [a | b for a in result for b in terms(child) if not conflicts(a | b)]
                    if len(result) > 256:
                        raise DataError('CREATION_BINDING_GUARD_PROOF_TOO_COMPLEX')
                return result
            if isinstance(predicate, dict) and 'any' in predicate:
                result = [item for child in predicate['any'] for item in terms(child)]
                if len(result) > 256:
                    raise DataError('CREATION_BINDING_GUARD_PROOF_TOO_COMPLEX')
                return result
            return [frozenset([literal_key(predicate)])]
        def implies(consumer, creator):
            required = terms(creator)
            return bool(required) and all(any(need <= fact for need in required) for fact in terms(consumer))
        def disjoint(left, right):
            return all(conflicts(a | b) for a in terms(left) for b in terms(right))
        def writes_reference(effect, ref):
            if ref.startswith(('root_snapshot.', 'context.payment.', 'context.event.', 'context.switch.', 'context.action.')) or ref == 'skill.level':
                return False
            op, args = effect.get('op'), effect.get('args', {})
            if ref.startswith('owner.phase.'):
                return op == 'set_phase' and args.get('axis_id') == ref.rsplit('.', 1)[1]
            if ref.startswith('owner.private.'):
                return op in ('resource_set', 'resource_gain') and args.get('resource_id') == ref.rsplit('.', 1)[1]
            if ref.startswith('owner.history.'):
                return op in ('history_add', 'history_reset') and args.get('history_id') == ref.rsplit('.', 1)[1]
            if ref.startswith('target.status.'):
                return op in ('apply_status', 'remove_status', 'fusion_apply', 'fusion_detonate', 'resonance_add', 'resonance_break', 'resonance_offset')
            if ref in ('actor.hp', 'target.hp', 'actor.alive', 'target.alive'):
                return op in ('damage', 'heal', 'fusion_detonate', 'resonance_break')
            if ref.startswith('context.deployment.'):
                return op in ('deploy', 'close_deployment', 'deployment_spend_uses', 'deployment_retarget')
            # All remaining registered creation guards are read-only snapshots.
            return False
        def sequence(effects, prefix, path):
            preceding = list(prefix)
            for index, effect in enumerate(effects):
                nodes = list(descendants(effect))
                raw_refs = [n for n in nodes if n.get('ref') == creation_ref]
                binders = [n for n in nodes if n.get('kind') == 'created_by_effect']
                distinct = {(b.get('creator_effect_id'), b.get('expected_definition_id')) for b in binders}
                if raw_refs and len(distinct) != 1:
                    raise DataError(path + ': UNBOUND_OR_AMBIGUOUS_LAST_CREATED_DEPLOYMENT')
                for creator_id, expected in distinct:
                    if not isinstance(creator_id, str) or not isinstance(expected, str):
                        raise DataError(path + ': EXACT_CREATOR_AND_DEFINITION_REQUIRED')
                    matches = [(i, e) for i, e in enumerate(preceding) if e.get('effect_id') == creator_id]
                    if len(matches) != 1 or matches[0][1].get('op') != 'deploy':
                        raise DataError(path + ': CREATOR_NOT_UNIQUE_PRECEDING_DEPLOY ' + creator_id)
                    creator_index, creator = matches[0]
                    if creator.get('args', {}).get('definition_id') != expected:
                        raise DataError(path + ': CREATOR_EXPECTED_DEFINITION_MISMATCH')
                    guard, create_guard = effect.get('when', True), creator.get('when', True)
                    if not implies(guard, create_guard):
                        raise DataError(path + ': CREATOR_NOT_GUARANTEED_BY_CONSUMER_GUARD')
                    guard_refs = {n['ref'] for n in descendants(create_guard) if 'ref' in n}
                    for middle in preceding[creator_index + 1:]:
                        if disjoint(guard, middle.get('when', True)):
                            continue
                        if any(writes_reference(middle, ref) for ref in guard_refs):
                            raise DataError(path + ': CREATOR_GUARD_INPUT_CHANGED_BEFORE_USE')
                        if raw_refs and middle.get('op') == 'deploy':
                            raise DataError(path + ': LAST_CREATED_OVERWRITTEN_BY_OTHER_DEPLOY')
                preceding.append(effect)
        def inspect(node, path='$', prefix=None):
            if isinstance(node, list):
                for i, child in enumerate(node):
                    inspect(child, path + '[' + str(i) + ']')
                return
            if not isinstance(node, dict):
                return
            if node.get('ref') == creation_ref:
                raise DataError(path + ': LAST_CREATED_OUTSIDE_POSTDEPLOY_EFFECT')
            if node.get('kind') == 'created_by_effect':
                raise DataError(path + ': CREATOR_BINDING_OUTSIDE_EFFECT_SEQUENCE')
            base = node.get('effects', [])
            if isinstance(base, list):
                sequence(base, prefix or [], path + '.effects')
            if isinstance(node.get('expire_effects'), list):
                sequence(node['expire_effects'], [], path + '.expire_effects')
            for key, child in node.items():
                if key in ('effects', 'expire_effects'):
                    continue
                if key == 'branches' and isinstance(child, list):
                    for i, branch in enumerate(child):
                        inspect(branch, path + '.branches[' + str(i) + ']', (prefix or []) + base)
                else:
                    inspect(child, path + '.' + key)
        inspect(definition)

    def validate_definition(self, definition, *, kind=None, abilities=None):
        """Compile-time symbol/lifecycle checks usable for isolated invalid fixtures.

        This validates the supplied copy without changing the frozen registry. It
        rejects unknown operations/references and nonfinite lifecycle shortcuts.
        Dynamic target/payment legality belongs to the engine's transaction pass.
        """
        definition = normalize(deepcopy(definition))
        catalogue = set(self.dsl['operation_catalogue'])
        events = set(self.system['event_schema']['event_names'])
        events |= set(self.dsl['event_registry_addendum']['timepoints'])
        events |= set(self.dsl['event_registry_addendum']['extension_events'])
        events |= set(self.dsl['event_registry_addendum']['normalized_input_aliases'])
        registry = self.abilities if abilities is None else abilities
        if isinstance(registry, list):
            registry = _index(registry)
        nodes = 0
        def leaves(v):
            if isinstance(v, dict):
                yield v
                for child in v.values():
                    yield from leaves(child)
            elif isinstance(v, list):
                for child in v:
                    yield from leaves(child)
        def check_hook(hook, path):
            if hook['event'] not in events:
                raise DataError(path + ': UNKNOWN_EVENT ' + hook['event'])
            if hook.get('allow_origin_event'):
                def entails(predicate, test):
                    if not isinstance(predicate, dict):
                        return False
                    if test(predicate):
                        return True
                    if 'all' in predicate:
                        return any(entails(v, test) for v in predicate['all'])
                    if 'any' in predicate:
                        return bool(predicate['any']) and all(entails(v, test) for v in predicate['any'])
                    return False
                accepted = entails(hook.get('condition'), lambda x:x.get('cmp') in ('gt', 'ge') and x.get('left') == {'ref': 'context.event.accepted_stacks'} and x.get('right') == (0 if x.get('cmp') == 'gt' else 1) )
                exact = entails(hook.get('condition'), lambda x:x.get('cmp') == 'eq' and [x.get('left'), x.get('right')] in ([{'ref': 'context.event.status_instance_id'}, {'ref': 'context.status.instance_id'}], [{'ref': 'context.status.instance_id'}, {'ref': 'context.event.status_instance_id'}]) )
                effects = hook.get('effects', [])
                if hook['event'] != 'STATUS_APPLIED' or not accepted or not exact or not effects or any(x.get('op') != 'grant_token' for x in effects):
                    raise DataError(path + ': ORIGIN_EVENT_ONLY_FOR_EXACT_STATUS_INITIALIZATION')
                status_ids = [x.get('right') for x in leaves(hook.get('condition')) if x.get('cmp') == 'eq' and x.get('left') == {'ref': 'context.event.status_id'} and isinstance(x.get('right'), str)]
                status_id = definition.get('id') if definition.get('id') in self.statuses else (status_ids[0] if len(status_ids) == 1 else None)
                if status_id is None:
                    raise DataError(path + ': INITIALIZATION_STATUS_BINDING_REQUIRED')
                status = definition if definition.get('id') == status_id else self.statuses.get(status_id, {})
                for effect in effects:
                    args = effect.get('args', {})
                    token = self.tokens.get(args.get('token_id'), {})
                    amount = args.get('amount')
                    if token.get('source') != status_id or type(amount) is not int or not 1 <= amount <= token.get('max_count', token.get('maxcount', 0)) or args.get('duration') != status.get('duration'):
                        raise DataError(path + ': INITIALIZATION_TOKEN_OR_EXPIRY_MISMATCH')
            limits = hook.get('limit', {})
            if not any(type(limits.get(k)) is int and limits[k] > 0 for k in ('per_root_action', 'per_owner_round', 'per_battle', 'max_live_instances')):
                raise DataError(path + ': FINITE_HOOK_LIMIT_REQUIRED')
        def walk(value, path='$'):
            nonlocal nodes
            if isinstance(value, dict):
                nodes += 1
                if 'ref' in value and value['ref'] not in self.registered_refs:
                    raise DataError(path + ': UNKNOWN_REFERENCE ' + str(value['ref']))
                if 'array_ref' in value:
                    array_path = value['array_ref']
                    array_views = {'context.damage.tags', 'context.event.ability_tags', 'context.event.tags', 'context.event.pre_death_status_ids', 'context.selected_target_entity_ids', 'context.deployment.paid_snapshot.target_entity_ids', 'context.bound_target_entity_ids'}
                    allowed_arrays = {ref for ref in array_views if ref in self.registered_refs or ref == 'context.bound_target_entity_ids'}
                    allowed_arrays |= {'root_snapshot.' + ref for ref in allowed_arrays if 'root_snapshot.' + ref in self.registered_refs}
                    if type(array_path) is not str or array_path not in allowed_arrays:
                        raise DataError(path + ': UNKNOWN_OR_NONARRAY_REFERENCE ' + str(array_path))
                if value.get('kind') == 'fixed_entities' and isinstance(value.get('entity_ids'), dict):
                    binding = value['entity_ids']
                    if set(binding) != {'array_ref'} or type(binding['array_ref']) is not str or binding['array_ref'] not in ('context.deployment.paid_snapshot.target_entity_ids', 'context.bound_target_entity_ids'):
                        raise DataError(path + ': FIXED_TARGET_ARRAY_NAMESPACE')
                if any(k in value for k in ('callback', 'script', 'eval', 'on_apply', 'on_expire', 'on_remove')):
                    raise DataError(path + ': EXECUTABLE_CALLBACKS_FORBIDDEN')
                if 'has' in value:
                    memberships = {'learned_skill': set(self.acquisitions) | set(self.skill_catalogue), 'learned_inherent': set(self.inherents), 'token': set(self.tokens), 'status': set(self.statuses) | set(self.modifiers) | {'fusion_burst', 'shock_offset', 'tune_offset', 'havoc_bane'}}
                    if value['has'] not in memberships and value['has'] != 'tag':
                        raise DataError(path + ': UNKNOWN_MEMBERSHIP_KIND')
                    if value['has'] in memberships and value.get('id') not in memberships[value['has']]:
                        raise DataError(path + ': UNKNOWN_MEMBERSHIP_ID ' + str(value.get('id')))
                if 'op' in value:
                    operation = value['op']
                    if operation not in catalogue:
                        raise DataError(path + ': UNKNOWN_OPERATION ' + str(operation))
                    args = value.get('args', {})
                    symbols = {
                        'shield': ('status_id', set(self.statuses)),
                        'extend_anomaly_cap': ('status_id', {'fusion_burst'}),
                        'apply_status': ('status_id', set(self.statuses) | {'fusion_burst', 'shock_offset', 'tune_offset'}),
                        'remove_status': ('status_id', set(self.statuses) | set(self.modifiers) | {'fusion_burst', 'shock_offset', 'tune_offset'}),
                        'grant_token': ('token_id', set(self.tokens)), 'consume_token': ('token_id', set(self.tokens)),
                        'grant_modifier': ('modifier_id', set(self.modifiers)),
                        'deploy': ('definition_id', set(self.deployments)),
                        'generate': ('card_definition_id', set(registry)),
                    }
                    private_ids = {dimension['id'] for role in self.roles.values() for dimension in role['private_dimensions'] if dimension['kind'] != 'history'}
                    history_ids = {dimension['id'] for role in self.roles.values() for dimension in role['private_dimensions'] if dimension['kind'] == 'history'}
                    if operation in ('resource_gain', 'resource_spend', 'resource_set'): symbols[operation] = ('resource_id', private_ids | {'energy', 'concerto'})
                    if operation in ('history_add', 'history_reset'): symbols[operation] = ('history_id', history_ids)
                    if operation == 'set_phase':
                        axes = [role['phase_axes'][args.get('axis_id')] for role in self.roles.values() if args.get('axis_id') in role['phase_axes']]
                        if not axes or isinstance(args.get('value'), str) and not any(args['value'] in axis['states'] for axis in axes): raise DataError(path + ': UNKNOWN_PHASE_SYMBOL')
                    if operation in symbols:
                        key, known = symbols[operation]
                        if args.get(key) not in known: raise DataError(path + ': UNKNOWN_SYMBOL ' + key + '=' + str(args.get(key)))
                    if operation == 'emit_tagged_event':
                        event_type = value.get('args', {}).get('event_type')
                        if event_type in events:
                            raise DataError(path + ': FORGED_SYSTEM_EVENT')
                        # The pinned DSL describes this operation but registers
                        # no candidate-emittable marker event. Its phase/spatial
                        # addendum names actual system-owned events only, and no
                        # frozen candidate uses emit_tagged_event. Prose naming
                        # an optional readonly INTRO_RESOLVED audit marker does
                        # not grant a candidate authority to emit it.
                        raise DataError(path + ': UNREGISTERED_MARKER_EVENT ' + str(event_type))
                    if operation == 'damage' and any(str(t).lower() in ('interference', 'interference_damage') for t in value.get('args', {}).get('damage_tags', [])):
                        raise DataError(path + ': INTERFERENCE_REQUIRES_RESONANCE_BREAK')
                if 'event' in value and 'effects' in value and 'id' in value:
                    check_hook(value, path)
                if 'query' in value and value['query'] not in self.dsl['IntExpr']['queries']:
                    raise DataError(path + ': UNKNOWN_QUERY')
                if 'cmp' in value and value['cmp'] not in ('eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in'):
                    raise DataError(path + ': UNKNOWN_COMPARISON')
                if 'calc' in value:
                    arities = {'add': (2, 8), 'sub': (2, 2), 'mul': (2, 4), 'floor_div': (2, 2), 'min': (2, 8), 'max': (2, 8), 'clamp': (3, 3)}
                    if value['calc'] not in arities:
                        raise DataError(path + ': UNKNOWN_CALCULATION')
                    lo, hi = arities[value['calc']]
                    if not isinstance(value.get('args'), list) or not lo <= len(value['args']) <= hi:
                        raise DataError(path + ': INVALID_CALCULATION_ARITY')
                    if value['calc'] == 'floor_div' and isinstance(value['args'][1], int) and value['args'][1] <= 0:
                        raise DataError(path + ': NONPOSITIVE_DIVISOR')
                for key, child in value.items():
                    if key in ('usage_limit', 'limit') and isinstance(child, dict):
                        for limit_name, limit in child.items():
                            if limit_name in ('per_root_action', 'per_owner_round', 'per_battle', 'max_live_instances') and limit is not None and (type(limit) is not int or limit < 1):
                                raise DataError(path + ': INVALID_USAGE_LIMIT')
                    walk(child, path + '.' + key)
            elif isinstance(value, list):
                for i, child in enumerate(value):
                    walk(child, path + '[' + str(i) + ']')
        def check_cardflow(value, finite=False, paid=False, mode=False):
            if isinstance(value, list):
                for child in value: check_cardflow(child, finite, paid, mode)
                return
            if not isinstance(value, dict): return
            mode = mode or value.get('card_type') == 'mode'
            for key in ('usage_limit', 'limit'):
                limit = value.get(key) or {}
                finite = finite or any(type(limit.get(k)) is int and limit[k] > 0 for k in ('per_root_action', 'per_owner_round', 'per_battle', 'max_live_instances'))
            cost = value.get('cost') or {}
            paid = paid or (type(cost.get('energy')) is int and cost['energy'] > 0) or any(cost.get(k) for k in ('private', 'tokens', 'card_choices'))
            operation = value.get('op'); args = value.get('args', {})
            if operation in ('generate', 'recover') and not finite: raise DataError('FINITE_CARDFLOW_SOURCE_LIMIT_REQUIRED')
            if operation == 'generate' and type(args.get('count')) is int and not 1 <= args['count'] <= 3: raise DataError('GENERATE_COUNT')
            if operation == 'retain' and not paid: raise DataError('RETAIN_ACTUAL_COST_OR_SACRIFICE_REQUIRED')
            if operation == 'history_reset' and (mode or self.history_reset_registry.get(value.get('effect_id')) != args or not any(source['container_id'] == definition.get('id') for source in self.history_reset_sources.get(value.get('effect_id'), []))): raise DataError('UNREGISTERED_HISTORY_RESET')
            for child in value.values(): check_cardflow(child, finite, paid, mode)
        walk(definition)
        check_cardflow(definition)
        self._validate_creation_bindings(definition)
        if 'activation_ability_ids' in definition:
            for identifier in definition['activation_ability_ids']:
                if identifier not in registry:
                    raise DataError('UNKNOWN_ACTIVATION ' + identifier)
                ability = registry[identifier]
                if ability.get('ability_kind') != 'activation':
                    raise DataError('NONACTIVATION_DEPLOYMENT_BUTTON ' + identifier)
                if definition.get('consume_use_on_activation', True) and any(x.get('op') == 'deployment_spend_uses' for x in leaves(ability)):
                    raise DataError('AUTO_AND_MANUAL_DEPLOYMENT_USE ' + identifier)
        return {'valid': True, 'id': definition.get('id'), 'validated_nodes': nodes}

    def compile_registry(self):
        results = []
        for family in ('abilities', 'statuses', 'tokens', 'modifiers', 'deployments'):
            for value in getattr(self, family).values():
                results.append(self.validate_definition(value, kind=family))
        for hook in self.hooks:
            results.append(self.validate_definition(hook))
        return {'valid': True, 'candidate': self.candidate, 'definitions': len(results), 'registered_reference_count': len(self.registered_refs), 'frozen_input_hashes': deepcopy(self.manifest)}


class Growth:
    """Shared, atomic, idempotent acquisition and persistent XP receipts.

    Methods mutate the supplied profile only after validation. Successful methods
    return {accepted, duplicate, code, ...}; invalid requests raise DataError and
    leave inventory, receipts, XP, deck, and equipment unchanged.
    """
    def __init__(self, data, profile):
        self.data, self.profile = data, profile
        self.profile.setdefault('owned_templates', list(profile.get('roles', [])))
        self.profile.setdefault('plus_one_items', 0)
        self.profile.setdefault('heart_demon_qualification', {})
        self.profile.setdefault('growth_receipts', {})
        self.profile.setdefault('pending_xp', {})
        self.profile.setdefault('xp_use_keys', [])
        self.profile.setdefault('in_battle', False)

    def _out_of_battle(self):
        if self.profile.get('in_battle'):
            raise DataError('OUT_OF_BATTLE_REQUIRED')

    def _transaction(self, receipt_id, kind, payload, mutate):
        if not isinstance(receipt_id, str) or not receipt_id:
            raise DataError('NONEMPTY_RECEIPT_REQUIRED')
        record = {'kind': kind, 'payload': deepcopy(payload)}
        old = self.profile['growth_receipts'].get(receipt_id)
        if old is not None:
            if old['kind'] != kind or old['payload'] != payload:
                raise DataError('RECEIPT_REUSE_MISMATCH')
            return dict(deepcopy(old['result']), duplicate=True)
        # All externally supplied receipts share one namespace, including fixture history.
        for old_receipt in self.profile.get('receipts', []):
            existing_id = old_receipt if isinstance(old_receipt, str) else old_receipt.get('id', old_receipt.get('receipt_id'))
            if existing_id == receipt_id:
                raise DataError('RECEIPT_ALREADY_IN_PROFILE')
        future = deepcopy(self.profile)
        details = mutate(future) or {}
        result = {'accepted': True, 'duplicate': False, 'code': 'OK', **details}
        record['result'] = deepcopy(result)
        future['growth_receipts'][receipt_id] = record
        future.setdefault('receipts', []).append({'id': receipt_id, 'kind': kind, **deepcopy(payload)})
        self.profile.clear()
        self.profile.update(future)
        return result

    def acquire_template(self, role, receipt_id):
        self._out_of_battle()
        if role not in self.data.roles:
            raise DataError('UNKNOWN_ROLE')
        def apply(p):
            if role in p['owned_templates']:
                p['plus_one_items'] += 1
                return {'acquisition': 'duplicate', 'plus_one_items_granted': 1}
            p['owned_templates'].append(role)
            p['learned'].append(role.upper() + '_TEMPLATE')
            definition = 'MODE_' + role.upper()
            instance = receipt_id + ':card:1'
            p['owned_cards'][instance] = definition
            # Ownership does not silently select a template or mutate the deck.
            return {'acquisition': 'first', 'card_instance_ids': [instance], 'granted_ability_id': role.upper() + '_TEMPLATE'}
        return self._transaction(receipt_id, 'TEMPLATE_ACQUIRED', {'role_id': role}, apply)

    def learn(self, ability_id, receipt_id):
        self._out_of_battle()
        ability_id = self.data.acquisition_aliases.get(ability_id, ability_id)
        acq = self.data.acquisitions.get(ability_id)
        if acq is None or ability_id.endswith('_TEMPLATE') or ability_id in ('COMMON_A', 'COMMON_D'):
            raise DataError('UNKNOWN_OR_INVALID_LEARNING_TARGET')
        def apply(p):
            if ability_id in p['learned'] or ability_id in p['inherents']:
                raise DataError('ABILITY_ALREADY_LEARNED')
            if acq['owner_role_id'] not in p['owned_templates']:
                raise DataError('TEMPLATE_NOT_OWNED')
            learned = set(p['learned']) | set(p['skills']) | set(p['inherents'])
            if any(self.data.acquisition_aliases.get(x, x) not in learned for x in acq['prerequisites']):
                raise DataError('LEARNING_PREREQUISITE_NOT_MET')
            p['learned'].append(ability_id)
            if acq['inherent']:
                p['inherents'].append(ability_id)
            if acq['skill_id']:
                p['skills'][acq['skill_id']] = {'level': 1, 'xp': 0, 'template_role_id': acq['owner_role_id']}
            cards = []
            for i, definition in enumerate(acq['card_definitions'], 1):
                instance = receipt_id + ':card:' + str(i)
                p['owned_cards'][instance] = definition
                cards.append(instance)
            p['role_states'], p['required_choices'] = self.data.initial_role_states(p['roles'], p['learned'], p.get('routes'))
            return {'ability_id': ability_id, 'card_instance_ids': cards, 'inherent': acq['inherent']}
        return self._transaction(receipt_id, 'LEARN_ABILITY', {'ability_id': ability_id}, apply)

    def acquire_copy(self, definition_id, receipt_id):
        self._out_of_battle()
        ability = self.data.abilities.get(definition_id)
        if not ability or ability.get('ability_kind') != 'card' or definition_id == 'ENEMY_BURDEN' or '__COMMON_' in definition_id:
            raise DataError('NOT_A_COLLECTIBLE_CARD')
        def apply(p):
            if ability.get('owner_role_id') and ability['owner_role_id'] not in p['owned_templates']:
                raise DataError('TEMPLATE_NOT_OWNED')
            acq = ability.get('acquisition_id', ability.get('skill_id'))
            if acq and acq not in p['learned'] and acq not in p['skills']:
                raise DataError('ABILITY_NOT_LEARNED')
            instance = receipt_id + ':card:1'
            p['owned_cards'][instance] = definition_id
            return {'card_instance_ids': [instance]}
        return self._transaction(receipt_id, 'COPY_ACQUIRED', {'card_definition_id': definition_id}, apply)

    def select_loadout(self, roles=None, deck=None, routes=None):
        self._out_of_battle()
        p = deepcopy(self.profile)
        if roles is not None:
            if any(x not in p['owned_templates'] for x in roles):
                raise DataError('TEMPLATE_NOT_OWNED')
            p['roles'] = list(roles)
        if deck is not None:
            p['deck'] = list(deck)
        if routes is not None:
            p['routes'] = deepcopy(routes)
        p['role_states'], p['required_choices'] = self.data.initial_role_states(p['roles'], p['learned'], p.get('routes'))
        self.data.validate_profile(p)
        self.profile.clear()
        self.profile.update(p)
        return {'accepted': True, 'code': 'OK'}

    def begin_battle(self, battle_id=None):
        self._out_of_battle()
        self.data.validate_profile(self.profile)
        if self.profile.get('required_choices'):
            raise DataError('PREBATTLE_CHOICES_REQUIRED')
        self.profile['in_battle'] = True
        self.profile['current_battle_id'] = battle_id
        self.profile['pending_xp'] = {}
        self.profile['xp_use_keys'] = []
        self.profile['battle_skill_snapshot'] = deepcopy(self.profile['skills'])
        return deepcopy(self.profile['battle_skill_snapshot'])

    def record_use(self, skill_id, root_action_id, committed=True, technical_retry=False, automatic=False):
        if not committed or technical_retry or automatic or skill_id is None:
            return {'accepted': False, 'xp': 0, 'code': 'NO_LEGITIMATE_SKILL_USE'}
        if not self.profile.get('in_battle'):
            raise DataError('BATTLE_NOT_STARTED')
        if skill_id not in self.profile['skills']:
            raise DataError('SKILL_NOT_LEARNED')
        if not isinstance(root_action_id, str) or not root_action_id:
            raise DataError('ROOT_ACTION_ID_REQUIRED')
        key = [root_action_id, skill_id]
        if key in self.profile['xp_use_keys']:
            return {'accepted': True, 'duplicate': True, 'xp': 0, 'code': 'DUPLICATE_ROOT_SKILL_USE'}
        self.profile['xp_use_keys'].append(key)
        pending = self.profile['pending_xp']
        pending[skill_id] = pending.get(skill_id, 0) + self.data.system['growth']['xp_per_successful_use']
        return {'accepted': True, 'duplicate': False, 'xp': 10, 'code': 'OK'}

    @staticmethod
    def settle_xp(level, xp, amount, qualified=False):
        """Pure integer normal growth; level-nine unqualified XP caps at100."""
        if any(type(v) is not int for v in (level, xp, amount)) or not 1 <= level <= 10 or xp < 0 or amount < 0:
            raise DataError('INVALID_XP_RECORD')
        if xp > (100 if level == 9 and not qualified else 99) and not (level == 9 and qualified and xp == 100):
            raise DataError('INVALID_XP_RECORD')
        if level == 10:
            if xp != 0:
                raise DataError('INVALID_LEVEL10_XP')
            return {'level': 10, 'xp': 0}
        xp += amount
        while level < 9 and xp >= 100:
            level += 1
            xp -= 100
        if level == 9:
            if qualified and xp >= 100:
                return {'level': 10, 'xp': 0}
            xp = min(xp, 100)
        return {'level': level, 'xp': xp}

    def commit_xp(self, commit_id, outcome, pending=None):
        if outcome not in ('victory', 'defeat', 'retreat', 'stalemate'):
            raise DataError('INVALID_BATTLE_OUTCOME')
        amounts = deepcopy(self.profile['pending_xp'] if pending is None else pending)
        # The commit ID is bound to the exact ledger; an unchanged retry is harmless.
        old = self.profile['growth_receipts'].get(commit_id)
        if old is not None and pending is None and not self.profile.get('in_battle'):
            if old['kind'] != 'BATTLE_XP_COMMIT' or old['payload']['outcome'] != outcome:
                raise DataError('RECEIPT_REUSE_MISMATCH')
            return dict(deepcopy(old['result']), duplicate=True)
        def apply(p):
            settled = {}
            for skill_id, amount in amounts.items():
                if skill_id not in p['skills']:
                    raise DataError('SKILL_NOT_LEARNED')
                rec = p['skills'][skill_id]
                qualified = p['heart_demon_qualification'].get(rec.get('template_role_id'), False)
                change = self.settle_xp(rec['level'], rec['xp'], amount, qualified)
                rec.update(change)
                settled[skill_id] = deepcopy(change)
            p['pending_xp'] = {}
            p['in_battle'] = False
            p.pop('current_battle_id', None)
            return {'outcome': outcome, 'skills': settled}
        return self._transaction(commit_id, 'BATTLE_XP_COMMIT', {'outcome': outcome, 'pending_xp': amounts}, apply)

    end_battle = commit_xp

    def use_plus_one(self, skill_id, receipt_id):
        self._out_of_battle()
        def apply(p):
            if skill_id not in p['skills'] or skill_id not in p['learned']:
                raise DataError('SKILL_NOT_LEARNED')
            rec = p['skills'][skill_id]
            if rec['level'] >= 10:
                raise DataError('SKILL_ALREADY_LEVEL10')
            if p['plus_one_items'] < 1:
                raise DataError('NO_PLUS_ONE_ITEM')
            rec['level'] += 1
            if rec['level'] == 10:
                rec['xp'] = 0
            p['plus_one_items'] -= 1
            return {'skill_id': skill_id, 'level': rec['level'], 'xp': rec['xp'], 'items_spent': 1}
        return self._transaction(receipt_id, 'SKILL_PLUS_ONE', {'skill_id': skill_id}, apply)

    def heart_demon(self, role, receipt_id, fixed_target_victory=True):
        self._out_of_battle()
        if not fixed_target_victory:
            raise DataError('FIXED_TARGET_VICTORY_REQUIRED')
        if role not in self.data.roles:
            raise DataError('UNKNOWN_ROLE')
        def apply(p):
            if role not in p['owned_templates']:
                raise DataError('TEMPLATE_NOT_OWNED')
            p['heart_demon_qualification'][role] = True
            advanced = []
            for skill_id, record in p['skills'].items():
                if record.get('template_role_id') == role and record['level'] == 9 and record['xp'] == 100:
                    record.update(level=10, xp=0)
                    advanced.append(skill_id)
            return {'role_id': role, 'advanced_skill_ids': advanced}
        return self._transaction(receipt_id, 'HEART_DEMON_FIXED_VICTORY', {'role_id': role}, apply)


class CampaignAdapter:
    """Contract-bound receipts only, deliberately not a campaign/economy simulator."""
    def __init__(self, profile, *, initial_stamina=None):
        self.profile = profile
        self.state = profile.setdefault('campaign', {'receipts': {}, 'persistent_injuries': [], 'extreme_weakness': False, 'qualifying_rest_hours': 0})
        if initial_stamina is not None:
            if set(initial_stamina) != {'main', 'reserve'} or not 0 <= initial_stamina['main'] <= 240 or not 0 <= initial_stamina['reserve'] <= 2400:
                raise DataError('INVALID_EXTERNAL_STAMINA_CONFIGURATION')
            self.state.setdefault('stamina', deepcopy(initial_stamina))

    def _receipt(self, identifier, payload, operation):
        if not isinstance(identifier, str) or not identifier:
            raise DataError('NONEMPTY_RECEIPT_REQUIRED')
        if identifier in self.state['receipts']:
            old = self.state['receipts'][identifier]
            if old['payload'] != payload:
                raise DataError('RECEIPT_REUSE_MISMATCH')
            return dict(deepcopy(old['result']), duplicate=True)
        state = deepcopy(self.state)
        result = operation(state)
        state['receipts'][identifier] = {'payload': deepcopy(payload), 'result': deepcopy(result)}
        self.state.clear()
        self.state.update(state)
        return result

    def apply_battle_result(self, battle_input, battle_output):
        required_in = ('encounter_id', 'battle_kind', 'world_date_token', 'starting_hp', 'persistent_injuries', 'reward_policy_id', 'entry_receipt')
        required_out = ('battle_id', 'outcome', 'final_hp', 'pending_xp_commit_id', 'injury_delta', 'reward_eligibility_receipt', 'consumptions', 'objective_results', 'world_time_delta_request')
        if any(x not in battle_input for x in required_in) or any(x not in battle_output for x in required_out):
            raise DataError('INCOMPLETE_CAMPAIGN_BOUNDARY')
        if battle_input['battle_kind'] not in ('real', 'simulation', 'heart_demon', 'material'):
            raise DataError('INVALID_BATTLE_KIND')
        if battle_output['outcome'] not in ('victory', 'defeat', 'retreat', 'stalemate'):
            raise DataError('INVALID_BATTLE_OUTCOME')
        payload = {'input': deepcopy(battle_input), 'output': deepcopy(battle_output)}
        def apply(state):
            result = deepcopy(battle_output)
            simulation = battle_input['battle_kind'] == 'simulation'
            state['persistent_injuries'] = deepcopy(battle_input['persistent_injuries'])
            if simulation:
                result['world_time_delta_request'] = 0
                result['injury_delta'] = []
                if battle_output['outcome'] == 'defeat' and battle_output['final_hp'] <= 0:
                    result['final_hp'] = 1
                    state['extreme_weakness'] = True
                    state['qualifying_rest_hours'] = 0
                    state['regular_healing_open'] = False
            else:
                state['persistent_injuries'].extend(deepcopy(battle_output['injury_delta']))
            state['hp'] = result['final_hp']
            result.update(accepted=True, duplicate=False)
            return result
        return self._receipt(battle_output['battle_id'], payload, apply)

    def apply_rest_receipt(self, receipt_id, qualified_story_hours, policy_id):
        # The caller is the external qualification adapter. Wall-clock deltas are
        # not accepted, inferred, polled, or converted to qualified story hours.
        if not policy_id or type(qualified_story_hours) not in (int, float) or not math.isfinite(qualified_story_hours) or qualified_story_hours < 0:
            raise DataError('VERIFIED_QUALIFIED_REST_RECEIPT_REQUIRED')
        payload = {'qualified_story_hours': qualified_story_hours, 'policy_id': policy_id}
        def apply(state):
            if state['extreme_weakness']:
                state['qualifying_rest_hours'] += qualified_story_hours
                if state['qualifying_rest_hours'] >= 12:
                    state['hp'] = max(state.get('hp', 1), (self.profile['body_stats']['max_hp'] * 30 + 99) // 100)
                    state['regular_healing_open'] = True
                    # Residual weakness and the activity qualification policy
                    # remain outside the combat adapter's implementation claim.
            return {'accepted': True, 'duplicate': False, 'hp': state.get('hp'), 'regular_healing_open': state.get('regular_healing_open', False), 'qualified_story_hours': state['qualifying_rest_hours']}
        return self._receipt(receipt_id, payload, apply)
