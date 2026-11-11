// Bounded one-shot transport: the server retains the fresh fix after this socket closes.
function exchange(WebSocketClass,session,fix,timeoutMs=3000){return new Promise((resolve,reject)=>{
 const ws=new WebSocketClass(session.server);let done=false;
 const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);ws.close();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(Error('Background connection timed out')),timeoutMs);
 ws.onopen=()=>ws.send(JSON.stringify({type:'position',...fix,deviceId:session.deviceId,role:session.role,sessionToken:session.sessionToken,deviceSecret:session.deviceSecret,background:true,sequence:Date.now()}));
 ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='status'||m.type==='stopped')finish(null,m);if(m.type==='error')finish(Error(m.message));}catch(error){finish(error);}};
 ws.onerror=()=>finish(Error('Background network unavailable'));ws.onclose=()=>{if(!done)finish(Error('Background connection closed'));};
});}
function notificationDecision(status,last,now){const rank={NONE:0,LOW:1,MODERATE:2,HIGH:3,CRITICAL:4};return status.coverage==='available'&&!status.stale&&rank[status.level]>=3&&(!last||now-last.at>=10000||rank[status.level]>rank[last.level]);}
module.exports={exchange,notificationDecision};
