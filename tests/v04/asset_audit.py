"""Audit decoded runtime images and all mapped action/state paths. No rendered QA claim."""
from pathlib import Path
import json, hashlib, subprocess
from PIL import Image
root=Path(__file__).resolve().parents[2]
data=json.loads(subprocess.check_output(['node','-e',"const fs=require('fs'),vm=require('vm'),c={window:{}};vm.runInNewContext(fs.readFileSync('assets.js','utf8'),c);console.log(JSON.stringify(c.window.DEFAULT_ASSETS))"],cwd=root,text=True))
errors=[];rows=[];used=set()
for k,s in data['slots'].items():
    src=s.get('src')
    if not src: continue
    p=root/src
    if not src.startswith('assets/') or '..' in Path(src).parts or not p.is_file():errors.append('Invalid slot '+k);continue
    used.add(src)
    try:
        with Image.open(p) as im:
            im.load()
            if im.format!='PNG':raise ValueError('not PNG')
            rows.append({'slot':k,'path':src,'dimensions':list(im.size),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    except Exception as e:errors.append(k+': '+str(e))
pngs={str(p.relative_to(root)) for p in (root/'assets').glob('*.png')}
if pngs-used:errors.append('Unmapped PNG: '+str(sorted(pngs-used)))
old=json.loads(subprocess.check_output(['git','show','v3.0.0-test.3:assets/manifest.json'],cwd=root,text=True)) if (root/'.git').exists() else None
preserved=0
if old:
    for k,s in old['slots'].items():
        if not s.get('src'):continue
        b=subprocess.check_output(['git','show','v3.0.0-test.3:'+s['src']],cwd=root)
        if (root/s['src']).read_bytes()!=b:errors.append('Changed historical PNG '+s['src'])
        preserved+=1
out={'suite':'test4-decoded-assets','passed':not errors,'runtime_png_count':len(pngs),'mapped_slots':len(rows),'historical_byte_comparison':preserved,'errors':errors,'assets':rows,'limits':['PNG decode and path checks only; pose/raster layout requires rendered QA.']}
print(json.dumps(out,ensure_ascii=False,indent=2));raise SystemExit(bool(errors))
