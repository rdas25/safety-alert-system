const test=require('node:test'), assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const WebSocket=require('ws');
const {newPairState,stepPair}=require('../alertState');
test('urgent escalation bypasses confirmation; clearing still requires confirmation',()=>{
 const s=newPairState();stepPair(s,'LOW');stepPair(s,'CRITICAL');assert.equal(s.level,'CRITICAL');stepPair(s,'NONE');assert.equal(s.level,'CRITICAL');stepPair(s,'NONE');assert.equal(s.level,'NONE');
});
test('device access, identity ownership, and stationary/unknown-motion freshness',async t=>{
 const child=spawn(process.execPath,['server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,RISK_PROFILE:'walktest',PORT:'0',CLIENT_TOKEN:'session',ADMIN_TOKEN:'admin',LOG_POSITIONS:'0'}});
 const sockets=[];t.after(async()=>{sockets.forEach(s=>s.terminate());const end=once(child,'exit');child.kill();await end;});
 const port=await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',d=>{output+=d;const m=output.match(/LISTENING (\d+)/);if(m)resolve(m[1]);});child.once('exit',()=>reject(Error('startup failed')));});
 async function client(){const ws=new WebSocket('ws://127.0.0.1:'+port);sockets.push(ws);await once(ws,'open');return ws;}
 function msg(ws,type){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('timeout '+type)),4000);function receive(raw){const m=JSON.parse(raw);if(m.type===type){clearTimeout(timeout);ws.off('message',receive);resolve(m);}}ws.on('message',receive);});}
 const pos={type:'position',deviceId:'a',role:'pedestrian',lat:0,lon:0,speed:0,heading:null,accuracy:4,fixAgeMs:60000,sessionToken:'session',deviceSecret:'a'.repeat(64)};
 const denied=await client();const error=msg(denied,'error');denied.send(JSON.stringify({...pos,sessionToken:'wrong'}));assert.equal((await error).message,'Unauthorized device');
 const a=await client();let status=msg(a,'status');a.send(JSON.stringify(pos));assert.equal((await status).stale,true);
 status=msg(a,'status');a.send(JSON.stringify({...pos,speed:3,heading:null}));assert.equal((await status).stale,true);
 status=msg(a,'status');a.send(JSON.stringify({...pos,fixAgeMs:0}));assert.equal((await status).stale,false);
 const attacker=await client();const takeover=msg(attacker,'error');attacker.send(JSON.stringify({...pos,deviceSecret:'b'.repeat(64)}));assert.equal((await takeover).message,'Device identity already owned');assert.equal(a.readyState,WebSocket.OPEN);
 const b=await client();const oldClosed=once(a,'close');b.send(JSON.stringify({...pos,fixAgeMs:0}));await oldClosed;assert.equal(b.readyState,WebSocket.OPEN);
});
