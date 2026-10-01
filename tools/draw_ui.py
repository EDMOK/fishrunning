# -*- coding: utf-8 -*-
"""
Draw the UI chrome that has no hand-painted master: buttons, badges, the title
ribbon and the overlay pattern.

Why drawn rather than painted: these are geometry (a triangle, a house, a ring),
and the house style is flat with a dark-blue outline and one highlight. That is
exactly what a few rounded primitives do consistently — and consistently is the
hard part when they have to sit next to hand-painted art and still look like one
set. Everything is drawn at 4x and downsampled, which is what gives the icons
their clean cartoon edge.

Palette is the design doc's: AI blue for interaction, compute gold for rewards,
cream/white for plates, coral for danger. Outlines are a deep desaturated blue,
never black -- pure black outlines are what made the previous set read as "neon
cyberpunk" instead of "picture book".

Run: python tools/draw_ui.py
"""
import math
import os
import sys
from PIL import Image, ImageDraw

try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    pass

OUT = 'assets/ui'
S = 4                       # supersample factor

BLUE = (74, 158, 232)
BLUE_D = (40, 104, 176)
BLUE_L = (150, 210, 250)
INK = (28, 74, 130)         # outline / text-on-light
CREAM = (255, 253, 248)
CREAM_D = (232, 238, 246)
GOLD = (255, 199, 60)
GOLD_D = (232, 158, 24)
CORAL = (255, 122, 107)
WHITE = (255, 255, 255)


def canvas(w, h):
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def done(im, w, h, name):
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'))
    return (name, (w, h))


def rr(d, box, r, fill=None, outline=None, width=0):
    d.rounded_rectangle([c * S for c in box], radius=r * S, fill=fill,
                        outline=outline, width=int(width * S))


def ell(d, box, fill=None, outline=None, width=0):
    d.ellipse([c * S for c in box], fill=fill, outline=outline,
              width=int(width * S))


def poly(d, pts, fill=None, outline=None, width=0, close=True):
    p = [(x * S, y * S) for x, y in pts]
    d.polygon(p, fill=fill)
    if outline and width:
        d.line(p + [p[0]] if close else p, fill=outline, width=int(width * S),
               joint='curve')


def star(d, cx, cy, R, r, fill, outline=None, width=0):
    pts = []
    for i in range(16):
        ang = -math.pi / 2 + i * math.pi / 8
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    poly(d, pts, fill=fill, outline=outline, width=width)


# ---------------------------------------------------------------- buttons ----

def icon_play(w=96, h=96):
    im, d = canvas(w, h)
    ell(d, (3, 3, w - 3, h - 3), fill=BLUE_L + (150,), outline=INK, width=3)
    ell(d, (8, 8, w - 8, h - 8), fill=BLUE + (0,), outline=WHITE + (170,), width=2)
    poly(d, [(w * 0.40, h * 0.28), (w * 0.40, h * 0.72), (w * 0.74, h * 0.50)],
         fill=WHITE, outline=INK, width=2.5)
    return done(im, w, h, 'icon_play')


def icon_home(w=96, h=96):
    im, d = canvas(w, h)
    poly(d, [(w * 0.50, h * 0.16), (w * 0.90, h * 0.50), (w * 0.10, h * 0.50)],
         fill=BLUE, outline=INK, width=3)
    rr(d, (w * 0.22, h * 0.46, w * 0.78, h * 0.86), 6, fill=CREAM, outline=INK, width=3)
    rr(d, (w * 0.42, h * 0.60, w * 0.58, h * 0.86), 4, fill=BLUE_L, outline=INK, width=2)
    return done(im, w, h, 'icon_home')


def icon_restart(w=96, h=96):
    im, d = canvas(w, h)
    box = (w * 0.16, h * 0.16, w * 0.84, h * 0.84)
    d.arc([c * S for c in box], start=205, end=140, fill=INK, width=int(3.4 * S))
    d.arc([c * S for c in box], start=205, end=140, fill=BLUE, width=int(2.2 * S))
    # arrow head on the open end (upper-left, where 205 degrees lands)
    poly(d, [(w * 0.16, h * 0.30), (w * 0.36, h * 0.18), (w * 0.34, h * 0.46)],
         fill=BLUE, outline=INK, width=2.5)
    return done(im, w, h, 'icon_restart')


def icon_shop(w=96, h=96):
    im, d = canvas(w, h)
    d.arc([c * S for c in (w * 0.34, h * 0.14, w * 0.66, h * 0.46)],
          start=180, end=360, fill=INK, width=int(3.4 * S))
    rr(d, (w * 0.16, h * 0.34, w * 0.84, h * 0.88), 10, fill=GOLD, outline=INK, width=3)
    rr(d, (w * 0.16, h * 0.34, w * 0.84, h * 0.46), 10, fill=GOLD_D + (0,), outline=None)
    ell(d, (w * 0.34, h * 0.52, w * 0.42, h * 0.60), fill=INK)
    ell(d, (w * 0.58, h * 0.52, w * 0.66, h * 0.60), fill=INK)
    return done(im, w, h, 'icon_shop')


def _speaker(d, w, h, muted):
    poly(d, [(w * 0.14, h * 0.38), (w * 0.34, h * 0.38), (w * 0.52, h * 0.20),
             (w * 0.52, h * 0.80), (w * 0.34, h * 0.62), (w * 0.14, h * 0.62)],
         fill=BLUE, outline=INK, width=3)
    if muted:
        d.line([(w * 0.62 * S, h * 0.40 * S), (w * 0.84 * S, h * 0.62 * S)],
               fill=CORAL, width=int(4 * S))
        d.line([(w * 0.84 * S, h * 0.40 * S), (w * 0.62 * S, h * 0.62 * S)],
               fill=CORAL, width=int(4 * S))
    else:
        for k, rad in ((0, 0.20), (1, 0.31)):
            box = (w * (0.46 - rad * 0.0), h * (0.5 - rad), w * (0.46 + rad * 2),
                   h * (0.5 + rad))
            d.arc([c * S for c in box], start=-58, end=58, fill=BLUE_D, width=int(3 * S))


def icon_sound(w=96, h=96):
    im, d = canvas(w, h)
    _speaker(d, w, h, False)
    return done(im, w, h, 'icon_sound')


def icon_mute(w=96, h=96):
    im, d = canvas(w, h)
    _speaker(d, w, h, True)
    return done(im, w, h, 'icon_mute')


# ----------------------------------------------------------------- badges ----

def badge_score(w=64, h=64):
    """Score badge: a compute spark. Gold, like everything that scores."""
    im, d = canvas(w, h)
    star(d, w * 0.5, h * 0.48, w * 0.44, w * 0.17, GOLD, INK, 2.6)
    ell(d, (w * 0.40, h * 0.36, w * 0.56, h * 0.50), fill=WHITE + (215,))
    return done(im, w, h, 'badge_score')


def badge_trophy(w=96, h=96):
    im, d = canvas(w, h)
    d.arc([c * S for c in (w * 0.06, h * 0.20, w * 0.34, h * 0.52)],
          start=90, end=270, fill=INK, width=int(3 * S))
    d.arc([c * S for c in (w * 0.66, h * 0.20, w * 0.94, h * 0.52)],
          start=270, end=90, fill=INK, width=int(3 * S))
    rr(d, (w * 0.24, h * 0.16, w * 0.76, h * 0.56), 14, fill=GOLD, outline=INK, width=3)
    rr(d, (w * 0.42, h * 0.54, w * 0.58, h * 0.72), 3, fill=GOLD_D, outline=INK, width=2.5)
    rr(d, (w * 0.26, h * 0.70, w * 0.74, h * 0.86), 7, fill=BLUE, outline=INK, width=3)
    ell(d, (w * 0.34, h * 0.24, w * 0.46, h * 0.38), fill=WHITE + (190,))
    return done(im, w, h, 'badge_trophy')


# ---------------------------------------------------------------- marquee ----

def marquee(w=1200, h=360):
    """Title ribbon. The <h1> is HTML text drawn on top, so the centre stays clear.

    Four stacked plates: offset shadow, blue edge, white band, pale inner field.
    Each inset is drawn a little smaller than the last, which is what gives the
    flat band its layered picture-book edge without any gradient work.
    """
    im, d = canvas(w, h)

    def band(inset, fill):
        d.rounded_rectangle(
            [c * S for c in (inset, h * 0.24 + inset * 0.34,
                             w - inset, h * 0.76 - inset * 0.34)],
            radius=(h * 0.10) * S, fill=fill)

    band(0, (36, 82, 140, 70))
    band(7, INK)
    band(19, BLUE)
    band(30, WHITE)
    band(44, (214, 236, 252, 255))

    # gold studs at both ends, plus a pale sweep through the middle so the plate
    # is not dead flat behind the title text
    star(d, w * 0.052, h * 0.5, h * 0.115, h * 0.048, GOLD, INK, 2.4)
    star(d, w * 0.948, h * 0.5, h * 0.115, h * 0.048, GOLD, INK, 2.4)
    rr(d, (w * 0.30, h * 0.34, w * 0.70, h * 0.40), h * 0.03, fill=BLUE_L + (170,))
    rr(d, (w * 0.30, h * 0.60, w * 0.70, h * 0.66), h * 0.03, fill=BLUE_L + (170,))
    return done(im, w, h, 'marquee')


# ---------------------------------------------------------------- pattern ----

def pattern_ai(w=512, h=512):
    """Tileable overlay texture: model nodes and links, drawn faint.

    Tiles by construction: every element is stamped at its position and at the
    +/-width/height copies that wrap around the edge.
    """
    im, d = canvas(w, h)
    nodes = [(84, 96), (250, 60), (410, 150), (150, 250), (330, 300),
             (60, 380), (240, 440), (430, 420)]
    links = [(0, 1), (1, 2), (0, 3), (3, 4), (2, 4), (3, 5), (5, 6), (6, 7),
             (4, 7), (1, 4)]
    col = (74, 158, 232, 74)
    for a, b in links:
        ax, ay = nodes[a]
        bx, by = nodes[b]
        for dx in (-w, 0, w):
            for dy in (-h, 0, h):
                d.line([((ax + dx) * S, (ay + dy) * S), ((bx + dx) * S, (by + dy) * S)],
                       fill=col, width=int(1.6 * S))
    for nx, ny in nodes:
        for dx in (-w, 0, w):
            for dy in (-h, 0, h):
                r = 11
                ell(d, (nx + dx - r, ny + dy - r, nx + dx + r, ny + dy + r),
                    fill=(74, 158, 232, 92), outline=(255, 255, 255, 120), width=1.6)
                ell(d, (nx + dx - r * 0.4, ny + dy - r * 0.4,
                        nx + dx + r * 0.4, ny + dy + r * 0.4),
                    fill=(255, 255, 255, 150))
    return done(im, w, h, 'pattern_ai')


def main():
    os.makedirs(OUT, exist_ok=True)
    report = [
        icon_play(), icon_home(), icon_restart(), icon_shop(),
        icon_sound(), icon_mute(),
        badge_score(), badge_trophy(),
        marquee(), pattern_ai(),
    ]
    print(f'{"icon":18s} size')
    for name, size in report:
        print(f'{name:18s} {size}')
    print('\nwrote %d UI pieces' % len(report))


if __name__ == '__main__':
    main()
