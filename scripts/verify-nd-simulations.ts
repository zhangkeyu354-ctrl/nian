import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createND,
  reduceND,
  viewForND,
  assertInvariantsND,
  type NDState,
  type NDCommand,
} from "../packages/naodong-scale/src/index.ts";

type Run = {
  players: number;
  expert: boolean;
  seed: number;
  strategy: "oracle" | "descending" | "random";
  success: boolean;
  rounds: number;
  commands: number;
  digest: string;
};
const runs: Run[] = [];
function simulate(
  players: number,
  expert: boolean,
  seed: number,
  strategy: Run["strategy"],
) {
  const options = { seed, expert };
  const names = Array.from({ length: players }, (_, i) => `模拟${i + 1}`);
  let s = createND(names, options);
  const commands: NDCommand[] = [];
  let rng = (seed ^ 0x9e3779b9) >>> 0 || 1;
  const random = () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    rng >>>= 0;
    return rng / 4294967296;
  };
  const push = (
    type: string,
    data: Record<string, unknown> = {},
    seat = s.captain,
  ) => {
    const cmd = { type, seat, seq: s.seq[seat] + 1, ...data } as NDCommand;
    const before = JSON.stringify(s),
      next = reduceND(s, cmd);
    assert.equal(JSON.stringify(s), before);
    assert.equal(reduceND(next, cmd), next);
    s = next;
    commands.push(cmd);
    assertInvariantsND(s);
    const view = viewForND(s, null);
    for (const key of [
      "seed",
      "random",
      "numbers",
      "unusedNumbers",
      "receipts",
      "topicCards",
    ])
      assert.ok(!(key in view));
    assert.deepEqual(view.revealed, s.revealed);
    assert.equal(view.myNumber, null);
  };
  while (s.phase !== "FINISHED") {
    assert.ok(
      commands.length < 200,
      "game must terminate within bounded commands",
    );
    if (s.phase === "CHOOSE_TOPIC")
      push("CHOOSE_TOPIC", {
        topicId:
          s.topicCards[s.round - 1].questions[Math.floor(random() * 2)].id,
      });
    else if (s.phase === "ANSWER") {
      const allowed = s.players
        .map((_, i) => i)
        .filter((i) => i !== s.captain && !s.ready.includes(i));
      const actor = allowed[Math.floor(random() * allowed.length)];
      push("SUBMIT_ANSWER", { text: `模拟回答${s.round}-${actor}` }, actor);
    } else if (s.phase === "ORDER") {
      const order = s.players
        .map((_, i) => i)
        .filter((i) => s.numbers[i] !== null);
      if (strategy === "oracle")
        order.sort((a, b) => s.numbers[a]! - s.numbers[b]!);
      else if (strategy === "descending")
        order.sort((a, b) => s.numbers[b]! - s.numbers[a]!);
      else
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      push("LOCK_ORDER", { order });
    } else if (s.phase === "REVEAL") push("REVEAL_NEXT");
    else if (s.phase === "EXPERT") {
      const target = s.players
        .map((_, i) => i)
        .find((i) => i !== s.captain && !s.revealed.some((r) => r.seat === i))!;
      const actual = s.numbers[target]!;
      const guess =
        strategy === "oracle"
          ? actual
          : strategy === "descending"
            ? actual === 1
              ? 2
              : 1
            : Math.floor(random() * 10) + 1;
      push("GUESS_EXACT", { target, guess });
    } else if (s.phase === "CAPTAIN_GUESS") {
      const actual = s.numbers[s.captain]!,
        guess =
          strategy === "oracle"
            ? actual
            : strategy === "descending"
              ? actual === 1
                ? 2
                : 1
              : Math.floor(random() * 10) + 1;
      push("GUESS_CAPTAIN", { guess }, (s.captain + 1) % players);
    } else if (s.phase === "ROUND_END") push("NEXT_ROUND");
    else throw Error("unexpected phase");
  }
  assert.ok(s.result);
  let replay = createND(names, options);
  for (const cmd of commands) replay = reduceND(replay, cmd);
  assert.deepEqual(
    replay,
    s,
    "seed and command replay must exactly reproduce final state",
  );
  runs.push({
    players,
    expert,
    seed,
    strategy,
    success: s.result.success,
    rounds: s.round,
    commands: commands.length,
    digest: createHash("sha256")
      .update(JSON.stringify(viewForND(s, null).history))
      .digest("hex"),
  });
}
for (const [players, expert] of [
  [4, false],
  [6, false],
  [9, false],
  [4, true],
  [6, true],
] as const) {
  for (let i = 0; i < 200; i++)
    simulate(
      players,
      expert,
      (expert ? 100000 : 0) + players * 1000 + i,
      ["oracle", "descending", "random"][i % 3] as Run["strategy"],
    );
  const group = runs.filter(
    (r) => r.players === players && r.expert === expert,
  );
  assert.equal(group.length, 200);
  assert.ok(group.some((r) => r.success) && group.some((r) => !r.success));
}
const summary = [...new Set(runs.map((r) => `${r.players}/${r.expert}`))].map(
  (key) => {
    const group = runs.filter((r) => `${r.players}/${r.expert}` === key);
    return {
      players: group[0].players,
      expert: group[0].expert,
      games: group.length,
      wins: group.filter((r) => r.success).length,
      losses: group.filter((r) => !r.success).length,
      maxCommands: Math.max(...group.map((r) => r.commands)),
    };
  },
);
const report = {
  total: runs.length,
  basic: 600,
  expert: 400,
  failed: 0,
  summary,
  privacy:
    "Public spectator projections checked every step; no RNG, undealt cards, receipts or future pairs.",
  strategyNote:
    "Oracle/descending strategies inspect server state solely to exercise success and failure boundaries; they do not represent human guessing or a client capability.",
  runs,
};
const out = resolve("docs/naodong-scale/ui-v3/verification");
mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "SIMULATIONS.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      total: report.total,
      basic: report.basic,
      expert: report.expert,
      failed: report.failed,
      summary,
    },
    null,
    2,
  ),
);
