import { TapButton } from "./TapButton.tsx";
import React, { useEffect, useState } from "react";
import type {
  Card,
  Command,
  GameState,
} from "../../../packages/shared/src/types.ts";
import {
  actorName,
  roomName,
  getControls,
  availableSkills,
  commandFields,
  cardNames,
  boardVisuals,
  itemActions,
  canCommand,
  paramActions,
} from "../../../packages/game-engine/src/index.ts";
import { chars } from "../../../packages/game-engine/src/data.ts";
import { itemInfo, eventText, phases } from "./labels.ts";
import { Token } from "./Token.tsx";
import { MotionIcon } from "./MotionIcon.tsx";
import { SettingsButton } from "./Settings.tsx";
import type { NetBinding } from "./net.ts";
import { Illustration } from "./Illustration.tsx";
import { skillRouteActions } from "./ui-actions.ts";

export function usePhone() {
  const query = "(max-width: 700px), (pointer: coarse) and (max-height: 600px)";
  const [phone, setPhone] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query),
      change = () => setPhone(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return phone;
}
function Portrait({ id, size = 48 }: { id: string; size?: number }) {
  return (
    <Token
      size={size}
      token={{
        id,
        kind: "actor",
        state: "healthy",
        asset: "portrait_" + id,
        label: actorName(id),
        location: "room",
      }}
    />
  );
}
function Pages<T>({
  items,
  render,
  size = 4,
}: {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  size?: number;
}) {
  const [page, setPage] = useState(0),
    total = Math.ceil(items.length / size);
  const current = Math.min(page, Math.max(0, total - 1));
  return (
    <>
      <div className="dock-grid">
        {items
          .slice(current * size, (current + 1) * size)
          .map((item, i) => render(item, current * size + i))}
      </div>
      {total > 1 && (
        <div className="dock-pagination">
          <TapButton
            aria-label="上一页操作"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            ‹
          </TapButton>
          <span>
            {current + 1} / {total}
          </span>
          <TapButton
            aria-label="下一页操作"
            disabled={current + 1 >= total}
            onClick={() => setPage(current + 1)}
          >
            ›
          </TapButton>
        </div>
      )}
    </>
  );
}
export function MobileParameters({
  state,
  kind,
  id,
  send,
  close,
}: {
  state: GameState;
  kind: string;
  id: string;
  send: (c: Command) => void;
  close: () => void;
}) {
  const fields = commandFields(state, kind, id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const field = fields[index];
  const routes = React.useMemo(
    () => skillRouteActions(state, kind, id),
    [state, kind, id],
  );
  function submit() {
    const actorId = getControls(state).actorId!;
    const c: Command =
      kind === "PERK"
        ? { type: "USE_PERK", actorId, perkId: id }
        : kind === "POWER"
          ? { type: "INTERACT", actorId, action: "power" }
          : kind === "PHANTASM"
            ? { type: "SELECT", actorId, option: "teleport" }
            : { type: "REVISE_INTERACTION", actorId };
    for (const f of fields) {
      const v =
        values[f.key] ?? (f.optional ? "" : (f.options[0]?.value ?? ""));
      if (f.optional && !v) continue;
      const val = f.number ? Number(v) : f.boolean ? v === "true" : v;
      if (f.key.startsWith("choices."))
        c.choices = {
          ...(c.choices as Record<string, unknown>),
          [f.key.slice(8)]: val,
        };
      else c[f.key] = val;
    }
    send(c);
  }
  const complete = React.useMemo(
    () => (routes.length ? null : paramActions(state, kind, id)),
    [state, kind, id, routes.length],
  );
  const [group, setGroup] = useState<string[]>([]);
  if (!routes.length && complete) {
    // 选项多时按标签逐段分组（例如 先选队友 → 再选交互 → 再选对象），每层最多 8 个
    const seg = (l: string) => l.split(" · ");
    const inGroup = complete.filter((a) =>
      group.every((g, i) => seg(a.label)[i] === g),
    );
    const next = [
      ...new Set(
        inGroup
          .filter((a) => seg(a.label).length > group.length + 1)
          .map((a) => seg(a.label)[group.length]),
      ),
    ];
    const grouped = inGroup.length > 8 && next.length > 1;
    const rest = (a: (typeof complete)[number]) =>
      seg(a.label).slice(group.length).join(" · ") || a.label;
    return (
      <div
        className="phone-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="选择技能目标"
      >
        <div className="sheet-heading">
          <h2>
            {!complete.length
              ? "现在没有可用目标"
              : group.length
                ? group.join(" · ")
                : "选择要执行的效果"}
          </h2>
          {group.length ? (
            <TapButton onClick={() => setGroup(group.slice(0, -1))}>
              返回
            </TapButton>
          ) : (
            <TapButton onClick={close}>取消</TapButton>
          )}
        </div>
        {grouped ? (
          <Pages
            key={"groups" + group.join("|")}
            size={8}
            items={next}
            render={(g) => (
              <TapButton
                key={g}
                data-group={g}
                data-group-commands={JSON.stringify(
                  inGroup
                    .filter((a) => seg(a.label)[group.length] === g)
                    .map((a) => a.command),
                )}
                onClick={() => setGroup([...group, g])}
              >
                {g}
              </TapButton>
            )}
          />
        ) : (
          <Pages
            key={"list" + group.join("|")}
            size={8}
            items={inGroup}
            render={(a, i) => (
              <TapButton
                key={i}
                data-command={JSON.stringify(a.command)}
                onClick={() => send(a.command)}
              >
                {rest(a)}
              </TapButton>
            )}
          />
        )}
      </div>
    );
  }
  if (routes.length)
    return (
      <div
        className="phone-route-prompt"
        role="region"
        aria-label="选择技能路线"
      >
        <p>点击发光房间使用技能</p>
        <TapButton onClick={close}>取消</TapButton>
      </div>
    );
  return (
    <div
      className="phone-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="选择技能目标"
    >
      <div className="sheet-heading">
        <h2>{field?.label ?? "确认使用"}</h2>
        <TapButton onClick={close}>取消</TapButton>
      </div>
      {field && (
        <Pages
          key={field.key}
          items={[
            ...(field.optional ? [{ value: "", label: "不选择" }] : []),
            ...field.options,
          ]}
          render={(o, i) => (
            <TapButton
              key={i}
              data-field-option={field.key}
              data-value={o.value}
              aria-pressed={
                (values[field.key] ??
                  (field.optional ? "" : field.options[0]?.value)) === o.value
              }
              onClick={() => setValues((v) => ({ ...v, [field.key]: o.value }))}
            >
              {o.label}
            </TapButton>
          )}
        />
      )}
      <div className="dock-pagination">
        <TapButton disabled={!index} onClick={() => setIndex(index - 1)}>
          上一步
        </TapButton>
        <span>
          {Math.min(index + 1, fields.length)} / {fields.length}
        </span>
        {index < fields.length - 1 ? (
          <TapButton className="primary" onClick={() => setIndex(index + 1)}>
            下一步
          </TapButton>
        ) : (
          <TapButton
            className="primary"
            data-testid="submit-parameters"
            onClick={submit}
          >
            确认使用
          </TapButton>
        )}
      </div>
    </div>
  );
}
export function MobileDock({
  state,
  id,
  control,
  waiting,
  net,
  status,
  plan,
  setPlan,
  send,
  pending,
  error,
  route,
  diceCount,
  setDiceCount,
  clearRoute,
  leave,
  onForm,
  selected,
  clearSelected,
  onInvite,
}: {
  state: GameState;
  id: string | null;
  control: ReturnType<typeof getControls>;
  waiting: boolean;
  net?: NetBinding;
  status: string;
  plan: Card[];
  setPlan: React.Dispatch<React.SetStateAction<Card[]>>;
  send: (c: Command) => void;
  pending: boolean;
  error: string;
  route: Array<{ pathId: string; to: string }>;
  diceCount: number;
  setDiceCount: (n: number) => void;
  clearRoute: () => void;
  leave: () => void;
  onForm: (kind: string, id: string) => void;
  selected: string | null;
  clearSelected: () => void;
  onInvite: () => void;
}) {
  const [sheet, setSheet] = useState<"actor" | "journal" | "items" | null>(
      null,
    ),
    [skillIndex, setSkillIndex] = useState(0);
  const mine = net
    ? Object.values(state.actors).filter((a) => a.ownerId === net.seat)
    : id
      ? [state.actors[id]]
      : [];
  const own = mine.find((a) => a.id === id) ?? mine[0];
  const current = id ? state.actors[id] : null;
  const skills = id && !waiting ? availableSkills(state, id) : [];
  const shownSkills = own ? availableSkills(state, own.id) : [];
  const planning =
    state.phase === "PLANNING" && !state.window && !state.choice && !waiting;
  const moving = state.turn?.stage === "MOVE" && !state.window && !state.choice;
  const globalReveal =
    state.phase === "SETUP" || state.choice?.kind === "MAP_REVEAL";
  const stage = state.winner
    ? "results"
    : waiting
      ? "waiting"
      : planning || state.choice?.kind === "REPLAN"
        ? "plan"
        : state.window
          ? "skill"
          : ["CARRY", "CARRY_REROUTE"].includes(state.choice?.kind ?? "")
            ? "carry"
            : moving
              ? "move"
              : state.choice?.kind === "KEEP"
                ? "dice"
                : "interact";
  const acts = control.actions.filter(
    (a) =>
      !(moving && a.pathId && a.roomId) &&
      (!globalReveal || !a.targetId || (!!selected && a.roomId === selected)),
  );
  const terminal = acts.filter(
    (a) =>
      ["PASS", "END_TURN"].includes(a.command.type) ||
      (a.command.type === "SELECT" &&
        Object.keys(a.command).every((k) => ["type", "actorId"].includes(k))),
  );
  const pagedActs = acts.filter((a) => !terminal.includes(a));
  const visuals = boardVisuals(state);
  const last = state.events.at(-1);
  useEffect(() => {
    setSheet(null);
  }, [id, state.phase, state.choice?.kind]);
  // 竖屏：操作坞按内容自适应高度，棋盘占满其余全部空间（2026-10-20）
  const dockRef = React.useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
  }, [id, stage, state.turn?.actorId, state.choice?.kind, !!state.window]);
  useEffect(() => {
    const dock = dockRef.current,
      game = dock?.closest<HTMLElement>(".phone-game");
    if (!dock || !game) return;
    const portrait = matchMedia("(orientation: portrait)");
    const apply = () => {
      if (portrait.matches)
        game.style.setProperty("--dock-height", dock.offsetHeight + "px");
      else game.style.removeProperty("--dock-height");
    };
    const ro = new ResizeObserver(apply);
    ro.observe(dock);
    portrait.addEventListener("change", apply);
    apply();
    return () => {
      ro.disconnect();
      portrait.removeEventListener("change", apply);
      game.style.removeProperty("--dock-height");
    };
  }, []);
  function skill(perk: (typeof skills)[number]) {
    const fields = commandFields(state, "PERK", perk.id);
    if (!fields.length)
      send({ type: "USE_PERK", actorId: id!, perkId: perk.id });
    else onForm("PERK", perk.id);
  }
  function skillButtons(perk: (typeof skills)[number]) {
    const fields = commandFields(state, "PERK", perk.id);
    // 选项不多时直接把完整效果摆在操作坞上，一次点击即用（路线类技能仍在棋盘上点）
    const complete =
      fields.length && !skillRouteActions(state, "PERK", perk.id).length
        ? paramActions(state, "PERK", perk.id)
        : null;
    if (complete && complete.length && complete.length <= 4)
      return complete.map((a) => (
        <TapButton
          key={perk.id + JSON.stringify(a.command)}
          data-perk={perk.id}
          data-command={JSON.stringify(a.command)}
          onClick={() => send(a.command)}
        >
          {perk.name} · {a.label} · {perk.cost}血点
        </TapButton>
      ));
    return (
      <TapButton key={perk.id} data-perk={perk.id} onClick={() => skill(perk)}>
        {perk.name} · {perk.cost}血点
      </TapButton>
    );
  }
  return (
    <>
      <header
        className={
          "phone-status" + (net && !net.connected ? " disconnected" : "")
        }
      >
        <TapButton
          className="phone-avatar"
          aria-label="查看我的角色"
          onClick={() => setSheet("actor")}
        >
          {own ? <Portrait id={own.id} /> : <span>角色</span>}
        </TapButton>
        <div>
          <strong>
            第{state.round}轮 · {phases[state.phase]}
          </strong>
          <small>
            {net && !net.connected
              ? "重新连接中…"
              : `发电机 ${state.completedGenerators}/4　献祭 ${state.sacrifice}/8`}
          </small>
        </div>
        <TapButton
          aria-label="我的物品"
          data-testid="my-items"
          onClick={() => setSheet("items")}
        >
          物品
        </TapButton>
        {net && (
          <TapButton onClick={onInvite} aria-label="邀请朋友">
            邀请
          </TapButton>
        )}
        <SettingsButton />
      </header>
      <TapButton
        className="phone-latest"
        aria-label="查看事件日志"
        onClick={() => setSheet("journal")}
      >
        {last ? eventText(state, last) : "等待棋盘布置"} <span>›</span>
      </TapButton>
      <section
        ref={dockRef}
        className={
          "mobile-dock stage-" + stage + (collapsed ? " collapsed" : "")
        }
        data-testid="mobile-dock"
        data-stage={stage}
        aria-label="当前行动"
      >
        <div className="dock-heading">
          <Illustration className="module-art" id={stage} />
          <div>
            <strong>
              {state.winner
                ? "对局结束"
                : waiting
                  ? `等待${id ? actorName(id) : "其他玩家"}`
                  : id
                    ? actorName(id)
                    : "请稍候"}
            </strong>
            <p role="status">{pending ? "正在提交…" : status}</p>
          </div>
          {current && !waiting && (
            <span className="dock-blood">
              {current.blood}
              <small>血点</small>
            </span>
          )}
          {!state.winner && !waiting && (
            <TapButton
              className="dock-collapse"
              aria-label={collapsed ? "展开操作栏" : "收起操作栏看地图"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? "▲" : "▼"}
            </TapButton>
          )}
        </div>
        {error && (
          <p role="alert" className="dock-error">
            {error}
          </p>
        )}
        <fieldset disabled={pending} className="dock-controls">
          {state.winner ? (
            <>
              <h2>{state.winner === "survivor" ? "逃生者获胜" : "杀手获胜"}</h2>
              <TapButton
                className="primary"
                data-testid="new-game"
                onClick={leave}
              >
                {net ? "返回联机大厅" : "再开一局"}
              </TapButton>
            </>
          ) : waiting ? (
            <p className="dock-waiting">棋盘可自由查看。轮到你时会提示。</p>
          ) : planning ? (
            <>
              <div className="phone-hand" data-testid="movement-hand">
                {control.hand.map((c, i) => (
                  <TapButton
                    key={i}
                    data-card={c}
                    className={
                      "move-card " + c + (plan.includes(c) ? " chosen" : "")
                    }
                    aria-pressed={plan.includes(c)}
                    onClick={() =>
                      setPlan((p) =>
                        p.includes(c)
                          ? p.filter((v) => v !== c)
                          : p.length < control.planCount
                            ? [...p, c]
                            : [c],
                      )
                    }
                  >
                    <MotionIcon card={c} size={32} />
                    <span>{cardNames[c].split("（")[0]}</span>
                    {plan.includes(c) && <b>{plan.indexOf(c) + 1}</b>}
                  </TapButton>
                ))}
              </div>
              <TapButton
                className="primary dock-confirm"
                data-testid="confirm-plan"
                disabled={plan.length !== control.planCount}
                onClick={() =>
                  send({ type: "PLAN", actorId: id!, cards: plan })
                }
              >
                确认{state.publicPlans.includes(id!) ? "公开" : "秘密"}计划{" "}
                {plan.length}/{control.planCount}
              </TapButton>
            </>
          ) : (
            <>
              {moving && <p className="dock-hint">点击棋盘上发光的房间移动</p>}
              {globalReveal && !selected && (
                <p className="dock-hint">
                  先点棋盘上的一个房间，再选要翻开的道具。
                </p>
              )}
              {state.choice?.kind === "CARRY" ? (
                <>
                  <p className="carry-route">
                    {route.length
                      ? route.map((r) => roomName(state, r.to)).join(" → ")
                      : "点击发光的下一房间"}{" "}
                    · {route.length}步
                  </p>
                  <div className="carry-options">
                    <TapButton onClick={clearRoute}>重选</TapButton>
                    <label>挣脱骰</label>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <TapButton
                        key={n}
                        aria-pressed={diceCount === n}
                        data-dice-count={n}
                        onClick={() => setDiceCount(n)}
                      >
                        {n}
                      </TapButton>
                    ))}
                  </div>
                  <TapButton
                    className="primary"
                    data-testid="confirm-carry"
                    onClick={() =>
                      send({
                        type: "SELECT",
                        actorId: id!,
                        dice: diceCount,
                        route,
                      })
                    }
                  >
                    确认搬运
                  </TapButton>
                </>
              ) : (
                <Pages
                  key={String(state.events.length)}
                  items={pagedActs}
                  size={8}
                  render={(a, i) => {
                    const t = a.targetId
                      ? (visuals.props.find((p) => p.id === a.targetId) ??
                        visuals.actors.find((p) => p.id === a.targetId))
                      : null;
                    return (
                      <TapButton
                        key={i}
                        className={
                          ["PASS", "END_TURN"].includes(a.command.type)
                            ? "dock-secondary"
                            : ""
                        }
                        data-command={JSON.stringify(a.command)}
                        onClick={() => send(a.command)}
                      >
                        {t && <Token token={t} size={40} />}
                        <span>{a.label.replace(/^翻开.*? · /, "翻开 · ")}</span>
                      </TapButton>
                    );
                  }}
                />
              )}
              {!!terminal.length && (
                <div className="dock-terminal">
                  {terminal.map((a, i) => (
                    <TapButton
                      key={i}
                      className="primary"
                      data-command={JSON.stringify(a.command)}
                      onClick={() => send(a.command)}
                    >
                      {a.label}
                    </TapButton>
                  ))}
                </div>
              )}
              {skills.some((s) => s.available) && (
                <div className="dock-skills">
                  {skills.filter((s) => s.available).flatMap(skillButtons)}
                </div>
              )}
              {current?.side === "killer" && !state.choice && !state.window && (
                <TapButton
                  className="dock-power"
                  data-testid="power"
                  onClick={() => onForm("POWER", id!)}
                >
                  杀手力量
                </TapButton>
              )}
              {state.choice?.kind === "PHANTASM" && (
                <TapButton onClick={() => onForm("PHANTASM", "phantasm")}>
                  传送并交互
                </TapButton>
              )}
              {state.window?.event === "WOULD_INTERACT" && (
                <TapButton
                  onClick={() => onForm("REVISE_INTERACTION", "revise")}
                >
                  重新选择交互目标
                </TapButton>
              )}
            </>
          )}
        </fieldset>
      </section>
      {selected && state.actors[selected] && (
        <aside className="public-actor-card" aria-label="角色公开状态">
          <Portrait id={selected} />
          <div>
            <strong>{actorName(selected)}</strong>
            <p>
              血点 {state.actors[selected].blood} ·{" "}
              {state.actors[selected].hookId
                ? "挂在钩子上"
                : state.actors[selected].health === "healthy"
                  ? "健康"
                  : "受伤"}
            </p>
          </div>
          <TapButton onClick={clearSelected} aria-label="关闭角色状态">
            关闭
          </TapButton>
        </aside>
      )}
      {sheet && (
        <div
          className="phone-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={
            sheet === "actor"
              ? "我的角色资料"
              : sheet === "items"
                ? "我的物品"
                : "事件日志"
          }
        >
          <div className="sheet-heading">
            <h2>
              {sheet === "actor" && own
                ? actorName(own.id)
                : sheet === "items"
                  ? "我的物品"
                  : "事件日志"}
            </h2>
            <TapButton onClick={() => setSheet(null)}>关闭</TapButton>
          </div>
          {sheet === "items" ? (
            <Pages
              items={mine}
              size={1}
              render={(a) => (
                <div key={a.id} className="inventory-page">
                  <strong>{actorName(a.id)}</strong>
                  {a.item ? (
                    <>
                      <div className="sheet-item">
                        <Illustration id={itemInfo(a.item)?.id ?? a.item} />
                        <div>
                          <strong>{itemInfo(a.item)?.name_zh ?? "物品"}</strong>
                          <p>{itemInfo(a.item)?.text_original_zh}</p>
                        </div>
                      </div>
                      <Pages
                        items={itemActions(state, a.id)}
                        render={(action, i) => (
                          <TapButton
                            key={i}
                            disabled={pending || (!!net && !net.connected)}
                            data-command={JSON.stringify(action.command)}
                            onClick={() => {
                              send(action.command);
                              setSheet(null);
                            }}
                          >
                            {action.label}
                          </TapButton>
                        )}
                      />
                      {!itemActions(state, a.id).length && (
                        <p>当前没有合法使用方式。</p>
                      )}
                    </>
                  ) : (
                    <p>未持有物品</p>
                  )}
                </div>
              )}
            />
          ) : sheet === "journal" ? (
            <Pages
              items={[...state.events].reverse()}
              size={3}
              render={(e) => (
                <p className="sheet-log" key={e.seq}>
                  {eventText(state, e)}
                </p>
              )}
            />
          ) : (
            own && (
              <>
                <div className="sheet-actor">
                  <Portrait id={own.id} size={88} />
                  <div>
                    <p>{own.room ? roomName(state, own.room) : "准备入场"}</p>
                    <p>
                      血点 {own.blood} ·{" "}
                      {own.health === "healthy" ? "健康" : "受伤"}
                      {own.hookId ? " · 挂钩" : own.lockerId ? " · 躲藏" : ""}
                    </p>
                  </div>
                </div>
                <div className="skill-tabs">
                  {shownSkills.map((s, i) => (
                    <TapButton
                      key={s.id}
                      aria-pressed={skillIndex === i}
                      onClick={() => setSkillIndex(i)}
                    >
                      {s.name}
                    </TapButton>
                  ))}
                </div>
                {shownSkills[skillIndex] && (
                  <article className="skill-full">
                    <h3>
                      {shownSkills[skillIndex].name} ·{" "}
                      {shownSkills[skillIndex].cost}血点
                    </h3>
                    <p>{shownSkills[skillIndex].text}</p>
                    <small>
                      {shownSkills[skillIndex].status === "CHECK_REQUIRED"
                        ? "该功能尚未实现"
                        : "使用时机到来时，操作坞会显示按钮"}
                    </small>
                  </article>
                )}
                {chars.characters.find((c) => c.id === own.id)?.power && (
                  <p className="skill-full">
                    {
                      chars.characters.find((c) => c.id === own.id)?.power
                        ?.text_original_zh
                    }
                  </p>
                )}
                {(chars.characters.find((c) => c.id === own.id) as any)?.passive
                  ?.text_original_zh && (
                  <p className="skill-full">
                    被动：
                    {
                      (chars.characters.find((c) => c.id === own.id) as any)
                        .passive.text_original_zh
                    }
                  </p>
                )}
                <div className="sheet-item">
                  {own.item ? (
                    <>
                      <Illustration id={itemInfo(own.item)?.id ?? own.item} />
                      <div>
                        <strong>{itemInfo(own.item)?.name_zh}</strong>
                        <p>{itemInfo(own.item)?.text_original_zh}</p>
                      </div>
                      <TapButton
                        disabled={pending}
                        onClick={() => setSheet("items")}
                      >
                        我的物品
                      </TapButton>
                    </>
                  ) : (
                    <p>未持有物品</p>
                  )}
                </div>
              </>
            )
          )}
        </div>
      )}
    </>
  );
}
