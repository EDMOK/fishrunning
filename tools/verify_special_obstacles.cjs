const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={window:{},Math};vm.runInNewContext(fs.readFileSync('src/obstacle-specials.js','utf8'),sandbox);
const s=sandbox.window.DSObstacleSpecials,report={modes:[],fastestStableLead:0};
for(const mode of ['hop','slide']){
 const o={kind:'buoy'};s.init(o,{mode});
 s.update(o,.1,1600);assert.equal(o.armed,false);
 s.update(o,.08,1340);assert.equal(o.armed,true);assert.equal(o.locked,false);
 assert.ok(s.cue(o).includes('即将'));
 for(let i=0;i<45;i++)s.update(o,1/120,1300-i*9);
 assert.equal(o.locked,true);assert.equal(o.lift,mode==='slide'?142:0);
 const dy=s.pose(o,1).dy;
 for(let i=0;i<400;i++)s.update(o,.01,900-i*4);
 assert.equal(s.pose(o,80).dy,dy,'A locked buoy must not switch at the player');
 assert.ok(!s.cue(o).includes('即将'));report.modes.push({mode,lift:o.lift,locked:true});
}
// Conservative: even a boosted 1.45x speed and an uninterrupted 1.9x dash
// throughout the entire transformation leaves the body at least 760px away.
report.fastestStableLead=s.armLead-665*1.45*1.9*s.armTime;
assert.ok(report.fastestStableLead>760);
const spring={kind:'spring'};s.init(spring);const box={y:536};
assert.equal(s.canBounce(spring,box,529,540,500),true);
assert.equal(s.canBounce(spring,box,600,600,0),false,'Side contact must not bounce');
assert.equal(s.canBounce(spring,box,529,540,-500),false,'Rising contact must not bounce');
spring.springUsed=true;assert.equal(s.canBounce(spring,box,529,540,500),false,'One landing, one bounce');
console.log(JSON.stringify(report,null,2));

vm.runInNewContext(fs.readFileSync('src/route-patterns.js','utf8'),sandbox);
const d=sandbox.window.DSRoutePatterns.create({rand:(a,b)=>(a+b)/2});
const pickAt=(tier,phase='flow')=>d.choose(d.patterns.filter(p=>p.min<=tier),{recent:[],tier,phase,coast:false,transition:false});
const lessons=[pickAt(1).id,pickAt(1).id,pickAt(2).id];
assert.deepEqual(lessons,['cargo-payday','spring-vault','signal-choice']);
d.reset();assert.equal(d.family(pickAt(4,'release')),'reward','Teaching cannot override a rest segment');
assert.equal(pickAt(1).id,'cargo-payday','Restart resets device teaching');
console.log('Single-device lessons before chains:',lessons.join(', '));

d.reset();
for(let i=0;i<3;i++){
 const p=pickAt(4);assert.ok(p.intro,'Unintroduced devices cannot enter a compound encounter');
}

d.reset();const last={},maxAbsence={cargo:0,spring:0,buoy:0};
for(let i=0;i<300;i++){
 const p=pickAt(4);for(const kind of p.devices||[])last[kind]=i;
 for(const kind of Object.keys(last))maxAbsence[kind]=Math.max(maxAbsence[kind],i-last[kind]);
}
for(const kind of Object.keys(maxAbsence))assert.ok(maxAbsence[kind]<=12,kind+' starved in the expanded pool');
console.log('Maximum ordinary-flow choices between devices:',JSON.stringify(maxAbsence));
