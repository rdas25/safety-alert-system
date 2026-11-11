'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Alternative trajectories, not probabilities. They are diagnostics until independently calibrated.
function variants(history){const recent=history.filter(s=>Number.isFinite(s.speed)&&Number.isFinite(s.heading)).slice(-3);if(recent.length<2)return null;const a=recent.at(-2),b=recent.at(-1),dt=(b.fixAt-a.fixAt)/1000;if(dt<0.2||dt>3)return null;
 const acceleration=clamp((b.speed-a.speed)/dt,-5,5),turn=clamp((((b.heading-a.heading+540)%360)-180)/dt,-45,45)*Math.PI/180;
 const paths={straight:[],turning:[],accelerating:[]};for(const mode of Object.keys(paths)){let x=0,y=0;for(let step=1;step<=50;step++){const t=(step-0.5)*0.1,h=b.heading*Math.PI/180+(mode==='turning'?turn*t:0),speed=Math.max(0,b.speed+(mode==='accelerating'?acceleration*t:0));x+=speed*Math.sin(h)*0.1;y+=speed*Math.cos(h)*0.1;if(step%10===0)paths[mode].push({seconds:step/10,eastM:x,northM:y});}}
 return {paths,turnDegreesPerSecond:turn*180/Math.PI,accelerationMps2:acceleration,advisoryOnly:true};}
module.exports={variants};
