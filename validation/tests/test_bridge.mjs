import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const scripts=path.join(process.env.TOONKIT_TEST_PLUGIN||path.join(root,'plugins/toonkit'),'skills/3dref/scripts');
// Feed child stdin from a file: spawnSync's `input` pipe occasionally never reaches EOF
// on some hosts, which hangs the child. A file descriptor always ends.
function spawnInput(cmd,args,input,options={}){
 if(input===undefined)return spawnSync(cmd,args,{...options,stdio:['ignore','pipe','pipe']});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toonkit-stdin-')),file=path.join(dir,'stdin');fs.writeFileSync(file,input);
 const fd=fs.openSync(file,'r');try{return spawnSync(cmd,args,{...options,stdio:[fd,'pipe','pipe']})}finally{fs.closeSync(fd);fs.rmSync(dir,{recursive:true,force:true})}
}
const factory=eval(fs.readFileSync(path.join(scripts,'bridge.js'),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x)), envelope=x=>({structuredContent:clone(x)});
const B=JSON.parse(fs.readFileSync(process.env.TOONKIT_TEST_BUNDLE,'utf8'));
function mock(){
 const state={bundle:clone(B),events:[{type:'init',runId:'test-release-001',digest:B.digest}]};
 let seq=0,scene=false,conflict=false,outputs=[],lost=false,blocked=false,clock=0;const objects=new Map(),receipts=new Map(),calls=[];let changed=0;const timing={fps:24,durationSeconds:15};
 const vector=a=>Array.isArray(a)?{x:a[0],y:a[1],z:a[2]}:a;
 const transform=t=>Object.fromEntries(Object.entries(t).map(([k,v])=>[k,vector(v)]));
 const defaults=()=>({position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});
 const object=(id,kind,name)=>({id,kind,name,transform:defaults(),keyframes:[],pose:{},...(kind==='camera'?{camera:{focalLength:35,near:.05,far:40,aspect:'16:9'}}:{})});
 const catalog={commandSchemaVersion:1,templateVersion:1,limits:{objectsMax:200,keyframesMax:2000,sceneDocumentBytesMax:524288,commandsPerBatchMax:50,commandsBytesMax:65536,durationSeconds:[2,30]},entries:[{section:'enum',name:'fps',values:[12,15,24,30,60]},{section:'enum',name:'aspectRatio',values:['16:9','9:16','1:1']},...['animation','poseAsset'].map(slot=>({section:'presets',slot,items:['running','walking','idle','standing-idle'].map(key=>({key}))})),...B.batches.flatMap(b=>b.commands.map(c=>({section:'operation',op:c.op,domain:b.domain,required:[]})))]};
 async function call(s,a){calls.push({s,a:clone(a)});
  if(s==='toonkit_canvas_reference3d_catalog')return envelope(catalog);
  if(s==='toonkit_get_canvas')return envelope({canvasId:'canvas',nodes:outputs.map(node=>({node,mediaId:node.mediaId})),edges:outputs.map(n=>({source:'scene',target:n.id}))});
  if(s==='toonkit_create_canvas')return envelope({canvasId:'canvas',url:'https://toonkit.io/en/animations/canvas/canvas'});
  if(s==='toonkit_canvas_reference3d_get_scene')return envelope({revision:'r'+seq,timing,totalObjects:objects.size,objects:a.objectIds?[]:[...objects.values()],materialized:!blocked,pendingCount:blocked?1:0,appliedThroughSeq:blocked?seq-1:seq,latestSeq:seq,conflict,compatibility:[]});
  if(s==='toonkit_get_canvas_mutation')return envelope({status:'APPLIED',nodeId:'group',mutationId:'group-mutation'});
  if(s==='toonkit_canvas_group_nodes')return envelope({mutationId:'group-mutation',nodeId:'group',pending:true});
  if(receipts.has(a.idempotencyKey))return envelope(receipts.get(a.idempotencyKey));
  let refs={};
  if(s==='toonkit_canvas_reference3d_create'){
   scene=true;objects.set('human',object('human','human','Human'));objects.set('camera',object('camera','camera','Camera'));refs={human:'human',camera:'camera'};
  }else if(s==='toonkit_canvas_reference3d_edit'){
   assert.equal(a.expectedRevision,'r'+seq);changed++;
   for(const c of a.commands){
    if(c.op==='object.add'){const id='mint-'+c.clientRef;refs[c.clientRef]=id;objects.set(id,{...object(id,c.kind,c.name),...(c.shape?{shape:c.shape}:{}),transform:transform(c.transform)});continue;}
    if(c.op==='scene.setTiming')Object.assign(timing,{fps:c.fps,durationSeconds:c.durationSeconds});
    if(c.op.startsWith('scene.'))continue;
    const id=c.objectId||refs[c.clientRef],o=objects.get(id);assert.ok(o,'bound actor '+id);
    if(c.op==='object.rename')o.name=c.name;
    if(c.op==='object.setColor')o.color=c.color.toUpperCase();
    if(c.op==='motion.applyPreset')o[c.slot]={key:c.presetKey};
    if(c.op==='camera.setAspect')o.camera.aspect=c.aspect;
    if(c.op==='camera.set')Object.assign(o.camera,c.camera);
    if(c.op==='keyframe.upsert'){
      let key=o.keyframes.find(k=>k.frame===c.frame);
      if(!key){key={frame:c.frame,transform:clone(o.transform),pose:{},...(o.camera?{camera:clone(o.camera)}:{})};o.keyframes.push(key);}
      if(c.patch.transform)Object.assign(key.transform,transform(c.patch.transform));if(c.patch.pose)key.pose=clone(c.patch.pose);if(c.patch.camera)Object.assign(key.camera,c.patch.camera);
    }
   }
  }else throw Error('Unexpected '+s);
  const receipt={mutationId:'mutation-'+(++seq),status:'APPLIED',seq,nodeId:'scene',objectIds:refs};receipts.set(a.idempotencyKey,receipt);
  if(lost&&s.endsWith('_edit')){lost=false;throw Error('simulated lost response');}return envelope(receipt);
 }
 const api=()=>factory({call,append:async()=>{},sleep:async ms=>{clock+=ms},now:()=>clock},state);
 return {state,api,call,calls,objects,timing,get changed(){return changed},lose(){lost=true},block(){blocked=true},conflict(){conflict=true},output(id='output'){outputs.push({id,type:'video',mediaId:'media-'+id})}};
}
const opts={editorVisible:true};
async function prepare(m){await m.api().useProject({canvasId:'canvas',url:'https://toonkit.io/en/animations/canvas/canvas'});await m.api().createScene('release',{projectVisible:true});}

test('multi-actor canonical bridge binds every actor and verifies complete stored keys',async()=>{
 const m=mock();await prepare(m);const r=await m.api().advance(opts);assert.equal(r.stage,'export-ready');assert.equal(r.verified.keys,B.summary.storedKeys);assert.equal(r.verified.objects,B.summary.objects);assert.equal(m.changed,B.batches.length);
 assert.ok(m.calls.filter(c=>c.s.endsWith('_edit')).every(c=>c.a.commands.every(x=>!x.objectId?.startsWith('@'))));
 assert.ok(m.calls.filter(c=>c.s.endsWith('_get_scene')).some(c=>c.a.objectIds));
});
test('lost response cold replay reuses exact mutation and does not duplicate',async()=>{
 const m=mock();await prepare(m);m.lose();await assert.rejects(m.api().advance(opts),/lost response/);const r=await m.api().advance(opts);assert.equal(r.stage,'export-ready');assert.equal(m.changed,B.batches.length);
 const edits=m.calls.filter(c=>c.s.endsWith('_edit'));assert.deepEqual(edits[0].a,edits[1].a);
});
test('web chunk names do not gate a compatible catalog',async()=>{const m=mock();await prepare(m);assert.equal((await m.api().advance({...opts,engineAssetNames:['new-build.js']})).stage,'export-ready')});
test('concurrent conflict stops new edits',async()=>{const m=mock();await prepare(m);m.conflict();await assert.rejects(m.api().advance(opts),/conflict/);assert.equal(m.changed,0)});
test('invalid compiled gate prevents scene creation',async()=>{const m=mock();m.state.bundle.summary.checks.preflight.support.passed=false;await m.api().useProject({canvasId:'canvas',url:'https://toonkit.io/en/animations/canvas/canvas'});await assert.rejects(m.api().createScene('x',{projectVisible:true}),/preflight gate/)});
test('output identity and duration gate plus idempotent grouping',async()=>{
 const m=mock();await prepare(m);const r=await m.api().advance(opts);assert.equal((await m.api().beforeExport()).allowClick,false);
 m.output();let result=await m.api().finishExport({ticketId:r.ticket.ticketId,stage:'render-complete',videos:[]});assert.equal(result.stage,'metadata-pending');
 const metadata={outputVideoNodeId:'output',durationSeconds:B.timing.durationSeconds,width:640,height:360,readyState:4,error:null};
 await assert.rejects(m.api().confirmExport({...metadata,durationSeconds:1}),/duration mismatch/);
 result=await m.api().finishExport({ticketId:r.ticket.ticketId,stage:'metadata-ready',videos:[metadata]});assert.equal(result.stage,'complete');
 assert.equal((await m.api().group({title:'Release'})).stage,'delivered');await m.api().group({title:'Release'});assert.equal(m.calls.filter(c=>c.s.endsWith('_group_nodes')).length,1);
});
test('ambiguous source-linked outputs are never guessed',async()=>{const m=mock();await prepare(m);await m.api().advance(opts);m.output('one');m.output('two');await assert.rejects(m.api().collectExport(),/Multiple new videos/)});
test('portable relay full lifecycle survives cold processes without duplicate writes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toonkit-relay-'));try{
  fs.copyFileSync(process.env.TOONKIT_TEST_BUNDLE,path.join(dir,'compiled.json'));
  fs.writeFileSync(path.join(dir,'journal.jsonl'),JSON.stringify({type:'init',runId:'portable-001',digest:B.digest})+'\n');const m=mock();
  const invoke=(args,input)=>{const r=spawnInput(process.env.TOONKIT_TEST_PYTHON||'python3',['-B',path.join(scripts,'direct.py'),dir,...args],input,{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr+' '+r.stdout);return JSON.parse(r.stdout)};
  async function phase(name,args){
   for(let count=0;count<100;count++){
    const r=invoke(['step',name,'--args',JSON.stringify(args)]);
    if(r.stage!=='tool-request')return r;
    // Large results go through a response file: piping them to spawnSync stdin is
    // timing-dependent on some hosts. Small stdin accepts are covered separately.
    const file=path.join(dir,'response.json');fs.writeFileSync(file,JSON.stringify(await m.call(r.tool,r.arguments)));
    invoke(['accept',r.ioId,file]);invoke(['accept',r.ioId,file]);
   }throw Error('unbounded relay');
  }
  await phase('createProject',{name:'Portable fixture'});
  await phase('createScene',{name:'Runners',projectVisible:true});
  const ready=await phase('advance',opts);assert.equal(ready.stage,'export-ready');
  assert.equal(ready.verified.keys,B.summary.storedKeys);assert.equal(ready.verified.objects,B.summary.objects);
  assert.equal(ready.ticket.allowClick,true);assert.equal(m.changed,B.batches.length);
  assert.equal((await phase('advance',opts)).ticket.allowClick,false);assert.equal(m.changed,B.batches.length);
  const retry=await phase('finishExport',{ticketId:ready.ticket.ticketId,attemptId:ready.ticket.attemptId,clickAttempted:false,stage:'needs-clean-save'});
  assert.equal(retry.stage,'export-not-started');
  const recovered=await phase('advance',opts);assert.equal(recovered.ticket.allowClick,true);assert.notEqual(recovered.ticket.attemptId,ready.ticket.attemptId);
  m.output();
  const pending=await phase('finishExport',{ticketId:ready.ticket.ticketId,stage:'render-complete',videos:[]});
  assert.equal(pending.stage,'metadata-pending');assert.equal(pending.outputVideoNodeId,'output');
  const done=await phase('finishExport',{ticketId:ready.ticket.ticketId,stage:'metadata-ready',videos:[{outputVideoNodeId:'output',durationSeconds:B.timing.durationSeconds,width:640,height:360,readyState:4,error:null}]});
  assert.equal(done.stage,'complete');assert.equal(done.source3dNodeId,'scene');
  assert.equal((await phase('group',{title:'Verified previz'})).stage,'delivered');
  assert.equal((await phase('group',{title:'Verified previz'})).stage,'delivered');
  assert.equal(m.calls.filter(c=>c.s==='toonkit_canvas_group_nodes').length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('unapplied scene yields bounded progress without sending edits',async()=>{const m=mock();await prepare(m);m.block();const r=await m.api().advance(opts);assert.equal(r.stage,'application-pending');assert.equal(m.changed,0);assert.ok(m.calls.length<25)});

test('saved geometry and exposed timing changes cannot pass re-verification',async()=>{
 for(const field of ['shape','timing','camera']){
  const m=mock();await prepare(m);await m.api().advance(opts);
  if(field==='shape')[...m.objects.values()].find(o=>o.kind==='shape').shape='sphere';
  if(field==='timing')m.timing.fps=60;
  if(field==='camera')m.objects.get('camera').keyframes[0].transform.position.x+=20;
  await assert.rejects(m.api().advance(opts),/Stored/);
 }
});
test('durable no-click evidence permits one fresh attempt but stale evidence cannot authorize another',async()=>{
 const m=mock();await prepare(m);const one=await m.api().advance(opts);
 const noClick={ticketId:one.ticket.ticketId,attemptId:one.ticket.attemptId,stage:'needs-clean-save',clickAttempted:false};
 assert.equal((await m.api().finishExport(noClick)).stage,'export-not-started');
 const two=await m.api().advance(opts);assert.equal(two.ticket.allowClick,true);assert.notEqual(one.ticket.attemptId,two.ticket.attemptId);
 await assert.rejects(m.api().finishExport(noClick),/Stale export/);
 assert.equal((await m.api().advance(opts)).ticket.allowClick,false);
});

test('retained launcher and browser recover pre-click readiness failures end to end',async()=>{
 const launcher=eval(fs.readFileSync(path.join(scripts,'runtime.js'),'utf8'));
 const browserCode=fs.readFileSync(path.join(scripts,'browser-export.js'),'utf8');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const condition of ['hidden','stale','dirty','disabled']){
  const m=mock();await prepare(m);let blocked=true,clicks=0;
  const memory=new Map(),key='3dref-v4:/test/run';
  memory.set(key,{worker:1,prefix:'test_',bridgeCode:fs.readFileSync(path.join(scripts,'bridge.js'),'utf8'),browserCode,state:m.state,serial:0});
  const env={load:k=>memory.get(k),store:(k,v)=>memory.set(k,v),toolNames:[],sleep:async()=>{},tools:{
   write_stdin:async({chars})=>{const req=JSON.parse(chars);return {output:JSON.stringify({id:req.id,ok:true,result:{persisted:req.events?.length||0}})+'\n'}},
   ...Object.fromEntries(['toonkit_canvas_reference3d_catalog','toonkit_canvas_reference3d_get_scene','toonkit_canvas_reference3d_edit','toonkit_get_canvas'].map(s=>['test_'+s,a=>m.call(s,a)]))}};
  const options={skill:'/test/skill',runDir:'/test/run'};
  const step=(phase,args={})=>launcher(env,options,phase,args);
  let ready=await step('advance',opts);
  const doc={get visibilityState(){return blocked&&condition==='hidden'?'hidden':'visible'},body:{get textContent(){return blocked&&condition==='stale'?'Human 360f':B.actors.map(a=>a.name).join(' ')+' '+Math.round(B.timing.fps*B.timing.durationSeconds)+'f'}},querySelectorAll:()=>[]};
  const tab={getAXState:async()=>'',playwright:{evaluate:async fn=>{globalThis.document=doc;try{return fn()}finally{delete globalThis.document}},getByRole:(role,{name})=>({isEnabled:async()=>name==='Save'?blocked&&condition==='dirty':!(blocked&&condition==='disabled'),count:async()=>1,click:async()=>{clicks++;m.output()},waitFor:async()=>{}})}};
  const browserArgs={tabVariable:'tab',controls:{editorNodeId:'scene',exportLabel:'Export',saveLabel:'Save'}};
  async function browser(){const out=await step('browserCode',browserArgs);let evidence;await new AsyncFunction('tab','nodeRepl',out.code)(tab,{write:v=>evidence=v});return evidence;}
  const first=await browser();assert.equal(first.clickAttempted,false);assert.equal(clicks,0);
  assert.equal((await step('finishExport',first)).stage,'export-not-started');blocked=false;
  ready=await step('advance',opts);assert.equal(ready.ticket.allowClick,true);
  const second=await browser();assert.equal(second.clickAttempted,true);assert.equal(clicks,1);
  const pending=await step('finishExport',second);assert.equal(pending.stage,'metadata-pending');
  const done=await step('finishExport',{ticketId:ready.ticket.ticketId,stage:'metadata-ready',videos:[{outputVideoNodeId:'output',durationSeconds:B.timing.durationSeconds,width:640,height:360,readyState:4,error:null}]});
  assert.equal(done.stage,'complete');assert.equal(clicks,1);
 }
});

// Claude Code spooled relay: the host is simulated, the hook command is the exact
// one declared in the 3dref skill frontmatter.
const pluginRoot=process.env.TOONKIT_TEST_PLUGIN||path.join(root,'plugins/toonkit');
function hookCommands(){
 const text=fs.readFileSync(path.join(pluginRoot,'skills/3dref/SKILL.md'),'utf8');
 const fm=text.match(/^---\n([\s\S]*?)\n---/)[1].split('\n');const out={};let event=null;
 for(let i=0;i<fm.length;i++){
  const e=fm[i].match(/^  (PreToolUse|PostToolUse|PostToolUseFailure):$/);if(e){event=e[1];continue;}
  if(event&&/^\s+command: >-$/.test(fm[i])){const lines=[];while(fm[i+1]&&/^ {12}\S/.test(fm[i+1]))lines.push(fm[++i].trim());out[event]=lines.join(' ');}
 }
 return out;
}
function claudeHost(spool){
 const cmds=hookCommands();
 const env={...process.env,CLAUDE_PLUGIN_ROOT:pluginRoot,TOONKIT_3DREF_SPOOL:spool};
 const hook=ev=>{const r=spawnInput('sh',['-c',cmds[ev.hook_event_name]],JSON.stringify(ev),{encoding:'utf8',env});assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return r.stdout.trim()?JSON.parse(r.stdout).hookSpecificOutput:null};
 return {cmds,env,hook};
}
test('skill frontmatter declares one identical guarded hook for the three tool events',()=>{
 const c=hookCommands();assert.deepEqual(Object.keys(c).sort(),['PostToolUse','PostToolUseFailure','PreToolUse']);
 assert.equal(new Set(Object.values(c)).size,1);assert.match(c.PreToolUse,/exit 0;; esac/);assert.match(c.PreToolUse,/\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/3dref\/scripts\/spool_hook\.py/);
});
test('Claude Code spooled relay completes the lifecycle without the model carrying payloads',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toonkit-spool-'));try{
  const spool=path.join(dir,'spool'),session=path.join(dir,'projects','session-1');fs.mkdirSync(path.join(session,'tool-results'),{recursive:true});
  const transcript=session+'.jsonl';fs.mkdirSync(path.join(dir,'run'));
  fs.copyFileSync(process.env.TOONKIT_TEST_BUNDLE,path.join(dir,'run','compiled.json'));
  fs.writeFileSync(path.join(dir,'run','journal.jsonl'),JSON.stringify({type:'init',runId:'spooled-001',digest:B.digest})+'\n');
  const m=mock(),h=claudeHost(spool);let modelChars=0,spilled=0,requests=0;
  const invoke=args=>{const r=spawnInput(process.env.TOONKIT_TEST_PYTHON||'python3',['-B',path.join(scripts,'direct.py'),path.join(dir,'run'),...args],undefined,{encoding:'utf8',env:h.env,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr+' '+r.stdout);modelChars+=r.stdout.length;return JSON.parse(r.stdout)};
  async function phase(name,args){
   for(let count=0;count<100;count++){
    const r=invoke(['step',name,'--spool','--args',JSON.stringify(args)]);
    if(r.stage!=='tool-request')return r;
    requests++;assert.equal(r.arguments,undefined);const toolName='mcp__plugin_toonkit_toonkit__'+r.tool,mark='3dref-spool:'+r.ioId;
    assert.ok(Object.values(r.stubArguments).includes(mark));assert.ok(JSON.stringify(r.stubArguments).length<600);
    const pre=h.hook({hook_event_name:'PreToolUse',tool_name:toolName,tool_input:r.stubArguments,transcript_path:transcript});
    assert.equal(pre.permissionDecision,undefined);const input=pre.updatedInput;
    const x=(await m.call(r.tool,input)).structuredContent;let text=JSON.stringify(x);
    if(r.tool==='toonkit_canvas_reference3d_get_scene'&&!input.objectIds){
     // Oversized result: the host saves it and passes a notice to hooks.
     const file=path.join(session,'tool-results','mcp-get-scene-'+(++spilled)+'.txt');fs.writeFileSync(file,text);
     text='Error: result ('+text.length.toLocaleString('en-US')+' characters) exceeds maximum allowed tokens. Output has been saved to '+file+'.\nFormat: JSON with schema: {...}';
    }
    const post=h.hook({hook_event_name:'PostToolUse',tool_name:toolName,tool_input:JSON.parse(JSON.stringify(input)),tool_response:text,transcript_path:transcript});
    assert.match(post.updatedToolOutput,/response saved/);modelChars+=post.updatedToolOutput.length;
    invoke(['accept',r.ioId]);invoke(['accept',r.ioId]);
   }throw Error('unbounded relay');
  }
  await phase('createProject',{name:'Spooled fixture'});
  await phase('createScene',{name:'Runners',projectVisible:true});
  const ready=await phase('advance',opts);assert.equal(ready.stage,'export-ready');
  assert.equal(ready.verified.keys,B.summary.storedKeys);assert.equal(m.changed,B.batches.length);assert.ok(spilled>=1);
  m.output();
  const done=await phase('finishExport',{ticketId:ready.ticket.ticketId,stage:'metadata-ready',videos:[{outputVideoNodeId:'output',durationSeconds:B.timing.durationSeconds,width:640,height:360,readyState:4,error:null}]});
  assert.equal(done.stage,'complete');
  assert.equal((await phase('group',{title:'Spooled previz'})).stage,'delivered');
  const payload=m.calls.reduce((n,c)=>n+JSON.stringify(c.a).length,0);
  assert.ok(modelChars*4<payload,'model-visible relay text '+modelChars+' vs payload '+payload);
  assert.deepEqual(fs.readdirSync(spool).filter(f=>f!=='hook.log'),[]);assert.ok(requests>B.batches.length);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('spool hook refuses unsafe stubs and saves only exact server results',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toonkit-hook-'));try{
  const spool=path.join(dir,'spool'),h=claudeHost(spool),id='0123456789abcdef01234567',mark='3dref-spool:'+id,tool='mcp__plugin_toonkit_toonkit__toonkit_canvas_reference3d_edit';
  assert.equal(h.hook({hook_event_name:'PreToolUse',tool_name:tool,tool_input:{canvasId:'01REAL'}}),null);
  assert.equal(h.hook({hook_event_name:'PostToolUse',tool_name:tool,tool_input:{canvasId:'01REAL'},tool_response:'{}'}),null);
  assert.equal(fs.existsSync(spool),false,'guard must not start Python without a stub or pending request');
  assert.equal(h.hook({hook_event_name:'PreToolUse',tool_name:tool,tool_input:{canvasId:mark}}).permissionDecision,'deny');
  fs.mkdirSync(spool,{recursive:true});const args={canvasId:'01REAL',nodeId:'n',expectedRevision:'r1',commands:[{op:'keyframe.upsert',frame:1,patch:{transform:{position:[1.0,2.5,3]}}}],idempotencyKey:'k'};
  fs.writeFileSync(path.join(spool,id+'.json'),JSON.stringify({tool:'toonkit_canvas_reference3d_edit',arguments:args}));
  for(const paid of ['toonkit_generate_video','toonkit_canvas_generate_image','toonkit_get_canvas'])
   assert.equal(h.hook({hook_event_name:'PreToolUse',tool_name:'mcp__plugin_toonkit_toonkit__'+paid,tool_input:{canvasId:mark,prompt:mark}}).permissionDecision,'deny');
  const pre=h.hook({hook_event_name:'PreToolUse',tool_name:tool,tool_input:{canvasId:mark}});assert.deepEqual(pre.updatedInput,args);
  const sent=JSON.parse(JSON.stringify(pre.updatedInput).replace('1.0','1'));
  assert.match(h.hook({hook_event_name:'PostToolUseFailure',tool_name:tool,tool_input:sent,error:'fetch failed: socket hang up'}).additionalContext,/repeat the same stub call/);
  assert.equal(fs.existsSync(path.join(spool,id+'.response.json')),false);
  assert.match(h.hook({hook_event_name:'PostToolUse',tool_name:tool,tool_input:sent,tool_response:'Internal error'}).additionalContext,/could not be saved/);
  assert.equal(fs.existsSync(path.join(spool,id+'.response.json')),false);
  const error={code:'STALE_REVISION',message:'stale',mutated:false};
  assert.match(h.hook({hook_event_name:'PostToolUseFailure',tool_name:tool,tool_input:sent,error:JSON.stringify(error)}).additionalContext,/server error saved/);
  const saved=JSON.parse(fs.readFileSync(path.join(spool,id+'.response.json'),'utf8'));assert.equal(saved.isError,true);assert.deepEqual(JSON.parse(saved.content[0].text),error);
  assert.equal(fs.existsSync(path.join(spool,id+'.pending')),false);
  assert.equal(h.hook({hook_event_name:'PostToolUse',tool_name:tool,tool_input:sent,tool_response:'{"late":true}'}),null,'a settled request is never overwritten');
  fs.writeFileSync(path.join(spool,id+'.json'),JSON.stringify({tool:'toonkit_canvas_reference3d_create',arguments:args}));
  assert.equal(h.hook({hook_event_name:'PreToolUse',tool_name:tool,tool_input:{canvasId:mark}}).permissionDecision,'deny');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('relay accept normalizes bare results and rejects malformed ones before journaling',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toonkit-accept-'));try{
  fs.copyFileSync(process.env.TOONKIT_TEST_BUNDLE,path.join(dir,'compiled.json'));
  fs.writeFileSync(path.join(dir,'journal.jsonl'),JSON.stringify({type:'init',runId:'accept-0001',digest:B.digest})+'\n');
  const env={...process.env,TOONKIT_3DREF_SPOOL:path.join(dir,'spool')};
  const run=(args,input)=>spawnInput(process.env.TOONKIT_TEST_PYTHON||'python3',['-B',path.join(scripts,'direct.py'),dir,...args],input,{encoding:'utf8',env});
  const r=JSON.parse(run(['step','createProject','--spool','--args','{"name":"Accept"}']).stdout);assert.equal(r.tool,'toonkit_canvas_reference3d_catalog');
  assert.equal(r.stubArguments.cursor,'3dref-spool:'+r.ioId);
  const before=fs.readFileSync(path.join(dir,'journal.jsonl'),'utf8');
  for(const bad of ['{"content":[{"type":"text","text":"Internal error"}]}','[1,2]','{"content":[]}']){const x=run(['accept',r.ioId,'-'],bad);assert.equal(x.status,2);}
  assert.match(run(['accept',r.ioId]).stderr,/No spooled response/);
  assert.equal(fs.readFileSync(path.join(dir,'journal.jsonl'),'utf8'),before);
  const m=mock(),catalog=(await m.call('toonkit_canvas_reference3d_catalog',{})).structuredContent;
  assert.equal(run(['accept',r.ioId,'-'],JSON.stringify(catalog)).status,0);
  const next=JSON.parse(run(['step','createProject','--spool','--args','{"name":"Accept"}']).stdout);
  assert.equal(next.tool,'toonkit_create_canvas');for(const k of ['aspectRatio','name','idempotencyKey'])assert.equal(next.stubArguments[k],'3dref-spool:'+next.ioId);
  const plain=JSON.parse(run(['step','createProject','--args','{"name":"Accept"}']).stdout);assert.equal(plain.ioId,next.ioId);assert.equal(plain.arguments.aspectRatio,B.timing.aspect);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
