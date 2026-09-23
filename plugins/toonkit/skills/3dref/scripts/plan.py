#!/usr/bin/env python3
"""Portable trajectory planner. Standard library only; no network or credentials.

Output is a neutral shot plan, NOT an undocumented Toonkit wire payload.
Every output sample represents a playable frame. Use the verified MCP adapter
documented with the skill to transmit it, without printing the arrays to chat.
"""
import argparse
import json
import math
from pathlib import Path


def vec(a):
    if not isinstance(a, list) or len(a) != 3:
        raise ValueError("Expected a three-number [x,y,z] vector")
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in a):
        raise ValueError("Vectors must contain finite numbers")
    return list(map(float, a))


def add(a, b):
    return [x+y for x, y in zip(a, b)]


def sub(a, b):
    return [x-y for x, y in zip(a, b)]


def mul(a, k):
    return [x*k for x in a]


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def norm(a):
    return math.sqrt(dot(a, a))


def unit(a):
    n = norm(a)
    if n < 1e-10:
        raise ValueError("Zero-length direction")
    return mul(a, 1/n)


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def septic_coefficients(p0,p1,v0,v1,a0,a1,j0,j1,dt):
    """Hermite polynomial sharing position, velocity, acceleration and jerk."""
    axes=[]
    for x,y,vx,vy,ax,ay,jx,jy in zip(p0,p1,v0,v1,a0,a1,j0,j1):
        c=[x,vx*dt,ax*dt*dt/2,jx*dt**3/6]
        r0=y-sum(c)
        r1=vy*dt-(c[1]+2*c[2]+3*c[3])
        r2=ay*dt*dt-(2*c[2]+6*c[3])
        r3=jy*dt**3-6*c[3]
        c.extend([35*r0-15*r1+2.5*r2-r3/6,
                  -84*r0+39*r1-7*r2+r3/2,
                  70*r0-34*r1+6.5*r2-r3/2,
                  -20*r0+10*r1-2*r2+r3/6])
        axes.append(c)
    return axes


class Curve:
    """C3 piecewise curve. Ordinary waypoints also share jerk.

    Explicit hold=True is the only automatic zero-velocity/acceleration knot.
    """
    def __init__(self, rows):
        if len(rows) < 2:
            raise ValueError("A curve needs at least two timed anchors")
        self.t = [float(r['time']) for r in rows]
        self.p = [list(map(float, r['value'])) for r in rows]
        if not all(math.isfinite(t) for t in self.t) or any(b <= a for a,b in zip(self.t,self.t[1:])):
            raise ValueError("Anchor times must be finite and strictly increasing")
        width = len(self.p[0])
        if not width or any(len(p) != width or not all(math.isfinite(x) for x in p) for p in self.p):
            raise ValueError("Anchor dimensions must agree and contain finite numbers")
        self.v, self.a, self.j = [], [], []
        for i,r in enumerate(rows):
            lo,hi = max(0,i-1),min(len(rows)-1,i+1)
            default_v = mul(sub(self.p[hi],self.p[lo]),1/(self.t[hi]-self.t[lo]))
            v = r.get('velocity', [0]*width if r.get('hold') else default_v)
            a = r.get('acceleration', [0]*width)
            j = r.get('jerk', [0]*width)
            if any(len(d)!=width for d in [v,a,j]) or not all(math.isfinite(x) for x in v+a+j):
                raise ValueError("Derivative dimensions must match the curve")
            self.v.append(v)
            self.a.append(a)
            self.j.append(j)
        self.coefficients=[septic_coefficients(self.p[i],self.p[i+1],self.v[i],self.v[i+1],
                          self.a[i],self.a[i+1],self.j[i],self.j[i+1],self.t[i+1]-self.t[i])
                           for i in range(len(rows)-1)]

    def at(self, t, derivative_order=0):
        if not self.t[0] <= t <= self.t[-1]:
            raise ValueError("Curve evaluation outside anchor coverage")
        i = min(next((j for j in range(len(self.t)-1) if t <= self.t[j+1]), len(self.t)-2),len(self.t)-2)
        dt = self.t[i+1]-self.t[i]
        u = (t-self.t[i])/dt
        if derivative_order not in range(4):
            raise ValueError('Supported derivative orders are 0–3')
        return [sum(c[k]*math.factorial(k)/math.factorial(k-derivative_order)*u**(k-derivative_order)
                    for k in range(derivative_order,8))/dt**derivative_order
                for c in self.coefficients[i]]


def derivative(points, fps):
    return [mul(sub(b,a),fps) for a,b in zip(points,points[1:])]


def stats(points, fps):
    velocity = derivative(points,fps)
    acceleration = derivative(velocity,fps)
    jerk = derivative(acceleration,fps)
    return {'maxSpeed':max(map(norm,velocity),default=0),
            'maxAcceleration':max(map(norm,acceleration),default=0),
            'maxJerk':max(map(norm,jerk),default=0)}


def inside_box(point, box, radius=0):
    return all(lo-radius <= p <= hi+radius for p,lo,hi in zip(point,box['min'],box['max']))


def ray_box(a, b, box):
    # Segment/slab intersection; excludes the two endpoints.
    t0,t1 = 1e-5,1-1e-5
    for x,d,lo,hi in zip(a,sub(b,a),box['min'],box['max']):
        if abs(d) < 1e-12:
            if not lo <= x <= hi:
                return False
        else:
            near,far = sorted(((lo-x)/d,(hi-x)/d))
            t0,t1 = max(t0,near),min(t1,far)
            if t0 > t1:
                return False
    return True


def screen_point(point, camera, target, lens, aspect, sensor_width=36):
    forward = unit(sub(target,camera))
    if abs(dot(forward,[0,1,0])) > .9999:
        return None  # Overhead roll needs an explicit orientation convention.
    right = unit(cross(forward,[0,1,0]))
    up = unit(cross(right,forward))
    relative = sub(point,camera)
    depth = dot(relative,forward)
    if depth <= 0:
        return [float('inf'),float('inf'),depth]
    return [2*lens*dot(relative,right)/(sensor_width*depth),
            2*lens*aspect*dot(relative,up)/(sensor_width*depth),depth]


def rounded(obj):
    if isinstance(obj,float):
        return round(obj,6)
    if isinstance(obj,list):
        return [rounded(x) for x in obj]
    if isinstance(obj,dict):
        return {k:rounded(v) for k,v in obj.items()}
    return obj


def validate_shot(shot):
    fps,duration = shot['fps'],shot['durationSeconds']
    if isinstance(fps,bool) or fps not in [12,15,24,30,60]:
        raise ValueError("Unsupported FPS; verify current Toonkit catalog before changing this profile")
    if not isinstance(duration,(float,int)) or isinstance(duration,bool) or not math.isfinite(duration) or not 2 <= duration <= 30:
        raise ValueError("Duration must be finite and in the current 2–30 second range")
    frames = round(fps*duration)
    if abs(frames-fps*duration)>1e-8:
        raise ValueError("Duration must produce an integral frame count")
    aspect = shot.get('aspect','16:9')
    if aspect not in ['16:9','9:16','1:1','4:3','3:4','21:9']:
        raise ValueError("Unsupported aspect ratio")
    end = (frames-1)/fps
    for field in ['subject','camera']:
        rows=shot[field]
        if len(rows)<2 or rows[0]['time']!=0 or rows[-1]['time']<end:
            raise ValueError(f"{field} anchors must cover every playable frame, starting at 0")
    for row in shot['subject']:
        vec(row['position'])
    for row in shot['camera']:
        vec(row.get('targetOffset',[0,1,0]))
        for field in ['azimuth','elevation','distance','focalLength']:
            v=row[field]
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):
                raise ValueError(f"camera {field} must be finite")
        if not -90<=row['elevation']<=90 or not 0<row['distance']<=40 or not 14<=row['focalLength']<=135:
            raise ValueError("Camera anchor outside current lens/distance/elevation limits")
    for box in shot.get('obstacles',[]):
        lo,hi=vec(box['min']),vec(box['max'])
        if any(a>=b for a,b in zip(lo,hi)):
            raise ValueError("Obstacle AABB must have positive extents")
    if shot.get('cameraFrame','world') not in ['world','heading']:
        raise ValueError("cameraFrame must be world or heading")
    return fps,duration,frames,aspect


def build(shot):
    fps,duration,frames,aspect = validate_shot(shot)
    roots = Curve([{**r,'value':r['position']} for r in shot['subject']])
    # Camera derivatives use degrees/s, log-distance/s, log-lens/s, and meters/s.
    camera_curve = Curve([{**r,'value':[r['azimuth'],r['elevation'],math.log(r['distance']),
                                      math.log(r['focalLength']),*r.get('targetOffset',[0,1,0])]}
                          for r in shot['camera']])
    positions=[roots.at(f/fps) for f in range(frames)]
    headings=[]
    for f in range(frames):
        step=roots.at(f/fps,1)
        angle=math.degrees(math.atan2(step[0],step[2])) if math.hypot(step[0],step[2])>1e-7 else (headings[-1] if headings else shot.get('initialHeading',0))
        if headings:
            angle+=360*round((headings[-1]-angle)/360)
        headings.append(angle)
    samples=[]
    errors=[]
    warnings=[]
    issue_frames={}
    def flag(kind,frame):
        issue_frames.setdefault(kind,set()).add(frame)
    numerator,denominator=map(float,aspect.split(':'))
    aspect_number=numerator/denominator
    sensor_width=shot.get('sensorWidthMm',36)
    if not isinstance(sensor_width,(int,float)) or not math.isfinite(sensor_width) or sensor_width<=0:
        raise ValueError("sensorWidthMm must be finite and positive")
    for f,root in enumerate(positions):
        az,el,ld,lf,*offset=camera_curve.at(f/fps)
        distance,lens=math.exp(ld),math.exp(lf)
        if shot.get('cameraFrame','world')=='heading':
            az+=headings[f]
        az,el=math.radians(az),math.radians(el)
        target=add(root,offset)
        camera=add(target,[distance*math.cos(el)*math.sin(az),distance*math.sin(el),distance*math.cos(el)*math.cos(az)])
        if not 14-1e-8<=lens<=135+1e-8 or not 0<distance<=40+1e-8 or abs(math.degrees(el))>90+1e-8:
            flag('camera_curve_overshoot',f)
        if distance>=shot.get('far',40)-shot.get('clipMargin',.5):
            flag('far_clip_risk',f)
        if camera[1]<shot.get('groundY',0)+shot.get('cameraRadius',.15):
            flag('camera_ground_intersection',f)
        for box in shot.get('obstacles',[]):
            name=box.get('name','obstacle')
            if inside_box(camera,box,shot.get('cameraRadius',.15)):
                flag('camera_collision:'+name,f)
            if inside_box(root,box,shot.get('subjectRadius',.3)):
                flag('subject_collision:'+name,f)
            if ray_box(camera,target,box):
                flag('target_occlusion:'+name,f)
        for point in shot.get('requiredPoints',[]):
            world_point=add(root,vec(point['offset']))
            point_name=point.get('name','point')
            projected=screen_point(world_point,camera,target,lens,aspect_number,sensor_width)
            if projected is None:
                flag('overhead_orientation_requires_verification',f)
            elif max(abs(projected[0]),abs(projected[1]))>shot.get('frameSafeNdc',.9) or projected[2]<=shot.get('near',.05):
                flag('framing_risk:'+point_name,f)
            if projected is not None and projected[2]>=shot.get('far',40)-shot.get('clipMargin',.5):
                flag('far_clip_risk:'+point_name,f)
            for box in shot.get('obstacles',[]):
                if ray_box(camera,world_point,box):
                    flag('required_point_occlusion:'+point_name+':'+box.get('name','obstacle'),f)
        samples.append({'frame':f,'subject':{'position':root,'yaw':headings[f]},
                        'camera':{'position':camera,'target':target,'focalLength':lens},
                        'projectionScaleProxy':lens/distance})
    counts={k:{'count':len(v),'first':min(v),'last':max(v)} for k,v in issue_frames.items()}
    if counts:
        warnings.append('Geometric proxy warnings require review; they do not replace rendered-frame checks.')
    budget=shot.get('keyframeBudget',2000)
    key_count=frames*2
    if key_count>budget:
        errors.append(f'Dense subject+camera bake needs {key_count} keys; budget is {budget}. Use verified interpolation or explicitly change sampling/duration/FPS.')
    metrics={'subject':stats(positions,fps),
             'camera':stats([r['camera']['position'] for r in samples],fps),
             'aim':stats([r['camera']['target'] for r in samples],fps)}
    warnings.append('36 mm projection proxy unless sensorWidthMm is supplied; actual Toonkit projection/rig bounds must be verified.')
    warnings.append('Body presets, contacts, engine interpolation, lens interpolation, and output pixels are not simulated.')
    summary={'durationSeconds':duration,'fps':fps,'frames':frames,'lastFrame':frames-1,
             'aspect':aspect,'denseKeyCount':key_count,'metrics':metrics,'issues':counts,
             'errors':errors,'warnings':warnings}
    return rounded({'format':'3dref-neutral-v1','summary':summary,'samples':samples})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('shot',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    try:
        shot=json.loads(args.shot.read_text(encoding='utf-8'))
        result=build(shot)
    except (ValueError,KeyError,TypeError,OverflowError) as exc:
        parser.exit(2,f'Invalid shot: {exc}\n')
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps(result['summary'],indent=2,ensure_ascii=False,allow_nan=False))
    if result['summary']['errors']:
        parser.exit(2)


if __name__=='__main__':
    main()
