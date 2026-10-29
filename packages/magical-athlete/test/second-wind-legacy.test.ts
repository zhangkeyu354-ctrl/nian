import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createMAGame, reduceMA } from "../src/engine.ts";
import { viewForMA } from "../src/privacy.ts";
const fixture=JSON.parse(readFileSync("docs/magical-athlete/second-wind/legacy-replay-fixtures.json","utf8"));
const hash=(s:unknown)=>createHash("sha256").update(JSON.stringify(s)).digest("hex");
for(const c of fixture.cases) it(`旧版轨迹逐步保持：${c.options.players.length}人 ${c.options.settings.deal}`,()=>{
  let s=createMAGame({...c.options,settings:{...c.options.settings,bananaBackwardPass:false,independentMasterminds:false}});
  for(const step of c.trace){
    s=reduceMA(s,step.cmd);
    expect(hash(s)).toBe(step.state);
    expect(hash(viewForMA(s,"p0"))).toBe(step.view);
  }
  expect(s.phase).toBe("over");
},30_000);
