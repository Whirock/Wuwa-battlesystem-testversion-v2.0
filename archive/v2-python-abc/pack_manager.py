"""Versioned pure-data packages. Network fetching intentionally disabled until configured."""
import hashlib, json, os, re, shutil, tempfile
from pathlib import Path, PurePosixPath
from runtime.data import Data
SCHEMA = 'wuwa-data-v1'
MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 24 * 1024 * 1024
REQUIRED = {'system_contract/' + n for n in ['SYSTEM_CONTRACT.json','COMMON_EFFECT_DSL.json','INTERFACE_COMPATIBILITY_CLOSURE.json','SPATIAL_TAGS_ADDENDUM.json','CORE_BENCHMARK_LOADOUT.json','parts/equipment_profiles.json']} | {'batch_01/'+c+'/CANDIDATE.json' for c in 'ABC'}

def safe_path(name):
    p = PurePosixPath(name)
    if not isinstance(name,str) or '\\' in name or ':' in name or p.is_absolute() or any(x in ('..','.') for x in name.split('/')) or not name or str(p)!=name:
        raise ValueError('Unsafe package path')
    if name not in REQUIRED and not (name.startswith('assets/') and p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.txt','.json'}):
        raise ValueError('Unsupported package file')
    return p

class PackManager:
    def __init__(self, base, user):
        self.base, self.user = Path(base), Path(user)
        self.storage = self.user/'packs'; self.storage.mkdir(parents=True,exist_ok=True)
        self.active = 'builtin'
        pointer = self.user/'active_pack.json'
        if pointer.exists(): self.active = json.loads(pointer.read_text(encoding="utf-8"))['version']; self.path(self.active)
    def path(self, version):
        if not isinstance(version,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',version): raise ValueError('Invalid version')
        p = self.base/'packs/builtin' if version=='builtin' else self.storage/version
        if not p.is_dir() or p.is_symlink(): raise ValueError('Unknown package version')
        return p
    def status(self):
        return {'configured':False,'enabled':False,'reason':'尚未配置用户 Git 仓库；网络更新已禁用。仅支持本地纯数据包验证。','active_version':self.active,'versions':['builtin']+sorted(p.name for p in self.storage.iterdir() if p.is_dir() and not p.name.startswith('.')),'engine_schema':SCHEMA}
    def activate(self, version):
        root=self.path(version)
        for c in 'ABC': Data(c,root).compile_registry()
        temp=self.user/'active_pack.tmp';temp.write_text(json.dumps({'version':version}),encoding='utf-8');os.replace(temp,self.user/'active_pack.json');self.active=version
        return self.status()
    def install_local(self, source):
        """Trusted local CLI entrypoint, never exposed as arbitrary-path HTTP API."""
        source=Path(source)
        manifest_path=source/'manifest.json'
        if manifest_path.is_symlink() or manifest_path.stat().st_size > 128*1024: raise ValueError('Invalid manifest')
        manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
        version=manifest['version']
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',version) or version=='builtin': raise ValueError('Invalid version')
        if manifest.get('engine_schema')!=SCHEMA: raise ValueError('Incompatible engine schema')
        if manifest.get('qualification')!='experimental_unqualified': raise ValueError('Only experimental unqualified data accepted')
        rows=manifest['files']
        if not isinstance(rows,list) or len(rows)>256:raise ValueError('Invalid file list')
        names=[r['path'] for r in rows]
        if len(names)!=len(set(names)) or not REQUIRED.issubset(names):raise ValueError('Missing or duplicate files')
        total=0
        staging=Path(tempfile.mkdtemp(prefix='.staging-',dir=self.storage))
        try:
            for row in rows:
                name=row['path'];safe_path(name);size=row['size'];total+=size
                if type(size)!=int or size<0 or size>MAX_FILE or total>MAX_TOTAL:raise ValueError('Package size limit')
                p=source/name
                if any(x.is_symlink() for x in [p,*p.parents] if x!=source.parent):raise ValueError('Symlinks forbidden')
                if not p.is_file() or p.stat().st_size!=size:raise ValueError('Size mismatch')
                data=p.read_bytes()
                if hashlib.sha256(data).hexdigest()!=row['sha256']:raise ValueError('Hash mismatch')
                out=staging/name;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
            # Prevent untrusted data from redirecting Data's normative appendix read.
            system=json.loads((staging/'system_contract/SYSTEM_CONTRACT.json').read_text(encoding='utf-8'))
            if system['equipment']['appendix']!='parts/equipment_profiles.json':raise ValueError('Invalid appendix path')
            for c in 'ABC': Data(c,staging).compile_registry()
            (staging/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
            destination=self.storage/version
            if destination.exists():raise ValueError('Version is immutable and already installed')
            os.replace(staging,destination)
            return self.activate(version)
        finally:
            if staging.exists():shutil.rmtree(staging)
