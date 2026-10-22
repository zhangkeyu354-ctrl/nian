import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertUiShot } from "./screenshot-check.ts";

const base = process.env.WT_MOCK_URL ?? "http://127.0.0.1:3410";
const out = "docs/witch-town/ui/round2";
mkdirSync(out, { recursive: true });
const scenes = ["lobby", "day-me", "day-12", "target", "trial", "black", "conspiracy", "night-witch", "night-town", "confession", "loot", "tituba", "dead", "result", "day-4"];
const sizes = [[390,844],[375,667],[844,390],[1440,900]];
const browser = await chromium.launch({ headless:true, executablePath:process.env.PW_CHROME });
const results:any[] = [], errors:string[] = [];
try {
  for (const [width,height] of sizes) {
    const context = await browser.newContext({ viewport:{width,height}, isMobile:width < 900, hasTouch:width < 900 });
    await context.addInitScript("window.__name = (fn) => fn;");
    const page = await context.newPage();
    page.on("pageerror",e => errors.push(e.message));
    for (const scene of (width < 700 ? scenes : ["day-me","night-town","result"])) for(const players of (width < 700 ? [4,8,12] : [8])) {
      await page.goto(`${base}/?game=wt&mock=${scene}&players=${players}`);
      await page.locator(".wt-world").waitFor();
      await page.waitForTimeout(120);
      const audit = await page.evaluate(() => {
        const root = document.querySelector(".wt-world")!;
        const dock = root.querySelector(".wt-dock")!.getBoundingClientRect();
        const seats = Array.from(root.querySelectorAll<HTMLElement>(".wt-seat")).filter(s=>s.clientWidth>0);
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
        const overlap=(a:DOMRect,b:DOMRect)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        for(const seat of seats) {
          const r=seat.getBoundingClientRect();
          if(r.left<8 || r.right>innerWidth-8) issues.push(`seat-edge:${seat.dataset.seat}`);
          const number=root.querySelector(`[data-seat-number="${seat.dataset.seat}"]`)!.getBoundingClientRect();
          const text=seat.querySelector(".wt-seat-text")!.getBoundingClientRect();
          for(const other of seats) for(const label of other.querySelectorAll(".wt-seat-name,.wt-seat-role")) {
            const range=document.createRange();range.selectNodeContents(label);
            if(overlap(number,range.getBoundingClientRect())) issues.push(`number-over-text:${seat.dataset.seat}/${label.textContent}`);
          }
          const top=document.elementFromPoint(number.x+number.width/2,number.y+number.height/2);
          // Number labels ignore pointer events, so visible text uses geometric checks above.

          const tag=seat.querySelector(".wt-me-tag")?.getBoundingClientRect();
          if(tag&&overlap(tag,text)) issues.push("self-over-text");
          if(!seat.querySelector(".wt-seat-public")) issues.push("missing-public-row");
        }
        const hand=root.querySelector(".wt-hand")?.getBoundingClientRect();
        const tray=root.querySelector(".wt-personal")?.getBoundingClientRect();
        if(hand&&tray) {
          if(hand.height<110) issues.push("hand-height-under110");
          for(const card of root.querySelectorAll(".wt-hand .wt-card")) {
            const r=card.getBoundingClientRect();
            if(r.left<tray.left+1||r.right>tray.right-1||r.bottom>tray.bottom-1) issues.push("hand-card-cropped");
          }
        }
        const center=root.querySelector(".wt-table-center")?.getBoundingClientRect();
        if(center) for(const seat of seats) if(overlap(center,seat.getBoundingClientRect())) issues.push(`seat-over-center:${seat.dataset.seat}`);
        if(root.querySelector(".wt-task")) issues.push("duplicate-task-row");
        for(const el of root.querySelectorAll<HTMLElement>("button,a,summary,select,input")) {
          const r=el.getBoundingClientRect();
          if(r.width>0&&r.height>0&&(r.width<43||r.height<43)) issues.push(`tap-under44:${el.className}:${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        if(document.documentElement.scrollHeight>innerHeight+1) issues.push("page-vertical-scroll");
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
        return {issues, minFont, disabled, seats:seats.length, task:root.querySelector(".wt-dock-hint")!.textContent};
      });
      const path = `${out}/${scene}-${players}p-${width}x${height}.png`;
      const pixels = await assertUiShot(page,path,".wt-world");
      results.push({ scene,players,width,height,path,...audit,pixels });
      console.log(`${audit.issues.length ? "CHECK" : "PASS"} ${scene} ${width}x${height} ${audit.issues.join(",")}`);
    }
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(`${out}/checks.json`,JSON.stringify({scope:"visual mock only; no real multiplayer acceptance",screenshots:results.length,errors,results},null,2)+"\n");
if(errors.length || results.some(x=>x.issues.length)) process.exitCode=1;
