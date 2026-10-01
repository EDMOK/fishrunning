# -*- coding: utf-8 -*-
"""
Visual proof that the collision boxes match the art.

Draws every sprite with the box the game will use (read from
assets/manifest.json) plus the raw silhouette box for comparison. Run after tools/build_art.py.
"""
import json
import os
import numpy as np
from PIL import Image, ImageDraw

A = 'assets'
M = json.load(open(f'{A}/manifest.json', encoding='utf-8'))
SPEC = M['hero']['_box']
H = SPEC['designH']
os.makedirs('preview', exist_ok=True)


def sprite_path(key):
    """Where a manifest key's PNG actually lives.

    The obstacle set is drawn into assets/obstacle/new/, so the flat
    `assets/<cat>/<name>.png` rule only holds for the categories built in place.
    """
    flat = f'{A}/{key}.png'
    if os.path.exists(flat):
        return flat
    nested = f'{A}/{key.split("/")[0]}/new/{key.split("/")[1]}.png'
    return nested if os.path.exists(nested) else flat


def sil_box(im, lo=0.06, hi=0.94):
    m = np.array(im.convert('RGBA'))[:, :, 3]
    ys, xs = np.nonzero(m > 128)
    if len(xs) == 0:
        return None
    return (float(np.percentile(xs, lo * 100)), float(np.percentile(ys, lo * 100)),
            float(np.percentile(xs, hi * 100)), float(np.percentile(ys, hi * 100)))


def hero_box_px(name, w, h):
    if name == 'slide':
        s = SPEC['slide']
        return (s['x'], h - SPEC['slideH'] + s['y'], s['x'] + s['w'], h - SPEC['slideH'] + s['y'] + s['h'])
    st = SPEC['stance']
    bw, bh = st['wFrac'] * H, st['boxHFrac'] * H
    g = M['hero'][name]['ground']
    bottom = h * g
    cx = w / 2 + st['offX'] * H
    return (cx - bw / 2, bottom - bh, cx + bw / 2, bottom)


CELL, COLS, PAD = 200, 5, 26
names = (['hero/' + k for k in M['hero'] if not k.startswith('_')] +
         ['obstacle/' + k for k in M['obstacle']])
rows = (len(names) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * CELL, rows * (CELL + PAD)), (238, 240, 244))
d = ImageDraw.Draw(sheet, 'RGBA')

print(f"{'sprite':18s} {'art':>10s} {'game box (x,y,w,h)':>24s} {'offset from sprite centre':>26s}")
for i, key in enumerate(names):
    cat, name = key.split('/')
    im = Image.open(sprite_path(key)).convert('RGBA')
    w, h = im.size
    if cat == 'hero':
        box = hero_box_px(name, w, h)
    else:
        b = M['obstacle'][name]['box']
        box = (b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h'])
    print(f"{key:18s} {f'{w}x{h}':>10s} "
          f"{f'({box[0]:.0f},{box[1]:.0f},{box[2]-box[0]:.0f},{box[3]-box[1]:.0f})':>24s} "
          f"{f'L{box[0]:+.0f} R{w-box[2]:+.0f} T{box[1]:+.0f} B{h-box[3]:+.0f}':>26s}")

    cx, cy = (i % COLS) * CELL, (i // COLS) * (CELL + PAD)
    sc = min((CELL - 16) / w, (CELL - 16) / h, 1.0)
    tw, th = max(1, int(w * sc)), max(1, int(h * sc))
    t = im.resize((tw, th), Image.LANCZOS)
    ox, oy = cx + (CELL - tw) // 2, cy + (CELL - th) // 2
    for yy in range(cy, cy + CELL, 14):
        for xx in range(cx, cx + CELL, 14):
            if ((xx // 14 + yy // 14) % 2) == 0:
                d.rectangle([xx, yy, xx + 13, yy + 13], fill=(203, 208, 218, 255))
    sheet.paste(t, (ox, oy), t)
    d.rectangle([ox + box[0] * sc, oy + box[1] * sc, ox + box[2] * sc, oy + box[3] * sc],
                outline=(255, 60, 80, 255), width=2)
    sb = sil_box(im)
    if sb:
        d.rectangle([ox + sb[0] * sc, oy + sb[1] * sc, ox + sb[2] * sc, oy + sb[3] * sc],
                    outline=(30, 220, 120, 150), width=1)
    d.text((cx + 4, cy + CELL + 6), key, fill=(20, 24, 40, 255))

sheet.save('preview/hitbox_audit.png')
print('\nred  = box the game uses (from manifest)')
print('green = raw alpha silhouette 6-94 percentile')
print('saved preview/hitbox_audit.png')
