import { chromium,type Page } from 'playwright';
import {io as clientIo} from 'socket.io-client';

const base=process.env.BA_TEST_URL??'http://127.0.0.1:4177';
const browser=await chromium.launch({headless:true});
const pages:Page[]=[];
try{
  for(let i=0;i<4;i++){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();pages.push(page);
    if(i===0){await page.goto(base+'/?game=ba');await page.getByRole('button',{name:'创建四人房间'}).click();await page.waitForURL(/room=/)}
    else await page.goto(pages[0].url());
    await page.getByPlaceholder('输入昵称').fill('测试玩家'+(i+1));
    await page.getByRole('button',{name:'入座'}).click();
  }
  for(const page of pages)await page.getByRole('button',{name:'准备开局'}).click();
  await pages[0].getByText('我的手牌',{exact:false}).first().waitFor();
  const widths=[320,360,390,414];
  for(const width of widths){
    await pages[0].setViewportSize({width,height:844});
    await pages[0].evaluate(()=>Promise.all(Array.from(document.images).map(img=>img.complete?null:new Promise(r=>{img.onload=r;img.onerror=r}))));
    const layout=await pages[0].evaluate(()=>({pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,handOverflow:document.querySelector('.ba-hand')!.scrollWidth>document.querySelector('.ba-hand')!.clientWidth,handCount:document.querySelectorAll('.ba-hand .ba-card').length,buttonVisible:Array.from(document.querySelectorAll('.ba-actions button')).every(button=>{const box=button.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth})}));
    if(layout.pageWidth>layout.viewport||layout.handOverflow||layout.handCount!==13||!layout.buttonVisible)throw new Error(`mobile layout ${width}: ${JSON.stringify(layout)}`);
    await pages[0].screenshot({path:`docs/black-a-510k/research/live-play-${width}.png`,fullPage:true});
  }
  await pages[0].setViewportSize({width:390,height:844});
  await pages[0].getByRole('button',{name:'切换明亮配色'}).click();
  if(!await pages[0].locator('.ba-app.ba-theme-light').count())throw new Error('light palette did not apply');
  await pages[0].screenshot({path:'docs/black-a-510k/research/live-play-light-390.png',fullPage:true});
  await pages[0].reload();
  await pages[0].locator('.ba-app.ba-theme-light').waitFor();
  await pages[0].getByRole('button',{name:'切换深绿配色'}).click();
  let actions=0,capturedRecent=false;
  for(;actions<300;actions++){
    if(await pages[0].getByText('本局结算',{exact:false}).count())break;
    if(!capturedRecent&&actions>=4){
      await pages[0].screenshot({path:'docs/black-a-510k/research/live-recent-plays-390.png',fullPage:true});
      capturedRecent=true;
    }
    let moved=false;
    for(const page of pages){
      if(await pages[0].getByText('本局结算',{exact:false}).count())break;
      const hint=page.getByRole('button',{name:'提示',exact:true});
      const pass=page.getByRole('button',{name:'过牌',exact:true});
      if(!await hint.count()||!await pass.count())continue;
      if(await pass.isEnabled()||await hint.isEnabled()){
        if(await pass.isEnabled())await pass.click();
        else{await hint.click();await page.getByRole('button',{name:'出牌',exact:true}).click()}
        moved=true;break;
      }
    }
    if(!moved){await pages[0].waitForTimeout(60);actions--;}
  }
  if(actions>=300)throw new Error('first round did not settle');
  await pages[0].getByRole('button',{name:'准备下一局'}).waitFor();
  const code=new URL(pages[0].url()).searchParams.get('room')!;
  const token=await pages[0].evaluate(room=>localStorage.getItem('ba-seat-'+room),code);
  if(!token)throw new Error('missing seat token for result audit');
  const probe=clientIo(base,{transports:['websocket']});
  const audited=await new Promise<any>((resolve,reject)=>{probe.once('connect',()=>probe.timeout(5000).emit('ba:join',{code,token},(error:unknown,response:any)=>error?reject(error):resolve(response)));probe.once('connect_error',reject)});
  probe.disconnect();
  if(!audited.ok||!audited.snapshot.round?.result)throw new Error('missing authoritative result');
  const authoritative=audited.snapshot.round.result;
  const ledgerRows=pages[0].locator('.ba-ledger>div:not(.ba-ledger-head)');
  for(let seat=0;seat<4;seat++){
    const row=ledgerRows.nth(seat),entry=authoritative.ledger[seat];
    const cells=await row.locator('span,strong').allTextContents();
    const transfer=entry.transferIn-entry.transferOut;
    if(Number(cells[1])!==entry.capturedScore||Number(cells[2])!==entry.remainderScore||Number(cells[3])!==transfer||Number(cells[4])!==entry.finalScore)throw new Error('result ledger mismatch at seat '+seat+': '+JSON.stringify(cells));
    if(!cells[0].includes(authoritative.blackTeam.includes(seat)?'黑A':'普通'))throw new Error('result identity mismatch at seat '+seat);
    if(!cells[0].includes(`第${audited.snapshot.round.finishedOrder.indexOf(seat)+1}名`))throw new Error('finish rank mismatch at seat '+seat);
  }
  const recipientName=audited.snapshot.players[authoritative.remainderRecipient].name;
  const auditText=await pages[0].locator('.ba-result-audit').innerText();
  if(!auditText.includes(recipientName))throw new Error('remainder recipient mismatch');
  const expectedWinner=authoritative.winningTeam==='BLACK_A'?'黑A队获胜':'普通队获胜';
  if((await pages[0].locator('.ba-result h2').innerText())!==expectedWinner)throw new Error('victory title mismatch');
  const reasonText:{[key:string]:string}={BLACK_LEAD_30:'黑A队领先至少30分',OTHER_HOLDS:'黑A队未领先30分',SOLO_30:'独狼达到30分且非末游',SOLO_FAILED:'独狼未满足获胜条件'};
  if(!(await pages[0].locator('.ba-result').innerText()).includes(reasonText[authoritative.reason]))throw new Error('victory reason mismatch');
  const loserIndex=authoritative.winningTeam==='BLACK_A'?1:0;
  const expectedDraw=authoritative.shavedPenalty[loserIndex]?'抽 4 张':audited.snapshot.options.advanceExchange?'抽 2 张':'关闭跨局交换';
  if(!auditText.includes(expectedDraw))throw new Error('exchange reward mismatch');
  const resultButtonStyle=await pages[0].getByRole('button',{name:'准备下一局'}).evaluate(button=>{const css=getComputedStyle(button);return {text:button.textContent,color:css.color,fill:css.webkitTextFillColor,background:css.backgroundColor,image:css.backgroundImage,opacity:css.opacity,filter:css.filter,visibility:css.visibility}});
  const luminance=(value:string)=>{const channels=value.match(/\d+/g)?.slice(0,3).map(Number)??[];if(channels.length!==3)throw new Error('missing RGB color: '+value);const [r,g,b]=channels.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
  const a=luminance(resultButtonStyle.color),b=luminance(resultButtonStyle.background);
  const contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  if(resultButtonStyle.text!=='准备下一局'||contrast<4.5)throw new Error('result button unreadable: '+JSON.stringify({resultButtonStyle,contrast}));
  console.log(JSON.stringify({resultButtonStyle}));
  const firstResult=await pages[0].locator('.ba-result h2').textContent();
  await pages[0].screenshot({path:'docs/black-a-510k/research/live-result-390.png',fullPage:true});
  await pages[0].getByRole('button',{name:'切换明亮配色'}).click();
  await pages[0].locator('.ba-app.ba-theme-light').waitFor();
  const lightButton=await pages[0].getByRole('button',{name:'准备下一局'}).evaluate(button=>{const css=getComputedStyle(button);return {color:css.color,background:css.backgroundColor}});
  const lightContrast=(Math.max(luminance(lightButton.color),luminance(lightButton.background))+.05)/(Math.min(luminance(lightButton.color),luminance(lightButton.background))+.05);
  if(lightContrast<4.5)throw new Error('light result button unreadable: '+JSON.stringify({lightButton,lightContrast}));
  await pages[0].screenshot({path:'docs/black-a-510k/research/live-result-light-390.png',fullPage:true});
  for(const page of pages)await page.getByRole('button',{name:'准备下一局'}).click();
  let transactions=0,capturedDrawScreen=false,capturedReturnScreen=false;
  for(let n=0;n<12;n++){
    if(await pages[0].getByText('我的手牌',{exact:false}).count()&&await pages[0].locator('.ba-table').count())break;
    let acted=false;
    for(const page of pages){
      const drawButton=page.getByRole('button',{name:'确认抽牌'});
      if(await drawButton.count()&&await page.locator('.ba-facedown-grid').count()){
        const text=await page.locator('.ba-selection').textContent();
        const count=Number(text?.match(/\/\s*(\d+)/)?.[1]??0);
        if(count){
          for(let i=0;i<count;i++)await page.locator('.ba-facedown-grid .ba-card').nth(i).click();
          if(!capturedDrawScreen){await page.screenshot({path:'docs/black-a-510k/research/live-draw-390.png',fullPage:true});capturedDrawScreen=true}
          await page.waitForTimeout(100);
          if(!await drawButton.isEnabled())throw new Error('draw selection failed');
          await drawButton.click();await page.waitForTimeout(150);acted=true;break;
        }
      }
      const button=page.getByRole('button',{name:'确认归还'});
      if(await button.count()&&await page.locator('.ba-hand-drawn').count()){
        const text=await page.locator('.ba-selection').textContent();
        const count=Number(text?.match(/\/\s*(\d+)/)?.[1]??0);
        if(count){
          if(!capturedReturnScreen){await page.screenshot({path:'docs/black-a-510k/research/live-return-390.png',fullPage:true});capturedReturnScreen=true}
          for(let i=0;i<count;i++)await page.locator('.ba-hand .ba-card').nth(i).click();
          await page.waitForTimeout(150);
          if(!await button.isEnabled())throw new Error('return selection failed: '+await page.locator('.ba-selection').textContent());
          await button.click();await page.waitForTimeout(150);transactions++;acted=true;break;
        }
      }
    }
    if(!acted)await pages[0].waitForTimeout(100);
  }
  await pages[0].locator('.ba-table').waitFor({timeout:5000});
  const screenshots=['first-result','second-round'];
  await pages[0].screenshot({path:'docs/black-a-510k/research/live-second-round-390.png',fullPage:true});
  console.log(JSON.stringify({clients:4,mobileWidths:widths,firstRoundActions:actions,firstResult,transactions,secondRoundStarted:true,url:pages[0].url(),screenshots}));
}finally{await browser.close()}
