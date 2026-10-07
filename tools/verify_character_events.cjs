const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const content={};vm.runInNewContext(fs.readFileSync('src/memes.js','utf8'),content);
const events=content.DSMemes.EVENTS,source=fs.readFileSync('src/game.js','utf8').replace(/\r\n/g,'\n');
const ids=['quota-feast','outage-refund','rollback-feast','permission-nesting','flash-restock','multimodal-box'];
function range(a,b){let i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j);}
const instant=range('  var INSTANT_TAGS =','  /** Split an effect').match(/'([A-Za-z]+)'/g).map(s=>s.slice(1,-1));
assert.equal(new Set(events.map(e=>e.id)).size,events.length);
for(const id of ids){const e=events.find(e=>e.id===id);assert.ok(e&&e.art&&e.group&&e.topic&&e.cue);assert.ok(fs.existsSync('assets/'+e.art+'.png'));for(const k of Object.keys(e.eval))assert.ok(instant.includes(k),k);}
assert.equal(new Set(ids.map(id=>events.find(e=>e.id===id).who)).size,6);
let seed=1;
const c={EVENTS:events,INSTANT_TAGS:instant,SHOP_SKILLS:[{id:'jump',costs:[10,20]}],practice:null,activeAction:null,Coast:null,runElapsed:50,dist:6000,
 zoneTransition:{t:0},seenHints:{slide:1,cargo:1},pendingChunkEvents:[],actionBlocks:[],tier:()=>4,GameAudio:{sfx(){}},game:{},shake(){},showEventBanner(){},hideEventBanner(){},fireInstantTag(){},
 pick(pool){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return pool[Math.floor(seed/4294967296*pool.length)];},rand(a,b){return a+(b-a)*.5}};
vm.createContext(c);vm.runInContext(range('  var mods =','  // Tags that resolve once')+range('  function applyEval(','  /**\n   * Fail loudly')+'var zoneBannerT=0;\n'+range('  var genEvent =','  // ---- milestones & shop'),c);
const counts={},groupCounts={};
for(const value of [1,7,61451]){seed=value;c.clearMods();c.genEvent.count=0;c.sale={t:0,ids:[]};c.lastEventGroup='';const history=[];
 for(let i=0;i<1000;i++){assert.ok(c.fireEvent());const e=c.eventDef;
  if(i<2)assert.equal(e.id,i===0?'rush':'discount');
  assert.ok(!history.slice(-5).some(p=>p.id===e.id));if(i)assert.notEqual(c.eventGroup(e),c.eventGroup(history.at(-1)));
  assert.equal(c.fireEvent(),false,'active banner prevents overwrite');
  history.push(e);counts[e.id]=(counts[e.id]||0)+1;let g=c.eventGroup(e);groupCounts[g]=(groupCounts[g]||0)+1;
  c.updateEvent((e.dur||2.8)+.1);assert.equal(c.eventDef,null);assert.equal(c.mods.timed.length,0);
 }
}
ids.concat(['quota-spill','brain-reboot','economy-route','proxy-parcels','chip-reclaim']).forEach(id=>assert.ok(counts[id]>0,id));
c.clearMods();c.genEvent.count=2;c.lastEventGroup='';c.EVENTS=events.filter(e=>e.id==='permission-nesting');
c.pendingChunkEvents.push({kind:'doublecheck'});assert.equal(c.fireEvent(),false);c.pendingChunkEvents.length=0;
c.actionBlocks.push({eventKind:'doublecheck',done:false});assert.equal(c.fireEvent(),false);c.actionBlocks.length=0;
delete c.seenHints.slide;assert.equal(c.fireEvent(),false);c.seenHints.slide=1;assert.ok(c.fireEvent());c.updateEvent(10);
c.clearMods();c.lastEventGroup='';c.EVENTS=events.filter(e=>e.eval.discountShop);c.sale.t=12;assert.equal(c.fireEvent(),false);
c.sale.t=0;c.skillLevels.jump=2;assert.equal(c.fireEvent(),false);c.skillLevels.jump=0;assert.ok(c.fireEvent());
const lib={window:{}};for(const f of ['chunks-data.js','event-chunks-data.js','chunks.js'])vm.runInNewContext(fs.readFileSync('src/'+f,'utf8'),lib);
let rice=[],hazards=0;const api={rice(x,y,kind){rice.push({x,y,kind});},gap(){hazards++;},platform(){hazards++;},addObstacle(){hazards++;},riskLine(){hazards++;},hint(){}};
const chunks=lib.window.DSChunks.create(lib.window.DSChunksData,api,lib.window.DSEventChunksData);
assert.equal(chunks.count,lib.window.DSChunksData.chunks.length+32);
for(const raw of lib.window.DSEventChunksData.chunks){rice=[];hazards=0;const p=chunks.byId(raw.id);p.build(1000);assert.equal(rice.length,raw.rewardCount);assert.equal(hazards,0);assert.ok(rice.every(r=>r.kind==='rice'&&r.x>=1000&&r.x<1000+p.length));assert.ok(chunks.poolFor(p.speed).some(v=>v.chunkId===p.chunkId));}
const report={events:events.length,newEvents:ids,draws:3000,counts,groupCounts,recentIds:5,teachingGate:true,challengeOverlapBlocked:true,promotionEligibility:true,frozenRewards:32};
fs.writeFileSync('docs/character-events-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
