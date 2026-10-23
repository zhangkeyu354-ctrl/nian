import React, { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  XB_EVENTS as E,
  type XBSnapshot,
  type XBCommand,
  type XBEffect,
} from "../../../../packages/shared/src/xb-protocol.ts";
import "./xb.css";
const roles: Record<string, string> = {
  guesser: "猜测者",
  truth: "老实人",
  bluffer: "瞎掰人",
};
type Reply = {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string;
  snapshot?: XBSnapshot;
};
const request = (socket: Socket, event: string, data: object): Promise<Reply> =>
  new Promise((resolve, reject) =>
    socket
      .timeout(8000)
      .emit(event, data, (err: Error | null, r: Reply) =>
        err
          ? reject(Error("连接超时，请稍后重试"))
          : r?.ok
            ? resolve(r)
            : reject(Error(r?.error ?? "操作失败")),
      ),
  );
type Fx = XBEffect & {
  key: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
};
export function Xiabaiwang() {
  const code =
    new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const socket = useRef<Socket | null>(null);
  const [snap, setSnap] = useState<XBSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem("xb-name") ?? "");
  const [roomInput, setRoomInput] = useState("");
  const [mode, setMode] = useState<"POOP" | "CHALLENGE" | "GUESS" | null>(null);
  const [selected, setSelected] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [animations, setAnimations] = useState(
    () =>
      localStorage.getItem("xb-animation") !== "off" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const prefs = useRef({ animations, sound });
  prefs.current = { animations, sound };
  const [fx, setFx] = useState<Fx[]>([]);
  const [notice, setNotice] = useState("");
  const serial = useRef(0);
  const dialog = useRef<HTMLElement | null>(null);
  const latest = useRef<XBSnapshot | null>(null);
  latest.current = snap;
  const key = "xb-token:" + code;
  useEffect(() => {
    document.title = "瞎掰王 · 桌游合集";
    const s = io({ reconnection: true });
    socket.current = s;
    const update = (v: XBSnapshot) =>
      setSnap((old) => (old && old.version > v.version ? old : v));
    s.on("connect", () => {
      setConnected(true);
      setError("");
      const token = localStorage.getItem(key);
      if (code && token)
        request(s, E.join, { code, token })
          .then((r) => {
            if (r.snapshot) update(r.snapshot);
          })
          .catch((e) => setError(e.message));
    });
    s.on("disconnect", () => setConnected(false));
    s.on(E.update, update);
    s.on(E.effects, (batch: XBEffect[]) => {
      const now = latest.current;
      const labels = (id: string) =>
        now?.players.find((p) => p.id === id)?.name ?? "玩家";
      setNotice(
        batch
          .map(
            (e) =>
              `${labels(e.from)}向${labels(e.target)}扔了💩${e.count > 1 ? "×" + e.count : ""}`,
          )
          .join("；"),
      );
      if (prefs.current.sound && audio.current) {
        const a = audio.current;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(180, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(65, a.currentTime + 0.13);
        g.gain.setValueAtTime(0.05, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.15);
        o.connect(g).connect(a.destination);
        o.start();
        o.stop(a.currentTime + 0.16);
      }
      if (prefs.current.animations) {
        const mapped = batch.slice(0, 10).flatMap((e) => {
          const from = document
            .getElementById("xb-avatar-" + e.from)
            ?.getBoundingClientRect();
          const to = document
            .getElementById("xb-avatar-" + e.target)
            ?.getBoundingClientRect();
          if (!from || !to) return [];
          return [
            {
              ...e,
              key: ++serial.current,
              x: from.x + from.width / 2,
              y: from.y + from.height / 2,
              dx: to.x + to.width / 2 - (from.x + from.width / 2),
              dy: to.y + to.height / 2 - (from.y + from.height / 2),
            },
          ];
        });
        setFx((old) => [...old, ...mapped].slice(-20));
      }
    });
    return () => {
      s.disconnect();
      socket.current = null;
      audio.current?.close();
      audio.current = null;
    };
  }, [code, key]);
  useEffect(() => {
    setMode(null);
    setSelected("");
    setConfirm(false);
  }, [snap?.view?.round, snap?.view?.phase]);
  useEffect(() => {
    if (!confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setConfirm(false);
        return;
      }
      if (e.key !== "Tab") return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [confirm, busy]);
  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);
  async function run(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const command = (c: XBCommand) =>
    request(socket.current!, E.command, { command: c });
  const view = snap?.view;
  const me = snap?.me;
  const isGuesser = me && me === view?.guesser;
  const label = (id: string | null | undefined) =>
    snap?.players.find((p) => p.id === id)?.name ?? "无人";
  const choose = (m: typeof mode) => {
    setMode(m);
    setSelected("");
    setConfirm(false);
  };
  return (
    <main className="xb-app">
      <header className="xb-header">
        <a href="/">← 桌游合集</a>
        <h1>瞎掰王</h1>
        <span role="status">{connected ? "已连接" : "正在重连…"}</span>
      </header>
      <p className="xb-sub">3～10人 · 冷知识与身份推理 · 配合外部语音</p>
      {error && (
        <p className="xb-error" role="alert">
          {error}
        </p>
      )}
      {!code ? (
        <section className="xb-section">
          <h2>朋友都到齐了吗？</h2>
          <button
            disabled={!connected || busy}
            onClick={() =>
              run(async () => {
                const r = await request(socket.current!, E.create, {});
                location.href = "/?game=xb&room=" + r.code;
              })
            }
          >
            创建房间
          </button>
          <label>
            房间号
            <input
              value={roomInput}
              maxLength={6}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
            />
          </label>
          <button
            disabled={!/^[A-Z0-9]{6}$/.test(roomInput)}
            onClick={() => (location.href = "/?game=xb&room=" + roomInput)}
          >
            加入房间
          </button>
        </section>
      ) : !snap ? (
        <section className="xb-section">
          <h2>房间 {code}</h2>
          <label>
            你的昵称
            <input
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            disabled={!connected || busy || !name.trim()}
            onClick={() =>
              run(async () => {
                const r = await request(socket.current!, E.join, {
                  code,
                  name,
                });
                if (r.token) localStorage.setItem(key, r.token);
                localStorage.setItem("xb-name", name);
                if (r.snapshot) setSnap(r.snapshot);
              })
            }
          >
            进入房间
          </button>
          <p>刷新会使用本设备身份重连。请勿清除浏览器记录。</p>
        </section>
      ) : (
        <>
          <div className="xb-room">
            <strong>房间 {code}</strong>
            <button
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(location.href);
                  setNotice("邀请链接已复制");
                })
              }
            >
              复制邀请链接
            </button>
          </div>
          {!view ? (
            <section className="xb-section">
              <h2>等待朋友 · {snap.players.length}/10</h2>
              <p>至少3人。开局后固定座位，每人依次担任一次猜测者。</p>
              {me === snap.host ? (
                <button
                  disabled={busy || !connected || snap.players.length < 3}
                  onClick={() => run(() => command({ type: "START" }))}
                >
                  开始游戏
                </button>
              ) : (
                <p>等待房主开始。</p>
              )}
            </section>
          ) : (
            <section className="xb-question">
              <p>
                第 {view.round}/{view.totalRounds} 轮 · 难度{" "}
                {"★".repeat(view.difficulty)}
              </p>
              <h2>{view.question}</h2>
              <p>
                <b>猜测者：{label(view.guesser)}</b>
              </p>
              <p>
                当前发言者：{label(view.speaker)}{" "}
                <small>（自愿标记，自由讨论）</small>
              </p>
              <p className="xb-role">
                你的身份：
                {roles[view.players.find((p) => p.id === me)?.role ?? ""] ??
                  "未入座"}
              </p>
              {view.answer && (
                <div className="xb-answer">
                  <h3>
                    {view.phase === "discussion"
                      ? "只有你能看到的真实答案"
                      : "正确答案"}
                  </h3>
                  <p>{view.answer}</p>
                  {view.phase !== "discussion" && (
                    <a href={view.source} target="_blank" rel="noreferrer">
                      事实资料来源
                    </a>
                  )}
                </div>
              )}
              {view.phase === "discussion" ? (
                <p>请在外部语音中自由解释、追问。网站不接入麦克风。</p>
              ) : (
                <h3>
                  {view.phase === "over" ? "本局结束 · 最终排名" : "本轮已揭晓"}
                </h3>
              )}
            </section>
          )}
          {view?.muted && (
            <p className="xb-mute" role="status">
              📢 {label(view.muted)}本轮禁止发言；仍可被指认，也可扔粑粑。
            </p>
          )}
          {mode && (
            <p className="xb-prompt" role="status">
              点击下方玩家头像，
              {mode === "POOP"
                ? "选择扔粑粑目标"
                : mode === "GUESS"
                  ? "选择真正的老实人"
                  : "选择本轮禁止发言的玩家"}
              。<button onClick={() => choose(null)}>取消选择</button>
            </p>
          )}
          <section className="xb-players" aria-label="全体玩家">
            {snap.players.map((p, i) => {
              const vp = view?.players.find((v) => v.id === p.id);
              return (
                <div
                  key={p.id}
                  className={
                    "xb-player " + (selected === p.id ? "xb-selected" : "")
                  }
                >
                  <button
                    id={"xb-avatar-" + p.id}
                    className="xb-avatar"
                    aria-label={"选择 " + p.name}
                    disabled={
                      !mode ||
                      busy ||
                      !connected ||
                      (mode !== "POOP" && p.id === view?.guesser)
                    }
                    onClick={() => {
                      setSelected(p.id);
                      setConfirm(true);
                    }}
                  >
                    <span aria-hidden="true">
                      {
                        [
                          "🐱",
                          "🐸",
                          "🐻",
                          "🦊",
                          "🐼",
                          "🐙",
                          "🐰",
                          "🦁",
                          "🐧",
                          "🐨",
                        ][i]
                      }
                    </span>
                  </button>
                  <b>
                    {p.name}
                    {p.id === me ? "（你）" : ""}
                  </b>
                  <small>
                    {p.connected ? "在线" : "离线"}
                    {p.id === snap.host ? " · 房主" : ""}
                  </small>
                  {vp && (
                    <>
                      <span>
                        {vp.role ? roles[vp.role] : "身份保密"} · {vp.score}分
                      </span>
                      {view?.muted === p.id && <strong>🔇 本轮禁言</strong>}
                      {view?.speaker === p.id && <strong>正在发言</strong>}
                    </>
                  )}
                </div>
              );
            })}
          </section>
          {view?.phase === "discussion" && (
            <button
              disabled={!connected || busy || view.muted === me}
              onClick={() =>
                run(() =>
                  command({
                    type: "SPEAK",
                    target: view.speaker === me ? null : me!,
                    round: view.round,
                  }),
                )
              }
            >
              {view.speaker === me ? "结束发言标记" : "🙋 我在发言"}
            </button>
          )}
          {view?.phase === "reveal" && me === snap.host && (
            <button
              className="xb-next"
              disabled={busy || !connected}
              onClick={() =>
                run(() => command({ type: "NEXT", round: view.round }))
              }
            >
              {view.round === view.totalRounds ? "查看最终排名" : "开始下一轮"}
            </button>
          )}
          {view?.phase === "over" && (
            <ol className="xb-section">
              {[...view.players]
                .sort((a, b) => b.score - a.score)
                .map((p) => (
                  <li key={p.id}>
                    {p.name} · {p.score}分
                  </li>
                ))}
            </ol>
          )}
          {!!view?.history.length && (
            <details className="xb-section">
              <summary>历史得分 · {view.history.length}轮</summary>
              {view.history.map((h) => (
                <article key={h.round}>
                  <h3>
                    第{h.round}轮 · {h.question}
                  </h3>
                  <p>
                    猜测者{label(h.guesser)}指认{label(h.selected)}；老实人是
                    {label(h.truth)}。
                    {h.challenged && `质疑了${label(h.challenged)}。`}
                  </p>
                  <p>
                    {snap.players
                      .map(
                        (p) =>
                          `${p.name} ${h.delta[p.id] >= 0 ? "+" : ""}${h.delta[p.id]}`,
                      )
                      .join(" / ")}
                  </p>
                  <p>{h.answer}</p>
                </article>
              ))}
            </details>
          )}
          <nav className="xb-dock" aria-label="游戏操作">
            <button
              disabled={!connected || busy || cooldown > 0}
              onClick={() => choose("POOP")}
            >
              💩 扔粑粑{cooldown ? `（${cooldown}s）` : ""}
            </button>
            {isGuesser && view?.phase === "discussion" && (
              <>
                <button
                  disabled={!connected || busy || !!view.muted}
                  onClick={() => choose("CHALLENGE")}
                >
                  📢 你在放屁！{view.muted ? "（已使用）" : ""}
                </button>
                <button
                  disabled={!connected || busy}
                  onClick={() => choose("GUESS")}
                >
                  🎯 指认真正的老实人
                </button>
              </>
            )}
          </nav>
        </>
      )}
      <p className="xb-notice" aria-live="polite">
        {notice}
      </p>
      <div className="xb-preferences">
        <label>
          <input
            type="checkbox"
            checked={animations}
            onChange={(e) => {
              setAnimations(e.target.checked);
              localStorage.setItem(
                "xb-animation",
                e.target.checked ? "on" : "off",
              );
              if (!e.target.checked) setFx([]);
            }}
          />
          互动动画
        </label>
        <label>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              if (e.target.checked) {
                audio.current ??= new AudioContext();
                void audio.current.resume();
              }
            }}
          />
          互动音效
        </label>
      </div>
      <details className="xb-section">
        <summary>规则与所选版本</summary>
        <p>
          每轮一名公开猜测者、一名秘密老实人，其余为瞎掰人。仅老实人看到答案，讨论不限顺序。猜测者指认后公开全部身份并结算。
        </p>
        <p>
          本线上玩法：3～10人、每人按加入顺序任一次猜测者。难度为原创题目的编辑分级。
        </p>
        <p>
          基础计分候选方案（待原版资料核对，并非已确认官方规则）：猜中时猜测者和老实人各得难度分；猜错时被选中的瞎掰人得难度分。
        </p>
        <p>
          「你在放屁！」按用户指定、参考地区版「公三小／收皮啦！」：每轮一次，禁言持续至本轮结束，不提前公开身份。结算时命中瞎掰人：猜测者+1、目标-1；误中老实人：猜测者-3。可继续指认被禁言者，不操作语音软件。
        </p>
        <p>💩是原创娱乐，无规则影响。每人约2秒冷却，可关闭动画或声音。</p>
      </details>
      {confirm && mode && (
        <div className="xb-overlay">
          <section
            ref={dialog}
            className="xb-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="确认目标"
          >
            <h2>
              {mode === "POOP"
                ? "💩 扔向"
                : mode === "CHALLENGE"
                  ? "📢 本轮禁止发言："
                  : "🎯 指认为老实人："}
              {label(selected)}
            </h2>
            <p>
              {mode === "POOP"
                ? "仅播放娱乐反馈，不影响规则。"
                : "确认后不可撤销。"}
              {mode === "GUESS" ? "将立即揭晓全部身份并结算。" : ""}
            </p>
            <button
              autoFocus
              disabled={busy || !connected}
              onClick={() =>
                run(async () => {
                  if (mode === "POOP") {
                    await request(socket.current!, E.poop, {
                      target: selected,
                    });
                    setCooldown(2);
                  } else if (view)
                    await command({
                      type: mode,
                      target: selected,
                      round: view.round,
                    });
                  choose(null);
                })
              }
            >
              确认
            </button>
            <button disabled={busy} onClick={() => setConfirm(false)}>
              返回选择
            </button>
          </section>
        </div>
      )}
      {fx.map((f) => (
        <span
          key={f.key}
          className="xb-poop"
          aria-hidden="true"
          style={
            {
              left: f.x,
              top: f.y,
              "--dx": f.dx + "px",
              "--dy": f.dy + "px",
            } as React.CSSProperties
          }
          onAnimationEnd={() =>
            setFx((old) => old.filter((x) => x.key !== f.key))
          }
        >
          💩<i>💥</i>
        </span>
      ))}
    </main>
  );
}
