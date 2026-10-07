/* Shop upgrades must expand a finite dash wallet, never refill it each frame. */
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),results=[];
 try{
  const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  await page.addInitScript(()=>{let seed=9813;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};window.__raf=[];window.__now=100;requestAnimationFrame=f=>{__raf.push(f);return __raf.length;};window.__step=n=>{for(let i=0;i<n;i++){const w=DSGame.world();['obstacles','gaps','platforms','pickups','powerups'].forEach(k=>w[k].length=0);__now+=1000/120;__raf.splice(0).forEach(f=>f(__now));}};});
  await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});
  const state=()=>page.evaluate(()=>{const p=DSGame.player();return {charges:p.charges,cooldown:p.dashCd,dashing:p.dashT,pips:document.querySelector('#dashPips').children.length,rice:DSGame.state().rice};});
  const step=n=>page.evaluate(n=>__step(n),n);
  async function fresh(){await page.evaluate(()=>{DSGame.practice('prefab-hop-duet@520#0');DSGame.state().rice=10000;});await step(2);}
  async function shop(){await page.keyboard.press('KeyB');}
  async function buy(id){await page.locator('[data-skill="'+id+'"]').dispatchEvent('click');}
  async function dash(touch=false){if(touch)await page.locator('#padDash').tap();else await page.keyboard.press('ShiftLeft');}
  async function check(name,fn){await fresh();try{await fn();results.push({name,passed:true,state:await state()});}catch(e){results.push({name,passed:false,error:e.message,state:await state()});}}
  await check('level one gives exactly two bursts, then cooldown',async()=>{
   await shop();await buy('dash');assert.equal((await state()).charges,2);await shop();
   await dash();await step(50);assert.equal((await state()).charges,1,'a spent charge must stay spent between bursts');
   await dash();assert.equal((await state()).charges,0);assert.ok((await state()).cooldown>2.5);
   await step(50);for(let i=0;i<5;i++){await dash();await step(8);}assert.equal((await state()).charges,0);assert.equal((await state()).dashing,0);
   const cd=(await state()).cooldown;await step(Math.ceil(cd*120)+2);assert.equal((await state()).charges,2);
  });
  if(!process.argv.includes('--repro')){
   await check('unrelated purchases and reopening shop do not refill spent charges',async()=>{
    await shop();await buy('dash');await shop();await dash();await step(50);await shop();await buy('jump');assert.equal((await state()).charges,1);
    for(let i=0;i<4;i++){await shop();await step(2);await shop();}assert.equal((await state()).charges,1);
   });
   await check('an upgrade grants only newly added capacity',async()=>{
    await shop();await buy('dash');await shop();await dash();await step(50);await shop();await buy('dash');assert.equal((await state()).pips,3);assert.equal((await state()).charges,2);
   });
   await check('upgrading during cooldown does not cancel or reset cooldown',async()=>{
    await shop();await buy('dash');await shop();for(let i=0;i<2;i++){await dash();await step(50);}const before=await state();await shop();await buy('dash');
    assert.equal((await state()).charges,0);assert.equal((await state()).cooldown,before.cooldown);assert.equal((await state()).pips,3);await step(120);assert.equal((await state()).cooldown,before.cooldown);
    await shop();await step(Math.ceil(before.cooldown*120)+2);assert.equal((await state()).charges,3);
   });
   await check('max level gives four bursts with mobile dash taps',async()=>{
    await shop();for(let i=0;i<3;i++)await buy('dash');assert.equal((await state()).pips,4);assert.ok(await page.locator('[data-skill="dash"]').isDisabled());await shop();await step(2);
    for(let i=0;i<4;i++){await dash(true);assert.equal((await state()).charges,3-i);await step(50);}await dash(true);assert.equal((await state()).charges,0);assert.equal((await state()).dashing,0);
   });
   await check('fresh run resets upgraded capacity to one',async()=>{
    await shop();for(let i=0;i<3;i++)await buy('dash');await fresh();assert.equal((await state()).charges,1);assert.equal((await state()).pips,1);await dash();await step(50);assert.equal((await state()).charges,0);assert.ok((await state()).cooldown>0);
   });
  }
 }finally{await browser.close();}
 fs.writeFileSync('docs/dash-charges-verification.json',JSON.stringify({results,method:'Real game shop buttons, keyboard and touch inputs, 120Hz; currency and empty track fixtures isolate charge accounting.'},null,2));console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.passed),'Dash wallet regression failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
