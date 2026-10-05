from pathlib import Path
p=Path(__file__).parent/'reconstructed_dev/web/assets/app.js'
s=p.read_text();start=s.index('function battlefieldHtml(v)');end=s.index('function contributorPanel',start)
s=s[:start]+'''function battlefieldHtml(v){return VisualUI.battlefield(battle,{esc,name,entityName,liveName,liveIntentHtml,intentText,encounterRules});}\n'''+s[end:]
s=s.replace("wireDescriptions();$('#restore-battle')","VisualUI.mount(battle);wireDescriptions();$('#restore-battle')")
s=s.replace('${abilityPanel(a)}${ruleDetails(a)}</article>`;}).join(\'\')||\'<p class="empty">手牌为空','<details class="card-reading"><summary>完整效果与分支</summary>${abilityPanel(a)}${ruleDetails(a)}</details></article>`;}).join(\'\')||\'<p class="empty">手牌为空')
s=s.replace('<span class="hint">费用与完整本次行动见下方分支预览</span>','<span class="card-preview">${esc(effectText(a))}</span>')
s=s.replace('<h2>出战预览</h2>','<h2>03 · 核验并开战</h2>').replace('01 · 自由选择角色','01 · 选择 1–3 个模板').replace('02 · 收藏与自由组牌','02 · 自由组牌')
s=s.replace('<span class="sigil" aria-hidden="true">${esc((r.name||name(r.id)).slice(0,1))}</span>','${VisualUI.portrait(r.id,r.name||name(r.id))}')
s=s.replace("document.querySelectorAll('[name=\"role\"]').forEach", "document.querySelectorAll('.role-portrait,.element-icon').forEach(img=>img.onerror=()=>img.hidden=true);document.querySelectorAll('[name=\"role\"]').forEach")
s=s.replace("function renderRoleIntroductions(){$('#role-introductions').innerHTML=roleDetails.map(r=>`<article class=\"role-intro\"><h3>","function renderRoleIntroductions(){$('#role-introductions').innerHTML=roleDetails.map(r=>`<details class=\"role-intro\"><summary>本项目定位与机制 · ${esc(r.name)}</summary>${VisualUI.gameTags(r.id)}<h3>")
s=s.replace("</p>`).join('')}</details></article>`).join('');}", "</p>`).join('')}</details></details>`).join('');}")
s=s.replace('renderRoleIntroductions();renderCollection();',"renderRoleIntroductions();document.querySelectorAll('.role-tag-icon').forEach(img=>img.onerror=()=>img.hidden=true);renderCollection();")
s=s.replace('<section class="panel"><h2>身体与角色私池</h2>','<section class="panel"><details><summary>身体状态与完整私池记录</summary>')
s=s.replace("}`).join('')}</section><section class=\"panel\"><h2>部署与状态", "}`).join('')}</details></section><section class=\"panel\"><h2>部署与状态")
s=s.replace("$('#close-dialog').onclick=()=>dialog.close();", "$('#close-dialog').onclick=()=>{VisualUI.highlight();dialog.close();};dialog.onclose=()=>VisualUI.highlight();")
s=s.replace("document.querySelectorAll('[data-request]').forEach(el=>el.onclick=()=>commit(requests[Number(el.dataset.request)]));","document.querySelectorAll('[data-request]').forEach(el=>{const r=requests[Number(el.dataset.request)];el.onclick=()=>commit(r);el.onfocus=el.onmouseenter=()=>VisualUI.highlight(r.target_entity_ids||[]);});")
s=s.replace('function combinedCost(a,b){return `基础：',"function combinedCost(a,b){const base=a.cost?.energy??0,extra=b?.cost?.energy??0;const total=typeof base==='number'&&typeof extra==='number'?`合计能量 ${base+extra}；`:'';return `${total}基础：")
p.write_text(s)
p=p.parent.parent/'index.html';s=p.read_text().replace('<script type="module"','<script src="/assets/visual-ui.js"></script>\n<script type="module"').replace('本地试玩 · ENGINE v4','UI 0.4 重建预览 · 规则基线 0.3.1');p.write_text(s)
root=p.parent.parent
for p in (root/'web/tests').glob('*.cjs'):
 s=p.read_text().replace('vm.createContext(sandbox);',"vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/visual-ui.js'),'utf8'),sandbox);")
 s=s.replace("'基础：能量 1；分支追加：能量 2'","'合计能量 3；基础：能量 1；分支追加：能量 2'")
 s=s.replace("assert(!get('#app').innerHTML.includes('style='))","assert(!/\\sstyle=/.test(get('#app').innerHTML))")
 s=s.replace("length,0,'player has one shared resource strip, no template body duplication'","length,1,'player has one real body, no template body duplication'")
 p.write_text(s)
