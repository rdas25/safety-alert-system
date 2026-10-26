'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const WebSocket=require('ws');
function message(ws, type) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ ws.off('message',receive); reject(new Error('Timed out waiting for '+type)); },6000);
    function receive(raw) { const value=JSON.parse(raw); if(value.type===type) {clearTimeout(timer); ws.off('message',receive); resolve(value);} }
    ws.on('message',receive);
  });
}
test('HTTP token, observer authorization, live statuses and recording round trip',async(t)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'safety-test-'));
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',ADMIN_TOKEN:'test-only-token',LOG_POSITIONS:'1',LOG_DIR:dir}});
  const sockets=[]; let stopped=false;
  t.after(async()=>{for(const s of sockets)s.terminate(); if(!stopped && child.exitCode === null){const exit=once(child,'exit'); child.kill('SIGTERM'); await exit;} fs.rmSync(dir,{recursive:true,force:true});});
  let output=''; child.stderr.on('data',d=>{output+=d;});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server did not start: '+output)),6000);
    child.stdout.on('data',d=>{output+=d; const match=output.match(/LISTENING (\d+)/); if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code));});
  });
  const base='http://127.0.0.1:'+port;
  assert.equal((await fetch(base+'/health')).status,200);
  const malformedStatus = await new Promise((resolve,reject) => {
    const request = require('node:http').get({ hostname:'127.0.0.1', port, path:'//'}, response => { response.resume(); resolve(response.statusCode); });
    request.on('error',reject);
  });
  assert.equal(malformedStatus,400);
  const malformedSocket = new WebSocket('ws://127.0.0.1:'+port+'//'); sockets.push(malformedSocket);
  const malformedClose = once(malformedSocket,'close');
  assert.equal((await malformedClose)[0],1008);
  assert.equal((await fetch(base+'/health')).status,200);
  for(const route of ['/','/dashboard','/logs']) assert.equal((await fetch(base+route)).status,401);
  assert.equal((await fetch(base+'/?token=wrong')).status,401);
  assert.equal((await fetch(base+'/?token=test-only-token')).status,200);
  async function connect(query='') {const ws=new WebSocket('ws://127.0.0.1:'+port+'/'+query); sockets.push(ws); await once(ws,'open'); return ws;}
  const rejected=await connect(); const close=once(rejected,'close'); const denial=message(rejected,'error'); rejected.send(JSON.stringify({type:'observe'})); assert.equal((await denial).message,'Unauthorized observer'); assert.equal((await close)[0],1008);
  const observer=await connect('?token=test-only-token'); const dashboard=message(observer,'dashboard'); observer.send(JSON.stringify({type:'observe'})); assert.equal((await dashboard).type,'dashboard');
  const a=await connect(), b=await connect();
  const invalid=message(a,'error'); a.send(JSON.stringify({type:'position',deviceId:'bad',role:'pedestrian',lat:100,lon:0})); assert.match((await invalid).message,/bad lat/);
  const pos=(id,lon,heading)=>({type:'position',deviceId:id,role:'pedestrian',lat:0,lon,speed:1.4,heading,accuracy:4,fixAgeMs:0});
  const status=message(a,'status'); a.send(JSON.stringify(pos('a',0,90))); b.send(JSON.stringify(pos('b',0.00008,270))); assert.equal((await status).stale,false);
  const high=await message(a,'status'); assert.ok(['HIGH','CRITICAL'].includes(high.level));
  const listed=await (await fetch(base+'/logs?token=test-only-token')).json();
  assert.equal(listed.length,1);
  const download=await fetch(base+'/logs/'+listed[0]+'?token=test-only-token');
  assert.equal(download.status,200); assert.match(await download.text(),/\"schema\":1/);
  assert.equal((await fetch(base+'/logs/session-999.jsonl?token=test-only-token')).status,404);
  assert.equal((await fetch(base+'/logs/%2e%2e%2fserver.js?token=test-only-token')).status,404);
  const exit=once(child,'exit'); child.kill('SIGTERM'); await exit; stopped=true;
  const files=fs.readdirSync(dir); assert.equal(files.length,1);
  const rows=fs.readFileSync(path.join(dir,files[0]),'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows.every(r=>r.schema===1)); assert.ok(rows.some(r=>r.devices.length===2));
  assert.ok(require('../replay').replay(rows).timeline.length>0);
});

test('production refuses startup without an admin token',()=>{
  const {spawnSync}=require('node:child_process');
  const result=spawnSync(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'production',ADMIN_TOKEN:'',LOG_POSITIONS:'0'},encoding:'utf8',timeout:5000});
  assert.notEqual(result.status,0); assert.match(result.stderr,/ADMIN_TOKEN required in production/);
});
