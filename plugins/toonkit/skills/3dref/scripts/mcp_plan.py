"""Bone-local pose quaternion comparison; renderer uses YXZ corrections."""
import math
HUMAN_JOINTS=set('body head neck chest upperAbdomen lowerAbdomen shoulderR upperArmR foreArmR handR shoulderL upperArmL foreArmL handL upLegR legR footR toeR upLegL legL footL toeL'.split())


def pose_quaternion(p):
    # q_y * q_x * q_z: Toonkit's additive bone-local YXZ convention.
    x,y,z=(math.radians(p[k])/2 for k in ('tiltX','twist','tiltZ'))
    sx,cx,sy,cy,sz,cz=math.sin(x),math.cos(x),math.sin(y),math.cos(y),math.sin(z),math.cos(z)
    return [sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz]


def rotation_error(a,b):
    # Left multiplication by the same baseline quaternion preserves angular error.
    d=abs(sum(x*y for x,y in zip(pose_quaternion(a),pose_quaternion(b))))
    return math.degrees(2*math.acos(max(-1,min(1,d))))
