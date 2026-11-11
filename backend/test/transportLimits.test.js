const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events'),path=require('node:path'),WS=require('ws');
test('live session isolation, coverage, sequence rejection, flood limits and 100-device load',{timeout:15000},async t=>{
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,RISK_PROFILE:'walktest',PORT:'0',LOG_POSITIONS:'0',ADMIN_TOKEN:'admin',CLIENT_TOKENS:JSON.stringify([{token:'one',session:'one',subject:'a'},{token:'two',session:'two',subject:'b'}])}});
 const sockets=[];t.after(async()=>{sockets.forEach(s=>s.terminate());const end=once(child,'exit');child.kill();await end;});
 const port=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',d=>{out+=d;const m=out.match(/LISTENING (\d+)/);if(m)resolve(m[1]);});child.once('exit',()=>reject(Error('startup failed')));});
 async function connect(){const ws=new WS('ws://127.0.0.1:'+port);sockets.push(ws);ws.received=[];ws.on('message',raw=>ws.received.push(JSON.parse(raw)));await once(ws,'open');return ws;}
 function waitFor(ws,pred){return new Promise((resolve,reject)=>{const end=Date.now()+4000;const timer=setInterval(()=>{const value=ws.received.find(pred);if(value){clearInterval(timer);resolve(value);}else if(Date.now()>end){clearInterval(timer);reject(Error('message timeout'));}},10);});}
 const pos=(id,token='one',extra={})=>({type:'position',sessionToken:token,deviceSecret:'a'.repeat(64),deviceId:id,role:'pedestrian',lat:0,lon:0,speed:0,heading:null,accuracy:4,fixAgeMs:0,sequence:1,...extra});
 const a=await connect(),b=await connect(),c=await connect();a.send(JSON.stringify(pos('same')));b.send(JSON.stringify(pos('same','two')));c.send(JSON.stringify(pos('poor','one',{accuracy:40})));
 a.send(JSON.stringify({type:'authenticate',sessionToken:'one'}));assert.equal((await waitFor(a,m=>m.type==='authenticated')).type,'authenticated');
 const first=await waitFor(a,m=>m.type==='status');assert.equal(first.peers.length,0);assert.equal(first.unavailablePeers,1);
 assert.equal((await waitFor(c,m=>m.type==='status')).coverage,'poor_gps');
 a.send(JSON.stringify(pos('same')));assert.equal((await waitFor(a,m=>m.type==='error')).message,'Out-of-order position');
 c.received=[];c.send(JSON.stringify(pos('poor','one',{sequence:2,speed:2,heading:null})));assert.equal((await waitFor(c,m=>m.type==='status')).coverage,'unknown_motion');
 c.received=[];c.send(JSON.stringify(pos('poor','one',{sequence:3})));assert.equal((await waitFor(c,m=>m.type==='status')).coverage,'available');
 const flood=await connect(),closed=once(flood,'close');for(let i=0;i<11;i++)flood.send('{}');assert.equal((await closed)[0],1008);
 // Fill the supported device population; measure real tick/status delivery.
 const start=Date.now();const added=await Promise.all(Array.from({length:97},async(_,i)=>{const ws=await connect();ws.send(JSON.stringify(pos('load'+i)));return ws;}));
 const statuses=await Promise.all(added.map(ws=>waitFor(ws,m=>m.type==='status')));assert.ok(statuses.every(m=>m.coverage==='available'));assert.ok(Date.now()-start<4000);
 const overflow=await connect(),overflowClosed=once(overflow,'close');overflow.send(JSON.stringify(pos('overflow')));assert.equal((await overflowClosed)[0],1013);
 const readiness=await (await fetch('http://127.0.0.1:'+port+'/ready')).json();assert.equal(readiness.ready,true);assert.ok(readiness.lastTickMs<1000);
 console.log('LOAD_EVIDENCE '+JSON.stringify({devices:100,additionalClientStatuses:statuses.length,elapsedMs:Date.now()-start,tickMs:readiness.lastTickMs}));
});
