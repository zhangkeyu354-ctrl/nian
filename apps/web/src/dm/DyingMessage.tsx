import React, { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  DM_EVENTS,
  type DMSnapshot,
  type DMAction,
} from "../../../../packages/shared/src/dm-protocol.ts";
import {
  roles,
  defaultPool,
} from "../../../../packages/dying-message/src/index.ts";
import "./dm.css";
import { RoleArt } from "./RoleArt.tsx";
const titles: Record<string, string> = {
  NIGHT_PREPARATION: "夜幕降临",
  KILLER_SELECTION: "杀手正在行动",
  VICTIM_EVIDENCE: "死者留下遗言",
  SPECIAL_INFORMATION: "特殊能力结算",
  KILLER_FAKE_EVIDENCE: "杀手设置假遗言",
  INVESTIGATION: "圆桌发言",
  FIRST_VOTE: "第一次投票",
  DEFENSE: "最后的辩解",
  SECOND_VOTE: "第二次投票",
  ROUND_END: "本轮结束",
  GAME_OVER: "真相揭晓",
};
const roleName = (id: string) => roles.find((r) => r.roleId === id)?.name ?? id;
const image = (id: string) => "/assets/dying-message/" + id + ".webp";
const uiArt = (id: string) =>
  id === "card-back"
    ? "/assets/dying-message-hd/card-back.svg"
    : "/assets/dying-message-original/" + id + ".webp";
const roomURL = (code: string) => "/?game=dm&room=" + code;
function request(socket: Socket, event: string, data: unknown): Promise<any> {
  return new Promise((resolve) => {
    socket
      .timeout(8000)
      .emit(event, data, (err: Error | null, r: any) =>
        resolve(err ? { ok: false, error: "连接超时，请重试" } : r),
      );
  });
}
type PoolGroup = {
  key: string;
  title: string;
  hint: string;
  match: (r: (typeof roles)[number]) => boolean;
};
const poolGroups: PoolGroup[] = [
  {
    key: "killer",
    title: "杀手",
    hint: "有罪阵营，每晚行凶",
    match: (r) => r.canKill,
  },
  {
    key: "guilty",
    title: "有罪同伙",
    hint: "有罪阵营，不能杀人",
    match: (r) => r.faction === "GUILTY" && !r.canKill,
  },
  {
    key: "innocent",
    title: "无罪",
    hint: "找出杀手并投票处决",
    match: (r) => r.faction === "INNOCENT",
  },
];
const roleOf = (id: string) => roles.find((r) => r.roleId === id)!;
/** 按阵营分组的角色组合：杀手只能换成杀手类，无罪只能换成无罪类，改动立即生效。 */
function PoolEditor({
  pool,
  editable,
  onChange,
}: {
  pool: string[];
  editable: boolean;
  onChange: (pool: string[]) => void;
}) {
  const groups = poolGroups.map((g) => ({
    ...g,
    ids: pool.filter((id) => roleOf(id) && g.match(roleOf(id))),
  }));
  const replace = (gi: number, si: number, value: string) => {
    const next = groups.map((g, i) =>
      i === gi ? g.ids.map((x, j) => (j === si ? value : x)) : g.ids,
    );
    onChange(next.flat());
  };
  return (
    <section className="dm-pool" aria-label="本局角色组合">
      <h3>本局角色（{pool.length} 张，开局随机发给每人一张）</h3>
      {editable && (
        <p className="dm-pool-note">
          房主可以更换每张角色；杀手、有罪同伙、无罪的人数按人数配置固定。改动立即生效，所有人需要重新准备。
        </p>
      )}
      {groups.map((g, gi) =>
        g.ids.length === 0 ? null : (
          <div
            key={g.key}
            className={"dm-pool-group dm-pool-" + g.key}
            data-testid={"dm-pool-" + g.key}
          >
            <h4>
              {g.title} × {g.ids.length}
              <small>{g.hint}</small>
            </h4>
            <ul>
              {g.ids.map((id, si) => {
                const r = roleOf(id);
                return (
                  <li key={si} className="dm-pool-slot">
                    <RoleArt id={id} className="dm-pool-thumb" />
                    <div className="dm-pool-text">
                      {editable ? (
                        <select
                          aria-label={g.title + " " + (si + 1)}
                          value={id}
                          onChange={(e) => replace(gi, si, e.target.value)}
                        >
                          {roles.filter(g.match).map((o) => {
                            const used = pool.filter(
                              (x) => x === o.roleId,
                            ).length;
                            const full =
                              o.roleId !== id && used >= o.count;
                            return (
                              <option
                                key={o.roleId}
                                value={o.roleId}
                                disabled={full}
                              >
                                {o.name}
                                {full ? "（卡已用完）" : ""}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <strong>{r.name}</strong>
                      )}
                      <p>{r.ability}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
export function DyingMessage() {
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "",
  );
  const [snap, setSnap] = useState<DMSnapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(() => localStorage.getItem("dm-name") ?? ""),
    [joinCode, setJoinCode] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    [reveal, setReveal] = useState(false),
    [now, setNow] = useState(Date.now()),
    [editedPool, setEditedPool] = useState<string[]>([]),
    [showRules, setShowRules] = useState(false),
    [zoom, setZoom] = useState<string | null>(null),
    [hideResult, setHideResult] = useState(false);
  const socket = useMemo(() => io({ autoConnect: false }), []),
    codeRef = useRef(code);
  codeRef.current = code;
  const token = () => localStorage.getItem("dm-token-" + codeRef.current) ?? "";
  useEffect(() => {
    document.title = "请留遗言 · 桌游合集";
    const update = (s: DMSnapshot) => {
      setSnap(s);
      setError("");
    };
    const join = async () => {
      setConnected(true);
      if (codeRef.current) {
        const r = await request(socket, DM_EVENTS.join, {
          code: codeRef.current,
          token: token(),
        });
        if (r.ok) setSnap(r.snapshot);
        else setError(r.error);
      }
    };
    socket.on("connect", join);
    socket.on("disconnect", () => setConnected(false));
    socket.on(DM_EVENTS.update, update);
    socket.connect();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      socket.off();
      socket.disconnect();
    };
  }, [socket]);
  useEffect(() => {
    setSelection([]);
    setReveal(false);
  }, [snap?.view?.phase, snap?.view?.round]);
  useEffect(() => {
    setHideResult(false);
  }, [snap?.view?.winner]);
  useEffect(() => {
    if (snap) setEditedPool(snap.pool);
  }, [snap?.pool.join(",")]);
  useEffect(() => {
    const w = window as any;
    w.render_game_to_text = () =>
      JSON.stringify({
        game: "dying-message",
        code,
        connected,
        version: snap?.version,
        view: snap?.view ?? null,
        seats: snap?.players,
        coordinateSystem: "圆桌座位从顶部开始，顺时针排列；编号1起",
      });
    w.advanceTime = () => {};
    return () => {
      delete w.render_game_to_text;
      delete w.advanceTime;
    };
  }, [snap, code, connected]);
  async function go(next: string) {
    history.pushState(null, "", roomURL(next));
    codeRef.current = next;
    setCode(next);
    setSnap(null);
    const r = await request(socket, DM_EVENTS.join, {
      code: next,
      token: token(),
    });
    if (r.ok) setSnap(r.snapshot);
    else setError(r.error);
  }
  async function action(a: DMAction): Promise<boolean> {
    if (!snap || busy || !connected) return false;
    setBusy(true);
    try {
      const r = await request(socket, DM_EVENTS.action, {
        code,
        token: token(),
        version: snap.version,
        action: a,
      });
      if (!r.ok) setError(r.error);
      else if (r.snapshot) setSnap(r.snapshot);
      return !!r.ok;
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    const r = await request(socket, DM_EVENTS.create, {});
    setBusy(false);
    if (r.ok) await go(r.code);
    else setError(r.error);
  }
  const v = snap?.view,
    me = snap?.players.find((p) => p.id === snap.mySeat),
    host = snap?.hostId === snap?.mySeat,
    disabled = busy || !connected;
  const myRole = roles.find((r) => r.roleId === v?.me.roleId);
  const phase = v?.phase;
  const toggle = (id: string, max: number) =>
    setSelection((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : max === 1
          ? [id]
          : s.length < max
            ? [...s, id]
            : s,
    );
  // Server time offset is captured with each snapshot, then a local monotonic countdown is used.
  const offset = useRef(0);
  useEffect(() => {
    if (snap) offset.current = snap.serverNow - Date.now();
  }, [snap]);
  const left = Math.max(
    0,
    Math.ceil(((v?.deadline ?? 0) - now - offset.current) / 1000),
  );
  return (
    <main
      className={"dm-app dm-photo-v2 " + (code ? "dm-in-room" : "dm-at-home")}
    >
      <header className="dm-header">
        <a href="/">← 桌游合集</a>
        <strong>请留遗言</strong>
        <span>{code ? "房间 " + code : "Dying Message"}</span>
        <small role="status">{connected ? "已连接" : "正在重连…"}</small>
      </header>
      {error && (
        <p className="dm-error" role="alert">
          {error}
        </p>
      )}
      {!code ? (
        <>
          <section className="dm-home">
            <div>
              <p className="dm-eyebrow">熟人之间的视觉推理</p>
              <h1>请留遗言</h1>
              <p>
                留下真实的遗言，混入两张假线索。
                <br />
                和朋友围坐一桌，找出藏在你们之中的杀手。
              </p>
              <button
                data-testid="dm-create"
                disabled={disabled}
                onClick={create}
              >
                创建房间
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (joinCode.length === 4) void go(joinCode.toUpperCase());
                }}
              >
                <input
                  aria-label="请留遗言房间号"
                  placeholder="输入4位房间号"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <button disabled={disabled}>加入</button>
              </form>
              <button
                className="dm-link"
                onClick={() => setShowRules(!showRules)}
              >
                玩法与角色
              </button>
            </div>
            <img src={uiArt("card-back")} alt="请留遗言粉色牌背" />
          </section>
        </>
      ) : !snap ? (
        <p>正在打开房间…</p>
      ) : (
        <>
          <div className="dm-roomline">
            <span>
              {snap.players.length}/{snap.count} 人
            </span>
            <button
              className="dm-link"
              onClick={async () => {
                try {
                  const url = new URL(roomURL(code), location.origin);
                  const info = await fetch("/api/info").then((r) => r.json());
                  if (info.publicUrl) url.host = new URL(info.publicUrl).host;
                  if (info.publicUrl) url.protocol = "https:";
                  else if (
                    ["localhost", "127.0.0.1"].includes(location.hostname) &&
                    info.lan?.[0]
                  )
                    url.hostname = info.lan[0];
                  await navigator.clipboard.writeText(url.href);
                } catch {
                  setError("请复制浏览器地址分享给朋友");
                }
              }}
            >
              复制邀请链接
            </button>
            <button
              className="dm-link"
              onClick={() => setShowRules(!showRules)}
            >
              规则
            </button>
          </div>
          {!snap.mySeat ? (
            <section className="dm-intro">
              <h1>加入圆桌</h1>
              <p>
                房间 {code} · {snap.players.length}/{snap.count} 人
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const r = await request(socket, DM_EVENTS.claim, {
                    code,
                    name,
                  });
                  setBusy(false);
                  if (!r.ok) setError(r.error);
                  else {
                    localStorage.setItem("dm-name", name);
                    localStorage.setItem("dm-token-" + code, r.token);
                    const joined = await request(socket, DM_EVENTS.join, {
                      code,
                      token: r.token,
                    });
                    if (joined.ok) setSnap(joined.snapshot);
                  }
                }}
              >
                <input
                  aria-label="你的昵称"
                  placeholder="你的昵称"
                  value={name}
                  maxLength={12}
                  onChange={(e) => setName(e.target.value)}
                />
                <button disabled={disabled || !name.trim()}>入座</button>
              </form>
            </section>
          ) : (
            <>
              <section className="dm-stage">
                <p className="dm-eyebrow">
                  {v ? "第 " + v.round + " 轮" : "准备大厅"}
                </p>
                <h1>{v ? titles[v.phase] : "准备大厅"}</h1>
                <p>
                  {!v
                    ? "房主选择角色组合，开局随机秘密发放。"
                    : v.winner
                      ? v.winner === "INNOCENT"
                        ? "无罪阵营获胜"
                        : "有罪阵营获胜"
                      : v.me.alive
                        ? v.active
                          ? "轮到你操作"
                          : "等待其他玩家完成当前步骤"
                        : "你已死亡。请勿发言或提供额外线索。"}
                </p>
              </section>
              <div className="dm-play-layout">
                <section
                  className={
                    "dm-table " + (snap.count >= 8 ? "dm-table-dense" : "")
                  }
                  aria-label="圆桌座位"
                >
                  <div className="dm-tabletop">
                    <span>
                      {v?.speaker
                        ? `${snap.players.find((p) => p.id === v.speaker)?.seat}号发言`
                        : v
                          ? "请留遗言"
                          : "等待朋友"}
                    </span>
                    {v?.deadline && (
                      <strong data-testid="dm-countdown">
                        {Math.floor(left / 60)}:
                        {String(left % 60).padStart(2, "0")}
                      </strong>
                    )}
                    <small>
                      {phase === "INVESTIGATION"
                        ? "每人最多5分钟"
                        : `${snap.players.length}人圆桌`}
                    </small>
                    {v && v.history.length > 0 && (
                      <div
                        className="dm-center-evidence"
                        aria-label="本轮公开遗言"
                      >
                        {v.history.at(-1)!.cards.map((id, i) => (
                          <button
                            key={id}
                            onClick={() => setZoom(id)}
                            aria-label={"放大公开遗言 " + (i + 1)}
                          >
                            <img src={image(id)} alt={"公开遗言 " + (i + 1)} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {Array.from({ length: snap.count }, (_, i) => {
                    const p = snap.players[i],
                      vp = v?.players.find((x) => x.id === p?.id),
                      target =
                        p &&
                        v?.active &&
                        v.legalTargets.includes(p.id) &&
                        [
                          "NIGHT_PREPARATION",
                          "KILLER_SELECTION",
                          "FIRST_VOTE",
                          "SECOND_VOTE",
                        ].includes(phase ?? "");
                    const angle = (2 * Math.PI * i) / snap.count - Math.PI / 2;
                    return (
                      <button
                        key={i}
                        data-testid={"dm-seat-" + (i + 1)}
                        style={{
                          left: 50 + 40 * Math.cos(angle) + "%",
                          top: 50 + 39 * Math.sin(angle) + "%",
                        }}
                        disabled={!target || disabled}
                        aria-pressed={p ? selection.includes(p.id) : false}
                        className={
                          "dm-seat " +
                          (vp && !vp.alive ? "dead " : "") +
                          (p?.id === v?.speaker ? "speaking " : "") +
                          (p?.id === snap.mySeat ? "self" : "")
                        }
                        onClick={() =>
                          p &&
                          toggle(
                            p.id,
                            phase === "KILLER_SELECTION" ? v!.required : 1,
                          )
                        }
                      >
                        <span className="dm-seat-portrait" aria-hidden="true">
                          {vp?.roleId && (!vp.alive || v?.winner) ? (
                            <RoleArt id={vp.roleId} />
                          ) : (
                            <img src={uiArt("card-back")} alt="" />
                          )}
                          <b>{i + 1}</b>
                        </span>
                        <span>{p?.name ?? "空座位"}</span>
                        <small>
                          {vp
                            ? vp.alive
                              ? vp.roleId && v?.winner
                                ? roleName(vp.roleId)
                                : p.id === snap.mySeat
                                  ? "你"
                                  : "存活"
                              : roleName(vp.roleId ?? "") + " · 已死亡"
                            : p
                              ? p.ready
                                ? "已准备"
                                : p.connected
                                  ? "未准备"
                                  : "离线"
                              : "等待入座"}
                        </small>
                      </button>
                    );
                  })}
                </section>
                <aside className="dm-sidebar">
                  {!v ? (
                    <section className="dm-controls">
                      <button
                        data-testid="dm-ready"
                        disabled={disabled}
                        onClick={() => action({ type: "READY" })}
                      >
                        {me?.ready ? "取消准备" : "我准备好了"}
                      </button>
                      {host && (
                        <>
                          <label>
                            本局人数
                            <select
                              aria-label="本局人数"
                              value={snap.count}
                              disabled={disabled}
                              onChange={(e) =>
                                action({
                                  type: "SET_COUNT",
                                  count: Number(e.target.value),
                                })
                              }
                            >
                              {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                                <option key={n}>{n}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            data-testid="dm-start"
                            disabled={
                              disabled ||
                              snap.players.length !== snap.count ||
                              snap.players.some((p) => !p.ready)
                            }
                            onClick={() => action({ type: "START" })}
                          >
                            随机发牌并开始
                          </button>
                        </>
                      )}
                      <PoolEditor
                        pool={editedPool}
                        editable={!!host && !disabled}
                        onChange={async (next) => {
                          const before = snap.pool;
                          setEditedPool(next);
                          if (!(await action({ type: "SET_POOL", pool: next })))
                            setEditedPool(before);
                        }}
                      />
                    </section>
                  ) : (
                    <>
                      <section
                        className={
                          "dm-private " + (reveal ? "revealed" : "sealed")
                        }
                      >
                        {!reveal && (
                          <img
                            className="dm-sealed-back"
                            src={uiArt("card-back")}
                            alt="隐藏的身份牌"
                          />
                        )}
                        <button
                          className="dm-link"
                          onClick={() => setReveal(!reveal)}
                        >
                          {reveal ? "收起我的角色" : "查看我的秘密角色"}
                        </button>
                        {reveal && (
                          <div
                            className="dm-role-card"
                            data-faction={myRole?.faction}
                          >
                            <RoleArt className="dm-role-art" id={v.me.roleId} />
                            <div className="dm-role-description">
                              <h2>
                                {myRole?.name}{" "}
                                <small>
                                  {myRole?.faction === "GUILTY"
                                    ? "有罪阵营"
                                    : "无罪阵营"}
                                </small>
                              </h2>
                              <p>{myRole?.ability}</p>
                            </div>
                          </div>
                        )}
                        {v.me.fated && (
                          <p>
                            你被选为命运之人，其中一方死亡，另一方也会死亡。
                          </p>
                        )}
                        {v.killers.length > 0 &&
                          (!v.me.alive || reveal) &&
                          (() => {
                            const isKiller = v.killers.some(
                              (k) => k.id === v.me.id,
                            );
                            const shown = isKiller
                              ? v.killers.filter((k) => k.id !== v.me.id)
                              : v.killers;
                            const label = isKiller
                              ? "杀手同伴"
                              : v.killers.length > 1
                                ? "你看到的杀手（共 " + v.killers.length + " 人）"
                                : "你看到的杀手";
                            return (
                              <p data-testid="dm-killers">
                                {label}：
                                {shown.length
                                  ? shown
                                      .map((k) => k.seat + "号 " + k.name)
                                      .join("、")
                                  : "无，你是唯一的杀手"}
                              </p>
                            );
                          })()}
                      </section>
                      <section className="dm-controls" aria-label="当前行动">
                        {v.active &&
                          v.teamChoices
                            .filter((p) => p.playerId !== v.me.id)
                            .map((p) => (
                              <button
                                className="dm-link"
                                key={p.playerId}
                                onClick={() => setSelection(p.choices)}
                              >
                                采用
                                {
                                  snap.players.find((x) => x.id === p.playerId)
                                    ?.seat
                                }
                                号已提交的共同选择
                              </button>
                            ))}
                        {v.forensic ? (
                          <>
                            <h2>鉴定上一轮的一张遗言</h2>
                            <Cards
                              ids={v.forensicCards}
                              selected={selection}
                              onSelect={(id) => toggle(id, 1)}
                              disabled={disabled}
                            />
                            <button
                              disabled={disabled || selection.length !== 1}
                              onClick={() =>
                                action({ type: "FORENSIC", card: selection[0] })
                              }
                            >
                              宣布这张遗言的真假
                            </button>
                          </>
                        ) : null}
                        {v.active && phase === "NIGHT_PREPARATION" && (
                          <>
                            <p>
                              {v.me.roleId === "soulmate"
                                ? "点击圆桌上一名其他玩家，选择命运之人。"
                                : "点击圆桌选择要保护的玩家。不能保护自己或其他名犬。"}
                            </p>
                            <button
                              disabled={disabled || selection.length !== 1}
                              onClick={() =>
                                action({
                                  type: "PREPARE",
                                  target: selection[0],
                                })
                              }
                            >
                              确认选择
                            </button>
                          </>
                        )}
                        {v.active && phase === "KILLER_SELECTION" && (
                          <>
                            <p>
                              点击玩家图标，选择 {v.required}{" "}
                              名目标。所有杀手须提交相同目标。
                            </p>
                            <button
                              data-testid="dm-kill"
                              disabled={
                                disabled || selection.length !== v.required
                              }
                              onClick={() =>
                                action({ type: "KILL", targets: selection })
                              }
                            >
                              确认行凶
                            </button>
                          </>
                        )}
                        {v.active &&
                          ["VICTIM_EVIDENCE", "KILLER_FAKE_EVIDENCE"].includes(
                            phase!,
                          ) && (
                            <>
                              <h2>
                                {phase === "VICTIM_EVIDENCE"
                                  ? "留下真实遗言"
                                  : "混入假遗言"}
                              </h2>
                              <p>
                                选择 {v.required} 张。
                                {phase === "VICTIM_EVIDENCE"
                                  ? "若有多位死者，需共同选择。"
                                  : "所有存活杀手需选择相同的组合。"}
                              </p>
                              {v.selection.length > 0 && (
                                <p role="status">
                                  已提交选择，等待其他人一致；仍可调整后重新提交。
                                </p>
                              )}
                              <Cards
                                ids={v.pool}
                                selected={selection}
                                onSelect={(id) => toggle(id, v.required)}
                                disabled={disabled}
                              />
                              <button
                                data-testid="dm-evidence-confirm"
                                disabled={
                                  disabled || selection.length !== v.required
                                }
                                onClick={() =>
                                  action({
                                    type:
                                      phase === "VICTIM_EVIDENCE"
                                        ? "TRUE"
                                        : "FAKE",
                                    cards: selection,
                                  })
                                }
                              >
                                确认这组遗言
                              </button>
                            </>
                          )}
                        {v.active && phase === "SPECIAL_INFORMATION" && (
                          <>
                            <h2>这是死者真正的遗言</h2>
                            <p>查看窗口：最多5秒</p>
                            <Cards ids={v.trueCards} />
                            <button
                              data-testid="dm-info-ack"
                              disabled={disabled}
                              onClick={() => action({ type: "INFO_ACK" })}
                            >
                              已查看，继续
                            </button>
                          </>
                        )}
                        {phase === "INVESTIGATION" && !v.forensic && (
                          <>
                            <p>
                              {
                                snap.players.find((p) => p.id === v.speaker)
                                  ?.seat
                              }
                              号正在发言。按座位号轮流，每人最多5分钟，全部结束后投票。
                            </p>
                            {v.active && (
                              <button
                                data-testid="dm-speech-end"
                                disabled={disabled}
                                onClick={() => action({ type: "SPEAK_END" })}
                              >
                                我说完了，下一位
                              </button>
                            )}
                          </>
                        )}
                        {["FIRST_VOTE", "SECOND_VOTE"].includes(phase!) && (
                          <>
                            <p>
                              点击圆桌玩家投票。
                              {phase === "SECOND_VOTE"
                                ? "只有同一人再次过半才会处决。"
                                : "超过存活人数的一半才进入辩解。"}
                              已提交 {v.voted} 票。
                            </p>
                            {v.active ? (
                              <button
                                data-testid="dm-vote"
                                disabled={disabled || selection.length !== 1}
                                onClick={() =>
                                  action({ type: "VOTE", target: selection[0] })
                                }
                              >
                                确认投票
                              </button>
                            ) : (
                              v.myVote && <p>你已投票，等待统一结算。</p>
                            )}
                          </>
                        )}
                        {phase === "DEFENSE" && (
                          <>
                            <p>
                              {
                                snap.players.find((p) => p.id === v.suspect)
                                  ?.seat
                              }
                              号获得一次辩解机会。
                            </p>
                            {v.active && (
                              <button
                                data-testid="dm-defense-end"
                                disabled={disabled}
                                onClick={() => action({ type: "DEFENSE_END" })}
                              >
                                辩解结束，开始第二次投票
                              </button>
                            )}
                          </>
                        )}
                        {phase === "ROUND_END" && (
                          <>
                            <p>
                              本轮已结算。
                              {v.suspect
                                ? "查看圆桌玩家存活状态。"
                                : "无人连续两次获得过半票。"}
                            </p>
                            {v.active && !v.forensic && (
                              <button
                                data-testid="dm-next"
                                disabled={disabled}
                                onClick={() => action({ type: "NEXT" })}
                              >
                                下一轮
                              </button>
                            )}
                          </>
                        )}
                        {v.winner && (
                          <button
                            data-testid="dm-show-result"
                            onClick={() => setHideResult(false)}
                          >
                            查看结算
                          </button>
                        )}
                        {v.winner && host && (
                          <button
                            data-testid="dm-restart"
                            disabled={disabled}
                            onClick={() => action({ type: "RESTART" })}
                          >
                            再来一局
                          </button>
                        )}
                      </section>
                      {v.history.length > 0 && (
                        <section className="dm-history">
                          <h2>公开遗言</h2>
                          {[...v.history].reverse().map((h) => (
                            <div key={h.round}>
                              <h3>
                                第{h.round}轮 ·{" "}
                                {h.victims
                                  .map(
                                    (id) =>
                                      snap.players.find((p) => p.id === id)
                                        ?.seat + "号",
                                  )
                                  .join("、")}
                              </h3>
                              <Cards ids={h.cards} revealed={h.revealed} />
                            </div>
                          ))}
                        </section>
                      )}
                      {v.voteResults.length > 0 && (
                        <details className="dm-log">
                          <summary>投票记录</summary>
                          {v.voteResults.map((r, i) => (
                            <p key={i}>
                              第{r.round}轮第{r.ballot}次：
                              {Object.entries(r.tally)
                                .map(
                                  ([id, n]) =>
                                    snap.players.find((p) => p.id === id)
                                      ?.seat +
                                    "号 " +
                                    n +
                                    "票",
                                )
                                .join("，")}
                            </p>
                          ))}
                        </details>
                      )}
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
        </>
      )}
      {zoom && <EvidenceZoom id={zoom} onClose={() => setZoom(null)} />}
      {snap?.view?.winner && !hideResult && !zoom && (
        <ResultScreen
          view={snap.view}
          host={!!host}
          busy={busy || !connected}
          onClose={() => setHideResult(true)}
          onRestart={() => action({ type: "RESTART" })}
        />
      )}
      {showRules && (
        <section className="dm-rules">
          <h2>玩法与角色</h2>
          <p>
            熟人之间自由联想，外部语音讨论。按座位轮流发言，每人5分钟。死者只通过选图留下线索，不额外发言。证据随机抽取，不收集或匹配任何人的现实特征。
          </p>
          <p>
            两次投票均由全部存活者投向一名存活玩家；同一人连续两次超过存活人数的一半才处决。第一次无人过半，或第二次改为其他人过半，当天无人处决。
          </p>
          <p>
            所有具备杀人能力的角色淘汰，无罪阵营获胜；存活杀手数达到存活无罪人数，有罪阵营获胜。共犯、主谋不计为杀手。
          </p>
          {roles.map((r) => (
            <details key={r.roleId}>
              <summary>
                {r.name} ×{r.count}
              </summary>
              <div className="dm-rule-role">
                <RoleArt id={r.roleId} />
                <p>{r.ability}</p>
              </div>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
function Cards({
  ids,
  selected = [],
  onSelect,
  disabled,
  revealed = {},
}: {
  ids: string[];
  selected?: string[];
  onSelect?: (id: string) => void;
  disabled?: boolean;
  revealed?: Record<string, boolean>;
}) {
  return (
    <div className="dm-cards">
      {ids.map((id, i) =>
        onSelect ? (
          <button
            key={id}
            data-card={id}
            aria-label={"证据图 " + (i + 1)}
            aria-pressed={selected.includes(id)}
            disabled={disabled}
            onClick={() => onSelect(id)}
          >
            <img src={image(id)} alt={"证据图 " + (i + 1)} loading="lazy" />
          </button>
        ) : (
          <figure key={id}>
            <img src={image(id)} alt={"公开证据 " + (i + 1)} loading="lazy" />
            {Object.hasOwn(revealed, id) && (
              <figcaption>{revealed[id] ? "真遗言" : "假遗言"}</figcaption>
            )}
          </figure>
        ),
      )}
    </div>
  );
}

function EvidenceZoom({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dm-zoom" onClose={onClose}>
      <button autoFocus onClick={() => ref.current?.close()}>
        关闭大图
      </button>
      <img src={image(id)} alt="放大的公开遗言" />
    </dialog>
  );
}

/** 终局结算：谁赢了、为什么赢、每个人的身份，一眼看清。 */
function ResultScreen({
  view,
  host,
  busy,
  onClose,
  onRestart,
}: {
  view: NonNullable<DMSnapshot["view"]>;
  host: boolean;
  busy: boolean;
  onClose: () => void;
  onRestart: () => void;
}) {
  const winner = view.winner!;
  const faction = (roleId?: string) =>
    roles.find((r) => r.roleId === roleId)?.faction;
  const myFaction = faction(view.me.roleId);
  const iWon = myFaction === winner;
  const alive = view.players.filter((p) => p.alive);
  const reason =
    winner === "INNOCENT"
      ? "所有杀手都已出局"
      : alive.length === 0
        ? "人质连锁，全员死亡"
        : "杀手人数追平了存活的无罪玩家";
  const sides: ("INNOCENT" | "GUILTY")[] =
    winner === "INNOCENT" ? ["INNOCENT", "GUILTY"] : ["GUILTY", "INNOCENT"];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      className={"dm-result dm-result-" + winner.toLowerCase()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dm-result-title"
      data-testid="dm-result"
    >
      <div className="dm-result-card" ref={ref} tabIndex={-1}>
        <p className="dm-result-round">第 {view.round} 轮 · 真相揭晓</p>
        <h2 id="dm-result-title">
          {winner === "INNOCENT" ? "无罪阵营获胜" : "有罪阵营获胜"}
        </h2>
        <p className="dm-result-reason">{reason}</p>
        <p className={"dm-result-me " + (iWon ? "won" : "lost")}>
          {iWon ? "你赢了！" : "你输了"}
        </p>
        {sides.map((side) => {
          const list = view.players
            .filter((p) => faction(p.roleId) === side)
            .sort((a, b) => a.seat - b.seat);
          return (
            <section
              key={side}
              className={
                "dm-result-side " + (side === winner ? "win" : "lose")
              }
            >
              <h3>
                {side === "INNOCENT" ? "无罪阵营" : "有罪阵营"}
                <small>{side === winner ? "胜利" : "失败"}</small>
              </h3>
              <ul>
                {list.map((p) => (
                  <li
                    key={p.id}
                    className={p.id === view.me.id ? "is-me" : ""}
                  >
                    <RoleArt id={p.roleId!} className="dm-result-thumb" />
                    <span className="dm-result-name">
                      <b>
                        {p.seat}号 {p.name}
                        {p.id === view.me.id ? "（你）" : ""}
                      </b>
                      <span>
                        {roleName(p.roleId ?? "")} ·{" "}
                        {p.alive ? "存活" : "已死亡"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <div className="dm-result-actions">
          {host ? (
            <button
              className="primary"
              disabled={busy}
              onClick={onRestart}
              data-testid="dm-result-restart"
            >
              再来一局
            </button>
          ) : (
            <p>等待房主开始下一局</p>
          )}
          <button onClick={onClose} data-testid="dm-result-close">
            查看圆桌与遗言
          </button>
        </div>
      </div>
    </div>
  );
}
