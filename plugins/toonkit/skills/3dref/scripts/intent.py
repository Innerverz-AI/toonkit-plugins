"""Reject ignored options early. This is the supported production vocabulary."""
def fields(value,allowed,label):
    if not isinstance(value,dict):raise ValueError(label+' must be an object')
    extra=set(value)-set(allowed.split())
    if extra:raise ValueError(label+' has unsupported fields: '+', '.join(sorted(extra)))

def validate(spec):
    fields(spec,'format timing timeWarp objects actors camera quality','spec')
    fields(spec['timing'],'durationSeconds fps aspect','timing')
    for o in spec.get('objects',[]):
        fields(o,'id name kind center size rotation color role purpose usedBy','object')
    for a in spec['actors']:
        fields(a,'id name color initialForward preset motion path support locomotion','actor')
        if 'locomotion' in a:
            fields(a['locomotion'],'mode reason','actor.locomotion')
            if a['locomotion'].get('mode') not in ('source-matched','stylized'):raise ValueError('locomotion.mode must be source-matched or stylized')
            if a['locomotion']['mode']=='stylized' and not a['locomotion'].get('reason'):raise ValueError('Stylized stride requires a direction-specific reason')
        if 'motion' in a:
            fields(a['motion'],'format rig baseline durationSeconds fps timeWarp segments','actor.motion')
            for segment in a['motion']['segments']:fields(segment,'preset start end sourceStart speed loop phaseLock','motion.segment')
        for p in a['path']:fields(p,'time position rotation velocity acceleration jerk hold','actor.path')
        for s in a['support']:
            fields(s,{'surface':'start end mode surface','transfer':'start end mode surfaces','flight':'start end mode takeoff landing maxSeconds reason'}.get(s.get('mode'),''),'actor.support')
    c=spec['camera'];fields(c,'targets targetHeight referenceUp anchors floorRoll','camera')
    if c.get('floorRoll'):
        fields(c['floorRoll'],'start end degrees surface','camera.floorRoll')
        if any('roll' in r for r in c['anchors']):raise ValueError('Choose floorRoll or explicit roll anchors')
    for r in c['anchors']:fields(r,'time azimuth elevation distance focalLength targetOffset roll velocity acceleration jerk hold','camera.anchor')
    fields(spec['quality'],'beats limits maxProxies budgetReason actorClearanceMeters interactions','quality')
    for beat in spec['quality']['beats']:
        fields(beat,'name start end actors cameraMotion maxStaticSeconds maxRelativeHoldSeconds allowStatic allowRelativeHold','quality.beat')
        for rule in beat['actors'].values():fields(rule,'height frameSafeNdc actionRate minTravel maxTravel offscreen reason','quality.beat.actor')
        if 'cameraMotion' in beat:fields(beat['cameraMotion'],'minTravel minRotationDegrees','quality.beat.cameraMotion')
    known={a['id'] for a in spec['actors']}|{'camera'}
    for ident,limits in spec['quality'].get('limits',{}).items():
        if ident not in known:raise ValueError('Unknown quality.limits target: '+ident)
        fields(limits,'maxSpeed maxAcceleration maxJerk'+(' maxAngularSpeed' if ident=='camera' else ''),'quality.limits')
    for event in spec['quality'].get('interactions',[]):fields(event,'actors start end minSeparationMeters reason','quality.interaction')
    for item in list(spec['actors'])+list(spec.get('objects',[])):
        if 'name' in item and (not isinstance(item['name'],str) or not 1<=len(item['name'])<=160):raise ValueError('Name must be 1–160 characters')
        if 'color' in item:
            import re
            if not isinstance(item['color'],str) or not re.fullmatch('#[0-9a-fA-F]{6}',item['color']):raise ValueError('Color must be #RRGGBB')
