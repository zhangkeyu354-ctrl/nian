import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';

const roots=['docs/black-a-510k/research/candidate-audio/kenney','docs/black-a-510k/research/candidate-music'];
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  const results=[];
  for(const root of roots)for(const file of readdirSync(root).filter(name=>/\.(ogg|mp3)$/.test(name))){
    const bytes=readFileSync(join(root,file));
    const metadata=await page.evaluate(async data=>{
      const context=new AudioContext();
      try{const decoded=await context.decodeAudioData(Uint8Array.from(data).buffer);const samples=decoded.getChannelData(0);return {duration:Math.round(decoded.duration*1000)/1000,channels:decoded.numberOfChannels,sampleRate:decoded.sampleRate,seamJump:Math.round(Math.abs(samples[0]-samples.at(-1)!) * 10000)/10000}}
      finally{await context.close()}
    },Array.from(bytes));
    results.push({file:root+'/'+file,bytes:bytes.length,...metadata});
  }
  console.log(JSON.stringify(results));
}finally{await browser.close()}
