"""Renderer-backed geometry. Desired dimensions are never raw scale factors."""
import json, math
from pathlib import Path
from spatial import add, sub, mul, dot, rotate, xyz_columns, unit

PROFILE = json.loads((Path(__file__).with_name('engine-profile.json')).read_text())

def vector(v):
    if not isinstance(v,list) or len(v)!=3 or any(type(x) not in (int,float) or not math.isfinite(x) for x in v):
        raise ValueError('Expected three finite numbers')
    return v

def box_object(spec):
    """center/size describe an oriented box, not its axis-aligned bounding box."""
    if spec.get('kind','box')!='box':
        raise ValueError('Production geometry currently supports calibrated boxes; add an engine profile for other kinds')
    size=vector(spec['size']);center=vector(spec['center']);rotation=vector(spec.get('rotation',[0,0,0]))
    if min(size)<=0: raise ValueError('Object size must be positive')
    bounds=PROFILE['primitives']['box']['bounds']
    scale=[s/(hi-lo) for s,lo,hi in zip(size,bounds['min'],bounds['max'])]
    local_center=[(lo+hi)/2 for lo,hi in zip(bounds['min'],bounds['max'])]
    pivot_offset=rotate([v*s for v,s in zip(local_center,scale)],rotation)
    transform={'position':sub(center,pivot_offset),'rotation':rotation,'scale':scale}
    ident=spec['id']
    if spec.get('role') not in ('visible','contact','occluder','orientation') or not spec.get('purpose'):
        raise ValueError('Every object needs role and shot purpose')
    proxy={'id':ident,'bounds':bounds,'transform':transform,'role':spec['role'],'purpose':spec['purpose'],
           'boundsSource':PROFILE['id'],'geometryVerified':True,'solid':True,'usedBy':spec.get('usedBy',[])}
    command={'op':'object.add','clientRef':ident,'kind':'shape','shape':'box','name':spec.get('name',ident),'transform':transform}
    return command,proxy

def face(proxy, name):
    if name not in ('+x','-x','+y','-y','+z','-z'):raise ValueError('Face must be a signed axis')
    axis='xyz'.index(name[1]);sign=1 if name[0]=='+' else -1
    b,t=proxy['bounds'],proxy['transform'];columns=xyz_columns(t['rotation'])
    p=[(a+z)/2 for a,z in zip(b['min'],b['max'])];p[axis]=b['max' if sign>0 else 'min'][axis]
    point=add(t['position'],rotate([v*s for v,s in zip(p,t['scale'])],t['rotation']))
    return {'object':proxy['id'],'face':name,'point':point,'normal':mul(columns[axis],sign),
            'axis':axis,'bounds':b,'transform':t}

def local_point(point, surface):
    t=surface['transform'];d=sub(point,t['position'])
    return [dot(d,c)/s for c,s in zip(xyz_columns(t['rotation']),t['scale'])]

def on_face(point,surface,margin=0):
    p=local_point(point,surface);b=surface['bounds'];t=surface['transform']
    return all(b['min'][i]-margin/t['scale'][i]<=p[i]<=b['max'][i]+margin/t['scale'][i]
               for i in range(3) if i!=surface['axis'])

def signed_distance(point,surface):return dot(sub(point,surface['point']),surface['normal'])

def resolve_surface(ref,proxies):
    if not isinstance(ref,dict) or set(ref)!={'object','face'}:raise ValueError('Surface is {object,face}; free-floating planes are forbidden')
    p=next((p for p in proxies if p['id']==ref['object']),None)
    if not p or not p.get('geometryVerified'):raise ValueError('Contact surface requires renderer-backed geometry')
    return face(p,ref['face'])
