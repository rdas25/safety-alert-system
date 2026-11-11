// Read-only probe. No participant locations or credentials are printed.
const base=new URL(process.env.HEALTH_URL||'http://127.0.0.1:8080');
if(base.username||base.password|| (base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw Error('Use HTTPS for remote probes');
try{
 const started=Date.now();
 for(const route of ['/health','/ready']){
  const r=await fetch(new URL(route,base),{signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)throw Error(`${route}: HTTP ${r.status}`);
  if(route==='/ready'&&(await r.json()).ready!==true)throw Error('Not ready');
 }
 console.log(JSON.stringify({healthy:true,elapsedMs:Date.now()-started}));
}catch(e){console.error(JSON.stringify({healthy:false,error:e.message}));process.exitCode=1;}
