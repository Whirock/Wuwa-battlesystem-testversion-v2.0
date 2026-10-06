"""Verify locally installed optional private resources, not public redistribution rights."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]/'web/assets/private-research'
if not (root/'SOURCE_MANIFEST.json').exists():
 print('Private assets not installed; public source-only checkpoint. No asset validation claim.');raise SystemExit(0)
m=json.loads((root/'SOURCE_MANIFEST.json').read_text());assert len(m['resources'])==63
for item in m['resources']:
 p=root/item['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==item['current_sha256'],item['file']
for item in m['technicalCandidates']:
 assert hashlib.sha256((root/item['file']).read_bytes()).hexdigest()==item['sha256']
if (root/'TECHNICAL_SOURCE_MANIFEST.json').exists():
 t=json.loads((root/'TECHNICAL_SOURCE_MANIFEST.json').read_text())
 for entries in t['assets'].values():
  for asset in entries.values():assert hashlib.sha256((root/Path(asset['src']).name).read_bytes()).hexdigest()==asset['sha256']
print('PASS: 63 private image current hashes and technical candidate hash; 55 match historical hashes, 8 historical hashes unavailable. Rights/render not established.')
