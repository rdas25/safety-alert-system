#!/usr/bin/env node
// Explicit local operator tool. Tokens are sent only to the configured backend.
const [action,session,subject]=process.argv.slice(2);
if(!['list','issue','revoke'].includes(action)||!process.env.ADMIN_TOKEN)throw Error('ADMIN_TOKEN required. Usage: node admin.mjs list|issue|revoke [session subject]');
const base=process.env.ADMIN_URL||'http://127.0.0.1:8080';const url=new URL('/admin/access',base);
if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Remote admin requires HTTPS');
const response=await fetch(url,{method:{list:'GET',issue:'POST',revoke:'DELETE'}[action],headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN,'Content-Type':'application/json'},...(action==='list'?{}:{body:JSON.stringify({session,subject})})});
if(!response.ok)throw Error(await response.text());console.log(JSON.stringify(await response.json(),null,2));
