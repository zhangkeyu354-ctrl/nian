import {expect,it} from "vitest";
import {botMove,createGame,waitingFor} from "../src/index.ts";
it("人机能打完各人数",()=>{for(const n of [4,6,8]){let s=createGame(n,n);for(let i=0;i<6000&&s.phase!=="over";i++)s=botMove(s,waitingFor(s)[0]);expect(s.phase).toBe("over")}});
