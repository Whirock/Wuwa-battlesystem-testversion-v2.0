"""Application-level selection and metadata tests; no combat rule changes."""
import itertools
import tempfile
import unittest
from app import Lab

class PresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.lab=Lab(user=cls.tmp.name)
    @classmethod
    def tearDownClass(cls): cls.tmp.cleanup()
    def test_every_combination_and_click_order(self):
        for candidate in 'ABC':
            roles=list(self.lab.data(candidate).roles)
            for stage in ('early','mid','late','fresh_acquisition'):
                for size in (1,2,3):
                    for selected in itertools.combinations(roles,size):
                        forward=self.lab.profile({'candidate':candidate,'stage':stage,'roles':list(selected)})
                        reverse=self.lab.profile({'candidate':candidate,'stage':stage,'roles':list(reversed(selected))})
                        self.assertEqual(forward['profile'],reverse['profile'])
                        self.assertEqual(set(forward['profile']['roles']),set(selected))
                        self.assertEqual(len(forward['role_details']),size)
    def test_reject_invalid_roles(self):
        for selected in ([],['aemeath']*2,['aemeath','lynae','mornye','denia'],['unknown'],[{}],'aemeath'):
            with self.assertRaises(ValueError):self.lab.profile({'roles':selected})
    def test_zero_attack_deck_remains_legal(self):
        for candidate in 'ABC':
            p=self.lab.profile({'candidate':candidate,'stage':'early','roles':['denia','lynae','mornye']})['profile']
            deck=[i for i,did in p['owned_cards'].items() if did=='COMMON_D'][:3]
            result=self.lab.profile({'candidate':candidate,'stage':'early','roles':['mornye','denia','lynae'],'deck':deck})
            self.assertEqual(result['profile']['deck'],deck)
    def test_guides_and_metadata_follow_candidate(self):
        cats=self.lab.catalog()['candidates']
        self.assertEqual(len({c['guide']['title'] for c in cats}),3)
        for c in cats:
            self.assertIn('正式合格 0',c['guide']['status'])
            self.assertEqual(c['guide']['source_hash'],self.lab.data(c['id']).candidate_hash)
        early=self.lab.profile({'candidate':'A','stage':'fresh_acquisition','roles':['aemeath']})
        late=self.lab.profile({'candidate':'C','stage':'late','roles':['aemeath']})
        self.assertNotEqual(early['role_details'][0]['state']['caps'],late['role_details'][0]['state']['caps'])
        self.assertEqual(late['role_details'][0]['candidate'],'C')

    def test_retention_feature_and_release_inventory(self):
        from pathlib import Path
        p=self.lab.profile({'candidate':'B','stage':'late','roles':['aemeath','lynae']})
        for r in p['role_details']:
            self.assertTrue(any('含付费保留选择' in m['features'] for m in r['mechanics']),r['id'])
        script=(Path(__file__).resolve().parents[1]/'tools/prepare_release.py').read_text()
        for path in ['presentation.py','tests/test_presentation.py','CHANGELOG_v0_2_0.md']:
            self.assertIn("'"+path+"'",script)
