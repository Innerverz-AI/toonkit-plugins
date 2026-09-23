"""One production route for one or many actors; no session-specific adapter."""
import copy,json,math,re
from plan import Curve
from spatial import *
from timewarp import TimeWarp
from geometry import PROFILE,box_object,resolve_surface,vector
from support import check_support
from engine_v1 import emit_tracks
from preflight import validate,verify_commands

CAMERA='@camera___________________'
IDENT=re.compile(r'^[a-z][a-z0-9_-]{0,47}$')

class PlanningError(ValueError):
    def __init__(self,stage,report):
        self.report={'stage':stage,**report}
        super().__init__(stage+': '+json.dumps(report.get('issues',report),separators=(',',':'))[:1800])

def compile_scene(spec,runtime=None,cache=None,offline=False):
    from compiler import compile_body,object_batches,compact,digest
    from intent import validate as validate_intent
    from interactions import validate as validate_interactions
    if spec.get('format')!='3dref-production-v2':raise ValueError('Expected 3dref-production-v2')
    validate_intent(spec)
    timing=spec['timing'];fps=timing.get('fps',24);duration=timing['durationSeconds'];aspect=timing.get('aspect','16:9')
    if type(fps)!=int or fps not in (12,15,24,30,60) or type(duration) not in (int,float) or not math.isfinite(duration) or not 2<=duration<=30:
        raise ValueError('Unsupported timing')
    if aspect not in ('16:9','9:16','1:1','4:3','3:4','21:9'):raise ValueError('aspect must be a string: 16:9, 9:16, 1:1, 4:3, 3:4 or 21:9')
    n=round(fps*duration)
    if abs(n-fps*duration)>1e-8:raise ValueError('Duration must contain integral frames')
    timing={'fps':fps,'durationSeconds':duration,'aspect':aspect};warp=TimeWarp(spec.get('timeWarp'),duration)
    end_action=warp.at((n-1)/fps)[0]
    actors_in=spec['actors'];environment=spec.get('objects',[])
    if not isinstance(actors_in,list) or not actors_in:raise ValueError('At least one actor is required')
    names=[a.get('id') for a in actors_in]+[o.get('id') for o in environment]
    if any(not isinstance(x,str) or not IDENT.fullmatch(x) for x in names) or len(set(names))!=len(names):raise ValueError('Unique actor/object IDs use lower-case letters, numbers, underscores and hyphens')
    if len(names)+1>200:raise ValueError('Live object capacity exceeded')
    if not isinstance(spec.get('quality'),dict):raise ValueError('Define framing beats before compiling')
    commands=[];proxies=[]
    for obj in environment:
        c,p=box_object(obj);commands.append(c);proxies.append(p)
        if obj.get('color'):commands.append({'op':'object.setColor','clientRef':obj['id'],'color':obj['color']})
    actors=[];descriptors=[];body_cache={};root_rows={};tracks={};sources={}
    for index,a in enumerate(actors_in):
        ident='@actor:'+a['id'];path=a['path']
        if len(path)<2 or path[0]['time']!=0 or path[-1]['time']<end_action:raise ValueError('Actor path must cover action time: '+a['id'])
        curve=Curve([{**r,'value':vector(r['position'])} for r in path])
        oriented=any('rotation' in r for r in path)
        if oriented and not all('rotation' in r for r in path):raise ValueError('Explicit orientation needs rotation at all actor anchors')
        orientation=Curve([{'time':r['time'],'value':vector(r['rotation']),**({'hold':True} if r.get('hold') else {})} for r in path]) if oriented else None
        states=copy.deepcopy(a['support'])
        motion=copy.deepcopy(a.get('motion'))
        if motion and 'preset' in a:raise ValueError('Choose preset or motion for '+a['id'])
        if motion is None:
            preset=a['preset'];baseline=preset if preset in ('running','walking','idle') else 'standing-idle'
            motion={'format':'3dref-motion-v1','rig':'stock-human','baseline':baseline,
                    'segments':[{'preset':preset,'start':0,'end':duration,'sourceStart':0,'speed':1,'loop':preset in ('running','walking','idle')}]}
        for k,v in [('durationSeconds',duration),('fps',fps),('timeWarp',warp.rows)]:
            if k in motion and motion[k]!=v:raise ValueError('Conflicting root/body '+k)
            motion[k]=v
        h=digest(motion)
        if h not in body_cache:body_cache[h]=compile_body(motion,runtime,cache,offline)
        body=body_cache[h]
        if body.get('markerSpace')!='object-local-after-root-offset':raise ValueError('Use the packaged motion compiler; old marker-space artifacts are incompatible')
        for source in body['sources']:sources[source['sha256']]=source
        baseline=body['baseline'];slot='animation' if baseline in ('running','walking','idle') else 'poseAsset'
        descriptors.append({'id':a['id'],'token':ident,'clientRef':'actor_'+a['id'],'templateSlot':'human' if index==0 else None,
                            'name':a.get('name',a['id']),'color':a.get('color'),'baseline':baseline,'slot':slot})
        samples=[];dense=[];prev=None
        for f in range(n):
            t=f/fps;tau,rate=warp.at(t);ground=curve.at(tau);velocity=curve.at(tau,1)
            active=[s for s in states if s['start']-1e-9<=t<s['end']-1e-9]
            if len(active)!=1:raise ValueError('Exactly one support state is required per frame: '+a['id'])
            state=active[0]
            if orientation:rot=orientation.at(tau)
            else:
                if state['mode']!='surface':raise ValueError('Transfer/flight needs explicit orientation anchors')
                sf=resolve_surface(state['surface'],proxies);up=sf['normal']
                tangent=sub(velocity,mul(up,dot(velocity,up)))
                if dot(tangent,tangent)<1e-12:
                    forward=a.get('initialForward',[0,0,1] if abs(up[1])>.9 else [0,1,0]);tangent=sub(forward,mul(up,dot(forward,up)))
                forward=unit(tangent);rot=basis_xyz([unit(cross(up,forward)),up,forward],prev)
            prev=rot;ground=add(ground,rotate([0,.025,0],rot));b=body['samples'][f];position=add(ground,rotate([0,b['rootYOffset'],0],rot))
            sample={'frame':f,'position':position,'groundPosition':ground,'rotation':rot,'markers':b['markers'],
                    'actionTime':tau,'bodyActionTime':b['actionTime'],'actionRate':rate,'activePresets':b['activePresets']}
            samples.append(sample)
            pose={k:v for k,v in b['pose'].items() if any(abs(x)>1e-8 for x in v.values())}
            dense.append({'frame':f,'patch':{'transform':{'position':position,'rotation':rot},'pose':pose}})
        actors.append({'id':ident,'samples':samples,'bodyTrack':body,'support':states,'locomotion':a.get('locomotion',{'mode':'source-matched'})});tracks[ident]=dense;root_rows[a['id']]=samples
    camera=spec['camera'];anchors=camera['anchors']
    if len(anchors)<2 or anchors[0]['time']!=0 or anchors[-1]['time']<(n-1)/fps:raise ValueError('Camera anchors must cover output time')
    targets=camera.get('targets',[a['id'] for a in actors_in])
    if not targets or any(t not in root_rows for t in targets):raise ValueError('Camera targets must name declared actors')
    rows=[]
    for r in anchors:
        if not 14<=r['focalLength']<=135 or not 0<r['distance']<=40 or not -90<=r['elevation']<=90:raise ValueError('Camera anchor outside live profile')
        rows.append({**r,'value':[r['azimuth'],r['elevation'],math.log(r['distance']),math.log(r['focalLength']),*r.get('targetOffset',[0,0,0])]})
    camcurve=Curve(rows);reference_up=camera.get('referenceUp',[0,1,0]);cams=[]
    for f in range(n):
        az,el,ld,lf,*offset=camcurve.at(f/fps);distance,lens=math.exp(ld),math.exp(lf)
        if not 14-1e-8<=lens<=135+1e-8 or not 0<distance<=40+1e-8 or abs(el)>90:raise ValueError('Camera curve overshoots profile')
        ps=[root_rows[t][f] for t in targets]
        center=[sum(p['groundPosition'][i] for p in ps)/len(ps) for i in range(3)]
        avg_up=unit([sum(rotate([0,1,0],p['rotation'])[i] for p in ps) for i in range(3)])
        target=add(add(center,mul(avg_up,camera.get('targetHeight',.85))),offset)
        az,el=map(math.radians,[az,el]);position=add(target,[distance*math.cos(el)*math.sin(az),distance*math.sin(el),distance*math.cos(el)*math.cos(az)])
        cams.append({'frame':f,'position':position,'target':target,'focalLength':lens})
    floor=camera.get('floorRoll');rolls=[];roll_report=None
    if floor:
        start,end=floor['start'],floor['end']
        if floor.get('degrees',90)!=90 or not 0<=start<end<duration:raise ValueError('floorRoll is a signed-solved 90 degree transition')
        sf=resolve_surface(floor['surface'],proxies)
        candidates={sign:min(dot(camera_basis(c['position'],c['target'],sign,reference_up)[1],sf['normal']) for c in cams if c['frame']/fps>=end) for sign in (-90,90)}
        sign=max(candidates,key=candidates.get)
        if candidates[sign]<.6:raise ValueError('Neither 90-degree roll makes the requested wall read as floor; change camera side/aim')
        roll_report={'degrees':sign,'minScreenUp':candidates[sign]}
        for f in range(n):
            u=max(0,min(1,(f/fps-start)/(end-start)));u=u*u*u*(10+u*(-15+6*u));rolls.append(sign*u)
    else:
        rollcurve=Curve([{'time':r['time'],'value':[r.get('roll',0)],**({'hold':True} if r.get('hold') else {})} for r in anchors])
        rolls=[rollcurve.at(f/fps)[0] for f in range(n)]
    prev=None;tracks[CAMERA]=[]
    for c,roll in zip(cams,rolls):
        c['rotation']=basis_xyz(camera_basis(c['position'],c['target'],roll,reference_up),prev);prev=c['rotation']
        tracks[CAMERA].append({'frame':c['frame'],'patch':{'transform':{'position':c['position'],'rotation':c['rotation']},'camera':{'focalLength':c['focalLength']}}})
    quality=copy.deepcopy(spec['quality']);mapping={a['id']:'@actor:'+a['id'] for a in actors_in}
    for beat in quality['beats']:
        beat['actors']={mapping[k]:v for k,v in beat['actors'].items()}
        if beat.get('surfaces'):raise ValueError('Use actor.support and camera.floorRoll; manually declared planes cannot certify actual contact')
    quality['limits']={mapping.get(k,k):v for k,v in quality.get('limits',{}).items()}
    for event in quality.get('interactions',[]):event['actors']=[mapping[k] for k in event['actors']]
    # Keep only geometry that can affect the shot or an explicit contact dependency.
    ratio=float(aspect.split(':')[0])/float(aspect.split(':')[1]);sensor=36*min(ratio,1)
    kept=[];culled=[]
    referenced={r['object'] for a in actors for s in a['support'] for r in ([s['surface']] if s['mode']=='surface' else s['surfaces'] if s['mode']=='transfer' else [s['takeoff'],s['landing']])}
    if floor:referenced.add(floor['surface']['object'])
    for p in proxies:
        visible=any(potentially_visible(box_corners(p['bounds'],p['transform']),c,ratio,sensor=sensor) for c in cams)
        if visible or p['id'] in referenced:kept.append(p)
        else:culled.append(p['id'])
    proxies=kept;commands=[c for c in commands if c['clientRef'] not in culled]
    mandatory={0,n-1}
    for a in actors:
        for s in a['support']:
            for t in (s['start'],s['end']):mandatory.update(i for i in (math.floor(t*fps)-1,math.floor(t*fps)) if 0<=i<n)
    keys,decoded,reduction=emit_tracks(tracks,mandatory)
    # Validate what the engine will play, after simplification, not only the ideal curves.
    for a in actors:
        for f,row in enumerate(a['samples']):
            patch=decoded[a['id']][f];row.update(patch['transform'])
            row['groundPosition']=sub(row['position'],rotate([0,a['bodyTrack']['samples'][f]['rootYOffset'],0],row['rotation']))
    for f,c in enumerate(cams):c.update(decoded[CAMERA][f]['transform']);c.update(decoded[CAMERA][f]['camera'])
    check={'format':'3dref-check-v1','engineProfile':PROFILE['id'],'interpolation':'legacy-shortest','fps':fps,'durationSeconds':duration,'aspect':aspect,
           'sensorWidthMm':sensor,'projectionSource':PROFILE['id'],'cameraId':CAMERA,'cameras':cams,'actors':actors,'proxies':proxies,'quality':quality}
    support=check_support(actors,proxies,fps,duration)
    if not support['passed']:raise PlanningError('support',support)
    interactions=validate_interactions(actors,proxies,quality,fps)
    if not interactions['passed']:raise PlanningError('interactions',interactions)
    if floor:
        sf=resolve_surface(floor['surface'],proxies)
        if min(dot(xyz_columns(c['rotation'])[1],sf['normal']) for c in cams if c['frame']/fps>=floor['end'])<.6:raise ValueError('Reduced camera violates floor-roll constraint')
        for a in actors:
            for f,row in enumerate(a['samples']):
                if f/fps<floor['end']:continue
                state=next(s for s in a['support'] if s['start']<=f/fps<s['end'])
                if state['mode']!='surface' or state['surface']!=floor['surface']:continue
                q={k:project(add(row['position'],rotate(v,row['rotation'])),cams[f],ratio,sensor) for k,v in row['markers'].items()}
                feet=[v[1] for k,v in q.items() if k.startswith('foot')]
                if feet and q['head'][1]<=sum(feet)/len(feet):raise PlanningError('floor-roll',{'issues':{'head-below-feet':{'actor':a['id'],'frame':f}}})
    checked=validate(check)
    from locomotion import assess
    checked['locomotion']=assess(actors,fps)
    checked['warnings']+=checked['locomotion']['warnings']
    if not checked['locomotion']['passed']:raise PlanningError('locomotion',checked['locomotion'])
    if not checked['passed']:raise PlanningError('preflight',checked)
    checked['commandsHash']=verify_commands(check,commands+keys)
    checked['support']=support;checked['interactions']=interactions;checked['engineProfile']=PROFILE['id'];checked['postReduction']=True
    setup=[]
    for a in descriptors:
        target={'objectId':a['token']} if a['templateSlot'] else {'clientRef':a['clientRef']}
        if a['templateSlot']:setup.append({'op':'object.rename',**target,'name':a['name']})
        else:setup.append({'op':'object.add','clientRef':a['clientRef'],'kind':'human','name':a['name'],'transform':{'position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]}})
        setup.append({'op':'motion.applyPreset',**target,'presetKey':a['baseline'],'slot':a['slot'],'startFrame':0})
        if a['color']:setup.append({'op':'object.setColor',**target,'color':a['color']})
    # Setup actor groups retain their clientRef dependencies in the same batch.
    actor_groups=[];at=0
    for a in descriptors:
        count=2+bool(a['color']);actor_groups.append(setup[at:at+count]);at+=count
    def batches_of(groups,domain):
        out=[];cur=[]
        for group in groups:
            if len(group)>50 or len(compact(group).encode())>64000:raise ValueError('Atomic command group exceeds limit')
            if cur and (len(cur+group)>50 or len(compact(cur+group).encode())>64000):out.append({'domain':domain,'commands':cur});cur=[]
            cur+=group
        if cur:out.append({'domain':domain,'commands':cur})
        return out
    batches=[{'domain':'scene','commands':[{'op':'scene.setTiming','fps':fps,'durationSeconds':duration}]}]
    batches+=batches_of(actor_groups,'object')+[{'domain':'object','commands':g} for g in object_batches(commands)]
    batches.append({'domain':'camera','commands':[{'op':'camera.setAspect','objectId':CAMERA,'aspect':aspect},
       {'op':'camera.set','objectId':CAMERA,'destination':{'kind':'base'},'camera':{'focalLength':cams[0]['focalLength'],'near':.05,'far':40}}]})
    batches+=batches_of([[c] for c in keys],'keyframe')
    snapshots={}
    for c in keys:snapshots.setdefault((c['objectId'],c['frame']),{}).update(c['patch'])
    size=len(compact(list(snapshots.values())).encode())+len(snapshots)*80+len(compact(commands).encode())*2+len(actors)*2048+16384
    if len(snapshots)>2000 or size>524288:raise ValueError('Measured motion exceeds live scene capacity; preserve requested timing and report the conflict')
    summary={'timing':timing,'objects':len(actors)+1+len(proxies),'actors':len(actors),'storedKeys':len(snapshots),'denseKeys':n*(len(actors)+1),
             'commands':sum(len(b['commands']) for b in batches),'batches':len(batches),'estimatedSceneBytes':size,'culledObjects':culled,
             'checks':{'preflight':checked},'reduction':reduction,'floorRoll':roll_report,'uniqueBodyBakes':len(body_cache)}
    bundle={'format':'3dref-run-v4','schemaVersion':1,'timing':timing,'actors':descriptors,'freshTemplate':'human_camera',
            'engineProfile':PROFILE,'sources':list(sources.values()),'batches':batches,'summary':summary}
    bundle['digest']=digest(bundle);return bundle
