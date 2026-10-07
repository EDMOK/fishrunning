const fs=require('node:fs'),assert=require('node:assert/strict');
const certificates=require('./lib/chunk-engine-certificates.cjs');
const engine=certificates.engineHash();
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  let seed=9813;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  window.__raf=[];window.__now=100;window.requestAnimationFrame=cb=>{__raf.push(cb);return __raf.length;};
  window.__step=()=>{__now+=1000/120;__raf.splice(0).forEach(cb=>cb(__now));};
 });
 await page.route('**/src/game.js*',async r=>{const res=await r.fetch();const text=await res.text();await r.fulfill({response:res,body:text.replace('function render() {','function render() { if(window.__skipRender)return;')});});
 await page.addInitScript(()=>{window.__skipRender=true;});
 await page.goto('http://127.0.0.1:8123/');await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'));
 const loaded=await page.evaluate(()=>DSChunksData);const byId=new Map(loaded.chunks.map(c=>[c.id,c]));
 const ids=await page.evaluate(all=>{
  if(all)return DSChunksData.chunks.filter(c=>all==='unchecked'?!c.engineChecked:true).map(c=>c.id);
  const out=new Set(),S=DSChunksData.strings;
  for(const band of [380,520,700,900]){
   const list=DSChunksData.chunks.filter(c=>c.chain&&c.speed===band).sort((a,b)=>b.actions.length-a.actions.length||b.len-a.len);
   for(const c of list.slice(0,3))out.add(c.id);
   const scores=list.filter(c=>c.handcrafted),bases=new Set();for(const c of scores){if(!bases.has(c.base)){bases.add(c.base);out.add(c.id);}}
   for(const key of ['cargo','spring','buoy','pulse','cable','scout','bridge','collapse','terrace']){
    const c=list.find(c=>c.id.includes(key));if(c)out.add(c.id);
   }
  }
  return [...out];
 },process.argv.includes('--unchecked')?'unchecked':process.argv.includes('--all'));
 const results=[];
 for(const id of ids){
  const row=await page.evaluate(id=>{
   DSGame.practice(id);const c=DSChunksData.chunks.find(c=>c.id===id),seg=DSGame.world().segments[0];
   const origin=seg.start,start=origin-220,step=c.speed*8/120,pressed=new Set();let previous=-1,jumps=0,frames=0;const visited=new Set();
   const event=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true,repeat:false}));
   const release=()=>{for(const k of pressed){event('keyup',k);}pressed.clear();};
   while(DSGame.world().camX+DSGame.world().playerX<seg.end&&frames++<6000&&DSGame.state().state==='playing'){
    const w=DSGame.world(),p=DSGame.player(),at=w.camX+w.playerX,tick=(()=>{if(!c.proofX)return Math.floor((at-start)/step+1e-6);let lo=-1,hi=c.proofX.length;while(hi-lo>1){const mid=(lo+hi)>>1;if(c.proofX[mid]<=at-origin+1e-6)lo=mid;else hi=mid;}return lo;})(),action=c.proof[tick]||0;
    for(const i of c.landmarks||[]){const q=seg.platforms[i];if(p.onGround&&Math.abs(p.groundY-q.y)<1.5&&at>=q.x-25&&at<=q.x+q.w+25)visited.add(i);}
    if(p.vy>=0){for(const k of [...pressed])if(k!=='ArrowDown'){event('keyup',k);pressed.delete(k);}}
    if(action===2){if(!pressed.has('ArrowDown')){event('keydown','ArrowDown');pressed.add('ArrowDown');}}
    else if(pressed.has('ArrowDown')){event('keyup','ArrowDown');pressed.delete('ArrowDown');}
    if(tick>=0&&tick!==previous&&action===3){event('keyup','ShiftLeft');event('keydown','ShiftLeft');}
    if(tick>=0&&tick!==previous&&action===1){const key=['Space','ArrowUp','KeyW'][jumps++%3];event('keydown',key);pressed.add(key);}
    previous=tick;__step();
   }
   release();const w=DSGame.world(),g=DSGame.state(),p=DSGame.player();
   return {id,frames,finished:w.camX+w.playerX>=seg.end,lives:g.lives,hit:DSGame.lastHit(),failed:seg.obstacles.concat(seg.gaps).filter(o=>o.failed&&!o.dead).length,collected:g.rice,rice:c.r.length,feet:p.y,missingLandmarks:(c.landmarks||[]).filter(i=>!visited.has(i))};
  },id);
  row.key=certificates.key(byId.get(id),loaded.strings);results.push(row);
  if((process.argv.includes('--all')||process.argv.includes('--unchecked'))&&results.length%100===0)console.log(JSON.stringify({checked:results.length,total:ids.length,failures:results.filter(r=>!r.finished||r.hit||r.failed||r.lives<3||r.missingLandmarks.length).length}));
 }
 await browser.close();
 const failed=results.filter(r=>!r.finished||r.hit||r.failed||r.lives<3||r.missingLandmarks.length);
 fs.writeFileSync('docs/chunk-playthrough-verification.json',JSON.stringify({engine,tested:results.length,failures:failed,errors,results},null,2));
 console.log(JSON.stringify({tested:results.length,failures:failed.length,examples:failed.slice(0,3),errors},null,2));assert.deepEqual(errors,[]);assert.equal(failed.length,0,'Engine playthroughs must finish without damage');
})().catch(e=>{console.error(e);process.exitCode=1;});
