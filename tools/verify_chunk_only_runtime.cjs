/* Regression: every gameplay geometry entry uses a frozen prefab. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const html=fs.readFileSync('index.html','utf8'),game=fs.readFileSync('src/game.js','utf8');
 for(const name of ['base-patterns','route-patterns','action-routes','reward-shapes'])assert.ok(!html.includes('src/'+name+'.js'),'legacy script is still loaded: '+name);
 for(const name of ['DSBasePatterns','DSRoutePatterns','DSActionRoutes','PATTERNS','safeHazardSlot','appendAction'])assert.ok(!game.includes(name),'legacy runtime path still exists: '+name);
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await (await b.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true})).newPage();
 const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.addInitScript(()=>{
  let seed=21943;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  window.__raf=[];window.__now=100;window.requestAnimationFrame=cb=>{__raf.push(cb);return __raf.length;};
  window.__step=n=>{for(let i=0;i<n;i++){__now+=1000/120;__raf.splice(0).forEach(cb=>cb(__now));}};
 });
 await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'));
 await page.locator('#btnStart').dispatchEvent('click');
 const counts=await page.evaluate(()=>({chunks:DSGame.world().chunks,entities:DSGame.world().obstacles.length+DSGame.world().platforms.length+DSGame.world().gaps.length,pickups:DSGame.world().pickups.length}));
 assert.ok(counts.chunks>1000&&counts.entities>0&&counts.pickups>0);
 // Instantiate a representative of every art kind and every dynamic variant in
 // the actual engine. Practice is also required to use the frozen replay path.
 const coverage=await page.evaluate(()=>{
  const S=DSChunksData.strings,seen=new Set(),rows=[];
  for(const c of DSChunksData.chunks){
   const keys=c.o.flatMap(o=>[S[o[0]],...(o[2].trap?['trap:'+o[2].trap]:[])]).concat(c.p.length?['platform:cloud']:[],c.p.some(p=>p[3]&&p[3].collapse)?['platform:collapse']:[]);
   if(keys.every(k=>seen.has(k)))continue;
   if(!DSGame.practice(c.id,c.speed))throw Error('practice rejected '+c.id);
   const w=DSGame.world(),first=w.segments[0];
   if(!first||first.chunkId!==c.id||first.source!=='chunk'||!first.frozen)throw Error('practice used unfrozen geometry');
   if(first.obstacles.length!==c.o.length||first.platforms.length!==c.p.length||first.gaps.length!==c.g.length||first.pickups.length!==c.r.length)throw Error('entity replay count mismatch '+c.id);
   if(!first.obstacles.every(o=>o.img&&o.img.naturalWidth>0))throw Error('undecoded art '+c.id);
   if(first.platforms.some(p=>p.collapseDelay>0))keys.push('platform:collapse');
   keys.forEach(k=>seen.add(k));rows.push(c.id);
  }
  return {kinds:[...seen],practiceChunks:rows.length};
 });
 for(const k of ['patrol','crystals','mine','drone','turret','gate','sentry','cargo','spring','buoy','trap:pulse','trap:cable','trap:scout','platform:cloud','platform:collapse'])assert.ok(coverage.kinds.includes(k),'missing live asset '+k);
 await page.locator('#btnStart').dispatchEvent('click');
 let progress;
 do{
  progress=await page.evaluate(()=>{
   for(let i=0;i<600;i++){
    const w=DSGame.world(),p=DSGame.player(),g=DSGame.state();p.invuln=999;g.lives=3;
    w.obstacles.length=0;w.platforms.length=0;w.gaps.length=0;w.pickups.length=0;w.powerups.length=0;__step(1);
   }
   const w=DSGame.world();return {t:w.runElapsed,segments:w.segments.length,allFrozen:w.segments.every(s=>s.source==='chunk'&&s.frozen&&s.chunkId),events:w.segments.filter(s=>s.id.startsWith('prefab-event-')).length,practice:w.practice};
  });
  assert.ok(progress.allFrozen,'normal run fell back to legacy geometry');
 }while(progress.t<190);
 assert.equal(progress.practice,null);assert.ok(progress.events>0,'events must replay frozen chunks');
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 // Missing data must stop play with an explicit message, never call old generators.
 await page.route('**/src/chunks-data.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DSChunksData = null;'}));
 await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'));
 await page.locator('#btnStart').dispatchEvent('click');
 const missingLibrary=await page.evaluate(()=>({message:document.getElementById('loading').textContent,state:DSGame.state().state,entities:DSGame.world().obstacles.length,oldGenerators:!!(window.DSBasePatterns||window.DSRoutePatterns||window.DSActionRoutes)}));
 assert.ok(missingLibrary.message.includes('预制赛道库未加载'));assert.equal(missingLibrary.state,'title');assert.equal(missingLibrary.entities,0);assert.equal(missingLibrary.oldGenerators,false);
 const report={loaded:counts,coverage,run:progress,missingLibrary,errors,missing};fs.writeFileSync('docs/chunk-only-runtime-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await b.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
