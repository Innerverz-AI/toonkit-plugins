/** Paired with timewarp.py; parity tested at ramp boundaries and every frame. */
export function timeWarp(rows,duration) {
  rows=rows??[{time:0,speed:1},{time:duration,speed:1}];
  if(!Array.isArray(rows)||rows.length<2||rows.some((r,i)=>Object.keys(r).sort().join(',')!=='speed,time'||!Number.isFinite(r.time)||!Number.isFinite(r.speed)||r.speed<=0||(i&&r.time<=rows[i-1].time))||rows[0].time!==0||Math.abs(rows.at(-1).time-duration)>1e-8)throw Error('Invalid timeWarp: positive speed anchors must span 0..durationSeconds');
  const at=t=>{
    if(!Number.isFinite(t)||t<0||t>duration+1e-9)throw Error('timeWarp sample out of range');
    let total=0;
    for(let i=0;i<rows.length-1;i++){
      const a=rows[i],b=rows[i+1],dt=b.time-a.time,u=Math.min(1,Math.max(0,(t-a.time)/dt));
      total+=dt*(a.speed*u+(b.speed-a.speed)*(u**6-3*u**5+2.5*u**4));
      if(t<=b.time)return {time:total,speed:a.speed+(b.speed-a.speed)*u**3*(10+u*(-15+6*u))};
    }
    return {time:total,speed:rows.at(-1).speed};
  };
  return {at,identity:rows.every(r=>r.speed===1),rows};
}
