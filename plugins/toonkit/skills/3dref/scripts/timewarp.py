"""C2 speed ramps integrated exactly. Output seconds -> shared action seconds."""
import math

class TimeWarp:
    def __init__(self,rows,duration):
        self.rows=rows if rows is not None else [{'time':0,'speed':1},{'time':duration,'speed':1}]
        if len(self.rows)<2: raise ValueError('timeWarp needs two or more speed anchors')
        for r in self.rows:
            if set(r)!={'time','speed'} or any(type(r[k]) not in (int,float) or not math.isfinite(r[k]) for k in r): raise ValueError('Invalid timeWarp anchor')
            if r['speed']<=0: raise ValueError('timeWarp speed must be positive; choreograph explicit holds separately')
        if self.rows[0]['time']!=0 or abs(self.rows[-1]['time']-duration)>1e-8: raise ValueError('timeWarp must span 0..durationSeconds')
        if any(b['time']<=a['time'] for a,b in zip(self.rows,self.rows[1:])): raise ValueError('timeWarp times must increase')
        self.duration=duration

    def at(self,t):
        if not 0<=t<=self.duration+1e-9: raise ValueError('timeWarp sample out of range')
        total=0.
        for a,b in zip(self.rows,self.rows[1:]):
            dt=b['time']-a['time'];u=min(1,max(0,(t-a['time'])/dt))
            # integral of 6u^5 - 15u^4 + 10u^3 = u^6 - 3u^5 + 2.5u^4
            total+=dt*(a['speed']*u+(b['speed']-a['speed'])*(u**6-3*u**5+2.5*u**4))
            if t<=b['time']: return total,a['speed']+(b['speed']-a['speed'])*u**3*(10+u*(-15+6*u))
        return total,self.rows[-1]['speed']

    @property
    def identity(self): return all(r['speed']==1 for r in self.rows)
