import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";

const base = process.env.WT_MOCK_URL ?? "http://127.0.0.1:3410";
const out = "docs/witch-town/ui/round1";
mkdirSync(out, { recursive: true });
const scenes = ["lobby", "day-me", "day-12", "target", "trial", "black", "conspiracy", "night-witch", "night-town", "confession", "loot", "tituba", "dead", "result", "day-4"];
const sizes = [[390,844],[375,667],[844,390],[1440,900]];
const browser = await chromium.launch({ headless:true, executablePath:process.env.PW_CHROME });
const results:any[] = [], errors:string[] = [];
try {
  for (const [width,height] of sizes) {
    const context = await browser.newContext({ viewport:{width,height}, isMobile:width < 900, hasTouch:width < 900 });
    const page = await context.newPage();
    page.on("pageerror",e => errors.push(e.message));
    for (const scene of scenes) {
      await page.goto(`${base}/?game=wt&mock=${scene}`);
      await page.locator(".wt-world").waitFor();
      await page.waitForTimeout(120);
      const audit = await page.evaluate(() => {
        const root = document.querySelector(".wt-world")!;
        const dock = root.querySelector(".wt-dock")!.getBoundingClientRect();
        const seats = Array.from(root.querySelectorAll<HTMLElement>(".wt-seat"));
        const issues:string[] = [];
        if (document.documentElement.scrollWidth > innerWidth || root.scrollWidth > innerWidth) issues.push("horizontal-overflow");
        if (dock.bottom > innerHeight + 1 || dock.left < 0 || dock.right > innerWidth + 1) issues.push("dock-outside-viewport");
        for(const el of root.querySelectorAll<HTMLElement>(".wt-seat-name,.wt-seat-role")) if(el.scrollWidth > el.clientWidth + 1) issues.push(`seat-text-clipped:${el.textContent}`);
        for(const el of root.querySelectorAll<HTMLElement>(".wt-dock button")) {
          const r = el.getBoundingClientRect(), center = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          if(r.height < 43 || r.width < 43) issues.push(`dock-tap-too-small:${el.textContent}`);
          if(!el.contains(center)) issues.push(`dock-button-covered:${el.textContent}`);
          if(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) issues.push(`dock-button-overflow:${el.textContent}`);
        }
        for(let i=0;i<seats.length;i++) for(let j=i+1;j<seats.length;j++) {
          const a=seats[i].getBoundingClientRect(),b=seats[j].getBoundingClientRect();
          const x=Math.min(a.right,b.right)-Math.max(a.left,b.left),y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
          if(x>3 && y>3) issues.push(`seats-overlap:${i+1}/${j+1}:${Math.round(x)}x${Math.round(y)}`);
        }
        const minFont = Math.min(...Array.from(root.querySelectorAll<HTMLElement>("strong,small,p,button,span,b,label,input")).filter(e=>e.clientWidth>0&&e.textContent?.trim()).map(e=>parseFloat(getComputedStyle(e).fontSize)));
        if(minFont < 13) issues.push(`small-font:${minFont}`);
        const disabled = Array.from(root.querySelectorAll<HTMLButtonElement>("button:disabled")).map(e=>({text:e.textContent,opacity:getComputedStyle(e).opacity,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
        if(disabled.some(d=>d.opacity!=="1")) issues.push("disabled-opacity");
        const headingButton=root.querySelector(".wt-private-heading button")?.getBoundingClientRect();
        if(headingButton) for(const el of root.querySelectorAll(".wt-mini-tryals .wt-tryal")) {
          const r=el.getBoundingClientRect();
          if(Math.min(r.right,headingButton.right)-Math.max(r.left,headingButton.left)>2&&Math.min(r.bottom,headingButton.bottom)-Math.max(r.top,headingButton.top)>2) issues.push("private-cards-overlap-view-button");
        }
        for(const el of root.querySelectorAll<HTMLElement>(".wt-card strong")) if(el.getBoundingClientRect().height>parseFloat(getComputedStyle(el).lineHeight)*1.6) issues.push(`card-title-wrapped:${el.textContent}`);
        const panel=root.querySelector(".wt-event-panel")?.getBoundingClientRect();
        if(panel) for(const el of root.querySelectorAll<HTMLElement>(".wt-event-heading,.wt-loot-cards,.wt-black-display,.wt-personal>.wt-tryals,.wt-confession-row")) {
          const r=el.getBoundingClientRect();
          if(r.height>0 && (r.top<panel.top-1 || r.bottom>panel.bottom+1)) issues.push(`event-content-clipped:${el.className}`);
        }
        return {issues, minFont, disabled, seats:seats.length, task:root.querySelector(".wt-task strong")!.textContent};
      });
      const path = `${out}/${scene}-${width}x${height}.png`;
      const pixels = await assertUiShot(page,path,".wt-world");
      results.push({ scene,width,height,path,...audit,pixels });
      console.log(`${audit.issues.length ? "CHECK" : "PASS"} ${scene} ${width}x${height} ${audit.issues.join(",")}`);
    }
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(`${out}/checks.json`,JSON.stringify({scope:"visual mock only; no real multiplayer acceptance",screenshots:results.length,errors,results},null,2)+"\n");
if(errors.length || results.some(x=>x.issues.length)) process.exitCode=1;
