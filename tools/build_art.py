# -*- coding: utf-8 -*-
"""
Build the whole runtime art set. This is the one command to run after new
artwork lands in docs/promo/ or raw/.

Pipeline:
  raw/            hand-painted icons on a magenta card  -> keyed  (cut_icons)
  docs/promo/     painted backdrops and props           -> sliced (build_zones)
  (drawn)         UI chrome with no painted master      -> drawn  (draw_ui)

and then this file assembles the parts that are neither: obstacles scaled to
their collision height, the collectible set remapped onto the new art, and the
floating-platform slices. It finishes by writing assets/manifest.json and
deleting anything the new set no longer ships, because a stale PNG left in the
tree is a file the next person will assume is live.

Every target height below is a WORLD pixel height (the game renders the world at
ZOOM = 0.78). They are the numbers tools/verify_balance.py audits for
clearability, so changing one here without re-running that script is how a
pattern stops being jumpable.

Run: python tools/build_art.py [--keep-old]
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fit_boxes import fit_obstacle, fit_hero_body

try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    pass

import cut_icons
import draw_ui
import build_zones

PROMO = 'docs/promo'
OUT = 'assets'


# ------------------------------------------------------------------ helpers --

def load_trim(path):
    im = Image.open(path).convert('RGBA')
    bb = im.getchannel('A').getbbox()
    return im.crop(bb) if bb else im


def scale_to_h(im, target_h):
    sc = target_h / im.size[1]
    return im.resize((max(1, round(im.size[0] * sc)), target_h), Image.LANCZOS)


def save(im, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


# ---------------------------------------------------------------- obstacles --
# The obstacle set is built by tools/build_new_obstacles.py from raw/obstacle_new
# (the white-and-navy patrol / crystal / mine / drone / turret / gate / sentry
# robots) and its per-kind hitboxes live in the manifest written there. This file
# no longer draws obstacles: the earlier prop set it used to generate from
# docs/promo/ is retired, and regenerating it here would put retired art back on
# disk next to the live set. Keep the manifest's obstacle table as it stands.


# -------------------------------------------------------------------- items --
# Collectibles and powerups, remapped onto the new art drop. `POWER_INFO` in
# src/game.js keys off these names, so a rename here is a code change there too.
ITEMS = [
    ('rice',      'assets/item/rice.png',        52, '白饭: the base pickup'),
    ('bigrice',   'assets/item/bigrice.png',     62, 'token coin: the fat pickup'),
    ('chip',      'assets/item/chip.png',        64, 'GPU 加速 powerup (brain)'),
    ('shield',    'assets/item/oss.png',         60, '防火墙 powerup (open-source badge)'),
    ('magnet',    'assets/item/datacard.png',    60, '数据吸附 powerup (data card)'),
    ('overclock', 'assets/item/spark.png',       64, '超频 powerup (inference spark)'),
    ('core',      'assets/item/core.png',        64, 'AGI core: rare, unspent for now'),
    ('dash',      'assets/item/dash.png',        64, 'shop: 并行冲刺'),
    ('oss',       'assets/item/oss.png',         64, 'shop: 开源徽章'),
    ('datacard',  'assets/item/datacard.png',    64, 'shop: 数据卡'),
    ('spark',     'assets/item/spark.png',       64, 'shop: 推理火花'),
]


def build_items():
    meta = {}
    report = []
    for name, src, target_h, note in ITEMS:
        im = scale_to_h(load_trim(src), target_h)
        save(im, 'item/' + name + '.png')
        meta[name] = {'w': im.size[0], 'h': im.size[1]}
        report.append(('item/' + name, im.size, note))
    return meta, report


# ---------------------------------------------------------------- platforms --
# One platform is drawn as three pieces so a run of any width reads as a single
# solid slab with rounded ends: a left cap, a tileable middle, a right cap. The
# painted band from the art drop becomes the walking surface on top of a body
# drawn in the house style, because the painted strips have square ends and a
# platform needs a silhouette.
PLAT_H = 40                 # world px, total platform height
CAP_W = 46
MID_W = 128
SURFACE_H = 15              # painted band across the top


def platform_pieces(style, surface_path, body, edge, body_light):
    surf = load_trim(surface_path)
    surf = surf.resize((max(1, round(surf.size[0] * SURFACE_H / surf.size[1])), SURFACE_H),
                       Image.LANCZOS)
    S = 4
    R = 15

    def slab(width, round_left, round_right):
        """Body of one piece, at 4x, with only the requested ends rounded."""
        im = Image.new('RGBA', (width * S, PLAT_H * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)

        def shape(box, radius, fill):
            if round_left and round_right:
                d.rounded_rectangle(box, radius=radius, fill=fill)
                return
            # Round the far ends by drawing a rounded rect that overhangs the
            # canvas on the square side and cropping it back: simpler than
            # assembling a path, and it keeps the corner radius identical
            # across all three pieces.
            pad = radius if not round_left else 0
            pad_r = radius if not round_right else 0
            d.rounded_rectangle([box[0] - pad, box[1], box[2] + pad_r, box[3]],
                                radius=radius, fill=fill)

        shape([0, 3 * S, width * S, (PLAT_H - 3) * S], R * S, edge)
        shape([0, 0, width * S, (PLAT_H - 6) * S], R * S, body)
        d.rounded_rectangle([7 * S, 5 * S, (width - 7) * S, 16 * S],
                            radius=6 * S, fill=body_light)
        return im.resize((width, PLAT_H), Image.LANCZOS)

    def one(width, round_left, round_right):
        out = slab(width, round_left, round_right)
        band = Image.new('RGBA', (width, PLAT_H), (0, 0, 0, 0))
        x = 0
        while x < width:
            band.alpha_composite(surf, (x, 0))
            x += surf.size[0]
        return Image.alpha_composite(out, band.crop((0, 0, width, SURFACE_H)))

    save(one(CAP_W, True, False), f'platform/{style}_left.png')
    save(one(MID_W, False, False), f'platform/{style}_mid.png')
    save(one(CAP_W, False, True), f'platform/{style}_right.png')
    return {
        'h': PLAT_H,
        'left': {'w': CAP_W, 'h': PLAT_H},
        'mid': {'w': MID_W, 'h': PLAT_H},
        'right': {'w': CAP_W, 'h': PLAT_H},
    }


def build_platforms():
    meta = {}
    meta['cloud'] = platform_pieces('cloud', f'{PROMO}/gen_plat_cloud.png',
                                    body=(236, 246, 255, 255), edge=(72, 132, 200, 255),
                                    body_light=(255, 255, 255, 220))
    meta['glass'] = platform_pieces('glass', f'{PROMO}/gen_plat_glass.png',
                                    body=(176, 216, 246, 255), edge=(48, 106, 176, 255),
                                    body_light=(226, 244, 255, 210))
    return meta, [('platform/' + k, (v['mid']['w'], v['h']), s)
                  for k, s in (('cloud', 'cloud deck'), ('glass', 'glass deck'))]


# ------------------------------------------------------------------ pruning --
# Files the previous art set shipped that nothing in the new set refers to. They
# are deleted rather than left behind: an unused PNG is indistinguishable from a
# live one to the next reader, and the loader's fallback path would happily keep
# serving old art for a renamed key. That is not hypothetical: the cartoon bug
# was retired months of commits ago and still turned up in an illustration,
# because it was still sitting in assets/.
STALE = [
    'ui/retro_ring.png', 'ui/retro_title_bg.jpg', 'ui/grain.png',
    'ui/badge_chip.png', 'ui/chip.png',
    # Replaced by CSS glyphs when the touch pad became real buttons, and by the
    # drawn mascot set for the thinking bubble.
    'ui/icon_think.png', 'ui/pad_dash.png', 'ui/pad_jump.png',
    # The cartoon obstacle drop and the prop set that replaced it — every one of
    # them is now drawn as a machine, by tools/build_new_obstacles.py.
    'obstacle/bug.png', 'obstacle/spike.png', 'obstacle/usb.png',
    'obstacle/error.png', 'obstacle/server.png', 'obstacle/token.png',
    'obstacle/tower.png',
    'obstacle/loop.png', 'obstacle/popup.png', 'obstacle/context.png',
    'obstacle/ratelimit.png',
    'obstacle/popup_blue.png', 'obstacle/loop_blue.png',
    'item/shield_old.png',
]
# NOT stale, whatever an earlier version of this list said: the two surface
# strips are the track cap drawTrackSurface() repeats along the ground line.
# Deleting them silently removes the bright walking surface from every zone.
# Directories that hold nothing but retired art. Removed whole.
STALE_DIRS = ['obstacle/cartoon']


def prune(keep_old):
    if keep_old:
        print('\n--keep-old: stale files left in place')
        return []
    if os.path.isdir('dist'):
        shutil.rmtree('dist')
    if os.path.exists('dist.zip'):
        os.remove('dist.zip')
    removed = []
    for rel in STALE:
        p = os.path.join(OUT, rel)
        if os.path.exists(p):
            os.remove(p)
            removed.append(rel)
    for rel in STALE_DIRS:
        p = os.path.join(OUT, rel)
        if os.path.isdir(p):
            shutil.rmtree(p)
            removed.append(rel + '/')
    return removed


def main():
    keep_old = '--keep-old' in sys.argv
    print('=== 1. keyed icons (raw/) ===')
    cut_icons.main()
    print('\n=== 2. drawn UI chrome ===')
    draw_ui.main()
    print('\n=== 3. backdrops (docs/promo/) ===')
    build_zones.main()

    print('\n=== 4. obstacles (built by tools/build_new_obstacles.py) ===')

    print('\n=== 5. collectibles and powerups ===')
    item_meta, item_rep = build_items()
    for name, size, note in item_rep:
        print(f'  {name:26s} {str(size):12s} {note}')

    print('\n=== 6. platforms ===')
    plat_meta, plat_rep = build_platforms()
    for name, size, note in plat_rep:
        print(f'  {name:26s} {str(size):12s} {note}')

    # Hero boxes come from the hero art, which the new drop does not change: the
    # runner was already authored in this style. They are re-measured anyway so
    # the manifest is always a product of this script and never half-inherited.
    hero_box = {
        'stance': fit_hero_body(Image.open(f'{OUT}/hero/run_a.png').convert('RGBA')),
        'slide': fit_obstacle(Image.open(f'{OUT}/hero/slide.png').convert('RGBA'),
                              grounded=True),
        'slideW': Image.open(f'{OUT}/hero/slide.png').size[0],
        'slideH': Image.open(f'{OUT}/hero/slide.png').size[1],
        'designH': 190,
    }

    old = json.load(open(f'{OUT}/manifest.json', encoding='utf-8')) \
        if os.path.exists(f'{OUT}/manifest.json') else {}
    manifest = {
        'hero': old.get('hero', {}),
        # Inherited, not rebuilt: the obstacle table is written by the obstacle
        # build and this script must not overwrite it with a set it no longer
        # knows how to make.
        'obstacle': old.get('obstacle', {}),
        'item': item_meta,
        'platform': plat_meta,
        'bg': old.get('bg', {}),
    }
    manifest['hero']['_box'] = hero_box
    with open(f'{OUT}/manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)

    removed = prune(keep_old)
    print('\n=== 7. manifest + prune ===')
    print('  wrote assets/manifest.json '
          f'({len(manifest["obstacle"])} obstacles, {len(item_meta)} items, '
          f'{len(plat_meta)} platform styles)')
    if removed:
        print(f'  removed {len(removed)} stale files: ' + ', '.join(removed))
    if os.path.isdir('dist'):
        print('  removed dist/ (stale build; re-run tools/make_dist.py)')
    print('\ndone. next: python tools/verify_balance.py')


if __name__ == '__main__':
    main()
