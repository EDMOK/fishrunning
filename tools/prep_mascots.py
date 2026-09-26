# -*- coding: utf-8 -*-
"""
Turn the character illustrations into game-ready mascots.

The originals are flat-backdrop illustrations, several of which are crops of group
shots or have white-on-white characters, so cutting them directly is unreliable.
Instead the art is first re-rendered from its own reference into a standard sprite
request — clean idle pose, whole body, nothing touching the frame, and a flat
matte backdrop. Those renders come back either already alpha-cut or on a solid
magenta field, and both are trivial to finish:

  * RGBA renders are used as-is;
  * magenta renders get a chroma key. The matte is a single saturated colour that
    no character in this set uses, and the key is biased inward so no pink fringe
    survives on the silhouette.

From there every mascot gets the same treatment: trim, scale to a common body
height, and emit a square head-and-shoulders crop for event banners.

Outputs, per mascot:
  assets/mascot/<id>.png       full body, transparent, BODY_H tall
  assets/mascot/<id>_face.png  square portrait for event cards
"""
import json
import os

import numpy as np
from PIL import Image

RAW = 'assets/raw'
OUT = 'assets/mascot'
BODY_H = 168        # px tall in the 1280x720 virtual canvas
FACE = 132          # px square portrait for banners

IDS = ['deepseek', 'qwen', 'zhipu', 'claude', 'gpt', 'gemini']

# A magenta matte is keyed by hue, not by exact value, so a slightly soft or
# vignetted render still clears. HUE_WIN is in degrees on the colour wheel; the
# character set contains no magenta, so this cannot eat part of a costume.
MAGENTA_HUE = 300.0
HUE_WIN = 26.0
MIN_SAT = 0.35
MIN_VAL = 0.15

TRANSPARENT_ENOUGH = 0.12    # a render this transparent already has a real cut


def rgb_to_hsv(arr):
    """Vectorised HSV (h in degrees, s/v in 0..1) for a uint8 RGB array."""
    a = arr.astype(np.float32) / 255.0
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rm, gm, bm = (mx == r) & nz, (mx == g) & nz, (mx == b) & nz
    h[rm] = (60 * ((g - b) / np.where(nz, d, 1)) % 360)[rm]
    h[gm] = (60 * ((b - r) / np.where(nz, d, 1)) + 120)[gm]
    h[bm] = (60 * ((r - g) / np.where(nz, d, 1)) + 240)[bm]
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0.0)
    return h, s, mx


def key_magenta(im):
    rgb = np.asarray(im.convert('RGB'))
    h, s, v = rgb_to_hsv(rgb)
    dh = np.abs(((h - MAGENTA_HUE + 180) % 360) - 180)
    matte = (dh < HUE_WIN) & (s > MIN_SAT) & (v > MIN_VAL)
    return matte


def alpha_of(im):
    """Per-pixel foreground coverage in 0..1."""
    if im.mode == 'RGBA':
        a = np.asarray(im)[:, :, 3].astype(np.float32) / 255.0
        if (a < 0.5).mean() > TRANSPARENT_ENOUGH:
            return a
    matte = key_magenta(im)
    # Bias the threshold inward: a pixel is only foreground if it is clearly not
    # matte, and its immediate neighbours are not either. This is what kills the
    # pink fringe a chroma key otherwise leaves around hair and ruffles.
    from scipy import ndimage
    hard = (~matte).astype(np.float32)
    grown = ndimage.grey_erosion(hard, size=(3, 3))
    soft = ndimage.gaussian_filter(grown, 0.8)
    return np.clip((soft - 0.35) / 0.40, 0.0, 1.0)


def trim(im):
    bb = im.getchannel('A').getbbox()
    return im.crop(bb) if bb else im


def build_face(im):
    """Head-and-shoulders square. These are head-heavy Q-version drawings, so the
    top band of the trimmed art holds the face: keep the head width, square below."""
    w, h = im.size
    box = im.crop((0, int(h * 0.02), w, int(h * 0.02) + int(h * 0.46)))
    bw, bh = box.size
    side = max(bw, bh)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(box, ((side - bw) // 2, 0), box)
    return canvas.resize((FACE, FACE), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}
    for mid in IDS:
        path = os.path.join(RAW, 'mascot_%s.png' % mid)
        if not os.path.exists(path):
            print('MISSING ' + path)
            continue
        src = Image.open(path)
        cov = alpha_of(src)
        rgba = src.convert('RGB').copy()
        rgba.putalpha(Image.fromarray((cov * 255).astype(np.uint8)))
        cut = trim(rgba)

        w, h = cut.size
        sc = BODY_H / h
        body = cut.resize((max(1, round(w * sc)), BODY_H), Image.LANCZOS)
        face = build_face(cut)
        body.save(os.path.join(OUT, mid + '.png'))
        face.save(os.path.join(OUT, mid + '_face.png'))

        cover = float((cov > 0.5).mean())
        report[mid] = {'body': body.size, 'face': face.size, 'cut': cut.size,
                       'coverage': round(cover, 3)}
        print('%-9s src=%-16s cut=%-12s body=%-9s cover=%.2f' % (mid, src.size, cut.size, body.size, cover))

    with open(os.path.join(OUT, 'mascots.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    print('wrote ' + os.path.join(OUT, 'mascots.json'))


if __name__ == '__main__':
    main()
