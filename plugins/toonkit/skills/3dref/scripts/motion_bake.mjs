#!/usr/bin/env node
/** Sample stock Toonkit FBX clips into additive MCP pose keys. No browser or MCP writes.
 * Node 20+, task-local three@0.184.0. Files and optional public asset fetches only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const JOINTS={body:'Hips',head:'Head',neck:'Neck',chest:'Spine2',upperAbdomen:'Spine1',lowerAbdomen:'Spine',
  shoulderR:'RightShoulder',upperArmR:'RightArm',foreArmR:'RightForeArm',handR:'RightHand',
  shoulderL:'LeftShoulder',upperArmL:'LeftArm',foreArmL:'LeftForeArm',handL:'LeftHand',
  upLegR:'RightUpLeg',legR:'RightLeg',footR:'RightFoot',toeR:'RightToeBase',
  upLegL:'LeftUpLeg',legL:'LeftLeg',footL:'LeftFoot',toeL:'LeftToeBase'};
const MOVING=['idle','walking','running','jumping','turning','waving','sitting-idle','falling'];
const STILL=['t-pose','standing-idle','sitting','crouch','reaching','pointing','lying'];
const HASHES={human:'3ad45383a33f85dc851c85f7e80714ebc61154abadc155d5f4eb97dadf566259',
  'standing-idle':'39385e9d416f076d6809d7870c9bda43b00f2eace3844e890b735c4a64583aec',
  running:'59aa3c46df945b59176b09ace029fcabcb746202e24b5aad530506fdc3504a44',
  jumping:'32c8cadb84467d88ba2d467ba252d69eb4f91af94bb05f16398942060e39eda2',
  walking:'0fd2b6ac77bf71d478dca7742f5bf10ea1fd4d747d19dce348dae15861ccff2f',
  idle:'e789c32aa398035bc6f831016ad09b0048cc0c027066d4681608f10f3168b420'};
const normalize=s=>s.replace(/^mixamorig[:_]?/i,'').toLowerCase();
const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error(`${label} must be finite`);return v};
const rounded=x=>Math.round(x*10000)/10000;
const smooth=x=>x*x*x*(10+x*(-15+6*x));

export async function compile(spec,{runtime,cache,offline=false}) {
  if(spec.format!=='3dref-motion-v1')throw Error('Expected 3dref-motion-v1');
  const fps=finite(spec.fps,'fps'), duration=finite(spec.durationSeconds,'durationSeconds');
  const frames=Math.round(fps*duration);
  if(![12,15,24,30,60].includes(fps)||duration<2||duration>30||Math.abs(frames-fps*duration)>1e-8)throw Error('Unsupported timing');
  if(spec.rig!=='stock-human'||!['standing-idle','running','walking','idle'].includes(spec.baseline))throw Error('Unsupported stock-human baseline');
  const nativeBaseline=spec.baseline!=='standing-idle';
  if(!Array.isArray(spec.segments)||!spec.segments.length)throw Error('At least one segment is required');
  const segments=spec.segments.map(s=>({...s}));
  for(let i=0;i<segments.length;i++) {
    const s=segments[i];
    if(!MOVING.includes(s.preset)&&!STILL.includes(s.preset))throw Error(`Unknown preset ${s.preset}`);
    for(const k of ['start','end','sourceStart','speed'])finite(s[k],`${i}.${k}`);
    if(s.start<0||s.end<=s.start||s.sourceStart<0||s.speed<=0||s.end>duration+1e-8||typeof s.loop!=='boolean')throw Error(`Invalid segment ${i}`);
    if(s.phaseLock!==undefined&&typeof s.phaseLock!=='boolean')throw Error('phaseLock must be a boolean');
    if(s.phaseLock && (!nativeBaseline||s.preset!==spec.baseline||s.speed!==1||s.sourceStart!==0||!s.loop))throw Error('phaseLock requires the native baseline preset, speed 1, sourceStart 0 and loop true');
    if(i&&s.start<=segments[i-1].start)throw Error('Segments must be ordered by distinct start times');
    if(i&&s.start>segments[i-1].end+1e-8)throw Error('Body timeline has a gap');
    if(i&&s.end<=segments[i-1].end)throw Error('Nested/non-progressing segments are unsupported');
    if(i>1&&s.start<segments[i-2].end-1e-8)throw Error('At most two clips may overlap');
  }
  if(segments[0].start!==0||segments.at(-1).end<(frames-1)/fps)throw Error('Segments must cover all playable frames');
  const moduleRoot=path.resolve(runtime,'node_modules/three');
  const version=JSON.parse(await fs.readFile(path.join(moduleRoot,'package.json'),'utf8')).version;
  if(version!=='0.184.0')throw Error(`Expected three@0.184.0, received ${version}`);
  const T=await import(pathToFileURL(path.join(moduleRoot,'build/three.module.js')));
  const {FBXLoader}=await import(pathToFileURL(path.join(moduleRoot,'examples/jsm/loaders/FBXLoader.js')));
  const manager=new T.LoadingManager();
  // Motion inspection needs geometry and bones, not remote textures/DOM.
  manager.addHandler(/.*/, {load(){return new T.Texture()}});
  const loader=new FBXLoader(manager), models=new Map(), provenance=[];
  await fs.mkdir(cache,{recursive:true});
  async function load(name) {
    if(models.has(name))return models.get(name);
    const rel=name==='human'?'models/human.fbx':`animations/${STILL.includes(name)?'still':'moving'}/${name}.fbx`;
    const url=`https://public-cdn.toonkit.io/reference-3d/${rel}`;
    const file=path.join(cache,`${name}.fbx`);let data;
    try{data=await fs.readFile(file)}catch(e){
      if(e.code!=='ENOENT'||offline)throw e;
      const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw Error(`Asset fetch ${name}: ${r.status}`);
      data=Buffer.from(await r.arrayBuffer());await fs.writeFile(file,data);
    }
    const sha256=createHash('sha256').update(data).digest('hex');
    if(HASHES[name]&&HASHES[name]!==sha256)throw Error(`Stock rig changed (${name}); recalibrate before baking`);
    const group=loader.parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
    const bones=new Map();group.traverse(n=>{if(n.isBone&&!bones.has(normalize(n.name)))bones.set(normalize(n.name),n)});
    for(const b of Object.values(JOINTS))if(!bones.has(b.toLowerCase()))throw Error(`${name}: missing ${b}`);
    const clip=group.animations[0];
    if(!clip||!clip.tracks.length)throw Error(`${name}: no usable first clip`);
    const rest=new Map([...bones].map(([n,b])=>[n,b.quaternion.clone()]));
    const restHip=bones.get('hips').position.clone();
    const tracks=new Map(clip.tracks.map(t=>[t.name.replace(/^mixamorig[:_]?/i,'').toLowerCase(),t.createInterpolant()]));
    const entry={group,bones,clip,rest,restHip,tracks};models.set(name,entry);
    provenance.push({preset:name,url,sha256,clipSeconds:clip.duration});return entry;
  }
  const human=await load('human'), baseline=await load(spec.baseline);
  const box=new T.Box3().setFromObject(human.group), rawHeight=box.getSize(new T.Vector3()).y;
  if(!(rawHeight>0))throw Error('Invalid stock rig dimensions');
  human.group.scale.multiplyScalar(1.7/rawHeight);human.group.updateMatrixWorld(true);
  human.group.position.y-=new T.Box3().setFromObject(human.group).min.y;
  const scale=human.group.scale.x;
  if(Math.abs(human.group.scale.y-scale)>1e-8||Math.abs(human.group.scale.z-scale)>1e-8)throw Error('Nonuniform stock rig normalization');
  function sample(model,time) {
    const quats={};
    for(const [id,b] of Object.entries(JOINTS)) {
      const key=b.toLowerCase(), track=model.tracks.get(`${key}.quaternion`);
      quats[id]=track?new T.Quaternion().fromArray(track.evaluate(time)).normalize():model.rest.get(key).clone();
    }
    const h=model.tracks.get('hips.position');
    const hip=h?new T.Vector3().fromArray(h.evaluate(time)):model.restHip.clone();
    return {quats,hipY:hip.y+human.restHip.y-model.restHip.y};
  }
  const staticBase=sample(baseline,0);
  const baseAt=t=>nativeBaseline?sample(baseline,t%baseline.clip.duration):staticBase;
  for(const s of segments){
    const model=await load(s.preset);s._model=model;
    const translation=model.tracks.get('hips.position');
    if(translation){
      const first=Array.from(translation.evaluate(0)),last=Array.from(translation.evaluate(model.clip.duration));
      const distance=Math.hypot(last[0]-first[0],last[2]-first[2])*scale;
      Object.assign(provenance.find(p=>p.preset===s.preset),{sourceHorizontalTravelMeters:rounded(distance),sourceAverageSpeedMps:rounded(distance/model.clip.duration)});
    }
    // Same named bones alone do not establish compatible rest orientation.
    for(const b of Object.values(JOINTS))if(model.rest.get(b.toLowerCase()).angleTo(baseline.rest.get(b.toLowerCase()))>.015)throw Error(`${s.preset}: incompatible rest rig`);
    const endTime=s.sourceStart+(s.end-s.start)*s.speed;
    if(!STILL.includes(s.preset)&&!s.loop&&endTime>model.clip.duration+1e-5)throw Error(`${s.preset}: non-loop clip overrun; shorten segment or choose explicit slower speed`);
    if(s.preset==='jumping'&&s.loop)throw Error('Jump events must be non-looping; schedule each jump explicitly');
  }
  function at(s,t){if(s.phaseLock)return baseAt(t);if(STILL.includes(s.preset))return sample(s._model,0);let u=s.sourceStart+(t-s.start)*s.speed;const d=s._model.clip.duration;if(s.loop)u=((u%d)+d)%d;else u=Math.max(0,Math.min(u,d));return sample(s._model,u)}
  const output=[],previous={};let maxError=0,maxJump=0,maxCorrection=0;
  for(let frame=0;frame<frames;frame++) {
    const t=frame/fps;
    const base=baseAt(t);
    const active=segments.filter(s=>s.start<=t+1e-9&&t<s.end-1e-9);
    if(!active.length&&Math.abs(t-segments.at(-1).end)<1e-8)active.push(segments.at(-1));
    if(active.length<1||active.length>2)throw Error(`Frame ${frame}: ambiguous body coverage`);
    let target=at(active[0],t);
    if(active.length===2){
      const [a,b]=active, span=a.end-b.start;
      if(!(span>0))throw Error('Invalid transition overlap');
      const w=smooth(Math.max(0,Math.min(1,(t-b.start)/span))), next=at(b,t);
      target={quats:Object.fromEntries(Object.keys(JOINTS).map(j=>[j,target.quats[j].clone().slerp(next.quats[j],w)])),hipY:target.hipY+(next.hipY-target.hipY)*w};
    }
    const pose={};
    for(const id of Object.keys(JOINTS)) {
      const delta=base.quats[id].clone().invert().multiply(target.quats[id]).normalize();
      const e=new T.Euler().setFromQuaternion(delta,'YXZ');
      const raw=[e.x,e.y,e.z].map(T.MathUtils.radToDeg), prev=previous[id];
      const options=[raw,[180-raw[0],raw[1]+180,raw[2]+180]].map(a=>a.map((v,i)=>prev?v+360*Math.round((prev[i]-v)/360):v));
      const identity=nativeBaseline && delta.angleTo(new T.Quaternion())<1e-7;
      const vals=identity?[0,0,0]:prev?options.sort((a,b)=>a.reduce((s,v,i)=>s+(v-prev[i])**2,0)-b.reduce((s,v,i)=>s+(v-prev[i])**2,0))[0]:raw;
      const [x,y,z]=vals.map(rounded);previous[id]=[x,y,z];
      if(prev)maxJump=Math.max(maxJump,...[x,y,z].map((v,i)=>Math.abs(v-prev[i])));
      maxCorrection=Math.max(maxCorrection,Math.abs(x),Math.abs(y),Math.abs(z));
      const reconstructed=base.quats[id].clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(T.MathUtils.degToRad(x),T.MathUtils.degToRad(y),T.MathUtils.degToRad(z),'YXZ')));
      maxError=Math.max(maxError,T.MathUtils.radToDeg(reconstructed.angleTo(target.quats[id])));
      pose[id]={tiltX:x,tiltZ:z,twist:y};
      human.bones.get(JOINTS[id].toLowerCase()).quaternion.copy(reconstructed);
    }
    const rootYOffset=(target.hipY-base.hipY)*scale;
    human.bones.get('hips').position.set(human.restHip.x,target.hipY,human.restHip.z);
    human.group.updateMatrixWorld(true);
    const markers=Object.fromEntries(['legR','legL','footR','footL','toeR','toeL','handR','handL','head'].map(id=>{
      const p=human.bones.get(JOINTS[id].toLowerCase()).getWorldPosition(new T.Vector3());
      // Markers already include source hip motion; add only horizontal/planned ground root later.
      return [id,p.toArray().map(rounded)];
    }));
    output.push({frame,pose,rootYOffset:rounded(rootYOffset),markers});
  }
  if(maxError>.001)throw Error(`Pose roundtrip error ${maxError} degrees`);
  const warnings=['Bone markers are not skin/sole collision bounds; no physical IK or rendered QA.',
    'Source clips/blends can slide at unmatched root speed; inspect numeric support/clearance and disclose approximations.'];
  if(maxJump>45)warnings.push(`Large adjacent Euler step (${maxJump.toFixed(2)} deg); use dense keys and review transition/source phase numerically.`);
  if(maxCorrection>90)warnings.push('Some exact local corrections exceed UI slider bounds; do not clamp. Confirm current MCP acceptance or use a compatible motion asset.');
  return {format:'3dref-body-v1',profile:nativeBaseline?'stock-human-native-v1':'stock-human-standing-v1',baseline:spec.baseline,requiresFreshActor:true,
    durationSeconds:duration,fps,rootHeightOwner:'body',sources:provenance,
    summary:{frames,maxRoundtripDegrees:maxError,maxAdjacentChannelDegrees:maxJump,maxAbsoluteChannelDegrees:maxCorrection,normalizationScale:scale,warnings},samples:output};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2), input=args.shift(), opts={};
    while(args.length){const k=args.shift();if(k==='--offline')opts.offline=true;else if(['--runtime','--cache','--out'].includes(k))opts[k.slice(2)]=args.shift();else throw Error(`Unknown option ${k}`)}
    if(!input||!opts.runtime||!opts.cache||!opts.out)throw Error('Usage: motion_bake.mjs spec.json --runtime work/runtime --cache work/motions --out work/body.json [--offline]');
    const inputText=input==='-'?await new Promise((resolve,reject)=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s));process.stdin.on('error',reject)}):await fs.readFile(input,'utf8');
    const result=await compile(JSON.parse(inputText),opts);
    if(opts.out==='-'){
      await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(result)+'\n',e=>e?reject(e):resolve()));
    }else{
      await fs.mkdir(path.dirname(opts.out),{recursive:true});await fs.writeFile(opts.out,JSON.stringify(result)+'\n');
      console.log(JSON.stringify({output:opts.out,...result.summary},null,2));
    }
  }catch(e){console.error(`Cannot bake: ${e.message}`);process.exitCode=2}
}
