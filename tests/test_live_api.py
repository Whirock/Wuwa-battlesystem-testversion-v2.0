import copy
import tempfile
import unittest
from app import Lab

class LiveApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.lab=Lab(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def test_live_roundtrip_and_legacy_isolation(self):
        b=self.lab.create({'candidate':'A','roles':['aemeath'],'encounter_id':'LIVE_PATROL_01_ALLY'})
        self.assertEqual(b['view']['engine_version'],'shared-runtime-2.0')
        self.assertEqual(len(b['view']['npcs']),1)
        req=next(r for r in b['legal'] if r['command']=='end_turn')
        b=self.lab.apply(b['id'],req);self.assertTrue(b['receipt']['accepted'])
        again=self.lab.apply(b['id'],req);self.assertEqual(b['view'],again['view'])
        save=self.lab.export(b['id'],'save')
        self.assertEqual(save['format'],'wuwa-lab-private-save-v2')
        restored=self.lab.restore({'save':save});self.assertEqual(b['view'],restored['view'])
        forged=copy.deepcopy(save);forged['format']='wuwa-lab-private-save-v1'
        with self.assertRaises(Exception):self.lab.restore({'save':forged})
        legacy=self.lab.create({'candidate':'A','roles':['aemeath'],'enemy_id':'T1_SINGLE'})
        self.assertNotIn('npcs',legacy['view'])
        old=self.lab.export(legacy['id'],'save');self.assertEqual(old['format'],'wuwa-lab-private-save-v1')
        self.assertEqual(self.lab.restore({'save':old})['view'],legacy['view'])
    def test_reject_mixed_and_unknown_configuration(self):
        for config in [{'encounter_id':'LIVE_PATROL_01','enemy_id':'T1'},
                       {'encounter_id':'T1_SINGLE'},
                       {'encounter_id':'LIVE_PATROL_01','actors':[]},
                       {'encounter_id':'LIVE_PATROL_01','ally_variant_id':'hacked'}]:
            with self.assertRaises(Exception):self.lab.create(config)
    def test_catalog_contract(self):
        c=self.lab.catalog();self.assertEqual(len(c['live_content']['actors']),5)
        self.assertEqual(len(c['live_content']['encounters']),6)
        self.assertEqual(c['live_gui_status'],'integrated_experimental')

    def test_v02_profile_metadata_and_live_definition_pinning(self):
        c=self.lab.catalog();self.assertEqual(c['app_version'],'0.3.0')
        self.assertTrue(c['candidates'][0]['guide']);self.assertIn('statuses',c['candidates'][0]['rule_definitions'])
        roles=['lynae','aemeath']
        p=self.lab.profile({'candidate':'A','stage':'early','roles':roles})
        self.assertEqual(set(p['profile']['roles']),set(roles));self.assertEqual(len(p['role_details']),2)
        b=self.lab.create({'candidate':'A','stage':'early','roles':roles,'encounter_id':'LIVE_PATROL_01_ALLY'})
        self.assertEqual(b['live_definitions']['content_hash'],b['view']['content_hash'])
        self.assertEqual(b['live_definitions']['encounter'],b['view']['encounter'])
        self.assertIn('LIVE_COVER',b['rule_definitions']['statuses'])
        b['live_definitions']['abilities']['stab']['damage']=999
        self.assertEqual(self.lab.snapshot(b['id'])['live_definitions']['abilities']['stab']['damage'],6)
        with self.assertRaises(ValueError):self.lab.profile({'candidate':'A','roles':['aemeath','aemeath']})
