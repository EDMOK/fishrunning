/* Legacy reference only: not loaded by index.html or the prefab compiler. */
/* Shapes a rice trail can take.
 *
 * Reward used to mean a straight line or a single sine arc, which is why every
 * collectible ribbon on the track looked like every other one. These are the
 * same emitters the game already had, generalised: a shape writes `n` rice
 * positions starting at (x, y), where y is the LOWEST point of the trail and
 * `amp` how far above it the trail climbs.
 *
 *   shape(x, y, n, dx, amp, emit)   emit(px, py)
 *
 * Everything is expressed as a function so the frozen-chunk builder, the
 * runtime patterns and the browser all use one implementation.
 */
(function (global) {
  'use strict';

  function arc(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? .5 : i / (n - 1);
      emit(x + i * dx, y - Math.sin(t * Math.PI) * amp);
    }
  }

  /** Two to three full periods — the trail a fish leaves. */
  function wave(x, y, n, dx, amp, emit) {
    var periods = 1.6 + Math.min(1.4, amp / 110);
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      emit(x + i * dx, y - (1 + Math.sin(t * Math.PI * 2 * periods)) / 2 * amp);
    }
  }

  /** Sharp switchbacks: three points per period, readable at speed. */
  function zigzag(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      var tri = Math.abs(((t * 2) % 1) * 2 - 1);
      emit(x + i * dx, y - (1 - tri) * amp);
    }
  }

  /** A staircase up or down, in three visible steps. */
  function stair(x, y, n, dx, amp, emit) {
    var down = amp < 0;
    var height = Math.abs(amp);
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      var step = Math.floor(t * 3) / 3;
      emit(x + i * dx, y - (down ? 1 - step : step) * height);
    }
  }

  /** Down into a valley and back up. */
  function vee(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? .5 : i / (n - 1);
      emit(x + i * dx, y - amp * Math.abs(t * 2 - 1));
    }
  }

  /** Up over a peak and back down. */
  function peak(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? .5 : i / (n - 1);
      emit(x + i * dx, y - amp * (1 - Math.abs(t * 2 - 1)));
    }
  }

  /** A bouncing ball: two arcs, the second lower and shorter. */
  function bounce(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? .5 : i / (n - 1);
      var height = Math.abs(Math.sin(t * Math.PI * 2.2)) * (1 - t * .35);
      emit(x + i * dx, y - height * amp);
    }
  }

  /** Alternating high and low rungs. */
  function ladder(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) emit(x + i * dx, y - (i % 2 ? amp : 0));
  }

  /** Dense head, thinning tail, climbing — reads as something in flight. */
  function comet(x, y, n, dx, amp, emit) {
    var at = 0;
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      emit(x + at, y - amp * (1 - t));
      at += dx * (0.55 + t * 1.7);
    }
  }

  /** Flat plateau with steep shoulders — a deliberate hold at the top. */
  function ridge(x, y, n, dx, amp, emit) {
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? .5 : i / (n - 1);
      var rise = Math.min(1, Math.max(0, t / .16));
      var fall = Math.min(1, Math.max(0, (1 - t) / .16));
      emit(x + i * dx, y - amp * Math.min(rise, fall));
    }
  }

  var SHAPES = { arc: arc, wave: wave, zigzag: zigzag, stair: stair, vee: vee,
    peak: peak, bounce: bounce, ladder: ladder, comet: comet, ridge: ridge };
  var NAMES = Object.keys(SHAPES);

  global.DSRewardShapes = {
    shapes: SHAPES,
    names: NAMES,
    /** A shape chosen at random; `except` avoids repeating the previous one. */
    pick: function (rand, except) {
      var pool = NAMES.filter(function (n) { return n !== except; });
      return pool[Math.min(pool.length - 1, Math.floor(rand(0, 1) * pool.length))];
    },
  };
})(window);
