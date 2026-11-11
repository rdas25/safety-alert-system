const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events'),path=require('node:path'),WS=require('ws');
test('admin enrollment and live revocation stop an authenticated participant',{timeout:12000},async t=>{
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,CLIENT_TOKEN:'seed',ADMIN_TOKEN:'admin',RISK_PROFILE:'walktest',LOG_POSITIONS:'0',PORT:'0'}});const sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.terminate());const end=once(child,'exit');child.kill();await end;});
 const port=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',d=>{out+=d;const m=out.match(/LISTENING (\d+)/);if(m)resolve(m[1]);});child.once('exit',()=>reject(Error('startup failed')));});
 const base='http://127.0.0.1:'+port;
 assert.equal((await fetch(base+'/admin/access?token=admin')).status,401);
 const options={headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify({session:'group',subject:'alice'})};
 const token=(await (await fetch(base+'/admin/access',{...options,method:'POST'})).json()).token;assert.ok(token);
 const ws=new WS('ws://127.0.0.1:'+port);sockets.push(ws);await once(ws,'open');const authenticated=new Promise(resolve=>ws.on('message',raw=>{if(JSON.parse(raw).type==='authenticated')resolve();}));ws.send(JSON.stringify({type:'authenticate',sessionToken:token}));await authenticated;
 const closed=once(ws,'close');assert.equal((await fetch(base+'/admin/access',{...options,method:'DELETE'})).status,200);assert.equal((await closed)[0],1008);
});
