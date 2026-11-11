const crypto = require('crypto');
function equal(a,b) { return typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
function credentials(env) {
 const entries=env.CLIENT_TOKENS ? JSON.parse(env.CLIENT_TOKENS) : [{token:env.CLIENT_TOKEN,session:'default',subject:'shared'}];
 if(!Array.isArray(entries)||!entries.length||entries.length>256||entries.some(e=>!e||typeof e.token!=='string'||!e.token||typeof e.session!=='string'||typeof e.subject!=='string'||! /^[A-Za-z0-9_.-]{1,40}$/.test(e.session)||! /^[A-Za-z0-9_.-]{1,40}$/.test(e.subject))) throw Error('Configure CLIENT_TOKENS or CLIENT_TOKEN');
 if(new Set(entries.map(e=>e.token)).size!==entries.length) throw Error('Duplicate access tokens');
 return token=>entries.find(e=>equal(token,e.token));
}
function boundedSend(socket,obj,open=1) {
 if(!socket||socket.readyState!==open)return;
 const data=JSON.stringify(obj);
 if(socket.bufferedAmount+Buffer.byteLength(data)>1048576){socket.terminate();return;}
 socket.send(data);
}
module.exports={equal,credentials,boundedSend};
