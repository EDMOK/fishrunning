# -*- coding: utf-8 -*-
"""
Build game-ready sprites from the raw AI-generated art.

Two things make the animation work:
  1. Every hero frame is shifted horizontally so the BODY (not the bbox) lines up.
     The hair streams far to the left and its length changes per frame, so a plain
     bbox-centre alignment would make the character jitter. We measure the centroid
     of the right 55% of the sprite, which is head + torso + legs, and use that.
  2. Every hero frame is bottom-anchored to a "notional ground line". For airborne
     frames the tucked legs mean the bbox bottom is not the real foot line, so each
     frame carries an explicit ground fraction that the game uses to place it.
"""
import json
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fit_boxes import fit_obstacle, fit_hero_body

RAW = 'assets/raw'
OUT = 'assets'

# Everything is authored in a 1280x720 virtual canvas.
HERO_H = 190          # px, full standing height on screen
PAD_X = 24            # transparent margin around hero frames

# name -> (raw file, output name, target height px, ground fraction)
#   ground fraction 1.0  = the bbox bottom is the foot line (grounded frames)
#   ground fraction 0.86 = the notional foot line sits 14% up from the bbox bottom
HERO = [
    # run cycle: contact - passing - contact - passing
    ('char_run_master.png', 'run_a',  HERO_H, 1.00),
    ('hero_apex.png',       'run_b',  HERO_H, 1.00),   # passing pose, one foot planted
    ('hero_run_c.png',      'run_c',  HERO_H, 1.00),
    ('hero_idle.png',       'idle',   HERO_H, 1.00),
    # airborne poses; legs are tucked so the bbox bottom is not the foot line
    ('hero_jump.png',       'jump',   HERO_H, 0.86),   # rising
    ('hero_run_b.png',      'djump',  HERO_H, 0.86),   # second jump, both arms up
    ('hero_apex.png',       'apex',   HERO_H, 0.86),   # floating over the top
    ('hero_fall.png',       'fall',   HERO_H, 0.93),
    ('hero_hurt.png',       'hurt',   HERO_H, 1.00),
    ('hero_cheer.png',      'cheer',  HERO_H, 1.00),
    # Slide is authored on a wider canvas, so it gets its own height reference:
    # matched to the run frames by headdress size rather than bbox height.
    ('hero_slide.png',      'slide',  142,    1.00),
]

OBSTACLES = [
    ('obs_bug.png',    'bug',    62),
    ('obs_spike.png',  'spike',  92),
    ('obs_usb.png',    'usb',   104),
    ('obs_error.png',  'error', 112),
    ('obs_server.png', 'server', 128),
    ('obs_token.png',  'token', 140),
    ('obs_tower.png',  'tower', 150),
]

ITEMS = [
    ('item_chip.png',   'chip',   64),
    ('item_shield.png', 'shield', 60),
    ('item_magnet.png', 'magnet', 60),
    ('rice_bowl.png',   'rice',   52),
    ('rice_ball.png',   'bigrice', 62),
    ('ui_heart.png',    'heart',  46),
]

report = []


def load_cropped(path):
    im = Image.open(path).convert('RGBA')
    bb = im.getchannel('A').getbbox()
    if bb is None:
        raise ValueError('fully transparent: ' + path)
    return im.crop(bb)


def head_anchor_x(im):
    """
    Column of the white maid headdress.

    Every hero frame is aligned on this. Hair streams a different distance in every
    pose and the legs swing, but the headdress is a big bright-white blob that sits
    in the same place on the character in all of them, so it is the one landmark
    that keeps the run cycle from jittering.
    """
    w, h = im.size
    rgb = im.convert('RGB').load()
    a = im.getchannel('A').load()
    y1 = int(h * 0.22)          # headdress lives in the top fifth of the sprite

    cols = []
    for x in range(w):
        hit = False
        for y in range(0, y1):
            r, g, b = rgb[x, y]
            if a[x, y] > 200 and r > 225 and g > 225 and b > 225:
                hit = True
                break
        cols.append(hit)

    best_len = best_start = 0
    run_start = None
    for x in range(w + 1):
        on = x < w and cols[x]
        if on and run_start is None:
            run_start = x
        elif not on and run_start is not None:
            if x - run_start > best_len:
                best_len, best_start = x - run_start, run_start
            run_start = None
    if best_len == 0:
        return w // 2
    return best_start + best_len / 2.0


def build_hero(raw_name, out_name, target_h, ground):
    im = load_cropped(os.path.join(RAW, raw_name))
    w, h = im.size
    scale = target_h / h
    im = im.resize((max(1, round(w * scale)), target_h), Image.LANCZOS)

    ax = round(head_anchor_x(im))
    imw = im.size[0]
    half = max(ax, imw - ax) + PAD_X
    canvas = Image.new('RGBA', (half * 2, im.size[1]), (0, 0, 0, 0))
    canvas.paste(im, (half - ax, 0), im)
    canvas.save(os.path.join(OUT, 'hero', out_name + '.png'))

    # The camera anchor is the headdress (it is what keeps the run cycle from
    # jittering) but the HITBOX is hung off the torso, which sits well behind it.
    body = fit_hero_body(im)
    report.append(('hero/' + out_name, canvas.size, round(scale, 3), ax))
    return {'w': canvas.size[0], 'h': canvas.size[1],
            'anchorX': 0.5, 'ground': ground, 'offX': body['offX']}


def build_simple(raw_name, out_name, target_h, subdir):
    im = load_cropped(os.path.join(RAW, raw_name))
    w, h = im.size
    scale = target_h / h
    im = im.resize((max(1, round(w * scale)), target_h), Image.LANCZOS)
    im.save(os.path.join(OUT, subdir, out_name + '.png'))
    report.append((subdir + '/' + out_name, im.size, round(scale, 3), 0))
    return {'w': im.size[0], 'h': im.size[1]}


def make_seamless_h(im, blend):
    """Cross-fade the two ends so the strip tiles without a visible seam."""
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    if blend * 2 >= w:
        return im
    ramp = np.linspace(0.0, 1.0, blend).reshape(1, blend, 1)
    start = a[:, :blend, :]
    end = a[:, w - blend:w, :]
    blended = start * ramp + end * (1.0 - ramp)
    out = np.concatenate([blended, a[:, blend:w - blend, :]], axis=1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def build_ground():
    """
    The generated art is a lovely circuit-board band but it has a white margin and
    a wavy top edge. A roller needs a dead-flat collision line, so we keep the art
    for the body and draw a straight glowing rim ourselves.
    """
    im = Image.open(os.path.join(RAW, 'ground_top.png')).convert('RGBA')

    # Drop the white margin and the wavy lip; keep the circuit body below them.
    # Shallow crop on purpose: less vertical squish means a wider tile, and a
    # wider tile means the circuit pattern repeats less often on screen.
    body = im.crop((0, 150, im.size[0], 510))
    body = make_seamless_h(body, 320)

    GH = 240
    sc = GH / body.size[1]
    body = body.resize((round(body.size[0] * sc), GH), Image.LANCZOS)

    arr = np.array(body).astype(np.float32)
    w = arr.shape[1]
    # Opaque circuit body, then blend a bright cyan rim into the top few rows.
    arr[:, :, 3] = 255.0
    rim = np.zeros((GH, w, 4), np.float32)
    for y in range(GH):
        if y < 3:
            col, al = (12, 34, 66), 255.0
        elif y < 7:
            col, al = (150, 248, 255), 255.0
        else:
            t = (y - 7) / 22.0
            if t >= 1.0:
                break
            col = (90, 230, 255)
            al = (1.0 - t) ** 2 * 150.0
        rim[y, :, 0], rim[y, :, 1], rim[y, :, 2], rim[y, :, 3] = col[0], col[1], col[2], al
    rim = Image.fromarray(rim.astype(np.uint8))
    body = Image.alpha_composite(body, rim)

    body.save(os.path.join(OUT, 'bg', 'ground.png'))
    report.append(('bg/ground', body.size, round(sc, 3), 0))
    return {'w': body.size[0], 'h': body.size[1], 'surface': 0}


def build_backgrounds():
    meta = {}

    # Sky: opaque full-frame gradient. Scaled to cover the canvas plus a little
    # vertical slack so it can drift.
    sky = Image.open(os.path.join(RAW, 'bg_sky.png')).convert('RGB')
    sw, sh = sky.size
    tw, th = 1280, 720
    s = max(tw / sw, th / sh)
    sky = sky.resize((round(sw * s), round(sh * s)), Image.LANCZOS)
    sky = sky.crop((0, sky.size[1] - th, tw, sky.size[1]))
    sky.save(os.path.join(OUT, 'bg', 'sky.png'))
    report.append(('bg/sky', sky.size, None, 0))

    # Far + mid parallax layers: crop away the empty top, keep a tileable strip.
    # The far skyline is deliberately TALLER than the mid row of racks so it still
    # peeks over the top of them; same footprint would hide it completely.
    for name, keep in (('far', 0.62), ('mid', 0.62)):
        im = Image.open(os.path.join(RAW, f'bg_{name}.png')).convert('RGBA')
        bb = im.getchannel('A').getbbox()
        im = im.crop(bb)
        im = im.crop((0, round(im.size[1] * (1 - keep)), im.size[0], im.size[1]))
        # shrink to a sane in-game height
        target_h = {'far': 322, 'mid': 246}[name]
        sc = target_h / im.size[1]
        im = im.resize((round(im.size[0] * sc), target_h), Image.LANCZOS)
        im.save(os.path.join(OUT, 'bg', name + '.png'))
        meta[name] = {'w': im.size[0], 'h': im.size[1]}
        report.append((f'bg/{name}', im.size, round(sc, 3), 0))

    # Ground: a full-width opaque band whose top edge is the walkable surface.
    meta['ground'] = build_ground()
    return meta


# Each zone ships four layers. They are generated as one 3:2 artwork per layer
# rather than as pre-cut strips, so the slicing below is what actually turns them
# into game geometry: a sky that covers the frame, two scenery strips that stand
# on the ground line and fade out at the top, and a tileable walkable band.
ZONES = ['arena', 'market', 'vault', 'wall']
ZONE_LAYER_H = {'far': 322, 'mid': 246, 'ground': 240}
ZONE_SKY = (1280, 720)


def alpha_ramp(im, fade=0.30):
    """Fade the top of a scenery strip to nothing so it melts into the sky.

    The generated art is opaque, but these layers are meant to be silhouettes
    standing on the horizon. Without the ramp the strip's top edge reads as a
    hard horizontal seam sliding across the backdrop.
    """
    a = np.array(im.convert('RGBA')).astype(np.float32)
    h = a.shape[0]
    ramp = np.ones(h, np.float32)
    cut = max(1, int(h * fade))
    ramp[:cut] = np.linspace(0.0, 1.0, cut) ** 1.4
    a[:, :, 3] *= ramp[:, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def zone_ground_rim(im):
    """Put a lit lip on the walkable surface so the collision line is readable."""
    a = np.array(im.convert('RGBA')).astype(np.float32)
    a[:, :, 3] = 255.0
    h, w = a.shape[:2]
    for y in range(h):
        if y < 3:
            a[y, :, :3] = (10, 30, 60)
        elif y < 7:
            a[y, :, :3] = (150, 248, 255)
        else:
            t = (y - 7) / 26.0
            if t >= 1.0:
                break
            a[y, :, :3] = a[y, :, :3] * (1 - (1 - t) ** 2 * 0.55) + \
                np.array([90, 230, 255]) * ((1 - t) ** 2 * 0.55)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def build_zones():
    """Slice each zone's four generated layers into game-ready strips."""
    meta = {}
    for z in ZONES:
        # under a `zones/` namespace: `bg/far` and `bg/mid` already exist at the
        # top level, and a zone called "mid" would otherwise collide with them
        zdir = os.path.join(OUT, 'bg', 'zones', z)
        os.makedirs(zdir, exist_ok=True)
        zmeta = {}

        # sky: opaque, cover-cropped to the frame, anchored to the bottom so the
        # interesting part (which sits low in these renders) survives the crop
        sky = Image.open(os.path.join(RAW, f'zone_{z}_sky.png')).convert('RGB')
        sw, sh = sky.size
        s = max(ZONE_SKY[0] / sw, ZONE_SKY[1] / sh)
        sky = sky.resize((round(sw * s), round(sh * s)), Image.LANCZOS)
        sky = sky.crop((0, sky.size[1] - ZONE_SKY[1], ZONE_SKY[0], sky.size[1]))
        sky.save(os.path.join(zdir, 'sky.png'))
        zmeta['sky'] = {'w': sky.size[0], 'h': sky.size[1]}

        # scenery strips
        for name in ('far', 'mid'):
            im = Image.open(os.path.join(RAW, f'zone_{z}_{name}.png')).convert('RGBA')
            keep = 0.46
            im = im.crop((0, round(im.size[1] * (1 - keep)), im.size[0], im.size[1]))
            im = make_seamless_h(im, max(24, im.size[0] // 8))
            target_h = ZONE_LAYER_H[name]
            sc = target_h / im.size[1]
            im = im.resize((round(im.size[0] * sc), target_h), Image.LANCZOS)
            im = alpha_ramp(im, 0.34 if name == 'far' else 0.26)
            im.save(os.path.join(zdir, name + '.png'))
            zmeta[name] = {'w': im.size[0], 'h': im.size[1]}

        # walkable band
        im = Image.open(os.path.join(RAW, f'zone_{z}_ground.png')).convert('RGBA')
        keep = 0.34
        im = im.crop((0, round(im.size[1] * (1 - keep)), im.size[0], im.size[1]))
        im = make_seamless_h(im, max(32, im.size[0] // 7))
        target_h = ZONE_LAYER_H['ground']
        sc = target_h / im.size[1]
        im = im.resize((round(im.size[0] * sc), target_h), Image.LANCZOS)
        im = zone_ground_rim(im)
        im.save(os.path.join(zdir, 'ground.png'))
        zmeta['ground'] = {'w': im.size[0], 'h': im.size[1], 'surface': 0}

        meta[z] = zmeta
        report.append((f'bg/zones/{z}', sky.size, None, 0))
        report.append((f'bg/zones/{z}/far+mid', zmeta['far']['w'], None, 0))
        report.append((f'bg/zones/{z}/ground', zmeta['ground']['w'], None, 0))
    return meta


def main():
    for d in ('hero', 'obstacle', 'item', 'bg', 'ui'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)

    hero_meta = {}
    for raw, out, th, g in HERO:
        hero_meta[out] = build_hero(raw, out, th, g)

    obs_meta = {}
    for raw, out, th in OBSTACLES:
        m = build_simple(raw, out, th, 'obstacle')
        im = Image.open(os.path.join(OUT, 'obstacle', out + '.png'))
        m['box'] = fit_obstacle(im)
        obs_meta[out] = m

    item_meta = {}
    for raw, out, th in ITEMS:
        sub = 'ui' if out == 'heart' else 'item'
        item_meta[out] = build_simple(raw, out, th, sub)

    # emblem used on the title screen
    build_simple('ui_emblem.png', 'emblem', 210, 'ui')
    build_simple('ui_grain.png', 'grain', 34, 'ui')

    bg_meta = build_backgrounds()
    bg_meta['zones'] = build_zones()

    slide_im = Image.open(os.path.join(OUT, 'hero', 'slide.png'))
    hero_meta['_box'] = {
        'stance': fit_hero_body(Image.open(os.path.join(OUT, 'hero', 'run_a.png'))),
        'slide': fit_obstacle(slide_im, grounded=True),
        'slideW': slide_im.size[0], 'slideH': slide_im.size[1],
        'designH': HERO_H
    }

    manifest = {'hero': hero_meta, 'obstacle': obs_meta,
                'item': item_meta, 'bg': bg_meta}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)

    print(f'{"asset":22s} {"size":14s} {"scale":>6s}')
    for name, size, sc, _ in report:
        print(f'{name:22s} {str(size):14s} {str(sc):>6s}')
    print('\nwrote assets/manifest.json')


if __name__ == '__main__':
    main()
