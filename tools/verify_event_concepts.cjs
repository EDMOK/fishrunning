const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:1120},deviceScaleFactor:1});
 const errors=[],missing=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto('http://127.0.0.1:8123/art/event-concepts/index.html');
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:30000});
 assert.equal(await page.locator('article').count(),11);
 const images=await page.locator('article img').evaluateAll(imgs=>imgs.map(i=>({src:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight})));
 assert.equal(new Set(images.map(i=>i.src)).size,11,'Every event has its own character asset');
 await page.screenshot({path:'art/event-concepts/preview-light.png',fullPage:true});
 await page.locator('#background').click();assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('dark')));
 await page.screenshot({path:'art/event-concepts/preview-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Mobile preview fits screen');
 const response=await page.request.get('http://127.0.0.1:8123/docs/plans/2026-10-07-character-random-events.md');assert.equal(response.status(),200);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={cards:11,distinctImages:11,images,darkToggle:true,mobileNoOverflow:true,planLink:true,errors,missing};
 fs.writeFileSync('art/event-concepts/preview-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
