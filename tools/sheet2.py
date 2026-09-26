import os
from PIL import Image, ImageDraw
RAW='assets/raw'
files=['bg_sky.png','bg_far.png','bg_mid.png','ground_top.png',
       'obs_spike.png','obs_tower.png','item_chip.png','item_shield.png']
CELL=380; COLS=4; PAD=26
ROWS=(len(files)+COLS-1)//COLS
sheet=Image.new('RGBA',(COLS*CELL, ROWS*(CELL+PAD)),(235,235,240,255))
d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im=Image.open(os.path.join(RAW,f)).convert('RGBA')
    th=im.copy(); th.thumbnail((CELL-16,CELL-16),Image.LANCZOS)
    cx=(i%COLS)*CELL; cy=(i//COLS)*(CELL+PAD)
    for yy in range(0,CELL,20):
        for xx in range(0,CELL,20):
            c=(255,255,255,255) if ((xx//20+yy//20)%2==0) else (200,205,215,255)
            d.rectangle([cx+xx,cy+yy,cx+xx+19,cy+yy+19],fill=c)
    sheet.alpha_composite(th,(cx+(CELL-th.width)//2, cy+(CELL-th.height)//2))
    d.rectangle([cx,cy,cx+CELL-1,cy+CELL-1],outline=(120,120,140,255))
    d.text((cx+6,cy+CELL+4),f,fill=(20,20,40,255))
sheet.convert('RGB').save('preview/ai_theme_sheet.png')
print('ok')
