import { chromium } from 'playwright';

const base=process.env.BA_TEST_URL??'http://127.0.0.1:4177';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(base+'/');
  const card=page.getByTestId('cart-ba');
  await card.locator('.cart-beta').getByText('Beta').waitFor();
  await card.click();
  const detail=page.getByTestId('hall-detail');
  await detail.getByText('Beta 测试版',{exact:true}).waitFor();
  await detail.getByText(/目前只支持 4 人局/).waitFor();
  await detail.getByText(/6 人、8 人两副牌/).waitFor();
  await page.screenshot({path:'docs/black-a-510k/research/hall-beta-detail-390.png',fullPage:true});
  await page.goto(base+'/');
  await page.getByTestId('hall-notices').click();
  await page.getByRole('heading',{name:'新增「双黑A五十K」（Beta 测试版）'}).waitFor();
  await page.getByText(/如果你知道 4 人以上（6 人 \/ 8 人，两副牌）的具体玩法规则/).waitFor();
  await page.screenshot({path:'docs/black-a-510k/research/hall-beta-notice-390.png',fullPage:true});
  await page.getByRole('button',{name:'关闭'}).click();
  await page.getByTestId('hall-feedback').click();
  await page.getByTestId('fb-sheet').waitFor();
  console.log('BA_BETA_ANNOUNCEMENT_PASS',base);
}finally{await browser.close();}
