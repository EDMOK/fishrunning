const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav'};
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],results=[],layout=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.__frames=[];window.__now=100;requestAnimationFrame=cb=>{__frames.push(cb);return __frames.length;};window.__step=()=>{__now+=1000/60;__frames.splice(0).forEach(cb=>cb(__now));};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100});
  await page.addStyleTag({content:'#pad button{transition:none!important}'});
  const cdp=await context.newCDPSession(page);
  const controls={};
  // Deterministic frames let presses and releases fall between physics ticks.
  async function step(n=1){for(let i=0;i<n;i++)await page.evaluate(()=>{const w=DSGame.world();['obstacles','gaps','platforms','pickups','powerups'].forEach(k=>w[k].length=0);DSGame.player().invuln=999;__step();});}
  async function fresh(){await page.evaluate(()=>document.getElementById('btnAgain').click());await step(2);Object.assign(controls,await page.evaluate(()=>Object.fromEntries(['padJump','padSlide','padDash'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x+r.width/2,y:r.y+r.height/2}];}))));}
  async function touch(type,points=[]){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({id:p.id||1,x:p.x,y:p.y,radiusX:5,radiusY:5,force:1}))});}
  async function tap(id){await touch('touchStart',[controls[id]]);await touch('touchEnd');}
  async function check(name,fn){try{await fresh();await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message,detail:await page.evaluate(()=>({player:DSGame.player(),held:Array.from(document.querySelectorAll('#pad button')).map(el=>({id:el.id,held:el.classList.contains('held'),pointer:el._padPointer}))}))});await touch('touchCancel').catch(()=>{});}}
  await check('quick slide between frames',async()=>{await tap('padSlide');await step();assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);await step(10);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);await step(15);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('repeated slide taps renew minimum duration',async()=>{await tap('padSlide');await step(16);await tap('padSlide');await step(8);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);await step(20);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('slide is active in the landing frame',async()=>{await page.evaluate(()=>{const p=DSGame.player();p.onGround=false;p.y=599;p.vy=150;p.jumps=2;});await tap('padSlide');await step();assert.equal(await page.evaluate(()=>DSGame.player().onGround),true);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);});
  await check('jump starts on press',async()=>{await touch('touchStart',[controls.padJump]);await step();assert.equal(await page.evaluate(()=>DSGame.player().jumps),1);await touch('touchEnd');});
  await check('two jump taps between frames',async()=>{await tap('padJump');await tap('padJump');await step(2);assert.equal(await page.evaluate(()=>DSGame.player().jumps),2);});
  await check('hold slide then jump with second finger',async()=>{const left={...controls.padSlide,id:1},right={...controls.padJump,id:2};await touch('touchStart',[left]);await step();await touch('touchStart',[left,right]);await step();assert.equal(await page.evaluate(()=>DSGame.player().jumps),1,'Second finger must jump');await touch('touchEnd',[right]);await step(60);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true,'Left finger must stay held after releasing right');await touch('touchEnd');await step(25);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('jump capture survives finger moving outside',async()=>{await touch('touchStart',[controls.padJump]);await step();await touch('touchMove',[{x:422,y:190}]);await step(28);assert.equal(await page.evaluate(()=>DSGame.player().gliding),true);await touch('touchEnd');await step();assert.equal(await page.evaluate(()=>DSGame.player().gliding),false);});
  await check('cancel releases held slide',async()=>{await touch('touchStart',[controls.padSlide]);await step();await touch('touchCancel');await step(25);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);assert.equal(await page.locator('#padSlide').evaluate(el=>el.classList.contains('held')),false);});
  await check('pause discards queued jump and slide',async()=>{await tap('padJump');await tap('padSlide');await page.keyboard.press('p');await page.keyboard.press('p');await step();assert.equal(await page.evaluate(()=>DSGame.player().onGround),true);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('capture failure does not drop synthetic presses',async()=>{await page.evaluate(()=>{document.getElementById('padSlide').setPointerCapture=()=>{throw new DOMException('No active pointer','NotFoundError');};});await page.locator('#padSlide').dispatchEvent('pointerdown',{pointerId:42,pointerType:'touch',button:0,bubbles:true});await page.locator('#padSlide').dispatchEvent('pointerup',{pointerId:42,pointerType:'touch',button:0,bubbles:true});await step();assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);});
  await check('keyboard quick slide uses same press buffer',async()=>{await page.keyboard.press('ArrowDown');await step();assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);});
  await check('jump first then second finger slides on landing',async()=>{const left={...controls.padSlide,id:2},right={...controls.padJump,id:1};await touch('touchStart',[right]);await step();await touch('touchStart',[right,left]);await step();await touch('touchEnd',[right]);await step(60);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);await touch('touchEnd');});
  await check('left swipe slides without queuing a jump',async()=>{await touch('touchStart',[{x:270,y:210}]);await touch('touchMove',[{x:270,y:260}]);await touch('touchEnd');await step();assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);assert.equal(await page.evaluate(()=>DSGame.player().jumps),0);await step(40);await tap('padJump');await step();assert.equal(await page.evaluate(()=>DSGame.player().jumps),1);});
  await check('swipe expiry cannot release keyboard slide',async()=>{await page.keyboard.down('ArrowDown');await touch('touchStart',[{x:270,y:210}]);await touch('touchMove',[{x:270,y:260}]);await touch('touchEnd');await step(45);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);await page.keyboard.up('ArrowDown');await step(25);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('shop discards queued input',async()=>{await tap('padJump');await tap('padSlide');await page.keyboard.press('b');assert.equal(await page.evaluate(()=>DSGame.state().state),'shop');await page.keyboard.press('b');await step();assert.equal(await page.evaluate(()=>DSGame.player().onGround),true);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('blur pauses and clears fingers',async()=>{await touch('touchStart',[controls.padSlide]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.evaluate(()=>DSGame.state().state),'paused');await touch('touchEnd');await page.keyboard.press('p');await step(25);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('lost capture releases the button',async()=>{await page.locator('#padJump').dispatchEvent('pointerdown',{pointerId:43,pointerType:'touch',button:0,bubbles:true});await step();await page.locator('#padJump').dispatchEvent('lostpointercapture',{pointerId:43,pointerType:'touch',bubbles:true});await step(40);assert.equal(await page.evaluate(()=>DSGame.player().gliding),false);assert.equal(await page.locator('#padJump').evaluate(el=>el.classList.contains('held')),false);});
  await check('releasing pad preserves keyboard glide hold',async()=>{await page.keyboard.down('ArrowUp');await touch('touchStart',[controls.padJump]);await step();await step(35);assert.equal(await page.evaluate(()=>DSGame.player().gliding),true);await touch('touchEnd');await step();assert.equal(await page.evaluate(()=>DSGame.player().gliding),true);await page.keyboard.up('ArrowUp');await step();assert.equal(await page.evaluate(()=>DSGame.player().gliding),false);});
  await check('restart discards both pending jumps',async()=>{await tap('padJump');await tap('padJump');await fresh();await step(2);assert.equal(await page.evaluate(()=>DSGame.player().onGround),true);assert.equal(await page.evaluate(()=>DSGame.player().jumps),0);});
  for(const size of [{width:568,height:320},{width:844,height:390},{width:844,height:475}]){
   await page.setViewportSize(size);await fresh();
   const boxes=await page.evaluate(()=>Array.from(document.querySelectorAll('#pad button')).map(el=>{const r=el.getBoundingClientRect();return {id:el.id,x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el};}));
   assert.ok(boxes.every(r=>r.w>=64&&r.h>=64&&r.x>=0&&r.y>=0&&r.x+r.w<=size.width&&r.y+r.h<=size.height&&r.hit),'Phone touch targets must fit and receive input');
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.equal(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,false,'Phone buttons must not overlap');}
   layout.push({viewport:size,buttons:boxes});await tap('padSlide');await step();assert.equal(await page.evaluate(()=>DSGame.player().sliding),true);
  }
  const report={results,layout,errors,verification:'Edge mobile emulation with real CDP touch input; no physical-device test'};
  fs.writeFileSync(path.join(root,'docs/mobile-controls-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),phoneLayouts:layout.map(x=>x.viewport),errors},null,2));
  assert.ok(results.every(r=>r.passed),'Mobile control regressions failed');assert.deepEqual(errors,[]);
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
