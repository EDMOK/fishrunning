from pathlib import Path
from PIL import Image, ImageOps
import json, shutil
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('C:/Users/AMDNOW/.codex/generated_images/01a0f39c-4f45-7110-9535-41857a9d41f1')
FILES={'sky':'exec-48b866cc-527d-4a0f-b476-edcaff10afa5.png','road':'exec-cf159e0b-0eb0-4a32-8bcc-647e2a462a08.png','atlas':'exec-4d138efb-28bf-4ce4-806b-32eddeca9a9a.png','pelican':'exec-0be82ff1-bc04-448a-8e18-03f113eeed2e.png'}
RAW=ROOT/'raw/coast'; OUT=ROOT/'assets/coast'
RAW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
for name,file in FILES.items():
    if not (RAW/(name+'.png')).exists(): shutil.copy2(SOURCE/file,RAW/(name+'.png'))
sky=ImageOps.fit(Image.open(RAW/'sky.png'),(1280,720),method=Image.Resampling.LANCZOS)
sky.save(OUT/'sky.webp',quality=91);sky.save(OUT/'sky.png')
Image.open(RAW/'road.png').crop((0,260,2048,565)).resize((1024,153),Image.Resampling.LANCZOS).save(OUT/'road.png')
atlas=Image.open(RAW/'atlas.png')
cuts={'cone':((45,55,465,490),(70,86)),'barrier':((520,90,1040,480),(106,82)),'sweeper':((1045,45,1530,485),(90,88)),'gull':((25,550,620,990),(110,80)),'shell':((635,570,1010,950),(68,68)),'tide':((1100,550,1470,985),(72,80))}
meta={}
for name,(bounds,size) in cuts.items():
    im=atlas.crop(bounds);bbox=im.getchannel('A').point(lambda a:255 if a>90 else 0).getbbox()
    if bbox:im=im.crop(bbox)
    im.resize(size,Image.Resampling.LANCZOS).save(OUT/(name+'.png'))
    if name in ('cone','barrier','sweeper','gull'):
        w,h=size;meta[name]={'w':w,'h':h,'box':{'x':7,'y':7,'w':w-14,'h':h-9}}
pelican=Image.open(RAW/'pelican.png');bbox=pelican.getchannel('A').point(lambda a:255 if a>90 else 0).getbbox();pelican=pelican.crop(bbox);pelican.thumbnail((200,174),Image.Resampling.LANCZOS);pelican.save(OUT/'pelican.png')
manifest=json.loads((ROOT/'assets/manifest.json').read_text(encoding='utf8'))
manifest['coast']={'road':{'w':1024,'h':153,'surface':0},'pelican':{'w':pelican.width,'h':pelican.height}}
(ROOT/'assets/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Packaged coast sky, road, four hazards, two collectibles, cyclist')
