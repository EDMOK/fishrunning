/* Audit design substance and empty track without changing runtime content. */
const fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const box={window:{}};vm.runInNewContext(fs.readFileSync('src/chunks-data.js','utf8'),box);
const data=box.window.DSChunksData,S=data.strings,manifest=JSON.parse(fs.readFileSync('assets/manifest.json','utf8'));
const round=x=>Math.round(x*100)/100;
function holes(spans,start,end){
 spans=spans.map(([a,b])=>[Math.max(start,a),Math.min(end,b)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 const out=[];let cursor=start;
 for(const [a,b] of spans){if(a>cursor)out.push([cursor,a]);cursor=Math.max(cursor,b);}
 if(cursor<end)out.push([cursor,end]);return out;
}
function summary(values){values=values.slice().sort((a,b)=>a-b);return {min:round(values[0]||0),median:round(values[Math.floor(values.length*.5)]||0),p95:round(values[Math.floor(values.length*.95)]||0),max:round(values.at(-1)||0)};}
function stats(chunks){return {count:chunks.length,percent:round(100*chunks.length/data.chunks.length)};}
function obstacleSpan(o){const m=manifest.obstacle[S[o[0]]],opt=o[2]||{},motion=opt.motion||({patrol:22,mine:24,drone:34,sentry:14}[S[o[0]]]||0);return [o[1]-motion,o[1]+m.w+motion];}
const report={library:{chunks:data.chunks.length,recipes:new Set(data.chunks.map(c=>S[c.base])).size,
 twoOrMoreObstacleKinds:stats(data.chunks.filter(c=>new Set(c.o.map(o=>o[0])).size>=2)),
 twoOrMoreActionTypes:stats(data.chunks.filter(c=>new Set(c.actions).size>=2)),
 chains:stats(data.chunks.filter(c=>c.chain)),
 actions6OrMore:stats(data.chunks.filter(c=>c.actions.length>=6)),
 uniqueActionOrders:new Set(data.chunks.filter(c=>c.chain).map(c=>c.motif)).size,
 actions3OrMore:stats(data.chunks.filter(c=>c.actions.length>=3)),
 noObstacleEntities:stats(data.chunks.filter(c=>!c.o.length)),
 pureReward:stats(data.chunks.filter(c=>!c.o.length&&!c.p.length&&!c.g.length)),
 noGeometryOrPickups:data.chunks.filter(c=>!c.o.length&&!c.p.length&&!c.g.length&&!c.r.length&&!c.k.length).length,
 nonRewardWithoutHazards:stats(data.chunks.filter(c=>S[c.family]!=='reward'&&!c.o.length&&!c.g.length)),
 allChunksHaveRice:data.chunks.every(c=>c.r.length>0),
 riceCount:summary(data.chunks.map(c=>c.r.length)),
 withinChunkEmptySeconds:summary(data.chunks.map(c=>Math.max(0,...holes(c.o.map(obstacleSpan).concat(c.p.map(p=>[p[0],p[0]+p[2]]),c.g.map(g=>[g[0],g[0]+g[1]]),c.r.map(r=>[r[0]-34,r[0]+34])),0,c.len).map(([a,b])=>(b-a)/c.speed)))),
 withinChunkGeometryFreeSeconds:summary(data.chunks.map(c=>Math.max(0,...holes(c.o.map(obstacleSpan).concat(c.p.map(p=>[p[0],p[0]+p[2]]),c.g.map(g=>[g[0],g[0]+g[1]])),0,c.len).map(([a,b])=>(b-a)/c.speed))))},examples:[],runs:[]};
for(const base of ['prefab-three-step','prefab-wall-switch','prefab-roof-break','prefab-cloud-exit','prefab-choice-exit','prefab-spring-exit','prefab-final-switch']){
 const c=data.chunks.find(c=>S[c.base]===base&&c.speed===700);
 if(c)report.examples.push({id:c.id,actions:c.actions,obstacles:c.o.map(o=>S[o[0]]),platforms:c.p.length,gaps:c.g.length,rice:c.r.length,riceY:summary(c.r.map(r=>r[1])),length:c.len});
}
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const seed of [4242,21943,8129]){
  const page=await b.newPage({viewport:{width:844,height:390}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed=>{
   Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   window.__raf=[];window.__now=100;window.requestAnimationFrame=cb=>{__raf.push(cb);return __raf.length;};
   window.__distanceTime=[];window.__powers={};window.__rice={};
   window.__step=n=>{for(let i=0;i<n;i++){__now+=1000/120;__raf.splice(0).forEach(cb=>cb(__now));const w=DSGame.world();__distanceTime.push([w.camX+w.playerX,w.runElapsed]);w.powerups.forEach(p=>{__powers[p.x]=[p.x-40,p.x+40];});}};
  },seed);
  await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100,timeout:60000});
  await page.locator('#btnStart').dispatchEvent('click');
  let progress;
  do{progress=await page.evaluate(()=>{for(let i=0;i<600;i++){const w=DSGame.world();DSGame.player().invuln=999;DSGame.state().lives=3;w.pickups.forEach(p=>{__rice[p.x+':'+p.y]=[p.x-34,p.x+34];});w.obstacles.length=0;w.gaps.length=0;w.platforms.length=0;w.pickups.length=0;w.powerups.length=0;__step(1);}return DSGame.world().runElapsed;});}while(progress<195);
  const segments=await page.evaluate(()=>DSGame.world().segments.map(s=>({id:s.id,chunkId:s.chunkId,start:s.start,end:s.end,speed:s.speed,runway:s.runway})));
  const distanceTime=await page.evaluate(()=>window.__distanceTime);
  const powers=await page.evaluate(()=>Object.values(window.__powers));
  const observedRice=await page.evaluate(()=>Object.values(window.__rice));
  function timeAt(x){
   let lo=0,hi=distanceTime.length-1;
   if(x<=distanceTime[0][0])return distanceTime[0][1];
   if(x>=distanceTime[hi][0])return distanceTime[hi][1];
   while(hi-lo>1){const mid=(lo+hi)>>1;if(distanceTime[mid][0]<x)lo=mid;else hi=mid;}
   const a=distanceTime[lo],b=distanceTime[hi];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  }
  const entities=powers.concat(observedRice),geometry=[],hazards=[],runways=[];
  let zeroObstacleStreak=0,maxZeroObstacleStreak=0,pureStreak=0,maxPureStreak=0;
  for(const s of segments){const c=data.chunks.find(c=>c.id===s.chunkId);if(!c)continue;
   const spans=c.o.map(obstacleSpan).map(([a,b])=>[s.start+a,s.start+b]);hazards.push(...spans);
   const geo=spans.concat(c.p.map(p=>[s.start+p[0],s.start+p[0]+p[2]]),c.g.map(g=>[s.start+g[0],s.start+g[0]+g[1]]));geometry.push(...geo);
   entities.push(...geo,...c.r.map(r=>[s.start+r[0]-34,s.start+r[0]+34]));
   runways.push({id:s.id,pixels:round(s.runway.to-s.runway.from),seconds:round(timeAt(s.runway.to)-timeAt(s.runway.from))});
   zeroObstacleStreak=c.o.length?0:zeroObstacleStreak+1;maxZeroObstacleStreak=Math.max(maxZeroObstacleStreak,zeroObstacleStreak);
   pureStreak=c.o.length||c.p.length||c.g.length?0:pureStreak+1;maxPureStreak=Math.max(maxPureStreak,pureStreak);
  }
  function spansReport(list){return holes(list,segments[0].start,Math.min(segments.at(-1).end,distanceTime.at(-1)[0])).map(([from,to])=>{
   const seconds=timeAt(to)-timeAt(from);
   return {from:round(from),to:round(to),pixels:round(to-from),seconds:round(seconds),adjacent:segments.filter(s=>s.end>=from&&s.start<=to).map(s=>s.id)};
  }).sort((a,b)=>b.seconds-a.seconds);}
  report.runs.push({seed,seconds:round(progress),segments:segments.length,openingEmptySeconds:round(timeAt(Math.min(...entities.map(s=>s[0])))),chainSegments:segments.filter(s=>data.chunks.find(c=>c.id===s.chunkId)?.chain).length,
   long6Plus:segments.filter(s=>data.chunks.find(c=>c.id===s.chunkId)?.actions.length>=6).length,
   multiKindSegments:segments.filter(s=>{const c=data.chunks.find(c=>c.id===s.chunkId);return c&&new Set(c.o.map(o=>o[0])).size>=2;}).length,maxZeroObstacleStreak,maxPureStreak,
   recoveryRunwaySeconds:summary(runways.filter(r=>r.seconds>0).map(r=>r.seconds)),
   emptyTrack:spansReport(entities).slice(0,5),geometryFree:spansReport(geometry).slice(0,3),obstacleFree:spansReport(hazards).slice(0,3),errors});
  await page.close();
 }
 await b.close();fs.writeFileSync('docs/chunk-design-audit.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
