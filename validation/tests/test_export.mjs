import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
const run=eval(fs.readFileSync(path.join(process.env.TOONKIT_TEST_PLUGIN||fileURLToPath(new URL('../../plugins/toonkit',import.meta.url)),'skills/3dref/scripts/browser-export.js'),'utf8'));
const ticket={ticketId:'ticket',source3dNodeId:'source',baselineVideoIds:['old'],allowClick:true,expectedActorNames:['One','Two'],expectedDuration:4,sceneFps:24,engineAssetNames:['verified.js']};
const controls={editorNodeId:'source',exportLabel:'Export',saveLabel:'Save'};
function environment({hidden=false,stale=false,dirty=false,closed=false,rendering=false,videos=[],profile=true}={}){
 let clicks=0;const doc={visibilityState:hidden?'hidden':'visible',body:{textContent:stale?'Human 360f':'One Two 96f'},querySelectorAll(selector){
  if(selector==='script[src]')return profile?[{getAttribute:()=>'/verified.js'}]:[];
  if(selector==='video')return videos.map(v=>({duration:v.duration??4,videoWidth:v.width??1024,videoHeight:576,readyState:v.readyState??4,error:null,closest:()=>({getAttribute:k=>k==='data-id'?v.id:'react-flow__node react-flow__node-'+(v.type??'video')})}));
  return [];
 }};
 const tab={getAXState:async()=>'',playwright:{evaluate:async fn=>{const prev=globalThis.document;globalThis.document=doc;try{return fn()}finally{globalThis.document=prev}},getByRole:(role,{name})=>({isEnabled:async()=>name==='Save'?dirty:!rendering,count:async()=>1,click:async()=>{clicks++},waitFor:async()=>{if(closed)throw Error('editor closed')}})}};
 return {tab,get clicks(){return clicks}};
}
test('one click and exact new video excludes old output and 3D preview',async()=>{
 const env=environment({videos:[{id:'old'},{id:'preview',type:'3d-reference',duration:3},{id:'output'}]}),memory={};
 const a=await run(env.tab,ticket,controls,memory);const b=await run(env.tab,{...ticket,allowClick:false},controls,memory);
 assert.equal(a.stage,'metadata-ready');assert.deepEqual(a.videos.map(v=>v.outputVideoNodeId),['output']);assert.equal(b.stage,'metadata-ready');assert.equal(env.clicks,1);assert.equal(a.diagnostics.hasFocus,null);
});
test('successful editor closure still accepts decoded output',async()=>{const env=environment({closed:true,videos:[{id:'output'}]});assert.equal((await run(env.tab,ticket,controls,{})).stage,'metadata-ready');assert.equal(env.clicks,1)});
test('hidden, stale and dirty editor cannot click',async()=>{
 for(const [options,stage] of [[{hidden:true},'needs-visible-tab'],[{stale:true},'needs-editor-reopen'],[{dirty:true},'needs-clean-save']]){const env=environment(options);assert.equal((await run(env.tab,ticket,controls,{})).stage,stage);assert.equal(env.clicks,0)}
});
test('changed build filenames do not prevent a ready export',async()=>{const env=environment({profile:false});await run(env.tab,ticket,controls,{});assert.equal(env.clicks,1)});
test('no recorded click cannot be mislabeled render-complete',async()=>{const env=environment();assert.equal((await run(env.tab,{...ticket,allowClick:false},controls,{})).stage,'click-status-unknown');assert.equal(env.clicks,0)});
test('still rendering yields without metadata or second click',async()=>{const env=environment({rendering:true});const r=await run(env.tab,{...ticket,allowClick:false},controls,{});assert.equal(r.stage,'rendering');assert.equal(env.clicks,0)});
test('cold ticket never clicks again and missing output remains pending',async()=>{const env=environment({closed:true});const r=await run(env.tab,{...ticket,allowClick:false,outputVideoNodeId:'output'},controls,{});assert.equal(r.stage,'metadata-pending');assert.equal(env.clicks,0)});
test('candidate-scoped metadata ignores other new videos',async()=>{const env=environment({videos:[{id:'other'},{id:'output'}]});const r=await run(env.tab,{...ticket,allowClick:false,outputVideoNodeId:'output'},controls,{});assert.deepEqual(r.videos.map(v=>v.outputVideoNodeId),['output']);assert.equal(env.clicks,0)});
