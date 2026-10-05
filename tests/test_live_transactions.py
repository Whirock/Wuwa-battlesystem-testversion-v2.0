import copy
import unittest
from pathlib import Path
from runtime.live_engine import LiveEngine
from runtime.engine import BODY, RuleError
ROOT=Path(__file__).resolve().parents[1]/'packs/builtin'

class LiveTransactions(unittest.TestCase):
    def battle(self,encounter='LIVE_BOSS_01_ALLY'):
        e=LiveEngine('A',ROOT);e.new_battle(roles=['aemeath'],encounter_id=encounter,seed=42);return e
    def control(self,e,kind):
        r=e._request('end_turn',targets=['ENEMY_01']);e._ctx=e._context(None,r)
        e._effects([{'effect_id':'test_control','op':'intent_control','when':True,
          'target':{'kind':'chosen_enemy','selector_id':'target','min':1,'max':1},
          'args':{'kind':kind,'amount':3}}])
    def test_legal_and_preview_leave_execution_context(self):
        e=self.battle();ctx=e._execution_snapshot();h=e._combat_hash()
        actions=e.legal_actions();self.assertEqual(h,e._combat_hash());self.assertEqual(ctx,e._execution_snapshot())
        e.preview_action(next(a for a in actions if a['command']=='end_turn'))
        self.assertEqual(h,e._combat_hash());self.assertEqual(ctx,e._execution_snapshot())
    def test_transaction_fault_rolls_back_actor_action(self):
        e=self.battle();h=e._combat_hash();before=copy.deepcopy(e.state['events']);ctx=e._execution_snapshot()
        original=e._execute_actor
        def fault(eid):
            original(eid);raise RuntimeError('test fault')
        e._execute_actor=fault
        receipt=e.apply(e._request('end_turn'))
        self.assertFalse(receipt['accepted']);self.assertEqual(receipt['code'],'ENGINE_FAULT')
        self.assertEqual(h,e._combat_hash());self.assertEqual(before,e.state['events']);self.assertEqual(ctx,e._execution_snapshot())
    def test_distinct_roots_no_player_rewards(self):
        e=self.battle('LIVE_PATROL_01_ALLY');e.apply(e._request('end_turn'))
        events=[x for x in e.state['events'] if x['event_type']=='AUTONOMOUS_STARTED']
        self.assertEqual(len(events),3);self.assertEqual(len({x['root_action_id'] for x in events}),3)
        self.assertEqual(e.state['body']['concerto'],0);self.assertEqual(e.state['pending_xp'],{})
    def test_delay_once_keeps_original_target_and_cycle(self):
        e=self.battle('LIVE_ELITE_01');enemy=e.state['enemies']['ENEMY_01']
        original=copy.deepcopy(enemy['intent']);self.control(e,'delay');self.control(e,'delay')
        self.assertEqual(len(e.state['intent_revisions']),1)
        self.assertTrue(e.apply(e._request('end_turn'))['accepted'])
        enemy=e.state['enemies']['ENEMY_01'];self.assertEqual(enemy['intent']['intent_id'],original['intent_id'])
        self.assertEqual(enemy['intent']['target_entity_ids'],original['target_entity_ids'])
        self.assertEqual(enemy['policy_state']['cursor'],0)
        self.control(e,'delay');self.assertNotIn('delayed_intent',enemy)
        self.assertTrue(e.apply(e._request('end_turn'))['accepted'])
        self.assertEqual(e.state['enemies']['ENEMY_01']['policy_state']['cursor'],1)
    def test_noninterruptible_and_public_reduction(self):
        e=self.battle('LIVE_ELITE_01');self.control(e,'interrupt')
        self.assertFalse(e.state['enemies']['ENEMY_01']['intent']['cancelled'])
        e.apply(e._request('end_turn'));self.control(e,'reduce')
        intent=e.state['enemies']['ENEMY_01']['intent']
        self.assertEqual(intent['damage'],21);self.assertEqual(intent['raw_damage_per_hit'],21)
        self.assertEqual(intent['revision'],1)
    def test_state_hash_and_actor_schema_rejected(self):
        e=self.battle();save=e._checkpoint();save['state']['npcs']['NPC_01']['hp']-=1
        with self.assertRaises(RuleError):LiveEngine.load(save)
        save=e._checkpoint();save['actor_schema']='bad'
        with self.assertRaises(RuleError):LiveEngine.load(save)
    def test_same_source_qualified_event_deduplicated(self):
        e=self.battle();e.state['npcs']['NPC_01']['character_ability_source']='aemeath'
        for actor in [BODY,'NPC_01','NPC_01']:
            e._ctx=e._context(None,e._request('end_turn'),actor_entity_id=actor,
                owner_role='aemeath' if actor==BODY else None,
                origin_kind='player_skill' if actor==BODY else 'npc_skill')
            e._emit('INTERFERENCE_DAMAGE','ENEMY_01',interference_kind='shock',hp_lost=1)
        self.assertEqual(e.state['contributors']['shock'],['aemeath'])

    def test_charge_forecast_is_public_before_player_decision(self):
        e=self.battle('LIVE_BOSS_01');e.apply(e._request('end_turn'))
        i=e.public_view()['enemies']['ENEMY_01']['intent']
        self.assertEqual(i['ability_id'],'charge')
        self.assertEqual(i['public_followup']['ability_id'],'slam')
        self.assertEqual(i['public_followup']['damage'],20)
        self.assertEqual(i['public_followup']['hit_count'],1)
