const fs=require('fs'),path=require('path');
function prune(dir,active,now=Date.now(),maxAgeMs=86400000,maxBytes=100*1024*1024){
 if(!fs.existsSync(dir))return;
 const files=fs.readdirSync(dir).filter(n=>/^session-[0-9]+\.jsonl$/.test(n)).map(name=>({name,...fs.statSync(path.join(dir,name))})).sort((a,b)=>a.mtimeMs-b.mtimeMs);
 let total=files.reduce((n,f)=>n+f.size,0);
 for(const f of files)if(f.name!==active && (now-f.mtimeMs>maxAgeMs||total>maxBytes)){fs.unlinkSync(path.join(dir,f.name));total-=f.size;}
}
module.exports={prune};
