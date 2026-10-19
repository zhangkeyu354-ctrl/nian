import React, { useMemo, useState, useEffect } from "react";
import {
  createGame,
  reduce,
  RuleError,
  getControls,
  currentActor,
  previewRoutes,
  carrySteps,
  commandFields,
  availableSkills,
  actorName,
  roomName,
  propLabel,
  cardNames,
  pathLabel,
  feedbackEvents,
} from "../../../packages/game-engine/src/index.ts";
import type {
  GameState,
  Command,
  CreateOptions,
  Card,
  Event as GameEvent,
} from "../../../packages/shared/src/types.ts";
import { maps, chars } from "../../../packages/game-engine/src/data.ts";
import { SettingsButton } from "./Settings.tsx";
import { Token } from "./Token.tsx";
import { FeedbackPanel, CompletedGenerators } from "./Feedback.tsx";
import type { Feedback } from "../../../packages/game-engine/src/presentation.ts";
import { MotionIcon } from "./MotionIcon.tsx";
import { Dice } from "./Dice.tsx";
import { Board } from "./Board.tsx";
import {
  phases,
  stages,
  triggerNames,
  checkNames,
  faceName,
  eventText,
  itemInfo,
} from "./labels.ts";
type Form = { kind: string; id: string };
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}
function Track({
  name,
  value,
  max,
}: {
  name: string;
  value: number;
  max: number;
}) {
  return (
    <div className="track">
      <div>
        <span>{name}</span>
        <strong>
          {value}
          <small> / {max}</small>
        </strong>
      </div>
      <div className="track-steps">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={i < value ? "filled" : ""}
            data-track-icon={max === 8 ? "hook" : "generator"}
          >
            {max === 8 ? (
              <svg
                className="track-hook"
                viewBox="0 0 40 40"
                width="36"
                height="36"
                aria-hidden="true"
              >
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill={i < value ? "#733f39" : "#252b2d"}
                  stroke={i < value ? "#e28274" : "#797463"}
                />
                <path
                  d="M25 8v17c0 9-14 9-14 0v-4l5 4"
                  fill="none"
                  stroke={i < value ? "#ffd4b9" : "#c9bc98"}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <Token
                token={{
                  id: "track-" + i,
                  kind: max === 8 ? "hook" : "generator",
                  state: "normal",
                  asset: max === 8 ? "hook" : "generator",
                  label: max === 8 ? "献祭格" + (i + 1) : "发电机格" + (i + 1),
                  location: "track",
                }}
                size={36}
              />
            )}
          </span>
        ))}
        {max === 4 && (
          <span data-track-icon="exit_gate">
            <Token
              token={{
                id: "track-exit",
                kind: "exit_gate",
                state: value >= 4 ? "powered" : "unpowered",
                asset: "exit_gate",
                label: "出口大门",
                location: "track",
              }}
              size={36}
            />
          </span>
        )}
      </div>
    </div>
  );
}
function ParameterForm({
  state,
  form,
  onSubmit,
  onClose,
}: {
  state: GameState;
  form: Form;
  onSubmit: (c: Command) => void;
  onClose: () => void;
}) {
  const fields = commandFields(state, form.kind, form.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const fieldValue = (f: (typeof fields)[number]) =>
    values[f.key] ?? (f.optional ? "" : (f.options[0]?.value ?? ""));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const actorId = currentActor(state)!;
    const c: Command =
      form.kind === "PERK"
        ? { type: "USE_PERK", actorId, perkId: form.id }
        : form.kind === "POWER"
          ? { type: "INTERACT", actorId, action: "power" }
          : form.kind === "PHANTASM"
            ? { type: "SELECT", actorId, option: "teleport" }
            : { type: "REVISE_INTERACTION", actorId };
    for (const f of fields) {
      const v = fieldValue(f);
      if (f.optional && !v) continue;
      const value = f.number ? Number(v) : f.boolean ? v === "true" : v;
      if (f.key.startsWith("choices.")) {
        const key = f.key.slice(8);
        c.choices = { ...(c.choices as Record<string, string>), [key]: value };
      } else c[f.key] = value;
    }
    onSubmit(c);
  }
  return (
    <form className="parameter-form" onSubmit={submit} data-form={form.id}>
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}
          <select
            data-field={f.key}
            value={fieldValue(f)}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value }))
            }
          >
            {f.optional && <option value="">不选择</option>}
            {f.options.map((o, i) => (
              <option key={i} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {form.id === "doctor" && (
        <p className="muted">请逐位询问目标房间内的逃生者，再填写其决定。</p>
      )}
      <div className="button-row">
        <button
          className="primary"
          type="submit"
          data-testid="submit-parameters"
        >
          确认使用
        </button>
        <button type="button" onClick={onClose}>
          取消
        </button>
      </div>
    </form>
  );
}
export function App() {
  const [effects, setEffects] = useState<Feedback[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [options, setOptions] = useState<CreateOptions>({
    seed: 1701,
    mapId: "macmillan_estate",
    survivors: ["dwight", "claudette", "jake", "ace"],
    killer: "trapper",
  });
  const [playerCount, setPlayerCount] = useState("5");
  const [viewer, setViewer] = useState<string | null>(null),
    [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [plan, setPlan] = useState<Card[]>([]),
    [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState(""),
    [dice, setDice] = useState<GameEvent[]>([]);
  const [route, setRoute] = useState<Array<{ pathId: string; to: string }>>([]),
    [diceCount, setDiceCount] = useState(0);
  const control = useMemo(() => (state ? getControls(state) : null), [state]);
  const id = control?.actorId ?? null,
    owner = id && state ? state.actors[id].ownerId : null;
  const masked = !!state && !state.winner && (locked || viewer !== owner);
  const current = id && state ? state.actors[id] : null;
  function start() {
    try {
      let o = { ...options };
      if (playerCount !== "5") {
        const ownerCount = Number(playerCount) - 1;
        const owners: Record<string, string> = {};
        options.survivors.forEach((id, i) => {
          owners[id] = "survivor_player_" + (i % ownerCount);
        });
        owners[o.killer] = "killer_player";
        o = { ...o, owners };
      }
      const next = createGame(o);
      setState(next);
      setViewer(null);
      setLocked(false);
      setPlan([]);
      setForm(null);
      setError("");
      setDice([]);
      setEffects([]);
      setSelected(null);
    } catch {
      setError("请选择四位不同的逃生者、一位杀手及有效的对局种子。");
    }
  }
  function send(c: Command) {
    if (!state || masked || dice.length || effects.length) return;
    try {
      const next = reduce(state, c);
      const rolls = next.events
        .slice(state.events.length)
        .filter((e) => e.type === "DICE_ROLLED" || e.type === "SPAWNED");
      setState(next);
      setEffects(feedbackEvents(state, next));
      setDice(rolls);
      setPlan([]);
      setSelected(null);
      setForm(null);
      setRoute([]);
      setDiceCount(0);
      setError("");
    } catch (e) {
      setError(
        e instanceof RuleError && e.code === "CHECK_REQUIRED"
          ? "该功能尚未实现"
          : "当前操作不合法，请检查目标、费用或时机。",
      );
    }
  }
  const highlights = useMemo(() => {
    if (!state || !id || masked) return [];
    if (state.choice?.kind === "CARRY") return carrySteps(state, route);
    if (state.phase === "PLANNING" && plan.length)
      return previewRoutes(state, id, plan[0]);
    return control!.actions
      .filter((a) => a.roomId && a.pathId)
      .map((a) => ({ pathId: a.pathId!, to: a.roomId! }));
  }, [state, id, masked, route, plan, control]);
  const visibleLogs = useMemo(
    () =>
      state?.events.filter(
        (e) =>
          !triggerNames[e.type] ||
          [
            "GENERATOR_COMPLETED",
            "GENERATOR_FAILURE",
            "SURVIVOR_BECOMES_HEALTHY",
          ].includes(e.type),
      ) ?? [],
    [state],
  );
  const recentRolls = useMemo(
    () =>
      state?.events.filter(
        (e) => e.type === "DICE_ROLLED" || e.type === "SPAWNED",
      ) ?? [],
    [state],
  );
  function pick(kind: string, target: string) {
    if (!state || !control) return;
    if (state.choice?.kind === "CARRY" && kind === "room") {
      const steps = carrySteps(state, route).filter((r) => r.to === target);
      if (steps.length === 1) {
        const next = [...route, steps[0]];
        setRoute(next);
        setDiceCount(Math.max(diceCount, next.length));
        return;
      }
    }
    const choices = control.actions.filter((a) =>
      kind === "prop" ? a.targetId === target : a.roomId === target,
    );
    if (choices.length === 1) send(choices[0].command);
    else setSelected(target);
  }
  useEffect(() => {
    window.render_game_to_text = () =>
      JSON.stringify(
        !state
          ? { screen: "开始对局" }
          : masked
            ? {
                screen: "交接遮挡",
                covered: true,
                nextActor: id ? actorName(id) : null,
              }
            : {
                screen: state.winner ? "对局结束" : "棋盘",
                covered: false,
                phase: phases[state.phase],
                round: state.round,
                currentActor: id ? actorName(id) : null,
                currentStatus: current
                  ? {
                      room: current.room ? roomName(state, current.room) : null,
                      blood: current.blood,
                      health: current.health === "healthy" ? "健康" : "受伤",
                      item: itemInfo(current.item)?.name_zh ?? null,
                    }
                  : null,
                events: state.events.length,
                winner: state.winner
                  ? state.winner === "survivor"
                    ? "逃生者"
                    : "杀手"
                  : null,
                map: maps.maps.find((m) => m.id === state.mapId)?.name_zh,
                selectedCards: plan.map((c) => cardNames[c]),
                legalRoutes: highlights.map((h) => ({
                  to: roomName(state, h.to),
                  path: h.pathId,
                })),
                choice: state.choice?.kind
                  ? (
                      {
                        REVEAL: "翻开道具",
                        KEEP: "保留骰子",
                        CARRY: "选择搬运路线",
                        BONUS_CARD: "奖励移动牌",
                        KEEP_ITEM: "保留物品",
                        PHANTASM: "幻影反应",
                        OPTIONAL_MOVE: "可选移动",
                      } as Record<string, string>
                    )[state.choice.kind]
                  : null,
                dice: recentRolls.slice(-1).map((e) => ({
                  actor: actorName(String(e.data.actorId)),
                  faces: e.data.faces ?? [e.data.face],
                })),
                coordinates: "地图原点左上，横轴向右，纵轴向下",
              },
      );
    window.advanceTime = () => {};
  }, [state, masked, id, plan, highlights, recentRolls]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "f" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const status = state?.window
    ? `${triggerNames[state.window.event] ?? "技能响应"} · 选择技能或继续`
    : state?.choice
      ? (
          {
            REVEAL: "点击本房间一个未翻开的道具",
            KEEP: "选择要保留的骰子",
            KEEP_ITEM: "选择保留的物品",
            BONUS_CARD: "选择一张奖励移动牌",
            OPTIONAL_MOVE: "选择移动或留在原地",
            CARRY: "依次选择搬运路线",
            PHANTASM: "幻影反应",
          } as Record<string, string>
        )[state.choice.kind]
      : state?.turn
        ? stages[state.turn.stage]
        : state?.phase === "SETUP"
          ? "点击一个未翻开的道具，完成本角色的准备"
          : state
            ? phases[state.phase]
            : "";
  if (!state)
    return (
      <>
        <div className="lobby-settings">
          <a href="/?view=props">道具状态一览</a>
          <SettingsButton />
        </div>
        <main className="lobby">
          <div className="lobby-brand">
            <div className="tally" aria-hidden="true">
              <Token
                token={{
                  id: "brand",
                  kind: "brand_lantern",
                  state: "normal",
                  asset: "brand_lantern",
                  label: "原创灯笼",
                  location: "room",
                }}
                size={100}
              />
            </div>
            <p className="eyebrow">中文版 · 实体桌游规则</p>
            <h1>
              黎明杀机<span>桌游版</span>
            </h1>
            <p>
              一张棋盘，五个角色。
              <br />
              在同一台设备上，轮流计划与行动。
            </p>
            <div className="lobby-line" />
            <p className="muted">热座模式 · 两张基础地图 · 十三名角色</p>
          </div>
          <section className="setup">
            <h2>开始一局</h2>
            <p className="muted">交接设备时会遮挡棋盘和秘密移动牌。</p>
            <label>
              地图
              <select
                data-testid="map-select"
                value={options.mapId}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, mapId: e.target.value }))
                }
              >
                {maps.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name_zh}
                  </option>
                ))}
              </select>
            </label>
            <div className="setup-row">
              <label>
                玩家人数
                <select
                  value={playerCount}
                  onChange={(e) => setPlayerCount(e.target.value)}
                >
                  <option value="5">5人 · 各控一个角色</option>
                  <option value="4">4人 · 一人兼控</option>
                  <option value="3">3人 · 两人各控两名逃生者</option>
                </select>
              </label>
              <label>
                对局种子
                <input
                  type="number"
                  data-testid="seed-input"
                  value={options.seed}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, seed: Number(e.target.value) }))
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>逃生者</legend>
              <div className="setup-row">
                {options.survivors.map((value, i) => (
                  <label key={i}>
                    角色 {i + 1}
                    <select
                      data-testid={"survivor-" + i}
                      value={value}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          survivors: o.survivors.map((v, j) =>
                            i === j ? e.target.value : v,
                          ),
                        }))
                      }
                    >
                      {chars.characters
                        .filter((c) => c.side === "survivor")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name_zh}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              杀手
              <select
                data-testid="killer-select"
                value={options.killer}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, killer: e.target.value }))
                }
              >
                {chars.characters
                  .filter((c) => c.side === "killer")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_zh}
                    </option>
                  ))}
              </select>
            </label>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button
              className="primary start-button"
              data-testid="start"
              onClick={start}
            >
              布置棋盘 <span>→</span>
            </button>
            <p className="muted small">
              本地热座 · 不连接网络房间。刷新页面会重新开始。
            </p>
          </section>
        </main>
      </>
    );
  return (
    <div className="game">
      <header className="game-header">
        <div className="brand">
          <span className="mini-tally">
            <Token
              token={{
                id: "brand",
                kind: "brand_lantern",
                state: "normal",
                asset: "brand_lantern",
                label: "原创灯笼",
                location: "room",
              }}
              size={42}
            />
          </span>
          <h1>
            黎明杀机 <small>桌游版</small>
          </h1>
        </div>
        <div className="header-meta">
          <span>热座</span>
          <strong>第 {state.round} 轮</strong>
          <span>{phases[state.phase]}</span>
        </div>
        <div className="header-buttons">
          <SettingsButton />
          <button
            onClick={() => {
              setLocked(true);
              setViewer(null);
            }}
            disabled={!!state.winner}
            aria-label="遮挡并交接设备"
          >
            交接设备
          </button>
        </div>
      </header>
      {((!masked && !dice.length) || !!state.winner) && (
        <>
          <section className="score-strip">
            <Track
              name="发电机进度"
              value={state.completedGenerators}
              max={4}
            />
            <Track name="献祭进度" value={state.sacrifice} max={8} />
            <CompletedGenerators state={state} />
            <div className="objective-text">
              {state.completedGenerators >= 4
                ? "出口大门已通电"
                : "完成4台发电机，让出口大门通电"}
              <small>发电机与出口大门上的标记记录各自修理进度</small>
            </div>
          </section>
          <div className="workspace">
            <div className="play-column">
              <Board
                state={state}
                highlight={highlights}
                onRoom={(id) => pick("room", id)}
                onProp={(id) => pick("prop", id)}
                onActor={(id) => pick("prop", id)}
                selected={selected}
                focusRoom={current?.room}
                actionable={control!.actions
                  .filter((a) => a.targetId)
                  .map((a) => a.targetId!)}
              />
              <section className="control-panel" data-testid="control-panel">
                {state.winner ? (
                  <div className="victory">
                    <p className="eyebrow">对局结束</p>
                    <h2>
                      {state.winner === "survivor" ? "逃生者获胜" : "杀手获胜"}
                    </h2>
                    <p>
                      {state.winner === "survivor"
                        ? "出口大门已开启。"
                        : "献祭进度已完成。"}
                    </p>
                    <button
                      onClick={() => {
                        setState(null);
                        setViewer(null);
                      }}
                      data-testid="new-game"
                    >
                      再开一局
                    </button>
                  </div>
                ) : (
                  current && (
                    <>
                      <div className="actor-line">
                        <div>
                          <p className="eyebrow">
                            {current.side === "killer" ? "杀手" : "逃生者"} ·
                            当前操作者
                          </p>
                          <h2>
                            {actorName(id!)}{" "}
                            <small>
                              {current.room
                                ? roomName(state, current.room)
                                : "准备入场"}
                            </small>
                          </h2>
                        </div>
                        <div className="actor-stats">
                          <span>
                            血点 <strong>{current.blood}</strong>
                          </span>
                          <span>
                            {current.side === "killer"
                              ? "杀手"
                              : current.health === "healthy"
                                ? "健康"
                                : "受伤"}
                            {current.hookId
                              ? " · 挂钩"
                              : current.lockerId
                                ? " · 躲藏"
                                : ""}
                            {current.madness ? " · 疯狂" : ""}
                          </span>
                        </div>
                      </div>
                      <p className="instruction" role="status">
                        {status}
                      </p>
                      {error && (
                        <div role="alert" className="error">
                          {error}
                          <button
                            aria-label="关闭提示"
                            onClick={() => setError("")}
                          >
                            ×
                          </button>
                        </div>
                      )}
                      {state.phase === "PLANNING" &&
                        !state.window &&
                        !state.choice && (
                          <div className="planning">
                            <p className="small muted">
                              {state.publicPlans.includes(id!)
                                ? "本次计划公开"
                                : "秘密选择"}{" "}
                              {control!.planCount}{" "}
                              张移动牌，按选择顺序执行。点选后棋盘高亮该牌的合法路线。
                            </p>
                            <div
                              className="movement-hand"
                              data-testid="movement-hand"
                            >
                              {control!.hand.map((c, i) => (
                                <button
                                  key={i}
                                  data-card={c}
                                  className={
                                    "move-card " +
                                    c +
                                    (plan.includes(c) ? " chosen" : "")
                                  }
                                  onClick={() =>
                                    setPlan((p) =>
                                      p.includes(c)
                                        ? p.filter((v) => v !== c)
                                        : p.length < control!.planCount
                                          ? [...p, c]
                                          : [c],
                                    )
                                  }
                                >
                                  <span className="card-symbol">
                                    <MotionIcon card={c} size={40} />
                                  </span>
                                  <span>{cardNames[c]}</span>
                                  {plan.includes(c) && (
                                    <b>{plan.indexOf(c) + 1}</b>
                                  )}
                                </button>
                              ))}
                            </div>
                            <button
                              className="primary"
                              data-testid="confirm-plan"
                              disabled={plan.length !== control!.planCount}
                              onClick={() =>
                                send({
                                  type: "PLAN",
                                  actorId: id!,
                                  cards: plan,
                                })
                              }
                            >
                              确认秘密计划
                              {state.publicPlans.includes(id!)
                                ? "（公开）"
                                : ""}
                            </button>
                          </div>
                        )}
                      {state.turn?.card && state.phase === "ACTING" && (
                        <p className="small">
                          当前移动牌：
                          <strong>{cardNames[state.turn.card]}</strong>
                        </p>
                      )}
                      {state.choice?.kind === "CARRY" && (
                        <div className="carry-builder">
                          <p>
                            搬运路线：
                            {route.length
                              ? route
                                  .map((r) => roomName(state, r.to))
                                  .join(" → ")
                              : "尚未移动"}
                            （{route.length}步）
                          </p>
                          <div className="action-grid">
                            {carrySteps(state, route).map((r) => (
                              <button
                                key={r.pathId + r.to}
                                data-carry-path={r.pathId}
                                data-carry-to={r.to}
                                onClick={() => {
                                  setRoute((v) => [...v, r]);
                                  setDiceCount((v) =>
                                    Math.max(v, route.length + 1),
                                  );
                                }}
                              >
                                前往{roomName(state, r.to)}
                                <small>{pathLabel(state, r.pathId)}</small>
                              </button>
                            ))}
                          </div>
                          <div className="button-row">
                            <button
                              onClick={() => {
                                setRoute([]);
                                setDiceCount(0);
                              }}
                            >
                              清空路线
                            </button>
                            <label>
                              挣脱骰子数量
                              <select
                                data-testid="carry-dice"
                                value={diceCount}
                                onChange={(e) =>
                                  setDiceCount(Number(e.target.value))
                                }
                              >
                                {[0, 1, 2, 3, 4].map((n) => (
                                  <option key={n} value={n}>
                                    {n}颗
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
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
                            </button>
                          </div>
                        </div>
                      )}
                      {selected && (
                        <div className="selection-line">
                          <span>
                            {state.props.some((p) => p.id === selected)
                              ? propLabel(state, selected)
                              : state.actors[selected]
                                ? actorName(selected)
                                : roomName(state, selected)}
                          </span>
                          <button onClick={() => setSelected(null)}>
                            显示全部操作
                          </button>
                        </div>
                      )}
                      <div className="action-grid" data-testid="actions">
                        {control!.actions
                          .filter(
                            (a) =>
                              (!a.targetId ||
                                (!!selected && a.targetId === selected)) &&
                              (!selected ||
                                a.targetId === selected ||
                                a.roomId === selected ||
                                (!a.targetId && !a.roomId)),
                          )
                          .map((a, i) => (
                            <button
                              key={i}
                              className={
                                ["PASS", "END_TURN"].includes(a.command.type)
                                  ? "primary"
                                  : ""
                              }
                              data-command={JSON.stringify(a.command)}
                              onClick={() => send(a.command)}
                            >
                              {a.label}
                            </button>
                          ))}
                      </div>
                      {state.choice?.kind === "PHANTASM" && (
                        <button
                          onClick={() =>
                            setForm({ kind: "PHANTASM", id: "phantasm" })
                          }
                        >
                          传送并交互
                        </button>
                      )}
                      {state.window?.event === "WOULD_INTERACT" && (
                        <button
                          onClick={() =>
                            setForm({
                              kind: "REVISE_INTERACTION",
                              id: "revise",
                            })
                          }
                        >
                          重新选择交互目标
                        </button>
                      )}
                      <div className="skills-header">
                        <h3>板载技能</h3>
                        <span className="muted small">
                          点击查看全文与目标选择
                        </span>
                      </div>
                      <div className="skill-grid">
                        {availableSkills(state, id!).map((p) => (
                          <details key={p.id} open>
                            <summary>
                              <span>{p.name}</span>
                              <b>{p.cost} 血点</b>
                            </summary>
                            <p>{p.text}</p>
                            <button
                              data-perk={p.id}
                              disabled={
                                !p.available && p.status !== "CHECK_REQUIRED"
                              }
                              onClick={() =>
                                p.status === "CHECK_REQUIRED"
                                  ? send({
                                      type: "USE_PERK",
                                      actorId: id!,
                                      perkId: p.id,
                                    })
                                  : setForm({ kind: "PERK", id: p.id })
                              }
                            >
                              {p.status === "CHECK_REQUIRED"
                                ? "尝试使用"
                                : p.available
                                  ? "使用技能"
                                  : "尚未到使用时机"}
                            </button>
                          </details>
                        ))}
                      </div>
                      {current.side === "killer" && (
                        <details className="power">
                          <summary>
                            杀手力量：
                            {
                              chars.characters.find((c) => c.id === id)?.power
                                ?.name_zh
                            }
                          </summary>
                          <p>
                            {
                              chars.characters.find((c) => c.id === id)?.power
                                ?.text_original_zh
                            }
                          </p>
                          <button
                            data-testid="power"
                            onClick={() => setForm({ kind: "POWER", id: id! })}
                          >
                            选择力量目标
                          </button>
                        </details>
                      )}
                      {chars.characters.find((c) => c.id === id)?.passive && (
                        <details className="power" open>
                          <summary>板载被动</summary>
                          <p>
                            {
                              chars.characters.find((c) => c.id === id)?.passive
                                ?.text_original_zh
                            }
                          </p>
                          <small className="muted">
                            满足条件时由规则引擎自动处理
                          </small>
                        </details>
                      )}
                      <div className="item-row">
                        <h3>物品</h3>
                        {current.item ? (
                          <>
                            <div>
                              <strong>{itemInfo(current.item)?.name_zh}</strong>
                              <p>{itemInfo(current.item)?.text_original_zh}</p>
                            </div>
                            <button
                              onClick={() =>
                                send({ type: "USE_ITEM", actorId: id! })
                              }
                            >
                              使用物品
                            </button>
                          </>
                        ) : (
                          <span className="muted">未持有物品</span>
                        )}
                      </div>
                      {form && (
                        <div className="form-drawer">
                          <h3>
                            {form.kind === "PERK"
                              ? availableSkills(state, id!).find(
                                  (p) => p.id === form.id,
                                )?.name
                              : form.kind === "POWER"
                                ? "杀手力量"
                                : form.kind === "PHANTASM"
                                  ? "幻影反应"
                                  : "重新选择交互"}
                          </h3>
                          <ParameterForm
                            key={form.kind + form.id + state.events.length}
                            state={state}
                            form={form}
                            onSubmit={send}
                            onClose={() => setForm(null)}
                          />
                        </div>
                      )}
                    </>
                  )
                )}
              </section>
            </div>
            <aside className="journal">
              <div className="journal-title">
                <h2>事件日志</h2>
                <span>{visibleLogs.length} 条</span>
              </div>
              <div className="journal-scroll" data-testid="event-log">
                {[...visibleLogs].reverse().map((e) => (
                  <div
                    key={e.seq}
                    className={
                      "log-entry " +
                      (e.type === "DICE_ROLLED" ? "roll-entry" : "")
                    }
                  >
                    <span>
                      第{e.round}轮 <small>#{e.seq}</small>
                    </span>
                    <p>{eventText(state, e)}</p>
                  </div>
                ))}
              </div>
              <details className="dice-history">
                <summary>全部掷骰记录（{recentRolls.length}）</summary>
                {[...recentRolls].reverse().map((e) => (
                  <p key={e.seq}>{eventText(state, e)}</p>
                ))}
              </details>
            </aside>
          </div>
        </>
      )}
      {masked && (
        <div
          className="handoff"
          role="dialog"
          aria-modal="true"
          aria-label="交接设备"
        >
          <div className="handoff-symbol">
            <Token
              token={{
                id: "brand",
                kind: "brand_lantern",
                state: "normal",
                asset: "brand_lantern",
                label: "原创灯笼",
                location: "room",
              }}
              size={100}
            />
          </div>
          <p className="eyebrow">请将设备交给下一位玩家</p>
          <h2>{id ? actorName(id) : "下一位玩家"}</h2>
          <p>
            棋盘和秘密移动牌已遮挡。
            <br />
            确认周围玩家看不到屏幕后继续。
          </p>
          <button
            className="primary"
            data-testid="uncover"
            onClick={() => {
              setViewer(owner);
              setLocked(false);
            }}
          >
            我是该角色的玩家，查看棋盘
          </button>
          <small>热座 · 同一台设备轮流操作</small>
        </div>
      )}
      {!!effects.length && !dice.length && (
        <FeedbackPanel effects={effects} onDone={() => setEffects([])} />
      )}
      {!!dice.length && (
        <div
          className="dice-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="掷骰结果"
        >
          <p className="eyebrow">
            {dice[0].type === "SPAWNED" ? "出生骰" : "检定结果"}
          </p>
          <h2>
            {dice[0].data.kind === "locker"
              ? "被占用的储物柜"
              : actorName(String(dice[0].data.actorId))}
          </h2>
          <p>{checkNames[String(dice[0].data.kind)] ?? "确定出生位置"}</p>
          <div className="dice-faces">
            {((dice[0].data.faces ?? [dice[0].data.face]) as number[]).map(
              (f, i) => (
                <Dice
                  key={String(dice[0].seq) + "-" + i}
                  rollKey={String(dice[0].seq) + "-" + i}
                  face={f}
                  danger={dice[0].data.die === "danger"}
                  spawn={dice[0].type === "SPAWNED"}
                />
              ),
            )}
          </div>
          <button
            className="primary"
            data-testid="ack-dice"
            onClick={() => setDice((v) => v.slice(1))}
          >
            已查看，继续{dice.length > 1 ? `（还有${dice.length - 1}次）` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
