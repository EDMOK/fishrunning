const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],missing=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.addInitScript(()=>{let seed=5723;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};window.__q=[];window.__now=100;requestAnimationFrame=cb=>{__q.push(cb);return __q.length;};window.__step=n=>{for(let i=0;i<n;i++){__now+=50;__q.splice(0).forEach(cb=>cb(__now));}};});
 await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});await page.locator('#btnStart').dispatchEvent('click');
 async function fixture(kind,lead){
  await page.evaluate(async({kind,lead})=>{
   const w=DSGame.world(),cfg=(await(await fetch('assets/manifest.json')).json()).obstacle[kind],img=new Image();
   img.src='assets/obstacle/new/'+kind+'.png';await img.decode();
   w.obstacles.length=0;w.gaps.length=0;w.platforms.length=0;w.pickups.length=0;w.powerups.length=0;
   const x=w.camX+300+lead,y=600-cfg.h-(kind==='drone'?142:0);
   w.obstacles.push({testFixture:true,kind,cfg:cfg.box,img,w:cfg.w,h:cfg.h,x,y,bob:kind==='drone'?6:0,motion:0,phase:0,box:{x:x+cfg.box.x,y:y+cfg.box.y,w:cfg.box.w,h:cfg.box.h},nearMiss:false});
  },{kind,lead});
 }
 async function step(n){for(let i=0;i<n;i++)await page.evaluate(()=>{const w=DSGame.world();w.gaps.length=0;w.platforms.length=0;w.pickups.length=0;w.powerups.length=0;for(let j=w.obstacles.length-1;j>=0;j--)if(!w.obstacles[j].testFixture)w.obstacles.splice(j,1);__step(1);});}
 const samples=[];
 for(let i=0;i<8;i++){
  const speed=await page.evaluate(()=>DSGame.world().speed);await fixture('patrol',85*Math.sqrt(speed/320));
  await page.keyboard.down('ArrowUp');await step(10);await page.keyboard.up('ArrowUp');await step(13);
  const s=await page.evaluate(()=>({lives:DSGame.state().lives,...DSGame.performance()}));samples.push(s);
  if(s.lives!==3){console.log(JSON.stringify({index:i,s,detail:await page.evaluate(()=>({hit:DSGame.lastHit(),player:DSGame.player(),obstacles:DSGame.world().obstacles.map(o=>({kind:o.kind,x:o.x,y:o.y,box:o.box,failed:o.failed}))}))},null,2));await page.screenshot({path:'docs/experience-failure.png'});}
  assert.equal(s.lives,3,'An honest jump must clear the fixture');assert.equal(s.clears,i+1,'One obstacle, one earned clear');
 }
 await fixture('drone',120);await page.keyboard.down('ArrowDown');await step(24);await page.keyboard.up('ArrowDown');
 assert.equal(await page.evaluate(()=>DSGame.performance().styles),2,'Slide counts as a distinct action');
 await fixture('patrol',75);await page.keyboard.press('Shift');await step(13);
 const earned=await page.evaluate(()=>DSGame.performance());assert.equal(earned.styles,3);assert.ok(earned.medals.includes('variety3'));assert.ok(earned.spotlights>=1);
 await page.screenshot({path:'docs/experience-gameplay.png',animations:'disabled'});
 const overlap=await page.evaluate(()=>{const a=document.querySelector('#heroMoment').getBoundingClientRect(),b=document.querySelector('#routeProgress').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert.equal(overlap,false,'Performance and route cues must not overlap');
 await page.keyboard.press('p');const before=await page.evaluate(()=>JSON.stringify(DSGame.experience()));await step(60);assert.equal(await page.evaluate(()=>JSON.stringify(DSGame.experience())),before,'Pause freezes performance timers');await page.keyboard.press('p');
 await fixture('patrol',70);await step(12);assert.equal(await page.evaluate(()=>DSGame.experience().streak),0);assert.equal(await page.evaluate(()=>DSGame.experience().spotlightT),0);
 // A second fresh contact ends the run and exercises the real summary, without forcing gameOver().
 await step(50);await page.evaluate(()=>DSGame.state().lives=1);await fixture('patrol',60);await step(12);
 await page.waitForFunction(()=>DSGame.state().state==='over',null,{polling:100});
 const summary=await page.locator('#skillSummary').textContent();assert.ok(summary.includes('连突破')&&summary.includes('鲸跃时刻'));
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#cardOver')).display!=='none',null,{polling:100});
 await page.screenshot({path:'docs/experience-summary.png',animations:'disabled'});
 await page.locator('#btnAgain').dispatchEvent('click');assert.equal(await page.evaluate(()=>DSGame.performance().clears),0);
 // Invulnerability contacts cannot manufacture action achievements.
 await page.evaluate(()=>DSGame.player().invuln=999);await fixture('patrol',70);await step(15);assert.equal(await page.evaluate(()=>DSGame.performance().clears),0);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={earned,summary,pauseFrozen:true,hitBreaksStreak:true,invulnerabilityCannotEarn:true,restartResets:true,errors,missing};
 fs.writeFileSync('docs/experience-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 const phone=await browser.newContext({viewport:{width:844,height:475},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const mobile=await phone.newPage();await mobile.emulateMedia({reducedMotion:'reduce'});
 await mobile.goto('http://127.0.0.1:8123/');await mobile.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});
 await mobile.locator('#btnStart').dispatchEvent('click');
 await mobile.locator('#padJump').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',button:0,bubbles:true});
 await mobile.waitForFunction(()=>!DSGame.player().onGround,null,{polling:20});
 await mobile.locator('#padJump').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',button:0,bubbles:true});
 const mobileOverlap=await mobile.evaluate(()=>{
  const ids=['heroMoment','riceWrap','routeProgress','zonePlaque'];const rect=ids.map(id=>document.getElementById(id).getBoundingClientRect());
  return rect.some((a,i)=>rect.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
 });assert.equal(mobileOverlap,false,'Phone HUD cues must not overlap');
 await mobile.screenshot({path:'docs/experience-mobile.png',animations:'disabled'});
 report.mobileTouchJump=true;report.mobileHudNoOverlap=true;fs.writeFileSync('docs/experience-browser-verification.json',JSON.stringify(report,null,2));
 console.log('Phone landscape: touch jump, reduced motion and HUD layout passed.');await phone.close();await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
