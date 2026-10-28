#!/usr/bin/env python3
"""Original staff-app icon drawn from simple geometry; no external image or font input."""
import json, math, struct, zlib
from pathlib import Path
root = Path(__file__).resolve().parent / 'Resources/Assets.xcassets'
icon = root / 'AppIcon.appiconset'; icon.mkdir(parents=True, exist_ok=True)
toes = [(302, 388, 64, 98, -0.45), (438, 290, 65, 96, -0.15), (587, 290, 65, 96, 0.15), (722, 388, 64, 98, 0.45)]
def ellipse(x,y,cx,cy,rx,ry,angle=0):
    dx,dy=x-cx,y-cy; c,s=math.cos(angle),math.sin(angle)
    return ((dx*c+dy*s)/rx)**2+((-dx*s+dy*c)/ry)**2 <= 1
def color(x,y):
    paw=ellipse(x,y,512,624,211,165) or any(ellipse(x,y,*toe) for toe in toes)
    cross=(abs(x-512)<27 and abs(y-628)<85) or (abs(x-512)<85 and abs(y-628)<27)
    return (250,253,253) if not paw or cross else (8,153,158)
pixels=bytearray()
for y in range(1024):
    pixels.append(0)
    for x in range(1024):
        values=[color(x+dx,y+dy) for dx,dy in [(0.25,0.25),(0.75,0.25),(0.25,0.75),(0.75,0.75)]]
        pixels.extend(sum(v[i] for v in values)//4 for i in range(3))
def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,1024,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels),9))+chunk(b'IEND',b'')
(icon/'StaffIcon.png').write_bytes(png)
(icon/'Contents.json').write_text(json.dumps({'images':[{'filename':'StaffIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2))
(root/'Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}},indent=2))
