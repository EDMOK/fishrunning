# -*- coding: utf-8 -*-
"""
Turn the hand-authored icon sheets in raw/ into transparent game sprites.

These come back from the authoring tool as a single flat image per icon, drawn on
a MAGENTA card. Magenta is used as the key because nothing in this art set is
magenta: the palette is AI blue, compute gold, cream and white outline, so a
colour-distance key is safe here in a way it would not be for, say, the pink
obstacles.

The key is not a hard cut. The authoring background is noisy (±20 per channel)
and the icons carry soft shadows and anti-aliased outlines, so a binary mask
leaves a magenta halo. Instead:

  1. alpha ramps over a distance band, so the outline keeps its soft edge;
  2. the key colour is UNmultiplied back out of every partial pixel
     (C = (C_obs - (1-a)K) / a), which is what actually kills the fringe --
     a hard mask only hides it, and it reappears the moment the sprite is
     scaled down onto a bright background;
  3. specks smaller than a few hundred pixels are dropped, so stray key
     artefacts do not become floating dots in the world.

Run: python tools/cut_icons.py
"""
import os
import sys
import numpy as np
from PIL import Image

# The notes are Chinese and the Windows console default is not UTF-8; without
# this the report prints as mojibake on the machine this project is built on.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    pass

RAW = 'raw'
OUT = 'assets'

# The magenta card, measured from the corners of the source files.
KEY = np.array([241.0, 25.0, 239.0])
# Distance band (chebyshev, per channel). Below LO the pixel is pure background;
# above HI it is pure art. The gap is what soft edges and shadows live in.
LO, HI = 46.0, 118.0
# Drop connected blobs smaller than this many pixels at full alpha.
MIN_BLOB = 220

# (source, output path, box px, note)
#   box px is the LONGEST side; every icon is fitted, never stretched, so a wide
#   plate and a tall card both land inside the same budget.
#   Sizes are 2-4x the CSS display size so the HUD stays crisp on a phone.
#
# Sources are either a keyed sheet from raw/ or an already-cut PNG from the
# previous art pass (those are transparent already and are only resized).
ICONS = [
    # --- lives ---------------------------------------------------------------
    (RAW + '/heart_full_v2.png',   'ui/heart.png',          64, 'life, filled'),
    (RAW + '/heart_empty_v2.png',  'ui/heart_empty.png',    64, 'life, spent'),
    # --- HUD chrome ----------------------------------------------------------
    (RAW + '/pause.png',           'ui/icon_pause.png',    128, 'pause button'),
    (RAW + '/crystal_v2.png',      'ui/emblem.png',        210, 'title lockup + brand mark'),
    (RAW + '/think.png',           'ui/icon_think.png',    128, 'hint speech bubble'),
    # --- touch pad: the big translucent corner buttons ------------------------
    (RAW + '/btn_jump.png',        'ui/pad_jump.png',      240, 'pad: jump'),
    (RAW + '/btn_dash.png',        'ui/pad_dash.png',      240, 'pad: dash / slide'),
    # --- collectibles and powerups -------------------------------------------
    (RAW + '/rice_v2.png',         'item/rice.png',         76, '白饭 pickup + HUD counter'),
    (RAW + '/token_v2.png',        'item/bigrice.png',      96, 'token coin, the fat pickup'),
    (RAW + '/brain_v2.png',        'item/chip.png',         96, 'GPU 加速 powerup'),
    (RAW + '/dash_v2.png',         'item/dash.png',         96, 'shop: 并行冲刺'),
    # Already-transparent masters from the background pass: no keying, but they
    # are re-cut from the master rather than from the small copy in assets/ so
    # the HUD gets the full resolution.
    ('docs/promo/gen_it_spark.png',    'item/overclock.png', 96, '超频 powerup'),
    ('docs/promo/gen_it_datacard.png', 'item/datacard.png',  96, 'shop: 缓存命中'),
    ('docs/promo/gen_it_core.png',     'item/core.png',      96, 'shop: 滑动窗口'),
]
# Anything under raw/ goes through the key; anything else is already transparent.
KEYED_PREFIX = RAW + '/'


def key_out(im):
    """Magenta key -> RGBA, with unmultiply so no halo survives a downscale."""
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    dist = np.abs(rgb - KEY).max(axis=2)
    a = np.clip((dist - LO) / (HI - LO), 0.0, 1.0)

    # Unmultiply: the observed pixel is a*C + (1-a)*KEY, so solve for C.
    safe = np.maximum(a, 1e-4)[..., None]
    unmixed = (rgb - (1.0 - a)[..., None] * KEY) / safe
    rgb = np.where(a[..., None] > 0.002, unmixed, rgb)
    return np.clip(rgb, 0, 255).astype(np.uint8), a


def drop_specks(alpha):
    """Zero out tiny disconnected islands left over from the key."""
    from collections import deque
    h, w = alpha.shape
    solid = alpha > 0.55
    seen = np.zeros_like(solid)
    for sy in range(h):
        for sx in range(w):
            if not solid[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            blob = []
            while q:
                y, x = q.popleft()
                blob.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(blob) < MIN_BLOB:
                for y, x in blob:
                    alpha[y, x] = 0.0
    return alpha


def fit(im, box):
    """Scale so the LONGEST side is `box`; never upscale, never stretch."""
    w, h = im.size
    s = box / float(max(w, h))
    if s >= 1.0:
        return im
    return im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


def main():
    report = []
    for src, out_rel, box, note in ICONS:
        if not os.path.exists(src):
            print('  MISSING  ' + src)
            continue

        if src.startswith(KEYED_PREFIX):
            rgb, alpha = key_out(Image.open(src))
            alpha = drop_specks(alpha)
            rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
            im = Image.fromarray(rgba, 'RGBA')
        else:
            im = Image.open(src).convert('RGBA')

        bb = im.getchannel('A').getbbox()
        if bb is None:
            raise SystemExit('keyed everything away: ' + src)
        im = fit(im.crop(bb), box)

        _write(im, out_rel)
        report.append((out_rel, im.size, note))

    print(f'{"out":24s} {"size":12s} note')
    for name, size, note in report:
        print(f'{name:24s} {str(size):12s} {note}')
    print('\nwrote %d icons' % len(report))


def _write(im, out_rel):
    path = os.path.join(OUT, out_rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


if __name__ == '__main__':
    main()
