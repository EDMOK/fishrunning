/* Fast runtime smoke: the chunk library loads, chunks lock their band speed,
 * runways stay clear, and no speed source other than the declared ones moves
 * the runner. ~20s of game time instead of the full 190s regression.
 *
 * Needs a server on 127.0.0.1:8123 serving the tree you intend to test.
 * Usage: node tools/verify_chunk_runtime.cjs
 */
const {chromium}=require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

const URL='http://127.0.0.1:8123/';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SECONDS=20;

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[],missing=[];
  page.on('pageerror',e=>errors.push(String(e)));
  // 404s are reported through `missing` with their URL; keeping them out of
  // `errors` avoids double-counting the same failure.
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push('console: '+m.text());});
  // Record every failed response with its status and URL: a bare "404" from the
  // console handler cannot be traced back to a file.
  page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url());});

  await page.addInitScript(()=>{
    let seed=61451;
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    window.__raf=[];window.__now=100;window.__runwayViolations=[];
    window.requestAnimationFrame=cb=>{window.__raf.push(cb);return window.__raf.length;};
    window.__step=n=>{for(let i=0;i<n;i++){window.__now+=1000/120;const q=window.__raf.splice(0);q.forEach(cb=>cb(window.__now));}};
  });

  await page.goto(URL);
  try{
    await page.waitForFunction(()=>window.DSGame&&document.querySelector('#loading.hide'),null,{polling:100,timeout:60000});
  }catch(e){
    // A boot failure is otherwise reported as a bare timeout; say what broke.
    const where=await page.evaluate(()=>({hasGame:!!window.DSGame,loading:!!document.querySelector('#loading'),
      loadingHidden:!!document.querySelector('#loading.hide'),chunks:!!window.DSChunksData,chunkApi:!!window.DSChunks}));
    console.error('page never finished booting:',JSON.stringify(where),'errors:',JSON.stringify(errors),'missing:',JSON.stringify(missing.slice(0,5)));
    throw e;
  }
  await page.locator('#btnStart').dispatchEvent('click');

  // The contract loop below clears entities every frame, so nothing would catch
  // a replay wiring bug that produces no entities at all. Run a short stretch
  // WITHOUT clearing and require the frozen chunks to actually populate the
  // world — with decoded art, because a chunk naming an obstacle the loader
  // never fetched would otherwise pass every geometric check.
  {
    const populated=await page.evaluate(()=>{
      const w=DSGame.world(),p=DSGame.player(),g=DSGame.state();
      for(let i=0;i<240;i++){p.invuln=999;g.lives=3;window.__step(1);}
      const all=w.obstacles.concat(w.platforms,w.gaps);
      return {obstacles:w.obstacles.length,platforms:w.platforms.length,gaps:w.gaps.length,
        pickups:w.pickups.length,
        decoded:all.every(e=>e.img===undefined||(e.img&&e.img.naturalWidth>0))};
    });
    assert.ok(populated.obstacles+populated.platforms+populated.gaps>0,
      'frozen chunks must actually place entities: '+JSON.stringify(populated));
    assert.ok(populated.decoded,'every replayed entity must reference decoded art');
    console.log('populated world:',JSON.stringify(populated));
  }

  let checked=0, locked=0, blended=0, naturalSamples=0;
  const seenBases=new Set();
  const reports=[];

  while(true){
    const got=await page.evaluate(()=>{
      const w=DSGame.world(),p=DSGame.player(),g=DSGame.state();
      // Snapshot EVERYTHING before stepping. world() returns scalars by value
      // but live arrays by reference, so reading runways after the loop would
      // describe a different frame than the speed scalars do.
      const px=w.segmentX;
      const snap={
        t:w.runElapsed,speed:w.speed,speedBase:w.speedBase,speedMul:w.speedMul,
        source:w.speedSource,ease:w.speedEase,natural:w.speedNatural,
        chunks:w.chunks,segments:w.segments.length,
        active:w.activeSegment?{id:w.activeSegment.id,speed:w.activeSegment.speed,kind:w.activeSegment.kind,chunkId:w.activeSegment.chunkId,frozen:!!w.activeSegment.frozen}:null,
        runway:(()=>{const r=w.runways.find(r=>px>=r.from&&px<r.to);return r?{from:r.from,to:r.to,fromSpeed:r.fromSpeed,toSpeed:r.toSpeed}:null;})(),
        px,
      };
      const scan=()=>{
        for(const rw of w.runways){
          for(const o of w.obstacles)if(!o.testFixture&&o.x<rw.to&&o.x+o.w>rw.from)window.__runwayViolations.push({kind:o.kind,from:Math.round(rw.from),to:Math.round(rw.to),x:Math.round(o.x)});
          for(const q of w.platforms)if(!q.testFixture&&q.x<rw.to&&q.x+q.w>rw.from)window.__runwayViolations.push({kind:'platform',from:Math.round(rw.from),to:Math.round(rw.to),x:Math.round(q.x)});
          for(const gg of w.gaps)if(!gg.testFixture&&gg.x<rw.to&&gg.x+gg.w>rw.from)window.__runwayViolations.push({kind:'gap',from:Math.round(rw.from),to:Math.round(rw.to),x:Math.round(gg.x)});
        }
      };
      for(let i=0;i<360;i++){
        p.invuln=999;g.lives=3;
        scan();
        w.obstacles.length=0;
        for(let j=w.gaps.length-1;j>=0;j--)if(!w.gaps[j].testFixture)w.gaps.splice(j,1);
        for(let j=w.platforms.length-1;j>=0;j--)if(!w.platforms[j].testFixture)w.platforms.splice(j,1);
        w.pickups.length=0;w.powerups.length=0;
        window.__step(1);
      }
      snap.timeAfter=DSGame.world().runElapsed;
      snap.violations=window.__runwayViolations.length;
      return snap;
    });
    checked++;
    seenBases.add(got.active?got.active.id:'');

    // The game declares which rule set the speed this frame; check against the
    // declaration, not a re-derivation. A verifier that recomputes the value
    // can only ever disagree with itself.
    // world() recomputes speedBase on the POST-advance dist, while the natural
    // speed that fed this frame's decision was taken pre-advance; one frame of
    // curve drift (a few hundredths) is expected and is not a contract breach.
    const natural=got.speedBase*got.speedMul;
    assert.ok(Math.abs(natural-got.natural)<0.5,
      `speedBase*speedMul must describe the same curve as speedNatural: ${natural} vs ${got.natural}`);
    if(got.source==='pattern'||got.source==='action'){
      locked++;
      assert.ok(got.active,`source ${got.source} must come with an active segment`);
      assert.ok(Math.abs(got.speed-got.active.speed)<0.001,
        `inside ${got.active.id} the live speed must equal the locked ${got.active.speed}, got ${got.speed}`);
      if(got.source==='pattern'){
        assert.ok(got.active.frozen,'ordinary beats must come from the frozen chunk library');
        assert.ok(/@(380|520|700|900)#\d+$/.test(got.active.chunkId||''),
          'chunk id must carry its validated band: '+got.active.chunkId);
        assert.ok(Math.abs(got.active.speed-Number((got.active.chunkId||'').split('@')[1].split('#')[0]))<0.001,
          'a frozen chunk must lock the band its id declares: '+got.active.chunkId+' vs '+got.active.speed);
      }
    }else if(got.source==='runway'){
      blended++;
      assert.ok(got.runway,'a runway-bound speed must come with a runway containing segmentX');
      const expected=got.runway.fromSpeed+((got.runway.toSpeed||got.natural)-got.runway.fromSpeed)*got.ease;
      assert.ok(Math.abs(got.speed-expected)<0.001,
        `runway blend mismatch: expected ${expected.toFixed(3)} got ${got.speed}`);
      const pxEase=Math.min(1,Math.max(0,(got.px-got.runway.from)/Math.max(1,got.runway.to-got.runway.from)));
      assert.ok(Math.abs(pxEase-got.ease)<0.001,
        `declared ease ${got.ease} must match segmentX inside the runway (${pxEase.toFixed(4)})`);
    }else{
      naturalSamples++;
      assert.ok(Math.abs(got.speed-got.natural)<0.001,
        `a natural speed must be exactly the declared natural speed: ${got.natural} vs ${got.speed}`);
    }
    if(got.t>=SECONDS)break;
  }

  await page.waitForFunction(()=>true);
  const violations=await page.evaluate(()=>window.__runwayViolations.slice(0,10));

  const summary={
    seconds:Math.round((await page.evaluate(()=>DSGame.world().runElapsed))*10)/10,
    samples:checked,lockedSamples:locked,runwaySamples:blended,naturalSamples,
    chunksLoaded:await page.evaluate(()=>DSGame.world().chunks),
    distinctChunks:[...seenBases].filter(Boolean).length,
    runwayViolations:violations.length,
    errors,missing,
  };
  console.log(JSON.stringify({summary,violations},null,2));
  assert.deepEqual(errors,[]);
  assert.deepEqual(missing,[]);
  assert.ok(summary.chunksLoaded>=400,'the frozen chunk library must be loaded, got '+summary.chunksLoaded);
  assert.ok(locked>0&&(blended>0||naturalSamples>0),'the run must exercise both a locked beat and a recovery runway');
  assert.deepEqual(violations,[],'declared recovery runways must stay free of hazards, platforms and pits');
  await browser.close();
})().catch(async e=>{console.error(e.message||e);process.exitCode=1;process.exit(1);});
