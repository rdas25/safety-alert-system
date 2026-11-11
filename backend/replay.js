'use strict';
// Re-evaluate recorded, already time-aligned 1 Hz snapshots. Labels are GPS proxies, not ground truth.
const fs = require('fs');
const risk = require('./riskModel');
const { newPairState, stepPair } = require('./alertState');
function replay(rows, high) {
  const states = new Map(); const summaries = new Map(); const timeline = [];
  const active=new Map(); let episode=0; let previousProfile=null;
  if(high!==undefined && (!Number.isFinite(high)||high<0.25||high>0.75))throw Error('Invalid HIGH cutoff');
  let previousTime = null; let unavailableDeviceSamples=0;
  for (const row of rows) {
    if (row.schema !== 1 || row.type !== 'dashboard' || !Number.isFinite(row.t) || !Array.isArray(row.devices) || !risk.PROFILES[row.profile]) throw new Error('Unsupported recording row');
    if (previousTime !== null && row.t <= previousTime) throw new Error('Timestamps must increase');
    if ((previousTime !== null && row.t - previousTime > 2000)||previousProfile!==row.profile){states.clear();active.clear();}
    previousProfile=row.profile;
    const ids=new Set();
    for(const d of row.devices){if(!d||typeof d.id!=='string'||ids.has(d.id)||!Number.isFinite(d.lat)||Math.abs(d.lat)>90||!Number.isFinite(d.lon)||Math.abs(d.lon)>180||!risk.ROLES.includes(d.role)||![d.speed,d.heading,d.accuracy].every(v=>v==null||Number.isFinite(v)))throw Error('Invalid recorded device');ids.add(d.id);}
    previousTime = row.t;
    const base = risk.PROFILES[row.profile];
    const p = { ...base, CUTOFFS: { ...base.CUTOFFS, ...(high === undefined ? {} : { HIGH: high }) } };
    unavailableDeviceSamples+=row.devices.filter(d=>d.stale || (d.coverage && d.coverage!=='available') || d.accuracy>30).length;
    const devices = row.devices.filter(d => !d.stale && (!d.coverage || d.coverage==='available')).sort((a,b) => a.id.localeCompare(b.id));
    const seen = new Set();
    for (let i=0; i<devices.length; i++) for (let j=i+1; j<devices.length; j++) {
      const a=devices[i], b=devices[j], key=[a.id,b.id].join('|'); if(a.session!==b.session)continue; seen.add(key);
      const result=risk.assess(a,b,p);
      if(active.get(key)?.diverged && result.reason==='approaching'){active.delete(key);states.delete(key);}
      const state=states.get(key) || newPairState(); states.set(key,state); stepPair(state,result.level);
      if (['poor_gps','pair_excluded'].includes(result.reason)){active.delete(key);states.delete(key);continue;}
      let encounter=active.get(key);
      if(!encounter){encounter={id:++episode,diverged:false};active.set(key,encounter);}
      if(result.reason==='diverging')encounter.diverged=true;
      const summaryKey=key+'#'+encounter.id;
      const summary=summaries.get(summaryKey) || { pair:key, encounter:encounter.id, minDistanceM:Infinity, firstHighAt:null, closestAt:null };
      if (result.distM < summary.minDistanceM) { summary.minDistanceM=result.distM; summary.closestAt=row.t; }
      if (risk.RANK[state.level]>=risk.RANK.HIGH && summary.firstHighAt===null) summary.firstHighAt=row.t;
      summaries.set(summaryKey,summary);
      timeline.push({ t:row.t, pair:key, raw:result.level, shown:state.level, risk:result.risk });
    }
    for (const key of states.keys()) if (!seen.has(key)){states.delete(key);active.delete(key);}
  }
  const counts={ TRUE_ALERT:0, LATE_ALERT:0, MISSED:0, FALSE_ALERT:0, QUIET:0 };
  const pairs=[...summaries.values()].map(s => {
    const close=s.minDistanceM<=5, warned=s.firstHighAt!==null;
    const timely=warned && s.closestAt-s.firstHighAt>=1000;
    const verdict=close ? (warned?(timely?'TRUE_ALERT':'LATE_ALERT'):'MISSED') : (warned?'FALSE_ALERT':'QUIET'); counts[verdict]++;
    return { ...s, verdict, warningS:warned?(s.closestAt-s.firstHighAt)/1000:null };
  });
  return { counts, pairs, timeline, unavailableDeviceSamples };
}
function main(args) {
  const [file,...options]=args;
  if (!file) throw new Error('Usage: node replay.js file.jsonl [--timeline] [--sweep HIGH=0.3,0.4,0.5,0.6,0.7]');
  const rows=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  if (!rows.length) throw new Error('Recording is empty');
  const sweepIndex=options.indexOf('--sweep');
  let cutoffs=[undefined];
  if (sweepIndex!==-1) {
    const spec=options[sweepIndex+1] || '';
    if (!/^HIGH=/.test(spec)) throw new Error('Expected HIGH=value,value');
    cutoffs=spec.slice(5).split(',').map(Number);
    if (!cutoffs.length || cutoffs.some(v=>!Number.isFinite(v)||v<0.25||v>0.75)) throw new Error('HIGH must be between MODERATE (0.25) and CRITICAL (0.75)');
  }
  for (const high of cutoffs) {
    const {timeline,...summary}=replay(rows,high);
    console.log(JSON.stringify({ high:high ?? 'recorded-profile-default', ...summary }));
    if (options.includes('--timeline')) timeline.forEach(t=>console.log(JSON.stringify(t)));
  }
}
if (require.main===module) { try { main(process.argv.slice(2)); } catch(e) { console.error(e.message); process.exitCode=1; } }
module.exports={ replay };
