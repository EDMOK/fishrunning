import os, sys
from PIL import Image, ImageDraw

RAW = 'assets/raw'
files = sorted(f for f in os.listdir(RAW) if f.lower().endswith('.png'))
CELL = 260
COLS = 6
ROWS = (len(files) + COLS - 1) // COLS
PAD = 26
W = COLS * CELL
H = ROWS * (CELL + PAD)
sheet = Image.new('RGB', (W, H), (235, 235, 240))
d = ImageDraw.Draw(sheet)

print(f'{"file":26s} {"size":12s} {"mode":5s} {"alpha%":>7s} {"bbox":>22s}  opaque?')
for i, f in enumerate(files):
    p = os.path.join(RAW, f)
    im = Image.open(p)
    alpha_pct = 0.0
    bbox = im.getbbox()
    if im.mode == 'RGBA':
        a = im.getchannel('A')
        h = a.histogram()
        alpha_pct = 100.0 * sum(h[:10]) / (im.size[0] * im.size[1])
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    bbox_t = alpha.getbbox() if alpha else None
    opaque = 'YES(needs key)' if alpha_pct < 5 else ''
    print(f'{f:26s} {str(im.size):12s} {im.mode:5s} {alpha_pct:6.1f}% {str(bbox_t):>22s}  {opaque}')
    th = im.copy()
    th.thumbnail((CELL - 16, CELL - 16), Image.LANCZOS)
    cx = (i % COLS) * CELL
    cy = (i // COLS) * (CELL + PAD)
    # checkerboard so transparency is visible
    for yy in range(0, CELL, 20):
        for xx in range(0, CELL, 20):
            c = (255, 255, 255) if ((xx // 20 + yy // 20) % 2 == 0) else (200, 205, 215)
            d.rectangle([cx + xx, cy + yy, cx + xx + 19, cy + yy + 19], fill=c)
    sheet.paste(th, (cx + (CELL - th.width) // 2, cy + (CELL - th.height) // 2), th if th.mode == 'RGBA' else None)
    d.rectangle([cx, cy, cx + CELL - 1, cy + CELL - 1], outline=(120, 120, 140))
    d.text((cx + 6, cy + CELL + 4), f, fill=(20, 20, 40))
sheet.save('preview/contact_sheet.png')
print('\nsaved preview/contact_sheet.png', sheet.size)
