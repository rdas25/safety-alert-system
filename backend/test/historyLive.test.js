const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events'),path=require('node:path'),WS=require('ws');
test('opt-in history mode recovers usable motion from sufficiently separated fresh fixes',{timeout:15000},async t=>{
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,CLIENT_TOKEN:'session',ADMIN_TOKEN:'admin',RISK_PROFILE:'walktest',MOTION_MODE:'history',LOG_POSITIONS:'0',PORT:'0'}});let ws;t.after(async()=>{ws?.terminate();const end=once(child,'exit');child.kill();await end;});
 const port=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',d=>{out+=d;const m=out.match(/LISTENING (\d+)/);if(m)resolve(m[1]);});child.once('exit',()=>reject(Error('startup failed')));});
 ws=new WS('ws://127.0.0.1:'+port);const statuses=[];ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='status')statuses.push(m);});await once(ws,'open');
 for(let i=0;i<4;i++){ws.send(JSON.stringify({type:'position',sessionToken:'session',deviceSecret:'a'.repeat(64),deviceId:'history',role:'cyclist',lat:0,lon:i*10/111195,speed:null,heading:null,accuracy:2,fixAgeMs:0}));await new Promise(r=>setTimeout(r,1050));}
 assert.equal(statuses[0].coverage,'unknown_motion');const valid=statuses.find(s=>s.coverage==='available');assert.ok(valid);assert.ok(valid.motion.speed>8&&valid.motion.speed<11);assert.equal(valid.motion.forecast.length,3);
});
