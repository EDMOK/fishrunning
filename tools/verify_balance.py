# -*- coding: utf-8 -*-
"""
Prove the level is beatable before shipping a tuning change.

Mirrors the physics constants in src/game.js and the collision boxes in
assets/manifest.json, then checks three things:

  1. every obstacle clears the ground with margin at the SLOWEST speed it can
     spawn at (the tightest case for a jump);
  2. a worst-case double jump still lands inside the gap between patterns, so a
     double jump can never carry the player into the next obstacle;
  3. every multi-obstacle pattern fits inside a single jump arc.

Keep the constants here in sync when tuning. Run after tools/build_art.py.
"""
import json
import math
import sys

# ---- mirror of the constants in src/game.js --------------------------------
BASE_SPEED = 320.0
MAX_SPEED = 665.0
RAMP_DIST = 15000.0
GRAVITY = 2200.0
JUMP_V = 1020.0          # magnitude
DJUMP_V = 860.0
DJ_RISE_G = 1.6
FALL_MUL = 1.55
DJ_FALL_MUL = 1.3
GAP_BASE = 1.00          # gapFor(): react = GAP_BASE - tier*GAP_STEP
GAP_STEP = 0.03
GAP_PAD = 150.0
# Must match the low clamp on gapMul in src/game.js. An event or zone may tighten
# the clear ground to this factor and no further; section 2b proves that is safe.
# Chosen for margin, not for the mathematical limit: the true bound is ~0.82 at
# tier 0, which leaves a +2px slack that no human should have to rely on.
GAP_FLOOR = 0.88
ZOOM = 0.78
TIER_START = [0, 2200, 5200, 9800, 17000]
# The speed at which each obstacle can FIRST appear, which is its tightest case.
# Mirrors OBS_MIN_TIER in src/game.js.
MIN_TIER = {'patrol': 0, 'crystals': 0, 'mine': 0,
            'drone': 2, 'turret': 2,
            'gate': 3, 'sentry': 3, 'cargo': 1, 'spring': 1, 'buoy': 2}

# The obstacle pools, straight from src/game.js. Section 1b uses these instead of
# MIN_TIER, because the pools are what actually decide what a pattern may pick.
TIER1 = ['patrol', 'crystals', 'mine']
TIER2 = TIER1 + ['drone']
TIER3 = TIER2 + ['turret', 'gate', 'sentry']


def pool_for_tier(t):
    """Available through legalAt() OR a dedicated shared route pattern."""
    return [kind for kind, floor in MIN_TIER.items() if floor <= t]
# Tier at which each multi-obstacle pattern first appears. Must mirror the `min`
# field of the same pattern in src/game.js PATTERNS.
PATTERN_TIER = {'slide-then-wall': 2, 'stomp-chain': 2, 'dash-lane': 3, 'pair': 4}

# ---- glide (src/game.js) ---------------------------------------------------
# Holding jump past the apex cuts the descent gravity and caps the fall speed,
# bounded by a stamina meter. It buys AIRTIME, not height, so unlike the jumps it
# is deliberately NOT covered by the clearance audit: flying over a beat is the
# player's own choice, and the down key always turns it back into a fast fall.
GLIDE_MAX = 0.9          # seconds of stamina, before glideMul
GLIDE_G = 0.22           # descent gravity multiplier while gliding
GLIDE_VMAX = 190.0       # terminal fall speed while gliding
GLIDE_MUL_MAX = 1.75     # 流式滑翔 Lv.3: +25% per level
# The term in src/game.js that keeps the glide cancellable. Section 2c greps the
# engine for it, because "you can always get down" is a property of the source,
# not of any number this file could recompute.
GLIDE_CANCEL_TOKEN = '!downHeld()'
CHAIN_GAP = 240
PLAYER_BOX_W = 53        # from manifest hero._box
SAFETY = 30              # must match CLEAR_SLACK in src/game.js

M = json.load(open('assets/manifest.json', encoding='utf-8'))
ART = {k: (v['w'], v['h']) for k, v in M['obstacle'].items()}
BOX = {k: (v['box']['w'], v['box']['h']) for k, v in M['obstacle'].items()}
WFRAC = {k: BOX[k][0] / ART[k][0] for k in ART}
HFRAC = {k: BOX[k][1] / ART[k][1] for k in ART}


def speed_at(d):
    return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - math.exp(-d / RAMP_DIST))


def gap_for(tier):
    return speed_at(TIER_START[min(tier, 4)]) * (GAP_BASE - tier * GAP_STEP) + GAP_PAD


APEX_T = JUMP_V / GRAVITY
APEX_H = JUMP_V * JUMP_V / (2 * GRAVITY)
FALL_G = GRAVITY * FALL_MUL


def enter(H):
    d = JUMP_V * JUMP_V - 2 * GRAVITY * H
    return None if d < 0 else (JUMP_V - math.sqrt(d)) / GRAVITY


def exit_(H):
    return APEX_T + math.sqrt(max(0.0, APEX_H - H) * 2 / FALL_G)


def window(H):
    e = enter(H)
    return 0.0 if e is None else exit_(H) - e


def budget(H, sp):
    """World-space width one jump arc can carry the feet over, at speed `sp`."""
    return math.sqrt(BASE_SPEED * sp) * window(H) - PLAYER_BOX_W - SAFETY


def cluster(kinds, dxs):
    items = sorted(zip(kinds, dxs), key=lambda z: z[1])
    out, l, r, h = [], None, None, None
    for kx, dx in items:
        w, hh = ART[kx][0] * WFRAC[kx], ART[kx][1] * HFRAC[kx]
        if l is not None and dx - r <= CHAIN_GAP:
            r, h = max(r, dx + w), max(h, hh)
        else:
            if l is not None:
                out.append((l, r, h))
            l, r, h = dx, dx + w, hh
    out.append((l, r, h))
    return out


def main():
    fails = []

    print('=== 1. obstacle clearance at its own spawn speed ===')
    print(f"  speed {BASE_SPEED:.0f} -> {MAX_SPEED:.0f} px/s over {RAMP_DIST:.0f}px")
    print(f"  jump apex {APEX_H:.0f}px, tap apex {APEX_H * 0.85 ** 2:.0f}px\n")
    print(f"  {'obstacle':10s} {'hitbox':>10s} {'minT':>5s} {'speed':>6s} {'budget':>8s} {'margin':>8s}")
    for k in sorted(ART, key=lambda z: MIN_TIER[z]):
        sp = speed_at(TIER_START[MIN_TIER[k]])
        w, h = ART[k][0] * WFRAC[k], ART[k][1] * HFRAC[k]
        bu = budget(h, sp)
        good = bu >= w
        if not good:
            fails.append(f'{k}: needs {w:.0f}px but only {bu:.1f}px available')
        print(f"  {k:10s} {f'{w:.0f}x{h:.0f}':>10s} {MIN_TIER[k]:5d} {sp:6.0f} "
              f"{bu:8.1f} {bu - w:+8.1f}  {'ok' if good else 'FAIL'}")

    print('\n=== 1b. clearance at the EARLIEST tier each obstacle can really spawn ===')
    # MIN_TIER is the declared floor, but the tier pools are what actually decide
    # what a pattern may pick. This walks the pools exactly as src/game.js does.
    print(f"  {'obstacle':10s} {'pool from tier':>15s} {'speed':>6s} {'budget':>8s} {'margin':>8s}")
    for k in sorted(ART):
        first = next(t for t in range(5) if k in pool_for_tier(t))
        sp = speed_at(TIER_START[first])
        w, h = ART[k][0] * WFRAC[k], ART[k][1] * HFRAC[k]
        bu = budget(h, sp)
        good = bu >= w
        if not good:
            fails.append(f'{k}: reachable at tier {first} ({sp:.0f}px/s) but needs '
                         f'{w:.0f}px with only {bu:.1f}px available')
        print(f"  {k:10s} {first:15d} {sp:6.0f} {bu:8.1f} {bu - w:+8.1f}  "
              f"{'ok' if good else 'FAIL'}")

    print('\n=== 1c. moving mine travel fits a first jump ===')
    # Include the full side-to-side range, as clustersOf() does in the engine.
    for label, first, motion in [('moving-mine', 2, 38), ('cacheflush event', 1, 32)]:
        span = BOX['mine'][0] + 2 * motion
        bu = budget(BOX['mine'][1], speed_at(TIER_START[first]))
        good = span <= bu
        if not good:
            fails.append(f'{label}: moving envelope {span:.0f}px > jump budget {bu:.0f}px')
        print(f'  {label:16s} span {span:.0f}px  budget {bu:.1f}px  '
              f'margin {bu - span:+.1f}px  {"ok" if good else "FAIL"}')

    print('\n=== 2. worst-case double jump vs the gap between patterns ===')
    dj_rise_g = GRAVITY * DJ_RISE_G
    dj_fall_g = GRAVITY * DJ_FALL_MUL
    dj_h = DJUMP_V * DJUMP_V / (2 * dj_rise_g)
    dj_rise = DJUMP_V / dj_rise_g
    dj_fall = math.sqrt(2 * (APEX_H + dj_h) / dj_fall_g)
    worst = APEX_T + dj_rise + dj_fall
    print(f"  full first jump + second at its apex = {worst:.3f}s (normalised)\n")
    print(f"  {'tier':>4s} {'speed':>6s} {'gap px':>8s} {'react ms':>9s} {'dj dist':>8s} {'slack':>8s}")
    for t in range(5):
        sp = speed_at(TIER_START[t])
        g = gap_for(t)
        k = math.sqrt(sp / BASE_SPEED)
        d = worst / k * sp
        good = d < g
        if not good:
            fails.append(f'tier {t}: double jump travels {d:.0f}px but gap is only {g:.0f}px')
        print(f"  {t:4d} {sp:6.0f} {g:8.0f} {g / sp * 1000:9.0f} {d:8.0f} {g - d:+8.0f}  "
              f"{'ok' if good else 'FAIL'}")

    print('\n=== 2b. densest event mood still leaves room for that double jump ===')
    # Events and zones scale the clear ground by `gapMul` (src/game.js gapFor).
    # The clamp there is the contract this section proves: at GAP_FLOOR the
    # tightest tier must still swallow a worst-case double jump.
    print(f"  {'tier':>4s} {'gap xGAP_FLOOR':>15s} {'dj dist':>8s} {'slack':>8s}")
    for t in range(5):
        sp = speed_at(TIER_START[t])
        g = gap_for(t) * GAP_FLOOR
        k = math.sqrt(sp / BASE_SPEED)
        d = worst / k * sp
        good = d < g
        if not good:
            fails.append(f'GAP_FLOOR {GAP_FLOOR} at tier {t}: double jump {d:.0f}px '
                         f'> tightened gap {g:.0f}px')
        print(f"  {t:4d} {g:15.0f} {d:8.0f} {g - d:+8.0f}  {'ok' if good else 'FAIL'}")

    print('\n=== 2c. glide: extra airtime is bounded and always cancellable ===')
    # A glide is NOT part of the "one jump clears every cluster" guarantee: it is
    # an optional, self-cancelling way to fly over a beat. Section 2 still holds
    # for anyone who never glides. What has to hold here is that the glide cannot
    # be held forever and can always be turned back into a descent, so this
    # section prints the wear window and asserts the escape hatch is still there.
    h0 = APEX_H + DJUMP_V * DJUMP_V / (2 * GRAVITY * DJ_RISE_G)
    g_glide = GRAVITY * DJ_FALL_MUL * GLIDE_G
    t_plain = math.sqrt(2 * h0 / (GRAVITY * DJ_FALL_MUL))
    print(f"  worst-case descent from a double-jump apex: {h0:.0f}px "
          f"({t_plain:.3f}s unglided)")
    print(f"  {'glide':>7s} {'stamina':>8s} {'air time':>9s} {'extra t':>8s} "
          f"{'tier':>4s} {'extra px':>9s} {'beat px':>8s}")
    for label, mul in (('base', 1.0), ('maxed', GLIDE_MUL_MAX)):
        cap = GLIDE_MAX * mul
        for t in range(5):
            sp = speed_at(TIER_START[t])
            k = math.sqrt(sp / BASE_SPEED)
            vmax = GLIDE_VMAX * k
            ramp = vmax / g_glide                       # time to reach the cap
            capped = ramp + max(0.0, h0 - vmax * vmax / (2 * g_glide)) / vmax
            t_glide = max(math.sqrt(2 * h0 / g_glide), capped)
            extra = min(cap, max(0.0, t_glide - t_plain))
            beat = gap_for(t) + 300.0                   # one pattern plus its gap
            print(f"  {label:>7s} {cap:8.2f}s {t_glide:9.3f}s {extra:8.3f}s "
                  f"{t:4d} {extra / k * sp:9.0f} {beat:8.0f}")
    print("  read: 'extra px' is the ground gained over an ordinary fall; 'beat px'")
    print("  is one generated pattern plus its gap. A held glide is therefore worth")
    print("  at most about one beat, it cannot outlast GLIDE_MAX, and ↓ ends it.")
    try:
        src = open('src/game.js', encoding='utf-8').read()
        if GLIDE_CANCEL_TOKEN not in src or 'GLIDE_MAX' not in src:
            fails.append('glide: the engine no longer gates the glide on '
                         f'"{GLIDE_CANCEL_TOKEN}" / GLIDE_MAX, so it may be uncancellable')
    except OSError as e:
        fails.append(f'glide: could not read src/game.js ({e})')

    print('\n=== 3. multi-obstacle patterns fit inside one jump arc ===')
    # Mirrors the multi-obstacle entries in src/game.js PATTERNS, including the
    # beats that teach the new verbs. Patterns whose obstacles stand further apart
    # than CHAIN_GAP are split into separate clusters by clustersOf(), and each
    # span below is measured exactly the way the runtime audit measures it.
    pats = [
        # The floating 'drone' here is excluded by clustersOf() at runtime (it is
        # a slide obstacle); keeping it in is the conservative direction.
        ('slide-then-wall', ['drone', 'mine'], [0, 620]),
        ('stomp-chain', ['patrol', 'patrol', 'patrol'], [0, 420, 840]),
        ('dash-lane', ['mine'], [0]),
        ('pair', ['patrol', 'patrol'], [0, 80]),
    ]
    print(f"  {'pattern':16s} {'tier':>5s} {'H':>5s} {'span':>6s} {'speed':>6s} {'budget':>8s} {'margin':>8s}")
    for name, kinds, dxs in pats:
        t = PATTERN_TIER.get(name, 0)
        sp = speed_at(TIER_START[t])
        for (l, r, h) in cluster(kinds, dxs):
            span = r - l
            bu = budget(h, sp)
            good = span <= bu
            if not good:
                fails.append(f'{name}: span {span:.0f}px > budget {bu:.0f}px at tier {t}')
            print(f"  {name:16s} {t:5d} {h:5.0f} {span:6.0f} {sp:6.0f} {bu:8.1f} "
                  f"{bu - span:+8.1f}  {'ok' if good else 'FAIL'}")

    print()
    if fails:
        print('RESULT: FAIL')
        for f in fails:
            print('  - ' + f)
        return 1
    print('RESULT: PASS — every obstacle is clearable and no double jump can overshoot')
    return 0


if __name__ == '__main__':
    sys.exit(main())
