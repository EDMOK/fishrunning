const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {replay}=require('./lib/chunk-solver.cjs');
const c={window:{}};for(const f of ['memes.js','chunks-data.js','event-chunks-data.js','origin-event-chunks-data.js','chunks.js'])vm.runInNewContext(fs.readFileSync('src/'+f,'utf8'),c);
const events=c.window.DSMemes.EVENTS,data=c.window.DSOriginEventChunksData,base=c.window.DSChunksData,manifest=JSON.parse(fs.readFileSync('assets/manifest.json'));
const ids=['quota-spill','brain-reboot','economy-route','proxy-parcels','chip-reclaim'];
for(const id of ids){const e=events.find(e=>e.id===id);assert.ok(e&&e.originPlanTopic&&e.art&&e.cue);assert.equal(e.kind,'instant');assert.equal(e.eval.routeEvent.kind,id);assert.equal(Object.keys(e.eval).length,1);}
assert.equal(new Set(ids.map(id=>events.find(e=>e.id===id).who)).size,5);
assert.equal(new Set(events.map(e=>e.id)).size,events.length);
let placed=[];const api={rice(x,y,kind){placed.push({x,y,kind});},gap(){assert.fail('No forced gaps');},platform(){},addObstacle(){},hint(){},riskLine(){}};
const lib=c.window.DSChunks.create(base,api,[c.window.DSEventChunksData,data]);assert.equal(lib.count,base.chunks.length+32+28);
const counts={},parcelPositions=new Set();
for(const raw of data.chunks){
 const p=lib.byId(raw.id);assert.ok(p&&p.event&&p.frozen);placed=[];p.build(1000);assert.equal(placed.length,raw.r.length);assert.equal(raw.g.length,0);
 counts[raw.event]=(counts[raw.event]||0)+1;
 const shape={obstacles:raw.o.map(([k,x,opts])=>({kind:data.strings[k],x,opts,...manifest.obstacle[data.strings[k]]})),platforms:raw.p.map(([x,y,w,opts])=>({x,y,w,opts})),gaps:[]};
 if(raw.o.length||raw.p.length)assert.ok(replay(shape,raw.speed,0,raw.proof),raw.id);
 if(raw.event==='quota-spill')assert.equal(raw.r.length,12);
 if(raw.event==='brain-reboot'){assert.equal(raw.o.length,1);assert.equal(data.strings[raw.o[0][0]],'cargo');assert.equal(raw.p.length,0);}
 if(raw.event==='economy-route'){assert.equal(raw.p.length,2);assert.equal(raw.r.filter(r=>data.strings[r[2]]==='bigrice').length,3);assert.equal(raw.r.filter(r=>data.strings[r[2]]==='rice').length,6);assert.ok(replay({...shape,requiredPlatforms:raw.p.map(p=>p[0])},raw.speed,0,raw.optionalProof));}
 if(raw.event==='proxy-parcels'){assert.equal(raw.r.filter(r=>data.strings[r[2]]==='parcel-real').length,1);assert.equal(raw.r.filter(r=>data.strings[r[2]]==='parcel-empty').length,2);parcelPositions.add(raw.r.findIndex(r=>data.strings[r[2]]==='parcel-real'));}
 if(raw.event==='chip-reclaim'){assert.equal(raw.r.length,3);assert.ok(raw.r.every(r=>data.strings[r[2]]==='chip-fragment'));}
}
assert.equal(parcelPositions.size,3);
const report={totalEvents:events.length,addedFromOriginalDocument:ids,characters:5,frozenEventRoutes:data.chunks.length,allChunks:lib.count,counts,safeGroundAndOptionalPlatforms:true,parcelPositions:[...parcelPositions]};
fs.writeFileSync('docs/origin-events-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
