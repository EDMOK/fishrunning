/* Legacy reference only: not loaded by index.html or the prefab compiler. */
/* Base runway patterns — the beats authored directly for the city track.
 *
 * Extracted verbatim from game.js so the frozen chunk builder can reach them:
 * a pattern is AUTHORING DATA, and the runtime must not be the only thing that
 * can roll it. Everything it needs from the host arrives through `api`; the
 * geometry, ids, tiers and rice layouts are unchanged.
 */
(function(global){
  'use strict';
  function create(a){
    var rand=a.rand, randInt=a.randInt, pick=a.pick;
    var addObstacle=a.addObstacle, addPlatform=a.addPlatform, addTrackGap=a.addTrackGap;
    var addRice=a.addRice, addRiceArc=a.addRiceArc, addRiceLine=a.addRiceLine, addRiskLine=a.addRiskLine;
    var hint=a.hint, groundY=a.groundY, legalAt=a.legalAt;
    var BASE_SPEED=a.baseSpeed, TIER1=a.tier1;
    function speed(){return a.speed();}
    // Deliberately a forwarder rather than a captured reference: hosts swap the
    // variant memory (the chunk builder starts a fresh one per pattern+band).
    function variedObstacle(list){return a.variedObstacle(list);}
    // Reward trails come from the shared shape library, so the base beats draw
    // from the same vocabulary as the shared route patterns.
    var SHAPES = (typeof window !== 'undefined' && window.DSRewardShapes) || null;
    var lastShape = null;
    function shape(x, y, n, dx, amp, name) {
      var which = name || (SHAPES ? SHAPES.pick(rand, lastShape) : 'arc');
      lastShape = which;
      var fn = SHAPES && SHAPES.shapes[which];
      if (!fn) { addRiceArc(x, y, n, dx); return; }
      fn(x, y, n, dx, amp, function (px, py) { addRice(px, py); });
    }
    return [
    // one obstacle with a rice arc over it — the bread-and-butter beat
    { id: 'single', min: 0, build: function (x, t) {
      var o = addObstacle(variedObstacle(legalAt(t)), x);
      addRiceArc(x - 40, groundY - o.h - 46, 5, 46);
    } },

    // pure reward: a fat arc of rice and no obstacle at all, a free breather
    // A short reward trail in any of the shape library's forms.
    { id: 'rice', min: 0, build: function (x) {
      var n = randInt(5, 9), dx = rand(48, 62);
      shape(x, groundY - rand(110, 230), n, dx, rand(50, 130));
    } },
    // The named wave keeps its identity but now runs several periods, so the
    // trail reads as a wave rather than as one hump.
    { id: 'wave-trail', min: 0, build: function (x) {
      var n = randInt(8, 12), dx = rand(48, 62);
      shape(x, groundY - rand(110, 190), n, dx, rand(70, 140), 'wave');
    } },
    { id: 'fork-trail', min: 1, build: function (x) {
      var o = addObstacle(variedObstacle(['patrol', 'mine', 'crystals']), x + 110);
      addRiceLine(x - 50, groundY - 55, 3, 43);
      addRiceArc(x + 50, groundY - o.h - 65, randInt(4, 6), 48);
      addRice(x + 150, groundY - o.h - 140, 'bigrice');
    } },

    // A real break in the runway crossed by a row of small, one-way cloud
    // islands. Their tops use the same walkable y as the landing simulation.
    { id: 'cloud-bridge', min: 0, build: function (x) {
      var start = x + 110;
      var step = Math.sqrt(speed() / BASE_SPEED);
      addTrackGap(start, 980 * step);
      addPlatform(start - 70 * step, groundY - 65, 145 * step);
      addPlatform(start + 205 * step, groundY - 132, 165 * step);
      addPlatform(start + 500 * step, groundY - 83, 155 * step);
      addPlatform(start + 785 * step, groundY - 122, 150 * step);
      addRiceArc(start + 205 * step, groundY - 205, 4, 52 * step);
      addRice(start + 570 * step, groundY - 165);
      addRiceArc(start + 785 * step, groundY - 190, 3, 48 * step);
      hint('gap', start - 360);
    } },

    // A shorter alternate island route keeps the skyline varied after the
    // opening while preserving broad, readable landing zones.
    { id: 'island-hop', min: 1, build: function (x) {
      var start = x + 125;
      var step = Math.sqrt(speed() / BASE_SPEED);
      addTrackGap(start, 890 * step);
      addPlatform(start - 60 * step, groundY - 60, 150 * step);
      addPlatform(start + 220 * step, groundY - 135, 155 * step);
      addPlatform(start + 515 * step, groundY - 80, 160 * step);
      addPlatform(start + 750 * step, groundY - 130, 150 * step);
      addRiceArc(start + 220 * step, groundY - 205, 4, 50 * step);
      addRiceArc(start + 760 * step, groundY - 195, 3, 48 * step);
      hint('gap', start - 360);
    } },

    // Choice of a safe approach line and a higher-value jump route.
    { id: 'choice', min: 1, build: function (x) {
      var o = addObstacle(variedObstacle(TIER1), x + 120);
      addRiceLine(x - 105, groundY - 94, 3, 42);
      addRiskLine(x + 20, groundY - o.h - 75, 5, 48);
    } },

    // a tall wall, with a big rice floating over the top of it. Tiers 2+ only:
    // the pool is the genuinely tall set, which needs the faster arc to clear.
    { id: 'tall', min: 2, build: function (x, t) {
      var tall = ['turret'].concat(t >= 3 ? ['gate', 'sentry'] : []);
      var o = addObstacle(variedObstacle(tall), x);
      addRice(x + o.w / 2 - 30, groundY - o.h - 74, 'bigrice');
      addRiceArc(x - 30, groundY - o.h - 40, 3, 46);
    } },

    // floating hazard: the only way through is to slide
    { id: 'float', min: 2, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6 });
      addRiceLine(x - 70, groundY - 56, 3, 46);
      addRiceLine(x + 160, groundY - 56, 2, 46);
    } },

    // The sweeping drone shifts its horizontal timing but keeps the slide lane
    // open throughout its cycle. A ground mine makes a separate second action.
    { id: 'sweep-and-hop', min: 2, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6, motion: 78 });
      addObstacle('mine', x + 680);
      addRiceLine(x + 200, groundY - 55, 4, 48);
    } },

    // A moving ground hazard has a wide but still single-jumpable envelope.
    { id: 'moving-mine', min: 2, build: function (x) {
      var o = addObstacle('mine', x, { motion: 38 });
      addRiceArc(x - 72, groundY - o.h - 72, 6, 48);
    } },

    // slide under, then a wall much further along: two separate actions
    { id: 'slide-then-wall', min: 2, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6 });
      addObstacle(pick(['crystals', 'mine']), x + 620);
      addRiceLine(x + 200, groundY - 150, 4, 48);
    } },

    // A sliding corridor with two spaced verification bars. The floor line
    // teaches the safe route; its centre rice is worth a little more.
    { id: 'slide-corridor', min: 3, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6 });
      addObstacle('drone', x + 580, { float: 142, bob: 6 });
      addRiskLine(x + 180, groundY - 56, 5, 46);
    } },

    // The tight pair is held back to the final tier.
    { id: 'pair', min: 4, build: function (x) {
      addObstacle('patrol', x);
      addObstacle('patrol', x + 80);
      addRiceArc(x - 10, groundY - 185, 6, 44);
    } },

    // ---- predictable dynamic hazard beats ---------------------------------
    // These reuse the existing obstacle language: only the motion rule changes.
    // Each beat teaches one visual rhythm before the director can combine it.
    { id: 'pulse-firewall', min: 3, build: function (x) {
      addObstacle('gate', x, { trap: 'pulse', trapCycle: 4.2 });
      addRiceArc(x - 52, groundY - 210, 5, 48);
      hint('pulse', x - 230);
    } },
    { id: 'swing-cable', min: 3, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6, trap: 'cable', trapCycle: 2.7, soft: true });
      addRiceLine(x - 90, groundY - 56, 4, 48);
      hint('cable', x - 230);
    } },
    { id: 'patrol-scout', min: 4, build: function (x) {
      addObstacle('drone', x, { float: 160, bob: 6, trap: 'scout', trapCycle: 3.1, soft: true });
      addObstacle('mine', x + 720);
      addRiceLine(x + 180, groundY - 55, 5, 48);
      hint('scout', x - 230);
    } },
    { id: 'collapse-hop', min: 3, family: 'gap', build: function (x) {
      var p = addPlatform(x + 90, groundY - 115, 220, { collapse: true, collapseDelay: .72 });
      addTrackGap(x + 20, 520);
      addPlatform(x + 430, groundY - 78, 180);
      addRiceArc(p.x + 30, p.y - 125, 5, 48);
      hint('gap', x - 250);
    } },
    { id: 'pulse-reward', min: 3, build: function (x) {
      addObstacle('gate', x, { trap: 'pulse', trapCycle: 4.2 });
      addRiskLine(x + 180, groundY - 184, 6, 46);
      addObstacle('mine', x + 760);
      addRiceLine(x + 300, groundY - 55, 3, 48);
      hint('pulse', x - 230);
    } },
    { id: 'cable-switch', min: 3, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6, trap: 'cable', trapCycle: 2.7, soft: true });
      addObstacle('crystals', x + 620);
      addRiskLine(x + 160, groundY - 148, 5, 50);
      hint('cable', x - 230);
    } },
    { id: 'scout-cross', min: 4, build: function (x) {
      addObstacle('drone', x, { float: 160, bob: 6, trap: 'scout', trapCycle: 3.1, soft: true });
      addObstacle('drone', x + 640, { float: 142, bob: 6 });
      addObstacle('mine', x + 1140);
      addRiceArc(x + 220, groundY - 190, 5, 48);
      addRiceLine(x + 820, groundY - 55, 4, 48);
      hint('scout', x - 230);
    } },
    { id: 'collapse-chain', min: 4, family: 'gap', build: function (x) {
      var first = addPlatform(x + 80, groundY - 112, 205, { collapse: true, collapseDelay: .68 });
      addTrackGap(x + 20, 920);
      addPlatform(x + 370, groundY - 78, 175, { collapse: true, collapseDelay: .82 });
      addPlatform(x + 700, groundY - 130, 180);
      addRiceArc(first.x + 30, first.y - 130, 4, 48);
      addRiceArc(x + 700, groundY - 205, 4, 48);
      hint('gap', x - 250);
    } },

    // ---- optional verb beats ----------------------------------------------
    // These remain clearable by jumping alone; the new verbs are optional.

    // Stomp chain: three separated obstacles that reward a bounce plus a
    // corrective double jump.
    { id: 'stomp-chain', min: 2, build: function (x) {
      for (var i = 0; i < 3; i++) {
        addObstacle('patrol', x + i * 420);
        addRiceArc(x + i * 420 - 54, groundY - 150, 3, 44);
      }
      hint('stomp', x + 120);
    } },

    // Glide trail: a long high hammock of rice with nothing under it. Only a
    // glide holds the altitude for the whole span, and because the beat has no
    // obstacle there is nothing a long float can overshoot into.
    { id: 'glide-trail', min: 1, build: function (x) {
      // A ridge: flat hold at the top, which is exactly what a glide buys.
      shape(x, groundY - 150, 9, rand(66, 78), rand(120, 165), 'ridge');
      addRiceLine(x + 60, groundY - 74, 3, 46);
      hint('glide', x);
    } },

    // Dash lane: ONE plug with a ribbon of rice threaded through it at shin
    // height. Jumping the plug means dropping the ribbon; running it means
    // eating the hit; a dash takes both in one pass. Deliberately a single
    // obstacle — two of them close enough to share one dash would sit inside
    // CHAIN_GAP and merge into a cluster no jump arc can span.
    { id: 'dash-lane', min: 3, build: function (x) {
      addObstacle('mine', x);
      addRiskLine(x - 90, groundY - 46, 5, 74);
      hint('dash', x + 60);
    } }
    ];
  }
  global.DSBasePatterns={create:create};
})(window);
