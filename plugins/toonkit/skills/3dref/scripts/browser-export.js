/* Read-only DOM metadata + one observed UI Export; no scene authoring or private state. */
(async function exportVisible(tab, ticket, controls, memory) {
  const fail=message=>{throw Error(message)};
  if(!ticket?.ticketId||!Array.isArray(ticket.baselineVideoIds))fail('Missing durable export ticket');
  if(!controls?.exportLabel||controls.editorNodeId!==ticket.source3dNodeId||controls.ready!==true)
    fail('Ground this exact editor, clean save, timing and asset readiness first');
  const button=tab.playwright.getByRole('button',{name:controls.exportLabel,exact:true});
  if(!memory||typeof memory!=='object')fail('Pass persistent REPL-local export memory');
  const entry=memory[ticket.ticketId] ||= {attempted:false};
  if(ticket.allowClick&&!entry.attempted){
    if(await button.count()!==1||!await button.isEnabled())fail('Export is not uniquely enabled');
    // Mark BEFORE clicking. If the response is lost, this runtime never clicks again.
    entry.attempted=true;
    await button.click();
    await tab.getAXState({emit:false});
  }
  try {await button.waitFor({state:'visible',timeoutMs:Math.min(45000,Math.max(1,controls.timeoutMs||40000))});}
  catch {return {ticketId:ticket.ticketId,stage:'rendering-or-dialog',clickAttempted:entry.attempted};}
  if(!await button.isEnabled())return {ticketId:ticket.ticketId,stage:'rendering',clickAttempted:entry.attempted};
  const videos=await tab.playwright.evaluate(()=>Array.from(document.querySelectorAll('video')).map(v=>({
    outputVideoNodeId:v.closest('[data-id]')?.getAttribute('data-id')||null,
    durationSeconds:Number.isFinite(v.duration)?v.duration:null,
    width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,
    error:v.error?{code:v.error.code}:null
  })));
  const fresh=videos.filter(v=>v.outputVideoNodeId&&!ticket.baselineVideoIds.includes(v.outputVideoNodeId)
    &&v.outputVideoNodeId!==ticket.source3dNodeId);
  const ready=fresh.filter(v=>v.readyState>=2&&v.width>0&&v.height>0&&v.error===null);
  const errors=fresh.filter(v=>v.error).map(v=>({outputVideoNodeId:v.outputVideoNodeId,error:v.error}));
  return {ticketId:ticket.ticketId,stage:ready.length?'metadata-ready':errors.length?'video-error':'metadata-pending',
    clickAttempted:entry.attempted,videos:ready,
    ...(errors.length?{errors}:{}),...(ready.length?{}:{observedVideos:fresh.length})};
})
