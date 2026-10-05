#!/usr/bin/env python3
"""Loopback-only manual combat lab; Python 3.10+, no dependencies."""
import argparse, copy, hashlib, json, mimetypes, os, secrets, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
from presentation import guide, resolve_profile, role_details
from runtime.engine import Engine
from runtime.live_engine import LiveEngine
from runtime.live_content import content as live_content, ENGINE_VERSION as LIVE_ENGINE_VERSION
from runtime.data import Data
from pack_manager import PackManager
from git_updates import GitUpdates
APP_VERSION='0.3.1'
BASE=Path(__file__).resolve().parent
class Lab:
    def __init__(self,user=None):
        self.user=Path(user or BASE/'user_data');self.user.mkdir(parents=True,exist_ok=True)
        self.packs=PackManager(BASE,self.user);self.updates=GitUpdates(self.packs);self.battles={};self.lock=threading.RLock();self.token=secrets.token_urlsafe(32)
    def data(self,candidate,version=None):return Data(candidate,self.packs.path(version or self.packs.active))
    def gear_profiles(self,d):
        seen={}
        for p in d.profiles:
            g=p['gear']; key=hashlib.sha256(json.dumps(g,sort_keys=True).encode()).hexdigest()[:16]
            seen.setdefault(key,{'id':key,'label':g.get('loadout_id','gear')+' / '+p['stage'],'gear':g})
        return list(seen.values())
    def rule_definitions(self,d):
        return {k:getattr(d,k) for k in ('statuses','tokens','modifiers','deployments','inherents','roles','abilities')}
    def catalog(self):
        candidates=[]
        for c in 'ABC':
            d=self.data(c)
            candidates.append({'id':c,'guide':guide(d),'rule_definitions':self.rule_definitions(d),'status':'experimental_unqualified','roles':[{'id':rid,'name':r.get('name_zh',{'aemeath':'爱弥斯','lynae':'琳奈','mornye':'莫宁','denia':'达妮娅','chisa':'千咲'}.get(rid,rid))} for rid,r in d.roles.items()], 'profiles':[{'id':p['id'],'stage':p['stage'],'roles':p['roles']} for p in d.profiles], 'abilities':d.abilities,'scenarios':d.system['enemy_catalogues']+[{'id':d.spatial['supplemental_fixture']['fixture_id'],'label':'空间补充测试场景'}], 'gear_profiles':self.gear_profiles(d)})
        return {'app_version':APP_VERSION,'data_version':self.packs.active,'live_content':live_content(),'live_engine_version':LIVE_ENGINE_VERSION,'live_gui_status':'integrated_experimental','candidates':candidates,'qualification':'实验／未合格；正式合格方案 0'}
    def profile(self,body):
        d=self.data(body.get('candidate','A'))
        p=d.profile(**resolve_profile(d,body))
        return {'data_version':self.packs.active,'profile':p,'role_details':role_details(d,p),'abilities':d.abilities}
    def snapshot(self,identifier):
        b=self.battles[identifier];e=b['engine']; actions=e.legal_actions(include_blocked=True)
        live_definitions=None
        rules=copy.deepcopy(self.rule_definitions(e.data))
        if isinstance(e,LiveEngine):
            live_definitions={'content_version':e.live_content['content_version'],'content_hash':e.content_hash,
                'actors':copy.deepcopy(e.live_content['actors']),'abilities':copy.deepcopy(e.live_content['abilities']),
                'encounter':copy.deepcopy(e.state['encounter'])}
            rules['statuses']['LIVE_COVER']={'id':'LIVE_COVER','name_zh':'守护护盾','description':'原创守护者提供的10点盾；同来源替换，下一轮开始到期；不是治疗。'}
        return {'id':identifier,'data_version':b['version'],'qualification':'experimental_unqualified','candidate':e.candidate,'rule_definitions':rules,'live_definitions':live_definitions,'abilities':e.data.abilities,'view':e.public_view(),'events':copy.deepcopy(e.state['events']),**actions}
    def persist(self,identifier):
        obj=self.export(identifier,'save');temp=self.user/(identifier+'.tmp');temp.write_text(json.dumps(obj,ensure_ascii=False),encoding='utf8');os.replace(temp,self.user/(identifier+'.json'))
    def create(self,body):
        version=self.packs.active;c=body.get('candidate','A');d=self.data(c,version)
        is_live='encounter_id' in body
        if is_live and 'enemy_id' in body:raise ValueError('Use encounter_id or legacy enemy_id, not both')
        if is_live and any(k in body for k in ['actors','abilities','policy','ally_variant_id']):raise ValueError('Live content must use a registered encounter ID')
        e=(LiveEngine if is_live else Engine)(c,data=d);identifier=secrets.token_hex(12)
        gear=None
        if body.get('gear_profile_id'):
            gear=next((x['gear'] for x in self.gear_profiles(d) if x['id']==body['gear_profile_id']),None)
            if gear is None:raise ValueError('Unknown equipment profile')
        scenario={'encounter_id':body['encounter_id']} if is_live else {'enemy_id':body.get('enemy_id','T1_SINGLE')}
        e.new_battle(**resolve_profile(d,body),seed=secrets.randbits(53),battle_id=identifier,gear=gear,**scenario)
        self.battles[identifier]={'engine':e,'version':version};self.persist(identifier);return self.snapshot(identifier)
    def apply(self,identifier,body):
        e=self.battles[identifier]['engine']
        if not isinstance(body,dict):raise ValueError('Request must be object')
        result=e.apply(body);self.persist(identifier);return {**self.snapshot(identifier),'receipt':result}
    def export(self,identifier,kind):
        b=self.battles[identifier];e=b['engine']
        if kind=='save':return {'format':'wuwa-lab-private-save-v2' if isinstance(e,LiveEngine) else 'wuwa-lab-private-save-v1','warning':'本地调试存档含隐藏牌序与随机状态，请勿用于公平对局信息。','data_version':b['version'],'checkpoint':json.loads(e.serialize())}
        if kind!='log':raise ValueError('Unknown export kind')
        return {'format':'wuwa-lab-test-receipt-v1','qualification':'experimental_unqualified','data_version':b['version'],'runtime_hash':e.runtime_hash,'source_hashes':e.data.manifest,'public_view':e.public_view(),'actions':e.state['actions'],'receipts':e.state['receipts'],'events':e.state['events']}
    def restore(self,body):
        saved=copy.deepcopy(body['save'])
        if saved.get('format') not in ['wuwa-lab-private-save-v1','wuwa-lab-private-save-v2']:raise ValueError('Unsupported save format')
        version=saved['data_version'];root=str(self.packs.path(version));checkpoint=saved['checkpoint']
        # Always replace source paths with an installed, pinned package. Never read user paths.
        checkpoint['root']=root
        initial=checkpoint.get('state',{}).get('initial_checkpoint')
        if initial:initial['root']=root
        e=(LiveEngine if saved['format']=='wuwa-lab-private-save-v2' else Engine).load(checkpoint)
        # Reconstruct solely from initial state + engine-checked actions, verify exact result.
        replay=e.replay()
        if replay._combat_hash()!=e._combat_hash():raise ValueError('Save replay mismatch')
        identifier=e.state['battle_id']
        if not isinstance(identifier,str) or len(identifier)!=24 or any(c not in '0123456789abcdef' for c in identifier):raise ValueError('Invalid battle ID')
        self.battles[identifier]={'engine':e,'version':version};self.persist(identifier);return self.snapshot(identifier)

class Handler(BaseHTTPRequestHandler):
    server_version='CombatLab/1'
    def log_message(self,*args):pass
    def response(self,obj,status=200):
        data=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def trusted(self,write=False):
        origin='http://127.0.0.1:'+str(self.server.server_port)
        if self.headers.get('Host')!='127.0.0.1:'+str(self.server.server_port):raise PermissionError('Invalid Host')
        if self.headers.get('Origin') not in (None,origin):raise PermissionError('Cross-origin request forbidden')
        if self.headers.get('Sec-Fetch-Site')=='cross-site':raise PermissionError('Cross-site request forbidden')
        if write and (self.headers.get('X-Session-Token')!=self.server.lab.token or self.headers.get('Content-Type','').split(';')[0]!='application/json'):raise PermissionError('Local session token and JSON required')
    def do_GET(self):self.route(False)
    def do_POST(self):self.route(True)
    def route(self,write):
        try:
            self.trusted(write);u=urlsplit(self.path);path=u.path;lab=self.server.lab
            with lab.lock:
                body={}
                if write:
                    n=int(self.headers.get('Content-Length','0'))
                    if not 0<n<=12*1024*1024:raise ValueError('Invalid request size')
                    body=json.loads(self.rfile.read(n))
                    if not isinstance(body,dict):raise ValueError('JSON object required')
                if path=='/api/session' and not write:return self.response({'csrf_token':lab.token})
                if path=='/api/catalog' and not write:return self.response(lab.catalog())
                if path=='/api/profile' and write:return self.response(lab.profile(body))
                if path=='/api/battles' and write:return self.response(lab.create(body))
                if path=='/api/restore' and write:return self.response(lab.restore(body))
                if path=='/api/updates' and not write:return self.response(lab.updates.status())
                if path=='/api/updates/activate' and write:return self.response(lab.packs.activate(body['version']))
                if path=='/api/updates/check' and write:return self.response(lab.updates.check())
                if path=='/api/updates/install' and write:return self.response(lab.updates.install(body['version']))
                parts=path.strip('/').split('/')
                if len(parts) in (3,4) and parts[:2]==['api','battles']:
                    bid=parts[2]
                    if len(parts)==3 and not write:return self.response(lab.snapshot(bid))
                    if len(parts)==4 and parts[3]=='actions' and write:return self.response(lab.apply(bid,body))
                    if len(parts)==4 and parts[3]=='export' and not write:return self.response(lab.export(bid,parse_qs(u.query).get('kind',['log'])[0]))
                if not write and not path.startswith('/api/'):
                    relative=unquote(path).lstrip('/') or 'index.html';web=(BASE/'web').resolve();p=(web/relative).resolve()
                    if web not in p.parents or not p.is_file():return self.response({'error':'Not found'},404)
                    data=p.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(p.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(data);return
                self.response({'error':'Not found'},404)
        except PermissionError as ex:self.response({'error':str(ex)},403)
        except KeyError as ex:self.response({'error':'Unknown or missing item: '+str(ex)},400)
        except Exception as ex:self.response({'error':str(ex),'type':type(ex).__name__},400)

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--no-browser',action='store_true');p.add_argument('--install-pack',type=Path);args=p.parse_args();lab=Lab()
    if args.install_pack:print(json.dumps(lab.packs.install_local(args.install_pack),ensure_ascii=False));return
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.lab=lab;url='http://127.0.0.1:'+str(server.server_port);print('Combat Lab: '+url,flush=True)
    if not args.no_browser:threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
