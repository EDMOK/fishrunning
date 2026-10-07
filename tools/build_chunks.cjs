/* Build curated prefab chunks from tools/lib/authored-chunks.cjs.
 * Gate geometry, score diverse variants, then require a collision-free input
 * witness for EACH serialized instance. Runtime only selects and replays.
 * Regenerate: node tools/build_chunks.cjs; audit: node tools/verify_chunks.cjs.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeReachable, obstacleClearance, springProblem } = require('./lib/chunk-audit.cjs');

const {solve,replay,ribbon} = require('./lib/chunk-solver.cjs');
const engineCertificates=require('./lib/chunk-engine-certificates.cjs'),engineCache=engineCertificates.load();
const ROOT = path.resolve(__dirname, '..');
let previousData=null;try{const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'src/chunks-data.js'),'utf8'),box);previousData=box.window.DSChunksData;}catch{}
const previousById=new Map((previousData?.chunks||[]).map(c=>[c.id,c]));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));

// Speed bands the library is materialised at. The runtime locks a run to the
// band of the chunk it is inside, so these are the speeds the game is actually
// played at between boundaries (the smooth curve only selects between bands).
const BANDS = [380, 520, 700, 900];
// A chunk is a candidate for the current curve when the band is within this
// tolerance, which is also the worst-case speed step at a chunk boundary.
const SPEED_TOLERANCE = 110;
// Candidates rolled per (pattern, band) before curation.
const CANDIDATES = 220;
// How many curated variants to keep per (pattern, band). The anti-repeat window
// is short and the early tiers have few bases, so the variant count is most of
// what makes a familiar beat feel like a different track.
const KEEP = 10;
// Descending diversity floors: a variant must differ from every already-kept
// variant by at least this much. Relaxed only if a pair cannot otherwise fill.
const DIVERSITY = [0.34, 0.26, 0.18, 0.10, 0.06];
// A beat with a single obstacle is legitimate content — its pacing comes from
// the recovery runway after it — so the floor only rejects degenerate rolls.
// The cap is generous because the score function already penalises length.
const MIN_LEN = 60, MAX_LEN = 8200;

let seed = 20261007;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// The tier each band stands in for. Base patterns take (x, tier) and gate their
// obstacle choice on it, so a band has to play the tier it belongs to — the
// same [0,15,40,85,150] gate table the runtime tiers come from.
const BAND_TIER = { 380: 1, 520: 2, 700: 3, 900: 4 };

// Mirrors src/game.js TIER1 / OBS_MIN_TIER; verify_chunks.cjs checks these
// against the source so the mirror cannot go stale.
const TIER1 = ['patrol', 'crystals', 'mine'];
const ALL_OBSTACLES = TIER1.concat(['drone', 'turret', 'gate', 'sentry']);
const OBS_MIN_TIER = {
  patrol: 0, crystals: 0, mine: 0,
  drone: 2, turret: 2,
  gate: 3, sentry: 3, cargo: 1, spring: 1, buoy: 2,
};
const legalAt = (t) => ALL_OBSTACLES.filter(k => OBS_MIN_TIER[k] <= t);

function capture(api, build, x, tier) {
  api.obstacles.length = 0; api.platforms.length = 0; api.gaps.length = 0;
  api.rice.length = 0; api.risk.length = 0; api.hints.length = 0;
  build(x, tier);
  const c = { obstacles: api.obstacles.slice(), platforms: api.platforms.slice(),
    gaps: api.gaps.slice(), rice: api.rice.slice(), risk: api.risk.slice(),
    hints: api.hints.slice() };
  shiftToOrigin(c, x);
  return c;
}

/**
 * Slide a captured layout right so nothing starts before the chunk origin.
 *
 * Some beats lead with a negative offset (`start - 70*step`) that grows with
 * the band's k until it crosses the origin at high speed. Whatever sits before
 * the origin would land inside the PREVIOUS chunk's recovery runway — the one
 * piece of ground the contract promises is clear. Sliding the whole layout
 * keeps its shape and only lengthens the clear ground before it.
 */
function shiftToOrigin(c, origin) {
  let minX = Infinity;
  const see = (x) => { if (x < minX) minX = x; };
  c.obstacles.forEach(o => see(o.x - (o.motion || 0)));
  c.platforms.forEach(p => see(p.x));
  c.gaps.forEach(g => see(g.x));
  c.rice.forEach(r => see(r.x - 26));
  c.risk.forEach(r => see(r.x - 26));
  if (!isFinite(minX)) return;
  const dx = origin - minX;
  if (dx <= 0) return;
  c.obstacles.forEach(o => { o.x += dx; });
  c.platforms.forEach(p => { p.x += dx; });
  c.gaps.forEach(g => { g.x += dx; });
  c.rice.forEach(r => { r.x += dx; });
  c.risk.forEach(r => { r.x += dx; });
}

function extent(c, origin) {
  let end = origin;
  // Swept extent (art + sway), matching the runtime's own measure: the runway
  // that follows a chunk must not start inside the reach of a swaying hazard.
  for (const o of c.obstacles) end = Math.max(end, o.x + o.w + (o.motion || 0));
  for (const p of c.platforms) end = Math.max(end, p.x + p.w);
  for (const g of c.gaps) end = Math.max(end, g.x + g.w);
  for (const r of c.rice) end = Math.max(end, r.x + 40);
  for (const r of c.risk) end = Math.max(end, r.x + r.n * r.dx);
  return end - origin;
}

/** Occupied arcs merged with a tolerance, so rice dotting is one continuous run. */
function mergedSpans(c, origin, tol) {
  const spans = [];
  const push = (x0, x1) => spans.push([x0 - origin, x1 - origin]);
  c.obstacles.forEach(o => push(o.x, o.x + o.w));
  c.platforms.forEach(p => push(p.x, p.x + p.w));
  c.gaps.forEach(g => push(g.x, g.x + g.w));
  c.rice.forEach(r => push(r.x - 26, r.x + 26));
  c.risk.forEach(r => push(r.x - 26, r.x + r.n * r.dx + 26));
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] <= tol) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

function deadRatio(c, origin, len) {
  let dead = 0, cursor = 0;
  for (const [x0, x1] of mergedSpans(c, origin, 96)) {
    if (x0 > cursor) dead += x0 - cursor;
    cursor = Math.max(cursor, x1);
  }
  if (cursor < len) dead += len - cursor;
  return dead / Math.max(1, len);
}

const within = (x, a, b) => x >= a && x <= b;

/**
 * Rice over a pit is legitimate: reward arcs are meant to be taken mid-jump,
 * and the highest reachable point is roughly 340px above the ground line
 * (first jump apex plus a corrective second hop). What is not legitimate is
 * rice below the ground line with nothing under it — that can never be taken.
 */
function reachableOverGap(c, x, y) {
  const gap = c.gaps.find(g => within(x, g.x, g.x + g.w));
  if (!gap) return true;
  if (c.platforms.some(p => within(x, p.x - 30, p.x + p.w + 30) && p.y - y < 220 && y - p.y < 120)) return true;
  return y >= 250 && y <= 606;
}

// ---------------------------------------------------------------- hard gates
function hardReject(c, origin, band, pattern) {
  const len = extent(c, origin);
  if (len < MIN_LEN) return 'microscopic';
  if (len > MAX_LEN) return 'overlong';
  if (!c.obstacles.length && !c.platforms.length && !c.gaps.length && !c.rice.length && !c.risk.length) return 'empty roll';

  // Reachability of the platform route at the worst speeds either side of the band.
  const reachable = makeReachable(c.platforms, c.gaps);
  for (const probe of pattern.skills?.length?[]:[band * .7, band, band * 1.45]) {
    if (!reachable(probe)) return `unreachable platform route at ${Math.round(probe)}`;
  }

  // A spring must lead somewhere a jump cannot: see chunk-audit.cjs.
  const spring = springProblem(c.obstacles.map(o => o.kind), c.platforms);
  if (spring) return spring;

  const ground = c.obstacles.filter(o => !o.float);
  for (const o of c.obstacles) {
    // Floating hazards are suspended by design (skyline-weave flies drones over
    // its pits), so neither the ground-arc budget nor the pit rule applies.
    if (o.float) continue;
    const { width, budget } = obstacleClearance(o, band);
    if (width > budget) return `${o.kind} needs ${width}px, arc clears ${budget.toFixed(1)}px at ${band}`;
    if (!c.gaps.every(g => o.x + o.w <= g.x || o.x >= g.x + g.w)) return `ground ${o.kind} sits inside a pit`;
  }

  // Two ground obstacles cannot share ground; that is an unclearable cluster.
  for (let i = 0; i < ground.length; i++) for (let j = i + 1; j < ground.length; j++) {
    const a = ground[i], b = ground[j];
    const ax0 = a.x + a.box.x, ax1 = ax0 + a.box.w, bx0 = b.x + b.box.x, bx1 = bx0 + b.box.w;
    const overlap = Math.min(ax1, bx1) - Math.max(ax0, bx0);
    if (overlap > 8) return `${a.kind} and ${b.kind} share ground (${Math.round(overlap)}px)`;
  }

  // Overlapping platforms read as one broken ledge.
  for (let i = 0; i < c.platforms.length; i++) for (let j = i + 1; j < c.platforms.length; j++) {
    const a = c.platforms[i], b = c.platforms[j];
    if (Math.abs(a.y - b.y) > 24) continue;
    const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (overlap > 4) return 'two platforms intersect';
  }

  // Rice the player cannot take without being hit is bait, not reward.
  const rice = c.rice.concat(c.risk.flatMap(r => Array.from({ length: r.n }, (_, i) => ({ x: r.x + i * r.dx, y: r.y }))));
  for (const r of rice) {
    for (const o of c.obstacles) {
      const bx0 = o.x + o.box.x - 6, bx1 = bx0 + o.box.w + 12;
      const by0 = o.y + o.box.y - 6, by1 = by0 + o.box.h + 12;
      if (within(r.x, bx0, bx1) && within(r.y, by0, by1)) return 'rice buried in an obstacle';
    }
    if (!reachableOverGap(c, r.x, r.y)) return 'rice unreachable over a pit';
  }

  // The clear runway before this chunk belongs to the previous one, so nothing
  // may be placed behind the chunk origin. Placing AT the origin is a valid
  // design (upper-staircase starts on its first island).
  const firsts = [];
  c.obstacles.forEach(o => firsts.push(o.x));
  c.platforms.forEach(p => firsts.push(p.x));
  c.gaps.forEach(g => firsts.push(g.x));
  if (firsts.length && Math.min(...firsts) - origin < -1) return 'geometry intrudes before the chunk origin';

  return null;
}

// --------------------------------------------------------------------- score
function score(c, origin, band, family) {
  const len = extent(c, origin);
  const ground = c.obstacles.filter(o => !o.float);
  const riceCount = c.rice.length + c.risk.reduce((a, r) => a + r.n, 0);
  let s = 0;

  // Dead air reads as an unfinished chunk.
  s += 2.2 * (1 - Math.min(1, deadRatio(c, origin, len) * 1.6));

  // Density fit for the family's job.
  const nGeo = c.obstacles.length + c.platforms.length + c.gaps.length;
  switch (family) {
    case 'reward':
      s += riceCount >= 14 ? 2 : riceCount >= 9 ? 1 : 0;
      s -= c.obstacles.length * 1.5;
      break;
    case 'obstacle':
      s += ground.length >= 2 && ground.length <= 5 ? 2 : ground.length === 1 ? .5 : -1;
      break;
    case 'gap':
      s += c.gaps.length >= 1 && c.platforms.length >= 2 ? 2 : 0;
      break;
    case 'platform':
      s += c.platforms.length >= 3 ? 2 : c.platforms.length >= 2 ? 1 : 0;
      break;
    default:
      s += nGeo >= 4 && nGeo <= 9 ? 2 : nGeo >= 3 ? 1 : 0;
  }

  // Variety: mixed obstacle kinds and stacked platform heights read as design.
  const kinds = new Set(c.obstacles.map(o => o.kind));
  s += Math.min(2, Math.max(0, kinds.size - 1) * .8);
  const heights = new Set(c.platforms.map(p => Math.round(p.y / 40)));
  s += Math.min(1.5, Math.max(0, heights.size - 1) * .5);

  // Rhythm: ground obstacles spaced near-evenly feel authored; wild clumping
  // does not.
  if (ground.length >= 3) {
    const xs = ground.map(o => o.x).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const m = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - m) ** 2, 0) / gaps.length);
    const cv = m > 0 ? sd / m : 0;
    s += cv < .45 ? 1.4 : cv < .75 ? .7 : 0;
  }

  // Safety margin: comfortable but not trivial.
  if (ground.length) {
    let worst = 1;
    for (const o of ground) {
      const { width, budget } = obstacleClearance(o, band);
      if (budget > 0) worst = Math.min(worst, (budget - width) / budget);
    }
    s += worst >= .10 ? Math.min(1.2, worst * 3) : -1.5;
  }

  if (len / band > 13) s -= (len / band - 13) * .25;
  return s;
}

// -------------------------------------------------------- diversity signature
function signature(c, origin) {
  const v = new Set();
  const q = x => Math.round((x - origin) / 32);
  c.obstacles.forEach(o => v.add('o' + o.kind + q(o.x) + '_' + q(o.y || 0) + (o.motion ? 'm' : '')));
  c.platforms.forEach(p => v.add('p' + q(p.x) + '_' + q(p.y)));
  c.gaps.forEach(g => v.add('g' + q(g.x) + '_' + q(g.w)));
  c.rice.forEach(r => v.add('r' + q(r.x) + '_' + Math.round(r.y / 24)));
  return v;
}

/** Jaccard distance: 0 identical, 1 shares nothing. */
function distance(a, b) {
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return 1 - inter / Math.max(1, a.size + b.size - inter);
}

// --------------------------------------------------------------- serialisation
const strings = [];
const stringIndex = new Map();
function intern(s) {
  if (!stringIndex.has(s)) { stringIndex.set(s, strings.length); strings.push(s); }
  return stringIndex.get(s);
}
const r1 = v => Math.round(v * 10) / 10;

function serialize(c, origin, meta) {
  return {
    id: meta.id,
    base: intern(meta.baseId),
    family: intern(meta.family),
    min: meta.min,
    name: meta.name, role: meta.role, chain:!!meta.chain, handcrafted:!!meta.handcrafted, intent:meta.intent, skills:meta.skills||[], topology: meta.topology, motif: meta.motif,
    actions: meta.actions || [], optional: meta.optional || [],
    riskRoute: !!meta.riskRoute, recovery: meta.recovery || "short", event: meta.event || "",
    speed: meta.speed,
    score: Math.round(meta.score * 100) / 100,
    len: Math.round(extent(c, origin)),
    devices: (meta.devices || []).map(intern),
    intro: meta.intro ? intern(meta.intro) : -1,
    requires: (meta.requires || []).map(intern),
    trial: meta.trial ? 1 : 0,
    o: c.obstacles.map(o => [intern(o.kind), r1(o.x - origin), o.opts]),
    p: c.platforms.map(p => [r1(p.x - origin), r1(p.y), r1(p.w), p.opts || {}]),
    g: c.gaps.map(g => [r1(g.x - origin), r1(g.w)]),
    r: c.rice.map(x => [r1(x.x - origin), r1(x.y), intern(x.kind)]),
    k: c.risk.map(x => [r1(x.x - origin), r1(x.y), x.n, r1(x.dx)]),
    h: c.hints.map(h => [intern(h.kind), r1(h.x - origin)]),
  };
}

// ---------------------------------------------------------------------- main
function main() {

  const api = {
    obstacles: [], platforms: [], gaps: [], rice: [], risk: [], hints: [],
    rand: (a, b) => a + random() * (b - a),
    randInt: (a, b) => Math.floor(a + random() * (b - a + 1)),
    pick: a => a[Math.floor(random() * a.length)],
    scale: () => Math.sqrt(band * .7 / 320),
    speed: () => band,
    baseSpeed: 320,
    groundY: 600,
    tier1: TIER1,
    legalAt,

    hint: (kind, x) => api.hints.push({ kind, x }),
    addObstacle: (kind, x, opt = {}) => {
      const m = manifest.obstacle[kind];
      if (!m) throw new Error('unknown obstacle kind: ' + kind);
      const o = { kind, x, y: 600 - (opt.float || 0) - m.h, w: m.w, h: m.h, box: m.box, motion: opt.motion || 0, float: opt.float || 0, opts: opt };
      api.obstacles.push(o);
      return o;
    },
    addPlatform: (x, y, w, opts = {}) => {
      const p = { x, y: opts.exact ? y : y + (random() * 20 - 10), w: opts.exact ? w : w - random() * 14, opts };
      api.platforms.push(p);
      return p;
    },
    addTrackGap: (x, w) => { const g = { x, w }; api.gaps.push(g); return g; },
    addRice: (x, y, kind = 'rice') => api.rice.push({ x, y, kind }),
    addRiceLine: (x, y, n, dx) => { for (let i = 0; i < n; i++) api.rice.push({ x: x + i * dx, y, kind: 'rice' }); },
    addRiceArc: (x, y, n, dx) => {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? .5 : i / (n - 1);
        api.rice.push({ x: x + i * dx, y: y - Math.sin(t * Math.PI) * (dx * .55 + 26), kind: 'rice' });
      }
    },
    addRiskLine: (x, y, n, dx) => api.risk.push({ x, y, n, dx }),
  };

  let band = BANDS[0];
  const director = {family: p => p.family || 'mixed'};
  const sources = require('./lib/authored-chunks.cjs').create(api).concat(require('./lib/handcrafted-chunks.cjs').create(api));
  const origin = 1000;

  const chunks = [];
  const emitted = new Set();
  let duplicatesRemoved=0,engineRejected=0;
  let proofRejected=0;
  const rejected = {};
  const stats = [];
  const debug = process.argv.includes('--debug');
  const debugRows = [];
  const reject = (why) => { rejected[why] = (rejected[why] || 0) + 1; };

  for (const pattern of sources) {
    const family = director.family(pattern);
    for (band of BANDS) {
      if (pattern.min >= 3 && band < 700) continue;   // gated beats never meet a slow band
      if (pattern.min >= 2 && band < 520) continue;
      const tier = BAND_TIER[band];
      // Fresh variety memory per pattern+band, so curation sees the spread the
      // runtime would see rather than one correlated draw sequence.


      const attempts = pattern.candidates || CANDIDATES;
      const candidates = [];
      let firstProblem = null;
      const localReasons = {};
      for (let attempt = 0; attempt < attempts; attempt++) {
        const c = capture(api, pattern.build, origin, tier);
        // Geometry and rewards are authored together; no hazard dressing.
        const problem = hardReject(c, origin, band, pattern);
        if (problem) {
          if (!firstProblem) firstProblem = problem;
          localReasons[problem] = (localReasons[problem] || 0) + 1;
          reject(problem);
          continue;
        }
        candidates.push({ c, s: score(c, origin, band, family), sig: signature(c, origin) });
      }
      if (debug) {
        const kinds = {};
        for (const cand of candidates) {
          for (const o of cand.c.obstacles) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
        }
        debugRows.push({ pattern: pattern.id, band, tier, candidates: candidates.length, kinds, rejected: localReasons });
      }
      candidates.sort((a, b) => b.s - a.s);

      // Greedy by score, with a diversity floor that relaxes only if this pair
      // cannot otherwise fill its quota.
      // Reward beats are the simplest shapes in the game (a trail and maybe a
      // pit), so ten variants of each buys no variety the player can name —
      // while flooding the early pool, where the player is deciding what kind
      // of game this is. Combinations keep the larger budget.
      const keep = pattern.keep || (family === 'reward' ? 4 : KEEP);
      const kept = [];
      for (const floor of DIVERSITY) {
        for (const cand of candidates) {
          if (kept.length >= keep) break;
          if (kept.includes(cand)) continue;
          if (kept.some(k => distance(k.sig, cand.sig) < floor)) continue;
          kept.push(cand);
        }
        if (kept.length >= keep) break;
      }

      const acceptedBefore=chunks.length;
      kept.forEach((cand, i) => {
        const frozen=serialize(cand.c, origin, {
          id: `${pattern.id}@${band}#${i}`,
          baseId: pattern.id, family, min: pattern.min || 0, speed: band,
          devices: pattern.devices, intro: pattern.intro, requires: pattern.requires,
          trial: pattern.trial, score: cand.s, name: pattern.name, role: pattern.role,
          chain:pattern.chain, handcrafted:pattern.handcrafted,intent:pattern.intent,skills:pattern.skills, topology: pattern.topology, motif: pattern.motif, actions: pattern.requiredActions,
          optional: pattern.optionalActions, riskRoute: pattern.riskRoute, recovery: pattern.recovery, event: pattern.event,
        });
        frozen.landmarks=frozen.handcrafted?frozen.p.map((p,i)=>p[1]<=330?i:-1).filter(i=>i>=0):[];
        const exact = {
          requiredPlatforms:frozen.landmarks.map(i=>frozen.p[i][0]),
          allowDash:frozen.skills.includes('dash'),requireDash:frozen.skills.includes('dash'),allowBounce:frozen.skills.includes('bounce'),requireBounce:frozen.skills.includes('bounce'),
          obstacles:frozen.o.map(([kind,x,opts])=>({kind:strings[kind],x,opts,...manifest.obstacle[strings[kind]]})),
          platforms:frozen.p.map(([x,y,w,opts])=>({x,y,w,opts})),
          gaps:frozen.g.map(([x,w])=>({x,w}))
        };
        const previous=previousById.get(frozen.id);
        const named=(c,S)=>JSON.stringify([c.speed,c.o.map(([k,x,o])=>[S[k],x,o]),c.p,c.g]);
        let proof;
        if(previous&&named(previous,previousData.strings)===named(frozen,strings)&&replay(exact,band,0,previous.proof)){
          proof=Array.from(previous.proof);Object.defineProperty(proof,'positions',{value:Array.from(previous.proofX)});
        }else proof=solve(exact,band);
        const translated = {
          requiredPlatforms:exact.requiredPlatforms.map(x=>x+1000),
          allowDash:exact.allowDash,requireDash:exact.requireDash,allowBounce:exact.allowBounce,requireBounce:exact.requireBounce,
          obstacles:exact.obstacles.map(o=>({...o,x:o.x+1000})),
          platforms:exact.platforms.map(p=>({...p,x:p.x+1000})),
          gaps:exact.gaps.map(g=>({...g,x:g.x+1000}))
        };
        if(!proof || !replay(translated,band,1000,proof)){proofRejected++;return;}
        frozen.proof=proof;frozen.proofX=proof.positions.map(r1);
        const route=ribbon(exact,band,proof);
        frozen.r=route.points.map((p,i)=>[r1(p.x),r1(p.y),intern(i>0&&i%24===0?'bigrice':'rice')]);
        frozen.len=route.end;
        frozen.ribbon={source:'scatter-clusters',minSeparation:82,maxEmptySpan:430,deviation:74};
        const shape=JSON.stringify([frozen.base,band,frozen.o,frozen.p,frozen.g,frozen.r,frozen.k]);
        if(emitted.has(shape)){duplicatesRemoved++;return;}
        emitted.add(shape);
        const certificate=engineCache.entries[engineCertificates.key(frozen,strings)];
        if(certificate&&!certificate.passed){engineRejected++;return;}
        frozen.engineChecked=!!certificate;
        chunks.push(frozen);
      });
      if (chunks.length-acceptedBefore < (family==='reward'?1:3)) {
        stats.push({ pattern: pattern.id, band, kept: chunks.length-acceptedBefore, candidates: candidates.length, reason: firstProblem||"completion/duplicate rejection" });
      }
    }
  }

  const byBand = {}, byFamily = {};
  for (const c of chunks) {
    byBand[c.speed] = (byBand[c.speed] || 0) + 1;
    const f = strings[c.family];
    byFamily[f] = (byFamily[f] || 0) + 1;
  }
  const scores = chunks.map(c => c.score).sort((a, b) => a - b);
  const q = p => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))];

  const out = `/* GENERATED by tools/build_chunks.cjs — do not edit by hand.
 * Frozen, pre-validated runway chunks: each instance was rolled offline by
 * tools/lib/authored-chunks.cjs, passed geometry and completion search, picked for
 * diversity. Replayed at runtime at exactly the band speed it declares.
 * Regenerate with: node tools/build_chunks.cjs
 */
window.DSChunksData = ${JSON.stringify({ version: 3, connector:{spacing:150,heights:[454,558,492],kind:'rice'}, tolerance: SPEED_TOLERANCE, strings, chunks })};
`;
  fs.writeFileSync(path.join(ROOT, 'src/chunks-data.js'), out);

  const report = {
    completion: {passed:chunks.length,rejected:proofRejected,model:"120Hz unupgraded player; full swept hazard envelopes; closed pulse gates; turret shots; input buffers; witnessed dash and bounce where declared; ground exit"},
    chunks: chunks.length,
    patterns: sources.length,duplicatesRemoved,engineRejected,engineChecked:chunks.filter(c=>c.engineChecked).length,
    byBand, byFamily,
    score: { min: q(0), p25: q(.25), median: q(.5), p75: q(.75), max: q(.999) },
    rejected: Object.entries(rejected).sort((a, b) => b[1] - a[1]).slice(0, 12),
    thinPairs: stats,
    bytes: out.length,
  };
  fs.writeFileSync(path.join(ROOT, 'docs/chunk-library.json'), JSON.stringify(report, null, 2));
  if (debug) {
    for (const row of debugRows) console.error('DEBUG', JSON.stringify(row));
  }
  console.log(JSON.stringify({...report,thinPairs:report.thinPairs.length}, null, 2));
  if (!chunks.length) { console.error('no chunks materialised'); process.exitCode = 1; }
}

main();
