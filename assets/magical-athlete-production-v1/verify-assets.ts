import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertUiShot } from '../../scripts/screenshot-check.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const contract = JSON.parse(await readFile(root + 'asset-contract.json', 'utf8'));
assert.equal(contract.characters.length, 36);
assert.equal(new Set(contract.characters.map((c: any) => c.id)).size, 36);
for (const c of contract.characters) {
  for (const path of Object.values(c.assets)) await access(root + path);
}
const coords = JSON.parse(await readFile(root + 'boards/coordinates.json', 'utf8'));
for (const b of coords.boards) {
  assert.equal(b.spaces.length, 30);
  assert.deepEqual(b.spaces.map((s: any) => s.index), Array.from({length:30}, (_,i) => i));
  assert.equal(b.finish_threshold, 30);
  assert.equal(b.second_corner_index, 13);
  for (const s of b.spaces) assert(s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1);
}
const browser = await chromium.launch({ headless: true });
const report: any = { asset_paths: 'passed', unique_characters: 36, boards: 2, viewports: [] };
try {
  for (const [label,width,height] of [['desktop',1440,1000],['phone',390,844]] as const) {
    const page = await browser.newPage({ viewport:{width,height}, deviceScaleFactor:1 });
    const errors: string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    const failed: string[]=[];
    page.on('requestfailed',r=>failed.push(r.url()));
    await page.goto('http://127.0.0.1:8766/', {waitUntil:'networkidle'});
    await page.locator('img').evaluateAll(imgs=>imgs.forEach(i=>(i as HTMLImageElement).loading='eager'));
    const decoded = await page.locator('img').evaluateAll(async imgs=>Promise.all(imgs.map(async img=>{
      const i=img as HTMLImageElement;
      try {
        // Closed <details> can cancel lazy DOM decodes. Decode a separate
        // image as well, so hidden token assets are checked deterministically.
        const check = new Image(); check.src=i.src;
        await check.decode(); return {src:i.getAttribute('src'),ok:check.naturalWidth>0};
      }
      catch {return {src:i.getAttribute('src'),ok:false};}
    })));
    assert(decoded.every(i=>i.ok),JSON.stringify(decoded.filter(i=>!i.ok)));
    assert.equal(await page.locator('figure').count(),36);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
    const topShot=await assertUiShot(page,root+`previews/browser-${label}-boards.png`);
    await page.locator('h2').nth(1).scrollIntoViewIfNeeded();
    await page.locator('.grid').scrollIntoViewIfNeeded();
    const cardShot=await assertUiShot(page,root+`previews/browser-${label}-cards.png`);
    await page.getByRole('textbox',{name:'筛选角色'}).fill('香蕉');
    assert.equal(await page.locator('figure:visible').count(),1);
    await page.locator('figure:visible summary').click();
    assert.equal(await page.locator('figure:visible .token').isVisible(),true);
    assert.equal(errors.length,0,errors.join('\n'));
    assert.equal(failed.length,0,failed.join('\n'));
    report.viewports.push({label,width,height,decoded_images:decoded.length,filter_and_token:'passed',horizontal_overflow:false,errors,failed,topShot,cardShot});
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(root+'VALIDATION_BROWSER.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
