import sys
from PIL import Image
pts={'車道(遠離火把)':(540,507),'高台':(910,250),'低層苔地':(810,362),'峭壁面':(745,236)}
print(f"{'變體':10}"+''.join(f"{k:>8}" for k in pts)+"  最小相鄰差")
for f in sys.argv[1:]:
    im=Image.open(f).convert('RGB'); row=[]
    for k,(x,y) in pts.items():
        px=[im.getpixel((x+i,y+j)) for i in range(-3,4) for j in range(-3,4)]
        row.append(sum(0.2126*r+0.7152*g+0.0722*b for r,g,b in px)/len(px))
    s=sorted(row); gap=min(b-a for a,b in zip(s,s[1:]))
    print(f"{f.split('/')[-1][:-4]:10}"+''.join(f"{v:8.1f}" for v in row)+f"  {gap:6.1f}")
