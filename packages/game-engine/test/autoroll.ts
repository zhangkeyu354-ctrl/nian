// 测试用：掷骰现在需要掷骰的玩家自己点"掷骰"（ROLL_DICE 选择，用户 2026-10-20）。
// 规则单元测试关心的是掷完之后的结算，这里在每条命令后自动替掷骰者点一下。
// 专门测试"必须自己掷骰"的用例请直接用 ../src/index.ts 的 reduce。
import { reduce as engineReduce } from "../src/index.ts";
import type { GameState, Command } from "../../shared/src/types.ts";
export function reduce(s: GameState, c: Command): GameState {
  let r = engineReduce(s, c);
  while (r.choice?.kind === "ROLL_DICE")
    r = engineReduce(r, { type: "SELECT", actorId: r.choice.actorId });
  return r;
}
