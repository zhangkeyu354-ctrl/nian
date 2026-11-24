import {chromium} from 'playwright';

const base=process.env.BA_TEST_URL??'http://127.0.0.1:4178';
const browser=await chromium.launch({headless:true});
try{
  const hostContext=await browser.newContext({viewport:{width:390,height:844}});
  const guestContext=await browser.newContext({viewport:{width:390,height:844}});
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  await host.goto(base+'/?game=ba');
  await host.getByRole('button',{name:'创建四人房间'}).click();
  await host.waitForURL(/room=/);
  const roomUrl=host.url();
  await host.getByPlaceholder('输入昵称').fill('房主');
  await host.getByRole('button',{name:'入座'}).click();
  await host.getByRole('button',{name:/加入人机/}).click();
  await host.getByText('人机1 · 人机').waitFor();
  await guest.goto(roomUrl);
  await guest.getByPlaceholder('输入昵称').fill('朋友');
  await guest.getByRole('button',{name:'入座'}).click();
  await host.getByRole('button',{name:'移出 朋友'}).click();
  await host.getByRole('button',{name:'确认移出 朋友'}).click();
  await guest.waitForURL(url=>url.pathname==='/'&&url.searchParams.get('game')==='ba'&&!url.searchParams.has('room'));
  await host.getByRole('button',{name:/加入人机/}).click();
  await host.getByRole('button',{name:/加入人机/}).click();
  await host.getByText('人机3 · 人机').waitFor();
  const layout=await host.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,kickButtons:[...document.querySelectorAll('.ba-seat-row .kick-btn')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}));
  if(layout.width>layout.viewport||layout.kickButtons.length!==3||layout.kickButtons.some(b=>b.width<44||b.height<44))throw new Error('bot lobby mobile layout: '+JSON.stringify(layout));
  await host.screenshot({path:'docs/black-a-510k/research/live-bot-lobby-390.png',fullPage:true});
  await host.getByRole('button',{name:'准备开局'}).click();
  await host.locator('.ba-table').waitFor();
  await host.getByText('人机3',{exact:true}).waitFor();
  console.log('BA_BOT_KICK_BROWSER_PASS',JSON.stringify({roomUrl,layout}));
}finally{await browser.close();}
