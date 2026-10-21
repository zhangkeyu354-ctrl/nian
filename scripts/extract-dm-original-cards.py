from PIL import Image,ImageOps,ImageDraw
from pathlib import Path
import json,hashlib
src=Path('C:/Users/Lenovo/Pictures/Screenshots')
out=Path('apps/web/public/assets/dying-message-original');out.mkdir(exist_ok=True,parents=True)
# Coordinates are measured on 720x960 previews, then mapped to the original 1440x1920 photographs.
entries=[
 ('civilian','21_16_29',[(144,229),(275,215),(295,393),(154,405)]),
 ('private-detective','21_16_29',[(155,428),(295,413),(319,607),(168,626)]),
 ('muay-thai','21_16_29',[(170,654),(323,634),(349,862),(185,884)]),
 ('forensic-scientist','21_16_39',[(151,46),(312,46),(301,274),(134,267)]),
 ('soulmate','21_16_39',[(130,304),(300,310),(292,546),(118,541)]),
 ('hostage','21_16_39',[(111,659),(284,664),(274,903),(99,901)]),
 ('celebrity','21_16_47',[(132,200),(254,227),(236,393),(108,373)]),
 ('noble','21_16_47',[(99,438),(225,454),(200,630),(72,619)]),
 ('janitor','21_16_47',[(62,687),(190,701),(150,904),(30,883)]),
 ('professional-killer','21_16_52',[(109,50),(270,46),(265,266),(101,270)]),
 ('mastermind','21_16_52',[(103,350),(269,349),(263,592),(96,590)]),
 ('accomplice','21_16_52',[(95,677),(261,682),(260,923),(94,914)]),
 ('wonder-dog','21_16_57',[(222,104),(362,111),(347,294),(201,282)]),
 ('killer','21_16_57',[(187,393),(336,406),(319,619),(160,605)]),
 ('serial-killer','21_16_57',[(152,647),(312,657),(299,897),(125,884)]),
 ('card-back','21_16_47',[(495,556),(638,559),(675,830),(483,830)]),
]
manifest=[]
for key,n,pts in entries:
 source=src/('ChatGPT 图像 2026年10月20日 '+n+'.jpg');im=Image.open(source).convert('RGB');p=[(x*im.width/720,y*im.height/960) for x,y in pts];q=p[0]+p[3]+p[2]+p[1]
 card=im.transform((420,600),Image.Transform.QUAD,q,Image.Resampling.BICUBIC)
 card.save(out/(key+'.webp'),quality=94,method=6)
 card.save(Path('reference/dying-message/cards')/(key+'.png'))
 manifest.append({'id':key,'sourceFile':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cornersPreview720':pts,'imagePath':'/assets/dying-message-original/'+key+'.webp','processing':'Photograph quadrilateral rectification only. No generative redraw, no face replacement, no invented details.','width':420,'height':600})
photo=Image.open(src/'ChatGPT 图像 2026年10月20日 21_16_12.jpg').convert('RGB');wood=photo.crop((300,1835,1000,1910));wood.save(out/'table-wood.webp',quality=92)
Path('reference/dying-message/original-assets-manifest.json').write_text(json.dumps({'assets':manifest,'tableTexture':'Crop of actual wooden tabletop in user-supplied rules photograph.'},ensure_ascii=False,indent=2),encoding='utf8')
sheet=Image.new('RGB',(8*160,2*250),'#252131');d=ImageDraw.Draw(sheet)
for i,a in enumerate(manifest):
 im=Image.open(out/(a['id']+'.webp'));im.thumbnail((150,215));x=i%8*160;y=i//8*250;sheet.paste(im,(x,y+25));d.text((x+2,y+3),a['id'],fill='white')
sheet.save('reference/dying-message/original-cards-review.png');print('15 roles + original pink card back rectified; original wooden-table texture cropped')
