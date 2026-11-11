'use strict';
const fs=require('fs'),path=require('path');const {prune}=require('./retention');
class Journal{
 constructor(dir,{maxBytes=10*1024*1024,onError=()=>{}}={}){this.dir=dir;this.maxBytes=maxBytes;this.onError=onError;this.bytes=0;this.streams=new Set();this.failed=false;this.lastId=0;fs.mkdirSync(dir,{recursive:true,mode:0o700});prune(dir,null);this.rotate();}
 get writableLength(){return [...this.streams].reduce((n,s)=>n+s.writableLength,0);}
 fail(error){if(this.failed)return;this.failed=true;this.onError(error);for(const stream of this.streams)stream.end();}
 rotate(){const old=this.current;const id=Math.max(Date.now(),this.lastId+1);this.lastId=id;this.name='session-'+id+'.jsonl';this.current=fs.createWriteStream(path.join(this.dir,this.name),{flags:'wx',mode:0o600});const stream=this.current;this.streams.add(stream);stream.on('error',e=>this.fail(e));stream.on('close',()=>this.streams.delete(stream));this.bytes=0;if(old)old.end(()=>{try{prune(this.dir,this.name);}catch(error){this.fail(error);}});}
 write(line){if(this.failed)return false;if(this.writableLength>1048576){this.fail(Error('Recording queue exceeded; recording disabled'));return false;}const size=Buffer.byteLength(line);if(this.bytes&&this.bytes+size>this.maxBytes)this.rotate();this.bytes+=size;return this.current.write(line);}
 end(callback){const streams=[...this.streams];if(!streams.length){callback();return;}let remaining=streams.length;for(const stream of streams){let done=false;const finish=()=>{if(done)return;done=true;if(--remaining===0)callback();};stream.once('close',finish);stream.end();if(stream.closed)finish();}}
}
module.exports={Journal};
