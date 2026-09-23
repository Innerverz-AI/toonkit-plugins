#!/usr/bin/env python3
"""All-frame constraints for the production compiler.

Input is a generated numerical check document, not a hand-written frame array.
No screenshot, remote write, or credit use. CLI optionally binds exact MCP keys.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from spatial import (add,sub,dot,unit,rotate,xyz_columns,project,box_corners,
                     potentially_visible,angular_distance)
from plan import inside_box,ray_box,stats,derivative


def length(v): return math.sqrt(dot(v,v))
def hash_json(x): return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def finite(v): return type(v) in (int,float) and math.isfinite(v)
def vector(v): return isinstance(v,list) and len(v)==3 and all(finite(n) for n in v)
def require(ok,message):
    if not ok: raise ValueError(message)

def validate(data):
    require(data.get('format')=='3dref-check-v1','Expected 3dref-check-v1')
    fps,duration=data['fps'],data['durationSeconds'];n=round(fps*duration)
    require(fps in [12,15,24,30,60] and 2<=duration<=30 and abs(n-fps*duration)<1e-8,'Invalid check timing')
    cams=data['cameras'];actors=data['actors'];quality=data['quality'];proxies=data.get('proxies',[])
    require(len(cams)==n and actors,'Every frame needs a camera and at least one actor')
    require(len({a['id'] for a in actors})==len(actors),'Duplicate actor ID')
    w,h=map(float,data['aspect'].split(':'));aspect=w/h;sensor=data.get('sensorWidthMm',36)
    near,far=data.get('near',.05),data.get('far',40)
    require(0<near<far and finite(sensor) and sensor>0,'Invalid projection')
    for rows in [cams]+[a['samples'] for a in actors]:
        require(len(rows)==n,'Incomplete frame coverage')
        for i,s in enumerate(rows):
            require(s.get('frame')==i and vector(s.get('position')) and vector(s.get('rotation')),'Finite ordered frame transforms required')
    require(all(finite(c['focalLength']) and 14<=c['focalLength']<=135 for c in cams),'Invalid camera lens')
    beats=quality.get('beats',[]);require(beats,'Declare shot beats before authoring')
    coverage=set();metrics={};actor_map={a['id']:a for a in actors};errors=[];warnings=[]
    def fail(code,frame,**evidence): errors.append({'code':code,'frame':frame,**evidence})
    heights={a['id']:[] for a in actors};projections={};marker_world={}
    for a in actors:
        body=a.get('bodyTrack')
        if body:
            require(body.get('format')=='3dref-body-v1' and body.get('requiresFreshActor') is True and body.get('fps')==fps and body.get('durationSeconds')==duration and len(body.get('samples',[]))==n,'Invalid body evidence')
            require(finite(body['summary'].get('maxRoundtripDegrees')) and body['summary']['maxRoundtripDegrees']<=.001 and bool(body.get('sources')),'Source quaternion evidence required')
            for i,(s,b) in enumerate(zip(a['samples'],body['samples'])):
                require(b['frame']==i and abs(s.get('bodyActionTime',-1)-b['actionTime'])<2e-6 and s['markers']==b['markers'],'Body clock/marker evidence mismatch')
                expected=add(s['groundPosition'],rotate([0,b['rootYOffset'],0],s['rotation']))
                require(length(sub(expected,s['position']))<2e-5,'Body root height ownership mismatch')
        require(all(isinstance(s.get('markers'),dict) and s['markers'] and all(vector(v) for v in s['markers'].values()) for s in a['samples']),'Every actor needs local body markers or explicit blocking bounds')
        projected=[];worlds=[]
        for i,s in enumerate(a['samples']):
            origin=s['position'] if body and body.get('markerSpace')=='object-local-after-root-offset' else s.get('groundPosition',s['position'])
            world={k:add(origin,rotate(v,s['rotation'])) for k,v in s['markers'].items()}
            q={k:project(v,cams[i],aspect,sensor) for k,v in world.items()}
            ys=[v[1] for v in q.values()];heights[a['id']].append((max(ys)-min(ys))/2 if all(math.isfinite(y) for y in ys) else float('inf'))
            projected.append(q);worlds.append(world)
        projections[a['id']]=projected;marker_world[a['id']]=worlds
    for beat in beats:
        name=beat.get('name');require(isinstance(name,str) and name,'Named beats required')
        start,end=beat['start'],beat['end']
        require(finite(start) and finite(end) and 0<=start<end<=duration,'Invalid beat interval')
        frames=[i for i in range(n) if start-1e-8<=i/fps<end-1e-8]
        require(frames,'Beat contains no playable frames');coverage.update(frames)
        require(set(beat.get('actors',{}))==set(actor_map),'Each beat must account for every actor, including intentional offscreen actors')
        for aid,rule in beat['actors'].items():
            if rule.get('offscreen'):
                require(bool(rule.get('reason')),'Intentional offscreen actor needs a reason');continue
            lo,hi=rule['height'];require(0<lo<hi<=1.5,'Declare positive subject height band as fraction of image height')
            safe=rule.get('frameSafeNdc',.9);require(0<safe<=1.5,'Invalid framing margin')
            for i in frames:
                q=projections[aid][i]
                if any(v[2]<=near or v[2]>=far or abs(v[0])>safe or abs(v[1])>safe for v in q.values()): fail(name+':framing:'+aid,i,markers={k:v for k,v in q.items() if v[2]<=near or v[2]>=far or abs(v[0])>safe or abs(v[1])>safe},safeNdc=safe,depth=[near,far])
                if not lo<=heights[aid][i]<=hi: fail(name+':subject-size:'+aid,i,actual=heights[aid][i],allowed=[lo,hi])
            travel=sum(length(sub(actor_map[aid]['samples'][b]['position'],actor_map[aid]['samples'][a]['position'])) for a,b in zip(frames,frames[1:]))
            if travel<rule.get('minTravel',0) or travel>rule.get('maxTravel',float('inf')): fail(name+':travel:'+aid,frames[0])
            slow=rule.get('actionRate')
            if slow is not None:
                require(len(slow)==2 and 0<slow[0]<=slow[1],'Invalid action-rate band')
                require(bool(actor_map[aid].get('bodyTrack')),'Retiming requires source-baked body evidence, not declared timestamps alone')
                for i in frames:
                    sample=actor_map[aid]['samples'][i]
                    require(all(finite(sample.get(k)) for k in ['actionTime','bodyActionTime','actionRate']),'Retiming requires baked root and body clock evidence; native root-only slowmo is unsupported')
                    if abs(sample['actionTime']-sample['bodyActionTime'])>2e-6 or not slow[0]-1e-6<=sample['actionRate']<=slow[1]+1e-6: fail(name+':retiming:'+aid,i)
        for surface in beat.get('surfaces',[]):
            aid=surface['actor'];require(aid in actor_map,'Unknown surface actor')
            require(vector(surface.get('normal')),'Surface normal must be a finite three-vector')
            normal=unit(surface['normal']);point=surface['point'];require(vector(point),'Invalid surface plane')
            for i in frames:
                sample=actor_map[aid]['samples'][i];right,up,back=xyz_columns(cams[i]['rotation'])
                screen_length=math.hypot(dot(normal,right),dot(normal,up))
                alignment=dot(normal,up)/screen_length if screen_length>1e-6 else -1
                if alignment<surface.get('screenUpMin',.6): fail(name+':floor-is-ceiling-or-edge:'+aid,i)
                if dot(rotate([0,1,0],sample['rotation']),normal)<surface.get('actorUpMin',.8): fail(name+':actor-surface-orientation:'+aid,i)
                if abs(dot(sub(sample.get('groundPosition',sample['position']),point),normal))>surface.get('maxRootDistance',.1): fail(name+':root-surface-distance:'+aid,i)
                worlds=marker_world[aid][i]
                if 'head' in worlds:
                    foot_names=[k for k in ('feet','footL','footR') if k in worlds]
                    if foot_names:
                        head=project(worlds['head'],cams[i],aspect,sensor)[1]
                        feet=sum(project(worlds[k],cams[i],aspect,sensor)[1] for k in foot_names)/len(foot_names)
                        if head<=feet: fail(name+':head-below-feet:'+aid,i)
        cm=beat.get('cameraMotion',{})
        translation=sum(length(sub(cams[b]['position'],cams[a]['position'])) for a,b in zip(frames,frames[1:]))
        angle=sum(angular_distance(cams[a]['rotation'],cams[b]['rotation']) for a,b in zip(frames,frames[1:]))
        if translation<cm.get('minTravel',0) or angle<cm.get('minRotationDegrees',0): fail(name+':missing-camera-motion',frames[0])
        # Invariant relative composition can be an intentional tracking shot. Require a reason to hold it.
        frozen=relative=0;max_frozen=max_relative=0
        for a,b in zip(frames,frames[1:]):
            static=length(sub(cams[b]['position'],cams[a]['position']))<1e-5 and angular_distance(cams[a]['rotation'],cams[b]['rotation'])<1e-3 and abs(cams[a]['focalLength']-cams[b]['focalLength'])<1e-5
            static=static and all(length(sub(x['samples'][a]['position'],x['samples'][b]['position']))<1e-5 and angular_distance(x['samples'][a]['rotation'],x['samples'][b]['rotation'])<1e-3 for x in actors)
            static=static and all(length(sub(marker_world[aid][a][k],marker_world[aid][b][k]))<1e-5 for aid in actor_map for k in marker_world[aid][a])
            relative_static=True
            for aid,rule in beat['actors'].items():
                if rule.get('offscreen'):continue
                sa,sb=actor_map[aid]['samples'][a],actor_map[aid]['samples'][b]
                ba,bb=xyz_columns(sa['rotation']),xyz_columns(sb['rotation'])
                va=[dot(sub(cams[a]['position'],sa['position']),axis) for axis in ba]
                vb=[dot(sub(cams[b]['position'],sb['position']),axis) for axis in bb]
                ra=[[dot(col,axis) for axis in ba] for col in xyz_columns(cams[a]['rotation'])]
                rb=[[dot(col,axis) for axis in bb] for col in xyz_columns(cams[b]['rotation'])]
                # Centered feet/head can project identically during a real orbit.
                # A hold needs the camera/actor relative frame to stay fixed too.
                if length(sub(va,vb))>1e-4 or any(length(sub(x,y))>1e-4 for x,y in zip(ra,rb)):relative_static=False
                pa,pb=projections[aid][a],projections[aid][b]
                if any(not all(math.isfinite(x) for x in pa[k][:2]+pb[k][:2]) or math.hypot(pa[k][0]-pb[k][0],pa[k][1]-pb[k][1])>1e-4 for k in pa): relative_static=False
            frozen=frozen+1 if static else 0;relative=relative+1 if relative_static else 0
            max_frozen=max(max_frozen,frozen);max_relative=max(max_relative,relative)
        for label,seconds,option in [('static',max_frozen/fps,'allowStatic'),('relative-hold',max_relative/fps,'allowRelativeHold')]:
            limit=beat.get('maxStaticSeconds' if label=='static' else 'maxRelativeHoldSeconds',2)
            require(finite(limit) and limit>=0,'Invalid hold limit')
            if seconds>limit:
                if not beat.get(option):
                    explicit='maxStaticSeconds' if label=='static' else 'maxRelativeHoldSeconds'
                    if explicit in beat:fail(name+':'+label,frames[0])
                    else:warnings.append({'code':name+':'+label,'seconds':seconds,'reason':'Review against intended direction; a hold is not inherently invalid'})
                else:require(isinstance(beat[option],str),'Hold exemption must explain intended direction')
        metrics[name]={'cameraTravel':round(translation,4),'cameraRotationDegrees':round(angle,4),'longestStaticSeconds':max_frozen/fps,'longestRelativeHoldSeconds':max_relative/fps}
    require(coverage==set(range(n)),'Beats do not cover the entire playable timeline')
    require(len({b['name'] for b in beats})==len(beats),'Duplicate beat name')
    proxy_report=[];ids=set()
    require(len(proxies)<=quality.get('maxProxies',24),'Proxy budget exceeded; simplify visible structures or declare a justified budget before dispatch')
    if quality.get('maxProxies',24)>24:require(bool(quality.get('budgetReason')),'Larger proxy budget needs a shot-specific reason')
    for p in proxies:
        require(p['id'] not in ids,'Duplicate proxy ID');ids.add(p['id'])
        require(p.get('purpose') and p.get('boundsSource'),'Every proxy needs shot purpose and actual bounds provenance')
        require(p.get('role') in ['visible','contact','occluder','orientation'],'Invalid proxy role')
        bound=p['bounds'];require(vector(bound['min']) and vector(bound['max']) and all(a<b for a,b in zip(bound['min'],bound['max'])),'Invalid local bounds')
        t=p['transform'];require(all(vector(t.get(k)) for k in ['position','rotation','scale']) and min(t['scale'])>0,'Invalid proxy transform')
        corners=box_corners(bound,t);visible=[i for i,c in enumerate(cams) if potentially_visible(corners,c,aspect,near,far,sensor)]
        if not visible and p['role'] in ['visible','orientation']:fail('offscreen-proxy:'+p['id'],0)
        if not visible and p['role'] in ['contact','occluder']:
            require(p.get('usedBy') and all(b in metrics for b in p['usedBy']),'Offscreen functional proxy needs named interaction beats')
        proxy_report.append({'id':p['id'],'potentiallyVisibleFrames':len(visible),'first':visible[0] if visible else None,'last':visible[-1] if visible else None})
        # OBB local-space ray tests, with world margin conservatively converted per axis.
        if p.get('solid',True):
            columns=xyz_columns(t['rotation'])
            local=lambda v:[dot(sub(v,t['position']),col)/scale for col,scale in zip(columns,t['scale'])]
            expanded={'min':[x-.15/s for x,s in zip(bound['min'],t['scale'])],'max':[x+.15/s for x,s in zip(bound['max'],t['scale'])]}
            for i,c in enumerate(cams):
                origin=local(c['position'])
                if inside_box(origin,expanded):fail('camera-proxy-collision:'+p['id'],i)
                if i and ray_box(local(cams[i-1]['position']),origin,expanded):fail('camera-swept-proxy-collision:'+p['id'],i)
                for aid in actor_map:
                    active=[b for b in beats if b['start']<=i/fps<b['end'] and not b['actors'][aid].get('offscreen')]
                    if not active:continue
                    blocked=[k for k,v in marker_world[aid][i].items() if ray_box(origin,local(v),bound)]
                    if blocked:fail('proxy-occludes-actor:'+p['id']+':'+aid,i,markers=blocked)
    limits=quality.get('limits',{})
    speed_metrics={'camera':stats([c['position'] for c in cams],fps)}
    speed_metrics['camera']['maxAngularSpeed']=max((angular_distance(a['rotation'],b['rotation'])*fps for a,b in zip(cams,cams[1:])),default=0)
    for a in actors:speed_metrics[a['id']]=stats([s['position'] for s in a['samples']],fps)
    motion_frames={}
    for name,rows in [('camera',cams)]+[(a['id'],a['samples']) for a in actors]:
        points=[s['position'] for s in rows];motion_frames[name]={}
        for order,k in enumerate(('maxSpeed','maxAcceleration','maxJerk'),1):
            points=derivative(points,fps);values=[length(v) for v in points]
            motion_frames[name][k]=values.index(max(values)) if values else 0
        if name=='camera':
            values=[angular_distance(a['rotation'],b['rotation'])*fps for a,b in zip(rows,rows[1:])]
            motion_frames[name]['maxAngularSpeed']=values.index(max(values)) if values else 0
    for name,values in speed_metrics.items():
        for k,v in values.items():
            bound=limits.get(name,{}).get(k)
            if bound is not None:
                require(finite(bound) and bound>0,'Invalid motion limit')
                if v>bound:fail('motion-limit:'+name+':'+k,motion_frames[name][k],actual=v,maximum=bound,frameMeaning='start of finite-difference window')
    grouped={}
    for e in errors:
        g=grouped.setdefault(e['code'],{'count':0,'first':e['frame'],'last':e['frame'],'examples':[]});g['count']+=1;g['last']=e['frame']
        if len(g['examples'])<3:g['examples'].append({k:v for k,v in e.items() if k!='code'})
    return {'passed':not errors,'frameCount':n,'actorCount':len(actors),'proxyCount':len(proxies),'issues':grouped,'beats':metrics,'motion':speed_metrics,'motionPeakFrames':motion_frames,'proxies':proxy_report,
            'scope':'All output frames; measured/source-derived or declared proxy geometry; no pixel, skin, IK or engine-interpolation certificate',
            'projectionSource':data.get('projectionSource','36mm assumed horizontal sensor; not calibrated'),
            'warnings':warnings,'inputHash':hash_json(data)}


def verify_commands(data,commands,actor_position_tolerance=2e-5,actor_angle_tolerance=2e-4):
    """Bind check samples to full root/camera MCP keys. Custom routes use linear XYZ.

    Source-baked tracks supply bodyTrack evidence. Compare
    interpolated emitted additive corrections against those source-derived keys.
    """
    frames=len(data['cameras']);tracks={data['cameraId']:data['cameras'],**{a['id']:a['samples'] for a in data['actors']}}
    proxies={p['id']:p for p in data.get('proxies',[])}
    for c in commands:
        if c.get('op')=='keyframe.upsert' and 'transform' in c.get('patch',{}):
            require(c.get('objectId') in tracks,'Every animated object needs a checked track')
        if c.get('op')=='object.add' and c.get('kind') in ['shape','environment']:
            p=proxies.get(c.get('clientRef'))
            require(p is not None and p['transform']==c.get('transform'),'Proxy/declaration transform mismatch')
        if c.get('op')=='object.setTransform':
            p=proxies.get(c.get('objectId'))
            require(p is not None and c.get('destination')=={'kind':'base'} and p['transform']==c.get('transform'),'Custom transform writes need full checked base proxy data; animate via checked keyframes')
    for ident,expected in tracks.items():
        keys=sorted([c for c in commands if c.get('op')=='keyframe.upsert' and c.get('objectId')==ident and 'transform' in c.get('patch',{})],key=lambda c:c['frame'])
        require(keys and keys[0]['frame']==0 and keys[-1]['frame']==frames-1,'Keys must cover both timeline endpoints: '+ident)
        require(len({k['frame'] for k in keys})==len(keys),'Duplicate transform keys')
        for row in expected:
            f=row['frame'];a=max((k for k in keys if k['frame']<=f),key=lambda k:k['frame']);b=min((k for k in keys if k['frame']>=f),key=lambda k:k['frame'])
            u=0 if a==b else (f-a['frame'])/(b['frame']-a['frame'])
            for field in ['position','rotation']:
                x,y=a['patch']['transform'][field],b['patch']['transform'][field]
                if field=='rotation' and data.get('interpolation')=='legacy-shortest':
                    from engine_v1 import angle
                    value=[angle(v,w,u) for v,w in zip(x,y)]
                else:value=[v+(w-v)*u for v,w in zip(x,y)]
                error=length(sub(value,row[field])) if field=='position' else angular_distance(value,row[field])
                tolerance=(2e-5 if field=='position' else 2e-4) if ident==data['cameraId'] else (actor_position_tolerance if field=='position' else actor_angle_tolerance)
                require(error<tolerance,'Check/command mismatch: '+ident+':'+field+':'+str(f))
            if ident==data['cameraId']:
                x,y=a['patch']['camera']['focalLength'],b['patch']['camera']['focalLength']
                require(abs(x+(y-x)*u-row['focalLength'])<2e-5,'Check/command lens mismatch')
        actor=next((a for a in data['actors'] if a['id']==ident),None)
        if actor and actor.get('bodyTrack'):
            from mcp_plan import rotation_error,HUMAN_JOINTS
            poses={k['frame']:{} for k in keys}
            for c in commands:
                if c.get('op')=='keyframe.upsert' and c.get('objectId')==ident and 'pose' in c.get('patch',{}):
                    poses.setdefault(c['frame'],{}).update(c['patch']['pose'])
            zero={'tiltX':0,'tiltZ':0,'twist':0}
            for row in actor['bodyTrack']['samples']:
                f=row['frame'];a=max(k for k in poses if k<=f);b=min(k for k in poses if k>=f);u=0 if a==b else (f-a)/(b-a)
                require(set(row['pose'])==HUMAN_JOINTS,'Incomplete source body pose')
                for joint,target in row['pose'].items():
                    x,y=poses[a].get(joint,zero),poses[b].get(joint,zero)
                    actual={k:x[k]+(y[k]-x[k])*u for k in zero}
                    require(rotation_error(actual,target)<actor_angle_tolerance,'Check/command body mismatch: '+ident+':'+joint+':'+str(f))
    return hash_json(commands)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('input',type=Path);parser.add_argument('--commands',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    try:
        data=json.loads(args.input.read_text());commands=json.loads(args.commands.read_text());report=validate(data)
        report['commandsHash']=verify_commands(data,commands)
        args.out.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(json.dumps(report,separators=(',',':')))
        if not report['passed']:parser.exit(2,'Preflight failed; no dispatch/export\n')
    except (ValueError,KeyError,TypeError,OSError) as e:parser.exit(2,'Preflight: '+str(e)+'\n')

if __name__=='__main__':main()
