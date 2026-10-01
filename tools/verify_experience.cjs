const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box={window:{}};vm.runInNewContext(fs.readFileSync('src/experience.js','utf8'),box);
const events=[],e=box.window.DSExperience.create(v=>events.push(v));
for(let i=0;i<200;i++)e.pickup();assert.equal(e.state().spotlightT,0,'Idle pickups cannot activate highlight');
assert.equal(e.clear('power'),false);assert.equal(e.state().clears,0);
e.clear('jump');e.clear('slide');assert.equal(e.state().spotlightT,0);
e.clear('dash');assert.equal(e.state().spotlightT,8);assert.equal(e.state().spotlights,1);
assert.ok(e.state().medals.includes('variety3'));e.update(3);assert.equal(e.state().spotlightT,5);
e.miss();assert.equal(e.state().streak,0);assert.equal(e.state().spotlightT,0);
e.reset(8);for(let i=0;i<12;i++)e.clear(['jump','slide','dash'][i%3]);assert.equal(e.summary().rank,'A');
assert.equal(e.state().medals.filter(x=>x==='clean5').length,1);assert.ok(e.summary().recordBroken);
e.reset(25);assert.equal(e.state().clears,0);assert.equal(e.state().charge,0);assert.equal(e.state().medals.length,0);
const phase=box.window.DSExperience.phase;assert.equal(phase(0),'warmup');assert.equal(phase(20),'flow');assert.equal(phase(35),'pressure');assert.equal(phase(50),'release');
console.log('Performance: idle exploit, minimum actions, hit reset, medals, rank and replay reset passed.');
// Compare actual weighted encounter frequencies under identical seeded draws.
let seed;const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const ctx={window:{},Math:math};vm.runInNewContext(fs.readFileSync('src/route-patterns.js','utf8'),ctx);
const d=ctx.window.DSRoutePatterns.create({rand:(a,b)=>a+math.random()*(b-a)}),report={};
for(const p of ['flow','pressure','release']){
 seed=721;d.reset();const recent=[],counts={};
 for(let i=0;i<1500;i++){const item=d.choose(d.patterns,{recent,tier:4,coast:false,phase:p});const f=d.family(item);counts[f]=(counts[f]||0)+1;recent.push(item.id);if(recent.length>5)recent.shift();}
 report[p]=counts;
}
console.log(JSON.stringify(report,null,2));
assert.ok((report.pressure.mixed+report.pressure.obstacle)>(report.flow.mixed+report.flow.obstacle)*1.6);
assert.ok(report.release.reward>900);
fs.writeFileSync('docs/experience-verification.json',JSON.stringify({logic:'PASS',encounterPhases:report},null,2));
