"""Verified legacy renderer interpolation + exact-pose sparse key selection."""
import copy,math
from spatial import angular_distance

def lerp(a,b,u):return a+(b-a)*u
def angle(a,b,u):
    d=math.fmod(b-a,360)
    if d>180:d-=360
    if d< -180:d+=360
    return a+d*u
def distance(a,b):return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))

def interpolate(a,b,frame):
    u=0 if a['frame']==b['frame'] else (frame-a['frame'])/(b['frame']-a['frame'])
    x,y=a['patch'],b['patch'];out={'transform':{}}
    for name in ('position','rotation'):
        fn=angle if name=='rotation' else lerp
        out['transform'][name]=[fn(p,q,u) for p,q in zip(x['transform'][name],y['transform'][name])]
    if 'camera' in x:out['camera']={k:lerp(v,y['camera'][k],u) for k,v in x['camera'].items()}
    if 'pose' in x or 'pose' in y:
        out['pose']={}
        for joint in set(x.get('pose',{}))|set(y.get('pose',{})):
            d={k:lerp(x.get('pose',{}).get(joint,{}).get(k,0),y.get('pose',{}).get(joint,{}).get(k,0),u) for k in ('tiltX','tiltZ','twist')}
            if any(abs(v)>1e-8 for v in d.values()):out['pose'][joint]=d
    return out

def sample(keys,frame):
    a=max((k for k in keys if k['frame']<=frame),key=lambda k:k['frame'])
    b=min((k for k in keys if k['frame']>=frame),key=lambda k:k['frame'])
    return interpolate(a,b,frame)

def reduce_track(dense,mandatory=(),position=.002,rotation=.05,lens=.02):
    """All output frames checked; pose-changing frames are retained exactly."""
    n=len(dense);keep={0,n-1,*mandatory}
    # Do not approximate source anatomy. Keep changes and their zero/constant guards.
    for i in range(1,n):
        if dense[i]['patch'].get('pose',{})!=dense[i-1]['patch'].get('pose',{}):keep.update((i-1,i))
    def error(a,b,i):
        p=interpolate(dense[a],dense[b],i);q=dense[i]['patch']
        return max(distance(p['transform']['position'],q['transform']['position'])/position,
                   angular_distance(p['transform']['rotation'],q['transform']['rotation'])/rotation,
                   abs(p.get('camera',{}).get('focalLength',0)-q.get('camera',{}).get('focalLength',0))/lens)
    ordered=sorted(keep);stack=list(zip(ordered,ordered[1:]))
    while stack:
        a,b=stack.pop();worst=1.;split=None
        for i in range(a+1,b):
            e=error(a,b,i)
            if e>worst:worst,split=e,i
        if split is not None:keep.add(split);stack.extend(((a,split),(split,b)))
    keys=[copy.deepcopy(dense[i]) for i in sorted(keep)]
    max_score=max((error(a,b,i) for a,b in zip(sorted(keep),sorted(keep)[1:]) for i in range(a+1,b)),default=0)
    return keys,{'dense':n,'kept':len(keys),'maxToleranceRatio':max_score,'pose':'exact at every output frame','positionMeters':position,'rotationDegrees':rotation,'lensMm':lens}

def emit_tracks(tracks,mandatory):
    base=[];overlays=[];decoded={};stats={}
    for ident,rows in tracks.items():
        keys,stats[ident]=reduce_track(rows,mandatory)
        decoded[ident]=[sample(keys,i) for i in range(len(rows))]
        for key in keys:
            patch=copy.deepcopy(key['patch']);pose=patch.pop('pose',{})
            base.append({'op':'keyframe.upsert','objectId':ident,'frame':key['frame'],'overwrite':False,'patch':patch})
            if pose:overlays.append({'op':'keyframe.upsert','objectId':ident,'frame':key['frame'],'overwrite':True,'patch':{'pose':pose}})
    return base+overlays,decoded,stats
