from pathlib import Path
import subprocess, json, hashlib
from PIL import Image, ImageDraw, ImageFont
P=Path('/workspace/shared/metropolis-brand-assets')
ORANGE='#FF7A33'; BG='#111317'; WHITE='#F7F4EF'; SECONDARY='#AAAEB7'; BORDER='#30343C'

def svg(w,h,body,bg=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>Kuru Order Desk — original prototype identity</title>'+ (f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else '')+body+'</svg>'

def mark(x=0,y=0,s=1,color=ORANGE):
    # Three separate order rails with chamfered corners and a detached outcome tile.
    return f'''<g transform="translate({x} {y}) scale({s})" fill="{color}">
      <path d="M256 248H704L768 312V368H256Z"/>
      <path d="M256 452H632V572H256Z"/>
      <path d="M256 656H632V776H320L256 712Z"/>
      <path d="M680 452H768V776H680Z"/>
    </g>'''

def text(x,y,t,size=24,color=WHITE,weight=400,spacing=None):
    sp=f' letter-spacing="{spacing}"' if spacing is not None else ''
    return f'<text x="{x}" y="{y}" fill="{color}" font-family="DejaVu Sans, sans-serif" font-size="{size}" font-weight="{weight}"{sp}>{t}</text>'

def line(x1,y1,x2,y2,color=BORDER,w=1):
    return f'<path d="M{x1} {y1}H{x2}" fill="none" stroke="{color}" stroke-width="{w}"/>' if y1==y2 else f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{w}"/>'

def write(name,content):
    (P/name).write_text(content)
    subprocess.run(['inkscape',str(P/name),'--export-type=png','--export-filename='+str(P/name.replace('.svg','.png'))],check=True,capture_output=True)

write('kuru-order-desk-mark.svg',svg(1024,1024,mark(-256,-256,1.5)))
# Portal-ready square with very generous quiet area and warm identity.
portal=mark(0,-85,1)+text(512,810,'KURU',78,WHITE,700,8).replace('x="512"','x="512" text-anchor="middle"')+text(512,880,'ORDER DESK',29,SECONDARY,400,6).replace('x="512"','x="512" text-anchor="middle"')
write('kuru-order-desk-portal.svg',svg(1024,1024,portal,BG))
# Horizontal transparent lockup. Text is rendered to PNG; SVG source retains editable text.
lock=mark(-68,-78,.36)+text(250,112,'Kuru',80,WHITE,700,-2)+text(254,176,'ORDER DESK',26,SECONDARY,400,5)
write('kuru-order-desk-lockup.svg',svg(760,220,lock))

# Calm editorial demo cover, no synthetic outcome quantities or fake dashboard.
cover=''
cover+=mark(59,19,.14)
cover+=text(194,102,'KURU ORDER DESK',24,WHITE,700,2)
cover+='<rect x="1300" y="59" width="524" height="58" rx="29" fill="#211A16" stroke="#835033"/>'
cover+=text(1562,96,'TESTNET PROTOTYPE',23,ORANGE,700,2).replace('x="1562"','x="1562" text-anchor="middle"')
cover+=line(96,154,1824,154)
cover+=text(96,236,'OFFLINE WALKTHROUGH',20,ORANGE,700,3)
cover+=text(90,352,'See the order.',104,WHITE,700,-5)
cover+=text(90,470,'Understand the outcome.',104,WHITE,700,-5)
cover+=text(98,539,'Review one order in human units. Keep signing inside MetaMask Agent Wallet.',30,SECONDARY)
# Three descriptive stages; these are explanatory steps, not asserted live events.
xs=[96,684,1272]; names=['Review the intent','Wallet request','Read the outcome']; labels=['Price · quantity · funding','Host-controlled authorization','Filled · open · cancelled']; notes=['One dedicated account','Human confirmation required','Uncertainty stays visible']
for i,x in enumerate(xs):
    cover+=f'<rect x="{x}" y="633" width="552" height="218" rx="18" fill="#181B20" stroke="{BORDER}"/>'
    cover+=text(x+28,680,f'0{i+1}',19,ORANGE,700,2)
    cover+=text(x+28,729,names[i],32,WHITE,700,-.5)
    cover+=text(x+28,777,labels[i],22,SECONDARY)
    cover+=text(x+28,812,notes[i],19,SECONDARY)
cover+=line(96,911,1824,911)
cover+=text(96,965,'Offline walkthrough · synthetic data · no live transactions',24,WHITE,400)
cover+=text(96,1007,'MetaMask Agent Wallet plugin prototype  /  MON–USDC  /  Monad testnet',19,SECONDARY)
cover+=text(1824,1007,'Kuru Order Desk',19,SECONDARY).replace('x="1824"','x="1824" text-anchor="end"')
write('kuru-order-desk-demo-cover.svg',svg(1920,1080,cover,BG))
# Exact small-size proof on light/dark contexts, for internal visual QA only.
proof=Image.new('RGB',(900,390),BG)
draw=ImageDraw.Draw(proof)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
markim=Image.open(P/'kuru-order-desk-mark.png')
for j,back in enumerate([BG,'#F7F4EF']):
    draw.rectangle((0,j*195,900,(j+1)*195),fill=back)
    for i,size in enumerate([32,48,64,96,128]):
        im=markim.resize((size,size),Image.Resampling.LANCZOS)
        x=30+i*176;y=j*195+15
        proof.paste(im,(x,y),im)
        draw.text((x,y+140),str(size)+' px',fill=SECONDARY if j==0 else '#494B52',font=font)
proof.save(P/'mark-small-size-proof.png')
# Verification manifest.
manifest={'project':'Kuru Order Desk','status':'Private original brand assets for testnet prototype','palette':{'charcoal':BG,'orange':ORANGE,'warm_white':WHITE,'secondary':SECONDARY,'border':BORDER},'font':'DejaVu Sans','originality':'Original geometric order-ledger mark created for this prototype. No official Kuru or MetaMask logo assets used. No affiliation or endorsement asserted.','disclosures':['TESTNET PROTOTYPE','Offline walkthrough','synthetic data','no live transactions'],'files':[]}
for n in ['kuru-order-desk-mark.png','kuru-order-desk-portal.png','kuru-order-desk-lockup.png','kuru-order-desk-demo-cover.png']:
    path=P/n;im=Image.open(path);sz=path.stat().st_size
    manifest['files'].append({'file':n,'width':im.width,'height':im.height,'pixels':im.width*im.height,'size_bytes':sz,'mode':im.mode,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    assert im.width*im.height <= 4_000_000 and sz <= 2_000_000
    if n!='kuru-order-desk-lockup.png': assert min(im.size)>=500
(P/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
