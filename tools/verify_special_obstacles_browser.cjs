const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],warnings=[],missing=[],report={cases:[]};
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.addInitScript(()=>{let seed=61451;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};window.__q=[];window.__now=100;requestAnimationFrame=cb=>{__q.push(cb);return __q.length;};window.__step=n=>{for(let i=0;i<n;i++){__now+=50;__q.splice(0).forEach(cb=>cb(__now));}};});
 async function start(){await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});await page.locator('#btnStart').dispatchEvent('click');}
 async function fixture(kind,lead,mode='hop',append=false){
  await page.evaluate(async({kind,lead,mode,append})=>{
   const w=DSGame.world(),m=(await(await fetch('assets/manifest.json')).json()).obstacle[kind],img=new Image();img.src='assets/obstacle/new/'+kind+'.png';await img.decode();
   if(!append){w.obstacles.length=0;w.gaps.length=0;w.platforms.length=0;w.pickups.length=0;w.powerups.length=0;}
   const x=w.camX+300+lead,y=600-m.h,o={testFixture:true,kind,cfg:m.box,img,w:m.w,h:m.h,x,y,bob:0,motion:0,phase:0,box:{x:x+m.box.x,y:y+m.box.y,w:m.box.w,h:m.box.h},nearMiss:false};
   DSObstacleSpecials.init(o,{mode});w.obstacles.push(o);window.__fixture=o;window.__lootMax=0;
  },{kind,lead,mode,append});
 }
 async function step(n){for(let i=0;i<n;i++)await page.evaluate(()=>{
  const w=DSGame.world();w.gaps.length=0;w.platforms.length=0;w.powerups.length=0;
  for(let j=w.obstacles.length-1;j>=0;j--)if(!w.obstacles[j].testFixture)w.obstacles.splice(j,1);
  __step(1);window.__lootMax=Math.max(__lootMax||0,w.pickups.filter(p=>p.spill).length);
 });}
 async function result(name){const s=await page.evaluate(()=>({lives:DSGame.state().lives,rice:DSGame.state().rice,clear:DSGame.performance().clears,styles:DSGame.experience().styles,dead:!!__fixture.dead,bounced:!!__fixture.springUsed,dropped:!!__fixture.lootDropped,lootMax:__lootMax,hit:DSGame.lastHit()}));report.cases.push({name,...s});return s;}
 await start();await fixture('cargo',75);await page.keyboard.press('Shift');await step(13);
 let s=await result('cargo-dash');assert.equal(s.lives,3);assert.equal(s.dead,true);assert.equal(s.dropped,true);assert.equal(s.lootMax,6);assert.equal(s.clear,1);assert.ok(s.rice>1);
 await start();await fixture('cargo',90);await page.keyboard.down('ArrowUp');await step(10);await page.keyboard.up('ArrowUp');await step(16);
 s=await result('cargo-jump');assert.equal(s.lives,3);assert.equal(s.dropped,false);assert.equal(s.clear,1);
 await start();await fixture('cargo',200);await page.keyboard.down('ArrowUp');await step(8);await page.keyboard.up('ArrowUp');while(await page.evaluate(()=>DSGame.player().vy<=0))await step(1);await page.keyboard.down('ArrowDown');await step(14);await page.keyboard.up('ArrowDown');
 s=await result('cargo-stomp');assert.equal(s.lives,3);assert.equal(s.dropped,true);assert.equal(s.styles.stomp,true);
 await start();await fixture('spring',240);await page.keyboard.down('ArrowUp');await step(12);await page.keyboard.up('ArrowUp');await step(8);
 s=await result('spring-top');assert.equal(s.lives,3);assert.equal(s.bounced,true);assert.equal(s.styles.bounce,true);assert.equal(s.clear,1);
 const flight=await page.evaluate(()=>({foot:DSGame.player().y,vy:DSGame.player().vy,jumps:DSGame.player().jumps}));assert.ok(flight.vy<0);assert.equal(flight.jumps,1);report.springFlight=flight;
 await step(25);assert.equal(await page.evaluate(()=>DSGame.performance().clears),1);
 await start();await fixture('spring',65);await step(14);
 s=await result('spring-side');assert.equal(s.lives,2);assert.equal(s.bounced,false);assert.equal(s.clear,0);
 for(const mode of ['hop','slide']){
  await start();await fixture('buoy',1200,mode);await step(10);assert.equal(await page.evaluate(()=>__fixture.locked),true);
  const lift=await page.evaluate(()=>__fixture.lift);
  await page.keyboard.press('p');await step(30);assert.equal(await page.evaluate(()=>__fixture.lift),lift);await page.keyboard.press('p');
  while(await page.evaluate(()=>__fixture.x-DSGame.world().camX-300)>(mode==='slide'?160:85))await step(1);
  await page.keyboard.down(mode==='slide'?'ArrowDown':'ArrowUp');await step(mode==='slide'?25:10);await page.keyboard.up(mode==='slide'?'ArrowDown':'ArrowUp');if(mode==='hop')await step(16);
  s=await result('buoy-'+mode);assert.equal(s.lives,3);assert.equal(s.clear,1);assert.equal(s.styles[mode==='slide'?'slide':'jump'],true);
 }
 await start();await fixture('buoy',1200,'slide');while(await page.evaluate(()=>__fixture.x-DSGame.world().camX-300)>70)await step(1);await step(12);
 s=await result('buoy-standing-hit');assert.equal(s.lives,2);assert.equal(s.clear,0);
 // Render the actual game, with the new assets and existing pickups in one frame.
 await start();await fixture('cargo',470);await fixture('spring',720,'hop',true);await fixture('buoy',1000,'slide',true);await step(8);
 await page.keyboard.down('ArrowUp');await step(4);await page.keyboard.up('ArrowUp');
 await page.screenshot({path:'docs/special-obstacles-city.png',animations:'disabled'});
 // Reach the sunset chapter with the real clock; no direct scene or speed override.
 await start();
 while(await page.evaluate(()=>DSGame.world().runElapsed)<370){
  await page.evaluate(()=>{
   const w=DSGame.world();DSGame.state().lives=3;DSGame.player().invuln=999;
   w.obstacles.length=0;w.gaps.length=0;w.platforms.length=0;w.pickups.length=0;w.powerups.length=0;__step(100);
  });
 }
 assert.equal(await page.evaluate(()=>DSGame.world().zone),5);
 async function ready(){await page.evaluate(()=>{
   const p=DSGame.player();p.invuln=0;p.y=600;p.vy=0;p.onGround=true;p.groundY=600;
   p.jumps=0;p.buffer=0;p.coyote=0;p.sliding=false;p.stompArm=false;p.dashT=0;p.dashCd=0;p.dashGrace=0;p.charges=1;
   p.power.chip=0;p.power.magnet=0;p.power.overclock=0;p.shield=false;DSGame.state().lives=3;
  });}
 report.sunsetSpeed=await page.evaluate(()=>DSGame.world().speed);assert.ok(report.sunsetSpeed>600);
 await ready();await fixture('cargo',100);await page.keyboard.press('Shift');await step(13);
 s=await result('sunset-cargo-dash');assert.equal(s.lives,3);assert.equal(s.dropped,true);
 await ready();let k=await page.evaluate(()=>Math.sqrt(DSGame.world().speed/320));await fixture('spring',240*k);
 await page.keyboard.down('ArrowUp');await step(8);await page.keyboard.up('ArrowUp');await step(7);
 s=await result('sunset-spring-top');assert.equal(s.lives,3);assert.equal(s.bounced,true);
 await step(26);
 for(const mode of ['hop','slide']){
  await ready();await fixture('buoy',1200,mode);await step(8);assert.equal(await page.evaluate(()=>__fixture.locked),true);
  k=await page.evaluate(()=>Math.sqrt(DSGame.world().speed/320));
  while(await page.evaluate(()=>__fixture.x-DSGame.world().camX-300)>(mode==='slide'?190:85*k))await step(1);
  await page.keyboard.down(mode==='slide'?'ArrowDown':'ArrowUp');await step(mode==='slide'?20:8);await page.keyboard.up(mode==='slide'?'ArrowDown':'ArrowUp');if(mode==='hop')await step(15);
  s=await result('sunset-buoy-'+mode);assert.equal(s.lives,3);
 }
 await ready();await fixture('cargo',580);await fixture('spring',830,'hop',true);await fixture('buoy',1200,'slide',true);
 await step(8);await page.keyboard.down('ArrowUp');await step(4);await page.keyboard.up('ArrowUp');
 await page.screenshot({path:'docs/special-obstacles-sunset.png',animations:'disabled'});
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(missing,[]);
 report.errors=errors;report.warnings=warnings;report.missing=missing;report.pauseFreezesBuoy=true;
 fs.writeFileSync('docs/special-obstacles-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
