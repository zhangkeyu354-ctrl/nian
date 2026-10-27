import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import type { Page } from "playwright";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const lum = (rgb: number[]) => rgb.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((a, x, i) => a + x * [0.2126,0.7152,0.0722][i], 0);
/** Real rendered background with text hidden, and only the noise pseudo-element disabled. */
export async function measureContrast(page: Page, selector: string) {
  const noise = await page.addStyleTag({content: ".ss-world:before{content:none!important}.ss-world *{animation:none!important;transition:none!important}"});
  const texts = await page.evaluate((sel) => {
    const root=document.querySelector(sel); if(!root) return [];
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); const rows=[] as Array<{text:string,color:string,opacity:number,element:string,rect:{x:number,y:number,width:number,height:number}}>;
    while(walk.nextNode()) { const node=walk.currentNode, text=node.textContent?.trim() ?? '', el=node.parentElement; if(!el||!text||!/[\p{L}\p{N}]/u.test(text))continue; const closed=el.closest("details:not([open])"); if(closed && !el.closest("summary"))continue; const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)continue;
      let opacity=1; for(let a:HTMLElement|null=el;a;a=a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
      const range=document.createRange();range.selectNodeContents(node); for(const r of range.getClientRects()) { const own=el.getBoundingClientRect(); let x=Math.max(0,r.left,own.left),y=Math.max(0,r.top,own.top),right=Math.min(innerWidth,r.right,own.right),bottom=Math.min(innerHeight,r.bottom,own.bottom); for(let ancestor:HTMLElement|null=el;ancestor;ancestor=ancestor.parentElement){const cs=getComputedStyle(ancestor);if(/hidden|clip|auto|scroll/.test(cs.overflowX)||/hidden|clip|auto|scroll/.test(cs.overflowY)){const a=ancestor.getBoundingClientRect(); if(/hidden|clip|auto|scroll/.test(cs.overflowX)){x=Math.max(x,a.left);right=Math.min(right,a.right)} if(/hidden|clip|auto|scroll/.test(cs.overflowY)){y=Math.max(y,a.top);bottom=Math.min(bottom,a.bottom)} }} if(right<=x||bottom<=y||bottom-y<r.height*.75)continue;const top=document.elementFromPoint((x+right)/2,(y+bottom)/2);if(top && top!==el&&!el.contains(top)&&!top.contains(el))continue;rows.push({text:text.slice(0,60),color:style.color,opacity,element:`${el.tagName}.${el.className}`,rect:{x,y,width:right-x,height:bottom-y}}); }
    }
    for (const el of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("select,input:not([type=checkbox]):not([type=radio])")) {
      const text = el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.textContent?.trim() ?? "") : el.value;
      const st=getComputedStyle(el),r=el.getBoundingClientRect(); if(!text || st.display==='none' || st.visibility==='hidden' || r.width<=0 || r.height<=0 || r.right<=0 || r.bottom<=0 || r.left>=innerWidth || r.top>=innerHeight) continue;
      let opacity=1; for(let a:HTMLElement|null=el;a;a=a.parentElement) opacity*=Number(getComputedStyle(a).opacity);
      const x=Math.max(0,r.left+2),y=Math.max(0,r.top+2),right=Math.min(innerWidth,r.right-2),bottom=Math.min(innerHeight,r.bottom-2);if(right>x&&bottom>y)rows.push({text,color:st.color,opacity,element:`${el.tagName}.${el.className}`,rect:{x,y,width:right-x,height:bottom-y}});
    }
    return rows;
  },selector);
  const visible=PNG.sync.read(await page.screenshot({animations:'disabled'}));
  const hidden=await page.addStyleTag({content:'*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}.ss-world .ss-stamp{border-color:#c9ec9a!important}.ss-world .ss-caught .ss-stamp{border-color:#ff8995!important}'});
  const png=await page.screenshot({animations:'disabled'}); if(process.env.SS_CONTRAST_DEBUG) writeFileSync('tmp/ss-research/contrast-debug.png',png); const pixels=PNG.sync.read(png);
  await hidden.evaluate(el=>el.parentNode?.removeChild(el)); await noise.evaluate(el=>el.parentNode?.removeChild(el));
  const notMeasured: string[]=[];
  const rows=[] as Array<{text:string,ratio:number,background:string,foreground:string,element:string,rect:unknown}>;
  for(const item of texts) { const m=item.color.match(/[\d.]+/g); if(!m||m.length<3)continue; const fg=m.slice(0,3).map(Number), fl=lum(fg); let extreme=fl>.5?0:1, bg=[0,0,0],found=false; const r=item.rect;
    for(let y=Math.max(0,Math.floor(r.y));y<Math.min(pixels.height,Math.ceil(r.y+r.height));y++)for(let x=Math.max(0,Math.floor(r.x));x<Math.min(pixels.width,Math.ceil(r.x+r.width));x++){const k=(y*pixels.width+x)*4; const rgb=[pixels.data[k],pixels.data[k+1],pixels.data[k+2]],l=lum(rgb);const change=Math.abs(visible.data[k]-rgb[0])+Math.abs(visible.data[k+1]-rgb[1])+Math.abs(visible.data[k+2]-rgb[2]);if(change<45)continue;if(!found || (fl>.5 ? l>extreme : l<extreme)){extreme=l;bg=rgb;}found=true;}
    if(!found) notMeasured.push(JSON.stringify({text:item.text,element:item.element,rect:item.rect}));
    if(found){const alpha=item.opacity*(m.length>3?Number(m[3]):1);const effective=lum(fg.map((c,i)=>c*alpha+bg[i]*(1-alpha)));const ratio=(Math.max(effective,extreme)+.05)/(Math.min(effective,extreme)+.05);rows.push({text:item.text,ratio:Number(ratio.toFixed(2)),background:extreme.toFixed(4),foreground:item.color,element:item.element,rect:item.rect});}
  }
  return {tested:rows.length,passed:rows.filter(x=>x.ratio>=4.5).length,failures:rows.filter(x=>x.ratio<4.5),untested:notMeasured};
}
