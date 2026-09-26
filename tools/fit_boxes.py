# -*- coding: utf-8 -*-
"""
Derive collision boxes from the actual art silhouettes.

The old scheme scaled one inset percentage across both axes, which is wrong for
tall thin sprites: 26% of a 178px tower is 46px of missing collision. Here each
axis is fitted independently against the sprite's own alpha mass, so a box hugs
its own art regardless of aspect ratio.

Two rules keep the fit honest:
  * thin protrusions (antennae, wisps of hair, a USB plug) are ignored, because a
    column/row only counts if it carries a real share of the sprite's mass;
  * a grounded obstacle's box always reaches the ground line, so you cannot be
    hit by the visible base of something without the box covering it.
"""
import numpy as np

MASS_FLOOR_X = 0.18      # a column must hold >=18% of the busiest column's mass
MASS_FLOOR_Y = 0.14      # ditto for rows
FRIENDLY_X = 3           # px shaved off each side, so near-misses feel like misses
FRIENDLY_TOP = 2


def alpha_mask(im):
    return (np.array(im.convert('RGBA'))[:, :, 3] > 128)


def mass_span(mass, floor):
    """First/last index whose mass clears `floor` x the peak."""
    if mass.max() <= 0:
        return 0, len(mass)
    hot = np.nonzero(mass >= mass.max() * floor)[0]
    if len(hot) == 0:
        return 0, len(mass)
    return int(hot[0]), int(hot[-1]) + 1


def fit_obstacle(im, grounded=True):
    """Box hugging the solid bulk of an obstacle sprite, in image pixels."""
    m = alpha_mask(im)
    h, w = m.shape
    colmass = m.sum(axis=0).astype(float)
    rowmass = m.sum(axis=1).astype(float)

    x0, x1 = mass_span(colmass, MASS_FLOOR_X)
    y0, y1 = mass_span(rowmass, MASS_FLOOR_Y)
    if grounded:
        y1 = h                                  # always reach the ground line
    else:
        y1 = min(h, y1)

    x0 = min(x0 + FRIENDLY_X, w)
    x1 = max(x1 - FRIENDLY_X, x0 + 1)
    y0 = min(y0 + FRIENDLY_TOP, y1 - 1)
    return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}


def foot_center_x(im, band=0.16):
    """
    Horizontal centre of the ground-contact band.

    For the heroine the headdress is the right anchor for *drawing* (it is what
    keeps the run cycle from jittering) but the wrong anchor for *collision*:
    the body hangs below and behind it. The feet are what actually touches the
    world, so the hitbox is centred on those.
    """
    m = alpha_mask(im)
    h, w = m.shape
    y0 = int(h * (1.0 - band))
    strip = m[y0:, :]
    cols = strip.sum(axis=0).astype(float)
    tot = cols.sum()
    if tot <= 0:
        return w / 2.0
    xs = np.arange(w)
    return float((cols * xs).sum() / tot)


def hero_body_span(im, window=140):
    """
    Left/right extent of the torso, ignoring the streaming hair.

    The torso is found by looking at the mid band and keeping only the contiguous
    run of heavy columns around the densest one; hair is lighter per-column than
    the torso, so a mass floor separates them.
    """
    m = alpha_mask(im)
    h, w = m.shape
    y0, y1 = int(h * 0.36), int(h * 0.88)
    colmass = m[y0:y1, :].sum(axis=0).astype(float)
    if colmass.max() <= 0:
        return 0, w, w / 2.0
    peak = int(colmass.argmax())
    lo = max(0, peak - window // 2)
    hi = min(w, peak + window // 2)
    seg = colmass[lo:hi]
    hot = np.nonzero(seg >= seg.max() * 0.5)[0]
    if len(hot) == 0:
        return 0, w, peak
    return lo + int(hot[0]), lo + int(hot[-1]) + 1, lo + (hot[0] + hot[-1]) / 2.0


def fit_hero_body(im):
    """
    One collision box for the heroine, in fractions of her drawn height.

    Measured from the art, then deliberately shrunk on width: a runner's hurtbox
    should sit inside the silhouette so that a near miss reads as a miss. The run
    cycle's skirts and ribbons still overlap obstacles visually, which looks
    generous rather than unfair.
    """
    m = alpha_mask(im)
    h, w = m.shape
    _l, _r, cx = hero_body_span(im)
    rowmass = m.sum(axis=1).astype(float)
    hot = np.nonzero(rowmass >= rowmass.max() * 0.12)[0]
    top = int(hot[0]) if len(hot) else 0
    return {
        'offX': (cx - w / 2.0) / h,          # box centre, relative to the sprite centre
        'wFrac': 0.279,                      # 58px of a 208px figure
        'topFrac': top / h,
        'boxHFrac': 0.827,                   # 172px of a 208px figure
    }
