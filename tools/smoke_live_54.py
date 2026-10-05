"""Bounded semantic smoke: 54 configs, 2 rounds, <=4 player actions per round.
Not a win-rate or balance simulation. Run only after unit semantics pass.
"""
import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runtime.live_engine import LiveEngine
from runtime.data import Data
BASE=Path(__file__).resolve().parents[1]
rows=[];start=time.monotonic()
for candidate in 'ABC':
    data=Data(candidate,BASE/'packs/builtin')
    for count in (1,2,3):
        profile=next(p for p in data.profiles if p['stage']=='early' and len(p['roles'])==count)
        for encounter in ['LIVE_PATROL_01','LIVE_ELITE_01','LIVE_BOSS_01']:
            for ally in (False,True):
                eid=encounter+('_ALLY' if ally else '')
                engine=LiveEngine(candidate,data=data)
                preview=data.profile(profile_id=profile['id'])
                routes={row['role_id']:row['allowed'][0] for row in preview['required_choices']}
                engine.new_battle(profile_id=profile['id'],routes=routes,encounter_id=eid,seed=307,battle_id=f'smoke_{len(rows)}')
                actions=0
                for _ in range(2):
                    for _ in range(4):
                        if engine.state['outcome']:break
                        legal=engine.legal_actions()
                        choices=[r for r in legal if r['command'] not in ['end_turn','retreat']]
                        if not choices:break
                        receipt=engine.apply(choices[0]);assert receipt['accepted'],receipt;actions+=1
                    if engine.state['outcome']:break
                    receipt=engine.apply(engine._request('end_turn'));assert receipt['accepted'],receipt;actions+=1
                checkpoint=engine.serialize();restored=LiveEngine.load(checkpoint)
                assert restored._combat_hash()==engine._combat_hash()
                assert restored.replay()._combat_hash()==engine._combat_hash()
                rows.append(dict(candidate=candidate,templates=count,encounter=eid,actions=actions,
                                 round=engine.state['round'],outcome=engine.state['outcome'],passed=True))
                print(len(rows),candidate,count,eid,flush=True)
result={'kind':'bounded_semantic_smoke_not_balance','count':len(rows),'seconds':round(time.monotonic()-start,2),'rows':rows}
(BASE/'LIVE_SMOKE_54.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
assert len(rows)==54
