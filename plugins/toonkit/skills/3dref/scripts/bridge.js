/* Connected-tool bridge. Evaluate this factory in a tool orchestration runtime.
 * Host supplies call(suffix,args), append(event), sleep(ms), now() [optional].
 * No HTTP, OAuth, filesystem, browser control or paid generation inside this file.
 */
(function createBridge(host, state) {
  'use strict';
  const B=state.bundle, E=state.events, now=host.now||Date.now;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const last=(type,id)=>E.findLast(e=>e.type===type&&(id===undefined||e.id===id));
  const require=(ok,msg)=>{if(!ok)throw Error(msg)};
  require(B?.format==='3dref-run-v4'&&B.schemaVersion===1,'Unsupported compiled bundle');
  require(last('init')?.digest===B.digest,'Journal/plan mismatch');
  const runId=last('init').runId;
  require(typeof runId==='string'&&runId.length>=8,'Missing stable run ID');
  const bytes=x=>unescape(encodeURIComponent(JSON.stringify(x))).length;
  let active=false;
  const runtime=state.runtime ||= {applyDelayMs:250,appliedThroughSeq:0};
  let pending=[],journalFailed=false;
  async function persist(events){
    require(!journalFailed,'Journal ACK uncertain; reload before further mutations');
    try{await host.append(events)}catch(e){journalFailed=true;throw e}
  }
  async function flush(){if(pending.length&&!journalFailed){await persist(pending);pending=[]}}
  async function exclusive(fn) {
    require(!active,'One bridge writer per run'); active=true;
    try{return await fn()}finally{try{await flush()}finally{active=false}}
  }
  async function log(event,defer=false) {
    event=clone(event);
    if(defer)pending.push(event);
    else {await persist([...pending,event]);pending=[];}
    E.push(event);return event;
  }
  function unpack(r) {
    let x=r?.structuredContent;
    if(x===undefined){const t=r?.content?.filter(c=>c.type==='text');
      require(t?.length===1,'Unrecognized MCP envelope');
      try{x=JSON.parse(t[0].text)}catch{throw Error('Non-JSON MCP response: '+t[0].text.slice(0,600))}}
    if(r.isError||x?.code&&x?.message){const e=Error(JSON.stringify(x).slice(0,1600));e.serverError=x;throw e}
    require(x&&typeof x==='object','Empty MCP result'); return x;
  }
  const read=async(s,a)=>unpack(await host.call(s,a));
  const project=()=>last('project')||last('accepted','canvas')?.receipt;
  const bindings=()=>{
    const c=project(),s=last('accepted','scene')?.receipt;
    require(c?.canvasId&&s?.nodeId&&s.objectIds?.human&&s.objectIds?.camera,'Create receipt missing IDs');
    const refs={};for(const event of E.filter(e=>e.type==='accepted'))Object.assign(refs,event.receipt.objectIds||{});
    const tokens={'@camera___________________':s.objectIds.camera};
    for(const a of B.actors)if(a.templateSlot||refs[a.clientRef])tokens[a.token]=a.templateSlot?s.objectIds[a.templateSlot]:refs[a.clientRef];
    return {canvasId:c.canvasId,nodeId:s.nodeId,actor:s.objectIds.human,camera:s.objectIds.camera,tokens,url:c.url};
  };
  function bound(commands) {
    const ids=bindings();return clone(commands).map(c=>{
      if(c.objectId?.startsWith('@')){require(ids.tokens[c.objectId],'Unbound owned object '+c.objectId);c.objectId=ids.tokens[c.objectId];}
      return c;
    });
  }
  function requestArgs(e) {
    return e.batch===undefined?clone(e.args):{...e.args,commands:bound(B.batches[e.batch].commands)};
  }
  async function write(id,suffix,args,batch) {
    if(last('failed',id))throw Error('Rejected request '+id+'; review before a new scoped run');
    const done=last('accepted',id);if(done)return done.receipt;
    let intent=last('request',id);
    if(!intent)require(B.summary?.checks?.preflight?.passed===true&&B.summary.checks.preflight.support?.passed===true&&B.summary.checks.preflight.postReduction===true&&B.summary.checks.preflight.engineProfile===B.engineProfile?.id,'New writes require the all-frame preflight gate; recompile the direction before authoring');
    if(!intent)intent=await log({type:'request',id,suffix,args:{...args,idempotencyKey:`3dref-${runId}-${id}`},...(batch===undefined?{}:{batch})});
    let receipt;
    try{receipt=await read(intent.suffix,requestArgs(intent))}
    catch(e){if(e.serverError)await log({type:'failed',id,error:e.serverError});throw e}
    // A transport exception remains unresolved: resume replays this exact key/request.
    if(suffix==='toonkit_create_canvas')require(receipt.canvasId&&receipt.url,'Incomplete canvas receipt; resume exact request');
    else require(receipt.mutationId&&['PENDING','APPLIED'].includes(receipt.status),'Incomplete mutation receipt; resume exact request');
    // Coalesce this receipt with the next durable request. On crash, replay the
    // prior exact idempotency key; never dispatch without the next request ACK.
    await log({type:'accepted',id,receipt,acceptedAt:now()},true);return receipt;
  }
  async function catalog() {
    const saved=last('catalog');if(saved)return saved.value;
    const c=await read('toonkit_canvas_reference3d_catalog',{pageSize:200});
    require(c.commandSchemaVersion===1&&c.templateVersion===1&&!c.nextCursor,'Catalog changed/paged; inspect before dispatch');
    const l=c.limits;
    for(const [k,v] of Object.entries({objectsMax:B.summary.objects,keyframesMax:B.summary.storedKeys,sceneDocumentBytesMax:B.summary.estimatedSceneBytes}))
      require(Number.isFinite(l?.[k])&&v<=l[k],'Live capacity: '+k);
    const enums=name=>c.entries.find(e=>e.section==='enum'&&e.name===name)?.values||[];
    require(enums('fps').includes(B.timing.fps)&&enums('aspectRatio').includes(B.timing.aspect),'Live timing/aspect unsupported');
    require(B.timing.durationSeconds>=l.durationSeconds[0]&&B.timing.durationSeconds<=l.durationSeconds[1],'Live duration limit');
    for(const b of B.batches){
      require(b.commands.length<=l.commandsPerBatchMax&&bytes(b.commands)<=l.commandsBytesMax,'Live batch capacity');
      for(const cmd of b.commands){
        const op=c.entries.find(e=>e.section==='operation'&&e.op===cmd.op);
        require(op?.domain===b.domain,'Unknown operation/domain '+cmd.op);
        for(const k of [...op.required,...(op.kindRequired?.[cmd.kind]||[])])require(k in cmd||(k==='objectId'&&cmd.clientRef),'Missing command field '+k);
        if(cmd.op==='motion.applyPreset')require(c.entries.some(e=>e.section==='presets'&&e.slot===cmd.slot&&e.items.some(p=>p.key===cmd.presetKey)),'Missing source preset');
      }
    }
    await log({type:'catalog',value:c});return c;
  }
  function currentSeq() {
    return Math.max(0,...E.filter(e=>e.type==='accepted'&&e.id!=='canvas').map(e=>e.receipt.seq||0));
  }
  async function readyScene(all=false,deadline=now()+40000) {
    const {canvasId,nodeId,actor,camera}=bindings();let delay=runtime.applyDelayMs;
    const accepted=E.findLast(e=>e.type==='accepted'&&e.receipt.seq===currentSeq());
    if(accepted?.receipt.status==='PENDING'&&runtime.appliedThroughSeq<currentSeq()){
      const pause=Math.max(0,delay-(now()-(accepted.acceptedAt??0)));
      if(now()+pause>=deadline)return null;
      if(pause)await host.sleep(pause);
    }
    for(;;){
      const s=await read('toonkit_canvas_reference3d_get_scene',{canvasId,nodeId,view:'logical',pageSize:200,...(all?{}:{objectIds:['__3dref_header_only__']})});
      require(!s.conflict&&!s.initializationRequired&&!s.compatibility?.length,'Scene conflict/normalization requires review');
      if(s.materialized&&s.appliedThroughSeq>=currentSeq()&&s.pendingCount===0){
        require(s.revision&&!s.nextCursor,'Incomplete saved scene');
        require(s.appliedThroughSeq===currentSeq()&&s.latestSeq===currentSeq(),'Concurrent scene sequence changed');
        if(runtime.appliedThroughSeq<currentSeq()){
          const observed=Math.max(100,Math.min(2000,now()-(accepted?.acceptedAt??now())));
          runtime.applyDelayMs=Math.round(Math.min(2000,Math.max(100,.5*runtime.applyDelayMs+.5*observed)));
          runtime.appliedThroughSeq=s.appliedThroughSeq;
        }
        return s;
      }
      delay=Math.min(4000,Math.max(100,delay*2));
      if(now()+delay>=deadline)return null;
      await host.sleep(delay);
    }
  }
  function checkFresh(s) {
    const {actor,camera}=bindings(),a=s.objects.find(o=>o.id===actor),c=s.objects.find(o=>o.id===camera);
    require(s.totalObjects===2&&s.objects.length===2&&a?.kind==='human'&&c?.kind==='camera','Fresh human_camera template required');
    require(!a.keyframes?.length&&!c.keyframes?.length&&!a.animation&&!a.model&&!a.modelAsset,'Fresh correction-free stock actor required');
    require(!Object.values(a.pose||{}).some(v=>Object.values(v).some(n=>n!==0)),'Actor has existing pose corrections');
    require(['x','y','z'].every(k=>a.transform?.scale?.[k]===1),'Body profile requires unit actor scale');
  }
  function expected() {
    const {actor,camera}=bindings(), objects=new Map([[actor,{kind:'human',keys:new Map()}],[camera,{kind:'camera',keys:new Map()}]]);
    for(let i=0;i<B.batches.length;i++){
      const receipt=last('accepted','batch-'+i)?.receipt;if(!receipt)break;
      for(const c of bound(B.batches[i].commands)){
        const id=c.objectId||receipt.objectIds?.[c.clientRef];
        if(c.op==='object.add'){
          require(id,'Missing minted object ID');objects.set(id,{kind:c.kind,...(c.shape?{shape:c.shape}:{}),...(c.name?{name:c.name}:{}),transform:c.transform,keys:new Map()});
          continue;
        }
        if(c.op.startsWith('scene.'))continue;
        const o=objects.get(id);require(o,'Unowned command object');
        if(c.op==='object.rename')o.name=c.name;
        if(c.op==='object.setColor')o.color=c.color;
        if(c.op==='motion.applyPreset')o[c.slot]={key:c.presetKey};
        if(c.op==='camera.setAspect')o.camera={...o.camera,aspect:c.aspect};
        if(c.op==='camera.set')o.camera={...o.camera,...c.camera};
        if(c.op==='keyframe.upsert')o.keys.set(c.frame,{...(o.keys.get(c.frame)||{}),...c.patch});
      }
    }
    return objects;
  }
  function verifyScene(s,all=true) {
    const exp=expected();let fields=0,keys=0,maxError=0;
    function match(a,b,path){
      if(typeof a==='number'){require(typeof b==='number'&&Number.isFinite(b),'Missing numeric '+path);const e=Math.abs(a-b);maxError=Math.max(maxError,e);require(e<=.001001,'Stored value drift: '+path);fields++;return}
      if(Array.isArray(a)){require(b&&typeof b==='object','Missing vector '+path);a.forEach((v,i)=>match(v,Array.isArray(b)?b[i]:b[['x','y','z'][i]],path+'.'+i));return}
      if(a&&typeof a==='object'){require(b&&typeof b==='object','Missing field '+path);for(const k of Object.keys(a))match(a[k],b[k],path+'.'+k);return}
      if(path.endsWith('.color')&&/^#[0-9a-f]{6}$/i.test(a)&&typeof b==='string')require(a.toLowerCase()===b.toLowerCase(),'Stored color mismatch '+path);
      else require(a===b,'Stored field mismatch '+path);fields++;
    }
    require(s.totalObjects===exp.size,'Unexpected object count/concurrent edit');
    const observedTiming=s.timing||s.scene?.timing||s;
    for(const field of ['fps','durationSeconds'])if(observedTiming[field]!==undefined)match(B.timing[field],observedTiming[field],'scene.'+field);
    for(const [id,e] of exp){
      const o=s.objects.find(x=>x.id===id);if(!o&&!all)continue;require(o,'Missing stored object '+id);
      for(const [k,v] of Object.entries(e))if(k!=='keys')match(v,o[k],id+'.'+k);
      if(o.kind==='human'){
        require(['x','y','z'].every(k=>o.transform?.scale?.[k]===1),'Actor scale changed');
        require(!Object.values(o.pose||{}).some(v=>Object.values(v).some(n=>n!==0)),'Unexpected base pose');
      }
      require((o.keyframes||[]).length===e.keys.size,'Unexpected/missing key count '+id);
      for(const [frame,p] of e.keys){
        const k=o.keyframes.find(k=>k.frame===frame);require(k,'Missing key '+frame);match(p,k,id+'.'+frame);keys++;
        if(o.kind==='human'){
          const pose=k.pose||{}, want=p.pose||{};
          require(Object.keys(pose).length===Object.keys(want).length,'Unexpected inherited pose at '+frame);
          match([1,1,1],k.transform?.scale,'key.scale');
        }
        if(o.kind==='camera'&&e.camera)for(const field of ['near','far'])match(e.camera[field],k.camera?.[field],'key.camera.'+field);
      }
    }
    return {objects:exp.size,keys,comparedFields:fields,maxStoredFieldError:maxError,appliedThroughSeq:s.appliedThroughSeq,
      timingReadback:['fps','durationSeconds'].every(k=>observedTiming[k]!==undefined)?'verified':'not-exposed; check editor timing and decoded output'};
  }
  function canvasVideos(canvas) {
    require(Array.isArray(canvas.nodes)&&Array.isArray(canvas.edges),'Unrecognized canvas shape');
    require(!canvas.hasMore&&!canvas.nextCursor,'Canvas pagination needs explicit collection');
    return canvas.nodes.map(row=>{
      require(row.node,'Unrecognized canvas node envelope');
      return {...row.node,mediaId:row.mediaId,mediaDeleted:row.mediaDeleted,status:row.status};
    }).filter(n=>n.type==='video');
  }
  const api = {
    // State is serializable; store it between model turns, journal permits restart.
    state,
    catalog:()=>exclusive(catalog),
    useProject:({canvasId,url})=>exclusive(async()=>{
      require(typeof canvasId==='string'&&canvasId.length>0&&typeof url==='string'&&/^https:\/\/toonkit\.io\//.test(url),'Use an observed existing canvas ID/URL');
      require(!last('accepted','scene'),'Project binding is immutable after scene creation');
      await catalog();const c=await read('toonkit_get_canvas',{canvasId});require(c.canvasId===canvasId,'Canvas binding mismatch');
      const prior=project();require(!prior||prior.canvasId===canvasId,'Cannot switch the run to another project');
      if(!last('project'))await log({type:'project',canvasId,url});return {canvasId,url};
    }),
    createProject:(name)=>exclusive(async()=>{
      require(typeof name==='string'&&name.trim(),'Project name required');await catalog();
      const r=await write('canvas','toonkit_create_canvas',{name,aspectRatio:B.timing.aspect});
      require(r.canvasId&&r.url,'Missing project ID/URL');return {canvasId:r.canvasId,url:r.url};
    }),
    createScene:(name,{projectVisible=false}={})=>exclusive(async()=>{
      require(projectVisible,'Show project browser before scene creation');const c=project();require(c,'Create or bind project first');
      const r=await write('scene','toonkit_canvas_reference3d_create',{canvasId:c.canvasId,name,template:'human_camera'});
      return {nodeId:r.nodeId,objectIds:r.objectIds,status:r.status};
    }),
    dispatch:({editorVisible=false,engineAssetNames=[],maxBatches=1000,timeBudgetMs=45000}={})=>exclusive(async()=>{
      require(editorVisible,'Open this node editor and visible timeline first');
      // Web chunk names are build artifacts, not a renderer capability contract.
      // The live catalog validates the wire contract; calibrated math is release-tested.
      require(Number.isInteger(maxBatches)&&maxBatches>0&&maxBatches<=1000,'Invalid batch window');
      require(timeBudgetMs>0&&timeBudgetMs<=45000,'Bounded dispatch window required');
      const deadline=now()+timeBudgetMs;await catalog();let sent=0;
      for(let i=0;i<B.batches.length;i++){
        if(last('accepted','batch-'+i))continue;
        if(sent>=maxBatches||now()>=deadline)return {stage:'dispatch',nextBatch:i,total:B.batches.length};
        if(last('request','batch-'+i)){
          // Do not change revision/commands/key for a response lost in transport.
          await write('batch-'+i,'toonkit_canvas_reference3d_edit',{},i);sent++;continue;
        }
        const s=await readyScene(i===0,deadline);if(!s)return {stage:'application-pending',nextBatch:i};
        if(i===0)checkFresh(s);else verifyScene(s,false);
        const {canvasId,nodeId}=bindings();
        const commands=bound(B.batches[i].commands),l=last('catalog').value.limits;
        require(bytes(commands)<=l.commandsBytesMax,'Bound IDs exceed command byte budget');
        await write('batch-'+i,'toonkit_canvas_reference3d_edit',{canvasId,nodeId,expectedRevision:s.revision},i);sent++;
      }
      return {stage:'dispatch-complete',batches:B.batches.length};
    }),
    verify:({deadline=now()+40000}={})=>exclusive(async()=>{
      require(B.batches.every((_,i)=>last('accepted','batch-'+i)),'Dispatch incomplete');
      const s=await readyScene(true,deadline);if(!s)return {stage:'application-pending'};
      const summary=verifyScene(s);await log({type:'verified',summary,revision:s.revision});return summary;
    }),
    beforeExport:()=>exclusive(async()=>{
      require(last('verified'),'Verify saved scene before export');
      if(!last('export-baseline')){
        const {canvasId}=bindings(),c=await read('toonkit_get_canvas',{canvasId});
        await log({type:'export-baseline',videoIds:canvasVideos(c).map(n=>n.id)});
      }
      let issued=last('export-ticket');const ids=bindings(),observation=last('export-observation');
      const retry=issued&&observation?.attemptId===issued.attemptId&&observation.clickAttempted===false&&
        ['needs-visible-tab','needs-editor-reopen','needs-clean-save','needs-export-control'].includes(observation.stage);
      const allowClick=!issued||retry;
      if(allowClick)issued=await log({type:'export-ticket',id:runId,attemptId:runId+'-'+(E.filter(e=>e.type==='export-ticket').length+1),issuedAt:now()});
      return {ticketId:runId,attemptId:issued.attemptId,source3dNodeId:ids.nodeId,canvasId:ids.canvasId,canvasUrl:ids.url,expectedActorNames:B.actors.map(a=>a.name),
        baselineVideoIds:last('export-baseline').videoIds,allowClick,verifiedRevision:last('verified').revision,
        expectedDuration:B.timing.durationSeconds,sceneFps:B.timing.fps};
    }),
    checkExportRevision:()=>exclusive(async()=>{
      require(last('verified'),'Verify before preparing browser Export');
      const s=await readyScene(false);
      if(!s)return {stage:'application-pending'};
      require(s.revision===last('verified').revision,'Scene changed after verification; inspect before Export');
      return {stage:'export-current'};
    }),
    collectExport:()=>exclusive(async()=>{
      const baseline=last('export-baseline');require(baseline,'Record baseline before the single UI Export');
      if(last('export-candidate'))return last('export-candidate').value;
      const {canvasId,nodeId}=bindings(),c=await read('toonkit_get_canvas',{canvasId});
      const nodes=canvasVideos(c).filter(n=>!baseline.videoIds.includes(n.id)&&c.edges.some(e=>e.source===nodeId&&e.target===n.id&&!e.pending));
      require(nodes.length<=1,'Multiple new videos: resolve source/output explicitly');
      if(!nodes.length||!nodes[0].mediaId||nodes[0].pending)return {stage:'export-pending'};
      const n=nodes[0];require(!n.mediaDeleted,'Export media was deleted');
      require(typeof n.mediaId==='string','Malformed exported media identity');
      const value={canvasId,source3dNodeId:nodeId,outputVideoNodeId:n.id,mediaId:n.mediaId,sceneFps:B.timing.fps,aspect:B.timing.aspect};
      await log({type:'export-candidate',value});return value;
    }),
    group:({title})=>exclusive(async()=>{
      require(last('complete'),'Verify the exported video before delivery grouping');
      if(last('delivered'))return {stage:'delivered',...last('delivered').result};
      require(typeof title==='string'&&title.trim(),'Group title required');
      const done=last('complete').result;
      let intent=last('group-request');
      if(!intent)intent=await log({type:'group-request',arguments:{canvasId:done.canvasId,nodeIds:[done.source3dNodeId,done.outputVideoNodeId],title,idempotencyKey:`3dref-${runId}-group`}});
      let receipt=last('group-accepted')?.receipt;
      if(!receipt){receipt=await read('toonkit_canvas_group_nodes',intent.arguments);require(receipt.mutationId&&receipt.nodeId,'Incomplete group receipt; resume exact request');await log({type:'group-accepted',receipt});}
      const applied=await read('toonkit_get_canvas_mutation',{mutationId:receipt.mutationId});
      if(applied.status==='PENDING')return {stage:'group-pending',mutationId:receipt.mutationId};
      require(applied.status==='APPLIED'&&applied.nodeId===receipt.nodeId,'Group mutation failed/conflicted: '+JSON.stringify(applied));
      const result={...done,groupNodeId:receipt.nodeId};await log({type:'delivered',result});return {stage:'delivered',...result};
    }),
    confirmExport:(metadata)=>exclusive(async()=>{
      if(last('complete'))return last('complete').result;
      const v=last('export-candidate')?.value;require(v,'Collect one new source-linked video first');
      require(metadata.outputVideoNodeId===v.outputVideoNodeId,'DOM metadata must be scoped to the new output node');
      require(Number.isFinite(metadata.durationSeconds)&&Math.abs(metadata.durationSeconds-B.timing.durationSeconds)<=Math.max(.1,1/B.timing.fps),'Actual export duration mismatch');
      require(Number.isInteger(metadata.width)&&Number.isInteger(metadata.height)&&metadata.width>0&&metadata.height>0,'No decoded video dimensions');
      require(Number.isInteger(metadata.readyState)&&metadata.readyState>=2&&metadata.readyState<=4&&metadata.error===null,'Video is not decode-ready');
      const [w,h]=B.timing.aspect.split(':').map(Number);
      require(Math.abs(metadata.width/metadata.height-w/h)<.02,'Actual export aspect mismatch');
      const result={...v,durationSeconds:metadata.durationSeconds,width:metadata.width,height:metadata.height,videoReadyState:metadata.readyState,error:null,r2vValidated:false};
      await log({type:'complete',result});return result;
    })
  };
  // High-level phases fuse operations without repeated model handoffs.
  api.advance=async(options={})=>{
    const deadline=now()+(options.timeBudgetMs||45000);
    const d=await api.dispatch(options);if(d.stage!=='dispatch-complete')return d;
    const v=await api.verify({deadline});if(v.stage)return v;
    return {stage:'export-ready',verified:v,ticket:await api.beforeExport()};
  };
  api.finishExport=async(evidence)=>{
    if(last('complete'))return {stage:'complete',...last('complete').result};
    require(evidence?.ticketId===runId,'Export evidence/ticket mismatch');
    if(evidence.attemptId!==undefined){
      require(evidence.attemptId===last('export-ticket')?.attemptId,'Stale export attempt evidence');
      if(typeof evidence.clickAttempted==='boolean')await exclusive(()=>log({type:'export-observation',attemptId:evidence.attemptId,stage:evidence.stage,clickAttempted:evidence.clickAttempted}));
      if(evidence.clickAttempted===false&&['needs-visible-tab','needs-editor-reopen','needs-clean-save','needs-export-control'].includes(evidence.stage))
        return {stage:'export-not-started',reason:evidence.stage,resume:'advance after resolving readiness; no click occurred'};
    }
    // Never query canvas while UI says rendering or metadata is not ready.
    if(!['metadata-ready','render-complete','metadata-pending','click-status-unknown'].includes(evidence.stage))return {stage:'export-pending',reason:evidence.stage};
    require(Array.isArray(evidence.videos),'Missing output observation');
    const candidate=await api.collectExport();if(candidate.stage)return candidate;
    const matching=evidence.videos.filter(v=>v.outputVideoNodeId===candidate.outputVideoNodeId);
    if(!matching.length)return {stage:'metadata-pending',outputVideoNodeId:candidate.outputVideoNodeId,ticket:{ticketId:runId,source3dNodeId:candidate.source3dNodeId,outputVideoNodeId:candidate.outputVideoNodeId,baselineVideoIds:last('export-baseline').videoIds,allowClick:false}};
    require(matching.length===1,'Ambiguous DOM video metadata');
    return {stage:'complete',...await api.confirmExport(matching[0])};
  };
  return api;
})
