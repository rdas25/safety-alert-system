const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events'),path=require('node:path'),WS=require('ws');
test('background fixes remain assessable after disconnect and Stop removes them',{timeout:15000},async t=>{
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,CLIENT_TOKEN:'session',ADMIN_TOKEN:'admin',RISK_PROFILE:'walktest',LOG_POSITIONS:'0',PORT:'0'}});const sockets=[];t.after(async()=>{sockets.forEach(s=>s.terminate());const end=once(child,'exit');child.kill();await end;});
 const port=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',d=>{out+=d;const m=out.match(/LISTENING (\d+)/);if(m)resolve(m[1]);});child.once('exit',()=>reject(Error('startup failed')));});
 async function connect(){const ws=new WS('ws://127.0.0.1:'+port);sockets.push(ws);await once(ws,'open');return ws;}
 function message(ws,type){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout '+type)),4000);function receive(raw){const m=JSON.parse(raw);if(m.type===type){clearTimeout(timer);ws.off('message',receive);resolve(m);}}ws.on('message',receive);});}
 const pos=(id,lon,heading)=>({type:'position',sessionToken:'session',deviceSecret:'a'.repeat(64),deviceId:id,role:'pedestrian',lat:0,lon,speed:1.4,heading,accuracy:4,fixAgeMs:0,background:true});
 const a=await connect();let status=message(a,'status');a.send(JSON.stringify(pos('a',0,90)));await status;const closed=once(a,'close');a.close();await closed;
 const b=await connect();status=message(b,'status');b.send(JSON.stringify(pos('b',0.0001,270)));const warning=await status;assert.equal(warning.peers[0].id,'a');assert.ok(['HIGH','CRITICAL'].includes(warning.level));
 const stop=await connect();const stopped=message(stop,'stopped');stop.send(JSON.stringify({...pos('a',0,90),type:'stop'}));await stopped;
 const next=await message(b,'status');assert.equal(next.peers.length,0);
 const rejected=message(stop,'error');stop.send(JSON.stringify(pos('a',0,90)));assert.equal((await rejected).message,'Device identity already owned');
});
