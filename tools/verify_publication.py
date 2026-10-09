"""Verify a clean public source snapshot before running tests that rewrite evidence."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent.parent
checked = 0
errors = []
for line in (root / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    expected, relative = line.split('  ', 1)
    target = root / relative
    if not target.is_file():
        errors.append(f'Missing: {relative}')
        continue
    if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        errors.append(f'Hash mismatch: {relative}')
    checked += 1
manifest = json.loads((root / 'tests/build_manifest.json').read_text(encoding='utf-8'))
pngs = sorted((root / 'assets').glob('*.png'))
if len(pngs) != 89:
    errors.append(f'Expected 89 runtime PNG files, found {len(pngs)}')
for entry in manifest['core'] + manifest['assets']:
    target = root / entry['path']
    if not target.is_file() or target.stat().st_size != entry['size']:
        errors.append(f'Size/missing: {entry["path"]}')
    elif hashlib.sha256(target.read_bytes()).hexdigest() != entry['sha256']:
        errors.append(f'Manifest mismatch: {entry["path"]}')
print(json.dumps({'passed': not errors, 'checked_files': checked,
                  'runtime_pngs': len(pngs), 'errors': errors}, ensure_ascii=False, indent=2))
sys.exit(bool(errors))
