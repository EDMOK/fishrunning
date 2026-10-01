/* DeepSeek 娘 · 白饭大冲刺 — endless runner
 * Everything is drawn into a fixed 1280x720 virtual canvas that is CSS-scaled to fit.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  var VW = 1280, VH = 720;
  var mobileRender = window.matchMedia('(pointer:coarse)').matches;
  var GROUND_Y = 600;          // world y of the walkable surface
  var PLAYER_X = 300;          // screen x the heroine is pinned to

  // Slow opening and a long ramp: the run reaches full speed only after a while,
  // so a session starts as a readable rhythm rather than a reaction test.
  var BASE_SPEED = 320, MAX_SPEED = 665, RAMP_DIST = 15000;
  var GRAVITY = 2200;
  // Sized so the tallest obstacle (147px) clears with margin to spare at the
  // slowest speed it appears at. tools/verify_balance.py proves it.
  var JUMP_V = -1020;
  // The second jump is a compact corrective hop with a real parabola: it rises a
  // touch faster than the first jump but comes down GENTLY, so it reads as an arc
  // rather than a slam. The old version multiplied the fall gravity of the first
  // jump by another 1.7x on top of the usual fall boost, which is why it dropped
  // like a stone.
  var DJUMP_V = -860;
  var DJ_RISE_G = 1.6;         // gravity multiplier while the second jump rises
  var DJ_FALL_MUL = 1.3;       // its own descent gravity; the first jump uses FALL_MUL
  var FALL_MUL = 1.55;         // extra gravity while descending, kills floatiness
  var FASTFALL_MUL = 2.4;      // while holding down in the air
  var JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'];
  var COYOTE = 0.12, JUMP_BUFFER = 0.16;
  var SLIDE_MIN = 0.32;

  // ---- verbs beyond jump & slide --------------------------------------------
  // Dash bends how much GROUND the runner covers, never `speed` itself: speed
  // feeds jumpK(), gapFor() and the audio intensity, and the level generator
  // reads gapFor() live, so bending it would stretch the next patterns and shift
  // every jump arc for the rest of the run. See the travel calculation in
  // update().
  var DASH_T = 0.34, DASH_GRACE = 0.2, DASH_CD = 2.6, DASH_TRAVEL = 1.9;
  var DASH_SCORE = 14;
  // Stomp: bounce off a breakable obstacle. Scaled by k like the jumps are,
  // because gravity already carries k^2 — without it a late-game stomp barely
  // leaves the lid (111px at k=1, 59px at k=1.89).
  var STOMP_V = -700, STOMP_CHAIN_MAX = 3, STOMP_SCORE = 30;
  // Glide: hold jump past the apex. The stamina cap is the fairness dial, not a
  // taste call — extra airtime can carry the runner over a whole beat, so it is
  // bounded below one pattern gap and is always cancellable with ↓, which turns
  // straight back into the existing fast-fall. tools/verify_balance.py section
  // 2c models the worst case.
  var GLIDE_MAX = 0.9, GLIDE_G = 0.22, GLIDE_VMAX = 190;

  // ---- camera ---------------------------------------------------------------
  // The world is drawn smaller than the canvas so the runway reads long and you
  // can see what is coming. This is purely presentational: collision boxes, spawn
  // distances and speeds all stay in world units, so the zoom cannot alter the
  // difficulty. It only changes how much of the track fits on screen.
  var ZOOM = 0.78;
  var GROUND_SCREEN_Y = 600;                 // where the ground line sits on screen
  var WORLD_OX = 0, WORLD_OY = GROUND_SCREEN_Y - GROUND_Y * ZOOM;
  var VIEW_W = VW / ZOOM;                    // world units visible across

  var COMBO_TIME = 3.4;
  var INVULN = 2.2;
  var START_LIVES = 3;

  // Collection reach. A pickup is taken when the circle around the runner's
  // centre overlaps the pickup's own radius plus this much slack, so these are
  // "how close you have to get", not art sizes — the sprite sizes come from
  // addRice/addPower. Kept a touch generous on purpose: the runner is moving at
  // up to 665px/s, and a graze that visibly touches the bowl should count.
  var RICE_REACH = 46, POWER_REACH = 44;

  // Hero sprites. `g` is where the notional foot line sits inside the image;
  // airborne poses have the legs tucked, so their bbox bottom is not the feet.
  var HERO_FRAMES = {
    run_a: { g: 1.00 }, run_b: { g: 1.00 }, run_c: { g: 1.00 },
    idle: { g: 1.00 }, jump: { g: 0.86 }, djump: { g: 0.86 }, apex: { g: 0.86 },
    fall: { g: 0.93 }, hurt: { g: 1.00 }, cheer: { g: 1.00 }, slide: { g: 1.00 }
  };
  var RUN_CYCLE = ['run_a', 'run_b', 'run_c', 'run_b'];

  // Collision boxes are fitted to each sprite's silhouette and shipped in
  // assets/manifest.json; sprite canvases are not tight.
  var OBS = {};
  var HERO_BOX = null;   // {stance, slide, slideW, slideH, designH}
  var TIER1 = ['patrol', 'crystals', 'mine'];
  var ALL_OBSTACLES = TIER1.concat(['drone', 'turret', 'gate', 'sentry']);

  // The earliest tier each obstacle may appear at. The tall obstacles are held
  // back because they are near the ceiling of what one jump clears, so they need
  // the faster (therefore longer) arc that later tiers provide. Patterns must
  // respect this, otherwise the clearance audit fires on a layout that was
  // generated with an obstacle one tier too early.
  var OBS_MIN_TIER = {
    patrol: 0, crystals: 0, mine: 0,
    drone: 2, turret: 2,
    gate: 3, sentry: 3
  };
  function legalAt(t) {
    return ALL_OBSTACLES.filter(function (k) { return OBS_MIN_TIER[k] <= t; });
  }

  // Stomp and dash destroy only breakable ground obstacles; floating and event
  // hazards remain separate threats.
  var BREAKABLE = { patrol: 1, crystals: 1, mine: 1, drone: 1, turret: 1 };
  function breakable(o) {
    return !o.bob && !o.eventHazard && !!BREAKABLE[o.kind];
  }

  var POWERS = ['chip', 'shield', 'magnet', 'overclock'];
  // `label` is the HUD caption and `col` the aura colour; `dur: 0` means "no
  // timer, consumed on use" (shield). Adding a powerup should mean editing this
  // table and nothing else, so every list of "the timed ones" is derived below
  // rather than written out again.
  var POWER_INFO = {
    chip: { dur: 6.0, label: 'GPU 加速', col: '255,201,82' },
    shield: { dur: 0, label: '防火墙', col: '86,171,222' },
    magnet: { dur: 9.0, label: '数据吸附', col: '231,133,166' },
    overclock: { dur: 8.0, label: '超频 得分×2', col: '244,176,61' }
  };
  var TIMED_POWERS = POWERS.filter(function (k) { return POWER_INFO[k].dur > 0; });

  /** A fresh timer table: every timed power at zero. */
  function zeroPowers() {
    var t = {};
    for (var i = 0; i < TIMED_POWERS.length; i++) t[TIMED_POWERS[i]] = 0;
    return t;
  }

  // ------------------------------------------------------- content (memes.js)
  // Content lives in src/memes.js as plain data; the engine interprets it.
  var M = (typeof window !== 'undefined' && window.DSMemes) || null;
  var ZONES = (M && M.ZONES) || [{ id: 'city', name: '', at: 0, layers: null, rule: null, mascot: 'deepseek' }];
  var EVENTS = (M && M.EVENTS) || [];
  var SHOP_SKILLS = (M && M.SHOP_SKILLS) || [];
  // ---- run modifiers -------------------------------------------------------
  // A single place where every event effect lands. Timed events push an entry
  // here and pop it when they expire; shop upgrades live in skillLevels. All
  // reads go through the helpers just below, so a new effect only has to be
  // taught to one function.
  //
  // Both modifier lists hold { eval, t }: `perm` entries last for the run,
  // while `timed` entries are dropped when the event that pushed them ends.
  var mods = { timed: [], perm: [] };
  var skillLevels = {}, sale = { t: 0, ids: [] };
  var eventDef = null, activeEventMod = null, eventT = 0, lastEventId = '', lastEventGroup = '';
  var lastShopNotice = '';

  function mulOf(key) {
    var v = 1, i;
    for (i = 0; i < mods.perm.length; i++) v *= (mods.perm[i].eval[key] || 1);
    for (i = 0; i < mods.timed.length; i++) v *= (mods.timed[i].eval[key] || 1);
    SHOP_SKILLS.forEach(function (s) {
      var level = skillLevels[s.id] || 0;
      if (s.stat === key && s.mode === 'mul') v *= 1 + level * s.values[0];
    });
    return v;
  }

  var riceFraction = 0;
  function riceGain(base, multiplier) {
    var value = base * multiplier + riceFraction;
    var whole = Math.floor(value + 1e-9);
    riceFraction = value - whole;
    return whole;
  }
  function addOf(key) {
    var v = 0, i;
    for (i = 0; i < mods.perm.length; i++) v += (mods.perm[i].eval[key] || 0);
    for (i = 0; i < mods.timed.length; i++) v += (mods.timed[i].eval[key] || 0);
    SHOP_SKILLS.forEach(function (s) {
      var level = skillLevels[s.id] || 0;
      if (s.stat === key && s.mode === 'add') v += level * s.values[0];
    });
    return v;
  }
  /** Full reset: run over / new run. Drops all event moods. */
  function clearMods() {
    mods.timed.length = 0;
    mods.perm.length = 0;
    eventDef = null; activeEventMod = null; eventT = 0;
  }

  /** Zone change drops the outgoing district mood and active event. */
  function clearDistrictMods() {
    mods.timed.length = 0;
    eventDef = null; activeEventMod = null; eventT = 0;
  }

  // Tags that resolve once and leave nothing behind. Everything else is stored
  // and read back through mulOf/addOf for the rest of its lifetime.
  //
  // Membership matters twice over: a tag listed here is fired by
  // fireInstantTag(), and it is EXCLUDED from the lasting half — so a tag that is
  // in neither place is silently dropped. `magnet` and `lifeAdd` were both in
  // that hole when this list was first written; if an effect "does nothing", the
  // first thing to check is whether its name is here and handled below.
  var INSTANT_TAGS = ['riceRain', 'openAll', 'wall', 'invuln', 'shock', 'lifeAdd',
    'shield', 'shuffle', 'refreshPowers', 'magnet', 'discountShop', 'challenge'];

  /** Split an effect table into instant actions and modifiers kept by the caller. */
  function applyEval(ev, fireInstant) {
    if (!ev) return null;
    var lasting = null;
    for (var k in ev) {
      if (!ev.hasOwnProperty(k)) continue;
      if (INSTANT_TAGS.indexOf(k) < 0) {
        if (!lasting) lasting = {};
        lasting[k] = ev[k];
      } else if (fireInstant) {
        fireInstantTag(k, ev[k]);
      }
    }
    return lasting;
  }

  /**
   * Fail loudly on a typo'd effect tag.
   *
   * memes.js is meant to be edited freely, and an unknown tag is invisible at
   * runtime: it is neither fired nor stored, so the event simply does nothing and
   * nobody notices. This walks the content tables once at boot and names any tag
   * the engine does not understand. Development aid only — it never blocks play.
   */
  var KNOWN_MULT = ['speedMul', 'scoreMul', 'riceMul', 'gapMul', 'powerMul',
    'comboAdd', 'jumpMul', 'glideMul', 'stompMul', 'dashAdd'];

  function auditContentTags() {
    var bad = {};
    function checkEval(ev, where) {
      if (!ev) return;
      for (var k in ev) {
        if (!ev.hasOwnProperty(k)) continue;
        if (INSTANT_TAGS.indexOf(k) < 0 && KNOWN_MULT.indexOf(k) < 0) {
          bad[k] = where;
        }
      }
    }
    EVENTS.forEach(function (e) { checkEval(e.eval, 'event:' + e.id); });
    SHOP_SKILLS.forEach(function (s) {
      checkEval((function () { var e = {}; e[s.stat] = 1; return e; })(), 'shop:' + s.id);
      // The fields that do NOT go through mulOf/addOf need auditing too, because
      // each of them fails silently in its own way: a typo'd instant tag never
      // fires, an unknown category falls back to the first chip colour, and an
      // unknown glyph paints an empty plate in the shop.
      if (s.onBuy) {
        if (INSTANT_TAGS.indexOf(s.onBuy.tag) < 0) bad[s.onBuy.tag] = 'shop:' + s.id + '.onBuy';
      }
      if (s.tag && !TAG_CLASS[s.tag]) bad['category "' + s.tag + '"'] = 'shop:' + s.id;
      if (s.glyph && !GLYPHS[s.glyph]) bad['glyph "' + s.glyph + '"'] = 'shop:' + s.id;
    });
    ZONES.forEach(function (z) { checkEval(z.rule, 'zone:' + z.id); });
    var keys = Object.keys(bad);
    if (keys.length) {
      console.warn('[content] unknown effect tag(s) — these will silently do nothing: ' +
        keys.map(function (k) { return k + ' (' + bad[k] + ')'; }).join(', '));
    }
  }

  /**
   * Report zone backdrops that are declared but did not load.
   *
   * Zone art is optional by design (a partial asset drop still runs, falling back
   * to the original backdrop), which means a misnamed file is INVISIBLE: the game
   * quietly renders the fallback and looks merely less interesting. This is the
   * one place that says so out loud, and it runs once per boot rather than per
   * frame. A zone genuinely without its own art leaves `layers` null and is
   * skipped, so the warning means "declared, missing", never "not applicable".
   */
  function auditZoneArt() {
    var missing = [];
    ZONES.forEach(function (z) {
      if (!z.layers) return;
      ['sky', 'far', 'mid', 'ground'].forEach(function (layer) {
        if (!IMG['bg/zones/' + z.layers + '/' + layer]) {
          missing.push(z.layers + '/' + layer);
        }
      });
    });
    if (missing.length) {
      console.warn('[content] zone art missing, falling back to the default ' +
        'backdrop: ' + missing.join(', '));
    }
  }

  function fireInstantTag(k, v) {
    if (k === 'riceRain') riceRain(v);
    else if (k === 'openAll') openAllObstacles();
    else if (k === 'wall') queueWall(v);
    else if (k === 'invuln') player.invuln = Math.max(player.invuln, v);
    else if (k === 'shock') player.shock = Math.max(player.shock, v);
    else if (k === 'lifeAdd') { game.lives += v; refreshLives(); }
    else if (k === 'shield') player.shield = true;
    else if (k === 'magnet') player.power.magnet = Math.max(player.power.magnet, v * mulOf('powerMul'));
    else if (k === 'discountShop') openDiscountShop();
    else if (k === 'challenge') queueChallenge(v);
    else if (k === 'refreshPowers') refreshAllPowers();
    else if (k === 'shuffle') shufflePowers();
  }

  /** Push every running power back to full duration. */
  function refreshAllPowers() {
    var pm = mulOf('powerMul');
    TIMED_POWERS.forEach(function (k) {
      if (player.power[k] > 0) player.power[k] = POWER_INFO[k].dur * pm;
    });
    player.shield = true;
    popText(camX + PLAYER_X, player.y - 180, '道具全部续期', '#8ff3ff', 30);
  }

  function shufflePowers() {
    if (player.shield || TIMED_POWERS.some(function (k) { return player.power[k] > 0; })) {
      player.power = zeroPowers();
      player.shield = false;
      popText(camX + PLAYER_X, player.y - 180, '道具进垃圾桶了', '#ff9ad2', 30);
      GameAudio.sfx('hit');
    } else {
      player.power.magnet = POWER_INFO.magnet.dur * mulOf('powerMul');
      popText(camX + PLAYER_X, player.y - 180, '反而全体续期', '#8affc1', 30);
      GameAudio.sfx('combo', 3);
    }
  }

  /** A breather burst of rice, dropped in an arc just ahead of the player. */
  function riceRain(n) {
    var x0 = camX + PLAYER_X + 180;
    for (var i = 0; i < n; i++) {
      var x = x0 + i * 74 + rand(-16, 16);
      addRice(x, GROUND_Y - rand(70, 300));
    }
    popText(camX + PLAYER_X, player.y - 200, '白饭雨!', '#ffd166', 34);
  }

  /** "Weights are out": every obstacle on screen turns into something edible. */
  function openAllObstacles() {
    var n = 0;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.dead) continue;
      burst(o.x + o.w / 2, o.y + o.h / 2, {
        n: 14, col: RICE_COL, sp0: 90, sp1: 340, r0: 3, r1: 8, l0: .3, l1: .7, g: 620
      });
      o.dead = true;
      addRice(o.x + o.w / 2, GROUND_Y - Math.min(280, o.h + 90), 'bigrice');
      n++;
    }
    shake(12);
    popText(camX + PLAYER_X, player.y - 210, '权重放出来了!', '#8affc1', 34);
    GameAudio.sfx('shieldBreak');
    if (n) GameAudio.sfx('combo', 4);
  }

  /**
   * A gate the player has to clear — dropped in at a fixed distance ahead.
   *
   * The wall is spawned outside the pattern loop, so unlike generated patterns it
   * is NOT covered by auditPattern(). Landing it on top of an existing obstacle
   * would make an unclearable cluster with no warning in the console, so it
   * walks forward until it finds a genuinely empty slot instead. CLEAR_EITHER_SIDE
   * is the room a full jump needs on each side, which keeps the wall inside one
   * arc no matter what it landed next to.
   */
  var CLEAR_EITHER_SIDE = 320;

  function safeHazardSlot(ahead, width) {
    // Generated content can reach several screens ahead. Never put an event
    // obstacle into an already generated beat or into the next beat's landing zone.
    var at = Math.max(camX + PLAYER_X + ahead, gen.x + CLEAR_EITHER_SIDE);
    for (var guard = 0; guard < 40; guard++) {
      var clash = false;
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (!o.dead && o.x + o.w > at - CLEAR_EITHER_SIDE &&
            o.x < at + width + CLEAR_EITHER_SIDE) { clash = true; at = o.x + o.w + CLEAR_EITHER_SIDE; break; }
      }
      if (!clash) return at;
    }
    return null;
  }

  function queueWall(ahead) {
    var at = safeHazardSlot(ahead, 92);
    if (at === null) return;
    var start = obstacles.length;
    // The event can fire before tall sentries are jumpable at the current speed.
    var kind = tier() >= 3 ? 'sentry' : 'crystals';
    addObstacle(kind, at, { eventHazard: true });
    auditPattern('event-wall', start, obstacles.length, tier());
    gen.x = Math.max(gen.x, at + 92 + gapFor(tier()));
    addRiceArc(at - 60, GROUND_Y - 210, 5, 44);
    popText(camX + PLAYER_X, player.y - 210, '前方设卡', '#ff9ad2', 32);
    GameAudio.sfx('power');
  }

  function queueChallenge(kind) {
    if(kind!=='captcha')return;
    var at=safeHazardSlot(1150,123);
    if(at===null)return;
    addObstacle('drone',at,{float:142,bob:6,eventHazard:true});
    gen.x=Math.max(gen.x,at+123+gapFor(tier()));
    addRiceLine(at-60,GROUND_Y-56,6,48);
  }

  function openDiscountShop() {
    var available = SHOP_SKILLS.filter(function (s) { return (skillLevels[s.id] || 0) < s.costs.length; });
    sale.ids = [];
    // 2-3 of nine: one discount out of a big board is easy to miss, and the whole
    // point of the event is to make the player open the shop and choose.
    var count = randInt(2, 3);
    while (available.length && sale.ids.length < count) {
      sale.ids.push(available.splice(randInt(0, available.length - 1), 1)[0].id);
    }
    sale.t = sale.ids.length ? 12 : 0;
    updateShopNotice();
  }

  function updateShopNotice() {
    var el = document.getElementById('shopNotice');
    if (!el) return;
    var key = sale.t > 0 ? sale.ids.join(',') + '|' + Math.ceil(sale.t) : '';
    if (key === lastShopNotice) return;
    var text = sale.t > 0 ? '限时特价 · ' + sale.ids.map(function (id) {
      return SHOP_SKILLS.filter(function (s) { return s.id === id; })[0].name;
    }).join(' / ') + ' · ' + Math.ceil(sale.t) + '秒' : '';
    el.classList.toggle('on', !!text);
    el.textContent = text;
    lastShopNotice = key;
  }

  // ---- zone director -------------------------------------------------------
  var zoneIdx = -1, zoneBannerT = 0, zoneBanner = '';
  var zoneTransition = { from: -1, t: 0 };
  var zoneGoal = null, completedGoals = 0;

  function progressGoal(kind) {
    if (!zoneGoal || zoneGoal.done || zoneGoal.kind !== kind) return;
    zoneGoal.progress++;
    if (zoneGoal.progress >= zoneGoal.target) {
      zoneGoal.done = true;
      completedGoals++;
      game.score += 60;
      popText(camX + PLAYER_X + 100, GROUND_Y - 275, '分区目标完成 +60', '#ffd166', 26);
      GameAudio.sfx('milestone');
    }
  }

  function zoneAt() {
    var z = 0;
    for(var i=0;i<ZONES.length;i++)if(dist>=ZONES[i].at)z=i;
    return z;
  }

  function enterZone(i, silent) {
    if (i === zoneIdx) return;
    var previous = zoneIdx;
    zoneIdx = i;
    zoneTransition.from = previous;
    zoneTransition.t = 1;
    clearDistrictMods();
    if (typeof hideEventBanner === 'function') hideEventBanner();
    var z = ZONES[i];
    zoneGoal = z.goal ? {
      kind: z.goal.kind, target: z.goal.target, label: z.goal.label,
      progress: 0, done: false
    } : null;
    if (z.rule) {
      // fireInstant: true — a district's one-off grants (the border's extra life)
      // must land on entry. With false they would be classified as instant,
      // skipped, and then dropped for not being lasting, i.e. silently lost.
      var rule = applyEval(z.rule, true);
      // t: Infinity — a district rule lasts until the next district, and is only
      // ever removed by clearDistrictMods()
      if (rule) mods.timed.push({ eval: rule, t: Infinity });
    }
    if (!silent) {
      zoneBanner = z.name + (z.ruleText ? ' · ' + z.ruleText : '');
      zoneBannerT = 4.2;
      GameAudio.sfx('zone');
    }
  }

  // ---- event director ------------------------------------------------------
  var genEvent = { next:7600 };

  function eventGroup(e) {
    if (e.id === 'discount') return 'shop';
    if (e.eval && (e.eval.wall || e.eval.challenge)) return 'hazard';
    if (e.eval && (e.eval.riceRain || e.eval.openAll || e.eval.refreshPowers)) return 'reward';
    return 'mood';
  }

  function nextEventGap() {
    if(dist<14000)return rand(8000,10000);
    if(dist<30000)return rand(6000,8500);
    return rand(4500,7000);
  }

  function fireEvent() {
    // Never overwrite a running modifier or its expiry handle with the next event.
    if (eventDef && eventT > 0) return false;
    var pool = EVENTS.filter(function (e) {
      return e.id !== lastEventId && eventGroup(e) !== lastEventGroup &&
        !(e.id === 'discount' && sale.t > 0);
    });
    if (!pool.length) return false;
    var ev=pick(pool);
    lastEventId = ev.id; lastEventGroup = eventGroup(ev);
    eventDef = ev; eventT = ev.dur || 2.8;
    if (ev.shake) shake(ev.shake);
    if (ev.flash) game.flash = 0.85;

    // An instant event fires everything at once and leaves nothing behind. A
    // timed event fires only its instant half now and remembers the rest, with a
    // handle kept so the banner and the modifier expire together.
    var lasting = applyEval(ev.eval, true);
    if (ev.kind === 'timed' && lasting) {
      activeEventMod = { eval: lasting, t: ev.dur };
      mods.timed.push(activeEventMod);
    }

    GameAudio.sfx('event');
    showEventBanner(ev);
    return true;
  }

  function updateEvent(dt) {
    if (zoneBannerT > 0) zoneBannerT -= dt;
    if (!eventDef) return;
    eventT -= dt;
    if (eventT > 0) return;
    if (activeEventMod) {
      var k = mods.timed.indexOf(activeEventMod);
      if (k >= 0) mods.timed.splice(k, 1);
      activeEventMod = null;
    }
    eventDef = null;
    hideEventBanner();
  }

  // ---- milestones & shop --------------------------------------------------
  var milestone = { next: 1000 };

  function updateMilestones() {
    var step = (M && M.MILESTONE.step) || 1000;
    if (dist >= milestone.next) {
      var reached = Math.floor(dist / step) * step;
      milestone.next = reached + step;
      var words = (M && M.MILESTONE.words) || ['继续'];
      popText(camX + PLAYER_X + 120, GROUND_Y - 300,
        Math.floor(reached / 30) + 'm · ' + words[Math.floor(reached / step) % words.length], '#bff4ff', 26);
      GameAudio.sfx('milestone');
    }
  }

  function shopCost(skill) {
    var level = skillLevels[skill.id] || 0;
    if (level >= skill.costs.length) return null;
    var base = skill.costs[level];
    return sale.t > 0 && sale.ids.indexOf(skill.id) >= 0 ? Math.ceil(base * 0.6) : base;
  }

  function toggleShop() {
    if (game.state === 'playing') {
      game.state = 'shop';
      player.buffer = 0;
      keys = {};
      releasePad(); touchJumpHeld = false;
      GameAudio.duckBgm(true);
      setSelecting(true);
      cx.shop.classList.remove('hide');
      document.getElementById('stage').inert = true;
      renderShop();
      cx.shopStatus.textContent = '跑道已暂停，选好升级再出发。';
      document.getElementById('btnShopClose').focus({ preventScroll: true });
    } else if (game.state === 'shop') {
      game.state = 'playing';
      cx.shop.classList.add('hide');
      document.getElementById('stage').inert = false;
      setSelecting(false);
      GameAudio.duckBgm(false);
      player.invuln = Math.max(player.invuln, 1);
      document.getElementById('btnShop').focus({ preventScroll: true });
    }
  }

  function buySkill(skill) {
    if (game.state !== 'shop') return;
    var price = shopCost(skill);
    if (price === null || game.rice < price) return;
    game.rice -= price;
    skillLevels[skill.id] = (skillLevels[skill.id] || 0) + 1;
    // A skill whose value cannot be expressed as a lasting multiplier (an extra
    // life) pays out through the same instant-tag path the events use, so there
    // is exactly one implementation of "grant a life".
    if (skill.onBuy) fireInstantTag(skill.onBuy.tag, skill.onBuy.v);
    topUpCharges();
    GameAudio.sfx('card');
    updateHud();
    renderShop();
    cx.shopStatus.textContent = '已升级「' + skill.name + '」至 Lv.' + skillLevels[skill.id] + '，剩余 ' + game.rice + ' 白饭。';
  }

  /**
   * Skill icons that have no art file, drawn once at boot.
   *
   * Adding files to PATHS.item instead would be worse than it looks: the loader
   * REJECTS the boot if any listed file is missing, so every new item would need
   * a real PNG in the repo. These are flat shapes in the same palette, cached as
   * data URLs so the shop's single `<img src>` path works unchanged.
   */
  var glyphCache = {};
  // Named so auditContentTags() can tell a valid glyph from a typo.
  var GLYPHS = { bolt: 1, hammer: 1, wing: 1, chart: 1 };

  function glyphURL(kind) {
    if (glyphCache[kind]) return glyphCache[kind];
    var S = 96, c = document.createElement('canvas');
    c.width = S; c.height = S;
    var g = c.getContext('2d');
    g.fillStyle = '#edf7fd';
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, S - 8, S - 8, 22);
    else g.rect(4, 4, S - 8, S - 8);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(69,132,182,.62)';
    g.stroke();
    g.lineJoin = 'round';
    g.lineCap = 'round';

    var draw = {
      // 冲刺: a bolt, the universal "go faster"
      bolt: function () {
        g.fillStyle = '#69bd93';
        g.beginPath();
        g.moveTo(58, 10); g.lineTo(24, 52); g.lineTo(44, 52);
        g.lineTo(36, 86); g.lineTo(72, 42); g.lineTo(50, 42);
        g.closePath();
        g.fill();
        g.strokeStyle = '#315d80'; g.lineWidth = 3; g.stroke();
      },
      // 下砸: a mallet coming down
      hammer: function () {
        g.fillStyle = '#f0bd51';
        g.save();
        g.translate(48, 44); g.rotate(-0.5);
        g.fillRect(-26, -20, 52, 26);
        g.fillStyle = '#e98d9b';
        g.fillRect(-26, -20, 10, 26);
        g.restore();
        g.fillStyle = '#cbe7f7';
        g.save();
        g.translate(52, 58); g.rotate(-0.5);
        g.fillRect(-5, 0, 10, 34);
        g.restore();
      },
      // 滑翔: two swept wings
      wing: function () {
        g.fillStyle = '#cbe7f7';
        g.beginPath();
        g.moveTo(48, 52); g.quadraticCurveTo(20, 20, 6, 34);
        g.quadraticCurveTo(26, 46, 48, 60); g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(48, 52); g.quadraticCurveTo(76, 20, 90, 34);
        g.quadraticCurveTo(70, 46, 48, 60); g.closePath(); g.fill();
        g.strokeStyle = '#315d80'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#72b9e6';
        g.beginPath(); g.moveTo(48, 44); g.lineTo(41, 74); g.lineTo(55, 74); g.closePath(); g.fill();
      },
      // 得分: three rising bars with an arrow
      chart: function () {
        var bars = [[20, 62, 14, 22], [41, 50, 14, 34], [62, 34, 14, 50]];
        g.fillStyle = '#f0bd51';
        bars.forEach(function (b) { g.fillRect(b[0], b[1], b[2], b[3]); });
        g.strokeStyle = '#69bd93'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(18, 56); g.lineTo(40, 40); g.lineTo(58, 44); g.lineTo(80, 20); g.stroke();
        g.beginPath(); g.moveTo(80, 20); g.lineTo(66, 20); g.moveTo(80, 20); g.lineTo(80, 34); g.stroke();
      }
    };
    if (draw[kind]) draw[kind]();
    return (glyphCache[kind] = c.toDataURL());
  }

  function skillIconURL(skill) {
    return skill.glyph ? glyphURL(skill.glyph) : assetURL(skill.icon);
  }

  var TAG_CLASS = { '机动': 'mob', '收益': 'eco', '强化': 'up' };

  function renderShop() {
    var scroll = cx.shopList.scrollTop;
    var focused = document.activeElement && document.activeElement.dataset.skill;
    cx.shopBalance.textContent = '本局白饭：' + game.rice +
      (sale.t > 0 ? ' · 限时特价剩余 ' + Math.ceil(sale.t) + ' 秒' : '');
    cx.shopList.innerHTML = '';
    SHOP_SKILLS.forEach(function (skill) {
      var level = skillLevels[skill.id] || 0;
      var price = shopCost(skill);
      var onSale = sale.t > 0 && sale.ids.indexOf(skill.id) >= 0;
      var button = document.createElement('button');
      button.className = 'shopItem' + (onSale ? ' sale' : '');
      button.dataset.skill = skill.id;
      var head = document.createElement('div'); head.className = 'siHead';
      var icon = document.createElement('img');
      icon.src = skillIconURL(skill); icon.alt = '';
      var title = document.createElement('span'); title.className = 'siName'; title.textContent = skill.name;
      // Level as pips rather than "1/3": the eye reads "how many are left" in one
      // glance while the run is paused over a busy backdrop. The count follows
      // costs.length, so a skill may be re-priced without touching this loop.
      var pips = document.createElement('span'); pips.className = 'siPips';
      for (var lv = 0; lv < skill.costs.length; lv++) {
        var pip = document.createElement('i');
        if (lv < level) pip.className = 'on';
        pips.appendChild(pip);
      }
      head.appendChild(icon); head.appendChild(title); head.appendChild(pips);
      var desc = document.createElement('small'); desc.textContent = skill.desc;
      var cost = document.createElement('strong');
      cost.textContent = price === null ? '已满级' : game.rice < price ? price + ' 白饭 · 还差 ' + (price - game.rice) : '升级 · ' + price + ' 白饭' + (onSale ? ' · 六折' : '');
      var tag = document.createElement('span');
      tag.className = 'siTag ' + (TAG_CLASS[skill.tag] || 'mob');
      tag.textContent = skill.tag || '';
      var foot = document.createElement('div');
      foot.className = 'siFoot';
      foot.appendChild(cost); foot.appendChild(tag);
      button.appendChild(head); button.appendChild(desc); button.appendChild(foot);
      button.disabled = price === null || game.rice < price;
      button.addEventListener('click', function () { buySkill(skill); });
      cx.shopList.appendChild(button);
    });
    cx.shopList.scrollTop = scroll;
    if (focused) {
      var next = cx.shopList.querySelector('[data-skill="' + focused + '"]');
      (next && !next.disabled ? next : document.getElementById('btnShopClose')).focus({preventScroll:true});
    }
  }

  // ------------------------------------------------------------------- verbs
  /** Dash charges the wallet is currently paying for (1, +1 per skill level). */
  function dashMax() { return 1 + Math.round(addOf('dashAdd')); }
  function glideMax() { return GLIDE_MAX * mulOf('glideMul'); }

  /**
   * Hand over any charge the cap has grown by, once the regrow timer is idle.
   *
   * Called from update() AND from buySkill(): the shop freezes update(), so a
   * purchase that only topped up on the next simulation step would show the
   * charge it just sold as spent for as long as the player stays in the shop.
   */
  function topUpCharges() {
    if (player.dashCd === 0 && player.charges < dashMax()) player.charges = dashMax();
  }

  function tryDash() {
    if (game.state !== 'playing' || player.dashT > 0) return;
    if (player.charges <= 0 || player.dashCd > 0) return;
    player.charges--;
    // The last charge is the one that has to regrow; a spare charge keeps its
    // own timer idle so a two-charge build can chain two bursts back to back.
    if (player.charges <= 0) player.dashCd = DASH_CD;
    player.dashT = DASH_T;
    player.dashGrace = DASH_T + DASH_GRACE;
    player.sliding = false;
    player.stompArm = false;
    GameAudio.sfx('dash');
    popText(camX + PLAYER_X + 30, player.y - 196, '冲刺!', '#8affc1', 26);
    burst(camX + PLAYER_X - 40, player.y - 88, {
      n: 16, col: ['#8affc1', '#bff4ff', '#ffffff'], sp0: 120, sp1: 420,
      dir: Math.PI, spread: 0.5, r0: 2, r1: 7, g: 300, l0: .2, l1: .5
    });
  }

  function jumpHeld() {
    // A finger is a held jump too, but fingers never land in `keys`, so the glide
    // has to ask the pointer state as well or the verb simply does not exist on
    // a phone. The pad and the swipe gesture keep separate flags because they can
    // be held at the same time by different thumbs, and either one lifting must
    // not cancel the other.
    if (touchJumpHeld || padJumpHeld) return true;
    for (var i = 0; i < JUMP_KEYS.length; i++) if (keys[JUMP_KEYS[i]]) return true;
    return false;
  }

  /**
   * Break an obstacle open — out of play, in a spray of debris, with a label.
   *
   * The GPU power, the dash and the stomp all arrive here so the three verbs
   * read and sound like one event. `opt` carries only what genuinely differs
   * between them: the wording, the impact point, and the palette. `silent` is
   * for a caller that has already played its own sound.
   */
  function shatter(o, opt) {
    opt = opt || {};
    var mx = opt.atX == null ? o.x + o.w / 2 : opt.atX;
    var my = opt.atY == null ? o.y + o.h / 2 : opt.atY;
    burst(mx, my, opt.burst || {
      n: 20, col: ['#8affc1', '#ffffff', '#5ee7ff'],
      sp0: 110, sp1: 430, r0: 3, r1: 9, l0: .3, l1: .7, g: 700, shape: 'square'
    });
    popText(mx, my - 30, opt.label || '撞碎!', opt.labelCol || '#8affc1', opt.size || 24);
    o.dead = true;
    o.nearMiss = true;      // gone: the pass-by near-miss reward must not also fire
    if (!opt.silent) GameAudio.sfx('shieldBreak');
    shake(7);
  }

  /**
   * Land on top of a breakable obstacle.
   *
   * Swept, not sampled: at the speed cap the feet move ~10px in one 1/120 step,
   * so the question is whether the foot was above the lid on the PREVIOUS step
   * (`prevFoot`), not whether the post-integration box overlaps. Without that a
   * fast descent can resolve a stomp as a side hit, or a side hit as a stomp.
   */
  function tryStomp(o, ob, prevFoot) {
    if (!player.stompArm || player.vy <= 0) return false;
    if (!breakable(o)) return false;
    if (prevFoot > ob.y + 14) return false;      // came in from the side, not the top
    if (player.y < ob.y) return false;           // still above the lid

    var k = jumpK();
    var mul = mulOf('stompMul');
    player.stompChain = Math.min(player.stompChain + 1, STOMP_CHAIN_MAX);
    var chain = player.stompChain;

    game.score += STOMP_SCORE * chain * mul * scoreMul();
    game.rice += riceGain(2 * chain, mulOf('riceMul'));

    player.y = ob.y;
    player.vy = STOMP_V * k * Math.sqrt(mul);
    // A bounce must not hand back a fresh double jump: lid -> full jump -> lid
    // would let a chain skip over anything the generator placed in between.
    player.jumps = Math.min(player.jumps, 1);
    player.cuttable = false;
    player.gravMul = k * k;
    player.riseMul = 1;
    player.fallMul = FALL_MUL;
    player.stompArm = false;

    // The obstacle really does come apart: bouncing off a lid and leaving it
    // standing would make the label and the hint into lies, and the thing is
    // behind the runner either way.
    shatter(o, {
      atX: o.x + o.w / 2, atY: ob.y,
      burst: {
        n: 16, col: ['#ffd166', '#ffffff', '#8affc1'], sp0: 90, sp1: 340,
        r0: 3, r1: 8, l0: .3, l1: .7, g: 700, shape: 'square'
      },
      label: chain > 1 ? '连踩 x' + chain + '!' : '踩碎!',
      labelCol: '#ffd166', size: chain > 1 ? 30 : 25, silent: true
    });
    GameAudio.sfx('stomp');
    return true;
  }

  // ------------------------------------------------------------------- utils
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ------------------------------------------------------------------ assets
  var IMG = {};
  var tinted = {};
  // HUD-side icon URL per powerup. Filled at boot: art-file powers keep their
  // PNG path, painted ones become data URLs so the same `<img src>` works.
  var powerIconURL = {};

  var ASSET_VERSION = '20261001-city1';

  /**
   * The single place an asset URL is built. The preloader and every later
   * consumer must go through this.
   *
   * The `?v=` is part of the cache key, so a hand-built path that omits it is a
   * DIFFERENT resource as far as the browser is concerned: the copy loadAll()
   * already decoded is not reused, and the image is fetched again — live, in
   * the middle of a run, at the moment some UI element needs it. When that
   * second request is slow or fails there is no retry, so the player is left
   * looking at the browser's broken-image glyph. That is how the event banner
   * could come up with a missing mascot while the identical file had already
   * loaded fine at boot.
   */
  function assetURL(key, ext) {
    return 'assets/' + key + (ext || '.png') + '?v=' + ASSET_VERSION;
  }

  /**
   * Point the static shell at the same URLs assetURL() hands the preloader.
   *
   * A bare `assets/x.png` in index.html or art-direction.css cannot carry
   * ASSET_VERSION, so the browser treats it as a different entry: it downloads
   * the art a second time, and — the part that actually shows — keeps DISPLAYING
   * whatever it had cached while the canvas quietly draws the new version. These
   * two shells would drift apart after every art update. Declaring the key in
   * `data-asset` and resolving it here keeps one URL per asset, and one place
   * that knows the version.
   *
   * Runs before the preloader, so these requests and loadAll()'s are the same
   * requests rather than a duplicate set.
   */
  /** The extension the loader would pick for `key`, so CSS asks for the same file. */
  function assetExt(key) {
    var cut = key.lastIndexOf('/');
    var cat = cut < 0 ? key : key.slice(0, cut);
    return ASSET_EXT[key] || ASSET_EXT[cat] || '.png';
  }

  /** Absolute on purpose; see the url() note in bindShellAssets. */
  function assetCSSURL(key) {
    return 'url("' + new URL(assetURL(key, assetExt(key)), document.baseURI).href + '")';
  }

  function bindShellAssets() {
    var nodes = document.querySelectorAll('[data-asset]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].src = assetURL(nodes[i].getAttribute('data-asset'));
    }
    // A relative url() inside a custom property is resolved against the
    // stylesheet that SUBSTITUTES it (src/art-direction.css), not against the
    // document, so a bare assetURL() path would be looked up as src/assets/...
    // and 404. Resolving to an absolute URL also keeps sub-path deployments
    // (project.pages.dev/game/) working, where a leading / would not.
    var root = document.documentElement.style;
    root.setProperty('--pattern-ai', assetCSSURL('ui/pattern_ai'));
    // bg/sky, i.e. the webp the preloader already fetches — not the 989 KB PNG
    // the two card illustration columns used to pull in separately. Same file as
    // the canvas draws.
    root.setProperty('--card-sky', assetCSSURL('bg/sky'));
  }

  var PATHS = {
    hero: ['run_a', 'run_b', 'run_c', 'idle', 'jump', 'djump', 'apex', 'fall', 'hurt', 'cheer', 'slide'],
    obstacle: [],
    item: ['rice', 'bigrice', 'chip', 'shield', 'magnet', 'overclock', 'dash', 'datacard', 'spark'],
    ui: ['heart', 'heart_empty', 'emblem', 'marquee', 'pattern_ai', 'badge_score', 'badge_trophy',
      'icon_shop', 'icon_play', 'icon_pause', 'icon_sound', 'icon_mute', 'icon_home',
      'icon_restart'],
    bg: ['sky', 'far', 'mid', 'ground'],
    // Zone backdrops and guest mascots are OPTIONAL: if a file is missing the game
    // simply falls back (to the original backdrop, or to no avatar), so a partial
    // asset drop still runs.
    'bg/zones/arena': ['sky', 'far', 'mid', 'ground'],
    'bg/zones/market': ['sky', 'far', 'mid', 'ground'],
    'bg/zones/vault': ['sky', 'far', 'mid', 'ground'],
    'bg/zones/wall': ['sky', 'far', 'mid', 'ground'],
    'obstacle/new': ['patrol', 'crystals', 'mine', 'drone', 'turret', 'gate', 'sentry'],
    platform: ['surface_cloud', 'surface_glass', 'cloud_island'],
    mascot: ['deepseek', 'qwen', 'zhipu', 'claude', 'gpt', 'gemini']
  };
  var OPTIONAL_CATS = { 'bg/zones/arena': 1, 'bg/zones/market': 1, 'bg/zones/vault': 1,
    'bg/zones/wall': 1, platform: 1, mascot: 1 };
  // Keep alpha-heavy parallax layers lossless: lossy WebP leaves pale matte
  // fringes around the cutout skyline when it is composited over the sky.
  var ASSET_EXT = { bg: '.webp',
    'bg/far': '.png', 'bg/mid': '.png',
    'bg/zones/arena': '.webp', 'bg/zones/arena/far': '.png', 'bg/zones/arena/mid': '.png',
    'bg/zones/market': '.webp', 'bg/zones/market/far': '.png', 'bg/zones/market/mid': '.png',
    'bg/zones/vault': '.webp', 'bg/zones/vault/far': '.png', 'bg/zones/vault/mid': '.png',
    'bg/zones/wall': '.webp', 'bg/zones/wall/far': '.png', 'bg/zones/wall/mid': '.png' };

  function loadManifest() {
    return fetch('assets/manifest.json?v=' + ASSET_VERSION).then(function (r) {
      if (!r.ok) throw new Error('无法加载 assets/manifest.json');
      return r.json();
    }).then(function (m) {
      Object.keys(m.obstacle).forEach(function (k) { OBS[k] = m.obstacle[k].box; });
      HERO_BOX = m.hero._box;
    });
  }

  function loadAll(done, fail) {
    var jobs = [];
    Object.keys(PATHS).forEach(function (cat) {
      var optional = !!OPTIONAL_CATS[cat];
      PATHS[cat].forEach(function (name) {
        var key = cat + '/' + name;
        var ext = assetExt(key);
        var url = assetURL(key, ext);
        jobs.push(new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { IMG[key] = im; res(); };
          im.onerror = function () {
            if (ext === '.webp') {
              ext = '.png';
              url = assetURL(key, ext);
              im.src = url;
              return;
            }
            if (optional) { res(); return; }
            rej(new Error('无法加载素材: ' + url));
          };
          im.src = url;
        }));
      });
    });
    Promise.all(jobs).then(done).catch(function (e) { fail(e); });
  }

  /** Push a layer back visually without touching the source art. */
  function tint(img, color, alpha) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(' + color + ',' + alpha + ')';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // --------------------------------------------------------------- particles
  var particles = [];
  var floats = [];

  var SOFT_COLORS = {
    '#8affc1': '#69bd93', '#bff4ff': '#79b9dc', '#8ff3ff': '#79b9dc',
    '#62e8ff': '#4f9ed2', '#5ee7ff': '#5ba9d5', '#ff9ad2': '#dd8ca5',
    '#ffd166': '#dfa943', '#ffe9a8': '#f4d58c', '#ffffff': '#fff'
  };
  function softColor(col) { return SOFT_COLORS[String(col || '').toLowerCase()] || col; }

  function burst(x, y, opt) {
    var n = opt.n || 8;
    for (var i = 0; i < n; i++) {
      var a = opt.dir == null ? rand(0, Math.PI * 2) : opt.dir + rand(-opt.spread, opt.spread);
      var sp = rand(opt.sp0 == null ? 60 : opt.sp0, opt.sp1 == null ? 220 : opt.sp1);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp - (opt.drag ? 0 : 0), vy: Math.sin(a) * sp,
        g: opt.g == null ? 900 : opt.g,
        life: rand(opt.l0 || 0.3, opt.l1 || 0.7), t: 0,
        r: rand(opt.r0 || 3, opt.r1 || 7),
        col: softColor(Array.isArray(opt.col) ? pick(opt.col) : (opt.col || '#fff')),
        shape: opt.shape || 'circle', rot: rand(0, 6.28), vr: rand(-8, 8)
      });
    }
  }

  function popText(x, y, txt, col, size) {
    var fill = String(col || '').toLowerCase() === '#ffffff' ? '#4f79a0' : softColor(col || '#4f79a0');
    floats.push({ x: x, y: y, txt: txt, col: fill, size: size || 26, t: 0, life: 0.85 });
  }

  var RICE_COL = ['#f4d58c', '#dfa943', '#ffffff', '#79b9dc'];

  // ------------------------------------------------------------------ player
  var player = {
    y: GROUND_Y, groundY: GROUND_Y, vy: 0, onGround: true, gravMul: 1, riseMul: 1, fallMul: FALL_MUL,
    cuttable: false,
    jumps: 0, sliding: false, slideT: 0,
    coyote: 0, buffer: 0, wince: 0, cheer: 0, shock: 0,
    runT: 0, invuln: 0, shield: false,
    // dash: charges refill one gcd at a time; grace keeps the frame the dash
    // ends from turning the obstacle it was about to break into a hit.
    dashT: 0, dashCd: 0, dashGrace: 0, charges: 1,
    // glide / stomp
    gliding: false, glideT: 0, stompArm: false, stompChain: 0,
    power: zeroPowers()
  };

  function playerBox() {
    if (!HERO_BOX) return { x: camX + PLAYER_X - 25, y: player.y - 158, w: 52, h: 158 };
    var H = HERO_BOX.designH;
    if (player.sliding && player.onGround) {          // box in slide-sprite pixels
      var s = HERO_BOX.slide;
      return {
        x: camX + PLAYER_X - HERO_BOX.slideW / 2 + s.x,
        y: player.y - HERO_BOX.slideH + s.y,
        w: s.w, h: s.h
      };
    }
    var st = HERO_BOX.stance;
    var bw = st.wFrac * H, bh = st.boxHFrac * H;
    return {
      // hung off the torso, not the headdress the sprite is aligned on
      x: camX + PLAYER_X + st.offX * H - bw / 2,
      y: player.y - bh, w: bw, h: bh
    };
  }

  function heroFrame() {
    // Shock (being floored by a generational leap) outranks everything: it is the
    // punchline of that event, so it must not be hidden behind a cheer or a run.
    if (player.shock > 0) return player.onGround ? 'hurt' : 'fall';
    if (player.wince > 0) return 'hurt';
    // Dash borrows the fastest stride pose: it is the same silhouette the run
    // cycle already uses, so a dash reads as "the run sped up", not as a
    // separate state the art does not have.
    if (player.dashT > 0) return player.onGround ? 'run_c' : 'jump';
    if (player.cheer > 0) return 'cheer';
    if (!player.onGround) {
      // A glide holds the arms-out pose for as long as it lasts, which is what
      // tells the player the stamina is still paying for the float.
      if (player.gliding) return 'apex';
      if (player.vy < -120) return player.jumps >= 2 ? 'djump' : 'jump';
      if (player.vy > 300) return 'fall';
      return 'apex';
    }
    if (player.sliding) return 'slide';
    // Stand still whenever the game is not running. Without this the heroine is
    // left frozen mid-stride behind the card picker, which reads as "the run is
    // still going" no matter how dimmed the backdrop is.
    if (game.state !== 'playing') return 'idle';
    return RUN_CYCLE[Math.floor(player.runT * 11) % 4];
  }

  // ------------------------------------------------------------------- world
  var camX = 0, speed = BASE_SPEED, dist = 0, worldT = 0;
  var obstacles = [], pickups = [], powerups = [], platforms = [], trackGaps = [];
  var platformSprite = null;
  var shots = [], recentPatterns = [], recentObstacleKinds = [], pickupBag = [];
  function shuffled(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = randInt(0, i), swap = out[i]; out[i] = out[j]; out[j] = swap;
    }
    return out;
  }
  function variedObstacle(list) {
    var choices = list.filter(function (k) { return recentObstacleKinds.indexOf(k) < 0; });
    var k = pick(choices.length ? choices : list);
    recentObstacleKinds.push(k);
    if (recentObstacleKinds.length > 2) recentObstacleKinds.shift();
    return k;
  }
  function obstaclePose(o) {
    var t = worldT * 2.2 + o.phase, dx = 0, dy = 0;
    if (o.kind === 'patrol') { dx = Math.sin(t) * 22; dy = -Math.abs(Math.sin(t * 2)) * 5; }
    if (o.kind === 'mine') { dx = Math.sin(t * .65) * 24; dy = -14 - Math.sin(t) * 12; }
    if (o.kind === 'drone') { dx = Math.sin(t * .8) * 34; dy = Math.sin(t) * (o.bob || 16); }
    if (o.kind === 'sentry') dx = Math.sin(t * .7) * 14;
    if (o.kind === 'turret' && o.recoil > 0) dx = o.recoil * 35;
    if (o.motion) dx = Math.sin(t * 1.15) * o.motion;
    return { x: o.x + dx, y: o.y + dy, dx: dx, dy: dy };
  }
  function obstacleBox(o) {
    var p = obstaclePose(o);
    return { x: o.box.x + p.dx, y: o.box.y + p.dy, w: o.box.w, h: o.box.h };
  }
  function updateMovingHazards(dt) {
    obstacles.forEach(function (o) {
      if (o.dead || o.kind !== 'turret') return;
      o.recoil = Math.max(0, (o.recoil || 0) - dt);
      var lead = o.x - camX - PLAYER_X;
      if (lead < 260 || lead > 850) return;
      var before = o.attackT || 0;
      o.attackT = before + dt;
      if (before < .85 && o.attackT >= .85) {
        shots.push({ kind:'pulse', x:o.x - 12, y:o.y + o.h * .36, w:24, h:12, life:3, box:{h:12} });
        o.recoil = .18;
      }
      if (o.attackT > 2.6) o.attackT = 0;
    });
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.x -= 200 * dt; s.life -= dt;
      if (s.dead || s.life <= 0 || s.x < camX - 80) { shots.splice(i, 1); continue; }
      if (aabb(playerBox(), {x:s.x, y:s.y - 6, w:s.w, h:12})) {
        if (player.dashT <= 0) damage(s);
        s.dead = true;
      }
    }
  }
  function drawShots() {
    ctx.save();
    shots.forEach(function (s) {
      if (s.dead) return;
      var x = s.x - camX;
      ctx.fillStyle = '#ef7b89'; ctx.beginPath(); ctx.ellipse(x + 12, s.y, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff4cd'; ctx.beginPath(); ctx.ellipse(x + 9, s.y, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }
  var pickupArtIndex = 0, PICKUP_ART = ['rice', 'rice', 'datacard', 'rice', 'spark'];
  var gen = { x: 1500, sincePower: 0 };

  function speedAt(d) {
    return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-d / RAMP_DIST));
  }

  /** Jump height stays constant as the run speeds up; only the arc length grows. */
  function jumpK() { return Math.sqrt(speed / BASE_SPEED); }

  function addObstacle(kind, x, opts) {
    opts = opts || {};
    var cfg = OBS[kind];
    var img = IMG['obstacle/new/' + kind];
    var w = img.naturalWidth, h = img.naturalHeight;
    var floatY = opts.float ? GROUND_Y - opts.float : GROUND_Y;
    var o = {
      kind: kind, cfg: cfg, img: img, w: w, h: h,
      x: x, y: floatY - h, bob: opts.bob || 0, motion: opts.motion || 0,
      phase: rand(0, 6.28),
      eventHazard: !!opts.eventHazard, nearMiss: false
    };
    o.box = { x: x + cfg.x, y: o.y + cfg.y, w: cfg.w, h: cfg.h };
    obstacles.push(o);
    return o;
  }

  function addRice(x, y, kind) {
    kind = kind || 'rice';
    var artKind = kind;
    var artScale = kind === 'bigrice' ? .8 : .72;
    if (kind === 'rice') {
      if (!pickupBag.length) pickupBag = shuffled(PICKUP_ART);
      artKind = pickupBag.pop();
      if (artKind === 'datacard') artScale = .42;
      if (artKind === 'spark') artScale = .64;
    }
    var img = IMG['item/' + artKind] || IMG['item/' + kind];
    var pickup = {
      kind: kind, artKind: artKind, artScale: artScale, img: img, x: x, y: y,
      r: kind === 'bigrice' ? 40 : 34,
      phase: rand(0, 6.28), got: false, pop: 0
    };
    pickups.push(pickup);
    return pickup;
  }

  function addRiceArc(x, y, n, dx, kind) {
    kind = kind || 'rice';
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      addRice(x + i * dx, y - Math.sin(t * Math.PI) * (dx * 0.55 + 26), kind);
    }
  }

  function addRiceLine(x, y, n, dx, kind) {
    for (var i = 0; i < n; i++) addRice(x + i * dx, y, kind || 'rice');
  }

  var riskLineId = 0, riskLines = {};
  function addRiskLine(x, y, n, dx) {
    var id = ++riskLineId;
    riskLines[id] = { remaining: n, intact: true };
    for (var i = 0; i < n; i++) {
      addRice(x + i * dx, y, i === Math.floor(n / 2) ? 'bigrice' : 'rice').riskLine = id;
    }
  }

  function addPower(kind, x, y) {
    var img = IMG['item/' + kind];
    powerups.push({ kind: kind, img: img, x: x, y: y, r: 40, phase: rand(0, 6.28), got: 0 });
  }

  function addPlatform(x, y, w) {
    var p = { x: x, y: y + rand(-10, 10), w: w - rand(0, 14), h: 28 };
    platforms.push(p);
    return p;
  }

  function addTrackGap(x, w) {
    var gap = { x: x, w: w };
    trackGaps.push(gap);
    return gap;
  }

  function gapAt(x) {
    for (var i = 0; i < trackGaps.length; i++) {
      var gap = trackGaps[i];
      if (x >= gap.x && x < gap.x + gap.w) return gap;
      if (gap.x > x) break;
    }
    return null;
  }

  function hasTrackSupportAt(x, y) {
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (Math.abs(p.y - y) < 1.5 && x >= p.x - 20 && x <= p.x + p.w + 20) return true;
      if (p.x > x + 20) break;
    }
    return Math.abs(y - GROUND_Y) < 1.5 && !gapAt(x);
  }

  function landingSurface(fromY, toY, x) {
    if (toY < fromY) return null;
    var landing = null;
    var left = x - PLAYER_BOX_W * 0.46;
    var right = x + PLAYER_BOX_W * 0.46;
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (p.y < fromY || p.y > toY) continue;
      if (right < p.x || left > p.x + p.w) continue;
      if (landing === null || p.y < landing) landing = p.y;
      if (p.x > right && p.y >= toY) break;
    }
    if (fromY <= GROUND_Y && toY >= GROUND_Y && !gapAt(x) &&
        (landing === null || GROUND_Y < landing)) landing = GROUND_Y;
    return landing;
  }

  function pruneTrackFeatures() {
    while (trackGaps.length && trackGaps[0].x + trackGaps[0].w < camX - 900) trackGaps.shift();
    while (platforms.length && platforms[0].x + platforms[0].w < camX - 900) platforms.shift();
  }

  function recoverFromGap() {
    var worldX = camX + PLAYER_X;
    var gap = gapAt(worldX);
    var safeX = gap ? gap.x + gap.w + 90 : worldX + 260;
    var skip = Math.max(0, safeX - worldX);
    if (skip > 0) { camX += skip; dist += skip; }
    damage({ kind: 'gap', box: { h: 0 } });
    player.y = GROUND_Y; player.groundY = GROUND_Y;
    player.vy = 0; player.onGround = true; player.jumps = 0;
    player.coyote = 0; player.buffer = 0; player.sliding = false;
    player.gliding = false; player.glideT = 0; player.stompArm = false;
    player.stompChain = 0;
  }

  // --------------------------------------------------------- level director
  // Distance gates for the difficulty ladder, spread out on purpose: the opening
  // stretch stays in the readable part of the curve so the obstacles can be
  // learned before the speed and the trickier patterns arrive.
  function tier() {
    var distanceTier=dist<2200?0:dist<5200?1:dist<9800?2:dist<17000?3:4;
    return distanceTier;
  }

  // ---- jump-arc budget -----------------------------------------------------
  // Keep the generator's clearance audit tied to the actual first-jump physics.
  // The jump velocity and gravity both scale by sqrt(speed / BASE_SPEED), so
  // height stays fixed while world-space jump distance grows with speed.
  var JUMP_POWER = -JUMP_V;
  var APEX_T = JUMP_POWER / GRAVITY;
  var APEX_H = JUMP_POWER * JUMP_POWER / (2 * GRAVITY);
  var PLAYER_BOX_W = 53;
  // Slack subtracted from every clearance budget. This is the room a human needs
  // to time the jump at all — roughly 70ms of travel at the fastest speed.
  // Anything tighter than this is technically possible and practically miserable.
  var CLEAR_SLACK = 30;

  function clearEnter(H) {
    var d = JUMP_POWER * JUMP_POWER - 2 * GRAVITY * H;
    return d < 0 ? null : (JUMP_POWER - Math.sqrt(d)) / GRAVITY;
  }
  function clearExit(H) {
    return APEX_T + Math.sqrt(Math.max(0, APEX_H - H) * 2 / (GRAVITY * FALL_MUL));
  }
  /**
   * Widest obstacle run one first-jump arc can carry the player over.
   *
   * Take-off velocity scales by k = sqrt(speed/BASE) and arc gravity by k^2, so
   * the jump reaches the SAME height at every speed and world time runs at 1/k.
   * The distance covered while the feet are above H is therefore
   *     speed * window / k  =  window * sqrt(BASE_SPEED * speed)
   * which is what this evaluates. Double jumps are deliberately NOT counted: the
   * generator should stay clearable on the first jump alone.
   */
  function clearSpan(H, speed) {
    var t1 = clearEnter(H);
    if (t1 == null) return 0;
    return Math.sqrt(BASE_SPEED * speed) * (clearExit(H) - t1) - PLAYER_BOX_W - CLEAR_SLACK;
  }

  var TIER_START = [0, 2200, 5200, 9800, 17000];
  /** Slowest speed at which a pattern with this min tier can appear. */
  function patternFloor(minTier) {
    return speedAt(TIER_START[Math.min(minTier, 4)]);
  }

  // Obstacles closer together than this cannot be split across two jumps: the
  // player lands ~150-175 px past an obstacle, so anything nearer than that has
  // to be taken in the same arc. Floating hazards are excluded — they are slide
  // obstacles, not jump obstacles, and are never part of a jump cluster.
  var CHAIN_GAP = 240;

  function clustersOf(list) {
    var solid = list.filter(function (o) { return !o.bob; })
      .sort(function (a, b) { return a.box.x - b.box.x; });
    var out = [], cur = null;
    for (var i = 0; i < solid.length; i++) {
      var o = solid[i];
      // Sweeping obstacles occupy their whole horizontal travel for the audit.
      var L = o.box.x - (o.motion || 0), R = o.box.x + o.box.w + (o.motion || 0), H = o.box.h;
      if (cur && L - cur.r <= CHAIN_GAP) {
        if (R > cur.r) cur.r = R;
        if (H > cur.hMax) cur.hMax = H;
      } else {
        cur = { l: L, r: R, hMax: H };
        out.push(cur);
      }
    }
    return out;
  }

  var levelAudit = [];
  // How often each pattern has been built, keyed by the pattern's id. Read by the
  // DSGame introspection hook: a beat that never gets picked would otherwise be
  // indistinguishable from one the player simply never reached.
  var patternCounts = {};

  function auditPattern(p, from, to, atTier) {
    var fresh = obstacles.slice(from, to);
    var clusters = clustersOf(fresh);
    var speedHere = patternFloor(atTier);
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      var span = c.r - c.l;                       // hitbox bounds, not art bounds
      var budget = clearSpan(c.hMax, speedHere);
      if (span > budget) {
        levelAudit.push({ span: Math.round(span), budget: Math.round(budget), h: Math.round(c.hMax), tier: atTier });
        if (levelAudit.length <= 10) {
          console.warn('[level] un-clearable cluster: span ' + Math.round(span) +
            ' > budget ' + Math.round(budget) + ' (h=' + Math.round(c.hMax) + ', tier=' + atTier + ')');
        }
      }
    }
  }

  // Every build() below must stay inside clearSpan(); auditPattern() enforces it
  // at runtime and shouts in the console if a layout ever becomes un-clearable.
  //
  // Density is deliberately back-loaded: the opening tiers fire ONE obstacle per
  // pattern so a run starts as a rhythm rather than a wall, and the only
  // three-obstacle beat in the game is held back to the last tier.
  var PATTERNS = [
    // one obstacle with a rice arc over it — the bread-and-butter beat
    { id: 'single', min: 0, build: function (x, t) {
      var o = addObstacle(variedObstacle(legalAt(t)), x);
      addRiceArc(x - 40, GROUND_Y - o.h - 46, 5, 46);
    } },

    // pure reward: a fat arc of rice and no obstacle at all, a free breather
    { id: 'rice', min: 0, build: function (x) {
      var n = randInt(4, 7), dx = rand(48, 62);
      var high = rand(130, 180);
      if (Math.random() < .5) addRiceArc(x, GROUND_Y - high, n, dx);
      else for (var j = 0; j < n; j++) addRice(x + j * dx, GROUND_Y - 95 - j * 17);
    } },
    { id: 'wave-trail', min: 0, build: function (x) {
      var n = randInt(6, 9), dx = rand(55, 70);
      for (var j = 0; j < n; j++) addRice(x + j * dx, GROUND_Y - 100 - Math.sin(j / (n - 1) * Math.PI) * 100);
    } },
    { id: 'fork-trail', min: 1, build: function (x) {
      var o = addObstacle(variedObstacle(['patrol', 'mine', 'crystals']), x + 110);
      addRiceLine(x - 50, GROUND_Y - 55, 3, 43);
      addRiceArc(x + 50, GROUND_Y - o.h - 65, randInt(4, 6), 48);
      addRice(x + 150, GROUND_Y - o.h - 140, 'bigrice');
    } },

    // A real break in the runway crossed by a row of small, one-way cloud
    // islands. Their tops use the same walkable y as the landing simulation.
    { id: 'cloud-bridge', min: 0, build: function (x) {
      var start = x + 110;
      var step = Math.sqrt(speed / BASE_SPEED);
      addTrackGap(start, 980 * step);
      addPlatform(start - 70 * step, GROUND_Y - 65, 145 * step);
      addPlatform(start + 205 * step, GROUND_Y - 132, 165 * step);
      addPlatform(start + 500 * step, GROUND_Y - 83, 155 * step);
      addPlatform(start + 785 * step, GROUND_Y - 122, 150 * step);
      addRiceArc(start + 205 * step, GROUND_Y - 205, 4, 52 * step);
      addRice(start + 570 * step, GROUND_Y - 165);
      addRiceArc(start + 785 * step, GROUND_Y - 190, 3, 48 * step);
      hint('gap', start - 360);
    } },

    // A shorter alternate island route keeps the skyline varied after the
    // opening while preserving broad, readable landing zones.
    { id: 'island-hop', min: 1, build: function (x) {
      var start = x + 125;
      var step = Math.sqrt(speed / BASE_SPEED);
      addTrackGap(start, 890 * step);
      addPlatform(start - 60 * step, GROUND_Y - 60, 150 * step);
      addPlatform(start + 220 * step, GROUND_Y - 135, 155 * step);
      addPlatform(start + 515 * step, GROUND_Y - 80, 160 * step);
      addPlatform(start + 750 * step, GROUND_Y - 130, 150 * step);
      addRiceArc(start + 220 * step, GROUND_Y - 205, 4, 50 * step);
      addRiceArc(start + 760 * step, GROUND_Y - 195, 3, 48 * step);
      hint('gap', start - 360);
    } },

    // Choice of a safe approach line and a higher-value jump route.
    { id: 'choice', min: 1, build: function (x) {
      var o = addObstacle(variedObstacle(TIER1), x + 120);
      addRiceLine(x - 105, GROUND_Y - 94, 3, 42);
      addRiskLine(x + 20, GROUND_Y - o.h - 75, 5, 48);
    } },

    // a tall wall, with a big rice floating over the top of it. Tiers 2+ only:
    // the pool is the genuinely tall set, which needs the faster arc to clear.
    { id: 'tall', min: 2, build: function (x, t) {
      var tall = ['turret'].concat(t >= 3 ? ['gate', 'sentry'] : []);
      var o = addObstacle(variedObstacle(tall), x);
      addRice(x + o.w / 2 - 30, GROUND_Y - o.h - 74, 'bigrice');
      addRiceArc(x - 30, GROUND_Y - o.h - 40, 3, 46);
    } },

    // floating hazard: the only way through is to slide
    { id: 'float', min: 2, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6 });
      addRiceLine(x - 70, GROUND_Y - 56, 3, 46);
      addRiceLine(x + 160, GROUND_Y - 56, 2, 46);
    } },

    // The sweeping drone shifts its horizontal timing but keeps the slide lane
    // open throughout its cycle. A ground mine makes a separate second action.
    { id: 'sweep-and-hop', min: 2, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6, motion: 78 });
      addObstacle('mine', x + 680);
      addRiceLine(x + 200, GROUND_Y - 55, 4, 48);
    } },

    // A moving ground hazard has a wide but still single-jumpable envelope.
    { id: 'moving-mine', min: 2, build: function (x) {
      var o = addObstacle('mine', x, { motion: 38 });
      addRiceArc(x - 72, GROUND_Y - o.h - 72, 6, 48);
    } },

    // slide under, then a wall much further along: two separate actions
    { id: 'slide-then-wall', min: 2, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6 });
      addObstacle(pick(['crystals', 'mine']), x + 620);
      addRiceLine(x + 200, GROUND_Y - 150, 4, 48);
    } },

    // A sliding corridor with two spaced verification bars. The floor line
    // teaches the safe route; its centre rice is worth a little more.
    { id: 'slide-corridor', min: 3, build: function (x) {
      addObstacle('drone', x, { float: 142, bob: 6 });
      addObstacle('drone', x + 580, { float: 142, bob: 6 });
      addRiskLine(x + 180, GROUND_Y - 56, 5, 46);
    } },

    // The tight pair is held back to the final tier.
    { id: 'pair', min: 4, build: function (x) {
      addObstacle('patrol', x);
      addObstacle('patrol', x + 80);
      addRiceArc(x - 10, GROUND_Y - 185, 6, 44);
    } },

    // ---- optional verb beats ----------------------------------------------
    // These remain clearable by jumping alone; the new verbs are optional.

    // Stomp chain: three separated obstacles that reward a bounce plus a
    // corrective double jump.
    { id: 'stomp-chain', min: 2, build: function (x) {
      for (var i = 0; i < 3; i++) {
        addObstacle('patrol', x + i * 420);
        addRiceArc(x + i * 420 - 54, GROUND_Y - 150, 3, 44);
      }
      hint('stomp', x + 120);
    } },

    // Glide trail: a long high hammock of rice with nothing under it. Only a
    // glide holds the altitude for the whole span, and because the beat has no
    // obstacle there is nothing a long float can overshoot into.
    { id: 'glide-trail', min: 1, build: function (x) {
      addRiceArc(x, GROUND_Y - 196, 9, 74);
      addRiceLine(x + 60, GROUND_Y - 74, 3, 46);
      hint('glide', x);
    } },

    // Dash lane: ONE plug with a ribbon of rice threaded through it at shin
    // height. Jumping the plug means dropping the ribbon; running it means
    // eating the hit; a dash takes both in one pass. Deliberately a single
    // obstacle — two of them close enough to share one dash would sit inside
    // CHAIN_GAP and merge into a cluster no jump arc can span.
    { id: 'dash-lane', min: 3, build: function (x) {
      addObstacle('mine', x);
      addRiskLine(x - 90, GROUND_Y - 46, 5, 74);
      hint('dash', x + 60);
    } }
  ];

  // ---- first-touch hints ----------------------------------------------------
  // A new verb nobody presses does not exist. Each beat that teaches one queues
  // a single line of text, shown once per run as the player approaches it.
  var hints = [], seenHints = {};
  var HINT_TEXT = {
    stomp: '空中按住 ↓ 下砸，踩碎障碍',
    glide: '到最高点后按住跳跃键滑翔',
    dash: 'Shift 冲刺，撞碎小障碍',
    gap: '前方跑道断开，连续跳上云岛'
  };

  function hint(kind, x) { hints.push({ kind: kind, x: x }); }

  function updateHints() {
    for (var i = hints.length - 1; i >= 0; i--) {
      var h = hints[i];
      // A kind is only ever taught once, so any later instance of an already-seen
      // hint is dropped here rather than left to pile up for the whole run.
      if (seenHints[h.kind]) { hints.splice(i, 1); continue; }
      if (h.x - camX > 1000) continue;
      seenHints[h.kind] = 1;
      popText(camX + PLAYER_X + 260, GROUND_Y - 300, HINT_TEXT[h.kind], '#bff4ff', 25);
      GameAudio.sfx('milestone');
      hints.splice(i, 1);
    }
  }

  /**
   * Clear ground between one pattern and the next, expressed as REACTION TIME.
   *
   * This used to shrink as the tier rose while the world speed was climbing, so
   * a late run could leave under 0.2s between one jump and the next. Holding the
   * time roughly constant instead keeps the game readable at every speed.
   */
  function gapFor(t) {
    // A full first jump plus a double jump spends at most ~1.19s of air time in
    // the normalised frame, so a full second of clear ground guarantees that even
    // a worst-case double jump lands in empty space rather than on the next
    // obstacle. Later tiers trim it only slightly.
    var react = 1.00 - t * 0.03;         // seconds of empty ground ahead
    // gapMul is an event/zone mood and multiplies the clear ground directly, so
    // >1 means a sparser track and <1 a denser one. The low clamp is not a taste
    // call: the true safety bound is ~0.82 (below that a worst-case double jump
    // sails into the next pattern) and 0.88 is used to keep real margin on top of
    // it. tools/verify_balance.py section 2b proves this floor is safe, and its
    // GAP_FLOOR constant must be changed in step with this one.
    var k = clamp(mulOf('gapMul'), 0.88, 2.0);
    return (speed * react + 150) * k;
  }

  function extendLevel() {
    var horizon = camX + VIEW_W + 700;
    while (gen.x < horizon) {
      var t = tier();
      var pool = PATTERNS.filter(function(p){return p.min<=t;});
      var candidates=pool.filter(function(p){return recentPatterns.indexOf(p.id)<0;});
      var p=!Object.keys(patternCounts).length ? PATTERNS[0] : pick(candidates.length?candidates:pool);
      recentPatterns.push(p.id);
      if(recentPatterns.length>Math.min(3,pool.length-1))recentPatterns.shift();

      var o0 = obstacles.length, k0 = pickups.length;
      var platform0 = platforms.length, gap0 = trackGaps.length;
      patternCounts[p.id] = (patternCounts[p.id] || 0) + 1;
      p.build(gen.x, t);

      // advance past what the pattern actually produced rather than a guessed width
      var xEndObst = gen.x, xEnd = gen.x, xStart = Infinity;
      for (var i = o0; i < obstacles.length; i++) {
        var o = obstacles[i];
        xStart = Math.min(xStart, o.x);
        xEndObst = Math.max(xEndObst, o.x + o.w);
      }
      for (var j = k0; j < pickups.length; j++) xEnd = Math.max(xEnd, pickups[j].x + 40);
      for (var pi = platform0; pi < platforms.length; pi++) {
        xStart = Math.min(xStart, platforms[pi].x);
        xEnd = Math.max(xEnd, platforms[pi].x + platforms[pi].w);
      }
      for (var gi = gap0; gi < trackGaps.length; gi++) {
        xStart = Math.min(xStart, trackGaps[gi].x);
        xEnd = Math.max(xEnd, trackGaps[gi].x + trackGaps[gi].w);
      }
      xEnd = Math.max(xEnd, xEndObst);
      if (xStart !== Infinity) auditPattern(p, o0, obstacles.length, t);

      var adv = (xEnd - gen.x) + gapFor(t) * rand(1.0, 1.22) + 80;

      // sprinkle a powerup into the gap every so often
      gen.sincePower++;
      if (gen.sincePower >= randInt(5, 9)) {
        gen.sincePower = 0;
        addPower(pick(POWERS), gen.x + adv * 0.55, GROUND_Y - rand(150, 250));
      }
      gen.x += adv;
    }
  }

  // ------------------------------------------------------------------ render
  var cv, ctx, dpr = 1;

  function backdropKey(i, layer) {
    return (ZONES[i] && ZONES[i].layers) ? 'bg/zones/' + ZONES[i].layers + '/' + layer : 'bg/' + layer;
  }

  function drawSkyZone(i, alpha) {
    var sky = imgOr(backdropKey(i, 'sky')) || IMG['bg/sky'];
    var drift = Math.sin(worldT * 0.16) * 8;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sky, 0, drift - 8, VW, VH);
    ctx.globalAlpha = 1;
  }

  /** Fade old scenery out while fading the new sky, parallax and ground in. */
  function drawSky() {
    if (zoneTransition.t > 0 && zoneTransition.from >= 0) drawSkyZone(zoneTransition.from, 1);
    drawSkyZone(zoneIdx, zoneTransition.t > 0 && zoneTransition.from >= 0 ? 1 - zoneTransition.t : 1);
  }

  function drawBackdropZone(i, alpha) {
    var far = backdropKey(i, 'far');
    var mid = backdropKey(i, 'mid');
    drawLayer(far.slice(3), 0.10, GROUND_Y + 30, 0.58 * alpha);
    drawLayer(mid.slice(3), 0.26, GROUND_Y + 30, 0.88 * alpha);
    var g = imgOr(backdropKey(i, 'ground')) || IMG['bg/ground'];
    var off = camX % g.naturalWidth;
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-VIEW_W, GROUND_Y, VIEW_W * 3, VH / ZOOM);
    for (var gi = 0; gi < trackGaps.length; gi++) {
      var cut = trackGaps[gi];
      var cutX = cut.x - camX;
      if (cutX + cut.w < 0 || cutX > VIEW_W) continue;
      ctx.rect(cutX, GROUND_Y, cut.w, VH / ZOOM);
    }
    ctx.clip('evenodd');
    for (var x = -off; x < VIEW_W; x += g.naturalWidth) ctx.drawImage(g, x, GROUND_Y);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawWorldBackdrop() {
    if (zoneTransition.t > 0 && zoneTransition.from >= 0) {
      drawBackdropZone(zoneTransition.from, 1);
      drawBackdropZone(zoneIdx, 1 - zoneTransition.t);
    } else {
      drawBackdropZone(zoneIdx, 1);
    }
  }

  /** A bright, illustrated track cap laid over the continuous ground art. */
  function drawTrackSurface() {
    var i=zoneIdx,alpha=1;
    var key = (ZONES[i] && ['arena','vault','wall'].indexOf(ZONES[i].id)>=0)
      ? 'platform/surface_glass' : 'platform/surface_cloud';
    var src = imgOr(key);
    if (!src) return;
    var w = src.naturalWidth || src.width;
    var h = src.naturalHeight || src.height;
    var off = camX % w;
    ctx.save();
    ctx.globalAlpha = 0.96*alpha;
    ctx.beginPath();
    ctx.rect(-VIEW_W, GROUND_Y - 8, VIEW_W * 3, VH / ZOOM);
    trackGaps.forEach(function (gap) { ctx.rect(gap.x - camX, GROUND_Y - 8, gap.w, VH / ZOOM); });
    ctx.clip('evenodd');
    for (var x = -off; x < VIEW_W; x += w) ctx.drawImage(src, x, GROUND_Y - 5, w, h);
    ctx.restore();
  }

  function drawTrackGaps() {
    for (var i = 0; i < trackGaps.length; i++) {
      var gap = trackGaps[i];
      var left = gap.x - camX, right = left + gap.w;
      if (right < -40 || left > VIEW_W + 40) continue;
      ctx.fillStyle = '#6eaed0';
      ctx.fillRect(left - 6, GROUND_Y - 4, 6, 30);
      ctx.fillRect(right, GROUND_Y - 4, 6, 30);
    }
  }

  function drawFloatingPlatforms() {
    var src = platformSprite || imgOr('platform/cloud_island');
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var x = p.x - camX;
      if (x + p.w < -80 || x > VIEW_W + 80) continue;
      if (src) {
        var h = p.w * (src.naturalHeight || src.height) / (src.naturalWidth || src.width);
        // The generated sprite has a little sky around its island. Align its
        // straight cloud-top edge with the one-way landing surface.
        ctx.drawImage(src, x, p.y - h * 0.325, p.w, h);
      } else {
        ctx.save();
        ctx.fillStyle = '#76bde9';
        ctx.strokeStyle = '#365d9c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x + 8, p.y + 2, p.w - 16, 26, 13);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d7f5ff';
        ctx.beginPath();
        ctx.roundRect(x, p.y - 5, p.w, 16, 8);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /** A layer key that exists, or null. Every zone lookup falls back through this
   *  so a missing asset degrades to the original art instead of throwing. */
  function imgOr(key) { return IMG[key] || null; }


  function drawLayer(name, para, baseY, alpha) {
    var key = 'bg/' + name;
    var src = tinted[key] || IMG[key];
    if (!src) return;
    var w = src.width || src.naturalWidth;
    var h = src.height || src.naturalHeight;
    var off = (camX * para) % w;
    var y = baseY - h;
    ctx.globalAlpha = alpha;
    for (var x = -off; x < VIEW_W; x += w) ctx.drawImage(src, x, y);
    ctx.globalAlpha = 1;
  }

  var vignette = null;
  /** Screen-space vignette, drawn over everything to keep the eye on the action. */
  function drawVignette() {
    if (!vignette) {
      vignette = ctx.createLinearGradient(0, 0, 0, VH);
      vignette.addColorStop(0, 'rgba(255,255,255,.05)');
      vignette.addColorStop(0.46, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, 'rgba(72,139,194,.06)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VW, VH);
  }

  function drawPickups() {
    var t = worldT;
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      var sx = p.x - camX;
      if (sx < -120 || sx > VIEW_W + 120) continue;
      var bob = Math.sin(t * 3.4 + p.phase) * 5;
      var sc = 1 + (p.got ? p.pop * 1.5 : 0);
      var img = p.img;
      if (!img) continue;
      // `|| img.width` covers the paint-on-boot canvases (tint / glyph icons),
      // which have no naturalWidth and would otherwise draw at NaN.
      var w = (img.naturalWidth || img.width) * (p.artScale || 1) * sc;
      var h = (img.naturalHeight || img.height) * (p.artScale || 1) * sc;
      ctx.save();
      if (p.got) ctx.globalAlpha = Math.max(0, 1 - p.pop * 2.4);
      // The bowl/card art already has its own silhouette; a large white disc
      // behind every pickup made close formations merge into a washed-out blob.
      ctx.shadowColor = 'rgba(67,112,148,.22)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 2;
      ctx.drawImage(img, sx - w / 2, p.y - h / 2 + bob, w, h);
      ctx.restore();
    }
  }

  function drawPowerups() {
    var t = worldT;
    for (var i = 0; i < powerups.length; i++) {
      var p = powerups[i];
      var sx = p.x - camX;
      if (sx < -140 || sx > VIEW_W + 140) continue;
      var bob = Math.sin(t * 2.6 + p.phase) * 7;
      var img = p.img;
      // A content entry that names a powerup with no art would otherwise throw
      // here on every frame and take the rest of the render pass down with it.
      if (!img) continue;
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var sc = p.got ? 1 + p.got * 1.6 : 1;
      // A pale badge keeps the pickup legible without the old neon aura.
      var col = (POWER_INFO[p.kind] && POWER_INFO[p.kind].col) || '120,235,255';
      ctx.save();
      if (p.got) ctx.globalAlpha = Math.max(0, 1 - p.got * 2.2);
      // Let each illustrated item keep its own material and silhouette instead
      // of placing every different power on the same white coin-like badge.
      ctx.shadowColor = 'rgba(' + col + ',.28)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(img, sx - w * sc / 2, p.y + bob - h * sc / 2, w * sc, h * sc);
      ctx.restore();
    }
  }

  function drawObstacles() {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var pose = obstaclePose(o);
      var sx = pose.x - camX;
      if (sx < -220 || sx > VIEW_W + 220) continue;
      // contact shadow
      if (!o.bob) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = 'rgba(57,104,150,.2)';
        ctx.beginPath();
        ctx.ellipse(sx + o.w / 2, GROUND_Y + 5, o.w * 0.42, 6, 0, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(o.img,sx,pose.y);
      if (o.kind === 'turret' && o.attackT > 0 && o.attackT < .85) {
        ctx.save();
        ctx.strokeStyle = 'rgba(233,100,123,' + (.3 + o.attackT * .6) + ')';
        ctx.setLineDash([7, 7]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, pose.y + o.h * .36);
        ctx.lineTo(sx - 210, pose.y + o.h * .36); ctx.stroke(); ctx.restore();
      }
      // The cue follows the obstacle rather than the screen, so two quick beats
      // remain distinguishable. It is decoration only: the hitbox never changes.
      var lead = sx - PLAYER_X;
      if (game.state === 'playing' && lead > 90 && lead < 920) {
        var slide = !!o.bob;
        var alpha = Math.min(1, (920 - lead) / 180, (lead - 90) / 100);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.font = '800 20px "M PLUS Rounded 1c",sans-serif';
        var cue = slide ? (o.motion ? '↔ 滑铲' : '↓ 滑铲') :
          (o.motion ? '↔ 跳跃' : '↑ 跳跃');
        var cueY = slide ? GROUND_Y - 13 : Math.max(260, o.y - 22);
        var cueW = ctx.measureText(cue).width + 24;
        var left = sx + o.w / 2 - cueW / 2, top = cueY - 25;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(left, top, cueW, 34, 14);
        else {
          var right = left + cueW, bottom = top + 34;
          ctx.moveTo(left + 14, top); ctx.arcTo(right, top, right, bottom, 14);
          ctx.arcTo(right, bottom, left, bottom, 14); ctx.arcTo(left, bottom, left, top, 14);
          ctx.arcTo(left, top, right, top, 14); ctx.closePath();
        }
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(91,151,200,.36)';
        ctx.stroke();
        ctx.fillStyle = o.eventHazard ? '#b77b19' : slide ? '#347eb6' : '#c85f76';
        ctx.fillText(cue, sx + o.w / 2, cueY);
        ctx.restore();
      }
    }
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) return;
    var f = heroFrame();
    var img = IMG['hero/' + f];
    var meta = HERO_FRAMES[f];
    ctx.save();
    if (player.shield || player.power.chip > 0) {
      var cy = player.y - 92;
      var rad = 108;
      var col = player.power.chip > 0 ? '245,190,80' : '91,164,211';
      ctx.fillStyle = 'rgba(' + col + ',.08)';
      ctx.strokeStyle = 'rgba(' + col + ',.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(PLAYER_X, cy, rad, 0, 6.2832);
      ctx.fill();
      ctx.stroke();
    }
    var w = img.naturalWidth, h = img.naturalHeight;
    var dx = PLAYER_X - w / 2;
    var dy = player.y - h * meta.g;
    ctx.drawImage(img, dx, dy, w, h);
    ctx.restore();
  }

  /**
   * Glide stamina, drawn under the feet and only while it is being spent.
   *
   * It lives on the canvas rather than in the HUD on purpose: the bar has to sit
   * next to the runner, because the decision it informs ("can I still make that
   * gap") is made by looking at the runner, not at the corner of the screen.
   */
  function drawVerbBars() {
    if (player.glideT <= 0) return;
    var cap = glideMax();
    var w = 124, x = PLAYER_X - w / 2, y = player.y + 12;
    var left = clamp(1 - player.glideT / cap, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(x - 3, y - 3, w + 6, 12);
    ctx.fillStyle = left > 0.28 ? '#63b5e8' : '#ed8d9a';
    ctx.fillRect(x, y, w * left, 6);
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.col;
      var sx = p.x - camX, sy = p.y;
      if (p.shape === 'square') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.rot + p.t * p.vr);
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, p.r * (0.4 + a * 0.7), 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i];
      var t = f.t / f.life;
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      ctx.font = '800 ' + f.size + 'px "Baloo 2","M PLUS Rounded 1c",sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.strokeText(f.txt, f.x - camX, f.y - t * 54);
      ctx.fillStyle = f.col;
      ctx.fillText(f.txt, f.x - camX, f.y - t * 54);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines() {
    var t = (speed - MAX_SPEED * 0.72) / (MAX_SPEED * 0.28);
    if (t <= 0) return;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (var i = 0; i < 16; i++) {
      var seed = i * 97.3;
      // keep the streaks in the open air above the track
      var y = 60 + ((seed * 13.7) % (GROUND_Y - 200));
      var len = 80 + ((seed * 31) % 150) * t;
      var x = (VIEW_W - ((camX * 1.7 + seed * 220) % (VIEW_W + 400)));
      ctx.globalAlpha = clamp(t, 0, 1) * 0.16 * (0.4 + ((i % 3) / 3));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);

    // screen shake
    var sh = game.shake;
    if (sh > 0) {
      ctx.translate(rand(-sh, sh), rand(-sh, sh));
    }

    drawSky();

    // Zoomed world pass: everything with a real position in the level.
    ctx.translate(WORLD_OX, WORLD_OY);
    ctx.scale(ZOOM, ZOOM);

    drawWorldBackdrop();
    drawTrackSurface();
    drawTrackGaps();
    drawFloatingPlatforms();
    drawSpeedLines();
    drawPickups();
    drawPowerups();
    drawObstacles();
    drawShots();
    drawPlayer();
    drawVerbBars();
    drawParticles();
    drawFloats();

    // Back to screen space for the full-frame overlays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette();

    // hit flash
    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(244,125,126,' + (game.flash * 0.42) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }

    // generational-leap whiteout: a cold blue blowout with a ring pushing out
    // from the runner, so "the new model dropped" reads as awe rather than damage
    if (player.shock > 0) {
      var k = clamp(player.shock / 0.75, 0, 1);
      ctx.fillStyle = 'rgba(255,247,218,' + (k * 0.36) + ')';
      ctx.fillRect(0, 0, VW, VH);
      var rad = (1 - k) * 900 + 60;
      ctx.strokeStyle = 'rgba(117,183,222,' + (k * 0.72) + ')';
      ctx.lineWidth = 14 * k + 2;
      ctx.beginPath();
      ctx.arc(PLAYER_X, GROUND_Y - 110, rad, 0, 6.2832);
      ctx.stroke();
    }
    if (game.state === 'over') {
      ctx.fillStyle = 'rgba(242,248,255,' + clamp(game.overFade * 0.48, 0, 0.48) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  // ------------------------------------------------------------------ input
  var keys = {};
  var touchStart = null;
  // The right half is an immediate jump/glide control. The left half is for
  // swipe actions, so a downward swipe no longer has to race a delayed jump.
  var SWIPE_DOWN = 30, SWIPE_RIGHT = 56;
  // Fingers hold the jump open for the glide without ever touching `keys`; the
  // on-screen pad does the same, and `down` is the pad's slide/stomp hold.
  var touchJumpHeld = false, padJumpHeld = false, padDown = false;

  function jumpPressed() {
    if (game.state === 'title') { startRun(); return; }
    if (game.state === 'over') { if (game.overFade > 0.5) restart(); return; }
    // Only buffer while actually running. Buffering under a modal would leave the
    // jump queued and fire it the instant the card picker closes, which reads as
    // the game jumping on its own.
    if (game.state === 'playing') player.buffer = JUMP_BUFFER;
  }

  function onKeyDown(e) {
    var k = e.code;
    if (game.state === 'shop') {
      if (k === 'Escape' || k === 'KeyB' || k === 'KeyP') { e.preventDefault(); if (!e.repeat) toggleShop(); }
      if (k === 'Tab') {
        var controls = Array.prototype.slice.call(cx.shop.querySelectorAll('button:not(:disabled)'));
        var at = controls.indexOf(document.activeElement);
        if (e.shiftKey && at <= 0) { e.preventDefault(); controls[controls.length - 1].focus(); }
        else if (!e.shiftKey && (at < 0 || at === controls.length - 1)) { e.preventDefault(); controls[0].focus(); }
      }
      return;
    }
    if (k === 'KeyB') { e.preventDefault(); if (!e.repeat) toggleShop(); return; }
    if (JUMP_KEYS.indexOf(k) >= 0) {
      e.preventDefault();
      if (!keys[k]) { GameAudio.unlock(); jumpPressed(); }
      keys[k] = true;
    } else if (k === 'ArrowDown' || k === 'KeyS') {
      e.preventDefault();
      keys[k] = true;
    } else if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyJ') {
      e.preventDefault();
      if (!keys[k]) { GameAudio.unlock(); tryDash(); }
      keys[k] = true;
    } else if (k === 'KeyP' || k === 'Escape') {
      e.preventDefault();
      if (game.state === 'shop') toggleShop();
      else togglePause();
    } else if (k === 'KeyM') {
      toggleMute();
    } else if (k === 'KeyF') {
      e.preventDefault();
      // Guards the auto-repeat: without it, holding F would enter and leave
      // fullscreen as fast as the key repeats.
      if (!keys[k]) toggleFullscreen();
      keys[k] = true;
    } else if (k === 'Enter') {
      GameAudio.unlock();
      if (game.state === 'title') startRun();
      else if (game.state === 'over' && game.overFade > 0.5) restart();
    }
  }

  /**
   * Tapping trims the FIRST jump only, and gently. Cutting the second jump was a
   * large part of why double jumping felt like it always hit something: the arc
   * died mid-rise and dropped the player onto the thing they were clearing. The
   * second jump now always completes. Shared with the touch release so a finger
   * lift trims the jump exactly like a key does.
   */
  function cutJump() {
    if (player.cuttable && player.vy < 0) {
      player.vy *= 0.85;
      player.cuttable = false;
    }
  }

  function onKeyUp(e) {
    var k = e.code;
    if (keys[k] && JUMP_KEYS.indexOf(k) >= 0) cutJump();
    keys[k] = false;
  }

  function downHeld() { return padDown || !!(keys['ArrowDown'] || keys['KeyS']); }

  function bindInput() {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      keys = {}; endTouch(); releasePad();
      if (game.state === 'playing') setPause(true);
    });

    var stage = document.getElementById('stage');

    /** Forget the finger in flight, whatever it was about to do. */
    function endTouch() {
      if (touchStart) { clearTimeout(touchStart.timer); touchStart = null; }
      touchJumpHeld = false;
    }

    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      // Extra fingers are ignored rather than allowed to steal the gesture state
      // from the one already tracking a swipe.
      if (touchStart) return;
      GameAudio.unlock();
      var rightSide = e.clientX >= window.innerWidth * 0.5;
      touchStart = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        t: performance.now(), rightSide: rightSide, slid: false, jumped: false
      };
      // Right-side touch starts immediately, matching the physical jump button
      // and making short taps responsive enough for a fast runner.
      if (rightSide) {
        touchStart.jumped = true;
        touchJumpHeld = true;
        jumpPressed();
      }
    });
    // `slid` means "a gesture has already consumed this touch", whichever
    // direction it went: both swipes must suppress the tap-to-jump, or every
    // swipe would also queue a jump. The delays also end the tap's hold, so a
    // swipe can never glide.
    stage.addEventListener('pointermove', function (e) {
      if (!touchStart || e.pointerId !== touchStart.id || touchStart.slid) return;
      if (!touchStart.rightSide && e.clientY - touchStart.y > SWIPE_DOWN) {
        touchStart.slid = true;
        endTouch();
        keys['ArrowDown'] = true;
        setTimeout(function () { keys['ArrowDown'] = false; }, 520);
      } else if (!touchStart.rightSide && e.clientX - touchStart.x > SWIPE_RIGHT) {
        touchStart.slid = true;
        endTouch();
        tryDash();
      }
    });
    stage.addEventListener('pointerup', function (e) {
      if (!touchStart || e.pointerId !== touchStart.id) return;
      var wasSlide = touchStart.slid;
      var jumped = touchStart.jumped;
      var rightSide = touchStart.rightSide;
      endTouch();
      if (game.state === 'title') { startRun(); return; }
      if (game.state === 'over') { if (game.overFade > 0.5) restart(); return; }
      if (game.state !== 'playing' || wasSlide) return;
      // Right-side input already jumped on press; release trims the first arc.
      // Left-side taps remain a compatible jump-on-release fallback.
      if (rightSide) cutJump();
      else if (!jumped) jumpPressed();
    });
    stage.addEventListener('pointercancel', function (e) {
      if (touchStart && e.pointerId !== touchStart.id) return;
      endTouch();
    });
  }

  // -------------------------------------------------------------- touch pad
  // The pad is a second pair of thumbs, not a second input system: each button
  // drives the same flags the keyboard and the swipe gestures drive, so there is
  // exactly one implementation of "jump held" and one of "down held" for the
  // verbs to read. Its buttons sit outside #stage, so the gesture handler never
  // sees them (and the pads are hidden outside a run, see syncPad).
  var padBtns = [];

  /** Press-and-hold wiring: pointerdown/up/cancel/leave, with a held class. */
  function wireHold(el, fn) {
    if (!el) return;
    padBtns.push(el);
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (e.button !== 0 || el._padPointer != null) return;
      el._padPointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('held');
      fn(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      el.addEventListener(t, function (e) {
        if (el._padPointer !== e.pointerId) return;
        el._padPointer = null;
        if (!el.classList.contains('held')) return;
        el.classList.remove('held');
        fn(false);
      });
    });
  }

  /** Let go of everything the pad is holding — the pad's version of keyup. */
  function releasePad() {
    padJumpHeld = false;
    padDown = false;
    for (var i = 0; i < padBtns.length; i++) {
      var el = padBtns[i], id = el._padPointer;
      el._padPointer = null;
      if (id != null && el.hasPointerCapture(id)) el.releasePointerCapture(id);
      el.classList.remove('held');
    }
  }

  function bindPad() {
    var pad = document.getElementById('pad');
    if (!pad) return;
    hud.pad = pad;
    // Some mobile browsers still raise selection/callout menus on button text.
    ['contextmenu', 'selectstart', 'dragstart', 'touchstart'].forEach(function (type) {
      pad.addEventListener(type, function (e) { e.preventDefault(); }, { passive: false });
    });
    hud.padDash = document.getElementById('padDash');

    // Same shape as a keyboard tap: press jumps, holding keeps jumpHeld() true
    // (that is what the glide reads), and letting go trims a rising first jump.
    wireHold(document.getElementById('padJump'), function (on) {
      GameAudio.unlock();
      if (on) { padJumpHeld = true; jumpPressed(); }
      else { padJumpHeld = false; cutJump(); }
    });
    // Held ↓ is the slide on the ground and the stomp in the air — the same flag
    // the keyboard writes, so SLIDE_MIN, fast-fall and the stomp arm all apply
    // unchanged.
    wireHold(document.getElementById('padSlide'), function (on) {
      GameAudio.unlock();
      padDown = on;
    });
    if (hud.padDash) {
      // Tap, not hold: still registered so releasePad can clear its `held`
      // styling when a run ends mid-press.
      wireHold(hud.padDash, function (on) {
        if (!on) return;
        GameAudio.unlock();
        tryDash();
      });
    }
  }

  // ------------------------------------------------------------- fullscreen
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function toggleFullscreen() {
    var root = document.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (fsElement()) { if (exit) exit.call(document); return; }
    if (!req) return;
    var p = req.call(root);
    // A phone browser's chrome is the thing eating the play area, so fullscreen
    // is also the moment to ask for landscape. Only Chrome/Android grants this
    // (and only from fullscreen); iOS keeps its own rotation and refuses quietly.
    function lockLandscape() {
      try {
        var so = screen.orientation;
        if (!so || !so.lock) return;
        var r = so.lock('landscape');
        if (r && r.catch) r.catch(function () {});
      } catch (err) { /* not supported: rotation stays manual */ }
    }
    if (p && p.then) p.then(lockLandscape, function () {});
    else lockLandscape();
  }

  // ------------------------------------------------------------ game control
  var game = {
    state: 'title', shake: 0, flash: 0, hitstop: 0, overFade: 0,
    score: 0, rice: 0, lives: START_LIVES, combo: 0, comboT: 0,
    maxCombo: 0, best: 0, uiT: 0
  };

  var hud = {};

  function cacheHud() {
    hud.score = document.getElementById('score');
    hud.riceCount = document.getElementById('riceCount');
    hud.riceIcon = document.getElementById('riceIcon');
    hud.livesRow = document.getElementById('livesRow');
    hud.combo = document.getElementById('combo');
    hud.comboNum = document.getElementById('comboNum');
    hud.comboTxt = document.getElementById('comboTxt');
    hud.comboRing = document.getElementById('comboRing');
    hud.powerups = document.getElementById('powerups');
    hud.dashPips = document.getElementById('dashPips');
    hud.dashCd = document.getElementById('dashCd');
    hud.dashCdBar = document.getElementById('dashCdBar');
    hud.dashFx = document.getElementById('dashFx');
    hud.overlay = document.getElementById('overlay');
    hud.cardTitle = document.getElementById('cardTitle');
    hud.cardOver = document.getElementById('cardOver');
    hud.emblem = document.getElementById('emblem');
    hud.titleBest = document.getElementById('titleBest');
    hud.btns = document.getElementById('btns');
  }

  function loadBest() {
    try { game.best = parseInt(localStorage.getItem('ds_whale_run_best') || '0', 10) || 0; }
    catch (e) { game.best = 0; }
  }

  /** Thousands separator — a five-figure score is unreadable as a solid block. */
  function groupNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function saveBest(v) {
    try { localStorage.setItem('ds_whale_run_best', String(v)); } catch (e) { }
  }

  // Lives can exceed the starting three (合规边境 grants one, and the shop sells
  // more), so the row grows to the highest count this run rather than being built
  // once at START_LIVES: an extra heart has to be visible the moment it is
  // granted, and a spent one has to stay on screen as a lost heart.
  function buildLives() {
    hud.livesRow.innerHTML = '';
    addLifeHearts(START_LIVES);
    refreshLives();
  }

  function addLifeHearts(n) {
    for (var i = 0; i < n; i++) {
      var im = document.createElement('img');
      im.className = 'life';
      im.src = assetURL('ui/heart');
      im.dataset.i = i;
      hud.livesRow.appendChild(im);
    }
  }

  function refreshLives() {
    var els = hud.livesRow.children;
    // the row itself is the record of how many hearts exist; grow it on demand
    if (game.lives > els.length) addLifeHearts(game.lives - els.length);
    for (var i = 0; i < els.length; i++) {
      var lost = i >= game.lives;
      els[i].classList.toggle('lost', lost);
      var heartSrc = lost ? assetURL('ui/heart_empty') : assetURL('ui/heart');
      if (els[i].getAttribute('src') !== heartSrc) els[i].src = heartSrc;
    }
  }

  var MAX_COMBO_MULT = 8;
  function comboDuration() { return COMBO_TIME + addOf('comboAdd'); }
  function comboMult() { return Math.min(MAX_COMBO_MULT, 1 + Math.floor(game.combo / 5)); }

  /** Extend the combo by one collectible and keep the peak for the summary. */
  function bumpCombo() {
    game.combo++;
    game.comboT = comboDuration();
    if (game.combo > game.maxCombo) game.maxCombo = game.combo;
  }

  function comboLabel() {
    return game.combo > 0 ? '白饭 ×' + comboMult() + ' · ' + game.combo + '连' : '白饭连击';
  }

  /**
   * Score multiplier, including the overclock powerup.
   *
   * Single entry point on purpose: the pickup doubles everything the run earns
   * for its duration, and routing every scoring site through here is what keeps
   * "得分翻倍" literally true instead of a half-applied buff. Flat bonuses that
   * the player reads as a fixed number (risk line, zone goal) stay flat.
   */
  function scoreMul() {
    return mulOf('scoreMul') * (player.power.overclock > 0 ? 2 : 1);
  }

  function showTitle() {
    game.state = 'title';
    cx.shop.classList.add('hide');
    setSelecting(false);
    hud.cardTitle.style.display = '';
    hud.cardOver.style.display = 'none';
    hud.overlay.classList.remove('hide');
    // innerHTML with the drawn trophy keeps the badge in the same flat style as
    // the rest of the HUD; game.best is always a parseInt result, never a string.
    hud.titleBest.innerHTML = game.best > 0
      ? '<img src="' + assetURL('ui/badge_trophy') + '" alt=""><span>历史最佳：' + groupNum(game.best) + '</span>'
      : '';
    hud.combo.classList.remove('on');
    hud.comboTxt.textContent = '白饭连击';
    hud.powerups.innerHTML = '';
    hud.dashFx.style.opacity = 0;
    resetWorld();
    enterZone(zoneAt(), true);
    GameAudio.stopBgm();
  }

  function resetWorld() {
    obstacles.length = 0; pickups.length = 0; powerups.length = 0;
    shots.length = 0; recentPatterns.length = 0; recentObstacleKinds.length = 0; pickupBag.length = 0;
    platforms.length = 0; trackGaps.length = 0;
    pickupArtIndex = 0;
    riskLines = {}; riskLineId = 0;
    particles.length = 0; floats.length = 0;
    camX = 0; dist = 0; speed = BASE_SPEED; worldT = 0;
    gen.x = 1500; gen.sincePower = 0;
    // A fresh run must not inherit the last run's zone, event or modifiers.
    zoneIdx = -1; zoneBannerT = 0; zoneBanner = '';
    genEvent.next = 7600;
    milestone.next = 1000;
    skillLevels = {};
    riceFraction = 0;
    sale = { t: 0, ids: [] };
    updateShopNotice();
    lastEventId = ''; lastEventGroup = '';
    zoneTransition = { from: -1, t: 0 };
    zoneGoal = null; completedGoals = 0;
    levelAudit.length = 0;
    patternCounts = {};
    hints.length = 0; seenHints = {};
    clearMods();
    player.shock = 0;
    player.y = GROUND_Y; player.groundY = GROUND_Y; player.vy = 0; player.onGround = true; player.gravMul = 1;
    player.riseMul = 1; player.fallMul = FALL_MUL;
    player.cuttable = false;
    player.jumps = 0; player.sliding = false; player.slideT = 0;
    player.coyote = 0; player.buffer = 0; player.wince = 0; player.cheer = 0;
    player.runT = 0; player.invuln = 0; player.shield = false;
    // clearMods() and the skillLevels reset above must run first: dashMax() reads
    // both, and a charge count from the previous run would leak the old build in.
    player.dashT = 0; player.dashCd = 0; player.dashGrace = 0;
    player.charges = dashMax();   // skillLevels was just cleared above
    player.gliding = false; player.glideT = 0;
    player.stompArm = false; player.stompChain = 0;
    player.power = zeroPowers();
    game.shake = 0; game.flash = 0; game.hitstop = 0; game.overFade = 0;
    game.score = 0; game.rice = 0; game.lives = START_LIVES;
    game.lastHit = null;
    game.combo = 0; game.comboT = 0; game.maxCombo = 0;
    buildLives();
    updateHud();
  }

  function startRun() {
    resetWorld();
    cx.shop.classList.add('hide');
    setSelecting(false);
    game.state = 'playing';
    enterZone(zoneAt());
    hud.cardTitle.style.display = 'none';
    hud.cardOver.style.display = 'none';
    hud.overlay.classList.add('hide');
    player.cheer = 0;
    GameAudio.sfx('start');
    GameAudio.startBgm();
    extendLevel();
  }

  function restart() { startRun(); }

  function setPause(on) {
    if (on && game.state === 'playing') {
      game.state = 'paused';
      GameAudio.duckBgm(true);
      setSelecting(true);
      showPauseCard(true);
    } else if (!on && game.state === 'paused') {
      game.state = 'playing';
      GameAudio.duckBgm(false);
      setSelecting(false);
      showPauseCard(false);
    }
  }
  function togglePause() {
    if (game.state === 'playing') setPause(true);
    else if (game.state === 'paused') setPause(false);
  }

  function showPauseCard(on) {
    var el = document.getElementById('cardPause');
    if (!el) {
      el = document.createElement('div');
      el.className = 'card';
      el.id = 'cardPause';
      el.innerHTML =
        '<div class="logoWrap" style="width:104px;height:104px">' +
        '<img src="' + assetURL('ui/emblem') + '" alt="" style="width:96px;height:96px;position:relative">' +
        '</div>' +
        '<div id="goTitle" class="pauseTitle" style="margin-top:14px">已暂停</div>' +
        '<div class="sub" style="margin-top:6px">鲸鱼娘正在补充白饭…</div>' +
        '<div class="keybar" style="margin-top:18px">' +
        '<span class="kb"><b>Shift</b>冲刺</span>' +
        '<span class="kb"><b>↓</b>空中下砸</span>' +
        '<span class="kb"><b>长按空格</b>滑翔</span>' +
        '<span class="kb"><b>P</b>继续</span>' +
        '<span class="kb"><b>M</b>静音</span>' +
        '</div>' +
        '<div class="row">' +
        '<button class="legbtn primary" id="btnResume">' +
        '<img src="' + assetURL('ui/icon_play') + '" alt="">继续</button>' +
        '<button class="legbtn" id="btnQuit">' +
        '<img src="' + assetURL('ui/icon_home') + '" alt="">回到标题</button>' +
        '</div>';
      hud.overlay.appendChild(el);
      document.getElementById('btnResume').addEventListener('click', function () { GameAudio.sfx('ui'); setPause(false); });
      document.getElementById('btnQuit').addEventListener('click', function () { GameAudio.sfx('ui'); el.style.display = 'none'; showTitle(); });
    }
    el.style.display = on ? '' : 'none';
    hud.overlay.classList.toggle('hide', !on);
  }

  function deathAdvice(hit) {
    if (!hit || hit.kind === 'gap') return '掉进跑道间隙 · 提前起跳，连续跳上云岛';
    if (hit.kind === 'drone') return '撞上低空障碍 · 按住 ↓ 滑铲通过';
    if (hit.airborne && hit.vy > 0 && hit.kind !== 'turret' && hit.kind !== 'gate' && hit.kind !== 'sentry') {
      return '下落时撞到障碍 · 可按住 ↓ 尝试下砸';
    }
    if (hit.kind === 'turret' || hit.kind === 'gate' || hit.kind === 'sentry') return '高墙型障碍 · 提前起跳并保留二段跳';
    return '地面障碍 · 提前起跳，或用冲刺撞碎小型障碍';
  }

  function gameOver() {
    if (game.state !== 'playing') return;
    game.state = 'over';
    game.overFade = 0;
    GameAudio.sfx('over');
    GameAudio.stopBgm();
    // updateEvent() stops being called once the state is 'over', so the banner
    // would otherwise freeze on screen with a dead countdown. The zone plaque
    // deliberately stays — it is part of the summary.
    hideEventBanner();
    var sc = Math.floor(game.score);
    var isBest = sc > game.best;
    if (isBest) { game.best = sc; saveBest(sc); }
    document.getElementById('sScore').textContent = groupNum(sc);
    document.getElementById('sRice').textContent = game.rice;
    document.getElementById('sDist').textContent = Math.floor(dist / 30) + ' m';
    document.getElementById('sCombo').textContent = 'x' + Math.min(MAX_COMBO_MULT, 1 + Math.floor(game.maxCombo / 5));
    var reason = document.getElementById('deathReason');
    if (reason) {
      var hit = game.lastHit || { kind: 'gap' };
      var names = { patrol: '巡逻 Bug', crystals: '错误晶体', mine: '缓存地雷', drone: '低空验证条', turret: '炮台', gate: '闸门', sentry: '哨塔', gap: '跑道间隙' };
      reason.innerHTML = '<b>本次失误：' + (names[hit.kind] || hit.kind) + '</b><span>' + deathAdvice(hit) + '</span>';
    }
    // The line under the score always says something — a record fell, or how far
    // short it fell — so the card keeps its height either way.
    var elBest = document.getElementById('bestLine');
    var gap = game.best - sc;
    if (isBest) {
      elBest.className = 'rec';
      elBest.innerHTML = '<img src="' + assetURL('ui/badge_trophy') + '" alt="">新纪录！';
    } else if (gap > 0) {
      elBest.className = 'near';
      elBest.innerHTML = '<img src="' + assetURL('ui/badge_trophy') + '" alt="">距历史最佳<b>' + groupNum(gap) + '</b>';
    } else {
      elBest.className = 'near';
      elBest.innerHTML = '<img src="' + assetURL('ui/badge_trophy') + '" alt="">追平历史最佳';
    }

    // Where the run ended and the current-run upgrades.
    var z = ZONES[zoneIdx];
    var elZone = document.getElementById('sZone');
    if (elZone) elZone.textContent = z ? z.name : '—';
    document.getElementById('sGoals').textContent = completedGoals;
    var bought = SHOP_SKILLS.filter(function (s) { return skillLevels[s.id] > 0; })
      .map(function (s) { return s.name + ' Lv.' + skillLevels[s.id]; });
    var elCards = document.getElementById('sCards');
    if (elCards) elCards.textContent = bought.length ? bought.join('、') : '无';

    setTimeout(function () {
      if (game.state !== 'over') return;
      hud.cardTitle.style.display = 'none';
      hud.cardOver.style.display = '';
      hud.overlay.classList.remove('hide');
      hud.combo.classList.remove('on');
      hud.dashFx.style.opacity = 0;
    }, 620);
  }

  // ------------------------------------------------------------------- rules
  function rewardNearMiss(o) {
    if (o.nearMiss || o.dead || player.invuln > 0 || player.power.chip > 0 ||
        player.dashT > 0 || game.state !== 'playing') return;
    var pb = playerBox();
    var ob = obstacleBox(o);
    var horizontal = Math.max(0, Math.max(ob.x - (pb.x + pb.w), pb.x - (ob.x + ob.w)));
    var vertical = Math.max(0, Math.max(ob.y - (pb.y + pb.h), pb.y - (ob.y + ob.h)));
    if (horizontal > 92 || vertical > 55 || aabb(pb, ob)) return;
    o.nearMiss = true;
    progressGoal('nearMiss');
    game.score += 18 * scoreMul();
    game.comboT = Math.max(game.comboT, comboDuration() * 0.55);
    popText(camX + PLAYER_X, player.y - 188, '险过!', o.bob ? '#62e8ff' : '#ffd166', 24);
    burst(camX + PLAYER_X, player.y - 92, {
      n: 6, col: o.bob ? ['#62e8ff', '#bff4ff'] : ['#ffd166', '#ff9ad2'],
      sp0: 70, sp1: 180, r0: 2, r1: 5, l0: .18, l1: .38
    });
    GameAudio.sfx('milestone');
  }

  function damage(o) {
    if (player.invuln > 0 || game.state !== 'playing') return;
    // GPU dash and the dash verb both plough through breakable obstacles. The
    // grace window covers the frames after the burst ends.
    if (o.kind !== 'gap' && (player.power.chip > 0 ||
        ((player.dashT > 0 || player.dashGrace > 0) && breakable(o)))) {
      shatter(o, player.power.chip > 0 ? null : { label: '冲刺撞碎!', labelCol: '#8affc1' });
      game.score += DASH_SCORE * scoreMul();
      game.rice += riceGain(1, mulOf('riceMul'));
      return;
    }
    if (player.shield) {
      player.shield = false;
      player.invuln = 1.1;
      GameAudio.sfx('shieldBreak');
      burst(camX + PLAYER_X, player.y - 96, { n: 22, col: ['#8ff3ff', '#ffffff', '#5ec8ff'], sp0: 120, sp1: 420, r0: 3, r1: 8, l0: .3, l1: .7, g: 500 });
      popText(camX + PLAYER_X, player.y - 150, '护盾破碎', '#8ff3ff', 26);
      shake(9);
      return;
    }
    game.lives--;
    refreshLives();
    game.lastHit = {
      kind: o.kind, hitboxH: Math.round(o.box.h), feetY: Math.round(player.y),
      vy: Math.round(player.vy), airborne: !player.onGround, speed: Math.round(speed)
    };
    player.wince = 0.55;
    player.invuln = INVULN;
    game.combo = 0; game.comboT = 0;
    game.hitstop = 0.1;
    game.flash = 1;
    shake(20);
    GameAudio.sfx('hit');
    burst(camX + PLAYER_X, player.y - 90, { n: 26, col: ['#ffd166', '#ff7bc0', '#ffffff'], sp0: 140, sp1: 470, r0: 3, r1: 9, l0: .35, l1: .8 });
    popText(camX + PLAYER_X, player.y - 170, ['好痛！', '呜哇！', '撞到了！'][randInt(0, 2)], '#ff9ad2', 30);
    if (game.lives <= 0) {
      player.cheer = 0;
      setTimeout(gameOver, 340);
    }
  }

  function shake(v) { game.shake = Math.max(game.shake, v); }

  function collectRice(p) {
    p.got = true;
    progressGoal('rice');
    var big = p.kind === 'bigrice';
    var line = p.riskLine && riskLines[p.riskLine];
    if (line) {
      line.remaining--;
      if (line.remaining === 0) {
        if (line.intact) {
          game.score += 60;
          popText(p.x, p.y - 72, '完整收集 +60', '#ffd166', 25);
          GameAudio.sfx('combo', 1);
        }
        delete riskLines[p.riskLine];
      }
    }
    var previousMult = comboMult();
    bumpCombo();
    var mult = comboMult();
    var gain = Math.round((big ? 50 : 10) * mult * mulOf('riceMul') * scoreMul());
    game.score += gain;
    game.rice += riceGain(big ? 5 : 1, mulOf('riceMul'));

    GameAudio.sfx(big ? 'bigrice' : 'coin', big ? 0 : game.combo);
    if (mult > previousMult) {
      GameAudio.sfx('combo', mult - 1);
      popText(p.x, p.y - 40, 'x' + mult + ' 连击!', '#ffd166', 34);
    }

    burst(p.x, p.y, {
      n: big ? 18 : 9, col: RICE_COL, sp0: 60, sp1: big ? 330 : 200,
      r0: 2, r1: big ? 8 : 5, l0: .25, l1: .6, g: 620
    });
    popText(p.x, p.y - 16, '+' + gain, big ? '#ffd166' : '#ffffff', big ? 28 : 22);

    if (!mobileRender) {
      hud.riceCount.classList.remove('pop');
      void hud.riceCount.offsetWidth;
      hud.riceCount.classList.add('pop');
    }
  }

  function collectPower(p) {
    p.got = 0.001;
    GameAudio.sfx(p.kind === 'shield' ? 'shield' : 'power');
    player.cheer = 0.45;
    var pm = mulOf('powerMul');
    if (p.kind === 'chip') {
      player.power.chip = POWER_INFO.chip.dur * pm;
      popText(p.x, p.y - 40, 'GPU 加速!', '#8affc1', 32);
    } else if (p.kind === 'shield') {
      player.shield = true;
      popText(p.x, p.y - 40, '防火墙启动!', '#8ff3ff', 32);
    } else if (p.kind === 'overclock') {
      player.power.overclock = POWER_INFO.overclock.dur * pm;
      popText(p.x, p.y - 40, '超频! 得分翻倍', '#ffd166', 32);
    } else {
      player.power.magnet = POWER_INFO.magnet.dur * pm;
      popText(p.x, p.y - 40, '数据吸附!', '#ff9ad2', 32);
    }
    burst(p.x, p.y, {
      n: 20, col: ['#8ff3ff', '#ffffff', '#8affc1'],
      sp0: 80, sp1: 340, r0: 3, r1: 8, l0: .3, l1: .7, g: 420
    });
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    // Shop and pause freeze the simulation without freezing its UI countdowns.
    var frozen = game.state === 'paused' || game.state === 'shop';

    // worldT drives every idle animation (rice bobbing, obstacle sway, speed
    // lines). It is NOT advanced while frozen: leaving it running made a stopped
    // game still look alive, which is exactly what a pause must not do.
    if (!frozen) worldT += dt;

    if (frozen) return;

    if (game.state === 'title') {
      // idle breathing room on the title screen
      decayFx(dt);
      player.runT += dt;
      camX += 120 * dt;
      return;
    }

    if (game.state === 'over') {
      game.overFade += dt;
      decayFx(dt);
      updateParticles(dt);
      return;
    }

    if (game.hitstop > 0) {
      game.hitstop -= dt;
      decayFx(dt);
      return;
    }

    // ---- zones, events, milestones
    enterZone(zoneAt());
    updateEvent(dt);
    updateMilestones();
    if (zoneTransition.t > 0) zoneTransition.t = Math.max(0, zoneTransition.t - dt / 2.4);
    if (sale.t > 0) {
      sale.t = Math.max(0, sale.t - dt);
      if (sale.t === 0) sale.ids = [];
      updateShopNotice();
    }

    // ---- speed & distance
    // speedMul is an event-time multiplier on top of the difficulty curve, so the
    // ramp itself is untouched and every clearance audit stays valid.
    speed = speedAt(dist) * mulOf('speedMul');
    // Dash multiplies the GROUND COVERED, not `speed`. `speed` is read by
    // jumpK() (so every arc would change shape mid-run), by gapFor() through the
    // live generator, and by the audio intensity. `travel` is what the dash
    // actually buys: ground covered, and the score that follows from it.
    var travel = speed * (player.dashT > 0 ? DASH_TRAVEL : 1);
    camX += travel * dt;
    dist += travel * dt;
    game.score += travel * dt * 0.06 * scoreMul();
    GameAudio.setIntensity((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));

    // An event that fires a fair distance ahead has to actually spawn: the next
    // generation pass happens below, so the wall lands in the queue naturally.
    if (dist >= genEvent.next && fireEvent()) {
      genEvent.next = dist + nextEventGap();
      updateShopNotice();
    }

    var k = jumpK();

    // ---- dash bookkeeping
    if (player.dashT > 0) {
      player.dashT = Math.max(0, player.dashT - dt);
      if (player.dashT === 0) {
        burst(camX + PLAYER_X - 30, player.y - 90, {
          n: 10, col: ['#8affc1', '#ffffff'], sp0: 90, sp1: 300,
          dir: Math.PI, spread: 0.6, r0: 2, r1: 6, g: 400, l0: .15, l1: .4
        });
      }
    }
    if (player.dashGrace > 0) player.dashGrace = Math.max(0, player.dashGrace - dt);
    if (player.dashCd > 0) {
      player.dashCd = Math.max(0, player.dashCd - dt);
      if (player.dashCd === 0) player.charges = dashMax();
    } else {
      topUpCharges();
    }

    // ---- player horizontal is fixed; only vertical simulation
    player.runT += dt;

    // jump buffering / coyote
    if (player.buffer > 0) player.buffer -= dt;
    if (player.coyote > 0) player.coyote -= dt;
    if (player.onGround && !hasTrackSupportAt(camX + PLAYER_X, player.groundY)) {
      // Leaving the edge starts the fall immediately, while the short coyote
      // window still lets a late jump save the run.
      player.onGround = false;
      player.coyote = COYOTE;
      player.sliding = false;
    }

    // slide state. Dashing overrides the slide: a dash low to the ground still
    // covers more than a slide does, so keeping the slide box would only shrink
    // the hitbox without changing anything the player can see.
    var wantSlide = downHeld() && player.onGround && player.dashT === 0;
    if (wantSlide && !player.sliding) {
      player.sliding = true; player.slideT = 0;
      GameAudio.sfx('slide');
      burst(camX + PLAYER_X - 20, player.y, { n: 8, col: ['#bff4ff', '#8fd8ff'], sp0: 40, sp1: 170, dir: Math.PI, spread: 0.8, r0: 2, r1: 6, g: 300, l0: .2, l1: .5 });
    }
    if (player.sliding) {
      player.slideT += dt;
      if (!downHeld() && player.slideT > SLIDE_MIN) player.sliding = false;
      if (!player.onGround) player.sliding = false;
    }

    // jump
    if (player.buffer > 0) {
      if (player.onGround || player.coyote > 0) {
        player.vy = JUMP_V * k;
        player.onGround = false; player.jumps = 1;
        player.coyote = 0; player.buffer = 0;
        player.sliding = false;
        // gravMul latches k^2 so the arc keeps its shape even as the world speed
        // drifts mid-flight. riseMul / fallMul are ABSOLUTE multipliers on top of
        // it, never compounded, so a phase can be tuned without the other one
        // silently following it.
        player.gravMul = k * k;
        player.riseMul = 1;
        player.fallMul = FALL_MUL;
        player.cuttable = true;
        GameAudio.sfx('jump');
        burst(camX + PLAYER_X, player.y, { n: 10, col: ['#cdf3ff', '#8fd8ff', '#ffffff'], sp0: 60, sp1: 210, dir: Math.PI / 2, spread: 1.15, r0: 2, r1: 7, g: 420, l0: .2, l1: .5 });
      } else if (player.jumps < 2) {
        // Math.min so a double jump taken while still rising fast never SLOWS the
        // rise -- it should only ever add height.
        // Height scales with velocity squared, so take the square root of the
        // purchased height bonus to keep each level close to its stated +4%.
        player.vy = Math.min(player.vy, DJUMP_V * k * Math.sqrt(mulOf('jumpMul')));
        player.jumps = 2; player.buffer = 0;
        player.gravMul = k * k;
        player.riseMul = DJ_RISE_G;      // pops up briskly...
        player.fallMul = DJ_FALL_MUL;    // ...then falls on its own gentler curve
        player.cuttable = false;         // the second arc always plays out in full
        player.sliding = false;
        GameAudio.sfx('djump');
        burst(camX + PLAYER_X, player.y - 20, { n: 16, col: ['#bff4ff', '#ffffff', '#7fd4ff'], sp0: 90, sp1: 320, r0: 2, r1: 8, g: 320, l0: .25, l1: .6, shape: 'circle' });
      }
    }

    // gravity — gravMul was latched at take-off so a jump keeps one clean arc
    // even as the world speed (and therefore k) drifts during the flight.
    // `prevFoot` is the pre-integration foot position, handed to the collision
    // pass so a stomp can be resolved as a swept test.
    var prevFoot = player.y;
    if (!player.onGround) {
      // Exactly one of these applies. Compounding them is what made the double
      // jump drop like a stone: the descent used to inherit the rise multiplier
      // AND the fall multiplier, so it fell far faster than either value implies.
      var g = GRAVITY * player.gravMul *
              (player.vy > 0 ? player.fallMul : player.riseMul);
      // Stomp arming: ↓ is held while falling. The resolution itself happens in
      // the collision pass below, where a real obstacle box is available.
      player.stompArm = downHeld() && player.vy > 0;
      // Glide: hold jump past the apex. ↓ always wins — the check below turns a
      // held ↓ into the ordinary fast-fall, so a glide can never strand the
      // runner in the air with no way down.
      var wasGliding = player.gliding;
      player.gliding = jumpHeld() && player.vy > 0 && !downHeld() &&
        player.glideT < glideMax();
      if (player.gliding) {
        if (!wasGliding) {
          GameAudio.sfx('glide');
          popText(camX + PLAYER_X + 20, player.y - 176, '滑翔', '#bff4ff', 22);
        }
        player.glideT += dt;
        g *= GLIDE_G;
      }
      if (downHeld() && player.vy > 0) g *= FASTFALL_MUL;
      player.vy += g * dt;
      // A glide is a terminal-velocity descent, not a hover: without the clamp
      // the reduced gravity would still accumulate into a slam on a long fall.
      if (player.gliding) player.vy = Math.min(player.vy, GLIDE_VMAX * k);
      player.y += player.vy * dt;
      var landedAt = landingSurface(prevFoot, player.y, camX + PLAYER_X);
      if (landedAt !== null) {
        var impact = player.vy;
        player.y = landedAt; player.groundY = landedAt;
        player.vy = 0;
        player.onGround = true;
        player.jumps = 0;
        player.gravMul = 1;
        player.riseMul = 1; player.fallMul = FALL_MUL;
        player.cuttable = false;
        // Touching the ground is what ends a stomp chain and refills the glide
        // stamina, so both verbs cost the player the safety of the floor.
        player.stompChain = 0;
        player.stompArm = false;
        player.gliding = false;
        player.glideT = 0;
        if (impact > 260) {
          GameAudio.sfx('land');
          burst(camX + PLAYER_X, landedAt, { n: impact > 700 ? 14 : 8, col: ['#cdf3ff', '#9fe0ff', '#ffffff'], sp0: 50, sp1: impact > 700 ? 260 : 150, dir: Math.PI / 2, spread: 1.3, r0: 2, r1: 6, g: 500, l0: .18, l1: .45 });
          if (impact > 900) shake(5);
        }
      } else if (player.y > GROUND_Y + 185) {
        recoverFromGap();
      }
    } else {
      player.coyote = COYOTE;
    }

    // ---- level
    extendLevel();
    pruneTrackFeatures();
    updateHints();

    // ---- powerup timers
    for (var pw = 0; pw < TIMED_POWERS.length; pw++) {
      var pk = TIMED_POWERS[pw];
      if (player.power[pk] > 0) player.power[pk] = Math.max(0, player.power[pk] - dt);
    }

    // ---- combo timer
    if (game.comboT > 0) {
      game.comboT -= dt;
      if (game.comboT <= 0) { game.combo = 0; }
    }

    // ---- collisions
    updateMovingHazards(dt);
    var pb = playerBox();

    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      if (o.dead || o.x - camX < -260) { obstacles.splice(i, 1); continue; }
      var ob = obstacleBox(o);
      if (aabb(pb, ob)) {
        // A stomp is resolved before damage: landing on a lid is a reward, and
        // `travel` (not `speed`) is what the near-miss window below must use,
        // because a dashing frame covers almost twice the ground.
        if (!tryStomp(o, ob, prevFoot)) { o.nearMiss = true; damage(o); }
      } else if (ob.x + ob.w <= pb.x + pb.w && ob.x + ob.w >= pb.x + pb.w - speed * dt - 10) {
        rewardNearMiss(o);
      }
    }

    var magnetOn = player.power.magnet > 0;
    var px = camX + PLAYER_X, py = player.y - 84;

    for (var j = pickups.length - 1; j >= 0; j--) {
      var p = pickups[j];
      if (p.x - camX < -200) {
        if (p.riskLine && riskLines[p.riskLine]) {
          riskLines[p.riskLine].intact = false;
          riskLines[p.riskLine].remaining--;
          if (riskLines[p.riskLine].remaining === 0) delete riskLines[p.riskLine];
        }
        pickups.splice(j, 1); continue;
      }
      if (p.got) {
        p.pop += dt * 3.2;
        if (p.pop > 0.5) pickups.splice(j, 1);
        continue;
      }
      if (magnetOn) {
        var dx = px - p.x, dy = py - p.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 300 * 300 && d2 > 1) {
          var d = Math.sqrt(d2);
          var pull = 1500 * dt / Math.max(60, d);
          p.x += dx * pull * 3;
          p.y += dy * pull * 3;
        }
      }
      var cdx = px - p.x, cdy = (player.y - 86) - p.y;
      if (cdx * cdx + cdy * cdy < (p.r + RICE_REACH) * (p.r + RICE_REACH)) collectRice(p);
    }

    for (var m = powerups.length - 1; m >= 0; m--) {
      var q = powerups[m];
      if (q.x - camX < -220) { powerups.splice(m, 1); continue; }
      if (q.got) {
        q.got += dt * 3.2;
        if (q.got > 0.5) powerups.splice(m, 1);
        continue;
      }
      var qdx = px - q.x, qdy = (player.y - 90) - q.y;
      if (qdx * qdx + qdy * qdy < (q.r + POWER_REACH) * (q.r + POWER_REACH)) collectPower(q);
    }

    decayFx(dt);
    updateParticles(dt);
    updateHud();
    updateContentHud();
  }

  function decayFx(dt) {
    game.shake = Math.max(0, game.shake - dt * 62);
    game.flash = Math.max(0, game.flash - dt * 3.2);
    if (player.wince > 0) player.wince -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.cheer > 0) player.cheer -= dt;
    if (player.shock > 0) player.shock -= dt;
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > GROUND_Y + 4 && p.g > 0) { p.y = GROUND_Y + 4; p.vy *= -0.34; p.vx *= 0.72; }
    }
    for (var j = floats.length - 1; j >= 0; j--) {
      floats[j].t += dt;
      if (floats[j].t >= floats[j].life) floats.splice(j, 1);
    }
  }

  // --------------------------------------------------------------------- HUD
  var lastHud = {};
  function updateHud() {
    var sc = Math.floor(game.score);
    if (lastHud.score !== sc) { hud.score.textContent = sc; lastHud.score = sc; }
    if (lastHud.rice !== game.rice) { hud.riceCount.textContent = game.rice; lastHud.rice = game.rice; }

    var showCombo = game.combo > 0 && game.comboT > 0 && game.state === 'playing';
    if (lastHud.comboOn !== showCombo) {
      hud.combo.classList.toggle('on', showCombo);
      lastHud.comboOn = showCombo;
      if (!showCombo) lastHud.comboText = '';
    }
    if (showCombo) {
      var label = 'x' + comboMult();
      var sublabel = comboLabel();
      if (lastHud.comboText !== sublabel) {
        hud.comboTxt.textContent = sublabel;
        lastHud.comboText = sublabel;
      }
      if (lastHud.comboLabel !== label) {
        hud.comboNum.textContent = label;
        hud.comboNum.classList.remove('hit');
        void hud.comboNum.offsetWidth;
        hud.comboNum.classList.add('hit');
        lastHud.comboLabel = label;
      }
      var comboRatio = clamp(game.comboT / comboDuration(), 0, 1);
      hud.comboRing.style.opacity = String(0.15 + comboRatio * 0.5);
      var rs = 0.55 + comboRatio * 0.6;
      hud.comboRing.style.transform = 'scale(' + rs.toFixed(2) + ')';
    }

    // powerup timers
    var want = [];
    TIMED_POWERS.forEach(function (kk) {
      if (player.power[kk] > 0) want.push({ k: kk, t: player.power[kk], d: POWER_INFO[kk].dur });
    });
    if (player.shield) want.push({ k: 'shield', t: 1, d: 1, solid: true });
    var sig = want.map(function (w) { return w.k; }).join(',');
    if (sig !== lastHud.pwSig) {
      hud.powerups.innerHTML = '';
      want.forEach(function (w) {
        var el = document.createElement('div');
        el.className = 'panel pw ' + w.k;
        el.dataset.k = w.k;
        el.innerHTML = '<img src="' + (powerIconURL[w.k] || '') +
          '" alt=""><div class="pwBody"><span class="pwName"></span>' +
          '<div class="bar"><i></i></div></div>';
        // caption from the content table so adding a powerup never needs a CSS edit
        el.querySelector('.pwName').textContent = POWER_INFO[w.k].label;
        hud.powerups.appendChild(el);
      });
      lastHud.pwSig = sig;
    }
    want.forEach(function (w) {
      var el = hud.powerups.querySelector('.pw[data-k="' + w.k + '"]');
      if (el) el.querySelector('.bar i').style.width = (w.solid ? 100 : (w.t / w.d) * 100) + '%';
    });

    // dash charges: one pip per charge, plus a regrow bar while the last one is
    // spent. Kept out of #powerups on purpose — that block is rebuilt wholesale
    // whenever the powerup signature changes, which would wipe these pips.
    var dmax = dashMax();
    var dsig = dmax + '|' + player.charges + '|' + (player.dashCd > 0 ? 1 : 0);
    if (lastHud.dashSig !== dsig) {
      hud.dashPips.innerHTML = '';
      for (var pi = 0; pi < dmax; pi++) {
        var pip = document.createElement('i');
        if (pi >= player.charges) pip.className = 'spent';
        hud.dashPips.appendChild(pip);
      }
      hud.dashCd.classList.toggle('on', player.dashCd > 0);
      lastHud.dashSig = dsig;
    }
    if (player.dashCd > 0) {
      // Only touch the DOM when the console actually moved: this runs on the
      // fixed-step update, which can be 120 times a second.
      var cdw = Math.round(clamp(1 - player.dashCd / DASH_CD, 0, 1) * 100);
      if (lastHud.dashCdW !== cdw) {
        hud.dashCdBar.style.width = cdw + '%';
        lastHud.dashCdW = cdw;
      }
    }

    hud.dashFx.style.opacity = (player.power.chip > 0 || player.dashT > 0) ? 1 : 0;
  }

  // --------------------------------------------------- content HUD (zones etc)
  // These panels are built here rather than authored in index.html so that the
  // whole content layer can be dropped by simply not loading memes.js.
  var cx = {};

  function buildContentHud() {
    var hudEl = document.getElementById('hud');
    document.getElementById('topleft').appendChild(document.getElementById('livesRow'));
    document.getElementById('topright').insertBefore(document.getElementById('riceWrap'), document.getElementById('btns'));
    hudEl.appendChild(document.getElementById('dashHud'));
    hudEl.appendChild(document.getElementById('powerups'));
    document.getElementById('btnShop').title = '白饭商店 · 暂停跑道 (B)';
    document.getElementById('btnShop').setAttribute('aria-label', '打开白饭商店，暂停游戏，快捷键 B');

    // zone plaque, under the score panel
    cx.zone = document.createElement('div');
    cx.zone.id = 'zonePlaque';
    cx.zone.className = 'panel';
    cx.zone.innerHTML = '<span id="zoneTag"></span><b id="zoneName"></b><i id="zoneRule"></i>' +
      '<span id="zoneGoal"></span>';
    hudEl.appendChild(cx.zone);

    // event banner, upper middle-right so it never covers the runner
    cx.banner = document.createElement('div');
    cx.banner.id = 'eventBanner';
    cx.banner.className = 'panel';
    cx.banner.innerHTML =
      '<img id="evFace" alt="">' +
      '<div id="evBody"><div id="evTitle"></div><div id="evText"></div>' +
      '<div id="evCue"></div><div id="evTimer"><i></i></div></div>';
    hudEl.appendChild(cx.banner);

    cx.shop = document.createElement('div');
    cx.shop.id = 'shopPanel';
    cx.shop.className = 'hide';
    cx.shop.setAttribute('role', 'dialog');
    cx.shop.setAttribute('aria-modal', 'true');
    cx.shop.setAttribute('aria-labelledby', 'shopTitle');
    cx.shop.innerHTML =
      '<div class="shopWindow"><header class="shopHeader"><div><h2 id="shopTitle"><img src="' + assetURL('ui/icon_shop') + '" alt="">白饭补给站</h2><p>选择本局升级 · 游戏已暂停</p></div>' +
      '<div id="shopBalance"></div><button id="shopDismiss" aria-label="关闭商店，继续游戏">×</button></header><div id="shopList"></div>' +
      '<footer class="shopFooter"><div id="shopStatus" role="status" aria-live="polite"></div>' +
      '<button class="legbtn primary" id="btnShopClose">' +
      '<img src="' + assetURL('ui/icon_play') + '" alt="">返回跑道 <small>1 秒保护 · B / Esc</small></button></footer></div>';
    // Keep the dialog outside the scaled game stage: text and touch targets
    // retain their real CSS sizes even when the 1280px runway is shrunk.
    document.body.appendChild(cx.shop);

    cx.zoneTag = document.getElementById('zoneTag');
    cx.zoneName = document.getElementById('zoneName');
    cx.zoneRule = document.getElementById('zoneRule');
    cx.zoneGoal = document.getElementById('zoneGoal');
    cx.evFace = document.getElementById('evFace');
    cx.evTitle = document.getElementById('evTitle');
    cx.evText = document.getElementById('evText');
    cx.evCue = document.getElementById('evCue');
    cx.evTimer = document.getElementById('evTimer');
    cx.evTimerBar = cx.evTimer.querySelector('i');
    cx.shopBalance = document.getElementById('shopBalance');
    cx.shopList = document.getElementById('shopList');
    cx.shopStatus = document.getElementById('shopStatus');
    document.getElementById('btnShopClose').addEventListener('click', toggleShop);
    document.getElementById('shopDismiss').addEventListener('click', toggleShop);
  }

  function mascotSrc(id) { return assetURL('mascot/' + id); }

  function showEventBanner(ev) {
    var group = ev.group || eventGroup(ev);
    cx.banner.classList.remove('reward', 'hazard', 'shop', 'mood');
    cx.banner.classList.add(group);
    cx.evTitle.textContent = ev.title;
    cx.evText.textContent = ev.text || '';
    cx.evCue.textContent = ev.cue || (group === 'hazard' ? '注意障碍 · 看跑道提示' :
      group === 'shop' ? '折扣生效 · 可打开商店' :
      group === 'reward' ? '奖励事件 · 留意白饭' : '临时效果 · 留意节奏变化');
    cx.evFace.src = mascotSrc(ev.who);
    cx.evFace.style.display = IMG['mascot/' + ev.who] ? '' : 'none';
    cx.evTimer.style.display = ev.kind === 'timed' ? '' : 'none';
    cx.banner.classList.remove('on');
    void cx.banner.offsetWidth;
    cx.banner.classList.add('on');
  }

  function hideEventBanner() { cx.banner.classList.remove('on'); }

  function updateContentHud() {
    // zone plaque
    var z = ZONES[zoneIdx];
    if (z) {
      if (cx.zoneName.textContent !== z.name) {
        cx.zoneTag.textContent = z.tag || '';
        cx.zoneName.textContent = z.name;
        cx.zoneRule.textContent = z.ruleText || '';
      }
      if (zoneGoal) {
        cx.zoneGoal.textContent = zoneGoal.done ? '目标完成' :
          '目标：' + zoneGoal.label + ' ' + Math.min(zoneGoal.progress, zoneGoal.target) + '/' + zoneGoal.target;
      } else {
        cx.zoneGoal.textContent = '';
      }
      cx.zone.classList.toggle('banner', zoneBannerT > 0);
    }

    // event timer bar
    if (eventDef && eventDef.kind === 'timed') {
      cx.evTimerBar.style.width = clamp(eventT / eventDef.dur, 0, 1) * 100 + '%';
    }

    updateShopNotice();
  }

  /** Push the frozen world back visually while a modal is up. */
  function setSelecting(on) {
    var stage = document.getElementById('stage');
    if (stage) stage.classList.toggle('selecting', !!on);
  }

  function toggleMute() {
    var m = !GameAudio.isMuted();
    GameAudio.setMuted(m);
    var b = document.getElementById('btnSound');
    b.classList.toggle('off', m);
    b.setAttribute('aria-pressed', String(m));
    if (!m) GameAudio.sfx('ui');
  }

  // -------------------------------------------------------------------- boot
  function fitStage() {
    var stage = document.getElementById('stage');
    var pad = 12;
    var k = Math.min((window.innerWidth - pad) / VW, (window.innerHeight - pad) / VH);
    stage.style.transform = 'scale(' + k + ')';
    resizeCanvas(k);
    // The rotate card covers the whole cabinet on a portrait phone, and a run
    // left going behind it would just kill the player for turning their wrist.
    // #rotate decides whether that card is up (the breakpoint lives in its media
    // query); this only observes. Landscape puts the card away but leaves the
    // run paused, so the player resumes on purpose.
    var rot = document.getElementById('rotate');
    if (rot && window.getComputedStyle(rot).display !== 'none') setPause(true);
  }

  function setupCanvas() {
    cv = document.getElementById('cv');
    cv.style.width = VW + 'px';
    cv.style.height = VH + 'px';
    ctx = cv.getContext('2d');
  }

  function resizeCanvas(scale) {
    vignette = null;
    // Match the displayed stage, with a mobile fill-rate budget. Physics stays
    // in the same 1280x720 coordinate system and keeps its 120 Hz timestep.
    dpr = mobileRender
      ? Math.max(0.5, Math.min(1.25, scale * (window.devicePixelRatio || 1)))
      : Math.min(2, window.devicePixelRatio || 1);
    var width = Math.round(VW * dpr), height = Math.round(VH * dpr);
    if (cv.width === width && cv.height === height) return;
    cv.width = width;
    cv.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = mobileRender ? 'low' : 'high';
  }

  var acc = 0, lastT = 0;
  var STEP = 1 / 120;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastT) lastT = now;
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard++ < 8) {
      update(STEP);
      acc -= STEP;
    }
    syncPad();
    render();
  }

  /**
   * The pad is DOM, and `update()` early-returns on every menu state, so it is
   * synced once per rendered frame instead. It only exists during a run (it would
   * otherwise sit on top of the shop board and the pause card), and the dash
   * button mirrors the charge wallet so a tap that does nothing has a visible
   * reason.
   */
  function syncPad() {
    if (!hud.pad) return;
    var on = game.state === 'playing';
    if (lastHud.padOn !== on) {
      hud.pad.classList.toggle('hide', !on);
      if (!on) releasePad();
      lastHud.padOn = on;
    }
    if (hud.padDash && lastHud.padCharges !== player.charges) {
      hud.padDash.classList.toggle('off', player.charges <= 0);
      lastHud.padCharges = player.charges;
    }
  }

  function boot() {
    cacheHud();
    buildContentHud();
    setupCanvas();
    fitStage();
    window.addEventListener('resize', fitStage);
    bindInput();
    loadBest();

    document.getElementById('btnStart').addEventListener('click', function () {
      GameAudio.unlock(); GameAudio.sfx('ui'); startRun();
    });
    document.getElementById('btnPause').addEventListener('click', function () { GameAudio.sfx('ui'); togglePause(); });
    document.getElementById('btnShop').addEventListener('click', function () { GameAudio.sfx('ui'); toggleShop(); });
    document.getElementById('btnSound').addEventListener('click', function () { toggleMute(); });
    document.getElementById('btnAgain').addEventListener('click', function () { GameAudio.sfx('ui'); restart(); });
    document.getElementById('btnHome').addEventListener('click', function () { GameAudio.sfx('ui'); showTitle(); });
    // The only title-card control that leaves the page. A link keeps focus after
    // the click, and Enter is a documented way to start a run, so without the
    // blur the next Enter would open the video again on top of starting the game
    // (Space is already safe: onKeyDown preventDefaults every JUMP_KEY).
    document.getElementById('btnBili').addEventListener('click', function () {
      GameAudio.sfx('ui'); this.blur();
    });

    // Fullscreen exists on desktop browsers and Android; iOS Safari has no API
    // for it at all, so the controls are dropped rather than left as dead buttons
    // and the title card points at 添加到主屏幕 instead. Two of them on purpose:
    // the HUD row is inside #hud, which sits under #overlay, so it is only
    // reachable mid-run; the title card one is what a phone player finds first.
    var root = document.documentElement;
    var canFs = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    var fsBtns = document.querySelectorAll('.jsFs');
    for (var fi = 0; fi < fsBtns.length; fi++) {
      (function (b) {
        b.classList.toggle('hide', !canFs);
        b.addEventListener('click', function (e) {
          e.preventDefault();
          GameAudio.sfx('ui');
          toggleFullscreen();
        });
      })(fsBtns[fi]);
    }
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS && !canFs) document.body.classList.add('ios');

    // Entering or leaving fullscreen changes the viewport, and the browser does
    // not always fire `resize` for it on the way back out.
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (t) {
      document.addEventListener(t, fitStage);
    });

    bindPad();
    buildLives();

    function showLoadError(err) {
      document.getElementById('loading').innerHTML =
        '<div style="max-width:640px;text-align:center;line-height:1.7">' +
        '<div style="font-size:22px;color:#c66d7e;margin-bottom:10px">素材加载失败</div>' +
        '<div style="font-size:15px;color:#607c96">' + (err && err.message ? err.message : '') + '</div>' +
        '<div style="font-size:14px;color:#71869a;margin-top:14px">如果是用 file:// 直接打开的，' +
        '请改用本地服务器：<br><code style="color:#4d91c3">python -m http.server 8000</code> ' +
        '然后访问 <code style="color:#4d91c3">http://localhost:8000</code></div>' +
        '</div>';
    }

    function onReady() {
      hud.emblem.src = assetURL('ui/emblem');
      hud.riceIcon.src = assetURL('item/rice');
      // Keep the run's special effect icon distinct from the base GPU chip.
      POWERS.forEach(function (pk) {
        var im = IMG['item/' + pk];
        powerIconURL[pk] = im && im.toDataURL ? im.toDataURL() : assetURL('item/' + pk);
      });
      var island = IMG['platform/cloud_island'];
      if (island) {
        platformSprite = document.createElement('canvas');
        platformSprite.width = 360;
        platformSprite.height = Math.round(360 * island.naturalHeight / island.naturalWidth);
        var pg = platformSprite.getContext('2d');
        pg.imageSmoothingQuality = 'high';
        pg.drawImage(island, 0, 0, platformSprite.width, platformSprite.height);
      }
      // Give the parallax planes a faint sky-blue wash to keep them airy.
      tinted['bg/far'] = tint(IMG['bg/far'], '192,225,246', 0.10);
      tinted['bg/mid'] = tint(IMG['bg/mid'], '220,240,251', 0.08);
      // Wash each zone scenery toward the sky the same way, so its backdrop
      // sits in the same visual depth as the original art it replaces.
      ZONES.forEach(function (z) {
        if (!z.layers) return;
        var far = IMG['bg/zones/' + z.layers + '/far'];
        var mid = IMG['bg/zones/' + z.layers + '/mid'];
        if (far) tinted['bg/zones/' + z.layers + '/far'] = tint(far, '192,225,246', 0.1);
        if (mid) tinted['bg/zones/' + z.layers + '/mid'] = tint(mid, '220,240,251', 0.08);
      });
      auditContentTags();
      auditZoneArt();
      document.getElementById('loading').classList.add('hide');
      showTitle();
      requestAnimationFrame(frame);
    }

    // Before the preloader, so the shell's requests and loadAll()'s collapse
    // into one set instead of two.
    bindShellAssets();

    loadManifest()
      .then(function () { loadAll(onReady, showLoadError); })
      .catch(showLoadError);
  }

  // Read-only introspection hook. Used by the headless autopilot smoke test and
  // handy in the devtools console; it cannot mutate the run.
  window.DSGame = {
    state: function () { return game; },
    player: function () { return player; },
    world: function () {
      return { camX: camX, speed: speed, dist: dist, obstacles: obstacles, pickups: pickups,
        powerups: powerups, platforms: platforms, gaps: trackGaps, zone:zoneIdx, time:worldT, transition:zoneTransition.t, tier:tier(), event:eventDef };
    },
    box: playerBox,
    lastHit: function () { return game.lastHit; },
    audit: function () { return levelAudit; },
    // How many times each pattern has been built this run, and what the verb
    // hints are doing. Both are otherwise invisible from outside the closure:
    // a pattern that is never picked and a hint that never fires look exactly
    // like a run that simply did not get that far.
    patternCounts: function () { return patternCounts; },
    hints: function () { return { pending: hints, seen: seenHints }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
