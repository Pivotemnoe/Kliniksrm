"""Release safety regression tests; no shell, host, Docker or production mutation."""
import contextlib, copy, importlib.util, json, os, pathlib, tempfile, unittest
from unittest.mock import patch

REPO=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('booking_release',REPO/'deploy/booking-attribution/publish.py')
release=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(release)
PACKET=pathlib.Path(os.environ['BOOKING_ATTRIBUTION_PACKET']).resolve()

class PacketTests(unittest.TestCase):
    def setUp(self):
        self.original=release.P;release.P=PACKET
        self.m=release.verify_packet()
    def tearDown(self): release.P=self.original
    @contextlib.contextmanager
    def env_host(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp);p=root/'.env';original=('# preserved comment\nOWNER_GATEWAY_IMAGE='+self.m['previous']['reference']+'\nTEST_SETTING=unchanged\n').encode();p.write_bytes(original);p.chmod(0o600)
            base={'services':{'gateway':{'image':self.m['previous']['reference'],'ports':['4100:4100']},'postgres':{'image':'protected-postgres'}}}
            def config():
                value=copy.deepcopy(base);value['services']['gateway']['image']=next(line.split('=',1)[1] for line in p.read_text().splitlines() if line.startswith('OWNER_GATEWAY_IMAGE='));return value
            with patch.object(release,'ROOT',root),patch.object(release,'compose',side_effect=lambda *a:json.dumps(config())),patch.object(release,'run',side_effect=AssertionError('No external process in IO tests')):
                yield p,base,original,config
    def env_preserved(self,p,original):
        self.assertEqual(p.read_bytes(),original);self.assertEqual(p.stat().st_mode&0o777,0o600);self.assertEqual(list(p.parent.glob('.env.*.tmp')),[])
    def test_atomic_pin_writes_only_image_and_preserves_private_complete_file(self):
        with self.env_host() as (p,base,original,config):
            release.pin_image(self.m,'forward',base)
            expected=original.replace(self.m['previous']['reference'].encode(),self.m['gateway']['forwardReference'].encode())
            self.env_preserved(p,expected)
            actual=config();actual['services']['gateway']['image']=base['services']['gateway']['image'];self.assertEqual(actual,base)
    def test_partial_temp_write_fault_keeps_original_env_and_cleans_temp(self):
        real_fdopen=release.os.fdopen
        class BrokenStream:
            def __init__(self,stream):self.stream=stream
            def __enter__(self):return self
            def __exit__(self,*a):return self.stream.__exit__(*a)
            def write(self,b):self.stream.write(b[:11]);self.stream.flush();raise OSError('injected partial temp write')
        with self.env_host() as (p,base,original,config),patch.object(release.os,'fdopen',side_effect=lambda *a,**k:BrokenStream(real_fdopen(*a,**k))):
            with self.assertRaisesRegex(OSError,'partial temp write'):release.pin_image(self.m,'forward',base)
            self.env_preserved(p,original);self.assertEqual(config(),base)
    def test_precommit_fsync_or_replace_fault_never_truncates_env(self):
        for target in ['fsync','replace']:
            with self.subTest(target=target),self.env_host() as (p,base,original,config),patch.object(release.os,target,side_effect=OSError('injected '+target)):
                with self.assertRaisesRegex(OSError,'injected '+target):release.pin_image(self.m,'forward',base)
                self.env_preserved(p,original);self.assertEqual(config(),base)
    def test_directory_fsync_fault_after_replace_restores_known_env_atomically(self):
        real_fsync=release.os.fsync;calls=[]
        def fail_directory(fd):
            calls.append(fd)
            if len(calls)==2:raise OSError('injected directory fsync')
            return real_fsync(fd)
        with self.env_host() as (p,base,original,config),patch.object(release.os,'fsync',side_effect=fail_directory):
            with self.assertRaisesRegex(OSError,'directory fsync'):release.pin_image(self.m,'forward',base)
            self.env_preserved(p,original);self.assertEqual(config(),base);self.assertEqual(len(calls),4)
    def test_compose_validation_fault_restores_known_bytes_and_configuration(self):
        with self.env_host() as (p,base,original,config):
            calls=[]
            def invalid_after_replace(*args):
                value=config();calls.append(value)
                if len(calls)==2:value['unexpected']='injected validation mismatch'
                return json.dumps(value)
            with patch.object(release,'compose',side_effect=invalid_after_replace):
                with self.assertRaisesRegex(RuntimeError,'Unrelated Compose settings changed'):release.pin_image(self.m,'forward',base)
            self.env_preserved(p,original);self.assertEqual(config(),base);self.assertEqual(len(calls),3)
    def test_concurrent_external_env_edit_is_never_overwritten_by_recovery(self):
        real_fsync=release.os.fsync
        with self.env_host() as (p,base,original,config):
            external=original+b'EXTERNAL_EDIT=preserved\n'
            def external_writer(fd):
                result=real_fsync(fd);p.write_bytes(external);return result
            with patch.object(release.os,'fsync',side_effect=external_writer):
                with self.assertRaisesRegex(RuntimeError,'changed externally; refusing to overwrite'):release.pin_image(self.m,'forward',base)
            self.env_preserved(p,external)
    def test_actual_catalog_shape_keeps_closed_booking_and_zero_specialists(self):
        good={'storefront':{'selfBookingEnabled':False,'services':[{}]*172,'specialists':[]}}
        release.closed_catalog(good)
        with self.assertRaisesRegex(RuntimeError,'self-booking state changed'):release.closed_catalog({'selfBookingEnabled':False})
        for field,value in [('selfBookingEnabled',True),('specialists',[{}]),('services',[])]:
            bad=copy.deepcopy(good);bad['storefront'][field]=value
            with self.subTest(field=field),self.assertRaises(RuntimeError):release.closed_catalog(bad)
    def test_exact_payload_and_cached_asset_retention(self):
        d=self.m['gateway']['distribution']
        self.assertEqual(d['before']['clinic-chat.service.js'],release.CLINIC)
        self.assertEqual(d['forward']['clinic-chat.service.js'],release.CLINIC)
        self.assertEqual(d['compat']['clinic-chat.service.js'],release.CLINIC)
        self.assertEqual(d['before']['public/grooming.js'],d['compat']['public/grooming.js'])
        for kind,s in self.m['static'].items():
            for asset in s['retainedAssets']:
                self.assertEqual(release.sha(PACKET/'static'/kind/'forward'/asset),release.sha(PACKET/'static'/kind/'compat'/asset))
            for name,h in s['before'].items():
                if name.endswith(('.jpg','.png','.woff2','.css','.ico','.svg')):
                    self.assertEqual(s['forward'][name],h)
                    self.assertEqual(s['compat'][name],h)
    def test_root_review_required_and_bound_to_this_packet(self):
        with self.assertRaisesRegex(RuntimeError,'Root review receipt required'):release.reviewed(self.m,None)
        with tempfile.TemporaryDirectory() as temp:
            p=pathlib.Path(temp)/'root-review.json';p.write_text(json.dumps({'approved':True,'packetSha256':'wrong'}))
            with self.assertRaisesRegex(RuntimeError,'another immutable packet'):release.reviewed(self.m,p)
            p.write_text(json.dumps({'approved':True,'packetSha256':release.sha(PACKET/'checksums.json')}))
            with self.assertRaisesRegex(RuntimeError,'Root clinical consumer/rollback acceptance missing'):release.reviewed(self.m,p)
            dependency=release.read(PACKET/'qa/clinical-dependency-binding.json')
            review={'approved':True,'packetSha256':release.sha(PACKET/'checksums.json'),'clinical':{'sourceManifestSha256':dependency['qualifiedManifestSha256'],'forwardReference':dependency['forwardReference'],'compatReference':dependency['compatReference'],'forwardImageId':'sha256:'+'1'*64,'compatImageId':'sha256:'+'2'*64,'compatibleRollbackAccepted':True}}
            p.write_text(json.dumps(review))
            release.reviewed(self.m,p)
            bad=copy.deepcopy(review);bad['clinical']['compatImageId']='a mutable tag';p.write_text(json.dumps(bad))
            with self.assertRaisesRegex(RuntimeError,'exact qualified clinical image IDs'):release.reviewed(self.m,p)
            p.write_text(json.dumps(review))
            changed=copy.deepcopy(self.m);changed['gateway']['distribution']['compat']['clinic-chat.service.js']='wrong'
            with self.assertRaisesRegex(RuntimeError,'QA used different payload'):release.reviewed(changed,p)
    def test_tampering_is_rejected_before_host_calls(self):
        with tempfile.TemporaryDirectory() as temp:
            p=pathlib.Path(temp);(p/'release.json').write_text('{}');(p/'checksums.json').write_text(json.dumps({'release.json':'wrong'}))
            with patch.object(release,'P',p),patch.object(release,'run',side_effect=AssertionError('No host access')):
                with self.assertRaisesRegex(RuntimeError,'Immutable packet drift'):release.verify_packet()
    def baseline_mocks(self, stack):
        m=self.m
        stack.enter_context(patch.object(release,'inspect',side_effect=lambda n:{'Image':release.BASE} if n==release.APP else {'Id':release.BASE}))
        stack.enter_context(patch.object(release,'distribution',return_value=m['gateway']['distribution']['before']))
        stack.enter_context(patch.object(release,'runtime',return_value=m['runtimeHash']))
        stack.enter_context(patch.object(release,'config_hashes',return_value=m['configuration']))
        stack.enter_context(patch.object(release,'protected',return_value=m['protectedBaseline']))
        stack.enter_context(patch.object(release,'health'))
    def test_image_distribution_config_and_service_drift_fail_closed(self):
        with contextlib.ExitStack() as stack:
            self.baseline_mocks(stack);release.guard_baseline(self.m)
            scenarios=[('inspect',{'Image':'changed'},'Gateway image changed'),('distribution',{},'distribution changed'),('runtime','changed','configuration/runtime changed'),('config_hashes',{},'configuration/runtime changed'),('protected',{},'Protected baseline changed')]
            for name,value,message in scenarios:
                with self.subTest(name=name),patch.object(release,name,return_value=value):
                    with self.assertRaisesRegex(RuntimeError,message):release.guard_baseline(self.m)
            with patch.object(release,'inspect',side_effect=lambda n:{'Image':release.BASE} if n==release.APP else {'Id':'other'}):
                with self.assertRaisesRegex(RuntimeError,'base image reference changed'):release.guard_baseline(self.m)
    def simulated_host(self,temp,mode):
        root=pathlib.Path(temp);b=root/'backups'/self.m['releaseId'];b.mkdir(parents=True)
        built={'packetSha256':release.sha(PACKET/'checksums.json'),'forward':{'id':'forward-id','reference':self.m['gateway']['forwardReference']},'compat':{'id':'compat-id','reference':self.m['gateway']['compatReference']}}
        (b/'built.json').write_text(json.dumps(built));(b/'database.dump').write_bytes(b'isolated test backup')
        (b/'backup.json').write_text(json.dumps({'at':release.now(),'restoreTested':True,'sha256':release.sha(b/'database.dump'),'baseConfig':{}}))
        args=type('Args',(),{'mode':mode,'review':None})()
        return root,b,built,args
    def test_partial_apply_failure_uses_compatible_reader_and_retained_trees(self):
        events=[]
        with tempfile.TemporaryDirectory() as temp,contextlib.ExitStack() as stack:
            root,b,built,args=self.simulated_host(temp,'apply')
            for name,value in [('ROOT',root)]:stack.enter_context(patch.object(release,name,value))
            stack.enter_context(patch.object(release.argparse.ArgumentParser,'parse_args',return_value=args))
            for name in ['host_guard','reviewed','guard_baseline','ready']:stack.enter_context(patch.object(release,name))
            stack.enter_context(patch.object(release,'inspect',side_effect=lambda n:{'Id':next(x['id'] for x in [built['forward'],built['compat']] if x['reference']==n)}))
            stack.enter_context(patch.object(release,'stage_static',side_effect=lambda m:events.append('stage-both')))
            stack.enter_context(patch.object(release,'pin_image',side_effect=lambda m,mode,c:events.append('pin-'+mode)))
            stack.enter_context(patch.object(release,'compose',side_effect=lambda *a:events.append('compose')))
            def switch(m,mode):
                events.append('static-'+mode)
                if mode=='forward':raise RuntimeError('simulated partial static switch')
            stack.enter_context(patch.object(release,'switch_static',side_effect=switch))
            stack.enter_context(patch.object(release,'verify_active',side_effect=lambda m,mode,b:events.append('verified-'+mode)))
            stack.enter_context(patch.object(release,'config_hashes',return_value={'proof':'new'}))
            with self.assertRaisesRegex(RuntimeError,'simulated partial'):release.main()
            self.assertEqual(events,['stage-both','pin-forward','compose','static-forward','static-compat','pin-compat','compose','verified-compat'])
            self.assertEqual(json.loads((b/'state.json').read_text())['phase'],'FAILED_COMPAT_ROLLBACK')
    def test_rollback_refuses_later_configuration_without_switching(self):
        with tempfile.TemporaryDirectory() as temp,contextlib.ExitStack() as stack:
            root,b,built,args=self.simulated_host(temp,'rollback')
            (b/'state.json').write_text(json.dumps({'phase':'COMPLETE','packetSha256':built['packetSha256'],'configuration':{'expected':'old'}}))
            stack.enter_context(patch.object(release,'ROOT',root));stack.enter_context(patch.object(release.argparse.ArgumentParser,'parse_args',return_value=args))
            for name in ['host_guard','reviewed']:stack.enter_context(patch.object(release,name))
            stack.enter_context(patch.object(release,'inspect',side_effect=lambda n:{'Id':next(x['id'] for x in [built['forward'],built['compat']] if x['reference']==n)}))
            stack.enter_context(patch.object(release,'config_hashes',return_value={'expected':'new'}))
            switch=stack.enter_context(patch.object(release,'switch_static'))
            with self.assertRaisesRegex(RuntimeError,'Configuration changed after release'):release.main()
            switch.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
