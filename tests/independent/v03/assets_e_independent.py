#!/usr/bin/env python3
"""Independent runtime-art audit; pixel properties do not certify visual QA."""
import json,hashlib,os,sys
from pathlib import Path
from PIL import Image
ROOT=Path(os.environ.get('QA_ROOT',os.getcwd()))
OUT=Path(os.environ.get('QA_OUT',Path(__file__).parent))
BASE=Path(os.environ.get('QA_BASELINE',Path(__file__).parent/'baseline-assets.json'))
manifest=json.loads((ROOT/'assets/manifest.json').read_text())
checks=[]
def check(name,ok,detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
hashes={f:sha(ROOT/f) for f in ['assets.js','assets/manifest.json']}
base=json.loads(BASE.read_text())
for f,h in base.items():check('preserve '+f,(ROOT/f).exists() and sha(ROOT/f)==h)
slots=manifest['slots'];new=[]
for k,s in slots.items():
 if s.get('needsRevision') or s.get('assetStatus')=='needs_revision' or 'user_rejected' in str(s.get('artReview','')):
  check('user rejected artwork '+k,False,s.get('reviewNote','Explicitly rejected; must be revised before art acceptance'))
 if not s.get('src'):
  check('asset exists '+k,False,'pending / no PNG');continue
 p=ROOT/s['src'];check('asset exists '+k,p.is_file(),s['src'])
 if not p.is_file():continue
 with Image.open(p) as im:
  check('asset dimensions '+k,tuple(im.size)==(s['width'],s['height']),list(im.size))
  check('asset hash '+k,sha(p)==s.get('sha256'),sha(p))
  if s['src'] not in base:
   alpha=im.convert('RGBA').getchannel('A');values=sorted(set(alpha.getdata()));bbox=alpha.getbbox()
   check('new asset binary alpha '+k,values==[0,255],values)
   check('new asset nonempty alpha '+k,bbox is not None,bbox)
   new.append({'slot':k,'src':s['src'],'hash':sha(p),'bbox':bbox,'size':im.size})

def walk(mapping,parent):
 for k,v in mapping.items():
  if isinstance(v,str):check('mapping '+parent+'.'+k,v in slots,v)
  elif isinstance(v,list):
   for i,x in enumerate(v):check('sequence '+parent+'.'+k+'.'+str(i),x in slots,x)
for entity,forms in manifest['forms'].items():
 for form,body in forms.items():
  walk(body.get('actions',{}),f'{entity}.{form}')
  walk(body.get('sequences',{}),f'{entity}.{form}.sequences')
for enemy,body in manifest['enemies'].items():walk(body.get('actions',{}),enemy)
for entity in ['glacio_prism','fusion_prism','aero_prism','spectro_prism','havoc_prism']:
 check('prism enemy included '+entity,entity in manifest['enemies'])
byhash={}
for n in new:byhash.setdefault(n['hash'],[]).append(n['slot'])
rover=[n for n in new if n['slot'].startswith('rover.')]
check('rover new nonidle action assets exist',len(rover)>4,{'count':len(rover)})
check('new assets are not byte-duplicate renamed files',all(len(v)==1 for v in byhash.values()),[v for v in byhash.values() if len(v)>1])
result={'hashes':hashes,'unchanged':all(sha(ROOT/f)==h for f,h in hashes.items()),'class':'Independent file/hash/mapping/alpha audit. No browser rendering, original illustration accuracy or final art approval implied.','baseline_png_count':len(base),'runtime_slot_count':len(slots),'pending_slot_count':sum(not s.get('src') for s in slots.values()),'needs_revision_slots':[k for k,s in slots.items() if s.get('needsRevision') or s.get('assetStatus')=='needs_revision' or 'user_rejected' in str(s.get('artReview',''))],'new_png_count':len(new),'new_rover_slots':len(rover),'checks':checks,'passed':sum(x['pass'] for x in checks),'failed':sum(not x['pass'] for x in checks),'new_assets':new}
(OUT/'assets_e_independent_results.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
print(json.dumps({k:result[k] for k in ['baseline_png_count','runtime_slot_count','new_png_count','new_rover_slots','passed','failed']},indent=2));print(json.dumps([x for x in checks if not x['pass']],indent=2,ensure_ascii=False));sys.exit(bool(result['failed']) or not result['unchanged'])
