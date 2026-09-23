"""Release tests. No live tools; source tests need the standard public-asset cache."""
import copy,json,math,os,random,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];S=Path(os.environ.get('TOONKIT_TEST_PLUGIN',ROOT/'plugins/toonkit'))/'skills/3dref/scripts';sys.path.insert(0,str(S));sys.dont_write_bytecode=True
from geometry import box_object,face,signed_distance
from spatial import add,rotate,box_corners,project,camera_basis,basis_xyz,xyz_columns,dot,sub
from engine_v1 import angle,emit_tracks
from plan import Curve
from timewarp import TimeWarp
from support import check_support
from interactions import validate as interactions
from compiler import compile_spec,compile_body
from scene_compiler import PlanningError
from journal import snapshot

def spec(count=2):
    d=3;speed=5.5613
    actors=[{'id':'runner'+str(i),'preset':'running','path':[{'time':0,'position':[(i-(count-1)/2)*2,0,0]},{'time':d,'position':[(i-(count-1)/2)*2,0,d*speed]}],
      'support':[{'start':0,'end':d,'mode':'surface','surface':{'object':'floor','face':'+y'}}]} for i in range(count)]
    return {'format':'3dref-production-v2','timing':{'durationSeconds':d,'fps':24},'objects':[{'id':'floor','center':[0,-.1,8],'size':[16,.2,28],'role':'contact','purpose':'Support actors','usedBy':['tracking']}], 'actors':actors,
      'camera':{'anchors':[{'time':0,'azimuth':140,'elevation':10,'distance':12,'focalLength':26},{'time':d,'azimuth':140,'elevation':10,'distance':12,'focalLength':26}]},
      'quality':{'beats':[{'name':'tracking','start':0,'end':d,'actors':{a['id']:{'height':[.04,.7]} for a in actors},'allowRelativeHold':'Tracking the formation'}]}}

def synthetic():
    _,p=box_object({'id':'floor','center':[0,-.1,1],'size':[10,.2,12],'role':'contact','purpose':'test'})
    a={'id':'a','support':[{'start':0,'end':2,'mode':'surface','surface':{'object':'floor','face':'+y'}}], 'samples':[{'frame':i,'position':[0,.025,i*.02],'groundPosition':[0,.025,i*.02],'rotation':[0,0,0],'actionTime':i/24,'markers':{'footL':[-.1,0,0],'footR':[.1,0,0],'head':[0,1.6,0]}} for i in range(48)]}
    return a,p

class Geometry(unittest.TestCase):
    def test_grounded_bottom_pivot(self):
        c,p=box_object({'id':'tower','center':[4,18,6],'size':[4,36,8],'role':'visible','purpose':'wall'})
        self.assertEqual(c['transform']['position'],[4,0,6]);self.assertEqual(face(p,'-y')['point'][1],0);self.assertEqual(face(p,'+y')['point'][1],36)
    def test_rotated_box_desired_center_and_dimensions(self):
        rng=random.Random(7)
        for _ in range(80):
            center=[rng.uniform(-10,10) for _ in range(3)];size=[rng.uniform(.1,8) for _ in range(3)];rot=[rng.uniform(-180,180) for _ in range(3)]
            c,p=box_object({'id':'b','center':center,'size':size,'rotation':rot,'role':'visible','purpose':'test'})
            corners=box_corners(p['bounds'],p['transform'])
            for j in range(3):self.assertAlmostEqual(sum(v[j] for v in corners)/8,center[j],places=8)
            for j,axis in enumerate('xyz'):
                self.assertAlmostEqual(math.sqrt(sum(x*x for x in sub(face(p,'+'+axis)['point'],face(p,'-'+axis)['point']))),size[j],places=8)
    def test_unprofiled_geometry_rejected(self):
        with self.assertRaises(ValueError):box_object({'kind':'sphere'})
    def test_shortest_angle_and_half_turn_sign(self):
        self.assertAlmostEqual(angle(350,10,.5)%360,0);self.assertEqual(angle(0,180,.5),90);self.assertEqual(angle(0,-180,.5),-90)
    def test_reduction_cannot_hide_curve_excursion(self):
        track=[{'frame':i,'patch':{'transform':{'position':[math.sin(i*.3),0,i*.1],'rotation':[0,i*3,0]},'camera':{'focalLength':35+i*.02}}} for i in range(60)]
        _,decoded,stats=emit_tracks({'c':track},{0,59})
        for row,out in zip(track,decoded['c']):
            self.assertLessEqual(math.dist(row['patch']['transform']['position'],out['transform']['position']),.002001)
    def test_warp_integrates_and_keeps_slow_plateau(self):
        w=TimeWarp([{'time':0,'speed':1},{'time':1,'speed':1},{'time':1.4,'speed':.2},{'time':2,'speed':.2},{'time':2.4,'speed':1},{'time':3,'speed':1}],3)
        self.assertAlmostEqual(w.at(1.8)[1],.2);self.assertAlmostEqual(w.at(2)[0]-w.at(1.4)[0],.12)
        self.assertAlmostEqual(w.at(3)[0],2.2)
    def test_curve_endpoint_derivative(self):
        c=Curve([{'time':0,'value':[0,0,0],'velocity':[3,0,0]},{'time':2,'value':[6,0,0],'velocity':[3,0,0]}]);self.assertAlmostEqual(c.at(1,1)[0],3)

class SpatialFailures(unittest.TestCase):
    def test_surface_all_frames_pass(self):
        a,p=synthetic();self.assertTrue(check_support([a],[p],24,2)['passed'])
    def test_floating_transition_detected_from_first_frame(self):
        a,p=synthetic()
        for s in a['samples'][:8]:s['groundPosition'][1]+=.8;s['position'][1]+=.8
        r=check_support([a],[p],24,2);self.assertFalse(r['passed']);self.assertEqual(r['issues']['a:unsupported-ground-path']['firstFrame'],0)
    def test_uncovered_transition_fails(self):
        a,p=synthetic();a['support'][0]['start']=.3
        with self.assertRaises(ValueError):check_support([a],[p],24,2)
    def test_finite_face_not_infinite_plane(self):
        a,p=synthetic()
        for s in a['samples']:s['groundPosition'][0]=s['position'][0]=10
        self.assertFalse(check_support([a],[p],24,2)['passed'])
    def test_flight_not_blanket_waiver(self):
        a,p=synthetic();a['support']=[{'start':0,'end':2,'mode':'flight','takeoff':{'object':'floor','face':'+y'},'landing':{'object':'floor','face':'+y'},'maxSeconds':2,'reason':'jump'}]
        self.assertFalse(check_support([a],[p],24,2)['passed'])
    def test_actor_overlap(self):
        a,p=synthetic();b=copy.deepcopy(a);b['id']='b'
        self.assertFalse(interactions([a,b],[p],{},24)['passed'])
    def test_swept_obstacle_between_frames(self):
        a,p=synthetic();_,thin=box_object({'id':'thin','center':[0,1,.5],'size':[3,2,.005],'role':'occluder','purpose':'test'})
        a['samples']=a['samples'][:2];a['samples'][0]['position'][2]=0;a['samples'][1]['position'][2]=1
        self.assertFalse(interactions([a],[p,thin],{},24)['passed'])

CACHE=os.environ.get('TOONKIT_TEST_CACHE')
@unittest.skipUnless(CACHE,'Set TOONKIT_TEST_CACHE with runtime/ and motions/')
class SourceProduction(unittest.TestCase):
    def compile(self,s):return compile_spec(s,Path(CACHE)/'runtime',Path(CACHE)/'motions',True)
    def test_arbitrary_actor_counts_and_native_key_reduction(self):
        for count in (1,2,3):
            b=self.compile(spec(count));self.assertEqual(len(b['actors']),count);self.assertTrue(b['summary']['checks']['preflight']['passed']);self.assertEqual(b['summary']['uniqueBodyBakes'],1);self.assertLess(b['summary']['storedKeys'],b['summary']['denseKeys']/3)
    def test_stride_mismatch_default_fail_and_explicit_style_report(self):
        s=spec(1);s['actors'][0]['path'][-1]['position'][2]=9
        with self.assertRaises(PlanningError) as e:self.compile(s)
        self.assertEqual(e.exception.report['stage'],'locomotion')
        s['actors'][0]['locomotion']={'mode':'stylized','reason':'Deliberate exaggerated foot cadence for this beat'}
        b=self.compile(s);self.assertEqual(b['summary']['checks']['preflight']['warnings'][0]['code'],'intentional-stride-mismatch')
    def test_unknown_option_and_legacy_input_rejected(self):
        s=spec();s['actors'][0]['speed']=1
        with self.assertRaises(ValueError):self.compile(s)
    def test_static_standing_and_portrait(self):
        s=spec(1);s['timing']['aspect']='9:16';s['actors'][0]['preset']='standing-idle';s['actors'][0]['path'][-1]['position']=[0,0,0];s['quality']['beats'][0]['allowStatic']='Deliberate actor hold'
        b=self.compile(s);self.assertTrue(b['summary']['checks']['preflight']['passed'])
    def test_walk_and_idle_profiles(self):
        for preset,speed in [('walking',1.6779),('idle',0)]:
            s=spec(1);s['actors'][0]['preset']=preset;s['actors'][0]['path'][-1]['position'][2]=3*speed;s['quality']['beats'][0]['allowStatic']='Idle performance hold'
            self.assertTrue(self.compile(s)['summary']['checks']['preflight']['passed'])
    def test_full_duration_native_tail_is_covered(self):
        s=spec(2);s['timing']['durationSeconds']=30;s['objects'][0]['center'][2]=85;s['objects'][0]['size'][2]=180
        for a in s['actors']:a['path'][-1].update(time=30,position=[a['path'][-1]['position'][0],0,30*5.5613]);a['support'][0]['end']=30
        s['camera']['anchors'][-1]['time']=30;s['quality']['beats'][0]['end']=30
        b=self.compile(s);self.assertEqual(b['summary']['denseKeys'],2160);self.assertEqual(b['summary']['storedKeys'],6)
        for actor in b['actors']:
            frames=[c['frame'] for batch in b['batches'] for c in batch['commands'] if c.get('objectId')==actor['token'] and c['op']=='keyframe.upsert']
            self.assertEqual(max(frames),719)
    def test_jump_world_markers_do_not_double_count_height(self):
        motion={'format':'3dref-motion-v1','rig':'stock-human','baseline':'standing-idle','fps':24,'durationSeconds':2,'segments':[{'preset':'jumping','start':0,'end':2,'sourceStart':0,'speed':.5,'loop':False}]}
        a=compile_body(motion,Path(CACHE)/'runtime',Path(CACHE)/'motions',True);motion['baseline']='running';b=compile_body(motion,Path(CACHE)/'runtime',Path(CACHE)/'motions',True)
        # Changing the baseline must not change the desired world skeleton.
        for x,y in zip(a['samples'],b['samples']):
            for joint in x['markers']:
                self.assertLess(abs((x['markers'][joint][1]+x['rootYOffset'])-(y['markers'][joint][1]+y['rootYOffset'])),.00021)
        s=spec();s['format']='3dref-production-v1'
        with self.assertRaises(ValueError):self.compile(s)
    def test_offscreen_dressing_culled(self):
        s=spec();s['objects'].append({'id':'unused','center':[1000,2,1000],'size':[2,4,2],'role':'visible','purpose':'Distant skyline'})
        b=self.compile(s);self.assertIn('unused',b['summary']['culledObjects']);self.assertFalse(any(c.get('clientRef')=='unused' for batch in b['batches'] for c in batch['commands']))
    def test_three_actor_wall_roll_slowmo(self):
        s=json.loads((ROOT/'validation/fixtures/wall-roll.json').read_text());b=self.compile(s)
        self.assertEqual(b['summary']['actors'],3);self.assertEqual(abs(b['summary']['floorRoll']['degrees']),90);self.assertGreater(b['summary']['floorRoll']['minScreenUp'],.6);self.assertTrue(b['summary']['checks']['preflight']['support']['passed'])
    def test_peak_motion_failure_has_real_frame_and_values(self):
        s=json.loads((ROOT/'validation/fixtures/wall-roll.json').read_text());s['quality']['limits']['camera']['maxAcceleration']=.01
        with self.assertRaises(PlanningError) as e:self.compile(s)
        r=e.exception.report;v=r['issues']['motion-limit:camera:maxAcceleration'];self.assertGreater(v['first'],0);self.assertGreater(v['examples'][0]['actual'],v['examples'][0]['maximum'])
    def test_failed_cli_preserves_diagnostic_and_recompiles(self):
        with tempfile.TemporaryDirectory() as td:
            run=Path(td);s=spec(1);s['actors'][0]['path'][-1]['position'][2]=9;(run/'spec.json').write_text(json.dumps(s))
            command=[sys.executable,'-B',str(S/'compiler.py'),str(run/'spec.json'),'--run',str(run),'--runtime',str(Path(CACHE)/'runtime'),'--cache',str(Path(CACHE)/'motions'),'--offline']
            r=subprocess.run(command,capture_output=True,text=True);self.assertEqual(r.returncode,2);self.assertEqual(json.loads((run/'diagnostic.json').read_text())['stage'],'locomotion');self.assertFalse((run/'compiled.json').exists())
            (run/'spec.json').write_text(json.dumps(spec(1)));r=subprocess.run(command,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);self.assertFalse((run/'diagnostic.json').exists());snapshot(run)
            b=json.loads((run/'compiled.json').read_text());b['timing']['fps']=30;(run/'compiled.json').write_text(json.dumps(b))
            with self.assertRaises(ValueError):snapshot(run)

if __name__=='__main__':unittest.main(verbosity=2)
