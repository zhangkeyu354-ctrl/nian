import type { GameState, Payload, Command } from "../../shared/src/types.ts";
import {
  actor,
  active,
  requireThat,
  text,
  number,
  spend,
  gain,
  wounded,
  healthy,
  moveEffect,
  teleport,
  enqueue,
  beginRoll,
  log,
  prop,
  card,
  connected,
  signal,
  RuleError,
  validateInteraction,
} from "./engine.ts";
const nearby = (s: GameState, a: string, b: string) =>
  actor(s, a).room === actor(s, b).room ||
  connected(s, actor(s, a).room!, actor(s, b).room!);
export function matches(
  s: GameState,
  id: string,
  pid: string,
  event: string,
  c: Payload,
): boolean {
  const a = actor(s, id),
    who = typeof c.actorId === "string" ? s.actors[c.actorId] : null;
  const own = who?.id === id;
  if (
    event === "BEFORE_ROLL" &&
    !["generator", "exit", "locker", "heal", "totem"].includes(
      String(c.checkKind),
    )
  )
    return false;
  switch (pid) {
    case "board_dwight_1":
    case "board_ace_2":
      return event === "WOULD_INTERACT" && own;
    case "board_dwight_2":
      return (
        event === "AFTER_MOVE" &&
        who?.side === "survivor" &&
        !!c.pathId &&
        (own || a.room === c.from)
      );
    case "board_dwight_3":
      return (
        event === "BEFORE_ROLL" &&
        !!who &&
        who.id !== id &&
        nearby(s, id, who.id)
      );
    case "board_meg_1":
      return event === "AFTER_MOVE" && own && c.normal === true;
    case "board_meg_2":
    case "board_hag_2":
      return event === "CLEANUP_START" && s.generatorsThisRound > 0;
    case "board_meg_3":
      return (
        event === "AFTER_MOVE" && who?.side === "killer" && a.room === who.room
      );
    case "board_claudette_1":
      // AUDIT-B01：卡文"在你的回合中移动之前或之后"——跟随别人移动（领袖群雄）等不算
      return (
        (event === "BEFORE_OWN_MOVE" || event === "AFTER_MOVE") &&
        own &&
        s.phase === "ACTING" &&
        s.turn?.actorId === id
      );
    case "board_claudette_2":
    case "board_claudette_3":
      return event === "OWN_TURN_START" && own;
    case "board_jake_1":
      return (
        event === "AFTER_ROLL" &&
        !!who &&
        nearby(s, id, who.id) &&
        !!s.roll?.classes.includes("failure")
      );
    case "board_jake_2":
      return event === "WOULD_INTERACT" && own;
    case "board_jake_3":
      return event === "AFTER_SABOTAGE" && own;
    case "board_nea_1":
      return event === "WOULD_INTERACT" && own;
    case "board_nea_2":
    case "board_ace_1":
      return event === "OWN_TURN_START" && who?.side === "survivor";
    case "board_nea_3":
      return event === "AFTER_CHEST" && own;
    case "board_ace_3":
      return event === "OWN_TURN_END" && own;
    case "board_feng_min_1":
      return event === "AFTER_MOVE" && own;
    case "board_feng_min_2":
      return event === "BLOCKER_DESTROYED" || event === "GENERATOR_DAMAGED";
    case "board_feng_min_3":
      return event === "GENERATOR_FAILURE" && own;
    case "board_trapper_1":
    case "board_trapper_3":
      return event === "AFTER_ATTACK" && own;
    case "board_trapper_2":
      return event === "BEFORE_ROLL" && !!who && nearby(s, id, who.id);
    case "board_wraith_1":
    case "board_wraith_3":
    case "board_hillbilly_1":
      return event === "PLANNING_END";
    case "board_wraith_2":
      return event === "AFTER_SACRIFICE" && own;
    case "board_hillbilly_2":
      return event === "BEFORE_PALLET_MOVE" && own;
    case "board_hillbilly_3":
      return event === "GENERATOR_COMPLETED";
    case "board_nurse_1":
    case "board_hag_1":
    case "board_hag_3":
      return event === "PLANNING_START";
    case "board_nurse_2":
      return event === "BEFORE_ROLL" && who?.health === "wounded";
    case "board_nurse_3":
      return event === "SURVIVOR_BECOMES_HEALTHY";
    case "board_doctor_1":
      return (
        event === "CLEANUP_START" &&
        !Object.values(s.actors).some((a) => a.hookId)
      );
    case "board_doctor_2":
      return event === "GENERATOR_DAMAGED" && own;
    case "board_doctor_3":
      return event === "ITEM_USED" && !!who && nearby(s, id, who.id);
    default:
      throw new RuleError("CHECK_REQUIRED", pid);
  }
}
export function applyAbility(
  s: GameState,
  id: string,
  pid: string,
  c: Command,
  context: Payload,
) {
  const a = actor(s, id);
  const target = () => {
    const t = actor(s, text(c, "targetId"));
    requireThat(
      t.side === "survivor" && active(t),
      "target survivor not available",
    );
    return t;
  };
  const move = (who = id, opts: Parameters<typeof moveEffect>[4] = {}) =>
    enqueue(s, {
      kind: "MOVE_EFFECT",
      actorId: who,
      pathId: text(c, "pathId"),
      to: text(c, "to"),
      opts,
    });
  switch (pid) {
    case "board_dwight_1": {
      const t = target();
      requireThat(
        t.id !== id && nearby(s, id, t.id) && s.pendingAction,
        "replace interaction target",
      );
      s.pendingAction = {
        ...c,
        actorId: t.id,
        action: text(c, "action"),
        targetId: c.interactionTargetId,
      };
      break;
    }
    case "board_dwight_2": {
      const mover = actor(s, context.actorId);
      const follower = mover.id === id ? target() : a;
      requireThat(
        follower.id !== mover.id && follower.room === context.from,
        "follower must start with mover",
      );
      enqueue(s, {
        kind: "MOVE_EFFECT",
        actorId: follower.id,
        pathId: text(context, "pathId"),
        to: text(context, "to"),
      });
      break;
    }
    case "board_dwight_3":
      requireThat(s.roll, "no check");
      s.roll.die = "skill_check";
      s.roll.count = 2;
      break;
    case "board_claudette_1": {
      const t = target();
      requireThat(
        t.id !== id && t.room === a.room,
        "botany same room other survivor",
      );
      enqueue(s, {
        kind: "CHECK",
        actorId: id,
        checkKind: "botany",
        targetId: t.id,
        die: "danger",
      });
      break;
    }
    case "board_claudette_2": {
      const t = target();
      requireThat(
        t.id !== id && c.consent === true,
        "willing other survivor required",
      );
      if (c.option === "give") {
        spend(s, id, 1);
        gain(s, t.id, 1);
      } else {
        requireThat(c.option === "take", "give/take");
        spend(s, t.id, 1);
        gain(s, id, 1);
      }
      break;
    }
    case "board_claudette_3":
      enqueue(s, {
        kind: "CHECK",
        actorId: id,
        checkKind: "self_heal",
        targetId: id,
        die: "danger",
      });
      break;
    case "board_jake_1": {
      requireThat(s.roll, "no check");
      const i = number(c, "index");
      requireThat(s.roll.classes[i] === "failure", "selected die not failure");
      s.roll.classes[i] = "success";
      break;
    }
    case "board_jake_2": {
      const p = prop(s, text(c, "propId"));
      requireThat(
        p.kind === "crow" && p.room === a.room && p.revealed,
        "crow in own room",
      );
      const room = text(c, "to");
      requireThat(
        Object.values(s.paths).some((p) => p.rooms.includes(room)),
        "unknown room",
      );
      p.room = room;
      s.pendingAction = null;
      break;
    }
    case "board_jake_3":
      if (c.option === "blood") gain(s, id, 1);
      else {
        requireThat(c.option === "bonus", "bonus/blood");
        spend(s, id, 2);
        enqueue(s, { kind: "BONUS", actorId: id });
      }
      break;
    case "board_nea_1":
      s.pendingAction = null;
      enqueue(
        s,
        {
          kind: "MOVE_EFFECT",
          actorId: id,
          pathId: text(c, "pathId"),
          to: text(c, "to"),
          opts: { reverse: true },
        },
        { kind: "GAIN", actorId: id, amount: 1 },
      );
      break;
    case "board_nea_2": {
      const p = s.paths[text(c, "pathId")];
      requireThat(p && p.wall && !p.temporaryWall && s.turn, "wall required");
      p.temporaryWall = true;
      p.temporaryWallUntil = s.turn.token;
      break;
    }
    case "board_nea_3": {
      const p = s.props.find((p) => p.id === context.propId);
      requireThat(p?.kind === "chest", "chest context");
      p.removed = false;
      break;
    }
    case "board_ace_1": {
      const i = number(c, "index");
      requireThat(s.plans[s.killerId]?.[i], "killer planned card");
      log(s, "PLANNED_CARD_REVEALED", {
        actorId: s.killerId,
        index: i,
        card: s.plans[s.killerId][i],
      });
      break;
    }
    case "board_ace_2": {
      const p = prop(s, text(c, "propId")),
        q = prop(s, text(c, "otherPropId"));
      requireThat(
        p.room === a.room &&
          connected(s, p.room, q.room) &&
          p.category === q.category,
        "same category, adjacent props",
      );
      for (const v of [p, q])
        requireThat(
          !(v.kind === "generator" && v.progress > 0) &&
            !Object.values(s.actors).some(
              (x) => x.hookId === v.id || x.lockerId === v.id,
            ),
          "occupied/progress prop",
        );
      [p.room, q.room] = [q.room, p.room];
      // 若把自己正要交互的道具换走了，同样的交互改为对换进来的那个道具（合法时）；
      // 否则可以在同一时机改选交互对象（REVISE_INTERACTION）
      const pa = s.pendingAction;
      if (pa && pa.actorId === id && pa.targetId === p.id) {
        const next = { ...pa, targetId: q.id };
        try {
          validateInteraction(s, next);
          s.pendingAction = next;
        } catch {}
      }
      break;
    }
    case "board_ace_3":
      enqueue(
        s,
        { kind: "BONUS", actorId: id },
        { kind: "GAIN", actorId: s.killerId, amount: 2 },
      );
      break;
    case "board_meg_2":
      enqueue(s, { kind: "BONUS", actorId: id });
      break;
    case "board_meg_3": {
      const p = prop(s, text(c, "propId"));
      requireThat(
        p.kind === "locker" &&
          p.revealed &&
          p.room === a.room &&
          !Object.values(s.actors).some((x) => x.lockerId === p.id),
        "unoccupied revealed locker",
      );
      a.lockerId = p.id;
      break;
    }
    case "board_feng_min_2":
      move();
      break;
    case "board_feng_min_3": {
      const targetId = text(c, "targetId");
      requireThat(
        targetId !== context.propId,
        "technician must use other target",
      );
      s.pendingAction = {
        ...c,
        actorId: id,
        action: text(c, "action"),
        targetId,
      };
      enqueue(s, { kind: "DO_INTERACTION" });
      break;
    }
    case "board_trapper_1": {
      const t = actor(s, context.targetId);
      enqueue(s, {
        kind: "MOVE_EFFECT",
        actorId: t.id,
        pathId: text(c, "pathId"),
        to: text(c, "to"),
        opts: { ignore: true, destroy: true },
      });
      break;
    }
    case "board_trapper_2":
    case "board_nurse_2":
      requireThat(s.roll, "no check");
      s.roll.die = "danger";
      s.roll.count = 1;
      break;
    case "board_trapper_3":
      move();
      break;
    case "board_wraith_1":
      requireThat(s.plans[id]?.length === 2, "requires two planned cards");
      s.plans[id].push(card(s, a, c.card));
      s.killerBonusForbidden = true;
      break;
    case "board_wraith_2": {
      const t = actor(s, context.targetId);
      gain(s, t.id, -1);
      gain(s, id, 1);
      break;
    }
    case "board_hillbilly_1": {
      const i = number(c, "index");
      requireThat(s.plans[id]?.[i], "planned card index");
      log(s, "PLANNED_CARD_REVEALED", {
        actorId: id,
        index: i,
        card: s.plans[id][i],
      });
      gain(s, id, 1);
      break;
    }
    case "board_hillbilly_2": {
      const p = s.paths[text(context, "pathId")];
      requireThat(p?.pallet, "pallet context");
      p.pallet = false;
      log(s, "PALLET_DESTROYED", { actorId: id, pathId: p.id });
      signal(s, "BLOCKER_DESTROYED", {
        actorId: id,
        kind: "pallet",
        pathId: p.id,
      });
      break;
    }
    case "board_hillbilly_3": {
      const i = number(c, "index");
      requireThat(s.plans[id]?.[i], "planned index");
      requireThat(
        !s.turn || s.turn.actorId !== id || i > s.turn.index,
        "cannot replace already resolved card",
      );
      const next = card(s, a, c.card);
      s.hands[a.ownerId].push(s.plans[id][i]);
      s.plans[id][i] = next;
      break;
    }
    case "board_nurse_1": {
      const t = target();
      requireThat(t.health === "wounded", "wounded survivor");
      if (!s.publicPlans.includes(t.id)) s.publicPlans.push(t.id);
      break;
    }
    case "board_nurse_3":
      gain(s, id, 2);
      break;
    case "board_hag_2":
      enqueue(s, { kind: "BONUS", actorId: id });
      break;
    case "board_hag_3": {
      const p = prop(s, text(c, "propId"));
      requireThat(
        p.kind === "generator" &&
          p.progress > 0 &&
          !Object.values(s.actors).some(
            (a) => a.side === "survivor" && active(a) && a.room === p.room,
          ),
        "generator must have progress and no survivor",
      );
      p.progress--;
      break;
    }
    case "board_doctor_1":
      gain(s, id, 1);
      break;
    case "board_doctor_2": {
      const t = target();
      requireThat(nearby(s, id, t.id), "overcharge range");
      wounded(s, t.id);
      break;
    }
    case "board_doctor_3": {
      // 压迫性气场：使用物品的逃生者掷危险骰，失败则该物品不产生效果（已弃掉）
      const holder = actor(s, context.actorId);
      requireThat(holder.side === "survivor", "item user");
      enqueue(s, {
        kind: "CHECK",
        actorId: holder.id,
        checkKind: "oppressive",
        targetId: holder.id,
        die: "danger",
      });
      break;
    }
    default:
      throw new RuleError("CHECK_REQUIRED", `${pid}: Q11 / Phase4`);
  }
}
export function applyPower(s: GameState, c: Payload) {
  const a = actor(s, s.killerId);
  switch (a.id) {
    case "trapper": {
      if (c.removeTrapId !== undefined) {
        const old = s.paths[text(c, "removeTrapId")];
        requireThat(old?.bearTrap, "existing trap required");
        old.bearTrap = false;
      }
      const p = s.paths[text(c, "pathId")];
      requireThat(
        p &&
          p.rooms.includes(a.room!) &&
          !p.pallet &&
          (!p.wall || p.temporaryWall) &&
          !p.bearTrap &&
          !(s.entity?.kind === "path" && s.entity.id === p.id),
        "clear adjacent path",
      );
      requireThat(
        Object.values(s.paths).filter((p) => p.bearTrap).length < 4,
        "no bear trap components",
      );
      p.bearTrap = true;
      log(s, "BEAR_TRAP_PLACED", { pathId: p.id });
      break;
    }
    case "wraith": {
      const to = text(c, "to");
      requireThat(
        to !== a.room && !connected(s, a.room!, to),
        "wraith requires nonconnected room",
      );
      teleport(s, a.id, to);
      break;
    }
    case "hillbilly": {
      requireThat(c.card !== "wait", "chainsaw cannot use wait");
      const played = card(s, a, c.card);
      const p = s.paths[text(c, "pathId")];
      requireThat(
        p &&
          p.color === played &&
          (!p.wall || p.temporaryWall) &&
          !p.pallet &&
          !p.bearTrap,
        "chainsaw clear matching path",
      );
      // 卡文"你进入的空间里的一位逃生者变为受伤"：目的空间有逃生者时必须选其中一位；
      // 没有逃生者时电锯只用来移动（人物板说明：电锯也可以提供额外的机动性）。
      const present = s.survivors.filter(
        (id) => active(s.actors[id]) && s.actors[id].room === c.to,
      );
      let v: ReturnType<typeof actor> | null = null;
      if (present.length) {
        v = actor(s, text(c, "targetId"));
        requireThat(present.includes(v.id), "chainsaw survivor destination");
      } else
        requireThat(c.targetId === undefined, "no survivor in destination");
      // 鞭炮可能先让逃生者响应；被阻止时不造成伤害
      const moved = moveEffect(s, a.id, p.id, text(c, "to"));
      if (!v) break;
      if (moved === "moved") wounded(s, v.id);
      else if (moved === "deferred")
        s.jobs.splice(2, 0, {
          kind: "CHAINSAW_HIT",
          targetId: v.id,
          room: text(c, "to"),
        });
      break;
    }
    case "nurse":
      moveEffect(s, a.id, text(c, "pathId"), text(c, "to"), {
        ignore: true,
        reverse: true,
      });
      break;
    case "hag":
      requireThat(
        !s.phantasms.includes(a.room!) && s.phantasms.length < 7,
        "one phantasm per room/7 components",
      );
      s.phantasms.push(a.room!);
      if (
        s.props.some(
          // 只算已翻开的厄咒图腾（面朝下的道具不能算，否则会泄露它是什么）
          (p) =>
            p.room === a.room &&
            p.kind === "hex_totem" &&
            p.revealed &&
            !p.removed,
        )
      )
        gain(s, a.id, 1);
      break;
    case "doctor": {
      const room = text(c, "to");
      requireThat(
        room === a.room || connected(s, a.room!, room),
        "doctor range",
      );
      const choices = c.choices as Record<string, string> | undefined;
      requireThat(
        choices && typeof choices === "object",
        "each survivor chooses response",
      );
      for (const v of Object.values(s.actors).filter(
        (v) => v.side === "survivor" && v.room === room && active(v),
      )) {
        if (choices[v.id] === "pay") spend(s, v.id, 1);
        else {
          requireThat(choices[v.id] === "effect", "pay/effect choice");
          if (v.madness) wounded(s, v.id);
          else v.madness = true;
        }
      }
      break;
    }
    default:
      throw new RuleError("CHECK_REQUIRED", "non-base killer");
  }
  log(s, "POWER_USED", { actorId: a.id }, ["U02:接受的中文版人物板"]);
}
