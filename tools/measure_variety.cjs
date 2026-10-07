/* Measure how much VARIETY a player actually meets.
 *
 * Counting ids in the library answers the wrong question: what matters is what
 * gets picked, and whether a beat asks for more than one obstacle. This reports
 * both the library composition per band/tier and a real 150s run, segment by
 * segment, with the number of distinct obstacle kinds in each.
 *
 * Usage: node tools/measure_variety.cjs [seconds]
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { chromium } = require('C:/Users/AMDNOW/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://127.0.0.1:8123/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SECONDS = Number(process.argv[2] || 150);
const TIER_TIME = [0, 15, 40, 85, 150];

// ------------------------------------------------------------- library side
const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/chunks-data.js'), 'utf8'), sandbox);
const data = sandbox.window.DSChunksData;
const S = data.strings;

const kindsOf = c => new Set(c.o.map(o => S[o[0]]));
const tiers = [0, 1, 2, 3, 4];
const bands = [380, 520, 700, 900];

console.log('library composition by band x tier (chunks with 2+ obstacle KINDS):');
console.log('band  tier  pool   2+kind  reward  mixed  obstacle  gap  platform');
for (const band of bands) {
  for (const tier of tiers) {
    const pool = data.chunks.filter(c => c.speed === band && c.min <= tier);
    if (!pool.length) continue;
    const multi = pool.filter(c => kindsOf(c).size >= 2).length;
    const fam = {};
    for (const c of pool) fam[S[c.family]] = (fam[S[c.family]] || 0) + 1;
    console.log(
      String(band).padEnd(5), String(tier).padEnd(5),
      String(pool.length).padEnd(7), String(multi).padEnd(7),
      String(fam.reward || 0).padEnd(7), String(fam.mixed || 0).padEnd(6),
      String(fam.obstacle || 0).padEnd(9), String(fam.gap || 0).padEnd(5),
      fam.platform || 0);
  }
}

// --------------------------------------------------------------- run side
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  await page.addInitScript(() => {
    let seed = 4242;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    window.__raf = []; window.__now = 100;
    window.requestAnimationFrame = cb => { window.__raf.push(cb); return window.__raf.length; };
    window.__step = n => { for (let i = 0; i < n; i++) { window.__now += 1000 / 120; window.__raf.splice(0).forEach(cb => cb(window.__now)); } };
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.DSGame && document.querySelector('#loading.hide'), null, { polling: 100, timeout: 60000 });
  await page.locator('#btnStart').dispatchEvent('click');

  const segs = [];
  while (true) {
    const r = await page.evaluate(() => {
      const w = DSGame.world(), p = DSGame.player(), g = DSGame.state();
      const before = w.segments.length;
      for (let i = 0; i < 480; i++) {
        p.invuln = 999; g.lives = 3;
        for (let j = w.obstacles.length - 1; j >= 0; j--) if (!w.obstacles[j].testFixture) w.obstacles.splice(j, 1);
        for (let j = w.platforms.length - 1; j >= 0; j--) if (!w.platforms[j].testFixture) w.platforms.splice(j, 1);
        for (let j = w.gaps.length - 1; j >= 0; j--) if (!w.gaps[j].testFixture) w.gaps.splice(j, 1);
        w.pickups.length = 0; w.powerups.length = 0;
        window.__step(1);
      }
      return {
        t: w.runElapsed,
        new: w.segments.slice(before).map(s => ({
          id: s.id, chunk: s.chunkId || null, family: s.family, len: Math.round(s.end - s.start),
          o: (s.obstacles || []).length,
          kinds: new Set((s.obstacles || []).map(o => o.kind)).size,
        })),
      };
    });
    segs.push(...r.new);
    if (r.t >= SECONDS) break;
  }
  await browser.close();

  const named = segs.filter(s => s.id);
  const multi = named.filter(s => s.kinds >= 2);
  const multiLen = multi.reduce((a, s) => a + s.len, 0);
  const allLen = named.reduce((a, s) => a + s.len, 0);
  const combos = named.filter(s => /^combo-/.test(s.id));

  console.log('\n--- a real run ---');
  console.log('segments:', named.length, ' distinct ids:', new Set(named.map(s => s.id)).size,
    ' distinct layouts:', new Set(named.map(s => s.chunk || s.id)).size);
  console.log('beat length total:', allLen, 'px');
  console.log('2+ obstacle kinds:', multi.length, 'segments =',
    (100 * multi.length / named.length).toFixed(0) + '% of beats,',
    (100 * multiLen / allLen).toFixed(0) + '% of track length');
  console.log('combo-* beats:', combos.length, '(' + (100 * combos.length / named.length).toFixed(0) + '%)');
  const byKinds = {};
  named.forEach(s => byKinds[s.kinds] = (byKinds[s.kinds] || 0) + 1);
  console.log('kinds per beat:', JSON.stringify(byKinds));
  console.log('\nfirst 24 beats:');
  named.slice(0, 24).forEach(s => console.log('  ',
    (s.chunk || s.id).padEnd(26), String(s.kinds) + 'k', String(s.len).padStart(5) + 'px', s.family || ''));
})().catch(e => { console.error(e.message || e); process.exitCode = 1; });
