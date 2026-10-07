/* The single reachability / clearance audit for runway geometry.
 *
 * tools/build_chunks.cjs refuses to materialise a layout that fails it, and
 * tools/verify_chunks.cjs re-runs it on the frozen library. Sharing one
 * implementation is the point: a rule that lives in two places drifts, and the
 * audit is the only thing standing between a rolled layout and a player.
 *
 * The numbers it encodes are the game's jump contract, mirrored from
 * src/game.js the same way tools/verify_balance.py mirrors them:
 *   JUMP_V -1020, GRAVITY 2200, FALL_MUL 1.55, player box width 53, CLEAR_SLACK 30,
 *   and the pattern scaling k = sqrt(speed/320) (jump arcs grow with sqrt(speed)).
 */
'use strict';

const GRAVITY = 2200;
const JUMP_V = 1020;
const FALL_MUL = 1.55;
const PLAYER_W = 53;
const CLEAR_SLACK = 30;

// ---- spring reachability --------------------------------------------------
// The spring is the one pickup whose whole reason to exist is HEIGHT, and its
// launch (-1120) is WEAKER than a jump plus a double jump (236px + 105px =
// 342px against the spring's 285px). So a spring is decorative unless it can be
// followed by a double jump into a place neither can reach alone: 285 + 105 =
// 390px, i.e. feet between y 210 and y 258. Anything a plain jump reaches makes
// the spring a piece of scenery the player bounces off for no reason — which is
// exactly how it shipped until this rule existed.
const SPRING_V = 1120;
const DJUMP_V = 860;
const DJ_RISE_G = 1.6;
const GROUND_Y = 600;
const JUMP_H = JUMP_V ** 2 / (2 * GRAVITY);
const DJ_H = DJUMP_V ** 2 / (2 * DJ_RISE_G * GRAVITY);
/** Highest platform y a jump + double jump can land on. */
const DJ_CEILING = GROUND_Y - (JUMP_H + DJ_H);
/** Highest platform y a spring + double jump can land on. */
const SPRING_CEILING = GROUND_Y - (SPRING_V ** 2 / (2 * GRAVITY) + DJ_H);

/** Null when every spring is load-bearing, else the reason it is not. */
function springProblem(kinds, platforms) {
  if (kinds.indexOf('spring') < 0) return null;
  const gated = platforms.some(p => p.y <= DJ_CEILING);
  if (gated) return null;
  return `spring with nothing above the double-jump ceiling (feet y<=${Math.round(DJ_CEILING)}) to reach`;
}

/** Earliest/latest landing model used by the platform-route search. */
function makeReachable(platforms, gaps) {
  return function reachable(speed) {
    if (!gaps.length) return true;
    const nodes = [];
    let left = -500;
    for (const g of gaps) { nodes.push({ x: left, w: g.x - left, y: 600 }); left = g.x + g.w; }
    nodes.push({ x: left, w: 1200, y: 600 });
    const goal = nodes.at(-1);
    nodes.push(...platforms);
    nodes.sort((a, b) => a.x - b.x);
    const earliest = new Map([[nodes[0], nodes[0].x + 20]]);
    const k = Math.sqrt(speed / 320);
    for (let pass = 0; pass < nodes.length; pass++) for (const from of nodes) {
      if (!earliest.has(from)) continue;
      for (const to of nodes) {
        if (to === from || to.x + to.w < earliest.get(from) + 20) continue;
        for (const power of [.85, .9, 1]) {
          const v = JUMP_V * power, A = v * v / (2 * GRAVITY), up = from.y - to.y;
          if (up > A) continue;
          const flight = (v / GRAVITY + Math.sqrt(2 * (A - up) / (GRAVITY * FALL_MUL))) / k * speed;
          const lo = Math.max(to.x + 20, earliest.get(from) + flight);
          const hi = Math.min(to.x + to.w - 20, from.x + from.w - 20 + flight);
          if (lo <= hi && lo < (earliest.get(to) ?? Infinity)) earliest.set(to, lo);
        }
      }
    }
    return earliest.has(goal);
  };
}

/** Ground clearance a single obstacle demands of one jump arc, and what it gets. */
function obstacleClearance(o, speed) {
  const width = o.box.w + 2 * (o.motion || ({ patrol: 22, mine: 24 }[o.kind] || 0));
  const h = o.h - o.box.y + ({ mine: 26, patrol: 5, cargo: 3 }[o.kind] || 0);
  const enter = (JUMP_V - Math.sqrt(JUMP_V ** 2 - 2 * GRAVITY * h)) / GRAVITY;
  const exit = JUMP_V / GRAVITY + Math.sqrt(2 * (JUMP_V ** 2 / (2 * GRAVITY) - h) / (GRAVITY * FALL_MUL));
  const budget = Math.sqrt(320 * speed) * (exit - enter) - PLAYER_W - CLEAR_SLACK;
  return { width, budget };
}

module.exports = { makeReachable, obstacleClearance, springProblem,
  GRAVITY, JUMP_V, FALL_MUL, PLAYER_W, CLEAR_SLACK,
  SPRING_V, DJUMP_V, DJ_RISE_G, GROUND_Y, DJ_CEILING, SPRING_CEILING };
