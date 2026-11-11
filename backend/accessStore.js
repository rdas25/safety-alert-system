'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {credentials}=require('./access');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_.-]{1,40}$/.test(s);
class AccessStore {
 constructor(env){this.seed=credentials(env);this.file=env.STATE_DIR?path.join(env.STATE_DIR,'access.json'):null;this.data={version:1,entries:[],revoked:[],owners:{}};
  if(this.file&&fs.existsSync(this.file)){this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(this.data.version!==1||!Array.isArray(this.data.entries)||!Array.isArray(this.data.revoked)||!this.data.owners)throw Error('Invalid access store');}
 }
 save(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.data),{mode:0o600});fs.renameSync(temp,this.file);}
 lookup(token){if(typeof token!=='string')return;const digest=hash(token);const issued=this.data.entries.find(e=>e.digest===digest),entry=issued||this.seed(token);if(!entry||(!issued&&this.data.revoked.includes(entry.session+'|'+entry.subject)))return;return {session:entry.session,subject:entry.subject};}
 issue(session,subject){if(!valid(session)||!valid(subject))throw Error('Invalid session or subject');if(this.data.entries.length>=256)throw Error('Enrollment capacity');const token=crypto.randomBytes(32).toString('hex');this.data.entries.push({session,subject,digest:hash(token)});this.save();return token;}
 revoke(session,subject){if(!valid(session)||!valid(subject))throw Error('Invalid session or subject');const key=session+'|'+subject;if(!this.data.revoked.includes(key))this.data.revoked.push(key);this.data.entries=this.data.entries.filter(e=>e.session!==session||e.subject!==subject);for(const [id,o]of Object.entries(this.data.owners))if(o.session===session&&o.subject===subject)delete this.data.owners[id];this.save();}
 claim(id,secret,subject,session){const old=this.data.owners[id],digest=hash(secret);if(old)return !old.stopped&&old.digest===digest&&old.subject===subject&&old.session===session;if(Object.keys(this.data.owners).length>=1000)throw Error('Identity capacity');this.data.owners[id]={digest,subject,session};this.save();return true;}
 stop(id,secret,subject){const old=this.data.owners[id];if(!old||old.digest!==hash(secret)||old.subject!==subject)return false;old.stopped=true;this.save();return true;}
 list(){return this.data.entries.map(({session,subject})=>({session,subject}));}
}
module.exports={AccessStore};
