import { reduceMA } from "../src/engine.ts";
import type { MAState } from "../src/types.ts";

/** 对待决定事项给出回答；pick 返回选项值（默认第一个） */
export function answer(s: MAState, value?: string): MAState {
  const p = s.pending;
  if (!p) throw new Error("没有待决定事项");
  return reduceMA(s, { type: "ANSWER", player: p.player, value: value ?? p.options[0].value });
}

/** 按 kind 回答，直到遇到 stopKind 或 n 次 */
export function answerUntil(
  s: MAState,
  pick: (kind: string, values: string[]) => string,
  stop: (s: MAState) => boolean,
  max = 200,
): MAState {
  for (let i = 0; i < max && s.pending && !stop(s); i++) {
    const p = s.pending;
    s = answer(s, pick(p.kind, p.options.map((o) => o.value)));
  }
  return s;
}

export const tok = (s: MAState, racer: string) => s.race!.tokens.find((t) => t.racer === racer)!;
export const logText = (s: MAState) => s.log.map((l) => l.text).join("\n");
