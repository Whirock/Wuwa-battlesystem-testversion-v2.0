"""Freeze current local runtime manifests after ALL edits and validation have ended.
This does not upload, commit, publish or certify any unrun verification stage.
"""
from pathlib import Path
import hashlib, json, subprocess, datetime, struct
ROOT=Path(__file__).resolve().parent.parent
CORE=['index.html','app.js','engine.js','parameters.js','assets.js','storage.js','style.css','release-notes.js']
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def info(relative):
 p=ROOT/relative
 return {'path':relative,'size':p.stat().st_size,'sha256':digest(p)}
def write(relative,obj): (ROOT/relative).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Evaluate only the package-local data declaration, using the same source as the app.
code="const fs=require('node:fs'),vm=require('node:vm');const ctx={window:{}};vm.runInNewContext(fs.readFileSync('assets.js','utf8'),ctx,{timeout:5000});process.stdout.write(JSON.stringify(ctx.window.DEFAULT_ASSETS));"
manifest=json.loads(subprocess.check_output(['node','-e',code],cwd=ROOT,text=True))
slots=manifest['slots'];rows=[];pending=[];used=set()
for key,slot in slots.items():
 src=slot.get('src')
 if not src:
  pending.append({'slot':key,'label':slot.get('label'),'state':'pending; not a delivered PNG'})
  continue
 if not src.startswith('assets/') or '..' in Path(src).parts or Path(src).is_absolute():raise ValueError('Non-package asset path: '+str(src))
 file=ROOT/src
 if not file.is_file():raise FileNotFoundError(src)
 data=file.read_bytes()
 if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Not PNG: '+src)
 width,height=struct.unpack('>II',data[16:24]);used.add(src)
 rows.append({'slot':key,'role':'offline_runtime_copy',**info(src),'width':width,'height':height})
pngs={str(p.relative_to(ROOT)) for p in (ROOT/'assets').glob('*.png')}
if pngs-used:raise ValueError('Runtime PNGs not mapped in assets.js: '+','.join(sorted(pngs-used)))
# Preserve verified bytes when the existing manifest already matches the runtime data.
existing_manifest=ROOT/'assets/manifest.json'
if not existing_manifest.exists() or json.loads(existing_manifest.read_text(encoding='utf-8')) != manifest:
 write('assets/manifest.json',manifest)
write('RUNTIME_ASSETS.json',{'public_version':'0.3.0-candidate','scope':'Actual mapped runtime PNGs; empty slots are pending, not claimed complete.','runtime_png_count':len(used),'mapped_slot_count':len(rows),'pending_slot_count':len(pending),'contains_master_or_3x_archives':False,'provenance_note':'Only public package-local paths, dimensions and hashes. Source models, reference renders and private research are excluded.','assets':rows,'pending_slots':pending})
write('tests/build_manifest.json',{'version':'0.3.0-candidate','scope':'Current frozen local runtime; checksums do not certify gameplay or visuals.','runtime_png_count':len(used),'core':[info(p) for p in CORE],'parameter_json':info('parameters.json'),'assets':[info(p) for p in sorted(used)]})
v=json.loads((ROOT/'VERSION.json').read_text());v['core_hashes']={f:digest(ROOT/f) for f in CORE};v['parameter_json_sha256']=digest(ROOT/'parameters.json');v['runtime_png_count']=len(used);v['pending_art_slot_count']=len(pending);v['manifest_generated_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();write('VERSION.json',v)
# Public source distribution only: exclude generated dependencies, Git data, huge
# fixtures, source archives and lockfiles tied to package-install execution.
roots=[ROOT/'assets',ROOT/'docs',ROOT/'tests',ROOT/'tools']
allowed=[p for p in ROOT.iterdir() if p.is_file() and p.name not in {'SHA256SUMS.txt','.gitignore','.gitattributes'} and p.suffix.lower() in {'.js','.css','.html','.json','.md','.txt','.cmd'}]
for d in roots:
 for p in d.rglob('*'):
  if not p.is_file() or any(x in p.parts for x in ['node_modules','__pycache__','.git','fixtures']):continue
  if p.suffix.lower() in {'.png','.json','.js','.cjs','.py','.md','.txt','.lock'}:allowed.append(p)
lines=[digest(p)+'  '+str(p.relative_to(ROOT)) for p in sorted(set(allowed))]
(ROOT/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n')
print(json.dumps({'runtime_pngs':len(used),'pending_slots':len(pending),'checksummed_files':len(lines)},ensure_ascii=False))
