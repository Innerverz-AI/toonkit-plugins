/* UI Export transaction. Public DOM only; no engine/store/network access. */
(async function exportVisible(tab,ticket,controls,memory){
  const require=(x,m)=>{if(!x)throw Error(m)};
  require(ticket?.ticketId&&Array.isArray(ticket.baselineVideoIds),'Missing durable export ticket');
  require(controls?.editorNodeId===ticket.source3dNodeId,'Ground this exact editor first');
  const entry=memory[ticket.ticketId]||={attempted:false};
  const visibility=await tab.playwright.evaluate(()=>({visibilityState:document.visibilityState,hasFocus:typeof document.hasFocus==='function'?document.hasFocus():null}));
  const diagnostics=()=>({elapsedMs:entry.startedAt?Date.now()-entry.startedAt:0,...visibility});
  const result=(stage,extra={})=>({ticketId:ticket.ticketId,stage,clickAttempted:entry.attempted,diagnostics:diagnostics(),...extra});
  let exportControlReturned=Boolean(ticket.outputVideoNodeId);
  if(!ticket.outputVideoNodeId){
    require(controls.exportLabel&&controls.saveLabel,'Observe Export and Save labels once');
    const button=tab.playwright.getByRole('button',{name:controls.exportLabel,exact:true});
    if(ticket.allowClick&&!entry.attempted){
      if(visibility.visibilityState!=='visible')return result('needs-visible-tab');
      const dom=await tab.playwright.evaluate(()=>({text:document.body.textContent,assets:Array.from(document.querySelectorAll('script[src]')).map(s=>s.getAttribute('src').split('/').pop().split('?')[0])}));
      if(!ticket.engineAssetNames.every(n=>dom.assets.includes(n)))return result('engine-profile-mismatch');
      const frames=Math.round(ticket.expectedDuration*ticket.sceneFps);
      if(!ticket.expectedActorNames.every(n=>dom.text.includes(n))||!dom.text.includes(frames+'f'))return result('needs-editor-reopen',{reason:'Displayed actors/timeline do not match the saved run'});
      const save=tab.playwright.getByRole('button',{name:controls.saveLabel,exact:true});
      if(await save.isEnabled())return result('needs-clean-save',{reason:'Resolve owned changes or stale editor before Export'});
      require(await button.count()===1&&await button.isEnabled(),'Export is not uniquely enabled');
      entry.attempted=true;entry.startedAt=Date.now();await button.click();await tab.getAXState({emit:false});
    }
    try{await button.waitFor({state:'visible',timeoutMs:Math.min(40000,controls.timeoutMs||40000)});exportControlReturned=true;}
    catch{/* Successful Export may close the editor. A new decoded video is authoritative. */}
    if(exportControlReturned&&!await button.isEnabled())return result('rendering');
  }
  const videos=await tab.playwright.evaluate(()=>Array.from(document.querySelectorAll('video')).flatMap(v=>{
    const node=v.closest('[data-id]');
    // 3D-reference nodes also contain a 3-second preview video. They are not outputs.
    if(!node||(node.getAttribute('class')||'').split(/\s+/).includes('react-flow__node-video')===false)return [];
    return [{outputVideoNodeId:node.getAttribute('data-id'),durationSeconds:Number.isFinite(v.duration)?v.duration:null,
      width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,error:v.error?{code:v.error.code}:null}];
  }));
  const fresh=videos.filter(v=>ticket.outputVideoNodeId?v.outputVideoNodeId===ticket.outputVideoNodeId:!ticket.baselineVideoIds.includes(v.outputVideoNodeId));
  const ready=fresh.filter(v=>v.readyState>=2&&v.width>0&&v.height>0&&!v.error);
  const errors=fresh.filter(v=>v.error);
  return result(ready.length?'metadata-ready':errors.length?'video-error':ticket.outputVideoNodeId?'metadata-pending':exportControlReturned?'render-complete':'rendering-or-dialog',
    {videos:ready,observedVideoNodes:fresh.map(v=>v.outputVideoNodeId),...(errors.length?{errors}:{})});
})
