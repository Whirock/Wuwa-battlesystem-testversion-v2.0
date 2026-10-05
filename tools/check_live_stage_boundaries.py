"""Nine legal initialization/one-round checks, not balance evaluation."""
import json,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(BASE))
from runtime.live_engine import LiveEngine
rows=[]
for c in 'ABC':
 for stage in ['fresh_acquisition','mid','late']:
  e=LiveEngine(c,BASE/'packs/builtin');p=e.data.profile(stage=stage,roles=['aemeath'])
  routes={x['role_id']:x['allowed'][0] for x in p['required_choices']}
  e.new_battle(stage=stage,roles=['aemeath'],routes=routes,encounter_id='LIVE_PATROL_01_ALLY',seed=91)
  legal=e.legal_actions();assert legal
  receipt=e.apply(e._request('end_turn'));assert receipt['accepted'],receipt
  assert e.replay()._combat_hash()==e._combat_hash()
  rows.append({'candidate':c,'stage':stage,'passed':True})
(BASE/'LIVE_STAGE_BOUNDARIES.json').write_text(json.dumps({'scope':'initialization_legal_actions_one_round_replay_not_balance','rows':rows},indent=2)+'\n')
print(len(rows),'stage boundary checks passed')
