"""Package the three transparent generated sprites without changing their artwork."""
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SPECS={
 'cargo':((108,72),dict(x=6,y=6,w=96,h=66)),
 'spring':((120,74),dict(x=18,y=10,w=84,h=64)),
 'buoy':((128,62),dict(x=6,y=6,w=116,h=54)),
}
def main():
    manifest_path=ROOT/'assets/manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    for name,(size,box) in SPECS.items():
        image=Image.open(ROOT/'raw/obstacle_special'/f'{name}.png').convert('RGBA')
        alpha=image.getchannel('A')
        bounds=alpha.point(lambda a:255 if a>24 else 0).getbbox()
        if not bounds or alpha.getextrema()[0]!=0:
            raise ValueError(f'{name}: expected transparent cutout')
        image=image.crop(bounds)
        scale=min((size[0]-4)/image.width,(size[1]-4)/image.height)
        drawn=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',size,(0,0,0,0))
        canvas.alpha_composite(drawn,((size[0]-drawn.width)//2,size[1]-2-drawn.height))
        canvas.save(ROOT/'assets/obstacle/new'/f'{name}.png',optimize=True)
        manifest['obstacle'][name]={'w':size[0],'h':size[1],'box':box}
        print(name,size,box)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
