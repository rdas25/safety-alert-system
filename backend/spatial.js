'use strict';
// Earth-centered Cartesian grid avoids antimeridian and pole discontinuities.
// A pair within radius has a chord shorter than radius and lies in adjacent cells.
const R=6371000;
function cell(s,size){const lat=s.lat*Math.PI/180,lon=s.lon*Math.PI/180;return [Math.floor(R*Math.cos(lat)*Math.cos(lon)/size),Math.floor(R*Math.cos(lat)*Math.sin(lon)/size),Math.floor(R*Math.sin(lat)/size)];}
function candidatePairs(records,radius=500){const grid=new Map(),pairs=[];for(const rec of records){const [x,y,z]=cell(rec.cur,radius),session=rec.d.session;for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++){for(const other of grid.get(`${session}:${x+i}:${y+j}:${z+k}`)||[])pairs.push([other,rec]);}const key=`${session}:${x}:${y}:${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(rec);}return pairs;}
module.exports={candidatePairs};
