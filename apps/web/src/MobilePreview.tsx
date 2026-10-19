import React, { useEffect, useState } from "react";
import samplesJson from "./mobile-preview-samples.json" with { type: "json" };
import { MotionIcon } from "./MotionIcon.tsx";
import type { Card, Command } from "../../../packages/shared/src/types.ts";
import type { VisualToken } from "../../../packages/game-engine/src/presentation.ts";
import "./mobile-preview.css";
type Sample = {
  scene: string;
  round: number;
  gens: number;
  sacrifice: number;
  actor: {
    id: string;
    name: string;
    room: string;
    health: string;
    blood: number;
    side: string;
    asset: string;
  };
  rooms: { id: string; name: string; point: number[] }[];
  paths: {
    id: string;
    color: Card;
    rooms?: string[];
    from?: string;
    to?: string;
  }[];
  props: VisualToken[];
  actors: VisualToken[];
  hand: Card[];
  planCount: number;
  card: Card | null;
  routes: Record<Card, { pathId: string; to: string }[]>;
  actions: { label: string; command: Command }[];
  skills: { name: string; text: string }[];
};
const samples = samplesJson as unknown as Sample[];
const names: Record<Card, string> = {
  blue: "潜行",
  green: "冲刺",
  red: "蹲伏",
  yellow: "翻越",
  wait: "等待",
};
const colors: Record<Card, string> = {
  blue: "#74bfe7",
  green: "#9bc994",
  red: "#e39a8a",
  yellow: "#e7cc7e",
  wait: "#c8c6b9",
};
const art = (asset: string) => "/assets/svg/" + asset + ".svg";
/** Layout prototype only. Samples are public display models from legal replays.
 * Choices record intended commands for review; this page never joins/sends to a room. */
export function MobilePreview() {
  const [scene, setScene] = useState(
    new URLSearchParams(location.search).get("scene") ?? "plan",
  );
  const sample = samples.find((s) => s.scene === scene) ?? samples[0];
  const [plan, setPlan] = useState<Card[]>([]),
    [picked, setPicked] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [whole, setWhole] = useState(false),
    [info, setInfo] = useState(false),
    [taps, setTaps] = useState(0);
  const [intended, setIntended] = useState<Command | null>(null);
  useEffect(() => {
    const previousText = window.render_game_to_text;
    const previousAdvance = window.advanceTime;
    window.render_game_to_text = () =>
      JSON.stringify({
        demo: true,
        scene,
        actor: sample.actor.name,
        selectedCards: plan,
        selectedAction: picked,
        taps,
        intendedCommand: intended,
        notice,
      });
    window.advanceTime = () => {};
    return () => {
      window.render_game_to_text = previousText;
      window.advanceTime = previousAdvance;
    };
  }, [scene, sample, plan, picked, taps, intended, notice]);
  function change(next: string) {
    setScene(next);
    setPlan([]);
    setPicked(null);
    setNotice("");
    setWhole(false);
    setTaps(0);
    setIntended(null);
  }
  const planning = scene === "plan" || scene === "killer_plan";
  const current = sample.rooms.find((r) => r.id === sample.actor.room)!;
  const adjacent = new Set<string>();
  for (const p of sample.paths) {
    const ids = p.rooms ?? [p.from!, p.to!];
    if (ids.includes(current.id))
      for (const id of ids) if (id !== current.id) adjacent.add(id);
  }
  const neighbors = sample.rooms.filter((r) => adjacent.has(r.id));
  const visible = whole ? sample.rooms : [current, ...neighbors];
  const slots = [
    [90, 83],
    [300, 83],
    [90, 350],
    [300, 350],
    [195, 34],
    [195, 407],
  ];
  const points = new Map(
    visible.map((r, i) => [
      r.id,
      whole
        ? [(r.point[0] / 1540) * 390, (r.point[1] / 1520) * 440]
        : i === 0
          ? [195, 214]
          : slots[i - 1],
    ]),
  );
  const selectedCard = planning ? plan[0] : (sample.card ?? "blue");
  const legal = sample.routes[selectedCard ?? "wait"] ?? [];
  const lit = new Set(legal.map((r) => r.pathId));
  const propActions = sample.actions.filter(
    (a) => a.command.type === "INTERACT",
  );
  const active = picked === null ? null : propActions[picked];
  function record(command: Command, message: string) {
    setIntended(command);
    setTaps((t) => t + 1);
    setNotice(message + " · 仅演示，未提交对局");
  }
  return (
    <main
      className="mobile-preview"
      data-testid="mobile-preview"
      data-scene={scene}
      data-demo-taps={taps}
      data-intended-command={intended ? JSON.stringify(intended) : ""}
    >
      <header className="mp-status">
        <button
          className="mp-avatar"
          aria-label="查看演示角色"
          onClick={() => setInfo(true)}
        >
          <img src={art(sample.actor.asset)} alt="" />
        </button>
        <div>
          <strong>{sample.actor.name}</strong>
          <small>
            第{sample.round}轮 ·{" "}
            {planning ? "秘密计划" : scene === "move" ? "移动" : "交互"}
          </small>
        </div>
        <span>
          发电机 <b>{sample.gens}/4</b>
          <br />
          献祭 <b>{sample.sacrifice}/8</b>
        </span>
      </header>
      <div className="mp-demo">手机操作样稿 · 独立演示场景，未连接真实对局</div>
      <nav className="mp-scenes" aria-label="样稿场景">
        {[
          ["plan", "计划"],
          ["move", "移动"],
          ["interact", "交互"],
        ].map(([key, name]) => (
          <button
            key={key}
            data-preview-scene={key}
            aria-pressed={key === "plan" ? planning : scene === key}
            onClick={() => change(key)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="mp-latest" role="status">
        {notice ||
          (planning
            ? "点一张牌，看看哪些房间会发光。"
            : scene === "move"
              ? "轮到你了，直接点发光的房间。"
              : "本房间可用的道具已经列在下方。")}
      </div>
      <section
        className="mp-map"
        data-testid="preview-map"
        aria-label="当前房间及相邻房间示意"
      >
        <svg
          viewBox="0 0 390 440"
          role="group"
          aria-label={whole ? "全图示意" : "当前房间与全部相邻房间"}
        >
          <defs>
            <pattern
              id="mp-scratches"
              width="45"
              height="45"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 42L45 3M0 15l45 13"
                stroke="#52615b"
                strokeWidth=".7"
                opacity=".3"
              />
            </pattern>
            <linearGradient id="mp-fog" x2="0" y2="1">
              <stop stopColor="#40544e" stopOpacity=".75" />
              <stop offset="1" stopColor="#172427" />
            </linearGradient>
          </defs>
          <rect width="390" height="440" fill="#182528" />
          <rect width="390" height="440" fill="url(#mp-scratches)" />
          {sample.paths.map((path) => {
            const ids = (path.rooms ?? [path.from!, path.to!]).filter((id) =>
              points.has(id),
            );
            if (ids.length < 2) return null;
            const ps = ids.map((id) => points.get(id)!);
            const mid = [
              ps.reduce((n, p) => n + p[0], 0) / ps.length,
              ps.reduce((n, p) => n + p[1], 0) / ps.length,
            ];
            return (
              <g
                key={path.id}
                data-preview-path={path.id}
                data-lit={lit.has(path.id)}
              >
                {ps.map((p, i) => (
                  <path
                    key={i}
                    d={`M${p[0]} ${p[1]}L${mid[0]} ${mid[1]}`}
                    stroke={colors[path.color]}
                    opacity={lit.has(path.id) ? 1 : 0.45}
                    strokeWidth={lit.has(path.id) ? 5 : 2}
                  />
                ))}
                <rect
                  x={mid[0] - 14}
                  y={mid[1] - 14}
                  width="28"
                  height="28"
                  rx="2"
                  fill="#152225"
                  stroke={colors[path.color]}
                  strokeWidth={lit.has(path.id) ? 3 : 1}
                />
                <g
                  transform={`translate(${mid[0] - 12} ${mid[1] - 12})`}
                  color={colors[path.color]}
                >
                  <MotionIcon card={path.color} size={24} />
                </g>
              </g>
            );
          })}
          {visible.map((room) => {
            const [x, y] = points.get(room.id)!;
            const central = room.id === current.id;
            const reachable =
              scene === "move" && legal.some((r) => r.to === room.id) && !whole;
            const scale = whole ? 0.23 : 1;
            const w = central && !whole ? 176 : 144,
              h = central && !whole ? 126 : 88;
            return (
              <g
                key={room.id}
                transform={`translate(${x} ${y}) scale(${scale})`}
                data-preview-room={room.id}
                data-reachable={reachable}
                role={reachable ? "button" : "img"}
                tabIndex={reachable ? 0 : undefined}
                aria-label={reachable ? "移动到" + room.name : room.name}
                onClick={
                  reachable
                    ? () => {
                        const route = legal.find((r) => r.to === room.id)!;
                        record(
                          { type: "MOVE", actorId: sample.actor.id, ...route },
                          "已点选移动到" + room.name,
                        );
                      }
                    : undefined
                }
                onKeyDown={
                  reachable
                    ? (e) => {
                        if (e.key === "Enter") {
                          const r = legal.find((r) => r.to === room.id)!;
                          record(
                            { type: "MOVE", actorId: sample.actor.id, ...r },
                            "已点选移动",
                          );
                        }
                      }
                    : undefined
                }
              >
                <rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  rx="7"
                  fill="url(#mp-fog)"
                  stroke={
                    reachable ? "#f0d997" : central ? "#af9e73" : "#61726b"
                  }
                  strokeWidth={reachable ? 3 : 1.5}
                />
                <path
                  d={`M${-w / 2 + 8} ${h / 2 - 12}l22-24 18 14 22-30 30 31 27-19 18 28`}
                  fill="none"
                  stroke="#79887b"
                  strokeWidth="2"
                  opacity=".25"
                  pointerEvents="none"
                />
                <text
                  y={central && !whole ? -40 : -17}
                  textAnchor="middle"
                  fill="#f0e3bf"
                  fontSize="15"
                  fontWeight="600"
                  pointerEvents="none"
                >
                  {room.name}
                </text>
                {central && !whole ? (
                  <>
                    <image
                      href={art(sample.actor.asset)}
                      x="-18"
                      y="-27"
                      width="36"
                      height="36"
                      pointerEvents="none"
                    />
                    <text
                      y="15"
                      textAnchor="middle"
                      fill="#c3c9b6"
                      fontSize="10"
                      pointerEvents="none"
                    >
                      血点 {sample.actor.blood} ·{" "}
                      {sample.actor.health === "healthy" ? "健康" : "受伤"}
                    </text>
                    <g pointerEvents="none">
                      {sample.props
                        .filter((p) => p.room === room.id)
                        .slice(0, 4)
                        .map((p, i, all) => (
                          <image
                            key={p.id}
                            href={art(p.asset)}
                            x={(i - (all.length - 1) / 2) * 36 - 16}
                            y="23"
                            width="32"
                            height="32"
                          />
                        ))}
                    </g>
                  </>
                ) : (
                  <text
                    y="16"
                    textAnchor="middle"
                    fill={reachable ? "#f0d997" : "#aab8ad"}
                    fontSize="12"
                    pointerEvents="none"
                  >
                    {reachable ? "点这里移动" : "相邻房间"}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <button
          className="mp-map-toggle"
          data-testid="preview-overview"
          onClick={() => setWhole((v) => !v)}
        >
          {whole ? "返回当前" : "全图"}
        </button>
        <span className="mp-map-note">
          {whole ? "全图只作总览" : "邻接示意 · 场景使用轻量占位"}
        </span>
      </section>
      <footer className="mp-dock">
        {planning ? (
          <>
            <div className="mp-dock-heading">
              <h2>
                {sample.actor.side === "killer"
                  ? "依次选择两张牌"
                  : "选择一张移动牌"}
              </h2>
              <button
                className="mp-role"
                onClick={() =>
                  change(scene === "killer_plan" ? "plan" : "killer_plan")
                }
              >
                {scene === "killer_plan" ? "看逃生者" : "看杀手"}
              </button>
            </div>
            <div className="mp-hand">
              {sample.hand.map((card) => (
                <button
                  key={card}
                  data-preview-card={card}
                  aria-pressed={plan.includes(card)}
                  style={
                    { "--card-color": colors[card] } as React.CSSProperties
                  }
                  onClick={() => {
                    setPlan((p) =>
                      p.includes(card)
                        ? p.filter((c) => c !== card)
                        : p.length < sample.planCount
                          ? [...p, card]
                          : [card],
                    );
                    setTaps((n) => n + 1);
                    setNotice("");
                  }}
                >
                  <MotionIcon card={card} size={30} />
                  <span>{names[card]}</span>
                  {plan.includes(card) && <b>{plan.indexOf(card) + 1}</b>}
                </button>
              ))}
            </div>
            <button
              className="mp-primary"
              data-testid="preview-confirm-plan"
              disabled={plan.length !== sample.planCount}
              onClick={() =>
                record(
                  { type: "PLAN", actorId: sample.actor.id, cards: plan },
                  "计划提交位置演示完成",
                )
              }
            >
              确认计划 {plan.length}/{sample.planCount}
            </button>
          </>
        ) : scene === "move" ? (
          <>
            <div className="mp-dock-heading">
              <h2>点发光房间，直接移动</h2>
              <span
                className="mp-card-label"
                style={{ color: colors[sample.card ?? "blue"] }}
              >
                <MotionIcon card={sample.card ?? "blue"} size={28} />
                {names[sample.card ?? "blue"]}
              </span>
            </div>
            <p>不用找下方列表，也没有第二次确认。</p>
            <button className="mp-secondary" onClick={() => change("interact")}>
              查看交互样稿
            </button>
          </>
        ) : (
          <>
            <div className="mp-dock-heading">
              <h2>{active ? "确认本次操作" : "现在要做什么？"}</h2>
              <small>{current.name}</small>
            </div>
            <div className="mp-actions">
              {propActions.slice(0, 2).map((a, i) => (
                <button
                  key={i}
                  data-preview-action={i}
                  aria-pressed={picked === i}
                  onClick={() => {
                    setPicked(i);
                    setTaps((n) => n + 1);
                    setNotice("");
                  }}
                >
                  <img
                    src={art(
                      sample.props.find((p) => p.id === a.command.targetId)
                        ?.asset ?? "generator",
                    )}
                    alt=""
                  />
                  <span>
                    {a.command.action === "repair" ? "修理发电机" : a.label}
                  </span>
                </button>
              ))}
            </div>
            {active ? (
              <button
                className="mp-primary"
                data-testid="preview-confirm-action"
                onClick={() =>
                  record(
                    active.command,
                    "已确认" +
                      (active.command.action === "repair"
                        ? "修理发电机"
                        : active.label),
                  )
                }
              >
                确认{active.command.action === "repair" ? "修理" : "操作"}
              </button>
            ) : (
              <p>点操作，再确认。正式版在这里显示公共掷骰。</p>
            )}
            <button
              className="mp-secondary"
              data-testid="preview-end"
              onClick={() =>
                record(
                  { type: "END_TURN", actorId: sample.actor.id },
                  "已选择结束行动",
                )
              }
            >
              结束本次行动
            </button>
          </>
        )}
      </footer>
      {info && (
        <div
          className="mp-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="演示角色资料"
        >
          <section className="mp-sheet">
            <div>
              <h2>{sample.actor.name}</h2>
              <button aria-label="关闭角色资料" onClick={() => setInfo(false)}>
                关闭
              </button>
            </div>
            <p>
              血点 {sample.actor.blood} ·{" "}
              {sample.actor.health === "healthy" ? "健康" : "受伤"} ·
              仅显示公开的样稿资料
            </p>
            {sample.skills.map((s, i) => (
              <article key={i}>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </article>
            ))}
            <p>声音、震动、常亮与主屏幕安装将在方案确认后处理。</p>
          </section>
        </div>
      )}
    </main>
  );
}
