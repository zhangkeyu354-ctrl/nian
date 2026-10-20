// 物品效果（Phase 4，Claude 2026-10-19）。
// 卡文：packages/game-data/ITEM_DATA.json 的 text_original_zh（已接受的中文零售照片 D37）。
// 数字版时机模型见 docs/HOUSE_RULES.md「U-ITEM-TIMING」（待用户确认的默认做法）。
//
// 共同流程：持有者打出物品 → 立即弃掉并公开（U-ITEM）→ 发出 ITEM_USED 信号
// （医生「压迫性气场」可在此响应）→ RESOLVE_ITEM 结算效果（被压迫性气场弃掉时不产生效果）。
import type { GameState, Command, Payload, Actor } from "../../shared/src/types.ts";
import {
  actor,
  active,
  requireThat,
  text,
  number,
  gain,
  healthy,
  log,
  prop,
  enqueue,
  random,
  RuleError,
  addGeneratorProgress,
  afterUse,
} from "./engine.ts";
import { dice } from "./data.ts";
import { resultClass } from "./dice.ts";

export const ITEM_IDS = [
  "toolbox",
  "commodious_toolbox",
  "firecracker",
  "map",
  "rainbow_map",
  "flashlight",
  "first_aid_kit",
  "broken_key",
  "dull_key",
  "skeleton_key",
] as const;
const KEY_BLOOD: Record<string, number> = {
  broken_key: 1,
  dull_key: 2,
  skeleton_key: 3,
};
const SURVIVOR_TURN_ITEMS = [
  "commodious_toolbox",
  "map",
  "rainbow_map",
  "first_aid_kit",
];

/** 物品反应点：只给此刻物品真的能用的逃生者一个响应机会（用户 2026-10-20 选择：
 * 速度优先，接受"暂停时别人能猜到他拿的是钥匙/手电筒/鞭炮"这一信息代价）。 */
export function itemResponders(
  s: GameState,
  event: string,
  context: Payload,
): string[] {
  const holders = s.survivors.filter((id) => {
    const a = s.actors[id];
    return a.item && !a.hookId;
  });
  // 用户 2026-10-20：只询问此刻物品真的能用的人（避免每次掷骰都要所有持物者点"继续"）
  const holding = (id: string, items: string[]) => items.includes(s.actors[id].item!);
  if (event === "KILLER_WOULD_ENTER")
    return holders.filter(
      (id) => s.actors[id].room === context.to && holding(id, ["firecracker"]),
    );
  if (
    event === "WOULD_INTERACT" &&
    context.actorId === s.killerId &&
    s.pendingAction &&
    s.turn?.actorId === s.killerId
  ) {
    const room = s.actors[s.killerId].room;
    return holders.filter(
      (id) => s.actors[id].room === room && holding(id, ["flashlight"]),
    );
  }
  if (
    event === "AFTER_ROLL" &&
    s.roll &&
    // 钥匙"重掷任意一颗骰子"：每次掷骰都可以（不只失败时），重掷过的那颗除外
    s.roll.faces.some((_, i) => !(s.roll!.rerolled ?? []).includes(i))
  )
    return holders.filter((id) =>
      holding(id, ["broken_key", "dull_key", "skeleton_key"]),
    );
  return [];
}

function ownTurn(s: GameState, a: Actor) {
  return (
    s.phase === "ACTING" &&
    s.turn?.actorId === a.id &&
    (s.turn.stage === "MOVE" || s.turn.stage === "INTERACT")
  );
}
function survivorTurn(s: GameState) {
  return (
    s.phase === "ACTING" &&
    !!s.turn &&
    s.actors[s.turn.actorId].side === "survivor" &&
    s.turn.stage !== "SELECT_BONUS"
  );
}
function killerTurnHere(s: GameState, a: Actor) {
  return (
    s.phase === "ACTING" &&
    s.turn?.actorId === s.killerId &&
    !s.turn.interactionSpent &&
    !s.turn.noInteract &&
    s.actors[s.killerId].room === a.room
  );
}

/** 校验并开始使用物品。由 reduce 在 USE_ITEM 时调用。 */
export function useItem(s: GameState, c: Command) {
  const a = actor(s, c.actorId);
  requireThat(a.side === "survivor" && a.item, "no item held");
  // B01 p12：躲在储物柜里只禁止使用技能；被献祭（挂钩）视为不在版图上
  requireThat(!a.hookId, "sacrificed survivor cannot use items");
  const item = a.item!;
  if (c.itemId !== undefined)
    requireThat(c.itemId === item, "item not held");
  requireThat(!s.choice, "pending choice must resolve");
  const w = s.window;
  const inWindow = !!w;
  if (w)
    requireThat(
      w.actors[w.index] === a.id && (w.itemActors ?? []).includes(a.id),
      "not your item response",
    );
  else requireThat(!s.roll, "check in progress");
  const opt = c.option;
  const params: Payload = {};

  switch (item) {
    case "toolbox":
    case "commodious_toolbox": {
      requireThat(!inWindow, "use during the turn, not as a response");
      requireThat(
        item === "toolbox" ? ownTurn(s, a) : survivorTurn(s),
        item === "toolbox" ? "only during your turn" : "only during a survivor turn",
      );
      const p = prop(s, c.propId);
      requireThat(
        p.kind === "generator" &&
          p.revealed &&
          p.room === a.room &&
          p.progress < 3 &&
          !(s.entity?.kind === "prop" && s.entity.id === p.id),
        "generator in your space",
      );
      if (item === "commodious_toolbox")
        requireThat(s.itemDeck.length, "item deck exhausted");
      params.propId = p.id;
      break;
    }
    case "first_aid_kit": {
      requireThat(!inWindow && survivorTurn(s), "only during a survivor turn");
      const t = actor(s, c.targetId);
      requireThat(
        t.side === "survivor" &&
          (t.id === a.id || (active(t) && t.room === a.room)) &&
          t.health === "wounded",
        "you or a wounded survivor in your space",
      );
      params.targetId = t.id;
      break;
    }
    case "map":
    case "rainbow_map": {
      requireThat(!inWindow && survivorTurn(s), "only during a survivor turn");
      if (opt === "reveal")
        requireThat(
          s.props.some((p) => !p.revealed && !p.removed),
          "no face-down props",
        );
      else if (item === "map") {
        requireThat(opt === "draw", "reveal/draw");
        requireThat(s.itemDeck.length, "item deck exhausted");
      } else requireThat(opt === "killer_cards", "reveal/killer_cards");
      params.option = opt;
      break;
    }
    case "flashlight": {
      if (inWindow)
        requireThat(
          w!.event === "WOULD_INTERACT" &&
            w!.context.actorId === s.killerId &&
            s.actors[s.killerId].room === a.room &&
            s.pendingAction,
          "flashlight: killer interaction in your space",
        );
      else requireThat(killerTurnHere(s, a), "only during killer turn, killer in your space");
      break;
    }
    case "firecracker": {
      if (opt === "wall") {
        // Q10（用户裁定 2026-10-19）：与你所在空间直接相连的路线上的一个可破坏墙壁。任何时候。
        const path = s.paths[text(c, "pathId")];
        requireThat(
          path && path.wall && a.room && path.rooms.includes(a.room),
          "breakable wall on a path from your space",
        );
        params.option = "wall";
        params.pathId = path.id;
        break;
      }
      requireThat(opt === "block", "block/wall");
      requireThat(
        inWindow && w!.event === "KILLER_WOULD_ENTER" && w!.context.to === a.room,
        "firecracker: killer about to enter your space",
      );
      params.option = "block";
      break;
    }
    case "broken_key":
    case "dull_key":
    case "skeleton_key": {
      if (opt === "reroll") {
        const r = s.roll;
        requireThat(
          inWindow && w!.event === "AFTER_ROLL" && r,
          "reroll right after a roll",
        );
        const i = number(c, "index");
        requireThat(
          i >= 0 && i < r!.faces.length && !(r!.rerolled ?? []).includes(i),
          "die not re-rollable",
        );
        params.option = "reroll";
        params.index = i;
      } else {
        requireThat(opt === "blood", "reroll/blood");
        const t = actor(s, c.targetId);
        requireThat(t.side === "survivor", "any survivor");
        requireThat(s.phase !== "OVER", "game over");
        params.option = "blood";
        params.targetId = t.id;
      }
      break;
    }
    default:
      throw new RuleError("CHECK_REQUIRED", `item ${item}`);
  }

  // 打出：弃掉并公开
  a.item = null;
  s.itemDiscard.push(item);
  log(s, "ITEM_USED", { actorId: a.id, item, ...params }, [
    "D37:中文物品牌",
    "U-ITEM",
  ]);
  if (w) {
    s.window = null;
    const next = afterUse(s, w, a.id);
    enqueue(
      s,
      { kind: "SIGNAL", event: "ITEM_USED", context: { actorId: a.id, item } },
      { kind: "RESOLVE_ITEM", actorId: a.id, item, params },
      ...(next ? [{ kind: "RESTORE_WINDOW", window: next }] : []),
    );
  } else
    enqueue(
      s,
      { kind: "SIGNAL", event: "ITEM_USED", context: { actorId: a.id, item } },
      { kind: "RESOLVE_ITEM", actorId: a.id, item, params },
    );
}

/** RESOLVE_ITEM：真正产生效果 */
export function resolveItem(s: GameState, j: Payload) {
  const id = text(j, "actorId"),
    item = text(j, "item"),
    params = (j.params ?? {}) as Payload;
  if (j.negated) {
    log(s, "ITEM_NEGATED", { actorId: id, item });
    return;
  }
  const a = actor(s, id);
  switch (item) {
    case "toolbox":
    case "commodious_toolbox":
      // 若期间发电机已完成或被移除，则此物品没有效果（已弃掉）
      if (s.props.some((p) => p.id === params.propId && !p.removed)) {
        addGeneratorProgress(s, text(params, "propId"), 1, id);
        if (s.winner) return;
      }
      // 宽敞工具箱：然后抽取一张物品牌（放在发电机完成信号之后）
      if (item === "commodious_toolbox")
        enqueueAfterSignals(s, { kind: "DRAW_ITEM", actorId: id });
      break;
    case "first_aid_kit":
      healthy(s, text(params, "targetId"));
      break;
    case "map":
    case "rainbow_map":
      if (params.option === "reveal")
        s.choice = { kind: "MAP_REVEAL", actorId: id, remaining: 3 };
      else if (params.option === "draw")
        enqueue(s, { kind: "DRAW_ITEM", actorId: id });
      else {
        const k = s.killerId;
        const plans = s.plans[k] ?? [];
        log(s, "KILLER_CARDS_REVEALED", {
          actorId: k,
          hand: [...s.hands[s.actors[k].ownerId]],
          plans: [...plans],
        });
        plans.forEach((card, index) =>
          log(s, "PLANNED_CARD_REVEALED", { actorId: k, index, card }),
        );
      }
      break;
    case "flashlight":
      if (s.pendingAction && s.pendingAction.actorId === s.killerId) {
        log(s, "INTERACTION_PREVENTED", {
          actorId: s.killerId,
          by: id,
          action: s.pendingAction.action,
        });
        s.pendingAction = null;
      } else if (s.turn?.actorId === s.killerId) {
        s.turn.noInteract = true;
        log(s, "INTERACTION_PREVENTED", { actorId: s.killerId, by: id });
      }
      break;
    case "firecracker":
      if (params.option === "wall") {
        const p = s.paths[text(params, "pathId")];
        p.wall = false;
        p.temporaryWall = false;
        delete p.temporaryWallUntil;
        log(s, "WALL_REMOVED", { actorId: id, pathId: p.id, by: "firecracker" });
        break;
      }
      // 由 KILLER_WOULD_ENTER 之后的 MOVE_EFFECT/TELEPORT 读取
      s.blockedEntry = { room: a.room!, by: id };
      break;
    case "broken_key":
    case "dull_key":
    case "skeleton_key":
      if (params.option === "blood")
        gain(s, text(params, "targetId"), KEY_BLOOD[item]);
      else {
        const r = s.roll;
        if (!r) return;
        const i = number(params, "index");
        const faces = dice.dice.find((d) => d.id === r.die)!.faces;
        const old = r.faces[i];
        const face = faces[random(s, 6)];
        r.faces[i] = face;
        r.classes[i] = resultClass(face);
        // 重掷前的失败不再给杀手血点（B01 p18 FAQ）
        r.failureCredit[i] = face === 0;
        r.rerolled = [...(r.rerolled ?? []), i];
        log(s, "DIE_REROLLED", {
          actorId: r.actorId,
          by: id,
          index: i,
          from: old,
          face,
        });
      }
      break;
    default:
      throw new RuleError("CHECK_REQUIRED", `item ${item}`);
  }
}

/** 把 job 放在当前队首信号（如 GENERATOR_COMPLETED）之后 */
function enqueueAfterSignals(s: GameState, job: Payload & { kind: string }) {
  let i = 0;
  while (i < s.jobs.length && s.jobs[i].kind === "SIGNAL") i++;
  s.jobs.splice(i, 0, job);
}

/** 地图：依次翻开至多 3 个道具 */
export function selectMapReveal(s: GameState, choice: Payload, c: Command) {
  const remaining = number(choice, "remaining");
  if (c.propId === undefined) return; // 完成
  const p = prop(s, c.propId);
  requireThat(!p.revealed, "already revealed");
  p.revealed = true;
  log(s, "PROP_REVEALED", {
    actorId: choice.actorId,
    propId: p.id,
    kind: p.kind,
    by: "map",
  });
  if (remaining > 1 && s.props.some((q) => !q.revealed && !q.removed))
    s.choice = {
      kind: "MAP_REVEAL",
      actorId: text(choice, "actorId"),
      remaining: remaining - 1,
    };
}

/** 医生「压迫性气场」：危险骰失败 → 正在结算的物品不产生效果 */
export function negatePendingItem(s: GameState) {
  const j = s.jobs.find((j) => j.kind === "RESOLVE_ITEM" && !j.negated);
  if (j) j.negated = true;
}

/** 某角色当前可以使用的全部物品命令（界面直接列成按钮，不需要表单） */
export function itemCommands(s: GameState, actorId: string): Command[] {
  const a = s.actors[actorId];
  if (!a?.item || a.side !== "survivor") return [];
  const base = { type: "USE_ITEM", actorId, itemId: a.item };
  const out: Command[] = [];
  switch (a.item) {
    case "toolbox":
    case "commodious_toolbox":
      for (const p of s.props)
        if (p.kind === "generator" && p.room === a.room && p.revealed && !p.removed)
          out.push({ ...base, propId: p.id });
      break;
    case "first_aid_kit":
      for (const t of s.survivors) out.push({ ...base, targetId: t });
      break;
    case "map":
      out.push({ ...base, option: "reveal" }, { ...base, option: "draw" });
      break;
    case "rainbow_map":
      out.push({ ...base, option: "reveal" }, { ...base, option: "killer_cards" });
      break;
    case "flashlight":
      out.push(base);
      break;
    case "firecracker":
      out.push({ ...base, option: "block" });
      for (const p of Object.values(s.paths))
        if (p.wall && a.room && p.rooms.includes(a.room))
          out.push({ ...base, option: "wall", pathId: p.id });
      break;
    default:
      if (KEY_BLOOD[a.item]) {
        for (let index = 0; index < (s.roll?.faces.length ?? 0); index++)
          out.push({ ...base, option: "reroll", index });
        for (const t of s.survivors)
          out.push({ ...base, option: "blood", targetId: t });
      }
  }
  return out;
}
export { SURVIVOR_TURN_ITEMS };
