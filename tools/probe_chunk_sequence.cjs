/* Dump the chunk sequence and per-segment content for the first N seconds.
 * Diagnostic only: used to judge repetition and rice/obstacle separation.
 * Usage: node tools/probe_chunk_sequence.cjs [seconds]
 */
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL='http://127.0.0.1:8123/';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SECONDS=Number(process.argv[2]||90);

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const page=await (await browser.newContext({viewport:{width:844,height:390}})).newPage();
  await page.addInitScript(()=>{
    let seed=11235;
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    window.__raf=[];window.__now=100;
    window.requestAnimationFrame=cb=>{window.__raf.push(cb);return window.__raf.length;};
    window.__step=n=>{for(let i=0;i<n;i++){window.__now+=1000/120;window.__raf.splice(0).forEach(cb=>cb(window.__now));}};
  });
  await page.goto(URL);
  await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100,timeout:60000});
  await page.locator('#btnStart').dispatchEvent('click');

  const seen=[];
  while(true){
    const got=await page.evaluate(()=>{
      const w=DSGame.world(),p=DSGame.player(),g=DSGame.state();
      const before=w.segments.length;
      for(let i=0;i<480;i++){
        p.invuln=999;g.lives=3;
        for(let j=w.obstacles.length-1;j>=0;j--)if(!w.obstacles[j].testFixture)w.obstacles.splice(j,1);
        for(let j=w.platforms.length-1;j>=0;j--)if(!w.platforms[j].testFixture)w.platforms.splice(j,1);
        for(let j=w.gaps.length-1;j>=0;j--)if(!w.gaps[j].testFixture)w.gaps.splice(j,1);
        w.pickups.length=0;w.powerups.length=0;
        window.__step(1);
      }
      return {t:w.runElapsed,newSegs:w.segments.slice(before).map(s=>({
        id:s.id,chunk:s.chunkId||null,family:s.family,speed:Math.round(s.speed),
        o:(s.obstacles||[]).length,p:(s.platforms||[]).length,g:(s.gaps||[]).length,k:(s.pickups||[]).length,
      }))};
    });
    seen.push(...got.newSegs);
    if(got.t>=SECONDS)break;
  }
  await browser.close();

  const ids=seen.map(s=>s.chunk||s.id);
  const counts={};
  ids.forEach(i=>counts[i]=(counts[i]||0)+1);
  console.log('segments:',seen.length,'distinct:',Object.keys(counts).length);
  console.log('sequence:');
  console.log(ids.map(i=>i.replace(/@\d+#/,'#')).join('  '));
  console.log('\nrepeat histogram (times seen):');
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log('  ',v,k));
  const withO=seen.filter(s=>s.o>0).length, withK=seen.filter(s=>s.k>0).length, both=seen.filter(s=>s.o>0&&s.k>0).length;
  console.log('\nsegments carrying obstacles:',withO,'| carrying pickups:',withK,'| both:',both);
  console.log('total obstacles:',seen.reduce((a,s)=>a+s.o,0),'total pickups:',seen.reduce((a,s)=>a+s.k,0));
  console.log('avg per segment: obstacles',(seen.reduce((a,s)=>a+s.o,0)/seen.length).toFixed(2),
              'pickups',(seen.reduce((a,s)=>a+s.k,0)/seen.length).toFixed(2));
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
