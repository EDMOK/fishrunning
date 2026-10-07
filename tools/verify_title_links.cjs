/* Touch the real title links: they must open their URL and never start a run. */
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),results=[];
 try{
  for(const [width,height,touch] of [[844,390,true],[667,375,true],[568,320,true],[1280,720,false]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   // Stub only external destinations; use native link navigation and popups.
   await context.route(/https:\/\/(www\.bilibili\.com|github\.com)\//,r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Link destination</title>'}));
   await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'));
   for(const selector of ['#btnBili','.socialRow a[href*="github.com"]']){
    const link=page.locator(selector),box=await link.boundingBox();
    if(touch)assert.ok(box.height>=47.9,`scaled tap height ${box.height} at ${width}`);
    for(const point of [{x:box.width/2,y:box.height/2},{x:8,y:8}]){
     const opened=page.waitForEvent('popup');if(touch)await link.tap({position:point});else await link.click({position:point});
     const popup=await opened;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),await link.getAttribute('href'));
     assert.equal(await page.evaluate(()=>DSGame.state().state),'title','a social link must not start a game');await popup.close();
    }
   }
   if(touch)await page.locator('#practiceRoute').tap();else await page.locator('#practiceRoute').click();assert.equal(await page.evaluate(()=>DSGame.state().state),'title','select tap must keep menu state');await page.keyboard.press('Escape');
   if(width===568)await page.screenshot({path:'docs/mobile-title-links.png'});
   assert.deepEqual(errors,[]);results.push({width,height,touch,linksOpened:4,menuPreserved:true,errors});await context.close();
  }
 }finally{await browser.close();}
 fs.writeFileSync('docs/mobile-title-links-verification.json',JSON.stringify({results,failures:0,method:'Native touch/mouse input and popup navigation; external destination responses stubbed.'},null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
