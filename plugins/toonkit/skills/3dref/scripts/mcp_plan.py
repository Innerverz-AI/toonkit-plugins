#!/usr/bin/env python3
"""Encode neutral samples as bounded, single-domain Toonkit MCP batches.

No network, credentials, model calls, or execution side effects beyond output files.
The caller obtains object IDs and fresh revisions from the connected MCP server.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from plan import cross, norm, sub, unit

HUMAN_JOINTS=set('body head neck chest upperAbdomen lowerAbdomen shoulderR upperArmR foreArmR handR shoulderL upperArmL foreArmL handL upLegR legR footR toeR upLegL legL footL toeL'.split())


def pose_quaternion(p):
    # q_y * q_x * q_z: Toonkit's additive bone-local YXZ convention.
    x,y,z=(math.radians(p[k])/2 for k in ('tiltX','twist','tiltZ'))
    sx,cx,sy,cy,sz,cz=math.sin(x),math.cos(x),math.sin(y),math.cos(y),math.sin(z),math.cos(z)
    return [sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz]


def rotation_error(a,b):
    # Left multiplication by the same baseline quaternion preserves angular error.
    d=abs(sum(x*y for x,y in zip(pose_quaternion(a),pose_quaternion(b))))
    return math.degrees(2*math.acos(max(-1,min(1,d))))


def reduce_body_keys(commands,angle_tolerance=1.0,position_tolerance=.003):
    """Keep output FPS; remove only keys whose linear interpolation is bounded.

    All original output frames are checked. This does not certify subframes,
    collisions, support, or a different engine interpolation mode.
    """
    if not math.isfinite(angle_tolerance) or not 0<angle_tolerance<=5 or not math.isfinite(position_tolerance) or not 0<position_tolerance<=.02:
        raise ValueError('Reduction tolerance must be (0,5] degrees and (0,.02] meters')
    if len(commands)<2:
        return commands,{'kept':len(commands),'original':len(commands),'maxAngleDegrees':0,'maxPositionMeters':0}
    quats=[{j:pose_quaternion(v) for j,v in c['patch']['pose'].items()} for c in commands]
    def error(a,b,k):
        left,right,actual=commands[a],commands[b],commands[k]
        u=(actual['frame']-left['frame'])/(right['frame']-left['frame'])
        p,q,r=left['patch'],right['patch'],actual['patch']
        pos=[x+(y-x)*u for x,y in zip(p['transform']['position'],q['transform']['position'])]
        pe=norm(sub(pos,r['transform']['position']))
        yaw=p['transform']['rotation'][1]
        delta=(q['transform']['rotation'][1]-yaw)%360
        if delta>180:delta-=360
        ae=abs((yaw+delta*u-r['transform']['rotation'][1]+180)%360-180)
        for j in p['pose']:
            channels={field:v+(q['pose'][j][field]-v)*u for field,v in p['pose'][j].items()}
            d=abs(sum(x*y for x,y in zip(pose_quaternion(channels),quats[k][j])))
            ae=max(ae,math.degrees(2*math.acos(max(-1,min(1,d)))))
        return ae,pe
    keep={0,len(commands)-1};stack=[(0,len(commands)-1)]
    while stack:
        a,b=stack.pop();worst=1.0;split=None
        for k in range(a+1,b):
            ae,pe=error(a,b,k);score=max(ae/angle_tolerance,pe/position_tolerance)
            if score>worst:worst,split=score,k
        if split is not None:
            keep.add(split);stack.extend([(a,split),(split,b)])
    kept=sorted(keep);max_a=max_p=0
    for a,b in zip(kept,kept[1:]):
        for k in range(a+1,b):
            ae,pe=error(a,b,k);max_a,max_p=max(max_a,ae),max(max_p,pe)
    return [commands[i] for i in kept],{'original':len(commands),'kept':len(kept),
        'maxAngleDegrees':round(max_a,8),'maxPositionMeters':round(max_p,8),
        'angleToleranceDegrees':angle_tolerance,'positionToleranceMeters':position_tolerance,'sampleScope':'all output frames; not subframes'}


def look_at_xyz(position,target,previous=None):
    back=unit(sub(position,target))
    right=cross([0,1,0],back)
    if norm(right)<1e-5:
        raise ValueError('Exact overhead orientation needs explicit roll control; use native camera.lookAt and verify')
    right=unit(right)
    up=cross(back,right)
    # Three-style world-up lookAt matrix -> XYZ Euler. Checked against the live
    # Toonkit camera.lookAt output; keep this wire profile tied to schema v1.
    y=math.asin(max(-1,min(1,back[0])))
    if abs(back[0])<.9999999:
        x=math.atan2(-back[1],back[2])
        z=math.atan2(-up[0],right[0])
    else:
        x=math.atan2(up[2],up[1])
        z=0
    base=[math.degrees(v) for v in (x,y,z)]
    if previous is None:
        return base
    candidates=[base,[base[0]+180,180-base[1],base[2]+180]]
    candidates=[[v+360*round((p-v)/360) for v,p in zip(c,previous)] for c in candidates]
    return min(candidates,key=lambda c:sum((a-b)**2 for a,b in zip(c,previous)))


def encode(plan,subject_id,camera_id,overwrite=False,max_commands=50,max_bytes=65536,body=None,root_height_mode=None,
           reduce_body=False,body_angle_tolerance=1.0,body_position_tolerance=.003):
    if plan.get('format')!='3dref-neutral-v1':
        raise ValueError('Unsupported neutral plan format')
    if plan['summary']['errors']:
        raise ValueError('Resolve planner errors before encoding')
    if not subject_id or not camera_id or subject_id==camera_id:
        raise ValueError('Distinct server-returned subject and camera IDs are required')
    if not 1<=max_commands<=50 or max_bytes<=0:
        raise ValueError('Invalid batch limits')
    native_body=body is not None and body.get('profile')=='stock-human-native-v1'
    if body is not None:
        if body.get('format')!='3dref-body-v1' or body.get('profile') not in ['stock-human-standing-v1','stock-human-native-v1']:
            raise ValueError('Unsupported body-track profile')
        if body.get('requiresFreshActor') is not True:
            raise ValueError('Body tracks must declare and use a fresh correction-free actor')
        valid_baseline=body.get('baseline') in (['running','walking','idle'] if native_body else ['standing-idle'])
        if not valid_baseline or body.get('rootHeightOwner')!='body' or root_height_mode!='ground-path':
            raise ValueError('Body bake requires its declared baseline and an explicit ground-path root (no extra jump parabola)')
        if body['fps']!=plan['summary']['fps'] or body['durationSeconds']!=plan['summary']['durationSeconds']:
            raise ValueError('Body and camera timeline timing must match exactly')
        error=body['summary']['maxRoundtripDegrees']
        if len(body['samples'])!=len(plan['samples']) or not math.isfinite(error) or not 0<=error<=.001:
            raise ValueError('Incomplete or unverified body samples')
    if native_body and (reduce_body or overwrite):
        raise ValueError('Native-baseline overlays require a fresh actor, no overwrite flag and no body reduction')
    if reduce_body and (body is None or overwrite):
        raise ValueError('Body reduction requires a source body track on a fresh key-empty actor (no overwrite)')
    commands=[]
    previous=None
    for index,sample in enumerate(plan['samples']):
        cam=sample['camera']
        rotation=look_at_xyz(cam['position'],cam['target'],previous)
        previous=rotation
        subject_patch={'transform':{'position':list(sample['subject']['position']),'rotation':[0,sample['subject']['yaw'],0]}}
        if body is not None:
            action=body['samples'][index]
            if action['frame']!=sample['frame']:
                raise ValueError('Body frames must be ordered and align with camera samples')
            if not math.isfinite(action['rootYOffset']):
                raise ValueError('Body height must be finite')
            if set(action['pose'])!=HUMAN_JOINTS:
                raise ValueError('Source body samples must contain all 22 stock-human joints exactly')
            for joint,channels in action['pose'].items():
                if set(channels)!={'tiltX','tiltZ','twist'} or any(not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) for v in channels.values()):
                    raise ValueError('Body joint corrections must be complete finite channels')
            subject_patch['transform']['position'][1]+=action['rootYOffset']
            subject_patch['pose']=action['pose']
        for object_id,patch in [
            (subject_id,subject_patch),
            (camera_id,{'transform':{'position':cam['position'],'rotation':[round(v,6) for v in rotation]},
                        'camera':{'focalLength':cam['focalLength']}})
        ]:
            commands.append({'op':'keyframe.upsert','objectId':object_id,'frame':sample['frame'],
                             'overwrite':overwrite,'patch':patch})
    reduction=None
    if native_body:
        # Root/camera keys first while fresh actor has no manual corrections.
        # Then overwrite ONLY this run's newly-created actor keys with nonzero
        # source-derived pose patches. Empty native-run keys remain truly empty.
        overlays=[]
        for command in commands:
            if command['objectId']!=subject_id:
                continue
            pose=command['patch'].pop('pose')
            if any(abs(v)>1e-8 for channels in pose.values() for v in channels.values()):
                overlays.append({'op':'keyframe.upsert','objectId':subject_id,'frame':command['frame'],
                                 'overwrite':True,'patch':{'pose':pose}})
        commands.extend(overlays)
        reduction={'strategy':'native-baseline-overlay','actorFrames':len(plan['samples']),'poseOverlayFrames':len(overlays),
                   'sourceOrientationErrorDegrees':body['summary']['maxRoundtripDegrees'],'note':'Dispatch all base keys before overlays; fresh actor only'}
    elif reduce_body:
        subjects=[c for c in commands if c['objectId']==subject_id]
        subjects,reduction=reduce_body_keys(subjects,body_angle_tolerance,body_position_tolerance)
        commands=sorted(subjects+[c for c in commands if c['objectId']==camera_id],key=lambda c:c['frame'])
    if body is not None:
        # Conservative estimate: stored keys include full scale/near/far even when
        # patches omit them. Leave 64 KiB for objects, settings and existing data.
        snapshots={}
        for c in commands:
            key=(c['objectId'],c['frame'])
            snapshots.setdefault(key,{'frame':c['frame']}).update(c['patch'])
        estimated=len(json.dumps(list(snapshots.values()),separators=(',',':')).encode())+len(snapshots)*60
        if estimated>524288-65536:
            raise ValueError(f'Body bake estimated {estimated} key bytes exceeds scene reserve. Reduction={reduction}. Use native motion/overlays, measured reduction or authorized shorter shots; do not lower FPS silently.')
    batches=[]
    current=[]
    size=lambda x:len(json.dumps(x,separators=(',',':'),ensure_ascii=False).encode('utf-8'))
    for command in commands:
        if size([command])>max_bytes:
            raise ValueError('A single command exceeds the byte budget')
        if current and (len(current)>=max_commands or size(current+[command])>max_bytes):
            batches.append(current)
            current=[]
        current.append(command)
    if current:
        batches.append(current)
    result=[]
    for i,commands in enumerate(batches):
        digest=hashlib.sha256(json.dumps(commands,separators=(',',':'),sort_keys=True).encode()).hexdigest()[:20]
        result.append({'index':i,'domain':'keyframe','contentHash':digest,'commands':commands})
    if result and reduction is not None:
        result[0]['bodyReduction']=reduction
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan',type=Path)
    parser.add_argument('--subject-id',required=True)
    parser.add_argument('--camera-id',required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--overwrite',action='store_true',help='Only for explicitly authorized existing keys')
    parser.add_argument('--body',type=Path,help='Source-derived additive body track from motion_bake.mjs')
    parser.add_argument('--root-height-mode',choices=['ground-path'],help='Confirm path Y excludes source body jump/bob')
    parser.add_argument('--reduce-body',action='store_true',help='Error-bounded body-key reduction; preserves output FPS, requires fresh actor')
    parser.add_argument('--body-angle-tolerance',type=float,default=1.0)
    parser.add_argument('--body-position-tolerance',type=float,default=.003)
    args=parser.parse_args()
    try:
        plan=json.loads(args.plan.read_text(encoding='utf-8'))
        body=json.loads(args.body.read_text(encoding='utf-8')) if args.body else None
        batches=encode(plan,args.subject_id,args.camera_id,args.overwrite,body=body,root_height_mode=args.root_height_mode,
                       reduce_body=args.reduce_body,body_angle_tolerance=args.body_angle_tolerance,body_position_tolerance=args.body_position_tolerance)
    except (ValueError,KeyError,TypeError) as exc:
        parser.exit(2,f'Cannot encode: {exc}\n')
    args.out.mkdir(parents=True,exist_ok=True)
    entries=[]
    for batch in batches:
        filename=f"batch-{batch['index']:03d}.json"
        (args.out/filename).write_text(json.dumps(batch,separators=(',',':'))+'\n',encoding='utf-8')
        entries.append({'file':filename,'domain':batch['domain'],'commands':len(batch['commands']),'contentHash':batch['contentHash']})
    manifest={'format':'3dref-mcp-batches-v1','schemaVersion':1,'subjectId':args.subject_id,'cameraId':args.camera_id,'batches':entries,
              'bodyMode':'source-baked' if body else 'native-root-only',
              'bodyReduction':batches[0].get('bodyReduction') if batches else None,
              'requiredActor':{'kind':'human','modelOverride':False,'animation':body['baseline'] if body['profile']=='stock-human-native-v1' else None,
                               'animationStartFrame':0,'poseAsset':None if body['profile']=='stock-human-native-v1' else 'standing-idle',
                               'priorPoseCorrections':False,'keyEmptyBeforeBasePass':True,'scale':[1,1,1]} if body else None}
    (args.out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'batchCount':len(batches),'commandCount':sum(x['commands'] for x in entries),'manifest':str(args.out/'manifest.json')}))


if __name__=='__main__':
    main()
