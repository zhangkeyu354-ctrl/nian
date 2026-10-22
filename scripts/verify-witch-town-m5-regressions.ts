import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const groups:Record<string,string[]> = {
  protocols:["verify-replays","verify-lan-protocol","verify-lan-lobby","verify-cn-protocol"],
  // MA browsers and RR protocol both bind 3331: keep them in the same serial group.
  browsers:["verify-ma-browsers","verify-rr-protocol","verify-cn-browsers","verify-rr-browsers","verify-lan-browsers"],
  extra:["verify-dm-browsers","verify-drawing-studio-eight"],
};
const group = process.argv[2] ?? "protocols";
if(!groups[group]) throw Error("unknown verification group");
const dir = "output/witch-town/m5-regressions";
mkdirSync(dir,{recursive:true});
const results:any[]=[];
for(const name of groups[group]) {
  const startedAt=new Date().toISOString();
  const child=spawn(process.execPath,["--import","tsx",`scripts/${name}.ts`],{
    env:{...process.env,DM_URL:"http://127.0.0.1:3409",DP_URL:"http://127.0.0.1:3409",DM_SCREEN_DIR:`${dir}/dm`},stdio:["ignore","pipe","pipe"],
  });
  let log="";
  const collect=(chunk:Buffer)=>{log+=chunk.toString();writeFileSync(`${dir}/${name}.log`,log);};
  child.stdout.on("data",collect);
  child.stderr.on("data",collect);
  const code=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("close",resolve);});
  writeFileSync(`${dir}/${name}.log`,log);
  results.push({name,command:`npx tsx scripts/${name}.ts`,code,startedAt,finishedAt:new Date().toISOString(),log:`${dir}/${name}.log`});
  writeFileSync(`${dir}/${group}.json`,JSON.stringify(results,null,2)+"\n");
  console.log(`${code===0?"PASS":"FAIL"} ${name}`);
}
if(results.some(x=>x.code!==0)) process.exitCode=1;
