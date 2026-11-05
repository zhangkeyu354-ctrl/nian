import {describe,expect,it} from "vitest";
import {AGENDAS,CHARACTERS,SETUP,WOUNDS,createGame,reduce,viewFor,type Command} from "../src/index.ts";
const sum=(d:any)=>Object.values(d).reduce((a:any,b:any)=>a+b,0);
describe("data",()=>{it("decks",()=>{for(const a of Object.values(AGENDAS))expect(sum(a.deck)).toBe(13);for(const c of Object.values(CHARACTERS))expect(sum(c.deck)).toBe(7);expect(Object.keys(CHARACTERS)).toHaveLength(18);expect(WOUNDS).toHaveLength(15)})});
function ready(n:number){let s=createGame(n,5);for(let i=0;i<20&&s.phase==="setup";i++)for(const p of s.players)if(p.choices.length&&!p.character)s=reduce(s,{seat:p.seat,t:"choose",name:p.choices[0]});return s}
describe("setup",()=>{for(const n of [4,5,6,7,8])it(`${n} 人`,()=>{const s=ready(n);expect(s.oxygen).toBe(SETUP[n].oxygen);expect(s.phase).toBe("action");for(const p of s.players){expect(p.hand.length).toBe(3);expect(p.deck.length).toBe(17)}})});
describe("privacy",()=>{it("别人的身份和手牌不下发",()=>{const s=ready(8);const v=viewFor(s,0);expect(JSON.stringify(v.players)).not.toMatch(/"agenda":"(?!null)/.source.length?new RegExp(`"seat":1,[^}]*"agenda":"`):/x/);for(const p of v.players)expect(p.hand).toBeTypeOf("number")})});
describe("rules",()=>{it("引擎上限 5",()=>{let s=ready(4);s=structuredClone(s);s.energy=3;s.phase="resolve";s.resStart=3;expect(s.resStart+5).toBe(8)});
 it("两伤回合结束才死",()=>{let s=ready(4);s=structuredClone(s);const l=s.leader;s.players[1].wounds=["flesh","flesh"];s.phase="accuse";s=reduce(s,{seat:l,t:"end_accuse"} as Command);expect(s.players[1].killed).toBe(true)})});
