const test=require('node:test'),assert=require('node:assert/strict');const {exchange,notificationDecision}=require('./backgroundTransport');
test('background transport authenticates, retains fixes and closes after status',async()=>{
 let packet,closed=false;class Socket{constructor(){setImmediate(()=>this.onopen());}send(raw){packet=JSON.parse(raw);setImmediate(()=>this.onmessage({data:JSON.stringify({type:'status',coverage:'available',level:'HIGH'})}));}close(){closed=true;}}
 const result=await exchange(Socket,{server:'wss://example.test',deviceId:'a',role:'pedestrian',sessionToken:'secret',deviceSecret:'device'},{lat:0,lon:0});assert.equal(result.level,'HIGH');assert.equal(packet.background,true);assert.equal(packet.sessionToken,'secret');assert.ok(closed);
});
test('background exchange times out and closes a stalled socket',async()=>{let closed=false;class Socket{close(){closed=true;}}await assert.rejects(exchange(Socket,{server:'x'},{},10),/timed out/);assert.ok(closed);});
test('notifications suppress stale coverage, repeat noise and allow urgent escalation',()=>{
 const status={coverage:'available',stale:false,level:'HIGH'};assert.ok(notificationDecision(status,null,100));assert.equal(notificationDecision({...status,stale:true},null,100),false);assert.equal(notificationDecision(status,{level:'HIGH',at:0},500),false);assert.ok(notificationDecision({...status,level:'CRITICAL'},{level:'HIGH',at:0},500));
});
