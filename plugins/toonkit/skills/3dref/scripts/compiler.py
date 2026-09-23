#!/usr/bin/env python3
"""Compile one production bundle; keep execution data outside model context.

No MCP credentials or browser control. The connected runtime uses the resulting immutable bundle.
"""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

sys.dont_write_bytecode = True
from plan import build, screen_point, inside_box, ray_box
from mcp_plan import encode

HERE = Path(__file__).resolve().parent
ACTOR = '@actor____________________'
CAMERA = '@camera___________________'


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(x):
    return hashlib.sha256(compact(x).encode()).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.3dref-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(compact(data)+'\n'); f.flush(); os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)


def motion_spec(spec):
    if 'recipe' in spec: raise ValueError('Named scene recipes are not supported; provide the shot and motion specification')
    if 'motion' in spec and (not isinstance(spec['motion'],dict) or not spec['motion']):
        raise ValueError('Explicit motion must be a nonempty 3dref-motion-v1 object')
    return spec.get('motion')


def compile_body(motion, runtime, cache, offline):
    if motion is None: return None
    if not runtime or not cache: raise ValueError('Compound body motion needs --runtime and --cache')
    argv=['node',str(HERE/'motion_bake.mjs'),'-','--runtime',str(runtime),'--cache',str(cache),'--out','-']
    if offline: argv.append('--offline')
    r=subprocess.run(argv,input=compact(motion),text=True,capture_output=True,timeout=180)
    if r.returncode: raise ValueError(r.stderr.strip()[:1500])
    return json.loads(r.stdout)


def validate_objects(commands):
    if not isinstance(commands,list) or any(not isinstance(c,dict) for c in commands): raise ValueError('Objects must be a command array')
    if len(commands)>396: raise ValueError('Object budget exceeded')
    declared=set(); last=None
    for c in commands:
        if c.get('op')=='object.add':
            ref=c.get('clientRef')
            if not isinstance(ref,str) or not 1<=len(ref)<=160 or ref in declared: raise ValueError('Unique nonempty string clientRef required (max 160 characters)')
            if c.get('kind') not in ['shape','environment','human','animal','camera','upload']: raise ValueError('Invalid object kind')
            declared.add(c['clientRef'])
            last=c['clientRef']
            choices={'shape':('shape',['box','sphere','pyramid','cone','cylinder','donut','tube']),
                     'environment':('environment',['wall','floor','stair']),'animal':('species',['dog','cat'])}
            if c['kind'] in choices:
                field,values=choices[c['kind']]
                if c.get(field) not in values: raise ValueError('Missing or invalid '+field)
            if c['kind']=='upload' and not c.get('mediaId'): raise ValueError('Upload requires an existing mediaId')
            if any(k in c for k in ['url','fileName','format','objectId']): raise ValueError('No invented IDs or server-resolved fields')
            if 'name' in c and (not isinstance(c['name'],str) or len(c['name'])>160): raise ValueError('Invalid object name')
            t=c.get('transform',{})
            if set(t)!={'position','rotation','scale'}: raise ValueError('Object transform requires position/rotation/scale')
            for k,v in t.items():
                if not isinstance(v,list) or len(v)!=3 or any(type(n) not in [int,float] or not math.isfinite(n) for n in v): raise ValueError('Invalid transform vector')
                if k=='scale' and min(v)<=0: raise ValueError('Positive scale required')
        elif c.get('op')=='object.setColor':
            if c.get('clientRef')!=last or last is None: raise ValueError('Color must immediately follow its own object declaration')
            color=c.get('color','')
            if len(color)!=7 or color[0]!='#' or any(x not in '0123456789abcdefABCDEF' for x in color[1:]): raise ValueError('Invalid color')
        else: raise ValueError('Compiler object list is add/setColor only; revisions use scoped MCP directly')
    if len(declared)>198: raise ValueError('Object budget exceeded including actor/camera')


def object_batches(commands):
    # Keep each declaration and dependent color together; clientRef cannot cross batches.
    groups=[]
    for c in commands:
        if c['op']=='object.add': groups.append([c])
        else: groups[-1].append(c)
    result=[]; current=[]
    for group in groups:
        if len(group)>50 or len(compact(group).encode())>65536: raise ValueError('Object group too large')
        if current and (len(current+group)>50 or len(compact(current+group).encode())>65536): result.append(current);current=[]
        current+=group
    if current: result.append(current)
    return result


def geometry_checks(plan, body, objects, shot):
    issues=[]; peak=0.; aspect=plan['summary']['aspect']; w,h=map(float,aspect.split(':'))
    margin=shot.get('bodyClearanceMargin',.05)
    if type(margin) not in [int,float] or not math.isfinite(margin) or margin<0: raise ValueError('Invalid body clearance margin')
    for p,b in zip(plan['samples'],body['samples'] if body else [None]*len(plan['samples'])):
        yaw=math.radians(p['subject']['yaw']); co,si=math.cos(yaw),math.sin(yaw); root=p['subject']['position']
        markers=b['markers'] if b else {'feet':[0,0,0],'head':[0,1.8,0]}
        world_markers={}
        for name,v in markers.items():
            world=[root[0]+co*v[0]+si*v[2],root[1]+v[1],root[2]-si*v[0]+co*v[2]]
            world_markers[name]=world
            q=screen_point(world,p['camera']['position'],p['camera']['target'],p['camera']['focalLength'],w/h)
            if q is None or q[2]<=.05 or q[2]>=40: raise ValueError('Camera orientation/clipping risk')
            peak=max(peak,abs(q[0]),abs(q[1]))
        if body:
            for obstacle in shot.get('obstacles',[]):
                expanded={'min':[n-margin for n in obstacle['min']],'max':[n+margin for n in obstacle['max']]}
                points=any(inside_box(v,expanded,0) for v in world_markers.values())
                chains=any(ray_box(world_markers[a],world_markers[z],expanded) for a,z in
                           [('legL','footL'),('footL','toeL'),('legR','footR'),('footR','toeR')])
                if points or chains: raise ValueError('Body/obstacle proxy clearance at frame '+str(p['frame'])+': '+obstacle.get('name','obstacle'))
        for c in objects:
            if c['op']!='object.add' or c.get('shape')!='box' or c['transform']['rotation']!=[0,0,0]: continue
            t=c['transform'];pos,scale=t['position'],t['scale']
            box={'min':[x-y/2 for x,y in zip(pos,scale)],'max':[x+y/2 for x,y in zip(pos,scale)]}
            if inside_box(p['camera']['position'],box,.15) or ray_box(p['camera']['position'],p['camera']['target'],box):
                issues.append((p['frame'],c.get('name',c['clientRef'])))
    if peak>shot.get('frameSafeNdc',.9) or issues: raise ValueError(f'Geometry check failed: marker NDC={peak:.3f}; collisions={issues[:4]}')
    planner_issues={k:v for k,v in plan['summary']['issues'].items() if not (body and k.startswith('subject_collision:'))}
    if planner_issues: raise ValueError('Resolve planner proxy issues: '+str(planner_issues))
    return {'maxMarkerNdc':round(peak,6),'cameraCollisionCount':0,
            'bodyObstacleChecks':bool(body and shot.get('obstacles')),
            'scope':'numeric markers, lower-leg segments and axis-aligned proxies; no skin/contact/pixel verification'}


def compile_spec(spec, runtime=None, cache=None, offline=False):
    if spec.get('format')!='3dref-production-v1': raise ValueError('Expected 3dref-production-v1')
    if not isinstance(spec.get('actorName','Actor'),str) or not 1<=len(spec.get('actorName','Actor'))<=160: raise ValueError('Actor name must be 1–160 characters')
    if spec.get('actorColor'):
        color=spec['actorColor']
        if not isinstance(color,str) or len(color)!=7 or color[0]!='#' or any(x not in '0123456789abcdefABCDEF' for x in color[1:]): raise ValueError('Invalid actor color')
    motion=motion_spec(spec); body=compile_body(motion,runtime,cache,offline)
    if 'shot' not in spec: raise ValueError('Generic mode requires shot')
    for field in ['durationSeconds','fps','aspect']:
        if field in spec and spec[field]!=spec['shot'].get(field): raise ValueError('Conflicting top-level and shot '+field)
    if spec['shot'].get('near',.05)!=.05 or spec['shot'].get('far',40)!=40: raise ValueError('Compiler camera profile uses near=.05, far=40; use scoped MCP for a different verified profile')
    plan=build(spec['shot']);objects=copy.deepcopy(spec.get('objects',[]))
    if body and (body['fps']!=plan['summary']['fps'] or body['durationSeconds']!=plan['summary']['durationSeconds']): raise ValueError('Body and shot timing mismatch')
    validate_objects(objects)
    checks=geometry_checks(plan,body,objects,spec['shot'])
    baseline=body['baseline'] if body else spec.get('nativePreset')
    moving=['idle','walking','running','jumping','turning','waving','sitting-idle','falling']
    still=['t-pose','standing-idle','sitting','crouch','reaching','pointing','lying']
    if baseline not in moving+still: raise ValueError('Declare a live nativePreset or a source-derived motion block')
    slot='poseAsset' if baseline in still else 'animation'
    keys=encode(plan,ACTOR,CAMERA,body=body,root_height_mode='ground-path' if body else None)
    timing={'durationSeconds':plan['summary']['durationSeconds'],'fps':plan['summary']['fps'],'aspect':plan['summary']['aspect']}
    setup=[{'op':'object.rename','objectId':ACTOR,'name':spec.get('actorName','Actor')},
           {'op':'motion.applyPreset','objectId':ACTOR,'presetKey':baseline,'slot':slot,'startFrame':0}]
    if spec.get('actorColor'): setup.append({'op':'object.setColor','objectId':ACTOR,'color':spec['actorColor']})
    batches=[{'domain':'scene','commands':[{'op':'scene.setTiming','durationSeconds':timing['durationSeconds'],'fps':timing['fps']}]},
             {'domain':'object','commands':setup}]
    batches += [{'domain':'object','commands':cs} for cs in object_batches(objects)]
    batches.append({'domain':'camera','commands':[{'op':'camera.setAspect','objectId':CAMERA,'aspect':timing['aspect']},
        {'op':'camera.set','objectId':CAMERA,'destination':{'kind':'base'},'camera':{'focalLength':plan['samples'][0]['camera']['focalLength'],'near':.05,'far':40}}]})
    batches+=keys
    # Account for snapshots and objects, not only outgoing patches.
    snapshots={}
    for b in keys:
        for c in b['commands']: snapshots.setdefault((c['objectId'],c['frame']),{}).update(c['patch'])
    size=len(compact(list(snapshots.values())).encode())+len(snapshots)*60+len(compact(objects).encode())*2+16384
    if len(snapshots)>2000: raise ValueError('Keyframe capacity exceeded')
    if size>524288: raise ValueError('Estimated scene document exceeds live-profile capacity')
    summary={'timing':timing,'objects':2+sum(c['op']=='object.add' for c in objects),'storedKeys':len(snapshots),
        'commands':sum(len(b['commands']) for b in batches),'batches':len(batches),'estimatedSceneBytes':size,
        'checks':checks,'body':body['summary'] if body else None,'bodyReduction':keys[0].get('bodyReduction') if keys else None}
    bundle={'format':'3dref-run-v3','schemaVersion':1,'timing':timing,'baseline':baseline,'freshTemplate':'human_camera',
            'sources':body['sources'] if body else [],'batches':batches,'summary':summary}
    bundle['digest']=digest(bundle)
    return bundle


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('spec',type=Path);p.add_argument('--run',type=Path,required=True)
    p.add_argument('--runtime',type=Path);p.add_argument('--cache',type=Path)
    p.add_argument('--offline',action='store_true');args=p.parse_args()
    try:
        existing=list(args.run.iterdir()) if args.run.exists() else []
        if existing and not (len(existing)==1 and existing[0].resolve()==args.spec.resolve() and existing[0].name=='spec.json'):
            raise ValueError('Use a new run with only its input spec.json; no implicit overwrite')
        spec=json.loads(args.spec.read_text());bundle=compile_spec(spec,args.runtime,args.cache,args.offline)
        atomic(args.run/'spec.json',spec);atomic(args.run/'compiled.json',bundle)
        with (args.run/'journal.jsonl').open('x') as f:
            f.write(compact({'type':'init','runId':uuid.uuid4().hex,'digest':bundle['digest']})+'\n')
            f.flush();os.fsync(f.fileno())
        print(compact({'run':str(args.run),'files':3,**bundle['summary']}))
    except (ValueError,KeyError,TypeError,OSError,subprocess.TimeoutExpired) as exc: p.exit(2,f'3Dref compiler: {exc}\n')


if __name__=='__main__': main()
