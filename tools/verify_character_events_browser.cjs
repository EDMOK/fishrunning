/* Test hooks are inserted only into intercepted script responses; production has no force-event API. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL=process.argv[2]||'http://127.0.0.1:8123/';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const hook=String.raw`
window.__eventTest={
 reset:function(){startRun();game.shake=0;},
 force:function(id,roll){
  var all=EVENTS,ev=all.filter(function(e){return e.id===id;})[0];
  EVENTS=[ev];genEvent.count=2;eventHistory.length=0;eventTopics.length=0;lastEventGroup='';eventDef=null;eventT=0;activeEventMod=null;activeAction=null;zoneTransition.t=0;runElapsed=50;dist=6000;seenHints.slide=1;seenHints.cargo=1;
  var old=pick;
  if(roll!==undefined)pick=function(a){return a.length===3&&a[0]==='shield'?a[roll]:old(a);};
  var ok=fireEvent();genEvent.next=Infinity;pick=old;EVENTS=all;return ok;
 },
 eventStep:updateEvent,
 render:render,
 drawCameo:drawEventCameo,
 collect:collectRice,
 shatter:shatter,
 tick:function(n){for(var i=0;i<n;i++)update(1/120);},
 preview:function(seg){camX=seg.start-PLAYER_X-160;updateHud();updateContentHud();render();},
 zoneClear:clearDistrictMods,
 build:function(){
  obstacles.length=0;pickups.length=0;platforms.length=0;trackGaps.length=0;powerups.length=0;actionBlocks.length=0;patternSegments.length=0;runways.length=0;generatedSegments.length=0;
  gen.x=Math.max(camX+PLAYER_X+1150,pendingChunkEvents[0]?pendingChunkEvents[0].earliest:0);restStreak=0;extendLevel();
  return generatedSegments[0];
 },
 blocks:function(){return actionBlocks;},
 runCargo:function(){
  var b=actionBlocks.filter(function(b){return b.eventId==='brain-reboot';})[0],cargo=b.entities[0];
  camX=cargo.x-PLAYER_X-160;player.y=GROUND_Y;player.onGround=true;player.invuln=0;genEvent.next=Infinity;
  tryDash();var frames=0;while(!b.done&&frames<1000&&game.state==='playing'){update(1/120);frames++;}
  return {done:b.done,failed:b.failed,opened:!!cargo.lootDropped,frames:frames,results:eventResults.slice(),lives:game.lives};
 },
 runChallenge:function(down){
  var b=actionBlocks.filter(function(b){return b.successRice;})[0];
  camX=b.start-PLAYER_X-180;player.y=GROUND_Y;player.onGround=true;player.invuln=0;player.shield=!down;
  genEvent.next=Infinity;keys.ArrowDown=down;var frames=0;
  while(!b.done&&frames<1200&&game.state==='playing'){update(1/120);frames++;}
  keys.ArrowDown=false;return {done:b.done,failed:b.failed,frames:frames,results:eventResults.slice(),lives:game.lives,shield:player.shield};
 },
 prices:function(){return sale.ids.map(function(id){var skill=SHOP_SKILLS.filter(function(s){return s.id===id;})[0];return {actual:shopCost(skill),expected:Math.ceil(skill.costs[skillLevels[id]||0]*.6)};});},
 exit:function(b){camX=b.end-PLAYER_X+1;updateActionBlocks();},
 damage:damage,obstacle:addObstacle,
 quiet:function(){obstacles.length=0;platforms.length=0;trackGaps.length=0;pickups.length=0;game.shake=0;},
 shop:toggleShop,
 price:function(id){return shopCost(SHOP_SKILLS.filter(function(s){return s.id===id;})[0]);},
 assets:function(){return Object.keys(IMG).filter(function(k){return k.indexOf('event/')===0;});}
};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:EDGE}),errors=[],missing=[],report={};
 try{
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
  await page.route('**/src/game.js*',async route=>{const res=await route.fetch();let code=(await res.text()).replace('  window.DSGame = {',hook+'\n  window.DSGame = {');await route.fulfill({response:res,body:code});});
  await page.addInitScript(()=>{
   let seed=61451;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   window.__raf=[];window.__now=100;requestAnimationFrame=cb=>{__raf.push(cb);return __raf.length;};
   window.__step=n=>{for(let i=0;i<n;i++){__now+=1000/120;const q=__raf.splice(0);q.forEach(cb=>cb(__now));}};
  });
  await page.goto(URL);
  await page.waitForFunction(()=>window.__eventTest&&document.querySelector('#loading.hide'),null,{timeout:60000});
  report.assets=await page.evaluate(()=>__eventTest.assets());assert.equal(report.assets.length,11);
  report.cameo=await page.evaluate(()=>{
   __eventTest.reset();__eventTest.quiet();__eventTest.force('quota-feast');__eventTest.eventStep(1.2);__eventTest.drawCameo();
   const first=DSGame.events().active.cameoCenter;
   DSGame.world().platforms.push({x:DSGame.world().camX+first-120,y:158,w:240,h:210});
   const centers=[];for(let i=0;i<10;i++){__eventTest.drawCameo();centers.push(DSGame.events().active.cameoCenter);}
   return {first,centers};
  });
  assert.ok(Number.isFinite(report.cameo.first));assert.ok(report.cameo.centers.every(x=>x===report.cameo.first),'Cameo location must remain fixed when scenery enters its slot');

  report.presentation=await page.evaluate(()=>{
   const ids=['quota-feast','outage-refund','rollback-feast','permission-nesting','flash-restock','multimodal-box','quota-spill','brain-reboot','economy-route','proxy-parcels','chip-reclaim'];
   const stages=['supply_dock','repair_dock','scanner_gate','market_stall'].map(id=>({id,loaded:performance.getEntriesByType('resource').some(r=>r.name.includes('/assets/stage/'+id+'.png'))}));
   const scenes=ids.map(id=>{
    __eventTest.reset();__eventTest.quiet();__eventTest.force(id);__eventTest.eventStep(.2);__eventTest.render();
    const active=DSGame.events().active,center=active.cameoCenter,phases=[active.scenePhase];
    // Every slot is now crossed by foreground objects; the selected stage must stay put.
    DSGame.world().platforms.push({x:DSGame.world().camX+center-180,y:150,w:360,h:220});
    __eventTest.eventStep(.8);__eventTest.render();phases.push(active.scenePhase);
    const stable=active.cameoCenter===center;
    __eventTest.eventStep(2.3);__eventTest.render();phases.push(active.scenePhase);
    return {id,scene:active.scene,line:active.sceneLine,center,stable,phases};
   });
   __eventTest.reset();__eventTest.force('quota-spill');const seg=__eventTest.build();__eventTest.eventStep(1.2);__eventTest.preview(seg);
   return {stages,scenes,crowdedSlotVisible:Number.isFinite(DSGame.events().active.cameoCenter)};
  });
  assert.ok(report.presentation.stages.every(s=>s.loaded));
  assert.ok(report.presentation.crowdedSlotVisible);
  for(const s of report.presentation.scenes){assert.ok(s.scene&&s.line&&s.stable&&Number.isFinite(s.center));assert.deepEqual(s.phases,['arrival','action','departure']);}

  report.rice=await page.evaluate(()=>{
   const out=[];
   for(const [id,shield,n] of [['quota-feast',false,24],['outage-refund',false,12],['outage-refund',true,16]]){
    __eventTest.reset();DSGame.player().shield=shield;const before=DSGame.state().rice;
    const fired=__eventTest.force(id);const queued=DSGame.world().pendingChunkEvents[0].count;
    const seg=__eventTest.build();out.push({id,fired,queued,expected:n,count:seg.pickups.length,shield:DSGame.player().shield,walletUnchanged:DSGame.state().rice===before,hazards:seg.obstacles.length+seg.gaps.length+seg.platforms.length});
   }return out;
  });
  for(const r of report.rice){assert.ok(r.fired&&r.walletUnchanged);assert.equal(r.queued,r.expected);assert.equal(r.count,r.expected);assert.equal(r.hazards,0);if(r.id==='outage-refund')assert.ok(r.shield);}
  report.rollback=await page.evaluate(()=>{
   __eventTest.reset();__eventTest.quiet();const w=DSGame.world(),x=w.camX+300;
   const behind=__eventTest.obstacle('patrol',x-100),ahead=__eventTest.obstacle('patrol',x+200),unseen=__eventTest.obstacle('patrol',w.camX+2000);
   w.gaps.push({x:x+500,w:200});w.platforms.push({x:x+500,y:380,w:250,h:24});
   __eventTest.force('rollback-feast');
   const result={behindAlive:!behind.dead,aheadDead:!!ahead.dead,unseenAlive:!unseen.dead,gaps:w.gaps.length,platforms:w.platforms.length,rice:w.pickups.filter(p=>p.kind==='bigrice').length};
   __eventTest.reset();__eventTest.quiet();__eventTest.force('rollback-feast');result.fallback=DSGame.world().pendingChunkEvents[0].count;return result;
  });
  assert.deepEqual(report.rollback,{behindAlive:true,aheadDead:true,unseenAlive:true,gaps:1,platforms:1,rice:1,fallback:6});
  report.challenge=await page.evaluate(()=>{
   const out=[];
   for(const failed of [false,true]){
    __eventTest.reset();__eventTest.force('permission-nesting');
    const seg=__eventTest.build(),b=__eventTest.blocks().find(b=>b.successRice);
    const before=DSGame.world().pendingChunkEvents.length;__eventTest.eventStep(4);
    const expired=DSGame.events().active===null,afterExpiry=DSGame.world().pendingChunkEvents.length;
    if(failed){DSGame.player().shield=true;DSGame.player().invuln=0;__eventTest.damage(b.entities[0]);}
    __eventTest.exit(b);__eventTest.exit(b);
    out.push({failed,count:seg.obstacles.length,before,afterExpiry,expired,results:DSGame.events().results,queued:DSGame.world().pendingChunkEvents.map(p=>p.count||0)});
   }return out;
  });
  for(const r of report.challenge){assert.equal(r.count,2);assert.ok(r.expired);assert.equal(r.before,r.afterExpiry);assert.equal(r.results.length,1);assert.equal(r.results[0].success,!r.failed);assert.deepEqual(r.queued,r.failed?[]:[8]);}
  report.challengeRun=await page.evaluate(()=>{
   const out=[];for(const down of [true,false]){__eventTest.reset();__eventTest.force('permission-nesting');__eventTest.build();out.push({slide:down,...__eventTest.runChallenge(down)});}return out;
  });
  assert.ok(report.challengeRun[0].done&&!report.challengeRun[0].failed);assert.equal(report.challengeRun[0].results[0].rice,8);
  assert.ok(report.challengeRun[1].done&&report.challengeRun[1].failed);assert.equal(report.challengeRun[1].results[0].rice,0);
  report.lottery=await page.evaluate(()=>{
   const out=[];
   for(const roll of [0,1,2]){
    __eventTest.reset();__eventTest.force('multimodal-box',roll);const p=DSGame.player();
    const initial=!p.shield&&p.power.magnet===0&&p.power.chip===0;
    DSGame.state().state='paused';__step(240);const unrevealed=!DSGame.events().active.lottery.applied;
    DSGame.state().state='playing';__eventTest.eventStep(.71);
    const after={shield:p.shield,magnet:p.power.magnet,chip:p.power.chip},kind=DSGame.events().active.lottery.kind;
    if(kind!=='shield')p.power[kind]=1;__eventTest.eventStep(.2);
    out.push({roll,initial,unrevealed,after,kind,once:kind==='shield'?p.shield:p.power[kind]===1});
   }
   __eventTest.reset();DSGame.player().shield=true;__eventTest.force('multimodal-box',0);__eventTest.eventStep(.71);
   out.push({existingShield:true,shield:DSGame.player().shield,magnet:DSGame.player().power.magnet});
   __eventTest.reset();DSGame.player().power.chip=7;__eventTest.force('multimodal-box',2);__eventTest.zoneClear();out.push({zonePreserved:DSGame.player().power.chip===7});
   __eventTest.reset();__eventTest.force('multimodal-box',2);__eventTest.reset();__eventTest.eventStep(1);out.push({newRunReset:DSGame.player().power.chip===0&&DSGame.events().history.length===0});
   return out;
  });
  report.lottery.slice(0,3).forEach(r=>assert.ok(r.initial&&r.unrevealed&&r.once));
  assert.deepEqual(report.lottery[0].after,{shield:true,magnet:0,chip:0});assert.equal(report.lottery[1].after.magnet,6);assert.equal(report.lottery[2].after.chip,4);
  assert.ok(report.lottery[3].shield);assert.equal(report.lottery[3].magnet,6);assert.ok(report.lottery[4].zonePreserved&&report.lottery[5].newRunReset);
  report.shop=await page.evaluate(()=>{
   __eventTest.reset();const fired=__eventTest.force('flash-restock'),before=DSGame.events().sale;
   const stayedPlaying=DSGame.state().state==='playing',prices=__eventTest.prices();__eventTest.shop();__step(240);
   const frozen=DSGame.events().sale.time===before.time;__eventTest.shop();return {fired,stayedPlaying,prices,discounts:before.ids.length,time:before.time,frozen,resumed:DSGame.state().state==='playing'};
  });
  assert.ok(report.shop.fired&&report.shop.stayedPlaying&&report.shop.frozen&&report.shop.resumed);assert.ok(report.shop.discounts>=2&&report.shop.discounts<=3);assert.equal(report.shop.time,12);report.shop.prices.forEach(p=>assert.equal(p.actual,p.expected));
  report.originalPlan=await page.evaluate(()=>{
   const out={};
   __eventTest.reset();const leakFired=__eventTest.force('quota-spill'),leak=__eventTest.build();
   const pending=leak.pickups.filter(p=>p.leakPending).length,before=leak.pickups.map(p=>p.y);
   __eventTest.tick(30);out.leak={fired:leakFired,count:leak.pickups.length,pending,moving:leak.pickups.some((p,i)=>p.y!==before[i]),hazards:leak.obstacles.length+leak.gaps.length};
   __eventTest.reset();const rebootFired=__eventTest.force('brain-reboot');__eventTest.build();out.reboot={fired:rebootFired,...__eventTest.runCargo()};
   __eventTest.reset();__eventTest.force('brain-reboot');__eventTest.build();const unopened=__eventTest.blocks().find(b=>b.eventId==='brain-reboot');__eventTest.exit(unopened);out.unopened=DSGame.events().results[0];
   __eventTest.reset();__eventTest.force('economy-route');const economy=__eventTest.build();
   out.economy={platforms:economy.platforms.length,groundRice:economy.pickups.filter(p=>p.kind==='rice').length,bigRice:economy.pickups.filter(p=>p.kind==='bigrice').length,obstacles:economy.obstacles.length,gaps:economy.gaps.length};
   __eventTest.reset();__eventTest.force('proxy-parcels');const parcels=__eventTest.build();
   let money=DSGame.state().rice,health=DSGame.state().lives,combo=DSGame.state().combo;
   const empty=parcels.pickups.filter(p=>p.emptyParcel),real=parcels.pickups.find(p=>p.parcel&&!p.emptyParcel);
   empty.forEach(p=>__eventTest.collect(p));const harmless=DSGame.state().rice===money&&DSGame.state().lives===health&&DSGame.state().combo===combo;
   __eventTest.collect(real);const gained=DSGame.state().rice-money;money=DSGame.state().rice;__eventTest.collect(real);
   out.parcels={empty:empty.length,real:!!real,harmless,gained,once:DSGame.state().rice===money};
   __eventTest.reset();__eventTest.force('chip-reclaim');const fragments=__eventTest.build();__eventTest.eventStep(4);
   fragments.pickups.forEach(p=>__eventTest.collect(p));const power=DSGame.player().power.chip;DSGame.player().power.chip=1;__eventTest.collect(fragments.pickups[0]);
   out.chip={count:fragments.pickups.length,power,once:DSGame.player().power.chip===1,results:DSGame.events().results};
   __eventTest.reset();__eventTest.force('chip-reclaim');const missed=__eventTest.build();__eventTest.collect(missed.pickups[0]);__eventTest.exit(__eventTest.blocks().find(b=>b.quest));
   out.missed={power:DSGame.player().power.chip,result:DSGame.events().results[0],lives:DSGame.state().lives};
   return out;
  });
  assert.ok(report.originalPlan.leak.fired&&report.originalPlan.leak.moving);assert.equal(report.originalPlan.leak.count,12);assert.equal(report.originalPlan.leak.pending,12);assert.equal(report.originalPlan.leak.hazards,0);
  assert.ok(report.originalPlan.reboot.fired&&report.originalPlan.reboot.done&&report.originalPlan.reboot.opened&&!report.originalPlan.reboot.failed);assert.equal(report.originalPlan.reboot.results[0].rice,8);assert.equal(report.originalPlan.unopened.rice,0);
  assert.deepEqual(report.originalPlan.economy,{platforms:2,groundRice:6,bigRice:3,obstacles:0,gaps:0});
  assert.ok(report.originalPlan.parcels.harmless&&report.originalPlan.parcels.once&&report.originalPlan.parcels.gained>0);assert.equal(report.originalPlan.parcels.empty,2);
  assert.equal(report.originalPlan.chip.power,4);assert.ok(report.originalPlan.chip.once);assert.equal(report.originalPlan.chip.results.length,1);
  assert.equal(report.originalPlan.missed.power,0);assert.equal(report.originalPlan.missed.result.success,false);assert.equal(report.originalPlan.missed.lives,3);
  for(const id of ['quota-spill','brain-reboot','economy-route','proxy-parcels','chip-reclaim']){
   await page.evaluate(id=>{__eventTest.reset();__eventTest.force(id);const segment=__eventTest.build();__eventTest.eventStep(1.2);__eventTest.preview(segment);},id);
   await page.screenshot({path:'docs/event-'+id+'.png'});
  }
  report.screens=[];
  for(const [label,width,height] of [['desktop',1280,720],['mobile',844,390]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{__eventTest.reset();__eventTest.quiet();__eventTest.force('quota-feast');__eventTest.eventStep(1.2);__eventTest.render();});
   const bounds=await page.locator('#eventBanner').boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1);
   await page.screenshot({path:'docs/character-events-'+label+'.png'});
   report.screens.push({label,width,height,banner:bounds});
  }
  // Each dedicated character must render, not just load.
  await page.setViewportSize({width:1280,height:720});
  for(const id of ['quota-feast','outage-refund','rollback-feast','permission-nesting','flash-restock','multimodal-box']){
   await page.evaluate(id=>{__eventTest.reset();__eventTest.quiet();__eventTest.force(id);__eventTest.eventStep(.8);__eventTest.render();},id);
   await page.screenshot({path:'docs/event-'+id+'.png'});
  }
  const mobileContext=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const mobile=await mobileContext.newPage();
  mobile.on('pageerror',e=>errors.push(String(e)));
  await mobile.route('**/src/game.js*',async route=>{const res=await route.fetch();await route.fulfill({response:res,body:(await res.text()).replace('  window.DSGame = {',hook+'\n  window.DSGame = {')});});
  await mobile.addInitScript(()=>{window.__raf=[];window.__now=100;requestAnimationFrame=cb=>{__raf.push(cb);return __raf.length;};window.__step=n=>{for(let i=0;i<n;i++){__now+=1000/120;__raf.splice(0).forEach(cb=>cb(__now));}};});
  await mobile.goto(URL);await mobile.waitForFunction(()=>window.__eventTest&&document.querySelector('#loading.hide'),null,{timeout:60000});
  await mobile.evaluate(()=>{__eventTest.reset();__eventTest.quiet();__eventTest.force('quota-feast');__eventTest.eventStep(1.2);__step(2);__eventTest.render();});
  report.mobile=await mobile.evaluate(()=>{
   const b=document.querySelector('#eventBanner').getBoundingClientRect(),pads=[...document.querySelectorAll('#pad button')].map(p=>p.getBoundingClientRect());
   return {touch:matchMedia('(pointer:coarse)').matches,padVisible:!document.querySelector('#pad').classList.contains('hide'),bannerInside:b.x>=0&&b.right<=innerWidth,bannerAboveControls:pads.every(p=>b.bottom<p.top)};
  });
  assert.ok(report.mobile.touch&&report.mobile.padVisible&&report.mobile.bannerInside&&report.mobile.bannerAboveControls);
  await mobile.screenshot({path:'docs/character-events-mobile.png'});await mobileContext.close();
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  const fallback=await context.newPage();await fallback.route('**/assets/event/*.png*',r=>r.fulfill({status:404,body:''}));
  await fallback.goto(URL);await fallback.waitForFunction(()=>DSGame&&document.querySelector('#loading.hide'),null,{timeout:60000});await fallback.locator('#btnStart').dispatchEvent('click');
  report.missingArtFallback=await fallback.evaluate(()=>DSGame.state().state==='playing');assert.ok(report.missingArtFallback);
  report.errors=errors;report.missing=missing;
  fs.writeFileSync('docs/character-events-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
