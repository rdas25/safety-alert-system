const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AccessStore}=require('../accessStore');const {estimate,append}=require('../motion');const {candidatePairs}=require('../spatial');
test('enrollment, identity ownership and revocation survive restart without storing raw secrets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'access-'));try{const env={STATE_DIR:dir,CLIENT_TOKEN:'seed'};let s=new AccessStore(env);const token=s.issue('session','alice');assert.equal(s.lookup(token).subject,'alice');assert.ok(s.claim('session|phone','a'.repeat(64),'alice','session'));assert.equal(s.claim('session|phone','b'.repeat(64),'alice','session'),false);s=new AccessStore(env);assert.ok(s.lookup(token));assert.ok(s.claim('session|phone','a'.repeat(64),'alice','session'));const saved=fs.readFileSync(path.join(dir,'access.json'),'utf8');assert.equal(saved.includes(token),false);assert.equal(saved.includes('a'.repeat(64)),false);s.revoke('session','alice');assert.equal(new AccessStore(env).lookup(token),undefined);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('history estimates known straight motion and rejects jitter and duplicate fixes',()=>{
 let h=[];for(let t=0;t<6;t++)h=append(h,{lat:0,lon:10*t/111195,accuracy:2,receivedAt:1000*t,fixAgeMs:0});const v=estimate(h);assert.ok(Math.abs(v.speed-10)<0.01);assert.ok(Math.abs(v.heading-90)<0.01);assert.equal(append(h,{...h.at(-1),receivedAt:5000,fixAgeMs:0}).length,h.length);assert.equal(estimate(h.map(r=>({...r,lon:0}))),null);
});
test('spatial candidates preserve close pairs across date line and isolate sessions',()=>{
 const rec=(id,lon,session='x')=>({d:{id,session},cur:{lat:0,lon}});const rows=[rec('a',179.999),rec('b',-179.999),rec('c',0),rec('d',179.999,'other')];assert.equal(candidatePairs(rows).length,1);
});
test('spatial indexing preserves brute-force nearby pairs in a seeded geography',()=>{
 let seed=3;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);const rows=Array.from({length:100},(_,id)=>({d:{id,session:'x'},cur:{lat:40+rand()*.05,lon:-86+rand()*.05}}));const pairs=new Set(candidatePairs(rows).map(([a,b])=>[a.d.id,b.d.id].sort((a,b)=>a-b).join('|')));const {localXY}=require('../riskModel');for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i].cur,b=rows[j].cur,p=localXY(a.lat,a.lon,b.lat,b.lon);if(Math.hypot(p.x,p.y)<500)assert.ok(pairs.has(i+'|'+j));}
});
test('re-enrollment does not resurrect revoked seed credentials',()=>{
 const store=new AccessStore({CLIENT_TOKENS:JSON.stringify([{token:'old',session:'g',subject:'a'}])});store.revoke('g','a');const fresh=store.issue('g','a');assert.equal(store.lookup('old'),undefined);assert.ok(store.lookup(fresh));
});
test('recordings rotate without stopping the service and flush every file',async()=>{
 const {Journal}=require('../recording');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'journal-'));try{const journal=new Journal(dir,{maxBytes:10});journal.write('first-row\n');journal.write('second-row\n');await new Promise(resolve=>journal.end(resolve));const files=fs.readdirSync(dir).sort();assert.equal(files.length,2);assert.equal(files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join(''),'first-row\nsecond-row\n');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('road context matches nearby segments without inventing a distant match',()=>{
 const {prepare,match}=require('../roadContext');const segments=prepare({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Example path'},geometry:{type:'LineString',coordinates:[[0,0],[0.001,0]]}}]});assert.equal(match(segments,{lat:0,lon:0.0005,accuracy:4}).name,'Example path');assert.equal(match(segments,{lat:1,lon:1,accuracy:4}),null);assert.throws(()=>prepare({type:'FeatureCollection',features:[{geometry:{type:'LineString',coordinates:[[NaN,0],[0,0]]}}]}));
});
test('stopping a session prevents an in-flight background fix from resurrecting it',()=>{
 const store=new AccessStore({CLIENT_TOKEN:'seed'});assert.ok(store.claim('default|phone','secret','shared','default'));assert.ok(store.stop('default|phone','secret','shared'));assert.equal(store.claim('default|phone','secret','shared','default'),false);
});
test('turning and acceleration hypotheses differ from straight motion and remain bounded',()=>{
 const {variants}=require('../prediction');const result=variants([{fixAt:0,speed:2,heading:0},{fixAt:1000,speed:3,heading:30}]);assert.ok(Math.abs(result.turnDegreesPerSecond-30)<1e-9);assert.equal(result.accelerationMps2,1);assert.ok(result.paths.turning.at(-1).eastM>result.paths.straight.at(-1).eastM);assert.ok(Math.hypot(result.paths.accelerating.at(-1).eastM,result.paths.accelerating.at(-1).northM)>15);assert.equal(variants([{fixAt:0,speed:null,heading:null}]),null);
});
test('dead reckoning remains finite at poles and wraps the date line',()=>{
 const {advance,PROFILES,localXY}=require('../riskModel');for(const lat of [-90,90,0]){const moved=advance({lat,lon:179.999,heading:90,speed:100},5,PROFILES.real);assert.ok(Number.isFinite(moved.lat)&&Math.abs(moved.lat)<=90);assert.ok(Number.isFinite(moved.lon)&&Math.abs(moved.lon)<=180);}assert.ok(Math.abs(localXY(0,-179.999,0,179.999).x)<300);
});
