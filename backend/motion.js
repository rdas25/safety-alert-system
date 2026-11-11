'use strict';
const {localXY}=require('./riskModel');
// Fit velocity to a short history in local meters. Only derive motion when displacement
// exceeds the reported error envelope; stale or duplicate fixes never add information.
function estimate(history){
 const rows=history.filter(r=>Number.isFinite(r.accuracy)&&r.accuracy<=30);
 if(rows.length<3)return null;
 const first=rows[0],last=rows.at(-1),span=(last.fixAt-first.fixAt)/1000;
 if(span<2||span>8)return null;
 const points=rows.map(r=>({...localXY(r.lat,r.lon,first.lat,first.lon),t:(r.fixAt-first.fixAt)/1000}));
 const mt=points.reduce((s,p)=>s+p.t,0)/points.length,mx=points.reduce((s,p)=>s+p.x,0)/points.length,my=points.reduce((s,p)=>s+p.y,0)/points.length;
 const den=points.reduce((s,p)=>s+(p.t-mt)**2,0);if(!den)return null;
 const vx=points.reduce((s,p)=>s+(p.t-mt)*(p.x-mx),0)/den,vy=points.reduce((s,p)=>s+(p.t-mt)*(p.y-my),0)/den;
 const residual=Math.sqrt(points.reduce((s,p)=>s+(p.x-mx-vx*(p.t-mt))**2+(p.y-my-vy*(p.t-mt))**2,0)/points.length);
 const displacement=Math.hypot(points.at(-1).x,points.at(-1).y),error=Math.hypot(first.accuracy,last.accuracy);
 const speed=Math.hypot(vx,vy);if(displacement<2*error||speed>100||residual>Math.max(3,error))return null;
 const uncertainty=(error+residual)/span;
 const forecast=[1,3,5].map(seconds=>({seconds,eastM:vx*seconds,northM:vy*seconds,uncertaintyRadiusM:last.accuracy+uncertainty*seconds}));
 return {forecast,speed,heading:(Math.atan2(vx,vy)*180/Math.PI+360)%360,velocityUncertaintyMps:(error+residual)/span,residualM:residual,samples:rows.length};
}
function append(history,fix){const fixAt=fix.receivedAt-fix.fixAgeMs;const last=history.at(-1);if(last&&fixAt<=last.fixAt+100)return history;return [...history,{...fix,fixAt}].filter(r=>fixAt-r.fixAt<=6000).slice(-8);}
module.exports={estimate,append};
