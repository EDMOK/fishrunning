# -*- coding: utf-8 -*-
"""
Slice the bright AI-city artwork into the game's parallax layers, once per zone.

The authoring art is one big picture per layer per zone idea, not a set of game
strips, so this file is what actually turns pictures into geometry:

  sky    cover-cropped to the 1280x720 frame, anchored to the BOTTOM, because the
         interesting part of these renders (horizon, cloud bank) sits low.
  far    the bottom 46% of the picture, made seamless across its width, faded
  mid    out at the top so the strip melts into the sky instead of showing the
         cut as a hard horizontal seam sliding past.
  ground the bottom 34%, seamless, opacity forced to 1 and finished with a lit
         rim: this band's top edge IS the collision line the runner stands on,
         so it has to be dead flat and unmistakable. The art's own wavy lip is
         cropped away on purpose.

Only one bright backdrop exists as art. Per-zone identity therefore comes from a
grade (hue rotation + saturation + a tint toward the zone's accent) applied here,
at build time, rather than from tinting at runtime: the layers are drawn every
frame, and a canvas tint of a 2000px strip per layer per frame is exactly the
kind of cost that shows up as jank on a phone.

Colour is the design doc's palette: 语料海 keeps the neutral dawn, 榜单擂台 goes
coral, 开源市集 green, 算力金库 gold, 合规边境 indigo.

Run: python tools/build_zones.py [--preview]
"""
import os
import sys
import numpy as np
from PIL import Image

try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    pass

SRC = 'docs/promo'
OUT = 'assets'
FRAME = (1280, 720)
LAYER_H = {'far': 322, 'mid': 246, 'ground': 240}

# Inherited from the previous asset pass and kept identical: these crops are what
# make the two scenery strips tile, and re-deriving them would mean re-checking
# the seam by eye on every render.
FAR_KEEP, MID_KEEP, GROUND_KEEP = 0.46, 0.46, 0.34
ZONE_FADE = {'far': 0.34, 'mid': 0.26}

# zone -> (layers dir, hue degrees, saturation x, tint rgb, tint alpha)
#   Hue is a nudge only; the zone's identity is carried by the tint, because a
#   large hue rotation turns a blue sky teal and every zone ends up looking like
#   the same wrong colour. The first entry is the master and stays ungraded: it
#   is also what assets/bg/ ships as, so the fallback backdrop and 语料海 are the
#   same picture by construction.
ZONES = [
    ('dawn',   'dawn',    0.0, 1.00, (255, 255, 255), 0.00),
    ('arena',  'arena',  -6.0, 1.08, (255, 152, 148), 0.15),
    ('market', 'market',  6.0, 1.04, (150, 255, 188), 0.13),
    ('vault',  'vault', -10.0, 1.05, (255, 214, 140), 0.16),
    ('wall',   'wall',   18.0, 0.99, (198, 190, 255), 0.16),
]

# Rows of a scenery strip that are fully transparent still carry RGB from the
# render (near-black for the ground slab, dark grey for the skyline). Left alone
# they bleed into the fade and read as a dirty band across the sky, so the
# transparent part is flooded with the zone's own haze colour before the strip is
# ever resized: a resize averages RGB, and averaging art against black is what
# produces the halo in the first place.
HAZE_ALPHA = 0.55


def seamless_h(im, blend):
    """Cross-fade the two ends so the strip tiles without a visible seam."""
    a = np.array(im).astype(np.float32)
    w = a.shape[1]
    if blend * 2 >= w:
        return im
    ramp = np.linspace(0.0, 1.0, blend).reshape(1, blend, 1)
    blended = a[:, :blend, :] * ramp + a[:, w - blend:w, :] * (1.0 - ramp)
    out = np.concatenate([blended, a[:, blend:w - blend, :]], axis=1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def alpha_ramp(im, fade):
    """Fade the top of a scenery strip to nothing so it melts into the sky."""
    a = np.array(im.convert('RGBA')).astype(np.float32)
    h = a.shape[0]
    ramp = np.ones(h, np.float32)
    cut = max(1, int(h * fade))
    ramp[:cut] = np.linspace(0.0, 1.0, cut) ** 1.4
    a[:, :, 3] *= ramp[:, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def ground_rim(im):
    """Put a lit lip on the walkable surface so the collision line is readable.

    Bright palette, so this is a white highlight over a soft blue shade rather
    than the neon cyan this project used to draw.
    """
    a = np.array(im.convert('RGBA')).astype(np.float32)
    a[:, :, 3] = 255.0
    h = a.shape[0]
    for y in range(h):
        if y < 2:
            a[y, :, :3] = (74, 132, 196)          # soft darker top, not black
        elif y < 6:
            a[y, :, :3] = (255, 255, 255)         # the lit lip itself
        else:
            t = (y - 6) / 30.0
            if t >= 1.0:
                break
            a[y, :, :3] = a[y, :, :3] * (1 - (1 - t) ** 2 * 0.34) + \
                np.array([150, 205, 245]) * ((1 - t) ** 2 * 0.34)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def flood_transparent(im, colour):
    """Push a fill colour into the transparent pixels, alpha untouched.

    A resize averages all four channels, so transparent-black next to opaque art
    drags every edge pixel toward black before the alpha ramp ever gets a chance
    to fade it out. Flooding first means the average is taken against something
    that belongs in the picture.
    """
    a = np.array(im.convert('RGBA')).astype(np.float32)
    low = (a[:, :, 3] / 255.0) < 1.0
    k = np.clip((1.0 - a[:, :, 3] / 255.0) / HAZE_ALPHA, 0.0, 1.0)[..., None]
    fill = np.array(colour, np.float32)
    a[:, :, :3] = np.where(low[..., None], a[:, :, :3] * (1 - k) + fill * k, a[:, :, :3])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def grade(im, hue_deg, sat, tint, tint_a):
    """Hue/saturation/tint grade. Applied to finished strips, never per frame.

    The alpha channel is carried through by hand: `convert('RGB')` would flatten
    it and a zone with any hue rotation at all would come back as an opaque
    rectangle with black where the sky should be.
    """
    rgb = im.convert('RGB')
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None

    if hue_deg or sat != 1.0:
        h, s, v = rgb.convert('HSV').split()
        if hue_deg:
            shift = int(round(hue_deg / 360.0 * 256))
            h = h.point(lambda p, sh=shift: (p + sh) % 256)
        if sat != 1.0:
            s = s.point(lambda p: min(255, int(p * sat)))
        rgb = Image.merge('HSV', (h, s, v)).convert('RGB')

    a = np.array(rgb).astype(np.float32)
    if tint_a > 0:
        a = a * (1 - tint_a) + np.array(tint, np.float32) * tint_a
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    return out if alpha is None else Image.merge('RGBA', out.split() + (alpha,))


def slice_picture(kind, src_path, zone_grade, haze):
    """One authored picture -> the game-ready strip for that layer kind."""
    hue_deg, sat, tint, tint_a = zone_grade
    im = Image.open(src_path).convert('RGBA')

    if kind == 'sky':
        w, h = im.size
        s = max(FRAME[0] / w, FRAME[1] / h)
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
        im = im.crop((0, im.size[1] - FRAME[1], FRAME[0], im.size[1]))
        return grade(im, hue_deg, sat, tint, tint_a)

    # Trim the fully transparent margins first: the generated slabs and skylines
    # sit in the middle of their canvas, and the crop fractions below are meant
    # to cut into art, not into padding.
    bb = im.getchannel('A').getbbox()
    if bb:
        im = im.crop(bb)

    keep = {'far': FAR_KEEP, 'mid': MID_KEEP, 'ground': GROUND_KEEP}[kind]
    im = im.crop((0, round(im.size[1] * (1 - keep)), im.size[0], im.size[1]))
    # The ground band is the floor: it has to be solid all the way down, so its
    # transparent parts are flooded with its own body colour. The scenery strips
    # fade into the sky, so they flood with the sky's haze instead.
    fill = (168, 186, 208) if kind == 'ground' else haze
    im = flood_transparent(im, fill)
    blend = im.size[0] // (7 if kind == 'ground' else 8)
    im = seamless_h(im, max(32, blend))
    sc = LAYER_H[kind] / im.size[1]
    im = im.resize((round(im.size[0] * sc), LAYER_H[kind]), Image.LANCZOS)
    im = grade(im, hue_deg, sat, tint, tint_a)

    if kind == 'ground':
        return ground_rim(im)
    return alpha_ramp(im, ZONE_FADE[kind])


def haze_for(sky):
    """The colour the scenery strips dissolve into: the sky's own lower band."""
    a = np.asarray(sky.convert('RGB')).astype(np.float32)
    return a[-a.shape[0] // 5:].reshape(-1, 3).mean(axis=0)


def write(im, path_no_ext, ext_list):
    for ext in ext_list:
        if ext == '.webp':
            im.save(path_no_ext + ext, quality=88, method=5)
        else:
            im.save(path_no_ext + ext)


def preview(zone, layers, out_dir):
    """Mock a game frame so the grade can be judged without launching a browser."""
    canvas = Image.new('RGBA', FRAME, (255, 255, 255, 255))
    canvas.alpha_composite(layers['sky'].convert('RGBA'), (0, 0))
    for name, base_y in (('far', 418), ('mid', 398)):
        strip = layers[name]
        x = 0
        while x < FRAME[0]:
            canvas.alpha_composite(strip, (x, base_y - strip.size[1]))
            x += strip.size[0]
    band = layers['ground']
    x = 0
    while x < FRAME[0]:
        canvas.alpha_composite(band, (x, 444))
        x += band.size[0]
    canvas.convert('RGB').save(os.path.join(out_dir, 'zone_' + zone + '.png'))


def main():
    do_preview = '--preview' in sys.argv
    out_dir = 'preview'
    if do_preview:
        os.makedirs(out_dir, exist_ok=True)

    skies = {}
    report = []
    for zone, folder, hue_deg, sat, tint, tint_a in ZONES:
        layers = {}
        for kind in ('sky', 'far', 'mid', 'ground'):
            src = os.path.join(SRC, 'gen_' + kind + '.png')
            im = slice_picture(kind, src, (hue_deg, sat, tint, tint_a))
            layers[kind] = im

            if zone == 'dawn':
                # the master also ships as the top-level fallback backdrop
                write(im, os.path.join(OUT, 'bg', kind), ['.png', '.webp'])
            write(im, os.path.join(OUT, 'bg', 'zones', folder, kind), ['.png', '.webp'])
            report.append((f'bg/zones/{folder}/{kind}', im.size))
        skies[zone] = layers['sky']
        if do_preview:
            preview(zone, layers, out_dir)

    print(f'{"layer":30s} size')
    for name, size in report:
        print(f'{name:30s} {size}')

    # A zone's sky drives the whole frame, so print the palette it landed on:
    # this is the number to check when a zone reads as "the same as the last one".
    print('\nsky palette per zone (mean of the top 25% and the bottom 25%):')
    for zone, sky in skies.items():
        a = np.asarray(sky.convert('RGB')).astype(np.float32)
        h = a.shape[0]
        top = a[:h // 4].reshape(-1, 3).mean(axis=0)
        bot = a[-h // 4:].reshape(-1, 3).mean(axis=0)
        print(f'  {zone:7s} top rgb({top[0]:3.0f},{top[1]:3.0f},{top[2]:3.0f})  '
              f'bottom rgb({bot[0]:3.0f},{bot[1]:3.0f},{bot[2]:3.0f})')

    if do_preview:
        print('\nwrote preview/zone_*.png mock frames')


if __name__ == '__main__':
    main()
