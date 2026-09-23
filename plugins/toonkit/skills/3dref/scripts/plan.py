"""Shared C3 curve and collision mathematics. No authoring entry point."""
import math
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
