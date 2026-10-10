"""Generate user-readable current rules and a traceable difference list. No external services."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent.parent
p=json.loads((ROOT/'parameters.json').read_text());old=json.loads((ROOT/'history/v0.1_parameters.json').read_text())
L={'sync':'同步率','resonance':'谐振','color':'流彩','calibration':'校准','expectation':'期待','thread':'丝线','primary':'主要资源','dust':'尘微之声','umbra':'暗流','wind':'弦风息','surge':'电涌','energy':'共鸣能量'}
def pool(x):return '、'.join(L.get(k,k)+' '+str(v) for k,v in x.items()) or '无'
rows=['鸣潮AP遭遇演算 v0.3 当前执行规则与变更表','参数版本：'+p['schema_version'],'本文件从随包 parameters.json 生成。旧v0.1r2文稿属于历史，不代表本次全部当前规则。','']
rows+=['一、难度（开场选择，新遭遇生效）']
for key,d in p.get('difficulties',{}).items():rows += [f"{d['name']} / {key}",d['description'],f"敌生命倍率 {d.get('hp_multiplier')}；攻击倍率 {d.get('attack_multiplier')}；共振偏移 {d.get('shield_offset')}；目标策略 {d.get('targeting')}",'']
rows+=['二、与v0.1r2的参数变化（参考等级一致）']
for section in ['characters','enemies']:
 for key,u in p[section].items():
  previous=old[section].get(key,{});changes=[f'{f}: {previous.get(f)} → {u.get(f)}' for f in ['hp','atk','def','speed','shield','phase2_shield','phase2_attack_multiplier'] if previous.get(f)!=u.get(f)]
  if changes:rows.append(u['name']+'：'+'；'.join(changes))
  for k,s in u.get('skills',{}).items():
   prev=previous.get('skills',{}).get(k,{})
   diff=[f'{f}: {prev.get(f)} → {s.get(f)}' for f in ['coef','break_points','concerto','cost','gain','effect','applies_mode','barrier','heal_scale','heal_flat','team_heal_scale','team_heal_flat'] if prev.get(f)!=s.get(f)]
   if diff:rows.append('  '+s['name']+'：'+'；'.join(diff))
rows+=['','三、我方当前行动说明']
for key,u in p['characters'].items():
 rows+=['',u['name']+' / '+key]
 for k,s in u['skills'].items():
  rows.append(f"  {s['name']} [{k}]：{s.get('effectSummary') or s.get('description') or ''}")
  rows.append(f"    AP{s.get('ap_cost',0)} / 倍率{s.get('coef',0)} / 削共振{s.get('break_points',0)} / 消耗{pool(s.get('cost',{}))} / 获取{pool(s.get('gain',{}))} / 协奏{s.get('concerto',0)}")
  if s.get('form_overrides'):rows.append('    形态覆盖：'+json.dumps(s['form_overrides'],ensure_ascii=False))
rows+=['','漂泊者四属性配置（同一角色，不重复编队）']
for mode,kit in p['characters'].get('rover',{}).get('mode_kits',{}).items():
 rows.append(mode+' / '+pool(kit['resources']))
 for key,s in kit['skills'].items():rows.append('  '+s['name']+'：'+s['effectSummary'])
rows+=['','四、通用指令、交涉与有限测试道具']
for k,s in p['generic_skills'].items():rows.append(f"{s['name']} [{k}]：{s.get('effectSummary') or s.get('description') or ''}"+(' 当前实现另有成本：该敌下一次实际造成伤害的单体攻击伤害+15%，攻击后消耗；全体攻击不加此项、不消费。最长至施放后第2轮末；施放者倒地/撤离清除。' if k=='taunt' else ''))
rows+=['测试库存：'+json.dumps(p.get('test_inventory',{}),ensure_ascii=False),'道具不属于持久经济或商店，不会复活；每次遭遇按规则重置库存。','']
rows+=['五、敌人行动与预警 / 可执行对策']
for key,u in p['enemies'].items():
 rows+=['',u['name']+' / '+u['rank']]
 for k,s in u['skills'].items():
  rows.append(f"  {s['name']} [{k}]：{s.get('effectSummary') or s.get('description') or ''}")
  for field,label in [('telegraphText','预警'),('counterplayText','对策'),('costText','行动成本'),('durationText','持续'),('cooldownText','间隔')]:
   if s.get(field):rows.append('    '+label+'：'+s[field])
 for diff,pattern in u.get('difficulty_patterns',{'standard':u['pattern']}).items():rows.append('  '+diff+'轮转：'+' → '.join(u['skills'][s]['name'] for s in pattern))
rows+=['','六、规则数据的新增/修改字段']
for k,v in p['rules'].items():
 if old['rules'].get(k)!=v:rows.append(k+'：'+str(old['rules'].get(k,'（旧版无）'))+' → '+str(v))
rows+=['','说明：不把新增候选平衡称为已最终确认。实际伤害由引擎当前状态、抗性、共振跳窗、减伤与延奏通道共同结算。默认不会自动消耗满协奏；只能由当前行动者在付费动作后选择接收者，并结束本人窗口。','当前JSON及单元/DOM测试证据随包，真实浏览器视觉/音频/Windows启动的验证状态另见测试报告。']
(ROOT/'当前执行规则与变更表.txt').write_text('\n'.join(rows)+'\n')
print(ROOT/'当前执行规则与变更表.txt')
