/* Audit the frozen chunk library.
 *
 * Replays every chunk in src/chunks-data.js through the runtime replayer in
 * src/chunks.js, then re-runs the hard gates from tools/lib/chunk-audit.cjs on
 * what actually came out. The build refuses to emit a bad chunk; this proves
 * the emitted file is the one the build validated, and that nothing was
 * hand-edited after the fact.
 *
 * Fast and offline: no browser, no server. Writes docs/chunk-verification.json.
 *
 * Usage: node tools/verify_chunks.cjs
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { makeReachable, obstacleClearance, springProblem } = require('./lib/chunk-audit.cjs');

const {replay:replayCompletion,ribbon} = require('./lib/chunk-solver.cjs');
const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));

// ------------------------------------------------------- constant mirror check
// The audit hard-codes the jump contract, the same way tools/verify_balance.py
// does. A stale mirror would happily validate chunks against physics the game
// no longer runs, so read the real values out of src/game.js and compare.
{
  const game = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  const num = (name) => {
    const m = game.match(new RegExp('var ' + name + ' = (-?[\\d.]+)'));
    assert.ok(m, `src/game.js must declare ${name}`);
    return Math.abs(parseFloat(m[1]));
  };
  const audit = require('./lib/chunk-audit.cjs');
  const mirror = [
    ['GRAVITY', num('GRAVITY'), audit.GRAVITY],
    ['JUMP_V', num('JUMP_V'), audit.JUMP_V],
    ['FALL_MUL', num('FALL_MUL'), audit.FALL_MUL],
    ['PLAYER_BOX_W', num('PLAYER_BOX_W'), audit.PLAYER_W],
    ['CLEAR_SLACK', num('CLEAR_SLACK'), audit.CLEAR_SLACK],
    // The spring verdict depends on these three; a drift here would silently
    // start blessing decorative springs again.
    ['GROUND_Y', num('GROUND_Y'), audit.GROUND_Y],
    ['DJUMP_V', num('DJUMP_V'), audit.DJUMP_V],
    ['DJ_RISE_G', num('DJ_RISE_G'), audit.DJ_RISE_G],
  ];
  // The spring launch is an inline literal in the bounce handler, not a named
  // constant, so it is read straight out of that line.
  const launch = game.match(/player\.vy\s*=\s*(-[\d.]+)\s*\*k/);
  assert.ok(launch, 'src/game.js must still launch the spring with a scaled velocity');
  mirror.push(['SPRING_V', Math.abs(parseFloat(launch[1])), audit.SPRING_V]);
  for (const [name, gameValue, auditValue] of mirror) {
    assert.equal(auditValue, gameValue,
      `chunk-audit.cjs mirrors ${name}=${auditValue} but src/game.js says ${gameValue}: ` +
      'the library would be validated against physics the game does not run');
  }

  // The tier tables drive which obstacles a pattern is allowed to place. A
  // stale mirror in the builder would freeze layouts the runtime would never
  // have produced (or fail to freeze ones it would).
  const build = fs.readFileSync(path.join(ROOT, 'tools/build_chunks.cjs'), 'utf8');
  const tier1 = game.match(/var TIER1 = \[([^\]]+)\]/);
  assert.ok(tier1, 'src/game.js must declare TIER1');
  const gameTier1 = tier1[1].match(/'([a-z]+)'/g).map(s => s.replace(/'/g, ''));
  const buildTier1 = build.match(/const TIER1 = \[([^\]]+)\]/);
  assert.ok(buildTier1, 'build_chunks.cjs must declare TIER1');
  assert.deepEqual(buildTier1[1].match(/'([a-z]+)'/g).map(s => s.replace(/'/g, '')), gameTier1,
    'build_chunks.cjs TIER1 mirror is out of step with src/game.js');
  const gameTiers = game.match(/var OBS_MIN_TIER = \{([^}]+)\}/);
  const buildTiers = build.match(/const OBS_MIN_TIER = \{([^}]+)\}/);
  assert.ok(gameTiers && buildTiers, 'both files must declare OBS_MIN_TIER');
  const parseTiers = (text) => {
    const out = {};
    for (const m of text.matchAll(/([a-z]+)\s*:\s*(\d+)/g)) out[m[1]] = Number(m[2]);
    return out;
  };
  assert.deepEqual(parseTiers(buildTiers[1]), parseTiers(gameTiers[1]),
    'build_chunks.cjs OBS_MIN_TIER mirror is out of step with src/game.js');
}

const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/chunks-data.js'), 'utf8'), sandbox, { filename: 'chunks-data.js' });
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/chunks.js'), 'utf8'), sandbox, { filename: 'chunks.js' });
const data = sandbox.window.DSChunksData;
assert.ok(data && data.chunks && data.chunks.length, 'chunk library must exist and be non-empty');
assert.equal(data.version, 3, 'unexpected chunk library version');

function recordingApi() {
  const rec = { obstacles: [], platforms: [], gaps: [], rice: [], risk: [], hints: [], powerups: [] };
  return {
    rec,
    api: {
      gap: (x, w) => rec.gaps.push({ x, w }),
      platform: (x, y, w, opts) => rec.platforms.push({ x, y, w: w, h: 28, opts }),
      addObstacle: (kind, x, opts = {}) => {
        const m = manifest.obstacle[kind];
        if (!m) throw new Error('unknown obstacle kind in library: ' + kind);
        const o = { kind, x, y:600-(opts.float||0)-m.h, w: m.w, h: m.h, box: m.box, motion: opts.motion || 0, float: opts.float || 0, opts };
        rec.obstacles.push(o);
        return o;
      },
      rice: (x, y, kind) => rec.rice.push({ x, y, kind: kind || 'rice' }),
      riskLine: (x, y, n, dx) => rec.risk.push({ x, y, n, dx }),
      hint: () => {},
    },
  };
}

const { rec, api } = recordingApi();
const lib = sandbox.window.DSChunks.create(data, api);
assert.ok(lib, 'DSChunks.create must accept the built data');
assert.equal(lib.count, data.chunks.length);

const results = { chunks: data.chunks.length, bands: lib.bands, families: {}, replayFailures: [] };

// ---------------------------------------------------------------- id hygiene
const ids = new Set();
for (const c of data.chunks) {
  assert.ok(!ids.has(c.id), 'duplicate chunk id: ' + c.id);
  ids.add(c.id);
  assert.ok(lib.bands.indexOf(c.speed) >= 0, 'chunk ' + c.id + ' has an unknown band');
  assert.ok(data.strings[c.base], 'chunk ' + c.id + ' has no base id');
  assert.ok(data.strings[c.family], 'chunk ' + c.id + ' has no family');
}

// --------------------------------------------------------------- replay audit
function overGap(c, x) { return c.gaps.find(g => x >= g.x && x <= g.x + g.w); }

for (const chunk of data.chunks) {
  const family = data.strings[chunk.family];
  results.families[family] = (results.families[family] || 0) + 1;

  const x = 1000;
  const before = { o: rec.obstacles.length, p: rec.platforms.length, g: rec.gaps.length, r: rec.rice.length, k: rec.risk.length };
  lib.patterns.find(p => p.chunkId === chunk.id).build(x);
  const c = {
    obstacles: rec.obstacles.slice(before.o),
    platforms: rec.platforms.slice(before.p),
    gaps: rec.gaps.slice(before.g),
    rice: rec.rice.slice(before.r),
    requiredPlatforms:(chunk.landmarks||[]).map(i=>chunk.p[i][0]+x),
    allowDash:chunk.skills?.includes('dash'),requireDash:chunk.skills?.includes('dash'),allowBounce:chunk.skills?.includes('bounce'),requireBounce:chunk.skills?.includes('bounce'),
    risk: rec.risk.slice(before.k),
  };
  const fail = (why) => results.replayFailures.push({ chunk: chunk.id, why });
  if(!replayCompletion(c,chunk.speed,x,chunk.proof))fail('completion witness does not finish collision-free on solid ground');
  if(chunk.ribbon){
    const local={requiredPlatforms:(chunk.landmarks||[]).map(i=>chunk.p[i][0]),allowDash:c.allowDash,requireDash:c.requireDash,allowBounce:c.allowBounce,requireBounce:c.requireBounce,obstacles:chunk.o.map(([k,x,opts])=>({kind:data.strings[k],x,opts,...manifest.obstacle[data.strings[k]]})),platforms:chunk.p.map(([x,y,w,opts])=>({x,y,w,opts})),gaps:chunk.g.map(([x,w])=>({x,w}))};
    const expected=ribbon(local,chunk.speed,chunk.proof);
    if(expected.points.length!==chunk.r.length)fail('ribbon point count changed');
    expected.points.forEach((p,i)=>{const r=chunk.r[i];if(!r||Math.abs(r[0]-p.x)>.06||Math.abs(r[1]-p.y)>.06)fail('rice scatter differs from its checked reachable area');});
    for(let i=0;i<chunk.r.length;i++)for(let j=0;j<i;j++)if(Math.hypot(chunk.r[i][0]-chunk.r[j][0],chunk.r[i][1]-chunk.r[j][1])<chunk.ribbon.minSeparation-.15)fail('rice scatter is too dense');
    for(let i=1;i<chunk.r.length;i++)if(chunk.r[i][0]-chunk.r[i-1][0]>chunk.ribbon.maxEmptySpan+.15)fail('reward scatter has a long empty stretch');
  }

  let end = x;
  for (const o of c.obstacles) end = Math.max(end, o.x + o.w + (o.motion || 0));
  for (const p of c.platforms) end = Math.max(end, p.x + p.w);
  for (const g of c.gaps) end = Math.max(end, g.x + g.w);
  for (const r of c.rice) end = Math.max(end, r.x + 40);
  for (const r of c.risk) end = Math.max(end, r.x + r.n * r.dx);
  if (Math.abs((end - x) - chunk.len) > 2) fail(`replayed length ${Math.round(end - x)} != declared ${chunk.len}`);

  // Reachability at the band and both sides of it.
  const reachable = makeReachable(c.platforms, c.gaps);
  for (const probe of chunk.skills?.length?[]:[chunk.speed * .7, chunk.speed, chunk.speed * 1.45]) {
    if (!reachable(probe)) { fail(`unreachable platform route at ${Math.round(probe)}`); break; }
  }

  const spring = springProblem(c.obstacles.map(o => o.kind), c.platforms);
  if (spring) fail(spring);

  const ground = c.obstacles.filter(o => !o.float);
  for (const o of c.obstacles) {
    if (o.float) continue;
    const { width, budget } = obstacleClearance(o, chunk.speed);
    if (width > budget) { fail(`${o.kind} needs ${width}px, arc clears ${budget.toFixed(1)}px`); break; }
    if (!c.gaps.every(g => o.x + o.w <= g.x || o.x >= g.x + g.w)) { fail(`ground ${o.kind} sits inside a pit`); break; }
  }
  for (let i = 0; i < ground.length && !results.replayFailures.some(f => f.chunk === chunk.id); i++) {
    for (let j = i + 1; j < ground.length; j++) {
      const a = ground[i], b = ground[j];
      const ax0 = a.x + a.box.x, ax1 = ax0 + a.box.w, bx0 = b.x + b.box.x, bx1 = bx0 + b.box.w;
      if (Math.min(ax1, bx1) - Math.max(ax0, bx0) > 8) { fail(`${a.kind} and ${b.kind} share ground`); break; }
    }
  }
  for (let i = 0; i < c.platforms.length; i++) for (let j = i + 1; j < c.platforms.length; j++) {
    const a = c.platforms[i], b = c.platforms[j];
    if (Math.abs(a.y - b.y) <= 24 && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 4) fail('two platforms intersect');
  }
  for (const r of c.rice) {
    for (const o of c.obstacles) {
      if(c.allowDash&&o.kind==='cargo')continue;
      const bx0 = o.x + o.box.x - 6, by0 = o.y + o.box.y - 6;
      if (r.x >= bx0 && r.x <= bx0 + o.box.w + 12 && r.y >= by0 && r.y <= by0 + o.box.h + 12) fail('rice buried in an obstacle');
    }
    if (!chunk.ribbon && overGap(c, r.x)) {
      const supported = c.platforms.some(p => r.x >= p.x - 30 && r.x <= p.x + p.w + 30 && p.y - r.y < 220 && r.y - p.y < 120);
      if (!supported && (r.y < 250 || r.y > 606)) fail('rice unreachable over a pit');
    }
  }
  const firsts = c.obstacles.map(o => o.x).concat(c.platforms.map(p => p.x)).concat(c.gaps.map(g => g.x));
  if (firsts.length && Math.min(...firsts) - x < -1) fail('geometry intrudes before the chunk origin');
}

// ------------------------------------------------------------- coverage gates
// Every obstacle asset the game ships must be reachable from the library. This
// is the assertion that would have caught the chunk migration silently dropping
// turret / gate / sentry and the dynamic-hazard beats: they were only ever
// placed by game.js's own patterns, and freezing just the shared ones left
// every geometric check green while a third of the art never appeared.
const kindsInLibrary = new Set();
const trapsInLibrary = new Set();
for (const c of data.chunks) {
  for (const [kindIdx, , opts] of c.o) {
    kindsInLibrary.add(data.strings[kindIdx]);
    if (opts && opts.trap) trapsInLibrary.add(opts.trap);
  }
}
results.kinds = [...kindsInLibrary].sort();
results.traps = [...trapsInLibrary].sort();
for (const kind of Object.keys(manifest.obstacle)) {
  assert.ok(kindsInLibrary.has(kind),
    `obstacle asset "${kind}" exists but no frozen chunk places it — ` +
    'the library is missing a whole generator or pattern');
}
// The dynamic hazards are behavioural variants rather than new art, so they
// need their own gate: losing them is invisible to the kind check above.
for (const trap of ['pulse', 'cable', 'scout']) {
  assert.ok(trapsInLibrary.has(trap),
    `dynamic hazard "${trap}" exists but no frozen chunk carries it`);
}

const byBandFamily = {};
for (const c of data.chunks) {
  const key = c.speed + ':' + data.strings[c.family];
  byBandFamily[key] = (byBandFamily[key] || 0) + 1;
}
results.byBandFamily = byBandFamily;
for (const band of lib.bands) {
  const total = data.chunks.filter(c => c.speed === band).length;
  assert.ok(total >= 20, `band ${band} has only ${total} chunks`);
  // A pressure phase must be able to fall back to a reward chunk, so every
  // band needs a breather population.
  assert.ok((byBandFamily[band + ':reward'] || 0) >= 3, `band ${band} has too few reward chunks`);
}
assert.deepEqual(results.replayFailures, [], 'every chunk must re-pass the audit it was admitted by');

// ------------------------------------------------------- variants are distinct
// The builder picks variants by scoring them on a signature and keeping the
// diverse ones. If captures aliased each other, every kept variant would
// serialise the SAME layout and the library would look curated while offering
// no variety at all — geometry checks stay green either way, so this needs its
// own assertion.
{
  const groups = new Map();
  for (const c of data.chunks) {
    const key = data.strings[c.base] + '@' + c.speed;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const duplicateGroups = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const distinct = new Set(list.map(c => JSON.stringify([c.o, c.p, c.g, c.r, c.k])));
    if (distinct.size !== list.length) duplicateGroups.push({ group: key, variants: list.length, distinct: distinct.size });
  }
  results.variantGroups = groups.size;
  results.duplicateVariants = duplicateGroups;
  assert.deepEqual(duplicateGroups, [],
    'every variant in a (pattern, band) group must be a different layout, not the same roll relabelled');
}

// ------------------------------------------------------------ director wiring
// poolFor must always return something usable at any speed the curve can reach.
const curve = t => 320 + (665 - 320) * (1 - Math.exp(-t / 15000));
for (let d = 0; d <= 45000; d += 250) {
  const pool = lib.poolFor(curve(d));
  assert.ok(pool.length > 0, `empty pool at dist ${d}`);
  assert.ok(pool.every(p => p.build && p.speed), 'pool entries must be buildable patterns with a declared speed');
}

fs.writeFileSync(path.join(ROOT, 'docs/chunk-verification.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  chunks: results.chunks,
  bands: results.bands,
  families: results.families,
  byBandFamily,
  failures: results.replayFailures.length,
}, null, 2));
