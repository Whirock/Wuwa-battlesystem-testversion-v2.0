"""Independent v0.3 semantic tests, not balance or simulation evidence.

Tests using direct state fixtures deliberately isolate a rule boundary. They do
not claim those fixtures can be reconstructed from the original action log.
Replay tests below use only unmodified initial state and accepted public requests.
"""
import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
from runtime.engine import BODY, EngineFault, RuleError, snapshot_state
from runtime.live_engine import LiveEngine, choose_action


class LiveEngineIndependentTests(unittest.TestCase):
    def battle(self, encounter='LIVE_PATROL_01_ALLY', roles=None, candidate='A', **kwargs):
        engine = LiveEngine(candidate, root=BASE / 'packs' / 'builtin')
        roles = roles or ['aemeath']
        stage = kwargs.pop('stage', 'early')
        profile = engine.data.profile(stage=stage, roles=roles)
        routes = {row['role_id']: row['allowed'][0] for row in profile['required_choices']}
        engine.new_battle(encounter_id=encounter, roles=roles, stage=stage,
                          routes=routes, seed=179, battle_id='independent-live', **kwargs)
        return engine

    def end_turn(self, engine):
        request = engine._request('end_turn')
        result = engine.apply(request)
        self.assertTrue(result['accepted'], result)
        return request, result

    def damage(self, engine, source, target, amount, simultaneous=False):
        """Explicit low-level damage fixture; no player action or replay claim."""
        actor = engine._entity(source)
        origin = 'player_skill' if source == BODY else ('npc_skill' if actor['kind'] == 'npc' else 'enemy_skill')
        request = {'action_id': 'fixture-damage:' + str(len(engine.state['events'])),
                   'target_entity_ids': [target], 'choices': {}}
        engine._ctx = engine._context(None, request, actor_entity_id=source,
                                      owner_role='aemeath' if source == BODY else None,
                                      origin_kind=origin, attack=actor['attack'],
                                      ability_id='fixture-direct', simultaneous_group=simultaneous)
        engine._root_snapshot = snapshot_state(engine.state)
        engine._usage = {'modifiers': set(), 'equipment': set()}
        engine._damage(target, {'basis': 'fixed', 'fixed_amount': amount,
                               'damage_tags': ['direct'], 'element': 'neutral'},
                       {'ability_hit_count': 1, 'hit_index': 0, 'hit_mask': 'UNIVERSAL'})
        return next(event for event in reversed(engine.state['events'])
                    if event['event_type'] == 'DAMAGE_APPLIED')

    def output_modifiers(self, engine):
        """Synthetic player-owned generic modifiers, valid for the damage lane."""
        for number, lane in enumerate(['source_damage', 'equipment_damage'], 1):
            key = 'fixture-modifier:' + str(number)
            engine.state['statuses'][key] = {
                'instance_id': key, 'definition_id': key, 'target_entity_id': BODY,
                'owner_role_id': 'aemeath', 'modifier': True, 'lane': lane,
                'amount_bp': 10000 if lane == 'source_damage' else 5000,
                'damage_filter': True, 'uses': 5, 'hooks': [], 'ordinal': number,
                'origin_root_action_id': 'fixture-older-action',
                'expiry': {'round': 20, 'boundary': 'player_start'},
                'source_actor_entity_id': BODY, 'source_attack': 12,
                'source_skill_level': 1, 'ability_id': 'fixture-buff',
            }

    def test_damage_modifier_does_not_leak_to_npc_or_enemy(self):
        for source, target in [('NPC_01', 'ENEMY_01'), ('ENEMY_01', BODY)]:
            with self.subTest(source=source):
                engine = self.battle()
                self.output_modifiers(engine)
                event = self.damage(engine, source, target, 10)
                self.assertEqual(event['hp_lost'], 10)
                self.assertEqual(event['actor_entity_id'], source)
                self.assertEqual(event['source_entity_id'], source)
                self.assertEqual(event['character_ability_source'], engine._entity(source)['character_ability_source'])
        engine = self.battle()
        self.output_modifiers(engine)
        self.assertEqual(self.damage(engine, BODY, 'ENEMY_01', 10)['hp_lost'], 30,
                         'Control assertion: the fixture must actually buff player damage')

    def test_equipment_damage_bonus_does_not_leak(self):
        for source, target in [('NPC_01', 'ENEMY_01'), ('ENEMY_01', BODY), (BODY, 'ENEMY_01')]:
            with self.subTest(source=source):
                engine = self.battle()
                engine.state['equipment_effects'] = [{
                    'equipment_instance_id': 'fixture-weapon', 'effect_id': 'fixture-direct',
                    'bonus_lane': 'equipment_damage_bonus_bp', 'amount_bp': 5000,
                }]
                expected = 15 if source == BODY else 10
                self.assertEqual(self.damage(engine, source, target, 10)['hp_lost'], expected)

    def test_npc_event_cannot_proc_player_equipment(self):
        engine = self.battle()
        engine.state['equipment_effects'] = [{
            'equipment_instance_id': 'fixture-weapon', 'effect_id': 'fixture-on-hit',
            'trigger': {'event': 'DAMAGE_APPLIED', 'conditions': []},
            'resource': 'concerto', 'delta': 1, 'max_procs_per_combat': 2,
        }]
        event = self.damage(engine, 'NPC_01', 'ENEMY_01', 6)
        before = (engine.state['body']['concerto'], copy.deepcopy(engine.state['equipment_counters']))
        engine._equipment_event(event)
        self.assertEqual((engine.state['body']['concerto'], engine.state['equipment_counters']), before)

    def test_focus_ap_and_player_resources_are_independent(self):
        engine = self.battle()
        npc = engine.state['npcs']['NPC_01']
        engine.state['body']['hp'] = 50
        engine._intents()
        self.assertEqual(npc['intent']['ability_id'], 'cover')
        player_before = copy.deepcopy({k: engine.state['body'][k] for k in ['energy', 'concerto']})
        xp_before = copy.deepcopy(engine.state['pending_xp'])
        enemy_resources = copy.deepcopy({i: a['resources'] for i, a in engine.state['enemies'].items()})
        engine._execute_actor('NPC_01')
        self.assertEqual(npc['resources'], {'ap': 0, 'focus': 1})
        self.assertEqual({k: engine.state['body'][k] for k in player_before}, player_before)
        self.assertEqual(engine.state['pending_xp'], xp_before)
        self.assertEqual({i: a['resources'] for i, a in engine.state['enemies'].items()}, enemy_resources)
        engine._start_turn()
        self.assertEqual(npc['resources'], {'ap': 1, 'focus': 2})
        self.assertEqual(npc['cooldowns']['cover'], 3)
        self.assertEqual(npc['intent']['ability_id'], 'stab', 'CD=1 skips the following round')

    def test_guardian_shields_without_healing(self):
        engine = self.battle()
        engine.state['body']['hp'] = 40
        engine._intents()
        start = len(engine.state['events'])
        engine._execute_actor('NPC_01')
        self.assertEqual(engine.state['body']['hp'], 40)
        self.assertTrue(any(e['event_type'] == 'SHIELD_GRANTED' for e in engine.state['events'][start:]))
        self.assertFalse(any(e['event_type'] == 'HEAL_APPLIED' for e in engine.state['events'][start:]))
        self.assertTrue(all(a['effect'] != 'heal' for a in engine.live_content['abilities'].values()))

    def test_npc_cannot_borrow_heal_path(self):
        engine = self.battle()
        engine.state['body']['hp'] = 40
        engine._ctx = engine._context(None, {'action_id': 'fixture-heal', 'choices': {}},
                                      actor_entity_id='NPC_01', origin_kind='npc_skill', owner_role=None)
        with self.assertRaises(EngineFault):
            engine._heal(BODY, {'basis': 'fixed', 'fixed_amount': 10})
        self.assertEqual(engine.state['body']['hp'], 40)

    def test_scatter_targets_real_bodies_not_role_templates(self):
        for roles in [['aemeath'], ['aemeath', 'lynae'], ['aemeath', 'lynae', 'mornye']]:
            with self.subTest(roles=roles):
                engine = self.battle(roles=roles)
                engine.state['round'] = 2
                engine._intents()
                intent = engine.state['enemies']['ENEMY_02']['intent']
                self.assertEqual(intent['ability_id'], 'scatter')
                self.assertEqual(set(intent['locked_target_ids']), {BODY, 'NPC_01'})
                hp = {i: engine._entity(i)['hp'] for i in [BODY, 'NPC_01']}
                start = len(engine.state['events'])
                engine._execute_actor('ENEMY_02')
                events = [e for e in engine.state['events'][start:] if e['event_type'] == 'DAMAGE_APPLIED']
                self.assertEqual(len(events), 4)
                for target in [BODY, 'NPC_01']:
                    self.assertEqual(sum(e['target_entity_id'] == target for e in events), 2)
                    self.assertEqual(hp[target] - engine._entity(target)['hp'], 8)

    def test_dead_locked_target_fizzles_without_retarget(self):
        engine = self.battle()
        npc = engine.state['npcs']['NPC_01']
        npc['resources']['focus'] = 0
        engine._intents()
        self.assertEqual(npc['intent']['ability_id'], 'stab')
        self.assertEqual(npc['intent']['locked_target_ids'], ['ENEMY_02'])
        engine.state['enemies']['ENEMY_02'].update(hp=0, alive=False)
        other_hp = engine.state['enemies']['ENEMY_01']['hp']
        start = len(engine.state['events'])
        engine._execute_actor('NPC_01')
        self.assertEqual(engine.state['enemies']['ENEMY_01']['hp'], other_hp)
        self.assertEqual(npc['resources']['ap'], 0)
        self.assertEqual(npc['cooldowns']['stab'], 2)
        self.assertTrue(any(e['event_type'] == 'TARGET_UNAVAILABLE' and e['target_entity_id'] == 'ENEMY_02'
                            for e in engine.state['events'][start:]))
        self.assertFalse(any(e['event_type'] == 'DAMAGE_APPLIED' for e in engine.state['events'][start:]))

    def test_dead_guard_target_still_pays_locked_focus(self):
        engine = self.battle()
        npc = engine.state['npcs']['NPC_01']
        npc['hp'] = 20
        engine._intents()
        enemy = engine.state['enemies']['ENEMY_01']
        self.assertEqual(enemy['intent']['locked_target_ids'], ['NPC_01'])
        # A friendly target-death fixture needs a second NPC body; cloning a
        # registered actor is a semantic fixture, not an exposed spawn API.
        other = copy.deepcopy(npc)
        other.update(entity_id='NPC_02', hp=10)
        other['equipment_snapshot']['owner_body_id'] = 'NPC_02'
        engine.state['npcs']['NPC_02'] = other
        engine._intents()
        self.assertEqual(npc['intent']['ability_id'], 'cover')
        self.assertEqual(npc['intent']['locked_target_ids'], ['NPC_02'])
        other.update(hp=0, alive=False)
        engine._execute_actor('NPC_01')
        self.assertEqual(npc['resources'], {'ap': 0, 'focus': 1})
        self.assertEqual(npc['cooldowns']['cover'], 3)
        self.assertFalse(any(z.get('shield') for z in engine.state['statuses'].values()))

    def test_dead_member_of_group_is_skipped(self):
        engine = self.battle()
        engine.state['round'] = 2
        engine._intents()
        engine.state['npcs']['NPC_01'].update(hp=0, alive=False)
        start = len(engine.state['events'])
        engine._execute_actor('ENEMY_02')
        damage = [e for e in engine.state['events'][start:] if e['event_type'] == 'DAMAGE_APPLIED']
        self.assertEqual(len(damage), 2)
        self.assertEqual({e['target_entity_id'] for e in damage}, {BODY})

    def test_ordinary_ally_death_does_not_end_battle_or_act(self):
        engine = self.battle()
        engine.state['npcs']['NPC_01']['hp'] = 1
        self.damage(engine, 'ENEMY_01', 'NPC_01', 8)
        self.assertFalse(engine.state['npcs']['NPC_01']['alive'])
        self.assertIsNone(engine.state['outcome'])
        start = len(engine.state['events'])
        engine._execute_actor('NPC_01')
        self.assertEqual(len(engine.state['events']), start)

    def test_boss_threshold_changes_only_at_next_round_start(self):
        engine = self.battle('LIVE_BOSS_01')
        boss = engine.state['enemies']['ENEMY_01']
        intent = copy.deepcopy(boss['intent'])
        self.damage(engine, BODY, 'ENEMY_01', 90)
        self.assertEqual(boss['hp'], 90)
        self.assertEqual(boss['policy_state']['phase'], 1)
        self.assertEqual(boss['intent'], intent)
        self.end_turn(engine)
        self.assertEqual(boss['policy_state']['phase'], 2)
        self.assertEqual(boss['hp'], 90, 'Phase transition must not heal')
        self.assertEqual(boss['intent']['ability_id'], 'pulse')
        self.assertEqual(boss['intent']['selected_round'], 2)

    def test_boss_above_threshold_stays_in_phase_one(self):
        engine = self.battle('LIVE_BOSS_01')
        self.damage(engine, BODY, 'ENEMY_01', 89)
        self.end_turn(engine)
        self.assertEqual(engine.state['enemies']['ENEMY_01']['policy_state']['phase'], 1)

    def test_enemy_and_npc_main_actions_have_distinct_sources_and_roots(self):
        engine = self.battle()
        _, result = self.end_turn(engine)
        starts = [e for e in result['events'] if e['event_type'] == 'AUTONOMOUS_STARTED']
        self.assertEqual({e['actor_entity_id'] for e in starts}, {'NPC_01', 'ENEMY_01', 'ENEMY_02'})
        self.assertEqual(len({e['root_action_id'] for e in starts}), 3)
        for event in starts:
            actor = engine._entity(event['actor_entity_id'])
            self.assertEqual(event['origin_kind'], 'npc_skill' if actor['kind'] == 'npc' else 'enemy_skill')
            self.assertEqual(event['character_ability_source'], actor['character_ability_source'])
            self.assertNotEqual(event['root_action_id'], result['action_id'])

    def test_policy_observation_ignores_hidden_cards_and_rng(self):
        engine = self.battle()
        observation = engine.policy_observation('NPC_01')
        selection = choose_action(observation, engine.live_content['abilities'])
        engine.state['seed'] = 999999
        engine.state['rng']['fixture-hidden'] = 900
        engine.state['zones']['draw'].reverse()
        engine.state['zones']['hand'] = list(reversed(engine.state['zones']['hand']))
        self.assertEqual(engine.policy_observation('NPC_01'), observation)
        self.assertEqual(choose_action(engine.policy_observation('NPC_01'), engine.live_content['abilities']), selection)
        for forbidden in ['hand', 'cards', 'zones', 'rng', 'seed', 'profile']:
            self.assertNotIn(forbidden, observation)

    def test_duplicate_end_turn_does_not_repeat_autonomous_actions(self):
        engine = self.battle()
        request, receipt = self.end_turn(engine)
        before = copy.deepcopy(engine.state)
        duplicate = engine.apply(request)
        self.assertEqual(duplicate, receipt)
        self.assertEqual(engine.state, before)
        stale = copy.deepcopy(request)
        stale['action_id'] = 'independent-stale'
        self.assertEqual(engine.apply(stale)['code'], 'STALE_REVISION')
        self.assertEqual(engine.state['round'], before['round'])
        self.assertEqual(engine.state['events'], before['events'])

    def test_save_load_replay_from_real_requests_only(self):
        for candidate in 'ABC':
            with self.subTest(candidate=candidate):
                engine = self.battle(candidate=candidate)
                self.end_turn(engine)
                self.end_turn(engine)
                restored = LiveEngine.load(engine.serialize())
                self.assertIsInstance(restored, LiveEngine)
                self.assertEqual(restored.state, engine.state)
                self.assertEqual(restored._combat_hash(), engine._combat_hash())
                replayed = engine.replay()
                self.assertIsInstance(replayed, LiveEngine)
                self.assertEqual(replayed.state, engine.state)
                self.assertEqual(replayed._combat_hash(), engine._combat_hash())
                self.end_turn(engine)
                self.end_turn(restored)
                self.assertEqual(restored.state, engine.state)

    def test_checkpoint_rejects_engine_runtime_content_and_schema_mismatch(self):
        engine = self.battle()
        saved = json.loads(engine.serialize())
        for field in ['engine_version', 'runtime_hash', 'contract_hash', 'source_hashes',
                      'content_hash', 'actor_schema', 'encounter_schema', 'save_schema']:
            with self.subTest(field=field):
                corrupt = copy.deepcopy(saved)
                corrupt[field] = 'incompatible-independent-fixture'
                with self.assertRaises(RuleError):
                    LiveEngine.load(corrupt)
        corrupt = copy.deepcopy(saved)
        corrupt['state']['live_content_hash'] = 'different-content'
        with self.assertRaises(RuleError):
            LiveEngine.load(corrupt)

    def test_checkpoint_missing_required_actor_state_is_rejected(self):
        saved = json.loads(self.battle().serialize())
        for field in ['npcs', 'phase_cursor', 'intent_revisions']:
            with self.subTest(field=field):
                incomplete = copy.deepcopy(saved)
                del incomplete['state'][field]
                with self.assertRaises(RuleError):
                    LiveEngine.load(incomplete)
        for field in ['resources', 'cooldowns', 'intent', 'policy_state', 'equipment_snapshot']:
            with self.subTest(actor_field=field):
                incomplete = copy.deepcopy(saved)
                del incomplete['state']['npcs']['NPC_01'][field]
                with self.assertRaises(RuleError):
                    LiveEngine.load(incomplete)

    def test_dead_actor_loses_delayed_intent(self):
        engine = self.battle()
        npc = engine.state['npcs']['NPC_01']
        npc['delayed_intent'] = copy.deepcopy(npc['intent'])
        npc['delayed_intent']['delayed_once'] = True
        npc['hp'] = 1
        self.damage(engine, 'ENEMY_01', 'NPC_01', 8)
        self.assertFalse(npc['alive'])
        self.assertFalse(npc.get('delayed_intent'), 'Dead actors cannot retain a future action')

    def test_failed_end_turn_rolls_back_all_actor_and_execution_state(self):
        engine = self.battle()
        request = engine._request('end_turn')
        before = copy.deepcopy(engine.state)
        execution_before = engine._execution_snapshot()
        original_execute_actor = engine._execute_actor

        def fail_after_npc_has_acted(eid):
            if eid == 'ENEMY_01':
                raise EngineFault('INDEPENDENT_INJECTED_FAILURE')
            return original_execute_actor(eid)

        with patch.object(engine, '_execute_actor', side_effect=fail_after_npc_has_acted):
            receipt = engine.apply(request)
        self.assertFalse(receipt['accepted'])
        self.assertEqual(receipt['code'], 'ENGINE_FAULT')
        self.assertIn('INDEPENDENT_INJECTED_FAILURE', receipt['detail'])
        expected_receipts = copy.deepcopy(engine.state['receipts'])
        self.assertEqual(set(expected_receipts) - set(before['receipts']), {request['action_id']})
        after = copy.deepcopy(engine.state)
        after['receipts'] = before['receipts']
        self.assertEqual(after, before)
        self.assertEqual(engine._execution_snapshot(), execution_before)
        retry = copy.deepcopy(request)
        retry['action_id'] = 'after-injected-failure'
        self.assertTrue(engine.apply(retry)['accepted'])

    def test_preview_and_legal_query_preserve_live_state_and_context(self):
        engine = self.battle()
        request = engine._request('end_turn')
        before = copy.deepcopy(engine.state)
        execution_before = engine._execution_snapshot()
        preview = engine.preview_action(request)
        self.assertTrue(preview['receipt']['accepted'])
        self.assertEqual(preview['observation']['round'], 2)
        self.assertEqual(engine.state, before)
        self.assertEqual(engine._execution_snapshot(), execution_before)
        legal = engine.legal_actions()
        self.assertTrue(any(r['command'] == 'end_turn' for r in legal))
        self.assertEqual(engine.state, before)
        self.assertEqual(engine._execution_snapshot(), execution_before)

    def test_combat_hash_covers_actor_resources_intents_and_cursor(self):
        engine = self.battle()
        original = copy.deepcopy(engine.state)
        baseline = engine._combat_hash()
        mutations = [
            lambda s: s['npcs']['NPC_01']['resources'].__setitem__('focus', 0),
            lambda s: s['npcs']['NPC_01']['cooldowns'].__setitem__('cover', 99),
            lambda s: s['npcs']['NPC_01']['intent'].__setitem__('revision', 99),
            lambda s: s['enemies']['ENEMY_01']['intent'].__setitem__('revision', 99),
            lambda s: s.__setitem__('phase_cursor', 'NPC_01'),
            lambda s: s['intent_revisions'].append({'fixture_revision': 1}),
        ]
        for mutate in mutations:
            engine.state = copy.deepcopy(original)
            mutate(engine.state)
            self.assertNotEqual(engine._combat_hash(), baseline)


if __name__ == '__main__':
    unittest.main(verbosity=2)
