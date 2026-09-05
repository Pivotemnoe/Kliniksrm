import sharp from '/Users/konstantin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
import fs from 'node:fs/promises';
const output='output/playwright';
const source='../../outputs/temichevvet-design-directions-2026-09-05/preview';
for(const [name,left,right,width,height] of [
 ['comparison-desktop',`${source}/c-hero.png`,`${output}/home-desktop.png`,1440,1024],
 ['comparison-mobile',`${source}/c-mobile-hero.png`,`${output}/home-mobile.png`,390,844],
]){
 await sharp({create:{width:width*2,height,channels:3,background:'#fff'}}).composite([{input:await sharp(left).resize(width,height).toBuffer(),left:0,top:0},{input:await sharp(right).resize(width,height).toBuffer(),left:width,top:0}]).png().toFile(`${output}/${name}.png`);
}
const files=['about','services','services-consultation','services-diagnostics','services-laboratory','services-surgery','services-inpatient','services-pharmacy','team','team-temichev','prices','reviews','contacts','visit','night','home'];
const tiles=[];
for(let i=0;i<files.length;i++)tiles.push({input:await sharp(`${output}/${files[i]}-desktop.png`).resize(480,342).toBuffer(),left:(i%4)*480,top:Math.floor(i/4)*342});
await sharp({create:{width:1920,height:1368,channels:3,background:'#fff'}}).composite(tiles).png().toFile(`${output}/pages-desktop-board.png`);
// Read-only evidence metadata, not an automated visual acceptance decision.
const dimensions={};for(const file of ['home-desktop.png','home-desktop-full.png','home-mobile.png','home-mobile-full.png']){const m=await sharp(`${output}/${file}`).metadata();dimensions[file]={width:m.width,height:m.height};}
await fs.writeFile(`${output}/screenshot-dimensions.json`,JSON.stringify(dimensions,null,2));
