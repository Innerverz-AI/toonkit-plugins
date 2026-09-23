"""Actor separation and swept marker/solid checks, independent of camera rays."""
import math
from spatial import add,sub,mul,dot,rotate,xyz_columns
from plan import ray_box

def segment_distance(p1,q1,p2,q2):
    d1,d2,r=sub(q1,p1),sub(q2,p2),sub(p1,p2);a,e=dot(d1,d1),dot(d2,d2);f=dot(d2,r)
    clamp=lambda x:max(0,min(1,x))
    if a<1e-12 and e<1e-12:return math.sqrt(dot(r,r))
    if a<1e-12:s=0;t=clamp(f/e)
    else:
        c=dot(d1,r)
        if e<1e-12:t=0;s=clamp(-c/a)
        else:
            b=dot(d1,d2);denom=a*e-b*b;s=clamp((b*f-c*e)/denom) if abs(denom)>1e-12 else 0
            t=(b*s+f)/e
            if t<0:t=0;s=clamp(-c/a)
            elif t>1:t=1;s=clamp((b-c)/a)
    delta=sub(add(p1,mul(d1,s)),add(p2,mul(d2,t)))
    return math.sqrt(dot(delta,delta))

def validate(actors,proxies,quality,fps):
    issues={};minimum=float('inf');world={}
    def fail(key,f):
        v=issues.setdefault(key,{'count':0,'firstFrame':f,'lastFrame':f});v['count']+=1;v['lastFrame']=f
    for a in actors:
        world[a['id']]=[{k:add(s['position'],rotate(v,s['rotation'])) for k,v in s['markers'].items()} for s in a['samples']]
    for i,a in enumerate(actors):
        for b in actors[i+1:]:
            for f,(aw,bw) in enumerate(zip(world[a['id']],world[b['id']])):
                def axis(w):
                    feet=[v for k,v in w.items() if k.startswith('foot')]
                    return [sum(p[k] for p in feet)/len(feet) for k in range(3)],w['head']
                d=segment_distance(*axis(aw),*axis(bw));minimum=min(minimum,d)
                limit=quality.get('actorClearanceMeters',.3)
                if not isinstance(limit,(int,float)) or not math.isfinite(limit) or limit<.1:raise ValueError('Default actor separation must be at least .1m')
                for event in quality.get('interactions',[]):
                    if set(event['actors'])=={a['id'],b['id']} and event['start']<=f/fps<event['end']:
                        if not event.get('reason') or not 0<=event['minSeparationMeters']<=limit:raise ValueError('Contact interaction needs intent and bounded separation')
                        limit=event['minSeparationMeters']
                if d<limit:fail('actor-separation:'+a['id']+':'+b['id'],f)
    for p in proxies:
        if not p.get('solid',True):continue
        t=p['transform'];columns=xyz_columns(t['rotation'])
        local=lambda v:[dot(sub(v,t['position']),c)/s for c,s in zip(columns,t['scale'])]
        for a in actors:
            rows=world[a['id']]
            for f in range(1,len(rows)):
                if any(ray_box(local(rows[f-1][k]),local(rows[f][k]),p['bounds']) for k in rows[f]):fail('swept-marker-solid:'+p['id']+':'+a['id'],f)
    return {'passed':not issues,'issues':issues,'minimumActorAxisDistance':minimum if math.isfinite(minimum) else None,
            'scope':'Body axes and swept bone markers against proxy solids; no skin/sole collision certificate'}
