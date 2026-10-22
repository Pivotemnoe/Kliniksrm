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
