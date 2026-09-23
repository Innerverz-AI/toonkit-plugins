#!/usr/bin/env python3
"""Portable one-tool-at-a-time relay using the SAME bridge as the retained runtime."""
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path
from journal import snapshot,compact,lock

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run',type=Path)
    sub=p.add_subparsers(dest='command',required=True)
    s=sub.add_parser('step');s.add_argument('phase',choices=['useProject','createProject','createScene','advance','finishExport','group']);s.add_argument('--args',default='{}')
    a=sub.add_parser('accept');a.add_argument('ioId');a.add_argument('response',help='JSON file path or - for stdin')
    args=p.parse_args()
    with (args.run/'journal.jsonl').open('a+',encoding='utf8') as journal:
        lock(journal);state=snapshot(args.run)
        def append(events):
            journal.write(''.join(compact(e)+'\n' for e in events));journal.flush();os.fsync(journal.fileno())
        if args.command=='accept':
            request=next((e for e in reversed(state['events']) if e.get('type')=='io-request' and e.get('id')==args.ioId),None)
            if not request:raise ValueError('Unknown pending IO ID')
            response=json.loads(sys.stdin.read() if args.response=='-' else Path(args.response).read_text())
            old=next((e for e in state['events'] if e.get('type')=='io-result' and e.get('id')==args.ioId),None)
            if old and old['response']!=response:raise ValueError('Conflicting response for the same request')
            if not old:append([{'type':'io-result','id':args.ioId,'response':response}])
            print(compact({'accepted':args.ioId}));return
        v=args.args
        params=json.loads(v if v.lstrip().startswith('{') else Path(v).read_text())
        proc=subprocess.run(['node',str(Path(__file__).with_name('relay.mjs'))],input=compact({'state':state,'phase':args.phase,'args':params}),text=True,capture_output=True,timeout=60)
        if proc.returncode:raise ValueError(proc.stderr[:1200])
        out=json.loads(proc.stdout);append(out.pop('events'));print(compact(out))
        if out.get('stage')=='error':sys.exit(2)
if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,subprocess.TimeoutExpired) as e:print('3Dref relay: '+str(e),file=sys.stderr);sys.exit(2)
