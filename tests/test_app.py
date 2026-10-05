import base64, copy, hashlib, json, shutil, sys, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Lab, Handler, ThreadingHTTPServer, BASE
from pack_manager import SCHEMA, REQUIRED
class LabTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.lab=Lab(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def create(self,c='A',**kw):
        args={'candidate':c,'stage':'early','roles':['aemeath'],**kw}
        p=self.lab.profile(args)['profile'];args['routes']={x['role_id']:x['allowed'][0] for x in p['required_choices']}
        return self.lab.create(args)
    def package(self,version='test1'):
        root=Path(self.tmp.name)/('fixture-'+version);shutil.copytree(BASE/'packs/builtin',root)
        m={'version':version,'engine_schema':SCHEMA,'qualification':'experimental_unqualified','files':[]}
        for name in sorted(REQUIRED):
            raw=(root/name).read_bytes();m['files'].append({'path':name,'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
        (root/'manifest.json').write_text(json.dumps(m));return root
    def test_abc_real_engine_and_public_boundary(self):
        for c in 'ABC':
            b=self.create(c);self.assertEqual(b['candidate'],c);self.assertTrue(b['legal'])
            for hidden in ['rng','seed','initial_checkpoint','profile','actions'] :self.assertNotIn(hidden,b['view'])
            for r in b['legal']:
                self.assertEqual(set(r),{'battle_id','action_id','expected_revision','actor_entity_id','command','card_instance_id_or_null','branch_id_or_null','target_entity_ids','choices'})
            play=next(r for r in b['legal'] if r['command']=='play_card');result=self.lab.apply(b['id'],play);self.assertTrue(result['receipt']['accepted'])
    def test_idempotent_stale_illegal_terminal(self):
        b=self.create();bid=b['id'];r=next(r for r in b['legal'] if r['command']=='end_turn');first=self.lab.apply(bid,r);again=self.lab.apply(bid,r)
        self.assertEqual(first['receipt'],again['receipt']);self.assertEqual(first['view']['revision'],again['view']['revision'])
        stale=copy.deepcopy(r);stale['action_id']='new-stale';self.assertEqual(self.lab.apply(bid,stale)['receipt']['code'],'STALE_REVISION')
        conflict=copy.deepcopy(r);conflict['command']='retreat';self.assertEqual(self.lab.apply(bid,conflict)['receipt']['code'],'ID_PAYLOAD_CONFLICT')
        illegal=copy.deepcopy(first['legal'][0]);illegal.update(command='not-a-command',action_id='bad-command');self.assertFalse(self.lab.apply(bid,illegal)['receipt']['accepted'])
        retreat=next(x for x in self.lab.snapshot(bid)['legal'] if x['command']=='retreat');end=self.lab.apply(bid,retreat);self.assertTrue(end['view']['outcome']);self.assertEqual(end['legal'],[])
        terminal=copy.deepcopy(retreat);terminal.update(action_id='after-terminal',expected_revision=end['view']['revision']);self.assertFalse(self.lab.apply(bid,terminal)['receipt']['accepted'])
    def test_branch_targets_choices_deployment_and_replacement(self):
        # Focused synthetic state fixture, not balance evidence: move owned cards
        # into hand and fill existing resource caps, without altering rules.
        b=self.create('B',stage='late',roles=['aemeath','lynae','mornye']);bid=b['id'];e=self.lab.battles[bid]['engine']
        for zone in e.state['zones']:e.state['zones'][zone]=[]
        e.state['zones']['hand']=list(e.state['cards']);e.state['body']['energy']=10
        for rs in e.state['roles'].values():rs['private']=dict(rs['caps'])
        e.state['active_role']='aemeath'
        choices=[r for r in self.lab.snapshot(bid)['legal'] if r['choices']]
        self.assertTrue(any(isinstance(v,list) for r in choices for v in r['choices'].values()))
        self.assertTrue(self.lab.apply(bid,choices[0])['receipt']['accepted'])
        e.state['active_role']='lynae';e.state['body']['energy']=10
        setup=next(r for r in self.lab.snapshot(bid)['legal'] if r['branch_id_or_null']=='set_optics')
        self.assertTrue(setup['target_entity_ids']);self.assertTrue(self.lab.apply(bid,setup)['receipt']['accepted'])
        activation=next(r for r in self.lab.snapshot(bid)['legal'] if r['command']=='activate_deployment' and r['choices']['ability_id'].endswith('__spread_guard'))
        self.assertTrue(self.lab.apply(bid,activation)['receipt']['accepted'])
        paint=next(r for r in self.lab.snapshot(bid)['legal'] if r['branch_id_or_null']=='paint')
        self.assertTrue(self.lab.apply(bid,paint)['receipt']['accepted'])
        e.state['active_role']='mornye';e.state['body']['energy']=10
        replacement=next(r for r in self.lab.snapshot(bid)['legal'] if 'replace_deployment_instance_id' in r['choices'])
        old=replacement['choices']['replace_deployment_instance_id'];result=self.lab.apply(bid,replacement)
        self.assertTrue(result['receipt']['accepted']);self.assertNotIn(old,result['view']['deployments'])
    def test_save_restore_overrides_paths(self):
        b=self.create('C');r=b['legal'][0];self.lab.apply(b['id'],r);saved=self.lab.export(b['id'],'save');saved['checkpoint']['root']='/do-not-read';saved['checkpoint']['state']['initial_checkpoint']['root']='/do-not-read'
        restored=self.lab.restore({'save':saved});self.assertEqual(restored['view'],self.lab.snapshot(b['id'])['view'])
    def test_free_build_zero_attack_and_fresh(self):
        for c in 'ABC':
            p=self.lab.profile({'candidate':c,'stage':'early','roles':['aemeath']})['profile'];d=self.lab.data(c)
            copy_id=next(i for i,a in p['owned_cards'].items() if d.abilities[a].get('card_type')=='mode')
            b=self.create(c,deck=[copy_id]);self.assertEqual(sum(b['view']['zone_counts'].values()),1)
            for roles in [['denia'],['denia','chisa'],['aemeath','lynae','mornye']]:self.create(c,stage='fresh_acquisition',roles=roles)
    def test_update_success_lock_and_rollback(self):
        b=self.create();fixture=self.package();self.lab.packs.install_local(fixture);self.assertEqual(self.lab.packs.active,'test1');self.assertEqual(self.lab.snapshot(b['id'])['data_version'],'builtin')
        other=self.create('C');self.assertEqual(other['data_version'],'test1')
        self.lab.packs.activate('builtin');self.assertEqual(self.lab.snapshot(other['id'])['data_version'],'test1')
        bad=self.package('bad');p=bad/'batch_01/A/CANDIDATE.json';p.write_text('{}')
        with self.assertRaises(ValueError):self.lab.packs.install_local(bad)
        self.assertEqual(self.lab.packs.active,'builtin')
    def test_update_path_schema_code_size_rejected(self):
        for kind in ['path','schema','code','size','qualification','appendix']:
            root=self.package(kind);m=json.loads((root/'manifest.json').read_text())
            if kind=='path':m['files'][0]['path']='../../escape.json'
            elif kind=='schema':m['engine_schema']='requires-new-engine'
            elif kind=='code':m['files'].append({'path':'assets/evil.py','size':0,'sha256':hashlib.sha256(b'').hexdigest()})
            elif kind=='size':m['files'][0]['size']=999999999
            elif kind=='qualification':m['qualification']='qualified'
            else:
                p=root/'system_contract/SYSTEM_CONTRACT.json';v=json.loads(p.read_text());v['equipment']['appendix']='../../outside.json';p.write_text(json.dumps(v));row=next(x for x in m['files'] if x['path']=='system_contract/SYSTEM_CONTRACT.json');row.update(size=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
            (root/'manifest.json').write_text(json.dumps(m))
            with self.assertRaises((ValueError,FileNotFoundError)):self.lab.packs.install_local(root)
            self.assertEqual(self.lab.packs.active,'builtin')
    def test_compile_rejection_preserves_active(self):
        root=self.package('broken');p=root/'batch_01/C/CANDIDATE.json';p.write_text('{}');m=json.loads((root/'manifest.json').read_text());r=next(r for r in m['files'] if r['path']=='batch_01/C/CANDIDATE.json');r.update(size=2,sha256=hashlib.sha256(b'{}').hexdigest());(root/'manifest.json').write_text(json.dumps(m))
        with self.assertRaises(Exception):self.lab.packs.install_local(root)
        self.assertEqual(self.lab.packs.active,'builtin');self.assertFalse((self.lab.packs.storage/'broken').exists())
    def test_git_update_fixed_commit_fixture(self):
        root=self.package('remote1');u=self.lab.updates;commit='a'*40
        u._get=lambda path,limit:{'sha':commit}
        def getfile(path,pin,limit):
            self.assertEqual(pin,commit)
            if path=='combat-data/index.json':return json.dumps({'schema':'wuwa-package-index-v1','releases':[{'version':'remote1','engine_schema':SCHEMA,'qualification':'experimental_unqualified'}]}).encode()
            return (root/path.removeprefix('combat-data/packages/remote1/')).read_bytes()
        u._file=getfile;self.assertEqual(len(u.check()['available']),1);u.install('remote1');self.assertEqual(self.lab.packs.active,'remote1')
    def test_github_contents_uses_large_file_supported_media_type(self):
        opener=MagicMock();response=opener.open.return_value.__enter__.return_value;response.read.return_value=b'{}'
        with patch('git_updates.urllib.request.build_opener',return_value=opener):
            self.lab.updates._get('/contents/combat-data/index.json?ref='+'a'*40,100)
        request=opener.open.call_args.args[0]
        self.assertEqual(request.get_header('Accept'),'application/vnd.github.object+json')
        self.assertFalse(request.has_header('Authorization'))
    def test_github_large_blob_and_incompatible_version(self):
        u=self.lab.updates;raw=b'fixture';sha='b'*40;commit='a'*40;seen=[]
        def fake(path,limit):
            seen.append(path)
            if path.startswith('/contents/'):
                return {'type':'file','encoding':'none','size':len(raw),'sha':sha}
            return {'encoding':'base64','size':len(raw),'content':base64.b64encode(raw).decode()}
        u._get=fake;self.assertEqual(u._file('combat-data/test.json',commit,100),raw)
        self.assertEqual(seen[-1],'/git/blobs/'+sha)
        with self.assertRaises(ValueError):u._file('../outside.json',commit,100)
        u.available=[{'version':'future','commit':commit,'compatible':False}]
        with self.assertRaises(ValueError):u.install('future')
        self.assertEqual(self.lab.packs.active,'builtin')
    def test_http_host_origin_token_and_traversal(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.lab=self.lab;threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
        try:
            self.assertIn('csrf_token',json.load(urllib.request.urlopen(base+'/api/session')))
            for headers in [{'Host':'evil.example'},{'Origin':'https://evil.example'}]:
                with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(urllib.request.Request(base+'/api/session',headers=headers))
                self.assertEqual(e.exception.code,403)
            with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(urllib.request.Request(base+'/api/battles',data=b'{}',headers={'Content-Type':'application/json'}))
            self.assertEqual(e.exception.code,403)
            with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(base+'/%2e%2e/app.py')
            req=urllib.request.Request(base+'/api/battles',data=json.dumps({'candidate':'A'}).encode(),headers={'Content-Type':'application/json','X-Session-Token':self.lab.token})
            self.assertEqual(json.load(urllib.request.urlopen(req))['candidate'],'A')
        finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main(verbosity=2)
