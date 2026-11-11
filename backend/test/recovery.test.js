const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AccessStore}=require('../accessStore');
test('backup restore preserves issued access, revoked seeds and stopped identities',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={CLIENT_TOKENS:JSON.stringify([{token:'seed',session:'group',subject:'seed-user'}]),STATE_DIR:path.join(root,'original')};
 const first=new AccessStore(env),token=first.issue('group','alice');first.revoke('group','seed-user');first.claim('group|phone','secret','alice','group');first.stop('group|phone','secret','alice');
 const restore=path.join(root,'restored');fs.mkdirSync(restore,{mode:0o700});fs.copyFileSync(path.join(env.STATE_DIR,'access.json'),path.join(restore,'access.json'));
 const second=new AccessStore({...env,STATE_DIR:restore});assert.deepEqual(second.lookup(token),{session:'group',subject:'alice'});assert.equal(second.lookup('seed'),undefined);assert.equal(second.claim('group|phone','secret','alice','group'),false);
 assert.ok(!fs.readFileSync(path.join(restore,'access.json'),'utf8').includes(token));
 fs.writeFileSync(path.join(restore,'access.json'),'{broken');assert.throws(()=>new AccessStore({...env,STATE_DIR:restore}));
});
