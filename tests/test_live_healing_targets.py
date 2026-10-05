import ast
from pathlib import Path
import unittest
from runtime.engine import BODY,RuleError
from runtime.live_engine import LiveEngine
BASE=Path(__file__).resolve().parents[1]

class LiveHealingTargetTests(unittest.TestCase):
 def battle(self):
  e=LiveEngine('A',BASE/'packs/builtin');e.new_battle(roles=['aemeath'],encounter_id='LIVE_PATROL_01_ALLY')
  e._ctx=e._context(None,e._request('end_turn',targets=['NPC_01']),actor_entity_id=BODY,owner_role='aemeath',origin_kind='player_skill')
  return e
 def test_live_class_has_no_duplicate_method_definitions(self):
  tree=ast.parse((BASE/'runtime/live_engine.py').read_text())
  cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='LiveEngine')
  names=[n.name for n in cls.body if isinstance(n,ast.FunctionDef)]
  self.assertEqual(len(names),len(set(names)))
 def test_player_heal_uses_source_modifiers_and_real_target_hp(self):
  e=self.battle();npc=e.state['npcs']['NPC_01'];npc['hp']=10
  e.state['equipment_effects']=[]
  for i,target,amount in [(1,BODY,2000),(2,'NPC_01',3000)]:
   key=f'modifier:{i}';e.state['statuses'][key]={'instance_id':key,'definition_id':key,
    'target_entity_id':target,'owner_role_id':'aemeath','modifier':True,'lane':'healing',
    'origin_root_action_id':'older','amount_bp':amount,'damage_filter':True,'uses':1,'hooks':[],
    'ordinal':i,'expiry':{'boundary':'player_start','round':20}}
  hp=e.state['body']['hp'];e._heal('NPC_01',{'basis':'fixed','fixed_amount':10})
  self.assertEqual(npc['hp'],22);self.assertEqual(e.state['body']['hp'],hp)
  event=e.state['events'][-1];self.assertEqual(event['target_entity_id'],'NPC_01')
  self.assertEqual(event['actor_entity_id'],BODY);self.assertEqual(event['actual_heal'],12)
  e._heal('NPC_01',{'basis':'fixed','fixed_amount':1000});self.assertEqual(npc['hp'],65)
  npc.update(hp=0,alive=False);count=len(e.state['events'])
  e._heal('NPC_01',{'basis':'fixed','fixed_amount':10})
  self.assertEqual(npc['hp'],0);self.assertEqual(len(e.state['events']),count)
 def test_ally_selector_accepts_only_living_real_bodies(self):
  e=self.battle();sel={'kind':'chosen_ally_body','selector_id':'target','min':1,'max':1}
  self.assertEqual(e._targets(sel,True),['NPC_01'])
  self.assertEqual(set(e._targets({'kind':'all_allies'},True)),{BODY,'NPC_01'})
  for invalid in ['aemeath','ENEMY_01']:
   e._ctx['selected_target_entity_ids']=[invalid]
   with self.assertRaises(RuleError):e._targets(sel,True)
  e._ctx['selected_target_entity_ids']=['NPC_01'];e.state['npcs']['NPC_01'].update(hp=0,alive=False)
  with self.assertRaises(RuleError):e._targets(sel,True)
