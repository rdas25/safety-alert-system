const test=require('node:test'),assert=require('node:assert/strict');
const {credentials,boundedSend}=require('../access');
const {replay}=require('../replay');
test('individual access tokens isolate sessions and removed tokens are revoked on reload',()=>{
 const rows=[{token:'one',session:'walk1',subject:'alice'},{token:'two',session:'walk2',subject:'bob'}];
 const auth=credentials({CLIENT_TOKENS:JSON.stringify(rows)});assert.equal(auth('one').session,'walk1');assert.equal(auth('wrong'),undefined);
 assert.equal(credentials({CLIENT_TOKENS:JSON.stringify(rows.slice(1))})('one'),undefined);
 assert.throws(()=>credentials({CLIENT_TOKENS:JSON.stringify([rows[0],rows[0]])}));
});
test('slow clients are disconnected before outbound budget is exceeded',()=>{
 let closed=false,sent=false;boundedSend({readyState:1,bufferedAmount:1048576,terminate(){closed=true;},send(){sent=true;}},{type:'status'});assert.ok(closed);assert.equal(sent,false);
});
const d=(id,x,h)=>({id,lat:0,lon:x/111195,speed:1.4,heading:h,accuracy:4,role:'pedestrian',stale:false});
const row=(t,gap)=>({schema:1,type:'dashboard',profile:'walktest',t,devices:[d('a',0,90),d('b',gap,270)]});
test('late warnings are not counted as timely alerts and gaps segment encounters',()=>{
 assert.equal(replay([row(1000,2)]).counts.LATE_ALERT,1);
 const r=replay([row(1000,12),row(2000,4),row(6000,2)]);assert.equal(r.pairs.length,2);assert.equal(r.counts.TRUE_ALERT,1);assert.equal(r.counts.LATE_ALERT,1);
});
test('replay rejects malformed nested devices and isolates sessions',()=>{
 const bad=row(1,4);bad.devices[0].lat=NaN;assert.throws(()=>replay([bad]));
 const isolated=row(1,4);isolated.devices[0].session='a';isolated.devices[1].session='b';assert.equal(replay([isolated]).pairs.length,0);
});

test('retention removes expired recordings and leaves unrelated files intact',()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),{prune}=require('../retention');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retention-'));
 try{fs.writeFileSync(path.join(dir,'session-1.jsonl'),'old');fs.writeFileSync(path.join(dir,'notes.txt'),'keep');fs.utimesSync(path.join(dir,'session-1.jsonl'),new Date(0),new Date(0));prune(dir,null);assert.equal(fs.existsSync(path.join(dir,'session-1.jsonl')),false);assert.equal(fs.readFileSync(path.join(dir,'notes.txt'),'utf8'),'keep');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('abrupt motion changes clear urgent warnings conservatively and short hazards escalate immediately',()=>{
 const {newPairState,stepPair}=require('../alertState');const risk=require('../riskModel');
 const a={lat:0,lon:0,speed:1.4,heading:90,accuracy:4,role:'pedestrian'},b={...a,lon:0.00004,heading:270};
 const state=newPairState();stepPair(state,risk.assess(a,b).level);assert.equal(state.level,'CRITICAL');
 const turned={...b,heading:90,speed:1.5};const raw=risk.assess(a,turned).level;stepPair(state,raw);assert.equal(state.level,'CRITICAL');stepPair(state,raw);assert.equal(state.level,'NONE');
});
