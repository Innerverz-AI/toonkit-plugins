"""Mandatory support state coverage, tied to finite rendered object faces."""
import math
from geometry import resolve_surface,on_face,signed_distance
from spatial import add,rotate,dot,sub

def check_support(actors,proxies,fps,duration):
    issues=[];metrics={}
    def fail(actor,frame,reason):issues.append({'actor':actor,'frame':frame,'reason':reason})
    for a in actors:
        aid=a['id'];states=a.get('support',[]);samples=a['samples'];covered=set();unsupported=0.;peak_gap=0.
        for s in states:
            start,end=s['start'],s['end'];mode=s.get('mode')
            if type(start) not in (int,float) or type(end) not in (int,float) or not math.isfinite(start+end) or not 0<=start<end<=duration:
                raise ValueError('Invalid support interval: '+aid)
            indices=[i for i in range(len(samples)) if start-1e-9<=i/fps<end-1e-9]
            if not indices:raise ValueError('Empty support interval: '+aid)
            if covered.intersection(indices):raise ValueError('Overlapping support states: '+aid)
            covered.update(indices)
            if mode=='surface':surfaces=[resolve_surface(s['surface'],proxies)]
            elif mode=='transfer':
                surfaces=[resolve_surface(r,proxies) for r in s['surfaces']]
                if len(surfaces)!=2:raise ValueError('A transfer names exactly two real faces')
            elif mode=='flight':
                surfaces=[]
                if not s.get('reason') or not 0<s.get('maxSeconds',0)<=duration or end-start>s['maxSeconds']+1e-9:
                    raise ValueError('Flight needs explicit intent and a bounded duration')
                for endpoint,idx in [('takeoff',indices[0]),('landing',min(len(samples)-1,indices[-1]+1))]:
                    surface=resolve_surface(s[endpoint],proxies);p=samples[idx]['groundPosition']
                    if abs(signed_distance(p,surface))>.06 or not on_face(p,surface,.05):fail(aid,idx,'flight-'+endpoint+'-misses-face')
            else:raise ValueError('Each interval needs surface, transfer or flight state')
            for i in indices:
                row=samples[i];p=row['groundPosition'];world={k:add(row['position'],rotate(v,row['rotation'])) for k,v in row['markers'].items()}
                feet=[v for k,v in world.items() if k.startswith(('foot','toe'))]
                if not feet:raise ValueError('Support requires source-derived feet markers: '+aid)
                if mode=='flight':
                    if not set(row.get('activePresets',[])).intersection({'jumping','falling'}):fail(aid,i,'flight-without-airborne-motion')
                    unsupported=0.;continue
                candidates=[f for f in surfaces if on_face(p,f,.03)]
                if not candidates:fail(aid,i,'root-outside-finite-support-face');continue
                root_gap=min(abs(signed_distance(p,f)) for f in candidates)
                if root_gap>.05:fail(aid,i,'unsupported-ground-path')
                up=rotate([0,1,0],row['rotation'])
                if mode=='surface' and dot(up,candidates[0]['normal'])<.98:fail(aid,i,'actor-up-not-support-normal')
                distances=[signed_distance(v,f) for f in candidates for v in feet if on_face(v,f,.05)]
                if not distances:fail(aid,i,'feet-outside-support-face');continue
                if mode=='surface' and min(distances)<-.03:fail(aid,i,'feet-penetrate-support')
                gap=min(abs(d) for d in distances);peak_gap=max(peak_gap,gap)
                action_dt=(row['actionTime']-samples[i-1]['actionTime']) if i else 0
                unsupported=unsupported+action_dt if gap>.08 else 0
                # Gait has legitimate aerial intervals; test in action time so slowmo is not a false failure.
                if gap>.35 or unsupported>.30:fail(aid,i,'unsupported-feet-beyond-gait-envelope')
        if covered!=set(range(len(samples))):raise ValueError('Support states must cover every frame, including transitions: '+aid)
        metrics[aid]={'frames':len(samples),'maxFootGapMeters':round(peak_gap,6)}
    grouped={}
    for e in issues:
        key=e['actor']+':'+e['reason'];v=grouped.setdefault(key,{'count':0,'firstFrame':e['frame'],'lastFrame':e['frame']});v['count']+=1;v['lastFrame']=e['frame']
    return {'passed':not issues,'issues':grouped,'actors':metrics,'scope':'Finite support faces and source bone markers; no skin/sole IK certificate'}
