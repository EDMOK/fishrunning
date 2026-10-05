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
  const page=await context.newPage(),errors=[],results=[],layout=[],framing=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.__frames=[];window.__now=100;requestAnimationFrame=cb=>{__frames.push(cb);return __frames.length;};window.__step=()=>{__now+=1000/60;__frames.splice(0).forEach(cb=>cb(__now));};
   // Record wake-lock traffic. The browser API itself is not exercised here (a
   // headless page is not granted a screen lock); this checks the wiring: asked
   // for while running, released when the run pauses.
   window.__wake={requests:0,released:0};
   Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:()=>{__wake.requests++;return Promise.resolve({release:()=>{__wake.released++;return Promise.resolve();}});}}});});
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
  // Tighter than the case above: the second tap lands 7 frames in, where the
  // 0.16s press buffer expires before SLIDE_MIN and cannot mask a lost renewal.
  await check('an early repeat tap restarts the slide minimum',async()=>{await tap('padSlide');await step(7);await tap('padSlide');await step(16);assert.equal(await page.evaluate(()=>DSGame.player().sliding),true,'a tap 7 frames in must restart the 0.32s minimum');await step(8);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
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
  // A finger put down before a modal and lifted after it must not become input
  // for the resumed run. The stage is marked `inert` while the shop is open, so
  // the finger in flight is the only thing that can leak.
  await check('finger held across the shop does not jump on release',async()=>{const half=Math.round(844/2)-60;await touch('touchStart',[{x:half,y:100}]);await page.keyboard.press('b');assert.equal(await page.evaluate(()=>DSGame.state().state),'shop');await page.keyboard.press('b');await touch('touchEnd');await step(2);assert.equal(await page.evaluate(()=>DSGame.player().jumps),0,'releasing a finger held across the shop must not jump');});
  await check('finger held across a pause does not jump on release',async()=>{const half=Math.round(844/2)-60;await touch('touchStart',[{x:half,y:100}]);await page.keyboard.press('p');assert.equal(await page.evaluate(()=>DSGame.state().state),'paused');await page.keyboard.press('p');await touch('touchEnd');await step(2);assert.equal(await page.evaluate(()=>DSGame.player().jumps),0,'releasing a finger held across a pause must not jump');});
  // A downward drag on a card is not a slide request for the next run.
  await check('swipe on a card does not bank a slide',async()=>{await page.keyboard.press('p');await touch('touchStart',[{x:200,y:100}]);await touch('touchMove',[{x:200,y:200}]);await touch('touchEnd');await page.keyboard.press('p');await step(3);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false,'a swipe made under the pause card must not slide after resume');});
  await check('shop discards queued input',async()=>{await tap('padJump');await tap('padSlide');await page.keyboard.press('b');assert.equal(await page.evaluate(()=>DSGame.state().state),'shop');await page.keyboard.press('b');await step();assert.equal(await page.evaluate(()=>DSGame.player().onGround),true);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  // The screen must stay awake for the whole run, and only for the run: a phone
  // that dims mid-run ends it under the player's thumbs. The API is stubbed in
  // the init script; what is checked is that the game asks while playing and
  // gives it back as soon as the run stops.
  await check('screen wake lock follows the run',async()=>{await step(2);const a=await page.evaluate(()=>({...__wake}));assert.ok(a.requests-a.released>0,'wake lock must be held while playing');await page.keyboard.press('p');await step(2);const b=await page.evaluate(()=>({...__wake}));assert.ok(b.released>a.released,'wake lock must be released when paused');await page.keyboard.press('p');await step(2);const c=await page.evaluate(()=>({...__wake}));assert.ok(c.requests>b.requests,'wake lock must be re-requested on resume');});
  await check('blur pauses and clears fingers',async()=>{await touch('touchStart',[controls.padSlide]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.evaluate(()=>DSGame.state().state),'paused');await touch('touchEnd');await page.keyboard.press('p');await step(25);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  // A phone that switches apps fires visibilitychange far more reliably than
  // blur, so hiding the tab has to pause and drop held fingers on its own.
  // Keyboard instructions must not reach a phone: the pause card carries both
  // lists and the media query picks one, which is easy to break by adding a card
  // or renaming a class.
  await check('cards drop keyboard wording on touch',async()=>{const shown=await page.evaluate(()=>{const p=document.querySelector('#cardPause');const c=document.querySelector('#cardTitle');const o=document.querySelector('#cardOver');
    const d=(el,sel)=>el&&el.querySelector(sel)?getComputedStyle(el.querySelector(sel)).display:'missing';
    return {pauseKey:d(p,'.keybar'),pauseHelp:d(p,'.mobileHelp'),titleKey:d(c,'.keybar'),titleHelp:d(c,'.mobileHelp'),overKey:d(o,'.overHint'),overHelp:d(o,'.mobileHelp')};});
    assert.equal(shown.pauseKey,'none','pause card keyboard list must be hidden on touch');
    assert.equal(shown.titleKey,'none','title card keyboard list must be hidden on touch');
    assert.equal(shown.overKey,'none','over card keyboard hint must be hidden on touch');
    for(const k of ['pauseHelp','titleHelp','overHelp'])assert.equal(shown[k],'block',k+' must be shown on touch');});
  // The game-over card tells a phone player to tap to run again; that promise
  // has to be true, and true only after the fade has settled.
  await check('tap on the game-over card restarts',async()=>{await page.evaluate(()=>{const g=DSGame.state();g.state='over';g.overFade=1;});await touch('touchStart',[{x:422,y:100}]);await touch('touchEnd');await step(2);assert.equal(await page.evaluate(()=>DSGame.state().state),'playing','tapping the over card must start a new run');});
  await check('hiding the tab pauses and clears fingers',async()=>{await touch('touchStart',[controls.padSlide]);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.evaluate(()=>DSGame.state().state),'paused');const held=await page.evaluate(()=>document.getElementById('padSlide').classList.contains('held'));assert.equal(held,false,'pad hold must not survive the tab being hidden');await touch('touchEnd');await page.evaluate(()=>{delete document.hidden;});await page.keyboard.press('p');await step(25);assert.equal(await page.evaluate(()=>DSGame.player().sliding),false);});
  await check('lost capture releases the button',async()=>{await page.locator('#padJump').dispatchEvent('pointerdown',{pointerId:43,pointerType:'touch',button:0,bubbles:true});await step();await page.locator('#padJump').dispatchEvent('lostpointercapture',{pointerId:43,pointerType:'touch',bubbles:true});await step(40);assert.equal(await page.evaluate(()=>DSGame.player().gliding),false);assert.equal(await page.locator('#padJump').evaluate(el=>el.classList.contains('held')),false);});
  await check('releasing pad preserves keyboard glide hold',async()=>{await page.keyboard.down('ArrowUp');await touch('touchStart',[controls.padJump]);await step();await step(35);assert.equal(await page.evaluate(()=>DSGame.player().gliding),true);await touch('touchEnd');await step();assert.equal(await page.evaluate(()=>DSGame.player().gliding),true);await page.keyboard.up('ArrowUp');await step();assert.equal(await page.evaluate(()=>DSGame.player().gliding),false);});
  await check('restart discards both pending jumps',async()=>{await tap('padJump');await tap('padJump');await fresh();await step(2);assert.equal(await page.evaluate(()=>DSGame.player().onGround),true);assert.equal(await page.evaluate(()=>DSGame.player().jumps),0);});
  // Layout checks are collected the same way as the behaviour ones: a failure
  // is recorded and the run continues. Throwing here used to abort before the
  // report was written, which left the previous run's green JSON on disk and
  // made a broken build look verified.
  for(const size of [{width:568,height:320},{width:844,height:390},{width:844,height:475}]){
   try{
    await page.setViewportSize(size);await fresh();
    const boxes=await page.evaluate(()=>Array.from(document.querySelectorAll('#pad button')).map(el=>{const r=el.getBoundingClientRect();return {id:el.id,x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el};}));
    assert.ok(boxes.every(r=>r.w>=64&&r.h>=64&&r.x>=0&&r.y>=0&&r.x+r.w<=size.width&&r.y+r.h<=size.height&&r.hit),'Phone touch targets must fit and receive input');
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.equal(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,false,'Phone buttons must not overlap');}
    layout.push({viewport:size,buttons:boxes});
    // The same quick flick the behaviour suite taps: press and release inside
    // one simulation step. It must still slide on this viewport.
    await tap('padSlide');await step();
    assert.equal(await page.evaluate(()=>DSGame.player().sliding),true,'quick slide tap must register');
    results.push({name:'quick slide tap registers @'+size.width+'x'+size.height,passed:true});
   }catch(e){results.push({name:'quick slide tap registers @'+size.width+'x'+size.height,passed:false,error:e.message});await touch('touchCancel').catch(()=>{});}
  }
  // ---- framing: a phone held sideways is wider than 16:9, so fitting by height
  // used to leave a fifth of the screen as bars beside an already small picture.
  // The fix fills the width and trims sky off the top; these checks hold it in
  // bounds. 132 is WORLD_OY (GROUND_SCREEN_Y - GROUND_Y*ZOOM = 600 - 600*0.78),
  // the canvas row where the world layer starts: trimming past it would eat
  // track, not sky. It mirrors the game constant like verify_balance does.
  for(const size of [{width:568,height:320},{width:844,height:390},{width:844,height:475},{width:926,height:428},{width:1280,height:720}]){
   try{
    await page.setViewportSize(size);await page.waitForTimeout(80);
    const f=await page.evaluate(()=>{
      const stage=document.getElementById('stage'),r=stage.getBoundingClientRect(),k=r.width/1280;
      const card=document.getElementById('cardTitle');
      return {crop:parseFloat(getComputedStyle(stage).getPropertyValue('--crop'))||0,
        fillX:r.width/window.innerWidth,fillY:r.height/window.innerHeight,
        stageH:r.height/k,cardBottom:card.getBoundingClientRect().bottom<0?0:(card.getBoundingClientRect().bottom-r.top)/k};
    });
    assert.ok(f.crop<132,'sky trim must stay above the world layer, got '+f.crop);
    assert.ok(f.fillY>=0.985,'picture must fill the screen height, got '+f.fillY.toFixed(3));
    assert.ok(f.fillX>=0.9,'picture must cover at least 90% of the width, got '+f.fillX.toFixed(3));
    assert.ok(f.cardBottom<=f.stageH+1,'title card must fit the trimmed cabinet, got '+f.cardBottom.toFixed(0)+'/'+f.stageH.toFixed(0));
    framing.push({viewport:size,crop:f.crop,fillX:+f.fillX.toFixed(3),fillY:+f.fillY.toFixed(3),stageH:Math.round(f.stageH)});
    results.push({name:'framing @'+size.width+'x'+size.height,passed:true});
   }catch(e){results.push({name:'framing @'+size.width+'x'+size.height,passed:false,error:e.message});}
  }
  // ---- in-app browser notice: WeChat/QQ webviews refuse fullscreen and can
  // leave a shared link unplayable, so the page has to say so and say how to
  // escape. It must stay invisible everywhere else, and clear itself once a run
  // starts so it never covers the HUD.
  // Each user agent gets a brand-new page and is checked BEFORE any interaction:
  // starting a run hides the notice by design, so asserting after a click would
  // pass even if the notice had wrongly appeared first.
  const WECHAT_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002832) NetType/WIFI Language/zh_CN';
  const QQ_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36 V1_AND_SQ_8.9.73_4332_YYB_D QQ/8.9.73.11455 NetType/WIFI WebP/0.4.1 AppId/537112567';
  for(const ua of [{name:'a normal browser',value:null,inApp:false},{name:'WeChat',value:WECHAT_UA,inApp:true},{name:'QQ',value:QQ_UA,inApp:true}]){
   let ctx=null;
   try{
    const opts={viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1};
    if(ua.value)opts.userAgent=ua.value;
    ctx=await browser.newContext(opts);
    const p=await ctx.newPage();
    await p.goto('http://127.0.0.1:'+server.address().port+'/');
    await p.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100,timeout:30000});
    const shown=await p.evaluate(()=>{const el=document.getElementById('openTip');return {visible:!el.classList.contains('hide'),text:document.getElementById('openTipText').textContent};});
    assert.equal(shown.visible,ua.inApp,'in-app notice visibility in '+ua.name+' must be '+ua.inApp);
    if(ua.inApp){
      assert.ok(/浏览器/.test(shown.text),ua.name+' notice must point at a browser, got: '+shown.text);
      assert.ok(/⋯/.test(shown.text),ua.name+' notice must point at the top-right menu');
      await p.locator('#openTipClose').dispatchEvent('click');
      assert.equal(await p.evaluate(()=>document.getElementById('openTip').classList.contains('hide')),true,ua.name+' notice must be dismissible');
      await p.locator('#btnStart').dispatchEvent('click');
      await p.waitForFunction(()=>DSGame.state().state==='playing',null,{polling:100,timeout:10000});
      assert.equal(await p.evaluate(()=>document.getElementById('openTip').classList.contains('hide')),true,ua.name+' notice must clear once a run starts');
    }
    results.push({name:'in-app notice in '+ua.name,passed:true});
   }catch(e){results.push({name:'in-app notice in '+ua.name,passed:false,error:e.message});}
   finally{if(ctx)await ctx.close();}
  }
  const report={results,layout,framing,errors,verification:'Edge mobile emulation with real CDP touch input; no physical-device test'};
  fs.writeFileSync(path.join(root,'docs/mobile-controls-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),phoneLayouts:layout.map(x=>x.viewport),framing,errors},null,2));
  assert.ok(results.every(r=>r.passed),'Mobile control regressions failed');assert.deepEqual(errors,[]);
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
