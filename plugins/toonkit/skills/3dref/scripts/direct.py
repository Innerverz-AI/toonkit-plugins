#!/usr/bin/env python3
"""Journaled step helper for hosts whose model calls MCP tools one at a time.

Standard library only. No network, credentials, MCP calls or browser control: it
prints the exact next tool request, records receipts in the run journal and checks
saved-scene/canvas evidence. Same compiled.json, journal.jsonl and idempotency keys
as the Codex runtime (bridge.js); the checks mirror its guards.

Evidence arguments (scene, canvas, receipt, error, metadata) accept inline JSON, a
file path (for example a tool result the client saved to disk) or '-' for stdin.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
ACTOR = '@actor____________________'
CAMERA = '@camera___________________'
TOLERANCE = .001001


class Stop(Exception):
    pass


def require(ok, message):
    if not ok: raise Stop(message)


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def evidence(value):
    if value == '-': text = sys.stdin.read()
    elif os.path.isfile(value): text = Path(value).read_text(encoding='utf-8')
    else: text = value
    try: x = json.loads(text)
    except json.JSONDecodeError: raise Stop('Evidence is not JSON (pass the tool result or the file it was saved to)')
    # Unwrap MCP envelopes: {structuredContent}, {content:[text]} or a bare content list.
    if isinstance(x, dict) and 'structuredContent' in x: x = x['structuredContent']
    elif isinstance(x, dict) and isinstance(x.get('content'), list) or isinstance(x, list):
        blocks = [c for c in (x['content'] if isinstance(x, dict) else x) if isinstance(c, dict) and c.get('type') == 'text']
        require(len(blocks) == 1, 'Unrecognized MCP envelope')
        try: x = json.loads(blocks[0]['text'])
        except json.JSONDecodeError: raise Stop('Non-JSON MCP response: '+blocks[0]['text'][:600])
    require(isinstance(x, dict) and x, 'Empty evidence')
    return x


class Run:
    def __init__(self, path):
        self.path = path
        bundle = json.loads((path/'compiled.json').read_text())
        expected = bundle.pop('digest')
        require(hashlib.sha256(compact(bundle).encode()).hexdigest() == expected, 'Compiled bundle was modified')
        require(bundle.get('format') == '3dref-run-v3' and bundle.get('schemaVersion') == 1, 'Unsupported compiled bundle')
        bundle['digest'] = expected
        self.B = bundle
        # Exclusive for the whole command: refuses while a Codex journal worker holds the run.
        self.journal = (path/'journal.jsonl').open('a+', encoding='utf-8')
        if os.name == 'nt':
            import msvcrt
            self.journal.seek(0); msvcrt.locking(self.journal.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            try: fcntl.flock(self.journal.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError: raise Stop('Another writer holds this run journal; close or recover it first')
        self.journal.seek(0)
        self.E = [json.loads(line) for line in self.journal.read().splitlines() if line.strip()]
        require(self.E and self.E[0].get('type') == 'init' and self.E[0].get('digest') == expected, 'Journal/bundle mismatch')
        self.run_id = self.E[0]['runId']

    def last(self, type, id=None):
        for e in reversed(self.E):
            if e.get('type') == type and (id is None or e.get('id') == id): return e
        return None

    def log(self, event):
        self.journal.seek(0, 2)
        self.journal.write(compact(event)+'\n'); self.journal.flush(); os.fsync(self.journal.fileno())
        self.E.append(event)

    def bindings(self):
        c = (self.last('accepted', 'canvas') or {}).get('receipt') or {}
        s = (self.last('accepted', 'scene') or {}).get('receipt') or {}
        ids = s.get('objectIds') or {}
        require(c.get('canvasId') and s.get('nodeId') and ids.get('human') and ids.get('camera'), 'Create receipt missing IDs')
        return {'canvasId': c['canvasId'], 'nodeId': s['nodeId'], 'actor': ids['human'], 'camera': ids['camera'], 'url': c.get('url')}

    def bound(self, commands):
        ids = self.bindings()
        return json.loads(compact(commands).replace(ACTOR, ids['actor']).replace(CAMERA, ids['camera']))

    def batch_done(self, i):
        return self.last('accepted', 'batch-%d' % i) is not None

    def current_seq(self):
        return max([0]+[e['receipt'].get('seq') or 0 for e in self.E if e.get('type') == 'accepted' and e.get('id') != 'canvas'])


def printed(run, event):
    args = dict(event['args'])
    if 'batch' in event: args['commands'] = run.bound(run.B['batches'][event['batch']]['commands'])
    return {'id': event['id'], 'tool': event['suffix'], 'arguments': args}


def write_request(run, id, suffix, args, batch=None):
    require(not run.last('failed', id), 'Rejected request '+id+'; review before a new scoped run')
    require(not run.last('accepted', id), id+' is already accepted')
    intent = run.last('request', id)
    if intent:
        # A lost response replays this exact key/request; never a new key or revision.
        return {**printed(run, intent), 'replay': True}
    event = {'type': 'request', 'id': id, 'suffix': suffix, 'args': {**args, 'idempotencyKey': '3dref-%s-%s' % (run.run_id, id)}}
    if batch is not None: event['batch'] = batch
    run.log(event)
    return printed(run, event)


def ready(run, s):
    """Mirror bridge readyScene: None while application is pending, else the checked scene."""
    ids = run.bindings()
    require(s.get('nodeId') in (None, ids['nodeId']), 'Scene evidence is for another node')
    require(not s.get('conflict') and not s.get('initializationRequired') and not s.get('compatibility'), 'Scene conflict/normalization requires review')
    active = s.get('activeNodeId')
    require(active in (None, ids['nodeId']), 'Another 3D node is armed for AI edits; open this node\'s editor first')
    if not (s.get('materialized') and s.get('appliedThroughSeq', -1) >= run.current_seq() and s.get('pendingCount') == 0): return None
    require(s.get('revision') and not s.get('nextCursor'), 'Incomplete saved scene')
    require(s['appliedThroughSeq'] == run.current_seq() and s.get('latestSeq') == run.current_seq(), 'Concurrent scene sequence changed')
    return s


def check_fresh(run, s):
    ids = run.bindings(); objects = s.get('objects') or []
    a = next((o for o in objects if o.get('id') == ids['actor']), None)
    c = next((o for o in objects if o.get('id') == ids['camera']), None)
    require(s.get('totalObjects') == 2 and len(objects) == 2 and a and a.get('kind') == 'human' and c and c.get('kind') == 'camera',
            'Fresh human_camera template required (read the unfiltered scene before the first batch)')
    require(not a.get('keyframes') and not c.get('keyframes') and not a.get('animation') and not a.get('model') and not a.get('modelAsset'),
            'Fresh correction-free stock actor required')
    require(not any(n != 0 for v in (a.get('pose') or {}).values() for n in v.values()), 'Actor has existing pose corrections')
    require(all(((a.get('transform') or {}).get('scale') or {}).get(k) == 1 for k in 'xyz'), 'Body profile requires unit actor scale')


def expected(run):
    ids = run.bindings()
    objects = {ids['actor']: {'kind': 'human', 'keys': {}}, ids['camera']: {'kind': 'camera', 'keys': {}}}
    for i, b in enumerate(run.B['batches']):
        accepted = run.last('accepted', 'batch-%d' % i)
        if not accepted: break
        receipt = accepted['receipt']
        for c in run.bound(b['commands']):
            id = c.get('objectId') or (receipt.get('objectIds') or {}).get(c.get('clientRef'))
            if c['op'] == 'object.add':
                require(id, 'Missing minted object ID')
                objects[id] = {'kind': c['kind'], **({'name': c['name']} if c.get('name') else {}), 'transform': c['transform'], 'keys': {}}
                continue
            if c['op'].startswith('scene.'): continue
            o = objects.get(id); require(o, 'Unowned command object')
            if c['op'] == 'object.rename': o['name'] = c['name']
            if c['op'] == 'object.setColor': o['color'] = c['color']
            if c['op'] == 'motion.applyPreset': o[c['slot']] = {'key': c['presetKey']}
            if c['op'] == 'camera.setAspect': o['camera'] = {**o.get('camera', {}), 'aspect': c['aspect']}
            if c['op'] == 'camera.set': o['camera'] = {**o.get('camera', {}), **c['camera']}
            if c['op'] == 'keyframe.upsert': o['keys'][c['frame']] = {**o['keys'].get(c['frame'], {}), **c['patch']}
    return objects


def verify_scene(run, s, full=True):
    exp = expected(run); ids = run.bindings(); stats = {'fields': 0, 'keys': 0, 'maxError': 0.}

    def match(a, b, path):
        if isinstance(a, (int, float)) and not isinstance(a, bool):
            require(isinstance(b, (int, float)) and not isinstance(b, bool) and b == b and abs(b) != float('inf'), 'Missing numeric '+path)
            e = abs(a-b); stats['maxError'] = max(stats['maxError'], e)
            require(e <= TOLERANCE, 'Stored value drift: '+path); stats['fields'] += 1; return
        if isinstance(a, list):
            require(isinstance(b, (list, dict)), 'Missing vector '+path)
            for i, v in enumerate(a): match(v, b[i] if isinstance(b, list) else b.get('xyz'[i]), path+'.'+str(i))
            return
        if isinstance(a, dict):
            require(isinstance(b, dict), 'Missing field '+path)
            for k, v in a.items(): match(v, b.get(k), path+'.'+k)
            return
        require(a == b, 'Stored field mismatch '+path); stats['fields'] += 1

    objects = s.get('objects') or []
    require(s.get('totalObjects') == len(exp), 'Unexpected object count/concurrent edit')
    for id, e in exp.items():
        o = next((x for x in objects if x.get('id') == id), None)
        if not o and not full: continue
        require(o, 'Missing stored object '+id)
        for k, v in e.items():
            if k != 'keys': match(v, o.get(k), id+'.'+k)
        if o.get('kind') == 'human' and id == ids['actor']:
            require(all(((o.get('transform') or {}).get('scale') or {}).get(k) == 1 for k in 'xyz'), 'Actor scale changed')
            require(not any(n != 0 for v in (o.get('pose') or {}).values() for n in v.values()), 'Unexpected base pose')
        keyframes = o.get('keyframes') or []
        require(len(keyframes) == len(e['keys']), 'Unexpected/missing key count '+id)
        for frame, p in e['keys'].items():
            k = next((k for k in keyframes if k.get('frame') == frame), None)
            require(k, 'Missing key %s' % frame); match(p, k, '%s.%s' % (id, frame)); stats['keys'] += 1
            if o.get('kind') == 'human':
                require(len(k.get('pose') or {}) == len(p.get('pose') or {}), 'Unexpected inherited pose at %s' % frame)
                if id == ids['actor']: match([1, 1, 1], (k.get('transform') or {}).get('scale'), 'key.scale')
            if o.get('kind') == 'camera' and e.get('camera'):
                for field in ['near', 'far']: match(e['camera'][field], (k.get('camera') or {}).get(field), 'key.camera.'+field)
    return {'objects': len(exp), 'keys': stats['keys'], 'comparedFields': stats['fields'],
            'maxStoredFieldError': stats['maxError'], 'appliedThroughSeq': s.get('appliedThroughSeq')}


def canvas_videos(canvas):
    require(isinstance(canvas.get('nodes'), list) and isinstance(canvas.get('edges'), list), 'Unrecognized canvas shape')
    require(not canvas.get('hasMore') and not canvas.get('nextCursor'), 'Canvas pagination needs explicit collection')
    rows = []
    for row in canvas['nodes']:
        require(isinstance(row.get('node'), dict), 'Unrecognized canvas node envelope')
        rows.append({**row['node'], 'mediaId': row.get('mediaId'), 'mediaDeleted': row.get('mediaDeleted'), 'status': row.get('status')})
    return [n for n in rows if n.get('type') == 'video']


def stage(run):
    if not run.last('accepted', 'canvas'): return {'stage': 'create-canvas', 'next': 'request canvas --name NAME'}
    if not run.last('accepted', 'scene'): return {'stage': 'create-scene', 'next': 'request scene --name NAME'}
    total = len(run.B['batches'])
    done = next((i for i in range(total) if not run.batch_done(i)), total)
    if done < total: return {'stage': 'dispatch', 'nextBatch': done, 'total': total, 'next': 'request batch --scene SCENE'}
    if not run.last('verified'): return {'stage': 'verify', 'next': 'verify SCENE'}
    if not run.last('export-ticket'): return {'stage': 'export-baseline', 'next': 'baseline CANVAS'}
    if not run.last('complete'):
        return {'stage': 'export', 'next': 'collect CANVAS' if not run.last('export-candidate') else 'complete METADATA'}
    if not run.last('accepted', 'group'): return {'stage': 'complete', 'next': 'optional: request group --title TITLE'}
    return {'stage': 'grouped'}


def requirements(run):
    B = run.B; ops = sorted({c['op'] for b in B['batches'] for c in b['commands']})
    batches = [len(compact(b['commands']).encode()) for b in B['batches']]
    presets = sorted({(c['slot'], c['presetKey']) for b in B['batches'] for c in b['commands'] if c['op'] == 'motion.applyPreset'})
    return {'catalog': {'commandSchemaVersion': 1, 'templateVersion': 1, 'nextCursor': None},
            'limitsAtLeast': {'objectsMax': B['summary']['objects'], 'keyframesMax': B['summary']['storedKeys'],
                              'sceneDocumentBytesMax': B['summary']['estimatedSceneBytes'],
                              'commandsPerBatchMax': max(len(b['commands']) for b in B['batches']), 'commandsBytesMax': max(batches)},
            'durationSecondsWithin': B['timing']['durationSeconds'], 'fpsEnum': B['timing']['fps'], 'aspectRatioEnum': B['timing']['aspect'],
            'operations': ops, 'presets': [{'slot': s, 'key': k} for s, k in presets]}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('run', type=Path)
    sub = p.add_subparsers(dest='command', required=True)
    sub.add_parser('status'); sub.add_parser('requirements')
    r = sub.add_parser('request'); r.add_argument('what', choices=['canvas', 'scene', 'batch', 'group'])
    r.add_argument('--name'); r.add_argument('--title'); r.add_argument('--scene')
    for name in ['accept', 'reject']:
        a = sub.add_parser(name); a.add_argument('id'); a.add_argument('evidence')
    for name in ['verify', 'baseline', 'collect', 'complete']:
        sub.add_parser(name).add_argument('evidence')
    args = p.parse_args()
    try:
        run = Run(args.run); out = handle(run, args)
    except (Stop, OSError, KeyError, TypeError, ValueError) as exc:
        p.exit(2, '3Dref direct: %s\n' % exc)
    print(compact(out))


def handle(run, args):
    B = run.B
    if args.command == 'status': return {**stage(run), 'runId': run.run_id, 'batches': len(B['batches']), 'summary': B['summary']}
    if args.command == 'requirements': return requirements(run)
    if args.command == 'request':
        if args.what == 'canvas':
            require(args.name and args.name.strip(), 'Project name required')
            return write_request(run, 'canvas', 'toonkit_create_canvas', {'name': args.name, 'aspectRatio': B['timing']['aspect']})
        if args.what == 'scene':
            c = (run.last('accepted', 'canvas') or {}).get('receipt'); require(c, 'Create project first')
            require(args.name and args.name.strip(), 'Scene name required')
            return write_request(run, 'scene', 'toonkit_canvas_reference3d_create', {'canvasId': c['canvasId'], 'name': args.name, 'template': 'human_camera'})
        if args.what == 'group':
            done = run.last('complete'); require(done, 'Group only after the export is complete')
            require(args.title and args.title.strip(), 'Group title required')
            v = done['result']
            return write_request(run, 'group', 'toonkit_canvas_group_nodes',
                                 {'canvasId': v['canvasId'], 'title': args.title, 'nodeIds': [v['source3dNodeId'], v['outputVideoNodeId']]})
        i = next((i for i in range(len(B['batches'])) if not run.batch_done(i)), None)
        require(i is not None, 'Dispatch complete; verify next')
        if run.last('request', 'batch-%d' % i): return write_request(run, 'batch-%d' % i, 'toonkit_canvas_reference3d_edit', {}, i)
        require(args.scene, 'Pass the fresh get_scene(view=saved) result with --scene')
        s = ready(run, evidence(args.scene))
        if s is None: return {'stage': 'application-pending', 'nextBatch': i, 'sequence': run.current_seq()}
        if i == 0: check_fresh(run, s)
        elif s.get('objects'): verify_scene(run, s, full=False)
        ids = run.bindings()
        return {**write_request(run, 'batch-%d' % i, 'toonkit_canvas_reference3d_edit',
                                {'canvasId': ids['canvasId'], 'nodeId': ids['nodeId'], 'expectedRevision': s['revision']}, i),
                'batch': i, 'total': len(B['batches'])}
    if args.command == 'accept':
        require(run.last('request', args.id), 'No journaled request '+args.id)
        prior = run.last('accepted', args.id)
        if prior: return {'id': args.id, 'accepted': True, 'duplicate': True}
        receipt = evidence(args.evidence)
        require(not receipt.get('isError') and not (receipt.get('code') and receipt.get('message')), 'Server error: record it with reject, do not accept')
        if args.id == 'canvas': require(receipt.get('canvasId') and receipt.get('url'), 'Missing project ID/URL')
        else: require(receipt.get('mutationId') and receipt.get('status') in ['PENDING', 'APPLIED'], 'Incomplete mutation receipt; replay the exact request')
        if args.id == 'scene': require(receipt.get('nodeId') and (receipt.get('objectIds') or {}).get('human') and receipt['objectIds'].get('camera'), 'Create receipt missing IDs')
        run.log({'type': 'accepted', 'id': args.id, 'receipt': receipt, 'acceptedAt': int(time.time()*1000)})
        keep = {k: receipt.get(k) for k in ['canvasId', 'url', 'nodeId', 'mutationId', 'status', 'seq', 'blockedReason', 'blockedHint'] if receipt.get(k) is not None}
        return {'id': args.id, 'accepted': True, **keep, **stage(run)}
    if args.command == 'reject':
        require(run.last('request', args.id) and not run.last('accepted', args.id), 'Nothing pending to reject for '+args.id)
        run.log({'type': 'failed', 'id': args.id, 'error': evidence(args.evidence)})
        return {'id': args.id, 'failed': True, 'next': 'stop; review the rejection before a new scoped run'}
    if args.command == 'verify':
        require(all(run.batch_done(i) for i in range(len(B['batches']))), 'Dispatch incomplete')
        if run.last('verified'): return run.last('verified')['summary']
        s = ready(run, evidence(args.evidence))
        if s is None: return {'stage': 'application-pending'}
        summary = verify_scene(run, s); run.log({'type': 'verified', 'summary': summary, 'revision': s['revision']})
        return summary
    if args.command == 'baseline':
        require(run.last('verified'), 'Verify saved scene before export')
        if not run.last('export-baseline'):
            run.log({'type': 'export-baseline', 'videoIds': [n['id'] for n in canvas_videos(evidence(args.evidence))]})
        issued = run.last('export-ticket'); ids = run.bindings()
        if not issued: run.log({'type': 'export-ticket', 'id': run.run_id, 'issuedAt': int(time.time()*1000)})
        return {'ticketId': run.run_id, 'source3dNodeId': ids['nodeId'], 'canvasId': ids['canvasId'],
                'baselineVideoIds': run.last('export-baseline')['videoIds'], 'allowClick': not issued,
                'expectedDuration': B['timing']['durationSeconds'], 'sceneFps': B['timing']['fps']}
    if args.command == 'collect':
        baseline = run.last('export-baseline'); require(baseline, 'Record baseline before the single UI Export')
        if run.last('export-candidate'): return run.last('export-candidate')['value']
        ids = run.bindings(); c = evidence(args.evidence)
        nodes = [n for n in canvas_videos(c) if n.get('id') not in baseline['videoIds'] and
                 any(e.get('source') == ids['nodeId'] and e.get('target') == n.get('id') and not e.get('pending') for e in c['edges'])]
        require(len(nodes) <= 1, 'Multiple new videos: resolve source/output explicitly')
        if not nodes or not nodes[0].get('mediaId') or nodes[0].get('pending'): return {'stage': 'export-pending'}
        n = nodes[0]; require(not n.get('mediaDeleted'), 'Export media was deleted')
        require(isinstance(n['mediaId'], str), 'Malformed exported media identity')
        value = {'canvasId': ids['canvasId'], 'source3dNodeId': ids['nodeId'], 'outputVideoNodeId': n['id'], 'mediaId': n['mediaId'],
                 'sceneFps': B['timing']['fps'], 'aspect': B['timing']['aspect']}
        run.log({'type': 'export-candidate', 'value': value}); return value
    if args.command == 'complete':
        if run.last('complete'): return run.last('complete')['result']
        v = (run.last('export-candidate') or {}).get('value'); require(v, 'Collect one new source-linked video first')
        m = evidence(args.evidence); fps = B['timing']['fps']
        require(m.get('outputVideoNodeId') == v['outputVideoNodeId'], 'DOM metadata must be scoped to the new output node')
        d = m.get('durationSeconds')
        require(isinstance(d, (int, float)) and abs(d-B['timing']['durationSeconds']) <= max(.1, 1/fps), 'Actual export duration mismatch')
        w, h = m.get('width'), m.get('height')
        require(type(w) is int and type(h) is int and w > 0 and h > 0, 'No decoded video dimensions')
        require(type(m.get('readyState')) is int and 2 <= m['readyState'] <= 4 and m.get('error') is None, 'Video is not decode-ready')
        aw, ah = map(float, B['timing']['aspect'].split(':'))
        require(abs(w/h-aw/ah) < .02, 'Actual export aspect mismatch')
        result = {**v, 'durationSeconds': d, 'width': w, 'height': h, 'videoReadyState': m['readyState'], 'error': None, 'r2vValidated': False}
        run.log({'type': 'complete', 'result': result}); return result


if __name__ == '__main__': main()
