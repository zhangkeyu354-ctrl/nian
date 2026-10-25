from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path("docs/xiabaiwang/layout-fix")
font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",20)
board=Image.new("RGB",(800,1770),(18,27,39))
d=ImageDraw.Draw(board)
for row,phase in enumerate(["discussion","over"]):
 for col,version in enumerate(["before","after"]):
  src=root/version/f"6-{phase}-390x844.png"
  im=Image.open(src).convert("RGB");assert im.size==(390,844)
  x=col*400;y=row*885
  d.text((x+8,y+8),("修改前 main" if version=="before" else "修改后")+" · "+("6人讨论" if phase=="discussion" else "6人终局"),font=font,fill="#ffdf8d")
  board.paste(im,(x,y+36))
board.save(root/"before-after.png")
