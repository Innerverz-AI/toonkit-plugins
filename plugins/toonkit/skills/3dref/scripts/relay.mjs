/* Bridge adapter for hosts that relay one MCP request per model/tool step. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const input=await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>resolve(s));});
const {state,phase,args}=JSON.parse(input), events=[], E=state.events;
const last=t=>E.findLast(e=>e.type===t);
let epoch=last('io-epoch')?.value||0;
class Yield extends Error{constructor(result){super('yield');this.result=result}}
const append=async rows=>{events.push(...rows)};
const api=eval(await fs.readFile(new URL('./bridge.js',import.meta.url),'utf8'))({
  append,
  sleep:async ms=>{const e={type:'io-epoch',value:++epoch};events.push(e);E.push(e);throw new Yield({stage:'wait',milliseconds:ms});},
  call:async(suffix,arguments_)=>{
    const seq=Math.max(0,...E.filter(e=>e.type==='accepted').map(e=>e.receipt.seq||0));
    const id=createHash('sha256').update(JSON.stringify({phase,epoch,seq,suffix,arguments_})).digest('hex').slice(0,24);
    const found=E.findLast(e=>e.type==='io-result'&&e.id===id);if(found)return found.response;
    if(!E.some(e=>e.type==='io-request'&&e.id===id)){const e={type:'io-request',id,suffix,arguments:arguments_};events.push(e);E.push(e);}
    throw new Yield({stage:'tool-request',ioId:id,tool:suffix,arguments:arguments_});
  }
},state);
try{
  const result=phase==='createProject'?await api.createProject(args.name):phase==='createScene'?await api.createScene(args.name,args):await api[phase](args);
  events.push({type:'io-epoch',value:epoch+1});process.stdout.write(JSON.stringify({stage:result.stage||'phase-complete',...result,events}));
}catch(e){process.stdout.write(JSON.stringify({...e instanceof Yield?e.result:{stage:'error',message:e.message},events}));}
