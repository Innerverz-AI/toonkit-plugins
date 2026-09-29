#!/usr/bin/env python3
"""Claude Code tool hook for the spooled portable relay (`direct.py step --spool`).

Registered only by the 3dref skill frontmatter; the shell guard there starts Python
only while a stub or pending spooled request exists.
PreToolUse: a top-level argument equal to "3dref-spool:<ioId>" on an allowlisted,
credit-free 3dref relay tool is replaced by the parked request. Anything else is
left untouched; an unusable stub is denied so it never reaches the server.
PostToolUse / PostToolUseFailure: the result of that exact request is saved for
`direct.py <run> accept <ioId>` and the model sees a one-line note instead.
Transport failures are not saved; repeating the same stub call is safe.
"""
import hashlib, json, os, re, sys, time
from pathlib import Path

SPOOL = Path(os.environ.get('TOONKIT_3DREF_SPOOL') or Path.home() / '.cache/toonkit-3dref/spool')
MARK = re.compile(r'^3dref-spool:([0-9a-f]{24})$')
# Every tool the shared bridge calls. None of them spends credits.
TOOLS = {'toonkit_create_canvas', 'toonkit_get_canvas', 'toonkit_get_canvas_mutation',
         'toonkit_canvas_group_nodes', 'toonkit_canvas_reference3d_catalog',
         'toonkit_canvas_reference3d_create', 'toonkit_canvas_reference3d_edit',
         'toonkit_canvas_reference3d_get_scene'}
SPILL = re.compile(r'result \(([\d,]+) characters\) exceeds maximum allowed tokens\. '
                   r'Output has been saved to (.+?\.(?:txt|json))\.?\s*(?:\n|$)')
STALE_SECONDS = 7 * 86400


def log(message):
    try:
        SPOOL.mkdir(parents=True, exist_ok=True)
        with (SPOOL / 'hook.log').open('a', encoding='utf8') as f:
            f.write(time.strftime('%Y-%m-%dT%H:%M:%S ') + message + '\n')
    except OSError:
        pass


def canonical(value):
    # The host may re-serialize the substituted input (JSON 1.0 -> 1).
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [canonical(v) for v in value]
    if isinstance(value, dict):
        return {k: canonical(v) for k, v in value.items()}
    return value


def digest(value):
    return hashlib.sha256(json.dumps(canonical(value), sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def suffix(tool_name):
    return tool_name.rsplit('__', 1)[-1] if tool_name.startswith('mcp__') else ''


def emit(event, **fields):
    print(json.dumps({'hookSpecificOutput': {'hookEventName': event, **fields}}))


def write_atomic(path, text):
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(text, encoding='utf8')
    tmp.replace(path)


def prune():
    now = time.time()
    for path in SPOOL.iterdir():
        try:
            if path.name != 'hook.log' and now - path.stat().st_mtime > STALE_SECONDS:
                path.unlink()
        except OSError:
            pass


def pre(ev):
    tool = ev.get('tool_name', '')
    inp = ev.get('tool_input')
    if not isinstance(inp, dict):
        return
    ids = [MARK.match(v).group(1) for v in inp.values() if isinstance(v, str) and MARK.match(v)]
    if not ids:
        return
    sid = ids[0]

    def deny(reason):
        log('PRE deny ' + tool + ' ' + sid + ' ' + reason)
        emit('PreToolUse', permissionDecision='deny', permissionDecisionReason='3dref spool ' + sid + ': ' + reason)

    name = suffix(tool)
    if name not in TOOLS:
        return deny('stubs are accepted only by credit-free 3dref relay tools')
    try:
        parked = json.loads((SPOOL / (sid + '.json')).read_text(encoding='utf8'))
    except (OSError, ValueError) as e:
        return deny('no parked request (' + type(e).__name__ + '); rerun the relay step with --spool')
    if not isinstance(parked, dict) or parked.get('tool') != name or not isinstance(parked.get('arguments'), dict):
        return deny('parked request is for ' + str(parked.get('tool') if isinstance(parked, dict) else None) + ', not ' + name)
    args = parked['arguments']
    (SPOOL / (sid + '.response.json')).unlink(missing_ok=True)
    write_atomic(SPOOL / (sid + '.pending'), json.dumps({'tool': name, 'digest': digest(args)}))
    try:
        prune()
    except OSError:
        pass
    log('PRE ' + tool + ' ' + sid + ' bytes=' + str(len(json.dumps(args))))
    # No permissionDecision: Claude Code applies updatedInput under the user's normal
    # deny/ask rules instead of force-allowing the call.
    emit('PreToolUse', updatedInput=args)


def pending_for(name, inp):
    want = digest(inp)
    for path in SPOOL.glob('*.pending'):
        try:
            record = json.loads(path.read_text(encoding='utf8'))
        except (OSError, ValueError):
            continue
        if record.get('tool') == name and record.get('digest') == want:
            return path.name[:-len('.pending')]
    return None


def spilled_text(text, ev):
    """Claude Code replaces very large results with a notice naming a session file."""
    try:
        json.loads(text)
        return text
    except ValueError:
        pass
    m = SPILL.search(text)
    if not m:
        raise ValueError('non-JSON tool result')
    transcript = ev.get('transcript_path')
    if not transcript:
        raise ValueError('spill notice without transcript_path')
    # Main-session transcripts sit beside the session directory; subagent
    # transcripts sit one level inside it.
    here = Path(transcript).expanduser().resolve().parent
    resolved = Path(m.group(2).strip()).expanduser().resolve()
    if resolved.parent.name != 'tool-results' or not ({here, here.parent} & set(resolved.parents)):
        raise ValueError('spill file outside this session: ' + str(resolved))
    full = resolved.read_text(encoding='utf8')
    if len(full) != int(m.group(1).replace(',', '')):
        raise ValueError('spill file length differs from the notice')
    return full


def envelope(response, ev):
    """Return the MCP envelope bridge.js unpack() accepts, or raise."""
    if isinstance(response, str):
        text = spilled_text(response, ev)
        json.loads(text)  # a spilled file must be the complete JSON result
        return {'content': [{'type': 'text', 'text': text}]}
    if isinstance(response, list):
        texts = [c for c in response if isinstance(c, dict) and c.get('type') == 'text']
        if len(texts) != 1:
            raise ValueError('expected one text block')
        return envelope(texts[0].get('text', ''), ev)
    if isinstance(response, dict):
        if 'structuredContent' in response:
            return response
        if 'content' in response:
            env = envelope(response['content'], ev)
            if response.get('isError'):
                env['isError'] = True
            return env
        return {'content': [{'type': 'text', 'text': json.dumps(response)}]}
    raise ValueError('unrecognized tool response ' + type(response).__name__)


def server_error(error):
    """A structured MCP tool error; plain transport/host errors return None."""
    if not isinstance(error, str):
        return None
    start = error.find('{')
    if start < 0:
        return None
    try:
        value = json.loads(error[start:])
    except ValueError:
        return None
    return value if isinstance(value, dict) and value.get('code') and value.get('message') else None


def post(ev, failed):
    tool = ev.get('tool_name', '')
    name = suffix(tool)
    inp = ev.get('tool_input')
    if name not in TOOLS or not isinstance(inp, dict):
        return
    sid = pending_for(name, inp)
    if not sid:
        return
    target = SPOOL / (sid + '.response.json')
    event = 'PostToolUseFailure' if failed else 'PostToolUse'
    if failed:
        value = server_error(ev.get('error'))
        if value is None:
            log('FAIL ' + tool + ' ' + sid + ' transport; not saved')
            return emit(event, additionalContext='3dref spool ' + sid + ': not a server result; repeat the same stub call.')
        env = {'content': [{'type': 'text', 'text': json.dumps(value)}], 'isError': True}
    else:
        response = ev['tool_response'] if 'tool_response' in ev else ev.get('tool_result')
        try:
            env = envelope(response, ev)
        except (OSError, ValueError) as e:
            log('POST ' + tool + ' ' + sid + ' unusable ' + str(e)[:200])
            return emit(event, additionalContext='3dref spool ' + sid + ': response could not be saved (' + str(e)[:200] + '); repeat the same stub call.')
    body = json.dumps(env)
    write_atomic(target, body)
    (SPOOL / (sid + '.pending')).unlink(missing_ok=True)
    log(('FAIL ' if failed else 'POST ') + tool + ' ' + sid + ' saved chars=' + str(len(body)))
    note = '3dref spool ' + sid + ': ' + ('server error' if failed else 'response') + ' saved (' + str(len(body)) + ' chars). Next: direct.py <run> accept ' + sid
    if failed:
        emit(event, additionalContext=note)
    else:
        emit(event, updatedToolOutput=note)


def main():
    ev = json.loads(sys.stdin.read())
    name = ev.get('hook_event_name')
    if name == 'PreToolUse':
        pre(ev)
    elif name in ('PostToolUse', 'PostToolUseFailure'):
        if SPOOL.is_dir():
            post(ev, name == 'PostToolUseFailure')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # never break the host tool call
        log('ERR ' + type(e).__name__ + ' ' + str(e)[:300])
