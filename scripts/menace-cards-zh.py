import json,sys
from PIL import Image,ImageDraw,ImageFont,ImageFilter
Image.MAX_IMAGE_PIXELS=None
B='/tmp/claude-0/-home-claude/498c380b-1ab0-56a1-97c6-d0bc93511ded/scratchpad/z/originals/chinese/assets/'
O='apps/web/public/assets/menace/'
sh=[x[0] for x in json.load(open('/tmp/zh.json'))['sheets']]
im=Image.open(B+sh[3]).convert('RGB');w,h=im.width/10,im.height/7
BODY=sys.argv[1];TITLE='/tmp/f/SmileySans-Oblique.ttf'
A=[('advanced_repair','进阶维修',''),('airlock','气闸裂损',''),('backstab','背刺','每轮此卡牌首次被揭开时，\n任务领袖收到1张伤害卡。\n（此牌无法被复制）'),('basic_repair','基本维修',''),('brawl','群众斗殴','每轮此卡牌首次被揭开时，\n任务领袖选择1位玩家\n收到1张伤害卡。\n（此牌无法被复制）'),('command','上级指令','每位玩家从个人牌库\n抽1张牌。'),('explosion','反应炉爆炸',''),('panic','惊慌！','每位玩家随机面朝下\n弃掉1张手牌。'),('raise_morale','激励士气',''),('reactor','反应炉外泄','本轮出牌且目前未\n拥有伤害卡的玩家\n收到1张伤害卡。'),('replicate','效果复制','若下一张卡牌不是\n效果复制就复制它。\n（若此牌是最后一张，则\n复制下一轮的第一张）')]
W=Image.new('RGB',(1320,520))
for i,(n,t,b) in enumerate(A):
    c=im.crop((int(i%10*w),int(i//10*h),int((i%10+1)*w),int((i//10+1)*h)));m=int(c.width*.03);c=c.crop((m,m,c.width-m,c.height-m));c.thumbnail((840,1200));cw,ch=c.size
    d=ImageDraw.Draw(c)
    # 标题条
    bg=c.getpixel((int(cw*.82),int(ch*.05)))
    bx=(int(cw*.36),int(ch*.055),int(cw*.86),int(ch*.165));d.polygon([(bx[0]+20,bx[1]),(bx[2],bx[1]),(bx[2],bx[3]),(bx[0],bx[3])],fill=(58,62,52),outline=(10,10,10),width=4)
    f=ImageFont.truetype(TITLE,int(cw*.082));d.text((cw*.60,ch*.112),t,font=f,fill=(245,240,225),anchor='mm',stroke_width=2,stroke_fill=(20,20,20))
    if b:
        bx=(int(cw*.20),int(ch*(.70 if n in ("panic","command") else .635)),int(cw*.97),int(ch*.975));d.rounded_rectangle(bx,14,fill=(214,208,190),outline=(30,30,28),width=4)
        f=ImageFont.truetype(BODY,int(cw*.05));d.multiline_text((cw*.585,ch*(.8375 if n in ("panic","command") else .805)),b,font=f,fill=(28,28,26),anchor='mm',align='center',spacing=int(cw*.014))
    o=c.copy();o.thumbnail((420,600));o.save(O+n+'.webp',quality=86)
    t2=c.copy();t2.thumbnail((240,345))
    if i<5 or i>=0: W.paste(t2.crop((0,0,120,172)) if 0 else t2.resize((120,172)),(i*120,0))
    if i in(2,7):
        W.paste(t2,(0 if i==2 else 250,175))
W.save('/tmp/a.png')
