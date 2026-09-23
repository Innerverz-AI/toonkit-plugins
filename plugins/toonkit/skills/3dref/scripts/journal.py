#!/usr/bin/env python3
"""Small durable JSONL worker. Standard library, no compiler imports or network.

One process per active run, one advisory lock on its existing journal. No daemon,
socket, credential, or extra work file. Newline RPC; flush/fsync before ACK.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True


def compact(x):
    return json.dumps(x,ensure_ascii=False,separators=(',', ':'),allow_nan=False)


def snapshot(run):
    bundle=json.loads((run/'compiled.json').read_text())
    expected=bundle.pop('digest')
    actual=hashlib.sha256(compact(bundle).encode()).hexdigest()
    if actual!=expected: raise ValueError('Compiled bundle was modified')
    bundle['digest']=expected
    events=[json.loads(line) for line in (run/'journal.jsonl').read_text().splitlines()]
    if not events or events[0].get('type')!='init' or events[0].get('digest')!=expected: raise ValueError('Journal/bundle mismatch')
    if bundle.get('format')!='3dref-run-v3': raise ValueError('Use the matching runtime for this run format')
    return {'bundle':bundle,'events':events}


def lock(file):
    file.seek(0)
    if os.name=='nt':
        import msvcrt
        msvcrt.locking(file.fileno(),msvcrt.LK_NBLCK,1)
    else:
        import fcntl
        fcntl.flock(file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    file.seek(0,2)


def send(id,ok,result):
    sys.stdout.write(compact({'id':id,'ok':ok,'result':result})+'\n');sys.stdout.flush()


def serve(run):
    # Disable PTY echo and canonical line limits. Restored on exit; not app UI control.
    attrs=None
    if os.name!='nt' and sys.stdin.isatty():
        import termios
        attrs=termios.tcgetattr(sys.stdin.fileno());raw=termios.tcgetattr(sys.stdin.fileno())
        raw[3]&=~(termios.ECHO|termios.ICANON);raw[6][termios.VMIN]=1;raw[6][termios.VTIME]=0
        termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,raw)
    try:
        with (run/'journal.jsonl').open('a+',encoding='utf-8') as journal:
            lock(journal);state=snapshot(run);serialized=compact(state)
            send('boot',True,{'ready':True,'characters':len(serialized)})
            for line in sys.stdin:
                ident=None
                try:
                    request=json.loads(line);ident=request['id'];op=request['op']
                    if op=='load':
                        # Snapshot only at startup; subsequent state lives in the host runtime.
                        offset=request.get('offset',0);size=request.get('size',len(serialized))
                        if type(offset)!=int or type(size)!=int or offset<0 or size<1: raise ValueError('Invalid snapshot range')
                        send(ident,True,{'chunk':serialized[offset:offset+size],'characters':len(serialized)})
                    elif op=='append':
                        events=request['events']
                        if not isinstance(events,list) or not events or any(not isinstance(e,dict) or not isinstance(e.get('type'),str) for e in events): raise ValueError('Nonempty event array required')
                        # Validate/encode everything before changing the journal.
                        data=''.join(compact(e)+'\n' for e in events)
                        journal.write(data);journal.flush();os.fsync(journal.fileno())
                        state['events'].extend(events);send(ident,True,{'persisted':len(events)})
                    elif op=='ping': send(ident,True,{'ready':True})
                    elif op=='close':
                        send(ident,True,{'closed':True});return
                    else: raise ValueError('Unknown operation')
                except Exception as exc:
                    send(ident,False,{'error':str(exc)[:1000]})
                    # Do not continue after a possibly partial append.
                    return
    finally:
        if attrs is not None: termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,attrs)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--run',type=Path,required=True)
    args=parser.parse_args()
    try: serve(args.run)
    except Exception as exc:
        send('boot',False,{'error':str(exc)[:1000]});sys.exit(2)
