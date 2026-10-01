const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[],warnings=[],missing=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.addInitScript(()=>{let seed=61451;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};window.__q=[];window.__now=100;window.requestAnimationFrame=cb=>{__q.push(cb);return __q.length;};window.__step=n=>{for(let i=0;i<n;i++){__now+=50;__q.splice(0).forEach(cb=>cb(__now));}};});
 async function start(){await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});await page.evaluate(()=>__step(2));await page.locator('#btnStart').dispatchEvent('click');}
 async function frozenCheck(key){await page.keyboard.press(key);const before=await page.evaluate(()=>({t:DSGame.world().runElapsed,cam:DSGame.world().camX,time:DSGame.world().time}));await page.evaluate(()=>__step(60));assert.deepEqual(await page.evaluate(()=>({t:DSGame.world().runElapsed,cam:DSGame.world().camX,time:DSGame.world().time})),before);await page.keyboard.press(key);}
 await start();const transitions=[],stages=[],phaseCounts={};let paused=false,shopped=false,cityShot=false,coastShot=false;
 for(let i=0;i<900;i++){
  const s=await page.evaluate(()=>{DSGame.state().lives=3;DSGame.player().invuln=999;__step(10);const w=DSGame.world();return {zone:w.zone,elapsed:w.runElapsed,dist:w.dist,tier:w.tier,transition:w.transition,notice:w.coastApproachShown,patterns:DSGame.patternCounts(),audit:DSGame.audit()};});
  if(!transitions.length||transitions.at(-1).zone!==s.zone)transitions.push({zone:s.zone,elapsed:s.elapsed,dist:s.dist});
  if(!stages.length||stages.at(-1).tier!==s.tier)stages.push({tier:s.tier,elapsed:s.elapsed});
  if(s.elapsed<300)assert.notEqual(s.zone,5,'Sunset entered before five minutes');
  assert.equal(s.audit.length,0,'Runtime obstacle audit');
  if(!paused&&s.elapsed>165){await frozenCheck('p');paused=true;}
  if(!shopped&&s.elapsed>240){await frozenCheck('b');shopped=true;}
  if(!cityShot&&s.elapsed>200){await page.screenshot({path:'docs/city-expanded-gameplay.png'});cityShot=true;}
  if(!phaseCounts.city&&s.zone===5)phaseCounts.city=s.patterns;
  if(s.zone===5&&s.elapsed<362)assert.ok(s.transition>0,'Expected gradual handoff');
  if(!coastShot&&s.zone===5&&s.elapsed>368){await page.screenshot({path:'docs/coast-gameplay.png'});assert.equal(s.transition,0);coastShot=true;}
  if(s.elapsed>430){phaseCounts.total=s.patterns;break;}
 }
 assert.deepEqual(transitions.map(s=>s.zone),[0,1,2,3,4,5]);const entry=transitions.at(-1);assert.ok(entry.elapsed>=360&&entry.elapsed<361);
 const newIds=['islands-zigzag','islands-stairs','islands-valley','broken-road','pit-and-island','pit-landing-hop','upper-staircase','platform-wave','upper-or-hop','obstacle-rhythm','slide-jump-shuffle','patrol-slalom','rice-fan','rice-switchback','rice-double-arc'];
 const cityNew=newIds.filter(id=>phaseCounts.city[id]),coastNew=newIds.filter(id=>(phaseCounts.total[id]||0)>(phaseCounts.city[id]||0));assert.ok(cityNew.length>=12);assert.ok(coastNew.length>=6);
 // Continuous dash pressure proves distance cannot shorten the city chapter.
 await page.reload();await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});await page.locator('#btnStart').dispatchEvent('click');let fastEntry=null;
 for(let i=0;i<740;i++){
  const s=await page.evaluate(()=>{DSGame.state().lives=3;DSGame.player().invuln=999;DSGame.player().dashT=999;__step(10);const w=DSGame.world();return {zone:w.zone,elapsed:w.runElapsed,dist:w.dist};});
  if(s.elapsed<360)assert.notEqual(s.zone,5);
  if(s.zone===5){fastEntry=s;break;}
 }assert.ok(fastEntry&&fastEntry.elapsed>=360&&fastEntry.elapsed<361);
 assert.equal(errors.length,0);assert.equal(missing.length,0);assert.equal(warnings.length,0);
 const report={entry,fastEntry,transitions,stages,pauseFrozen:paused,shopFrozen:shopped,cityNew,coastNew,phaseCounts,errors,warnings,missing};fs.writeFileSync('docs/coast-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,phaseCounts:undefined},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
