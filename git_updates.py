"""Read-only public GitHub adapter. One fixed repository, no credentials, no code execution."""
import base64, json, re, tempfile, urllib.error, urllib.request
from pathlib import Path
from pack_manager import MAX_FILE, MAX_TOTAL, safe_path
REPOSITORY='Whirock/Wuwa-battlesystem-testversion-v2.0'
API='https://api.github.com/repos/'+REPOSITORY
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('Redirect forbidden')
class GitUpdates:
    def __init__(self,packs):self.packs=packs;self.available=[];self.last_check=None
    def _get(self,path,limit):
        accept='application/vnd.github.object+json' if path.startswith('/contents/') else 'application/vnd.github+json'
        req=urllib.request.Request(API+path,headers={'Accept':accept,'User-Agent':'Wuwa-Combat-Lab','X-GitHub-Api-Version':'2022-11-28'})
        with urllib.request.build_opener(NoRedirect).open(req,timeout=15) as response:
            data=response.read(limit+1)
            if len(data)>limit:raise ValueError('Remote response too large')
            return json.loads(data)
    def _file(self,path,commit,limit):
        if not re.fullmatch(r'[a-f0-9]{40}',commit):raise ValueError('Invalid pinned commit')
        if not re.fullmatch(r'[A-Za-z0-9_./-]+',path) or '..' in path or path.startswith('/'):raise ValueError('Invalid remote path')
        obj=self._get('/contents/'+path+'?ref='+commit,limit*2+8192)
        if obj.get('type')!='file' or obj.get('size',limit+1)>limit:raise ValueError('Unsupported remote file')
        # GitHub Contents omits base64 for files above 1 MiB. Retrieve that
        # already-pinned object's blob by its verified Git SHA, never a URL.
        if obj.get('encoding')!='base64':
            sha=obj.get('sha','')
            if not re.fullmatch(r'[a-f0-9]{40}',sha):raise ValueError('Invalid blob SHA')
            obj=self._get('/git/blobs/'+sha,limit*2+8192)
        if obj.get('encoding')!='base64' or obj.get('size',limit+1)>limit:raise ValueError('Unsupported remote blob')
        raw=base64.b64decode(obj['content'].replace('\n',''),validate=True)
        if len(raw)>limit or len(raw)!=obj['size']:raise ValueError('Remote size mismatch')
        return raw
    def status(self):
        return {**self.packs.status(),'configured':True,'enabled':True,'repository':'https://github.com/'+REPOSITORY,'branch':'main','available':self.available,'last_check':self.last_check,'reason':self.last_check or '已配置唯一公开仓库；尚未检查兼容纯数据包，不涉及引擎更新。'}
    def check(self):
        self.available=[]
        try:
            commit=self._get('/commits/main',128*1024)['sha']
            index=json.loads(self._file('combat-data/index.json',commit,128*1024))
            if index.get('schema')!='wuwa-package-index-v1':raise ValueError('Unsupported package index')
            releases=index.get('releases',[])
            if not isinstance(releases,list) or len(releases)>32:raise ValueError('Invalid release list')
            for row in releases:
                v=row['version']
                if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',v) or v=='builtin':raise ValueError('Invalid release version')
                self.available.append({'version':v,'commit':commit,'engine_schema':row.get('engine_schema'),'compatible':row.get('engine_schema')=='wuwa-data-v1','qualification':row.get('qualification','unknown')})
            self.last_check='已检查固定提交；找到 '+str(len(self.available))+' 个数据包条目。'
        except urllib.error.HTTPError as ex:
            if ex.code in (404,409):self.last_check='仓库暂无兼容数据发布索引（combat-data/index.json）。'
            else:self.last_check='GitHub 检查失败：HTTP '+str(ex.code)
        except Exception as ex:self.last_check='更新检查失败；保留当前版本：'+str(ex)
        return self.status()
    def install(self,version):
        row=next((x for x in self.available if x['version']==version),None)
        if row is None:raise ValueError('Check updates before selecting a listed version')
        if not row['compatible']:raise ValueError('需要升级程序引擎；旧数据包保持不变')
        commit=row['commit'];prefix='combat-data/packages/'+version+'/'
        manifest_bytes=self._file(prefix+'manifest.json',commit,128*1024);manifest=json.loads(manifest_bytes)
        if manifest.get('version')!=version:raise ValueError('Manifest version mismatch')
        rows=manifest['files'];total=0
        if not isinstance(rows,list) or len(rows)>256:raise ValueError('Too many files')
        with tempfile.TemporaryDirectory(prefix='.download-',dir=self.packs.storage) as tmp:
            dest=Path(tmp);(dest/'manifest.json').write_bytes(manifest_bytes)
            for f in rows:
                safe_path(f['path']);size=f['size']
                if type(size)!=int or not 0<=size<=MAX_FILE:raise ValueError('Invalid file size')
                total+=size
                if total>MAX_TOTAL:raise ValueError('Package too large')
                content=self._file(prefix+f['path'],commit,size);p=dest/f['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content)
            self.packs.install_local(dest)
        return self.status()
