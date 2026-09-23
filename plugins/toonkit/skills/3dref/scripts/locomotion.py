"""Compare route travel with measured source stride; never imply foot-plant IK."""
import math
from spatial import sub,dot

def assess(actors,fps):
    report={};issues={};warnings=[]
    for actor in actors:
        body=actor['bodyTrack']['samples'];rows=actor['samples'];ratios=[];bad=[];run=longest=0.
        for i in range(len(rows)-1):
            speeds=[body[j].get('sourceSpeedMps') for j in (i,i+1)]
            surface=any(s['mode']=='surface' and s['start']<=i/fps and (i+1)/fps<s['end'] for s in actor['support'])
            if None in speeds or not surface:
                run=0.;continue
            expected=sum(speeds)/2
            delta=sub(rows[i+1]['groundPosition'],rows[i]['groundPosition']);actual=math.sqrt(dot(delta,delta))*fps
            if expected<.05:continue
            ratio=actual/expected;ratios.append(ratio)
            if abs(ratio-1)>.20:
                run+=rows[i+1]['actionTime']-rows[i]['actionTime'];longest=max(run,longest)
                bad.append({'frame':i,'routeMps':round(actual,4),'sourceMps':round(expected,4),'ratio':round(ratio,4)})
            else:run=0.
        ident=actor['id'];policy=actor.get('locomotion',{'mode':'source-matched'})
        report[ident]={'evaluatedIntervals':len(ratios),'minRatio':round(min(ratios),4) if ratios else None,'maxRatio':round(max(ratios),4) if ratios else None,'longestMismatchActionSeconds':round(longest,4),'mode':policy['mode']}
        if longest>.30:
            evidence={'count':len(bad),'firstFrame':bad[0]['frame'],'lastFrame':bad[-1]['frame'],'examples':bad[:3],'allowedRatio':[.8,1.2],'maximumSustainedActionSeconds':.3}
            if policy['mode']=='stylized':warnings.append({'actor':ident,'code':'intentional-stride-mismatch','reason':policy['reason'],**evidence})
            else:issues[ident+':stride-mismatch']=evidence
        if not ratios:warnings.append({'actor':ident,'code':'stride-not-measured','reason':'No supported running/walking surface interval; support still evaluated separately'})
    return {'passed':not issues,'issues':issues,'actors':report,'warnings':warnings,'scope':'Source cycle-average stride comparison; not a foot-plant or skin collision guarantee'}
