/* Codex tool-memory launcher. No credentials, direct HTTP or browser backend. */
(async function run3dref(env, options, action, args={}) {
  const {tools,load,store,toolNames}=env;
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const require=(ok,msg)=>{if(!ok)throw Error(msg)};
  require(options?.skill?.startsWith('/')&&options?.runDir?.startsWith('/'),'Resolve absolute skill/run paths');
  const key='3dref-v3:'+options.runDir;
  let kept=load(key),serial=kept?.serial||0,clearState=false;
  require(!kept?.busy||(action==='recover'&&args.confirmedStopped===true),'One active runtime call per run');
  async function file(name){
    const r=await tools.exec_command({cmd:'cat '+quote(options.skill+'/scripts/'+name),max_output_tokens:20000});
    require(r.exit_code===0,'Cannot read packaged '+name);return r.output;
  }
  function decode(output,id){
    const lines=output.trim().split(/\r?\n/),acks=lines.flatMap(line=>{
      try {const x=JSON.parse(line);return x.id===id?[x]:[]}catch{return []}
    });
    require(acks.length===1,'Journal ACK missing/truncated; stop and reopen from disk');
    require(acks[0].ok,'Journal refused: '+JSON.stringify(acks[0].result));return acks[0].result;
  }
  async function receive(first,id,budget){
    let part=first,output='',deadline=Date.now()+10000;
    for(;;){
      output+=part.output||'';
      if(part.original_token_count>budget||/tokens truncated/.test(part.output||'')){
        const error=Error('Journal read output truncated');error.truncated=true;throw error;
      }
      if(output.endsWith('\n'))return decode(output,id);
      require(part.exit_code===undefined,'Journal exited before ACK; reopen from disk');
      require(Date.now()<deadline,'Journal ACK timed out; stop before further mutations');
      part=await tools.write_stdin({session_id:kept.worker,chars:'',yield_time_ms:1000,max_output_tokens:budget});
    }
  }
  async function rpc(op,fields={},budget=1500){
    const id='rpc-'+(++serial);
    // No blind retries after an uncertain append ACK; durable requests replay via MCP idempotency.
    try{
      const r=await tools.write_stdin({session_id:kept.worker,chars:JSON.stringify({id,op,...fields})+'\n',
        yield_time_ms:1,max_output_tokens:budget});
      return await receive(r,id,budget);
    }catch(e){kept.unhealthy=true;throw e}
  }
  if(!kept){
    const suffixes=['toonkit_create_canvas','toonkit_canvas_reference3d_catalog','toonkit_canvas_reference3d_create',
      'toonkit_canvas_reference3d_get_scene','toonkit_canvas_reference3d_edit','toonkit_get_canvas'];
    const prefixes=toolNames.filter(n=>n.endsWith(suffixes[0])).map(n=>n.slice(0,-suffixes[0].length))
      .filter(p=>suffixes.every(s=>toolNames.includes(p+s)));
    const prefix=options.prefix??(prefixes.length===1?prefixes[0]:null);
    require(prefix!==null&&prefixes.includes(prefix),'Select one observed Toonkit connection prefix');
    kept={worker:null,prefix,serial:0,busy:true};store(key,kept);
    try{
      [kept.bridgeCode,kept.browserCode]=await Promise.all([file('bridge.js'),file('browser-export.js')]);
      const boot=await tools.exec_command({cmd:'python3 -B '+quote(options.skill+'/scripts/journal.py')+' --run '+quote(options.runDir),
        tty:true,yield_time_ms:1000,max_output_tokens:1500});
      require(boot.session_id,'Journal worker failed: '+boot.output.slice(0,1000));kept.worker=boot.session_id;
      const header=await receive(boot,'boot',1500);
      // Usually one load; fallback chunks never enter model context. A load is read-only.
      let serialized;
      try{serialized=(await rpc('load',{},200000)).chunk;kept.state=JSON.parse(serialized);}
      catch(error){
        if(!error.truncated)throw error;
        kept.unhealthy=false;serialized='';
        for(let offset=0;offset<header.characters;offset+=12000)
          serialized+=(await rpc('load',{offset,size:12000},20000)).chunk;
        kept.state=JSON.parse(serialized);
      }
    }catch(e){kept.unhealthy=true;throw e}
    finally{kept.busy=false;store(key,kept.worker?kept:null)}
  }
  if(action==='recover'){
    require(kept.worker,'No worker handle; inspect the startup failure before clearing state');
    const stopped=await tools.write_stdin({session_id:kept.worker,chars:'\u0003',yield_time_ms:1000,max_output_tokens:1500});
    require(stopped.exit_code!==undefined,'Worker termination is not confirmed; do not start a second writer');
    store(key,null);return {stage:'closed',resumable:true};
  }
  require(!kept.unhealthy,'Runtime journal is uncertain; recover to stop the worker, then reopen from disk before mutations');
  if(kept.closed){
    require(action==='finishExport','This run is already complete');
    return {stage:'complete',...kept.state.events.findLast(e=>e.type==='complete').result};
  }
  kept.busy=true;store(key,kept);
  function browserAction(input){
    require(kept.ticket,'Run advance through export-ready first');
    require(/^[A-Za-z_$][\w$]*$/.test(input.tabVariable||'tab'),'Use a simple observed tab handle variable');
    const ticket={...kept.ticket,allowClick:!kept.browserIssued&&kept.ticket.allowClick};
    kept.browserIssued=true;
    return 'var threeDrefExports = typeof threeDrefExports === "undefined" ? {} : threeDrefExports;\nnodeRepl.write(await '+kept.browserCode+'('+ (input.tabVariable||'tab')+','+
      JSON.stringify(ticket)+','+JSON.stringify(input.controls)+',threeDrefExports));';
  }
  try{
    if(action==='close'){
      await rpc('close');clearState=true;return {stage:'closed',resumable:true};
    }
    if(action==='browserCode'){
      // Retained before yielding code: interruption resumes read-only, never a blind re-export.
      return {stage:'browser-action',code:browserAction(args)};
    }
    const metrics=kept.state.metrics ||= {mcpCalls:0,savedReads:0,waitMs:0,journalWrites:0};
    const bridge=eval(kept.bridgeCode)({
      call:async(suffix,input)=>{metrics.mcpCalls++;if(suffix.endsWith('_get_scene'))metrics.savedReads++;
        return tools[kept.prefix+suffix](input);},
      append:async events=>{await rpc('append',{events});metrics.journalWrites++;},
      sleep:async ms=>{metrics.waitMs+=ms;await env.sleep(ms);}
    },kept.state);
    require(['createProject','createScene','advance','finishExport'].includes(action),'Unknown runtime phase');
    const result=action==='createProject'?await bridge.createProject(args.name):action==='createScene'?
      await bridge.createScene(args.name,{projectVisible:args.projectVisible}):await bridge[action](args);
    if(result.ticket)kept.ticket=result.ticket;
    if(result.stage==='export-ready'&&args.browser)result.browserCode=browserAction(args.browser);
    if(result.stage==='complete'){
      await rpc('close');kept.worker=null;kept.closed=true;
    }
    return {...result,metrics:{...metrics}};
  }finally{kept.serial=serial;kept.busy=false;store(key,clearState?null:kept)}
})
