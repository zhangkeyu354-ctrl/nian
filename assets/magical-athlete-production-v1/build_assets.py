"""Build an isolated art handoff; never changes the game or the source PDF.

Requires PyMuPDF, Pillow, fonttools, reportlab. Source images are extracted
from a rulebook, not AI approximations. SVG layouts and lettering are native.
"""
from pathlib import Path
import base64
import hashlib
import html
import io
import json
import math
import shutil
import xml.etree.ElementTree as ET
from collections import Counter

import fitz
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
SOURCE = REPO / 'reference/magical-athlete/How-to-play-MAGICAL-ATHLETE.pdf'
DOC = fitz.open(SOURCE)
fitz.TOOLS.mupdf_display_errors(False)
DATA = json.loads((ROOT / 'characters.json').read_text(encoding='utf-8'))
CHARS = DATA['characters']
FONT_PATH = Path('C:/Windows/Fonts/simhei.ttf')
FONT = TTFont(FONT_PATH)
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UNITS = FONT['head'].unitsPerEm
PALETTE = ['#5e9dca', '#e881b8', '#ffc126', '#51a045', '#ff4a21']
for d in ['cards/zh','cards/en','portraits','tokens','boards','icons','dice','backs','docs','previews']:
    (ROOT/d).mkdir(parents=True, exist_ok=True)


def dump(path, data):
    (ROOT/path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def uri(raw):
    return 'data:image/png;base64,' + base64.b64encode(raw).decode()


def svg(width, height, content, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{html.escape(title)}</title>{content}</svg>'


def img(raw, x, y, w, h, extra=''):
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" xlink:href="{uri(raw)}" {extra}/>'


def measure(text, size):
    return sum(GLYPHS[CMAP[ord(c)]].width for c in text) / UNITS * size


def lettering(text, x, y, size, fill='#111', center=False):
    """Outline glyphs: standalone SVGs require no installed Chinese fonts."""
    scale = size / UNITS
    if center:
        x -= measure(text, size)/2
    result=[]
    for char in text:
        glyph = GLYPHS[CMAP[ord(char)]]
        pen=SVGPathPen(GLYPHS)
        glyph.draw(pen)
        result.append(f'<path fill="{fill}" d="{pen.getCommands()}" transform="translate({x:.3f},{y}) scale({scale}, {-scale})"/>')
        x += glyph.width*scale
    return ''.join(result)


def lines(text, max_width, size):
    result=[]; line=''
    for char in text:
        if line and measure(line+char,size)>max_width and char not in '，。；：！？、）》」':
            result.append(line);line=''
        line += char
    if line:result.append(line)
    return result


def extract(xref):
    p=fitz.Pixmap(DOC,xref)
    mask=next((im[1] for pg in DOC for im in pg.get_images(full=True) if im[0]==xref),0)
    if p.colorspace and p.colorspace.n==4:p=fitz.Pixmap(fitz.csRGB,p)
    if mask:p=fitz.Pixmap(p,fitz.Pixmap(DOC,mask))
    return p.tobytes('png')


def webp(raw,path,width=None):
    im=Image.open(io.BytesIO(raw))
    if width and im.width>width:
        im.thumbnail((width,round(im.height*width/im.width)),Image.Resampling.LANCZOS)
    im.save(ROOT/path,'WEBP',quality=90,method=6)


def render_svg(source,path,width=900):
    d=fitz.open(stream=source.encode(),filetype='svg')
    scale=width/d[0].rect.width
    d[0].get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=True).save(str(ROOT/path))


def card_rect(c):
    # Each rulebook page contains three columns and three rows. Crop the visible
    # final PDF composite so obsolete text layers are never used as card text.
    x=[21.8,247.1,472.3][c['col']]
    y=[119.15,252.25,385.3][c['row']]
    return fitz.Rect(x-1.8,y-1.4,x+64.5,y+91.2)


for idx,c in enumerate(CHARS):
    cid=c['id'];pg=DOC[c['page']-1];r=card_rect(c)
    raw=pg.get_pixmap(matrix=fitz.Matrix(4,4),clip=r,alpha=False).tobytes('png')
    # Preserve final English reference card and use it as the exact illustration
    # layer beneath native Chinese type and a reconstructed rule panel.
    webp(raw,f'cards/en/{cid}.webp')
    cardim=Image.open(io.BytesIO(raw))
    # Just inside the original frame, above the old name, away from letters.
    bg=cardim.getpixel((int(cardim.width*.15),int(cardim.height*.08)))[:3]
    # These three old names reach the sample point; use the visible field colour.
    bg={'centaur':(215,216,205),'genius':(255,237,0),'mastermind':(215,216,205)}.get(cid,bg)
    color='#'+''.join(f'{v:02x}' for v in bg)
    w,h=720,1032
    body=img(raw,0,0,w,h)
    body+=f'<rect x="48" y="44" width="624" height="140" rx="7" fill="{color}"/>'
    size=min(49,560/max(measure(c['name_zh'],49),1)*49)
    body+=lettering(c['name_zh'],360,103,size,center=True)
    body+=lettering(c['name_en'],360,148,23,center=True)
    # Match original arched white rule area and multi-colour race stripes.
    body+='<rect x="42" y="653" width="636" height="345" rx="125" fill="#111"/>'
    for offset,color2 in [(0,'#ffbf20'),(7,'#e17bb5'),(14,'#61a6cd')]:
        body+=f'<rect x="{47+offset}" y="{658+offset}" width="{626-2*offset}" height="{335-2*offset}" rx="{120-offset}" fill="none" stroke="{color2}" stroke-width="5"/>'
    body+='<rect x="68" y="679" width="584" height="290" rx="98" fill="white"/>'
    ability_lines=lines(c['ability_zh'],520,33)
    assert len(ability_lines)<=6,(cid,ability_lines)
    top=807-(len(ability_lines)-1)*22
    for i,line in enumerate(ability_lines):body+=lettering(line,360,top+i*44,33,center=True)
    body+=f'<rect x="205" y="955" width="310" height="46" rx="22" fill="{PALETTE[idx%5]}" stroke="#111" stroke-width="3"/>'
    body+=lettering(c['skill_zh'],360,987,27,center=True)
    full=svg(w,h,body,c['name_zh']+' | '+c['ability_zh'])
    (ROOT/f'cards/zh/{cid}.svg').write_text(full,encoding='utf-8')
    cd=fitz.open(stream=full.encode(),filetype='svg')
    cardraw=cd[0].get_pixmap(matrix=fitz.Matrix(512/w,512/w),alpha=False).tobytes('png')
    webp(cardraw,f'cards/zh/{cid}.webp')
    # Export native original token alpha, not an approximate generated character.
    tokenraw=extract(c['token_xref'])
    (ROOT/f'tokens/{cid}.png').write_bytes(tokenraw)
    tim=Image.open(io.BytesIO(tokenraw));c['token_native_size']=list(tim.size)
    scale=min(210/tim.width,338/tim.height);tw,th=tim.width*scale,tim.height*scale
    token_svg=svg(256,384,img(tokenraw,(256-tw)/2,368-th,tw,th),c['name_zh']+'棋子')
    (ROOT/f'tokens/{cid}.svg').write_text(token_svg,encoding='utf-8')
    art_rect=fitz.Rect(r.x0+4,r.y0+15,r.x1-4,r.y0+58)
    portrait=pg.get_pixmap(matrix=fitz.Matrix(4,4),clip=art_rect,alpha=False).tobytes('png')
    webp(portrait,f'portraits/{cid}.webp')
    c['assets']={k:f'{folder}/{cid}.{ext}' for k,folder,ext in [('card_zh','cards/zh','svg'),('card_zh_mobile','cards/zh','webp'),('card_en','cards/en','webp'),('portrait','portraits','webp'),('token','tokens','svg'),('token_png','tokens','png')]}
    c['art_source']='CMYK rulebook visible card and token raster; not generated'
    c['art_resolution_note']='Cards contain native ~261px source raster artwork; Chinese lettering and frame are vectors. Token native size is recorded.'


# Exact board artwork. Mild Mile was split across two PDF pages with a 9px
# duplicated bleed; retaining the full first half and positioning the second
# at x=1859 aligns the duplicated artwork without distorting either half.
mild=svg(3190,975,img(extract(127),0,0,1868,975)+img(extract(317),1859,0,1331,975),'Mild Mile | 温和赛道 | 原版图')
wild=svg(1799,550,img(extract(136),0,0,1799,550),'Wild Wilds | 狂野赛道 | 原版图')
boards=[]
for bid,title,source,W,H in [('mild-mile','温和赛道',mild,3190,975),('wild-wilds','狂野赛道',wild,1799,550)]:
    (ROOT/f'boards/{bid}.svg').write_text(source,encoding='utf-8')
    render_svg(source,f'boards/{bid}.png',width=W)
    raw=(ROOT/f'boards/{bid}.png').read_bytes();webp(raw,f'boards/{bid}.webp')
    webp(raw,f'boards/{bid}-mobile.webp',width=1280)
    if bid=='mild-mile':
        starts=[691,894,1096,1299,1501,1703,1906,2108,2310,2513,2715,2918]
        top=[(x+96,177) for x in starts];top[-1]=(3010,177)
        pts=[(370,177)]+top+[(3010,384),(3010,587)]+[(x+96,800) for x in [2918,2715,2513,2310,2108,1906,1703,1501,1299,1096,894,691,489,287,85]]
        rectsize=(190,190);finish=(180,390)
    else:
        top=[(444+114*(n-1),98) for n in range(1,13)]
        pts=[(208,98)]+top+[(1700,216),(1700,334)]+[(1700-114*(n-15),451) for n in range(15,30)]
        rectsize=(108,108);finish=(104,246)
    assert len(pts)==30
    specials={1:('star',1),5:('trip',0),7:('move',3),11:('move',1),13:('star',1),16:('move',-3),18:('trip',0),23:('move',2),24:('move',-3),26:('trip',0)} if bid=='wild-wilds' else {}
    spaces=[]
    for i,(x,y) in enumerate(pts):
        fx,fy=rectsize
        sp={'type':specials[i][0],'value':specials[i][1]} if i in specials else None
        spaces.append(dict(index=i,x=round(x/W,6),y=round(y/H,6),width=round(fx/W,6),height=round(fy/H,6),kind='start' if i==0 else 'track',special=sp))
    board=dict(id='mild' if bid=='mild-mile' else 'wild',asset_key=bid,name_zh=title,source='CMYK rulebook p10-11, embedded xrefs 127/317 and 136',canvas=[W,H],space_count_including_start=30,track_indices=[1,29],start_index=0,finish_threshold=30,second_corner_index=13,spaces=spaces,finish_podium=dict(x=finish[0]/W,y=finish[1]/H),assets=dict(svg=f'boards/{bid}.svg',webp=f'boards/{bid}.webp',mobile=f'boards/{bid}-mobile.webp'))
    boards.append(board)
    # Numbered overlay is a separate QA asset; original artwork is untouched.
    overlay=''
    for s in spaces:
        x=s['x']*W;y=s['y']*H;rad=22 if W>2000 else 14
        overlay+=f'<circle cx="{x}" cy="{y}" r="{rad}" fill="white" stroke="#111" stroke-width="2"/>'
        overlay+=lettering(str(s['index']),x,y+rad*.38,rad*1.1,center=True)
    (ROOT/f'boards/{bid}-coordinates.svg').write_text(svg(W,H,overlay,'格位坐标检查层'),encoding='utf-8')
    render_svg(svg(W,H,source.split('</title>',1)[1].rsplit('</svg>',1)[0]+overlay,'棋盘坐标核对图'),f'previews/{bid}-coordinates.png',width=1600)

dump('boards/coordinates.json',{'edition':'2025 CMYK','convention':'0=Start, 1..29=track squares; crossing from 29 reaches finish threshold 30. Podium is not a playable square. Coordinates are visual centers, not engine logic.','boards':boards})


# Native SVG symbols: no generated numbers or baked UI text.
def save_icon(name,content,title):
    (ROOT/f'icons/{name}.svg').write_text(svg(256,256,content,title),encoding='utf-8')


starpts=' '.join(f'{128+(112 if n%2==0 else 49)*math.cos(-math.pi/2+n*math.pi/5):.2f},{128+(112 if n%2==0 else 49)*math.sin(-math.pi/2+n*math.pi/5):.2f}' for n in range(10))
for n in [1,3]:save_icon(f'point-{n}',f'<polygon points="{starpts}" fill="#df7943" stroke="#151515" stroke-width="6"/>'+lettering(str(n),128,156,85,center=True),f'{n}分筹码')
save_icon('trip','<path d="M25 192 67 112 137 76 205 112 231 193Z" fill="#aaa6a6" stroke="#111" stroke-width="7"/><path d="m73 42 70 18-15 83 49 23-7 37-93-20Z" fill="#ff4b21" stroke="#111" stroke-width="7"/><path d="m10 62 25 33m183-63-30 39" stroke="#111" stroke-width="9"/>','摔倒：跳过下次主移动')
for n in [1,2,3]:
    for direction in ['forward','backward']:
        fill='#008b42' if direction=='forward' else '#ec6950'
        arrow=f'<path d="M17 48H147V15L240 128 147 241V208H17Z" fill="{fill}" stroke="#111" stroke-width="7"/>'
        if direction=='backward':arrow=f'<g transform="translate(256,0) scale(-1,1)">{arrow}</g>'
        save_icon(f'{direction}-{n}',arrow+lettering(str(n),118 if direction=='forward' else 139,163,102,'#fff12a',True),f'{"前进" if direction=="forward" else "后退"}{n}格')
save_icon('gold-trophy','<path d="M58 40H198V100Q194 162 141 170V202H189V230H67V202H115V170Q62 162 58 100Z" fill="#d2ad36" stroke="#111" stroke-width="7"/><path d="M58 55H20V89Q20 133 75 136M198 55H236V89Q236 133 181 136" fill="none" stroke="#111" stroke-width="9"/>'+lettering('1',128,129,74,center=True),'冠军奖杯：分值由游戏数据提供')
save_icon('silver-rosette','<path d="M66 157 39 241 108 213 126 244 141 210 215 241 189 153" fill="#bfc4c8" stroke="#111" stroke-width="6"/><circle cx="128" cy="111" r="92" fill="#a8aeb6" stroke="#111" stroke-width="7"/><circle cx="128" cy="111" r="66" fill="#e3e5e6" stroke="#111" stroke-width="5"/>'+lettering('2',128,139,78,center=True),'亚军银章：分值由游戏数据提供')
save_icon('warp','<path d="M30 128C30 15 226 15 226 128S30 241 30 128M66 128C66 48 190 48 190 128S66 208 66 128M101 128C101 92 155 92 155 128S101 164 101 128" fill="none" stroke="#8d5caa" stroke-width="11"/>','传送')
save_icon('power','<path d="m147 13-98 134h69l-9 96 98-143h-70Z" fill="#ffbf20" stroke="#111" stroke-width="7"/>','能力触发')
save_icon('eliminated','<circle cx="128" cy="128" r="106" fill="#ff4a21" stroke="#111" stroke-width="7"/><path d="m74 74 108 108M182 74 74 182" stroke="white" stroke-width="20" stroke-linecap="round"/>','本场淘汰')
save_icon('finished','<path d="M45 238V22M49 30H225V151H49" fill="white" stroke="#111" stroke-width="8"/>'+''.join(f'<rect x="{49+c*35}" y="{30+r*30}" width="35" height="30" fill="#111"/>' for r in range(4) for c in range(5) if (r+c)%2==0),'已完赛')

pippos={1:[(128,128)],2:[(70,70),(186,186)],3:[(70,70),(128,128),(186,186)],4:[(70,70),(186,70),(70,186),(186,186)],5:[(70,70),(186,70),(128,128),(70,186),(186,186)],6:[(70,65),(186,65),(70,128),(186,128),(70,191),(186,191)]}
player_colors=['#e8443a','#2f7fd8','#f2b705','#8a4fd6','#1fa37a','#f07c1e']
for p,color in enumerate(player_colors,1):
    for n,points in pippos.items():
        content=f'<rect x="10" y="10" width="236" height="236" rx="43" fill="{color}" stroke="#111" stroke-width="8"/>'
        content+=''.join(f'<circle cx="{x}" cy="{y}" r="19" fill="#111"/>' for x,y in points)
        (ROOT/f'dice/player-{p}-{n}.svg').write_text(svg(256,256,content,f'玩家{p}，{n}点'),encoding='utf-8')

raw=extract(298);(ROOT/'backs/card-back-source.png').write_bytes(raw)
webp(raw,'backs/card-back.webp')
back='';cx,cy=360,516
for i in range(20):
    a=i*math.pi/10;b=(i+1)*math.pi/10
    back+=f'<path d="M{cx},{cy}L{cx+1300*math.cos(a)},{cy+1300*math.sin(a)}L{cx+1300*math.cos(b)},{cy+1300*math.sin(b)}Z" fill="{PALETTE[i%5]}"/>'
back+='<rect x="15" y="15" width="690" height="1002" rx="34" fill="none" stroke="#111" stroke-width="19"/>'
back+=lettering('魔法运动员',360,508,84,'white',True)+lettering('MAGICAL ATHLETE',360,560,37,'white',True)
(ROOT/'backs/card-back-zh.svg').write_text(svg(720,1032,back,'统一卡背'),encoding='utf-8')

# Exact original cover artwork from the rulebook, prepared for the lobby.
cover_rect=fitz.Rect(0,0,DOC[0].rect.width,390)
raw=DOC[0].get_pixmap(matrix=fitz.Matrix(2.5,2.5),clip=cover_rect,alpha=False).tobytes('png')
webp(raw,'previews/lobby-original.webp',width=1600)
(ROOT/'lobby').mkdir(exist_ok=True)
shutil.copy2(ROOT/'previews/lobby-original.webp',ROOT/'lobby/cover.webp')
(ROOT/'icons/title-original.png').write_bytes(extract(1981))
dump('characters.json',DATA)
dump('asset-contract.json',{'edition':'2025 CMYK base','base_url_after_copy':'/assets/magical-athlete/','copy_into':'apps/web/public/assets/magical-athlete/','asset_only':True,'engine_changed':False,'framework_alignment':DATA.get('framework_alignment'),'characters':[{k:c[k] for k in ['id','name_zh','name_en','assets','translation_status','token_native_size']} for c in CHARS],'boards':'boards/coordinates.json','track_ids':['mild','wild'],'lobby':'lobby/cover.webp','logo':'icons/title-original.png','cards':{'viewbox':[720,1032],'hidden':'backs/card-back-zh.svg','object_fit':'contain','preferred_list_format':'card_zh_mobile'},'tokens':{'viewbox':[256,384],'object_fit':'contain','anchor':'bottom center','tripped':'rotate existing piece face-down or use the uniform back; retain player indicator'},'player_colors':player_colors,'note':'All 36 IDs, Chinese names and power names match origin/magical-athlete at a11126d. SVGs embed source art and outline Chinese labels, with no remote fonts. Public serving and app changes are not performed here.'})


# Contact sheets use a document canvas and source SVG rendering, not imagegen.
def contact(kind,cols,cellw,cellh,filename):
    d=fitz.open();page=d.new_page(width=cols*cellw,height=math.ceil(36/cols)*cellh)
    for i,c in enumerate(CHARS):
        x=(i%cols)*cellw;y=(i//cols)*cellh
        if kind=='card':
            s=(ROOT/c['assets']['card_zh']).read_text(encoding='utf-8');sd=fitz.open(stream=s.encode(),filetype='svg')
            pd=fitz.open('pdf',sd.convert_to_pdf());page.show_pdf_page(fitz.Rect(x+6,y+4,x+cellw-6,y+cellh-30),pd,0)
        else:page.insert_image(fitz.Rect(x+12,y+4,x+cellw-12,y+cellh-28),filename=str(ROOT/c['assets']['token_png']))
        page.insert_text((x+8,y+cellh-10),c['id'],fontsize=9)
    page.get_pixmap(matrix=fitz.Matrix(1.7,1.7),alpha=False).save(str(ROOT/filename))


contact('card',6,180,280,'previews/all-36-cards.png')
contact('token',9,110,180,'previews/all-36-tokens.png')


# A Chinese companion book: two characters per page, original art plus rules.
pdfmetrics.registerFont(RLFont('CJK',str(FONT_PATH)))
book=canvas.Canvas(str(ROOT/'docs/魔法运动员_36角色技能书.pdf'),pagesize=(595.28,841.89))
book.setTitle('魔法运动员 | 36角色技能书 | 2025 CMYK')
book.setAuthor('Project art handoff; original art: Angela Kirkwood / CMYK')


def pdftext(text,x,y,size=12,color='#111111',maxw=None,leading=None):
    book.setFillColor(color);book.setFont('CJK',size)
    for line in lines(text,maxw or 510,size):
        book.drawString(x,y,line);y-=leading or size*1.6
    return y


def pdfhead(title,small='2025 CMYK / 中文草译 / 素材与技能参考'):
    book.setFillColorRGB(1,.98,.94);book.rect(0,0,596,842,fill=1,stroke=0)
    book.setFillColorRGB(1,.29,.13);book.rect(0,790,596,52,fill=1,stroke=0)
    pdftext(title,34,806,21)
    pdftext(small,34,767,9)


pdfhead('魔法运动员  /  角色与赛道')
book.drawImage(ImageReader(str(ROOT/'previews/lobby-original.webp')),34,365,width=527,height=337,preserveAspectRatio=True,anchor='c')
pdftext('36 名选手 · 两面原版棋盘 · 中文技能速查',34,310,22)
pdftext('插画采用原版规则书可见图像；中文卡名、技能名与说明为项目草译。',34,264,12)
pdftext('原版插画：Angela Kirkwood；出版：CMYK。美术包独立于游戏逻辑。',34,232,12)
pdftext('来源及核对边界见包内 README、characters.json 和 SOURCE_MANIFEST.json。',34,168,10)
book.showPage()

pdfhead('上场前先看  /  关键术语')
terms=[('主移动','自己回合掷骰并按点数移动的那次行动。其他来源的移动不自动成为主移动。'),('摔倒','走完当前移动后才倒下；跳过下一次主移动，能力仍可触发。'),('传送','直接重新放置，不作为移动，也不作为超越。'),('超越','一次移动开始时在对方身后，结束时在对方身前。'),('同格','只有双方已经停下才算同格；途中经过不算。'),('同时触发','先赛道格，后当前玩家，再顺时针结算其他玩家。'),('重掷','被替换的旧骰点视为未发生；只按最新结果触发骰点效果。'),('循环','真实无限循环完整结算一轮后终止；有限的多次连锁继续结算。')]
y=716
for title,text in terms:
    y=pdftext(title,34,y,17);y=pdftext(text,34,y-3,12,maxw=520)-19
book.showPage()

pdfhead('两面赛道  /  格位与效果')
y=713
for board in boards:
    pdftext(board['name_zh'],34,y,19)
    book.drawImage(ImageReader(str(ROOT/board['assets']['webp'])),30,y-205,width=535,height=181,preserveAspectRatio=True,anchor='c')
    y-=260
pdftext('编号约定：起点 0，普通格 1–29；从 29 再前进即越过终点（阈值 30）。',34,166,11)
pdftext('狂野：1、13 得 1 分；5、18、26 摔倒；7 +3，11 +1，16 -3，23 +2，24 -3。',34,139,11)
pdftext('第二弯角为第 13 格。图像与坐标分别提供，不能再叠加一套不同的赛道效果。',34,109,11)
book.showPage()

for start in range(0,36,2):
    pdfhead(f'角色技能  /  {start+1:02}–{start+2:02}')
    for j,c in enumerate(CHARS[start:start+2]):
        top=718-j*340
        book.drawImage(ImageReader(str(ROOT/c['assets']['card_en'])),35,top-266,width=181,height=260,preserveAspectRatio=True,anchor='c')
        pdftext(c['name_zh'],239,top-20,24)
        pdftext(c['name_en'],239,top-47,12)
        pdftext(c['skill_zh'],239,top-82,15,'#b32911')
        yy=pdftext(c['ability_zh'],239,top-113,13,maxw=317,leading=22)
        pdftext(c['note_zh'],239,yy-15,10,'#444444',maxw=317,leading=17)
        pdftext('核对：'+c['source_ref']+' / 中文草译',239,top-273,9,'#555555')
    book.showPage()

pdfhead('来源与交接  /  核对边界')
paras=[
 '原版底图：2025 CMYK How to Play Magical Athlete，供应商公开 PDF；角色卡以最终可见画面核对，不采用 PDF 内被遮挡的旧卡文。',
 '两面棋盘来自同一规则书。温和赛道两半有 9 像素重复出血区；拼接时按原尺寸重叠，避免把赛道中间的一格加宽。',
 '西西弗斯存在来源内部冲突：最终可见卡面说掷 6 时替代移动；同页旁注又说传送后仍有主移动。本包中文卡按可见卡面转述，具体规则由游戏负责人核定。',
 '中文名、技能名和说明都是 DRAFT，不能把社区译名视为官方中文或用户已批准译文。此书是参考资料，不是另一个规则引擎。',
 '原版图在 PDF 中的像素有限：卡图约 261 像素宽；棋子一般约 120×239。中文排字与外框是矢量，放大不会因文字位图化而模糊，但插画不是重新绘制的高清源。',
 '项目结构为 React/Vite 静态 public 资源。复制包内指定素材至 apps/web/public/assets/magical-athlete/ 后，按 asset-contract.json 的相对路径加载。先与另一 AI 的角色 ID 对齐。',
 '本次没有修改 main 的业务代码、联机协议或规则引擎，没有提交、推送或部署。原始参考 PDF 留在被 Git 忽略的 reference/ 目录。'
]
y=710
for text in paras:y=pdftext(text,34,y,12,maxw=520,leading=20)-24
pdftext('https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf',34,64,8)
book.save()


# Static file review catalog. It never creates rooms or runs game logic.
cards=''.join(f'<figure data-name="{html.escape(c["name_zh"]+" "+c["name_en"]+" "+c["id"])}"><img loading="lazy" src="{c["assets"]["card_zh"]}" alt="{c["name_zh"]}"><figcaption>{c["name_zh"]} <small>{c["name_en"]}</small></figcaption><details><summary>技能说明与棋子</summary><img class="token" loading="lazy" src="{c["assets"]["token"]}" alt="{c["name_zh"]}棋子"><p>{html.escape(c["note_zh"])}</p><a href="{c["assets"]["card_en"]}">英文原卡</a></details></figure>' for c in CHARS)
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>魔法运动员 · 美术资源验收</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f3e8;color:#181817;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}header{padding:40px 5vw 32px;background:#ff4a21;border-bottom:5px solid #111}h1{font-size:clamp(30px,5vw,60px);line-height:1.1;margin:10px 0}h1 small{display:block;font-size:16px;margin:15px 0;letter-spacing:3px}main{max-width:1450px;margin:auto;padding:26px}h2{margin-top:40px;font-size:28px}.board{display:block;width:100%;margin:15px 0;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px}figure{margin:0}figure>img{width:100%;display:block}figcaption{font-weight:700;padding:8px}small{display:block;font-size:12px;font-weight:400}details{font-size:12px;margin:0 8px 20px}.token{height:160px;max-width:100%;object-fit:contain;float:left}input{width:100%;padding:13px;border:2px solid #111;font:inherit;margin:14px 0 25px}a{color:#21467e}.icons{display:flex;flex-wrap:wrap;gap:22px}.icons img{width:72px;height:72px}footer{padding:35px;border-top:2px solid #111} @media(max-width:900px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:560px){main{padding:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}header{padding:25px 18px}h2{font-size:23px}}</style><header><h1><small>2025 CMYK / ART HANDOFF</small>魔法运动员</h1><p>36 张中文角色卡 · 36 枚透明棋子 · 两面原版棋盘 · 技能书</p><a href="docs/魔法运动员_36角色技能书.pdf">打开技能书 PDF</a> · <a href="asset-contract.json">接入清单</a> · <a href="README.md">说明与来源</a></header><main><h2>原版棋盘</h2><p>保留原版格子和插画；坐标与特殊格见 boards/coordinates.json。</p><img class="board" src="boards/mild-mile.svg" alt="温和赛道"><img class="board" src="boards/wild-wilds.svg" alt="狂野赛道"><h2>36 名选手</h2><p>中文为草译；插画来自原版规则书。点开每张卡下的说明可查看棋子和英文原卡。</p><input id="filter" placeholder="按中文名、英文名或素材 ID 搜索" aria-label="筛选角色"><div class="grid">'''+cards+'''</div><h2>通用标记</h2><div class="icons">'''+''.join(f'<img src="{p.relative_to(ROOT).as_posix()}" title="{p.stem}" alt="{p.stem}">' for p in sorted((ROOT/'icons').glob('*.svg')))+'''</div></main><footer>原版插画 Angela Kirkwood · CMYK / 本页仅用于本地美术验收。技能文字和规则问题见交接说明。</footer><script>document.querySelector('#filter').oninput=e=>{let q=e.target.value.toLowerCase();document.querySelectorAll('figure').forEach(f=>f.hidden=!f.dataset.name.toLowerCase().includes(q))}</script></html>'''
(ROOT/'index.html').write_text(page,encoding='utf-8')

# Render PDF proof pages for visual review.
proof=fitz.open(ROOT/'docs/魔法运动员_36角色技能书.pdf')
for i in [0,1,2,3,8,16,20,21]:
    if i<len(proof):proof[i].get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save(str(ROOT/f'previews/skillbook-page-{i+1:02}.png'))
dump('SOURCE_MANIFEST.json',{'source_pdf':{'url':DATA['source_url'],'local':str(SOURCE),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'pages':len(DOC),'role':'Publisher-authored rulebook, downloaded from vendor mirror. Visible final card composites were used.'},'artwork_credit':'Angela Kirkwood / CMYK. Original material reused for local private project; not claimed original generated artwork.','references_reviewed':[{'url':'https://www.cmyk.games/products/magical-athlete','role':'Publisher version and component confirmation'},{'url':'https://angelakirkwood.com/Magical-Athlete','role':'Original artist and visual reference'},{'url':'https://www.rulespal.com/magical-athlete/rulebook','role':'Auxiliary searchable text; not preferred over final visible PDF card'},{'url':'https://github.com/no2ooo/magical-athlete-gallery','role':'Rejected as visual authority: its pictured character artwork differs from CMYK retail.'},{'url':'https://github.com/cameronnayeri/magical-athlete','role':'Rejected as board authority: contains custom boards and rules from memory.'}],'source_conflicts':[{'id':'ART-RULE-01','character':'sisyphus','page':25,'status':'CHECK_REQUIRED','detail':'Visible card says instead of moving on a 6; adjacent note says main move remains after warping. Card art uses visible final card; engine decision deferred.'}],'mild_stitch':{'left_xref':127,'right_xref':317,'overlap_px':9,'result_size':[3190,975]},'wild_source':{'xref':136,'native_size':[1799,550]}})

print('Built',len(CHARS),'characters;',len(boards),'boards;',len(list((ROOT/'icons').glob('*.svg'))),'icons; 36 dice faces;',len(proof),'skillbook pages.')
