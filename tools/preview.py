# -*- coding: utf-8 -*-
"""Render preview sheets so the sprite alignment and scene composition can be eyeballed."""
import json
import os
from PIL import Image, ImageDraw

A = 'assets'
VW, VH = 1280, 720
GROUND_Y = 596
os.makedirs('preview', exist_ok=True)


def img(cat, name):
    return Image.open(f'{A}/{cat}/{name}.png').convert('RGBA')


def draw_hero(canvas, frame, x, y, meta):
    """y = the notional foot line on screen."""
    im = img('hero', frame)
    m = meta['hero'][frame]
    px = round(x - im.size[0] * m['anchorX'])
    py = round(y - im.size[1] * m['ground'])
    canvas.alpha_composite(im, (px, py))


def checker(size, step=16):
    c = Image.new('RGBA', size, (255, 255, 255, 255))
    d = ImageDraw.Draw(c)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2:
                d.rectangle([x, y, x + step - 1, y + step - 1], fill=(205, 210, 220, 255))
    return c


def strip_run(meta):
    frames = ['run_a', 'run_b', 'run_c', 'run_b']
    cw = 340
    c = checker((cw * len(frames), 300))
    d = ImageDraw.Draw(c)
    gy = 268
    d.line([0, gy, c.size[0], gy], fill=(255, 60, 60))
    for i, f in enumerate(frames):
        draw_hero(c, f, cw * i + cw // 2, gy, meta)
        d.text((cw * i + 8, 6), f, fill=(0, 0, 0))
    c.save('preview/run_strip.png')
    print('preview/run_strip.png')


def strip_states(meta):
    frames = ['idle', 'slide', 'jump', 'apex', 'fall', 'hurt', 'cheer']
    cw = 320
    c = checker((cw * len(frames), 300))
    d = ImageDraw.Draw(c)
    gy = 268
    d.line([0, gy, c.size[0], gy], fill=(255, 60, 60))
    for i, f in enumerate(frames):
        draw_hero(c, f, cw * i + cw // 2, gy, meta)
        d.text((cw * i + 8, 6), f, fill=(0, 0, 0))
    c.save('preview/states_strip.png')
    print('preview/states_strip.png')


def mock_scene(meta):
    c = Image.new('RGBA', (VW, VH), (0, 0, 0, 255))
    sky = Image.open(f'{A}/bg/sky.png').convert('RGBA')
    c.alpha_composite(sky, (0, 0))
    for layer, scroll in (('far', 0), ('mid', 0)):
        im = img('bg', layer)
        c.alpha_composite(im, (scroll, GROUND_Y - im.size[1] + 40))
    g = img('bg', 'ground')
    gy = GROUND_Y - round(meta['bg']['ground']['surface'])
    x = 0
    while x < VW:
        c.alpha_composite(g, (x, gy))
        x += g.size[0]
    # hero mid-run
    draw_hero(c, 'run_a', 300, GROUND_Y, meta)
    # obstacles spaced along the ground
    obs = [('bug', 700), ('spike', 810), ('usb', 930), ('server', 1050), ('tower', 1200)]
    for name, ox in obs:
        im = img('obstacle', name)
        c.alpha_composite(im, (ox, GROUND_Y - im.size[1] + 4))
    # floating rice + items
    for name, ix, iy in (('rice', 540, 470), ('rice', 600, 470), ('rice', 660, 470),
                         ('bigrice', 800, 420), ('chip', 960, 380),
                         ('shield', 240, 420), ('magnet', 180, 300)):
        im = img('item', name)
        c.alpha_composite(im, (ix - im.size[0] // 2, iy - im.size[1] // 2))
    c.convert('RGB').save('preview/mock_scene.png')
    print('preview/mock_scene.png')


if __name__ == '__main__':
    meta = json.load(open(f'{A}/manifest.json', encoding='utf-8'))
    strip_run(meta)
    strip_states(meta)
    mock_scene(meta)
