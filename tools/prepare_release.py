"""Build a reproducible pure-data package and audit the explicit public file set.

Does not contact GitHub or publish. Run from the repository root.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'batch01_abc_experimental_v1'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def main():
    from sys import path
    path.insert(0, str(ROOT))
    from pack_manager import REQUIRED, SCHEMA, safe_path
    base = ROOT / 'packs/builtin'
    package = ROOT / 'combat-data/packages' / VERSION
    files = []
    for name in sorted(REQUIRED):
        safe_path(name)
        data = (base / name).read_bytes()
        target = package / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        files.append({'path': name, 'size': len(data), 'sha256': digest(data)})
    write_json(package / 'manifest.json', {'version': VERSION, 'engine_schema': SCHEMA,
        'qualification': 'experimental_unqualified', 'files': files})
    write_json(ROOT / 'combat-data/index.json', {'schema': 'wuwa-package-index-v1',
        'releases': [{'version': VERSION, 'engine_schema': SCHEMA,
                      'qualification': 'experimental_unqualified'}]})
    allowed_roots = {'runtime', 'packs', 'web', 'combat-data', 'tools', 'live-data'}
    allowed_files = {'.gitignore', '.gitattributes', 'README.md', 'TEST_STATUS.md', 'SOURCE_MANIFEST.json',
                     'API_CONTRACT.md', 'presentation.py', 'tests/test_presentation.py', 'CHANGELOG_v0_2_0.md', 'CHANGELOG_v0_2_0_zh_CN.md', 'CHANGELOG_v0_3_0.md', 'CHANGELOG_v0_3_1_zh_CN.md', 'tests/test_static_startup.py',
                     'LIVE_API_CONTRACT.md', 'LIVE_SCHEMA_FREEZE.json',
                     'tests/test_live_api.py', 'tests/test_live_engine_independent.py',
                     'tests/test_live_transactions.py', 'tests/test_live_healing_targets.py', 'app.py', 'git_updates.py', 'pack_manager.py',
                     'start.bat', 'start.sh', 'tests/test_app.py'}
    inventory = []
    for p in sorted(ROOT.rglob('*')):
        rel = p.relative_to(ROOT)
        if not p.is_file() or '__pycache__' in rel.parts or p.suffix in {'.pyc', '.pyo'}:
            continue
        if not (rel.as_posix() in allowed_files or rel.parts[0] in allowed_roots):
            continue
        if p.is_symlink():
            raise ValueError('Symlink in public tree: ' + str(rel))
        data = p.read_bytes()
        text = data.decode('utf-8')
        # The public app contains no binary assets; explicit text files only.
        for forbidden in ('/' + 'workspace/scratch/', '/' + 'root/.codex/', 'ghp_' + ''):
            if forbidden in text and rel.as_posix() != 'tools/prepare_release.py':
                raise ValueError('Private path or credential marker: ' + str(rel))
        inventory.append({'path': rel.as_posix(), 'size': len(data), 'sha256': digest(data)})
    result = {'schema': 'wuwa-public-release-inventory-v1', 'files': inventory,
              'file_count': len(inventory), 'total_bytes': sum(f['size'] for f in inventory)}
    # Output is an audit result; never include personal runtime data or QA screenshots.
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
