#!/usr/bin/env python3
"""Compile a compact production specification into one immutable, checked run."""
import argparse,hashlib,json,os,subprocess,sys,tempfile,uuid
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def digest(x):
    return hashlib.sha256(compact(x).encode()).hexdigest()

def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.3dref-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(compact(data)+'\n'); f.flush(); os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def compile_body(motion, runtime, cache, offline):
    if motion is None: return None
    if not runtime or not cache: raise ValueError('Compound body motion needs --runtime and --cache')
    argv=['node',str(HERE/'motion_bake.mjs'),'-','--runtime',str(runtime),'--cache',str(cache),'--out','-']
    if offline: argv.append('--offline')
    r=subprocess.run(argv,input=compact(motion),text=True,capture_output=True,timeout=180)
    if r.returncode: raise ValueError(r.stderr.strip()[:1500])
    return json.loads(r.stdout)

def object_batches(commands):
    # Keep each declaration and dependent color together; clientRef cannot cross batches.
    groups=[]
    for c in commands:
        if c['op']=='object.add': groups.append([c])
        else: groups[-1].append(c)
    result=[]; current=[]
    for group in groups:
        if len(group)>50 or len(compact(group).encode())>65536: raise ValueError('Object group too large')
        if current and (len(current+group)>50 or len(compact(current+group).encode())>65536): result.append(current);current=[]
        current+=group
    if current: result.append(current)
    return result

def compile_spec(spec,runtime=None,cache=None,offline=False):
    from scene_compiler import compile_scene
    return compile_scene(spec,runtime,cache,offline)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('spec',type=Path);p.add_argument('--run',type=Path,required=True)
    p.add_argument('--runtime',type=Path,required=True);p.add_argument('--cache',type=Path,required=True)
    p.add_argument('--offline',action='store_true');args=p.parse_args();writable=False;spec=None
    try:
        existing={x.name for x in args.run.iterdir()} if args.run.exists() else set()
        if existing-set(('spec.json','diagnostic.json')):raise ValueError('Use a new run; compiled or execution data is immutable')
        if 'spec.json' in existing and args.spec.resolve()!=(args.run/'spec.json').resolve():raise ValueError('Existing input belongs to another file')
        writable=True;spec=json.loads(args.spec.read_text());bundle=compile_spec(spec,args.runtime,args.cache,args.offline)
        atomic(args.run/'spec.json',spec);atomic(args.run/'compiled.json',bundle)
        with (args.run/'journal.jsonl').open('x') as f:
            f.write(compact({'type':'init','runId':uuid.uuid4().hex,'digest':bundle['digest']})+'\n');f.flush();os.fsync(f.fileno())
        (args.run/'diagnostic.json').unlink(missing_ok=True)
        s=bundle['summary'];print(compact({'run':str(args.run),'files':3,**{k:s[k] for k in ('timing','objects','actors','storedKeys','denseKeys','batches','estimatedSceneBytes')},'preflightPassed':True,'warnings':s['checks']['preflight']['warnings']}))
    except (ValueError,KeyError,TypeError,OSError,subprocess.TimeoutExpired) as exc:
        diagnostic={'passed':False,'message':str(exc),**getattr(exc,'report',{})}
        if writable:
            if spec is not None:atomic(args.run/'spec.json',spec)
            atomic(args.run/'diagnostic.json',diagnostic)
        p.exit(2,compact({'passed':False,'diagnostic':str(args.run/'diagnostic.json') if writable else None,'message':str(exc)[:2000]})+'\n')

if __name__=='__main__':main()
