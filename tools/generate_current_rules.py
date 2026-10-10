"""Generate current public combat reference from shipped runtime data only."""
from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
p=json.loads((root/'parameters.json').read_text())
rows=['鸣潮回合制 3.0 · test.4 当前执行规则与变更表','参数版本：'+p['schema_version'],'此表由随包运行参数生成；候选改编数值，不是官方参数。','',
'每人每轮一次正常行动；等待同轮延后一次。开场HP/SP满，BP1，能量0。BP上限5，花0–3BP；花点后下一轮不自然补点。SP不自动恢复。',
'普通攻击1–4次真实攻击。本体追加每击40%，合格外部效果按真实攻击条件执行，协同不递归。',
'基础能量每根仅发一次：本人B×ER，其他存活队友B×0.5×接收者ER。锁能不阻止向外共享。',
'共振：精英72，无冠112，无妄156；投射物反弹54.6，无妄严格低于78中断特殊蓄能。普通敌没有共振条。',
'爱弥斯/达妮娅R1满能后保留R2并锁能，R2正常行动且总耗3BP，无二次满能门槛。',
'实现澄清：琳奈E5仅下一次R/R1/R2；无冠束缚只压制下一反击；连景按真实本体属性基数并受既定上限。','', '九配置 / 六十一主动卡']
for key,c in p['characters'].items():
 rows.extend(['',c['name']+' / '+key+' / 个人能量上限 '+str(c['energy_cap'])])
 for sid,s in c['skills'].items():
  a=s['numeric_audit'];rows.append(f"{sid} {s['name']}：SP {a['sp']} / CD {a['cd']} / B {a['base_energy']} / 能量耗 {a['energy_cost']}；完整分支与BP四档请查看游戏卡面。")
rows.extend(['','升级兼容：只迁移明确支持的本地素材与设置。旧AP战局拒绝续接，新库与旧版分离。','验证：参见测试报告.txt、docs/test4-independent-qa.md、tests/v04/results。旧版报告不作为本版证据。'])
(root/'当前执行规则与变更表.txt').write_text('\n'.join(rows)+'\n')
