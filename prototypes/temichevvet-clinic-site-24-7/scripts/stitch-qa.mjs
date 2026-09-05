import sharp from '/Users/konstantin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
import fs from 'node:fs/promises';
for(const [name,input,mobile] of [['home-desktop-full','home-slices',false],['home-mobile-full','home-mobile-slices',true]]){
 const slices=JSON.parse(await fs.readFile(`output/playwright/${input}.json`,'utf8'));
 const {w,total}=slices[0];const tiles=[];
 for(let i=0;i<slices.length;i++){
  const s=slices[i];const top=Math.round(s.y);const height=Math.min(s.h-(mobile&&i<slices.length-1?60:0),total-top);
  tiles.push({input:await sharp(s.file).extract({left:0,top:0,width:w,height}).toBuffer(),left:0,top});
 }
 await sharp({create:{width:w,height:total,channels:3,background:'#fff'}}).composite(tiles).png().toFile(`output/playwright/${name}.png`);
}
