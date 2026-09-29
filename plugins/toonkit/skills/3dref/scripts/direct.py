#!/usr/bin/env python3
"""Portable one-tool-at-a-time relay using the SAME bridge as the retained runtime."""
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path
from journal import snapshot,compact,lock

SPOOL=Path(os.environ.get('TOONKIT_3DREF_SPOOL') or Path.home()/'.cache/toonkit-3dref/spool')
# Stub fields carry the marker. Each is invalid on the server, so a stub that
# reaches it without the Claude Code hook is rejected without mutation.
POISON={'toonkit_create_canvas':('aspectRatio','name','idempotencyKey'),
        'toonkit_canvas_reference3d_catalog':('cursor',),
        'toonkit_get_canvas_mutation':('mutationId',)}

def spool(out):
    """Park the exact request for spool_hook.py; print only a small stub."""
    tool,a,io=out['tool'],out['arguments'],out['ioId']
    SPOOL.mkdir(parents=True,exist_ok=True)
    (SPOOL/(io+'.response.json')).unlink(missing_ok=True)
    tmp=SPOOL/(io+'.json.tmp');tmp.write_text(compact({'tool':tool,'arguments':a}),encoding='utf8');tmp.replace(SPOOL/(io+'.json'))
    mark='3dref-spool:'+io
    stub={k:(v if isinstance(v,(int,float,bool)) or v is None or (isinstance(v,str) and len(v)<=200) else type(v)()) for k,v in a.items()}
    for k in POISON.get(tool,('canvasId',)):stub[k]=mark
    return {**{k:v for k,v in out.items() if k!='arguments'},'spooled':len(compact(a)),'stubArguments':stub,
            'next':'call '+tool+' with stubArguments exactly, then: accept '+io}

def envelope(response):
    """Normalize to the MCP envelope bridge.js unpack() accepts; reject anything else before journaling."""
    if isinstance(response,dict) and 'structuredContent' not in response and 'content' not in response:
        response={'content':[{'type':'text','text':json.dumps(response,separators=(',',':'))}]}
    if not isinstance(response,dict):raise ValueError('Response must be the MCP result object or its JSON payload')
    if 'structuredContent' not in response:
        texts=[c for c in response.get('content') or [] if isinstance(c,dict) and c.get('type')=='text']
        if len(texts)!=1 or not isinstance(texts[0].get('text'),str):raise ValueError('MCP envelope needs exactly one text content item')
        try:json.loads(texts[0]['text'])
        except ValueError:raise ValueError('MCP text content is not JSON; pass the complete tool result, not a summary')
    return response

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run',type=Path)
    sub=p.add_subparsers(dest='command',required=True)
    s=sub.add_parser('step');s.add_argument('phase',choices=['useProject','createProject','createScene','advance','finishExport','group']);s.add_argument('--args',default='{}')
    s.add_argument('--spool',action='store_true',help='Claude Code: park each tool request and print a stub for the skill hook')
    a=sub.add_parser('accept');a.add_argument('ioId');a.add_argument('response',nargs='?',help='JSON file path or - for stdin; omit to use the result saved by the spool hook')
    args=p.parse_args()
    with (args.run/'journal.jsonl').open('a+',encoding='utf8') as journal:
        lock(journal);state=snapshot(args.run)
        def append(events):
            journal.write(''.join(compact(e)+'\n' for e in events));journal.flush();os.fsync(journal.fileno())
        if args.command=='accept':
            request=next((e for e in reversed(state['events']) if e.get('type')=='io-request' and e.get('id')==args.ioId),None)
            if not request:raise ValueError('Unknown pending IO ID')
            old=next((e for e in state['events'] if e.get('type')=='io-result' and e.get('id')==args.ioId),None)
            saved=SPOOL/(args.ioId+'.response.json')
            if args.response is None:
                if not saved.is_file():
                    if old:print(compact({'accepted':args.ioId}));return
                    raise ValueError('No spooled response for '+args.ioId+'; repeat the same stub tool call (the hook saves its result), never retype it')
                src=str(saved)
            else:src=args.response
            response=envelope(json.loads(sys.stdin.read() if src=='-' else Path(src).read_text(encoding='utf8')))
            if old and old['response']!=response:raise ValueError('Conflicting response for the same request')
            if not old:append([{'type':'io-result','id':args.ioId,'response':response}])
            if args.response is None:
                for name in (args.ioId+'.json',args.ioId+'.response.json'):(SPOOL/name).unlink(missing_ok=True)
            print(compact({'accepted':args.ioId}));return
        v=args.args
        params=json.loads(v if v.lstrip().startswith('{') else Path(v).read_text())
        proc=subprocess.run(['node',str(Path(__file__).with_name('relay.mjs'))],input=compact({'state':state,'phase':args.phase,'args':params}),text=True,capture_output=True,timeout=60)
        if proc.returncode:raise ValueError(proc.stderr[:1200])
        out=json.loads(proc.stdout);append(out.pop('events'))
        if args.spool and out.get('stage')=='tool-request':out=spool(out)
        print(compact(out))
        if out.get('stage')=='error':sys.exit(2)
if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,subprocess.TimeoutExpired) as e:print('3Dref relay: '+str(e),file=sys.stderr);sys.exit(2)
