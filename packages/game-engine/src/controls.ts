import type { GameState, Command, Card, Payload } from "../../shared/src/types.ts";
import { reduce, validateInteraction, phantasmTargets } from "./engine.ts";
import { itemCommands } from "./items.ts";
import { legalRoutes, connected } from "./graph.ts";
import { maps, roster, boardPerks } from "./data.ts";
export const cardNames: Record<Card, string> = {
  blue: "潜行（蓝）",
  green: "冲刺（绿）",
  red: "蹲伏（红）",
  yellow: "翻越（黄）",
  wait: "等待",
};
export const propNames: Record<string, string> = {
  generator: "发电机",
  exit_gate: "出口大门",
  hook: "钩子",
  hex_totem: "厄咒图腾",
  chest: "箱子",
  locker: "储物柜",
  pallet: "木板",
  crow: "乌鸦",
};
export const categoryNames: Record<string, string> = {
  objective: "目标",
  boldness: "无惧",
  survival: "逃生",
  altruism: "援助",
};
export const actionNames: Record<string, string> = {
  repair: "修理",
  exit: "开启",
  cleanse: "净化",
  chest: "搜索",
  locker: "躲藏",
  crow: "惊动",
  pallet: "放置木板",
  rescue: "救援",
  damage: "破坏",
  venerate: "崇拜",
  scout: "侦察",
  search: "搜查",
  attack: "攻击",
  pickup: "搬运",
  heal: "治疗",
  power: "使用杀手力量",
};
export const itemNames: Record<string, string> = {
  toolbox: "工具箱",
  commodious_toolbox: "宽敞工具箱",
  firecracker: "鞭炮",
  map: "地图",
  rainbow_map: "彩虹地图",
  flashlight: "手电筒",
  first_aid_kit: "急救箱",
  broken_key: "破损钥匙",
  dull_key: "晦暗钥匙",
  skeleton_key: "万能钥匙",
};
export const actorName = (id: string) => roster.get(id)?.name_zh ?? "角色";
export const roomName = (s: GameState, id: string) =>
  maps.maps.find((m) => m.id === s.mapId)?.nodes.find((n) => n.id === id)
    ?.name_zh ?? "房间";
export const propLabel = (s: GameState, id: string) => {
  const p = s.props.find((p) => p.id === id);
  return p
    ? `${roomName(s, p.room)} · ${p.revealed ? propNames[p.kind] : categoryNames[p.category] + "道具（未翻开）"} ${s.props.filter((x) => x.room === p.room).indexOf(p) + 1}`
    : "道具";
};
export interface ControlAction {
  label: string;
  command: Command;
  targetId?: string;
  roomId?: string;
  pathId?: string;
}
export function canCommand(s: GameState, c: Command) {
  try {
    reduce(s, c);
    return true;
  } catch {
    return false;
  }
}
export function currentActor(s: GameState): string | null {
  if (s.winner) return null;
  if (s.window) return s.window.actors[s.window.index];
  if (s.choice) return s.choice.actorId;
  if (s.phase === "SETUP") return s.survivors[s.setupIndex];
  if (s.phase === "PLANNING")
    return (
      [...s.publicPlans, ...s.survivors, s.killerId].find(
        (id) => !s.plans[id] && !s.actors[id].hookId,
      ) ?? null
    );
  if (s.phase === "BONUS_OFFER") return s.killerId;
  return s.turn?.actorId ?? null;
}
export function previewRoutes(s: GameState, id: string, color: Card) {
  const a = s.actors[id];
  return a?.room && color !== "wait"
    ? legalRoutes(s, a.room, a.side, color)
    : [];
}
export function publicProps(s: GameState) {
  return s.props.map((p) => ({ ...p, kind: p.revealed ? p.kind : null }));
}
export function carrySteps(
  s: GameState,
  route: Array<{ pathId: string; to: string }>,
) {
  let from = s.actors[s.killerId].room!;
  for (const step of route) {
    if (
      !legalRoutes(s, from, "killer", undefined, true).some(
        (r) => r.pathId === step.pathId && r.to === step.to,
      )
    )
      return [];
    from = step.to;
  }
  return route.length < 4
    ? legalRoutes(s, from, "killer", undefined, true)
    : [];
}
/** 物品按钮的文字 */
export function itemLabel(s: GameState, c: Command) {
  const name = itemNames[String(c.itemId)] ?? "物品";
  const who = (id: unknown) => actorName(String(id));
  if (c.propId) return `使用${name}：${propLabel(s, String(c.propId))} +1 进度`;
  if (c.itemId === "first_aid_kit") return `使用${name}：${who(c.targetId)}变为健康`;
  if (c.option === "reveal") return `使用${name}：翻开至多 3 个道具`;
  if (c.option === "draw") return `使用${name}：再抽 1 张物品牌`;
  if (c.option === "killer_cards") return `使用${name}：翻开杀手的所有移动牌`;
  if (c.itemId === "flashlight") return `使用${name}：阻止杀手交互`;
  if (c.option === "block") return `使用${name}：阻止杀手进入`;
  if (c.option === "wall")
    return `使用${name}：移除墙壁（${pathLabel(s, String(c.pathId))}）`;
  if (c.option === "reroll")
    return `使用${name}：重掷第 ${Number(c.index) + 1} 颗骰子`;
  if (c.option === "blood") {
    const n = { broken_key: 1, dull_key: 2, skeleton_key: 3 }[String(c.itemId)];
    return `使用${name}：${who(c.targetId)}获得 ${n} 血点`;
  }
  return "使用" + name;
}
/** 某角色此刻能用的物品（全部是完整命令，可直接做成按钮）。
 * 联机时，持有者不在自己的回合也可以用（"在任意逃生者的回合中""任何时候"），
 * 界面应在"我的物品"处单独调用它，而不只依赖 getControls。 */
export function itemActions(s: GameState, actorId: string): ControlAction[] {
  return itemCommands(s, actorId)
    .filter((c) => canCommand(s, c))
    .map((command) => ({
      label: itemLabel(s, command),
      command,
      targetId:
        typeof command.propId === "string" ? command.propId : undefined,
    }));
}
export function getControls(s: GameState) {
  const actorId = currentActor(s);
  const actions: ControlAction[] = [];
  const add = (
    label: string,
    command: Command,
    extra: Partial<ControlAction> = {},
  ) => {
    if (canCommand(s, command)) actions.push({ label, command, ...extra });
  };
  if (!actorId) return { actorId, actions, hand: [] as Card[], planCount: 0 };
  const base = { actorId },
    a = s.actors[actorId];
  if (s.window) {
    add("不使用技能，继续", { type: "PASS", ...base });
    actions.push(...itemActions(s, actorId));
  }
  else if (s.choice) {
    const c = s.choice;
    if (c.kind === "REVEAL")
      for (const p of s.props)
        add(
          "翻开" + propLabel(s, p.id),
          { type: "SELECT", ...base, propId: p.id },
          { targetId: p.id, roomId: p.room },
        );
    if (c.kind === "KEEP")
      s.roll?.faces.forEach((_, index) =>
        add("保留第" + (index + 1) + "颗骰子", {
          type: "SELECT",
          ...base,
          index,
        }),
      );
    if (c.kind === "KEEP_ITEM")
      for (const option of ["old", "new"])
        add(option === "old" ? "保留原有物品" : "保留新物品", {
          type: "SELECT",
          ...base,
          option,
        });
    if (c.kind === "BONUS_CARD")
      for (const card of s.hands[a.ownerId])
        add("奖励行动：" + cardNames[card], { type: "SELECT", ...base, card });
    if (c.kind === "OPTIONAL_MOVE") {
      add("留在原地", { type: "SELECT", ...base });
      if (a.room)
        for (const r of legalRoutes(s, a.room, a.side))
          add(
            "移动至" + roomName(s, r.to),
            { type: "SELECT", ...base, ...r },
            { roomId: r.to, pathId: r.pathId },
          );
    }
    if (c.kind === "PHANTASM")
      add("获得1血点", { type: "SELECT", ...base, option: "blood" });
    if (c.kind === "PHANTASM_TARGET")
      for (const t of phantasmTargets(s))
        add(
          actionNames[t.action] + actorName(t.targetId),
          { type: "SELECT", ...base, ...t },
          { targetId: t.targetId, roomId: s.actors[t.targetId].room! },
        );
    if (c.kind === "CARRY_REROUTE") {
      if (a.room)
        for (const r of legalRoutes(s, a.room, "killer", undefined, true))
          add(
            "搬运至" + roomName(s, r.to),
            { type: "SELECT", ...base, ...r },
            { roomId: r.to, pathId: r.pathId },
          );
      add("停下（被搬运者在这里挣脱，除非这里有空钩子）", { type: "SELECT", ...base });
    }
    if (c.kind === "SPAWN_ROLL")
      add("掷骰决定出生空间", { type: "SELECT", ...base });
    if (c.kind === "DOCTOR_SHOCK") {
      add("支付1血点", { type: "SELECT", ...base, option: "pay" });
      add(
        a.madness ? "变为受伤（已神经紊乱）" : "获得神经紊乱",
        { type: "SELECT", ...base, option: "effect" },
      );
    }
    if (c.kind === "REPLAN")
      for (const card of s.hands[a.ownerId])
        add("重新放置：" + cardNames[card], { type: "SELECT", ...base, card });
    if (c.kind === "MAP_REVEAL") {
      for (const p of s.props)
        add(
          "翻开" + propLabel(s, p.id),
          { type: "SELECT", ...base, propId: p.id },
          { targetId: p.id, roomId: p.room },
        );
      add("翻开完毕", { type: "SELECT", ...base });
    }
  } else if (s.phase === "SETUP") {
    for (const p of s.props)
      add(
        "翻开" + propLabel(s, p.id),
        { type: "SETUP_REVEAL", ...base, propId: p.id },
        { targetId: p.id, roomId: p.room },
      );
  } else if (s.phase === "BONUS_OFFER") {
    add("放弃奖励行动", { type: "KILLER_BONUS", ...base, accept: false });
    add("支付血点，获得奖励行动", {
      type: "KILLER_BONUS",
      ...base,
      accept: true,
    });
  } else if (s.phase === "ACTING" && s.turn?.stage === "MOVE") {
    actions.push(...itemActions(s, actorId));
    const routes = previewRoutes(s, actorId, s.turn.card!);
    if (!routes.length)
      add(
        s.turn.card === "wait"
          ? "等待并进入互动"
          : "没有合法路线，结算移动失败",
        { type: "MOVE", ...base },
      );
    for (const r of routes)
      add(
        "移动至" + roomName(s, r.to),
        { type: "MOVE", ...base, ...r },
        { roomId: r.to, pathId: r.pathId },
      );
  } else if (s.phase === "ACTING" && s.turn?.stage === "INTERACT") {
    for (const target of [
      ...s.props
        .filter((p) => p.room === a.room && p.revealed && !p.removed)
        .map((p) => p.id),
      ...Object.keys(s.actors),
    ])
      for (const action of Object.keys(actionNames).filter(
        (k) => k !== "power" && k !== "pallet",
      )) {
        const command = { type: "INTERACT", ...base, action, targetId: target };
        try {
          validateInteraction(s, command);
        } catch {
          continue;
        }
        add(
          actionNames[action] +
            (s.actors[target] ? actorName(target) : propLabel(s, target)),
          command,
          {
            targetId: target,
            roomId:
              s.actors[target]?.room ??
              s.props.find((p) => p.id === target)?.room,
          },
        );
      }
    for (const p of s.props.filter(
      (p) =>
        p.revealed && p.kind === "pallet" && p.room === a.room && !p.removed,
    ))
      for (const pathId of Object.keys(s.paths))
        add(
          "放置木板：" + pathLabel(s, pathId),
          {
            type: "INTERACT",
            ...base,
            action: "pallet",
            targetId: p.id,
            pathId,
          },
          { targetId: p.id, pathId, roomId: p.room },
        );
    actions.push(...itemActions(s, actorId));
    add("结束本次行动", { type: "END_TURN", ...base });
  }
  return {
    actorId,
    actions,
    hand: s.hands[a.ownerId],
    planCount: a.side === "killer" ? 2 : 1,
  };
}
export function pathLabel(s: GameState, id: string) {
  const p = s.paths[id];
  return p
    ? `${cardNames[p.color]} · ${p.rooms.map((r) => roomName(s, r)).join(" ↔ ")}`
    : "路线";
}
export interface Field {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  optional?: boolean;
  number?: boolean;
  boolean?: boolean;
}
export function commandFields(s: GameState, kind: string, id: string): Field[] {
  const rooms = maps.maps
    .find((m) => m.id === s.mapId)!
    .nodes.map((n) => ({ value: n.id, label: n.name_zh! }));
  const actors = Object.keys(s.actors).map((value) => ({
    value,
    label: actorName(value),
  }));
  const props = s.props
    .filter((p) => !p.removed)
    .map((p) => ({ value: p.id, label: propLabel(s, p.id) }));
  const paths = Object.keys(s.paths).map((value) => ({
    value,
    label: pathLabel(s, value),
  }));
  const who = currentActor(s)!;
  const hand = s.hands[s.actors[who].ownerId].map((value) => ({
    value,
    label: cardNames[value],
  }));
  const field = (
    key: string,
    label: string,
    options: Field["options"],
    extra: Partial<Field> = {},
  ): Field => ({ key, label, options, ...extra });
  const target = () => field("targetId", "目标角色", actors);
  const path = () => field("pathId", "路线", paths);
  const to = () => field("to", "目的房间", rooms);
  const index = () =>
    field(
      "index",
      "第几颗骰子／计划牌",
      [0, 1, 2, 3].map((n) => ({
        value: String(n),
        label: "第" + (n + 1) + "个",
      })),
      { number: true },
    );
  const card = () => field("card", "移动牌", hand);
  const option = (pairs: string[][]) =>
    field(
      "option",
      "选择",
      pairs.map(([value, label]) => ({ value, label })),
    );
  const interact = () => [
    field(
      "action",
      "交互",
      Object.entries(actionNames)
        .filter(([v]) => v !== "power")
        .map(([value, label]) => ({ value, label })),
    ),
    field("targetId", "交互目标", [...props, ...actors]),
    field("pathId", "木板路线（其他交互留空）", paths, { optional: true }),
  ];
  if (kind === "REVISE_INTERACTION") return interact();
  if (kind === "PHANTASM")
    return [
      target(),
      field(
        "action",
        "交互",
        Object.entries(actionNames).map(([value, label]) => ({ value, label })),
      ),
    ];
  if (kind === "POWER") {
    if (id === "trapper")
      return [
        path(),
        field("removeTrapId", "先移除已有捕兽夹", paths, { optional: true }),
      ];
    if (id === "wraith") return [to()];
    if (id === "hillbilly")
      return [
        card(),
        path(),
        to(),
        field("targetId", "受伤的逃生者（目的空间没有人时留空）", actors, {
          optional: true,
        }),
      ];
    if (id === "nurse") return [path(), to()];
    if (id === "doctor") return [to()];
    return [];
  }
  switch (id) {
    case "board_dwight_1":
      return [
        target(),
        ...interact().map((f) =>
          f.key === "targetId" ? { ...f, key: "interactionTargetId" } : f,
        ),
      ];
    case "board_dwight_2":
    case "board_claudette_1":
    case "board_nurse_1":
    case "board_doctor_2":
      return [target()];
    case "board_claudette_2":
      return [
        target(),
        option([
          ["give", "给予1血点"],
          ["take", "拿取1血点"],
        ]),
        field(
          "consent",
          "已向目标玩家确认自愿",
          [
            { value: "false", label: "尚未确认" },
            { value: "true", label: "对方已同意" },
          ],
          { boolean: true },
        ),
      ];
    case "board_jake_1":
    case "board_ace_1":
    case "board_hillbilly_1":
      return [index()];
    case "board_jake_2":
      return [field("propId", "乌鸦", props), to()];
    case "board_jake_3":
      return [
        option([
          ["blood", "获得1血点"],
          ["bonus", "支付2血点获得奖励行动"],
        ]),
      ];
    case "board_nea_1":
    case "board_meg_1":
    case "board_feng_min_1":
    case "board_feng_min_2":
    case "board_trapper_1":
    case "board_trapper_3":
      return [path(), to()];
    case "board_nea_2":
      return [path()];
    case "board_ace_2":
      return [
        field("propId", "本房间道具", props),
        field("otherPropId", "相连房间同类别道具", props),
      ];
    case "board_meg_3":
    case "board_hag_3":
      return [field("propId", "目标道具", props)];
    case "board_feng_min_3":
      return interact();
    case "board_wraith_1":
    case "board_hag_1":
      return [card()];
    case "board_wraith_3":
      return [target()];
    case "board_hillbilly_3":
      return [index(), card()];
    default:
      return [];
  }
}
export function availableSkills(s: GameState, id: string) {
  return s.actors[id].perks.map((pid) => {
    const p = boardPerks.get(pid)!;
    return {
      id: pid,
      name: p.name_zh,
      cost: p.bloodpoint_cost,
      text: p.text_original_zh,
      status: p.status,
      available:
        !!s.window?.eligible[id]?.includes(pid) && !s.usedPerks.includes(pid),
    };
  });
}

/**
 * 把需要多个参数的技能 / 杀手力量 / 妖巫传送 / 改选交互，直接列成"完整命令"按钮（2026-10-20）。
 * 界面一次点击即可提交，不再逐个字段选择。只列引擎 canCommand 通过的组合；
 * 组合太多或需要别人表态（医生电火花）时返回 null，界面退回逐项选择。
 */
export function paramActions(
  s: GameState,
  kind: string,
  id: string,
): ControlAction[] | null {
  const actorId = currentActor(s);
  if (!actorId) return null;
  const base: Command =
    kind === "PERK"
      ? { type: "USE_PERK", actorId, perkId: id }
      : kind === "POWER"
        ? { type: "INTERACT", actorId, action: "power" }
        : kind === "PHANTASM"
          ? { type: "SELECT", actorId, option: "teleport" }
          : { type: "REVISE_INTERACTION", actorId };
  const fields = commandFields(s, kind, id);
  if (!fields.length) return canCommand(s, base) ? [{ label: "确认", command: base }] : [];
  const label = (c: Payload) =>
    fields
      .map((f) => {
        const v = f.key.startsWith("choices.") ? undefined : c[f.key];
        if (v === undefined || v === "") return null;
        if (f.key === "consent") return "（对方已同意）";
        return f.options.find((o) => o.value === String(v))?.label ?? null;
      })
      .filter((x, i, arr) => x && x !== arr[i - 1])
      .join(" · ");
  const cands = special(s, kind, id, actorId);
  let list: Payload[];
  if (cands) list = cands;
  else {
    if (fields.some((f) => f.key.startsWith("choices."))) return null;
    let size = 1;
    for (const f of fields) size *= f.options.length + (f.optional ? 1 : 0);
    if (size > 400) return null;
    list = [{}];
    for (const f of fields) {
      const vals: unknown[] = f.options.map((o) =>
        f.number ? Number(o.value) : f.boolean ? o.value === "true" : o.value,
      );
      if (f.key === "consent") vals.splice(0, vals.length, true);
      if (f.optional) vals.unshift(undefined);
      list = list.flatMap((p) =>
        vals.map((v) => (v === undefined ? p : { ...p, [f.key]: v })),
      );
    }
  }
  const out: ControlAction[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    const command = { ...base, ...p } as Command;
    const key = JSON.stringify(command);
    if (seen.has(key) || !canCommand(s, command)) continue;
    seen.add(key);
    out.push({
      label: label(p) || "确认",
      command,
      targetId:
        typeof p.interactionTargetId === "string"
          ? p.interactionTargetId
          : typeof p.targetId === "string"
            ? p.targetId
            : typeof p.propId === "string"
              ? p.propId
              : undefined,
      roomId: typeof p.to === "string" ? p.to : undefined,
      pathId: typeof p.pathId === "string" ? p.pathId : undefined,
    });
  }
  return out;
}

/** 某角色在当前空间可以发起的全部交互参数（不含 power） */
function interactionParams(s: GameState, who: string): Payload[] {
  const a = s.actors[who];
  if (!a?.room) return [];
  const out: Payload[] = [];
  const targets = [
    ...s.props.filter((p) => p.room === a.room && p.revealed && !p.removed).map((p) => p.id),
    ...Object.keys(s.actors),
  ];
  for (const targetId of targets)
    for (const action of Object.keys(actionNames)) {
      if (action === "power") continue;
      if (action === "pallet") {
        for (const pathId of Object.keys(s.paths))
          if (s.paths[pathId].rooms.includes(a.room)) out.push({ action, targetId, pathId });
        continue;
      }
      try {
        validateInteraction(s, { actorId: who, action, targetId });
        out.push({ action, targetId });
      } catch {}
    }
  return out;
}

/** 参数组合太多的几种，按规则缩小候选范围；最终仍由 canCommand 判定合法 */
function special(s: GameState, kind: string, id: string, actorId: string): Payload[] | null {
  const a = s.actors[actorId];
  const roomsOf = () => maps.maps.find((m) => m.id === s.mapId)!.nodes.map((n) => n.id);
  if (kind === "REVISE_INTERACTION") {
    const who = String(s.pendingAction?.actorId ?? actorId);
    return interactionParams(s, who);
  }
  if (kind === "PHANTASM")
    return s.survivors.flatMap((targetId) =>
      ["attack", "pickup"].map((action) => ({ targetId, action })),
    );
  if (kind === "POWER") {
    if (!a?.room) return [];
    if (id === "trapper") {
      const traps = Object.values(s.paths).filter((p) => p.bearTrap).map((p) => p.id);
      const adj = Object.values(s.paths).filter((p) => p.rooms.includes(a.room!)).map((p) => p.id);
      return adj.flatMap((pathId) =>
        traps.length < 4 ? [{ pathId }] : traps.map((removeTrapId) => ({ pathId, removeTrapId })),
      );
    }
    if (id === "nurse")
      return legalRoutes(s, a.room, "killer", undefined, false, true, true).map((r) => ({
        pathId: r.pathId,
        to: r.to,
      }));
    if (id === "hillbilly")
      return s.hands[a.ownerId]
        .filter((c) => c !== "wait")
        .flatMap((card) =>
          legalRoutes(s, a.room!, "killer", card).flatMap((r) => {
            const present = s.survivors.filter(
              (v) => s.actors[v].room === r.to && !s.actors[v].hookId && !s.actors[v].lockerId,
            );
            return [
              ...present.map((targetId) => ({ card, pathId: r.pathId, to: r.to, targetId })),
              { card, pathId: r.pathId, to: r.to },
            ];
          }),
        );
    if (id === "wraith") return roomsOf().map((to) => ({ to }));
    if (id === "doctor")
      return roomsOf()
        .filter((to) => to === a.room || connected(s, a.room!, to))
        .map((to) => ({ to }));
    return null;
  }
  if (kind !== "PERK") return null;
  switch (id) {
    case "board_dwight_1":
      return s.survivors
        .filter((t) => t !== actorId)
        .flatMap((targetId) =>
          interactionParams(s, targetId).map((p) => ({
            targetId,
            action: p.action,
            interactionTargetId: p.targetId,
            ...(p.pathId ? { pathId: p.pathId } : {}),
          })),
        );
    case "board_feng_min_3":
      return interactionParams(s, actorId);
    case "board_jake_2":
      return s.props
        .filter((p) => p.kind === "crow" && p.room === a?.room && p.revealed && !p.removed)
        .flatMap((p) => roomsOf().map((to) => ({ propId: p.id, to })));
    case "board_ace_2": {
      const here = s.props.filter((p) => p.room === a?.room && !p.removed);
      return here.flatMap((p) =>
        s.props
          .filter((q) => q.category === p.category && q.room !== p.room && !q.removed)
          .map((q) => ({ propId: p.id, otherPropId: q.id })),
      );
    }
    case "board_claudette_2":
      return s.survivors.flatMap((targetId) =>
        ["give", "take"].map((option) => ({ targetId, option, consent: true })),
      );
    default:
      return null;
  }
}
