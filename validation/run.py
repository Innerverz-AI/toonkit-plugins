#!/usr/bin/env python3
"""Run release validation without live MCP/browser writes. Cache requires runtime/three and motions/."""
import argparse,ast,hashlib,json,os,re,subprocess,sys,time,uuid
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,required=True);p.add_argument('--work',type=Path,required=True);p.add_argument('--plugin-root',type=Path,help='Validate an extracted plugin instead of the checkout');p.add_argument('--fetch',action='store_true',help='Fetch missing checksum-pinned public motion files');a=p.parse_args()
ROOT=Path(__file__).resolve().parent.parent;PLUGIN=(a.plugin_root or ROOT/'plugins/toonkit').resolve();S=PLUGIN/'skills/3dref/scripts';sys.path.insert(0,str(S));sys.dont_write_bytecode=True
from compiler import compile_body

def run(argv,env=None):
    t=time.monotonic();r=subprocess.run(argv,env=env,capture_output=True,text=True)
    return {'passed':r.returncode==0,'exitCode':r.returncode,'seconds':round(time.monotonic()-t,3),'stdout':r.stdout,'stderr':r.stderr}
a.work.mkdir(parents=True,exist_ok=True);reports={}
try:
    for file in S.glob('*.py'):ast.parse(file.read_text())
    for file in list(S.glob('*.mjs'))+list(S.glob('*.js')):
        r=run(['node','--check',str(file)])
        if not r['passed']:raise ValueError(r['stderr'])
    for file in (PLUGIN/'skills').rglob('*.md'):
        text=re.sub(r'```.*?```|`[^`]*`','',file.read_text(),flags=re.S)
        for target in re.findall(r'\]\(([^)]+)\)',text):
            if '://' not in target and not target.startswith('#') and not (file.parent/target.split('#')[0]).exists():raise ValueError('Broken document link: '+str(file)+' -> '+target)
    for preset in ['standing-idle','running','walking','idle','jumping']:
        baseline=preset if preset in ('running','walking','idle') else 'standing-idle'
        m={'format':'3dref-motion-v1','rig':'stock-human','baseline':baseline,'fps':24,'durationSeconds':2,'segments':[{'preset':preset,'start':0,'end':2,'sourceStart':0,'speed':.5 if preset=='jumping' else 1,'loop':preset in ('running','walking','idle')}]}
        compile_body(m,a.cache/'runtime',a.cache/'motions',not a.fetch)
    bundle_run=a.work/('fixture-'+uuid.uuid4().hex[:8]);r=run([sys.executable,'-B',str(S/'compiler.py'),str(ROOT/'validation/fixtures/wall-roll.json'),'--run',str(bundle_run),'--runtime',str(a.cache/'runtime'),'--cache',str(a.cache/'motions'),'--offline']);reports['fixture']=r
    if not r['passed']:raise ValueError(r['stderr'])
    env={**os.environ,'TOONKIT_TEST_PLUGIN':str(PLUGIN),'TOONKIT_TEST_PYTHON':sys.executable,'TOONKIT_TEST_CACHE':str(a.cache.resolve()),'TOONKIT_TEST_BUNDLE':str((bundle_run/'compiled.json').resolve())}
    reports['calculation']=run([sys.executable,'-B',str(ROOT/'validation/tests/test_previz.py')],env)
    reports['bridge']=run(['node','--test','--test-reporter=tap',str(ROOT/'validation/tests/test_bridge.mjs')],env)
    reports['export']=run(['node','--test','--test-reporter=tap',str(ROOT/'validation/tests/test_export.mjs')],env)
except Exception as e:reports['setup']={'passed':False,'message':str(e)}
passed=all(r['passed'] for r in reports.values()) and len(reports)==4
for name,report in reports.items():(a.work/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n')
summary={'passed':passed,'suites':{k:{x:v[x] for x in ('passed','exitCode','seconds','message') if x in v} for k,v in reports.items()},'python':sys.version.split()[0],'node':subprocess.check_output(['node','--version'],text=True).strip(),'cache':str(a.cache),'liveToolsUsed':False}
(a.work/'validation-result.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary));sys.exit(0 if passed else 1)
