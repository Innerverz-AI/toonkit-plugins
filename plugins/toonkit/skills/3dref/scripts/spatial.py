"""Explicit XYZ camera/actor frames. No engine calls; local +Z is camera back."""
import math

def dot(a,b): return sum(x*y for x,y in zip(a,b))
def add(a,b): return [x+y for x,y in zip(a,b)]
def sub(a,b): return [x-y for x,y in zip(a,b)]
def mul(a,s): return [x*s for x in a]
def unit(a):
    n=math.sqrt(dot(a,a))
    if not math.isfinite(n) or n<1e-10: raise ValueError('Degenerate orientation vector')
    return mul(a,1/n)
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]

def xyz_columns(degrees):
    x,y,z=map(math.radians,degrees)
    a,b,c,d,e,f=math.cos(x),math.sin(x),math.cos(y),math.sin(y),math.cos(z),math.sin(z)
    return [[c*e,a*f+b*e*d,b*f-a*e*d],[-c*f,a*e-b*f*d,b*e+a*f*d],[d,-b*c,a*c]]

def rotate(v,rotation):
    columns=xyz_columns(rotation)
    return [sum(v[j]*columns[j][i] for j in range(3)) for i in range(3)]

def camera_basis(position,target,roll=0,reference_up=(0,1,0)):
    back=unit(sub(position,target)); right=unit(cross(reference_up,back)); up=cross(back,right)
    co,si=math.cos(math.radians(roll)),math.sin(math.radians(roll))
    return add(mul(right,co),mul(up,si)),add(mul(up,co),mul(right,-si)),back

def solve_floor_roll(position,target,normal,reference_up=(0,1,0)):
    right,up,back=camera_basis(position,target,reference_up=reference_up)
    n=unit(normal)
    if abs(dot(n,back))>.9999: raise ValueError('Surface normal parallel to view; cannot establish screen floor')
    return math.degrees(math.atan2(-dot(n,right),dot(n,up)))

def basis_xyz(basis,previous=None):
    right,up,back=basis
    y=math.asin(max(-1,min(1,back[0])))
    if abs(back[0])<.9999999: x,z=math.atan2(-back[1],back[2]),math.atan2(-up[0],right[0])
    else: x,z=math.atan2(up[2],up[1]),0
    base=[math.degrees(v) for v in (x,y,z)]
    if previous is None: return base
    candidates=[base,[base[0]+180,180-base[1],base[2]+180]]
    candidates=[[v+360*round((p-v)/360) for v,p in zip(c,previous)] for c in candidates]
    return min(candidates,key=lambda c:sum((a-b)**2 for a,b in zip(c,previous)))

def project(point,camera,aspect,sensor=36):
    right,up,back=xyz_columns(camera['rotation']); delta=sub(point,camera['position']); depth=-dot(delta,back)
    if depth<=0: return [float('inf'),float('inf'),depth]
    k=2*camera['focalLength']/(sensor*depth)
    return [k*dot(delta,right),k*aspect*dot(delta,up),depth]

def angular_distance(a,b):
    # trace(Ra^T Rb); measures orientation, not arbitrary Euler branches.
    trace=sum(dot(x,y) for x,y in zip(xyz_columns(a),xyz_columns(b)))
    return math.degrees(math.acos(max(-1,min(1,(trace-1)/2))))

def box_corners(bounds,transform):
    from itertools import product
    return [add(transform['position'],rotate([v*s for v,s in zip(p,transform['scale'])],transform['rotation']))
            for p in product(*zip(bounds['min'],bounds['max']))]

def potentially_visible(corners,camera,aspect,near=.05,far=40,sensor=36,margin=1.05):
    # Conservative six-plane rejection. A containing/straddling box is retained.
    right,up,back=xyz_columns(camera['rotation']); k=2*camera['focalLength']/sensor
    cs=[(k*dot(sub(p,camera['position']),right),k*aspect*dot(sub(p,camera['position']),up),-dot(sub(p,camera['position']),back)) for p in corners]
    return not any(all(test(x,y,z) for x,y,z in cs) for test in [
        lambda x,y,z:z<near,lambda x,y,z:z>far,lambda x,y,z:x>margin*z,
        lambda x,y,z:x<-margin*z,lambda x,y,z:y>margin*z,lambda x,y,z:y<-margin*z])
