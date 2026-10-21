import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RRView } from "../../../../packages/reflex-race/src/engine.ts";
import type { RRRoomSnapshot } from "../../../../packages/shared/src/rr-protocol.ts";
import { ObjectArt } from "./Objects.tsx";
import { createRRRoom, savedName, useRRRoom } from "./rr-net.ts";
import "./rr.css";

const NAMES = ["红沙发", "绿瓶子", "蓝书", "黄猫", "白雪人"];
/** 和参考截图一样：上排 3 个，下排 2 个 */
const BUTTON_ORDER = [0, 1, 2, 3, 4];
/** 每位玩家一个颜色，计分板和抢答提示里用 */
const SEAT_COLORS = [
  "#ff7a6b",
  "#4fb3ff",
  "#7ed46f",
  "#ffc94d",
  "#c79bff",
  "#ff9fd0",
];

const roomFromUrl = () =>
  new URLSearchParams(location.search).get("room")?.toUpperCase() ?? null;
const goRoom = (code: string) => {
  history.pushState(null, "", `/?game=rr&room=${code}`);
  dispatchEvent(new PopStateEvent("popstate"));
};

export function ReflexRace() {
  const [room, setRoom] = useState(roomFromUrl);
  useEffect(() => {
    document.title = "眼疾手快 · 桌游合集";
    const on = () => setRoom(roomFromUrl());
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return <div className="rr-app">{room ? <Room code={room} /> : <Home />}</div>;
}

function Title() {
  return (
    <header className="rr-title">
      <div className="rr-scene" aria-hidden="true">
        <div className="rr-scene-plate">
          <ObjectArt obj={2} color={0} />
          <ObjectArt obj={3} color={1} />
        </div>
        <div className="rr-scene-cards">
          {[0, 1, 4].map((o) => (
            <div key={o}>
              <ObjectArt obj={o} color={o} />
            </div>
          ))}
        </div>
      </div>
      <a className="rr-back" href="/">
        ← 桌游合集
      </a>
      <h1>
        <span>眼疾</span>
        <span>手快</span>
      </h1>
    </header>
  );
}

function RulesCard() {
  return (
    <section className="rr-card rr-rules">
      <h2>怎么玩</h2>
      <p>
        每张图里有 2 个物品，所有人同时看到。抢先点下面 5 个按钮中正确的那个：
      </p>
      <div className="rr-rule">
        <div className="rr-mini">
          <ObjectArt obj={0} color={0} />
          <ObjectArt obj={1} color={2} />
        </div>
        <p>
          <b>图里有物品是原本的颜色</b>，就点它。
          <br />
          红色沙发 → 点「沙发」
        </p>
      </div>
      <div className="rr-rule">
        <div className="rr-mini">
          <ObjectArt obj={3} color={1} />
          <ObjectArt obj={2} color={0} />
        </div>
        <p>
          <b>都不是原色</b>，就点颜色和形状都没出现过的那个。
          <br />
          绿猫 + 红书 → 点「雪人」
        </p>
      </div>
      <p className="rr-muted">
        点对 +1，点错
        −1（可以扣成负数），点错后这张图不能再点。先到目标分的人赢。
      </p>
    </section>
  );
}

function Home() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="rr-home">
      <Title />
      <section className="rr-card">
        <h2>开一局</h2>
        <p className="rr-muted">2–6 人，每人用自己的手机。</p>
        {error && (
          <p className="rr-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="rr-go"
          data-testid="rr-create"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await createRRRoom();
            setBusy(false);
            if (!res.ok) return setError(res.error);
            goRoom(res.code);
          }}
        >
          创建房间
        </button>
        <form
          className="rr-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 4) goRoom(code.trim().toUpperCase());
          }}
        >
          <input
            aria-label="房间号"
            placeholder="4 位房间号"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit">加入</button>
        </form>
      </section>
      <RulesCard />
    </main>
  );
}

function useShareUrl(code: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const path = `/?game=rr&room=${code}`;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      location.hostname,
    );
    fetch("/api/info")
      .then((r) => r.json())
      .then(
        (info: { port: number; lan: string[]; publicUrl?: string | null }) =>
          setUrl(
            info.publicUrl
              ? info.publicUrl + path
              : local && info.lan[0]
                ? `http://${info.lan[0]}:${info.port}${path}`
                : location.origin + path,
          ),
      )
      .catch(() => setUrl(location.origin + path));
  }, [code]);
  return url;
}

type Net = ReturnType<typeof useRRRoom>;

// Audio is unlocked by a player gesture; unavailable browser APIs stay silent.
let audio: AudioContext | undefined;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {}
}
function chime(correct: boolean) {
  try {
    if (!audio || audio.state !== "running") return;
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = correct ? "sine" : "triangle";
    const t = audio.currentTime;
    oscillator.frequency.setValueAtTime(correct ? 880 : 220, t);
    oscillator.frequency.exponentialRampToValueAtTime(
      correct ? 1320 : 110,
      t + 0.12,
    );
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(t + 0.2);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {}
}

function Score({ score, id }: { score: number; id: string }) {
  const previous = useRef(score);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const change = score - previous.current;
    previous.current = score;
    setDelta(change);
    const timer = setTimeout(() => setDelta(0), 650);
    return () => clearTimeout(timer);
  }, [score]);
  return (
    <>
      <b
        key={score}
        className={delta ? "rr-score-pop" : ""}
        data-testid={"rr-score-" + id}
      >
        {score}
      </b>
      {delta !== 0 && (
        <span
          key={score + "delta"}
          className={"rr-delta " + (delta > 0 ? "up" : "down")}
        >
          {delta > 0 ? "+1" : "−1"}
        </span>
      )}
    </>
  );
}

function Room({ code }: { code: string }) {
  const net = useRRRoom(code);
  const snap = net.snap;
  if (!snap)
    return (
      <main className="rr-home">
        <Title />
        <section className="rr-card">
          {net.error ? (
            <>
              <p className="rr-error" role="alert">
                {net.error}
              </p>
              <a href="/?game=rr">返回</a>
            </>
          ) : (
            <p>正在连接房间 {code}…</p>
          )}
        </section>
      </main>
    );
  return (
    <>
      {!net.connected && <p className="rr-offline">连接中断，正在重新连接…</p>}
      {snap.stage === "game" && snap.view ? (
        <Game snap={snap} view={snap.view} net={net} />
      ) : (
        <Lobby snap={snap} net={net} />
      )}
    </>
  );
}

function JoinForm({ claim }: { claim: Net["claim"] }) {
  const [name, setName] = useState(savedName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="rr-card rr-claim"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await claim(name);
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <h2>输入你的昵称</h2>
      {error && (
        <p className="rr-error" role="alert">
          {error}
        </p>
      )}
      <input
        aria-label="昵称"
        data-testid="rr-name"
        placeholder="昵称"
        maxLength={12}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="rr-go"
        type="submit"
        disabled={busy || !name.trim()}
        data-testid="rr-claim"
      >
        加入房间
      </button>
    </form>
  );
}

function Lobby({ snap, net }: { snap: RRRoomSnapshot; net: Net }) {
  const url = useShareUrl(snap.code);
  const me = snap.players.find((p) => p.playerId === snap.mySeat);
  const host = !!me?.host;
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const act = async (a: Parameters<Net["lobby"]>[0]) =>
    setError((await net.lobby(a)) ?? "");
  const setTarget = (n: number) =>
    act({ type: "SET_TARGET", target: Math.max(1, Math.min(50, n)) });
  return (
    <main className="rr-home">
      <Title />
      <section className="rr-card rr-roomcode">
        <p className="rr-muted">房间号</p>
        <strong data-testid="rr-code">{snap.code}</strong>
        {url && (
          <>
            <img
              className="rr-qr"
              src={"/api/qr?text=" + encodeURIComponent(url)}
              alt="扫码加入"
            />
            <button
              className="rr-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "已复制邀请链接" : "复制邀请链接"}
            </button>
          </>
        )}
      </section>

      {!me && <JoinForm claim={net.claim} />}

      <section className="rr-card">
        <h2>
          玩家 <small>{snap.players.length}/6</small>
        </h2>
        <ul className="rr-players" data-testid="rr-players">
          {snap.players.map((p, i) => (
            <li
              key={p.playerId}
              className={p.playerId === snap.mySeat ? "me" : ""}
            >
              <i style={{ background: SEAT_COLORS[i % 6] }} />
              <span>
                {p.name}
                {p.host && <em>房主</em>}
                {p.playerId === snap.mySeat && <em>我</em>}
                {!p.connected && <em className="off">离线</em>}
              </span>
              {host && !p.host && (
                <button
                  className="rr-kick"
                  onClick={() => act({ type: "KICK", playerId: p.playerId })}
                >
                  移出
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rr-card">
        <h2>先拿多少分获胜</h2>
        <div className="rr-target">
          {host ? (
            <>
              <button
                aria-label="减少目标分"
                onClick={() => setTarget(snap.target - 1)}
              >
                −
              </button>
              <strong data-testid="rr-target">{snap.target}</strong>
              <button
                aria-label="增加目标分"
                onClick={() => setTarget(snap.target + 1)}
              >
                ＋
              </button>
            </>
          ) : (
            <strong data-testid="rr-target">{snap.target}</strong>
          )}
          <span>分</span>
        </div>
        {host && (
          <div className="rr-quick">
            {[3, 5, 10, 15, 20].map((n) => (
              <button
                key={n}
                className={n === snap.target ? "on" : ""}
                onClick={() => setTarget(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        {!host && <p className="rr-muted">房主设定目标分。</p>}
      </section>

      {error && (
        <p className="rr-error" role="alert">
          {error}
        </p>
      )}
      {host ? (
        <button
          className="rr-go big"
          data-testid="rr-start"
          disabled={snap.players.length < 2}
          onClick={() => act({ type: "START" })}
        >
          {snap.players.length < 2
            ? "至少 2 人才能开始"
            : `开始（${snap.players.length} 人）`}
        </button>
      ) : (
        me && <p className="rr-wait">等房主开始…</p>
      )}
      <RulesCard />
    </main>
  );
}

/** 本机按服务器时钟每帧刷新，用来让所有手机同时显示新图 */
function useServerClock(now: () => number) {
  const [t, setT] = useState(now);
  useEffect(() => {
    let id = 0;
    const loop = () => {
      setT(now());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [now]);
  return t;
}

function Game({
  snap,
  view,
  net,
}: {
  snap: RRRoomSnapshot;
  view: RRView;
  net: Net;
}) {
  const t = useServerClock(net.now);
  const me = snap.mySeat;
  const playing = !!me && view.players.some((p) => p.id === me);
  const showing = view.phase !== "live" || t >= view.revealAt;
  const locked = !!me && view.locked.includes(me);
  const [pending, setPending] = useState<number | null>(null);
  const [sound, setSound] = useState(
    () => localStorage.getItem("rr-sound") !== "off",
  );
  /** 本张图里我点错的按钮（做抖动和 −1 提示） */
  const [missed, setMissed] = useState<{ card: number; obj: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const host = snap.players.find((p) => p.playerId === me)?.host;
  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    snap.players.forEach((p, i) => (m[p.playerId] = SEAT_COLORS[i % 6]));
    view.players.forEach((p, i) => (m[p.id] ??= SEAT_COLORS[i % 6]));
    return m;
  }, [snap.players, view.players]);
  const nameOf = (id: string | null) =>
    view.players.find((p) => p.id === id)?.name ?? "";

  useEffect(() => {
    setPending(null);
    setError("");
  }, [view.cardNo]);

  const canTap =
    playing && showing && view.phase === "live" && !locked && pending === null;
  const inFlight = useRef(false);
  async function tap(obj: number) {
    if (!canTap || inFlight.current) return;
    inFlight.current = true;
    if (sound) unlockAudio();
    setPending(obj);
    const cardNo = view.cardNo;
    const res = await net.tap({ type: "TAP", obj }, cardNo);
    inFlight.current = false;
    setPending(null);
    if (res.tap && !res.tap.correct) {
      setMissed({ card: cardNo, obj });
      navigator.vibrate?.(180);
      if (sound) chime(false);
    } else if (res.tap?.correct) {
      navigator.vibrate?.(40);
      if (sound) chime(true);
    } else if (res.error) setError(res.error);
  }

  const answer = view.card.answer;
  const myWrong = missed && missed.card === view.cardNo ? missed.obj : null;
  const ranking = [...view.players].sort(
    (a, b) => view.scores[b.id] - view.scores[a.id],
  );
  const wrongTaps = view.taps.filter((x) => !x.correct);

  return (
    <main
      className={
        "rr-game" +
        (locked && view.phase === "live" ? " is-locked" : "") +
        (view.phase !== "live" ? " revealed-phase" : "")
      }
      data-testid="rr-game"
      data-card={view.cardNo}
    >
      <header className="rr-bar">
        <ol
          className="rr-scores"
          data-testid="rr-scores"
          style={{ "--players": view.players.length } as React.CSSProperties}
        >
          {view.players.map((p) => (
            <li
              key={p.id}
              className={
                (p.id === me ? "me " : "") +
                (view.cardWinner === p.id ? "win" : "")
              }
              style={{ "--seat": colorOf[p.id] } as React.CSSProperties}
            >
              <span className="n">{p.id === me ? "我" : p.name}</span>
              <Score score={view.scores[p.id]} id={p.id} />
            </li>
          ))}
        </ol>
        <button
          className="rr-sound"
          aria-label={sound ? "关闭音效" : "开启音效"}
          aria-pressed={sound}
          onClick={() => {
            const next = !sound;
            setSound(next);
            localStorage.setItem("rr-sound", next ? "on" : "off");
            if (next) unlockAudio();
          }}
        >
          {sound ? "♪" : "静音"}
        </button>
        <button
          className="rr-exit"
          onClick={() => {
            if (confirm("离开对局？（之后可以用房间号回来）"))
              location.href = "/?game=rr";
          }}
        >
          EXIT
        </button>
      </header>
      <p className="rr-goal">
        先到 <b>{view.target}</b> 分获胜 · 第 {view.cardNo} 张
      </p>

      <div className="rr-stage">
        <div
          className={"rr-plate" + (view.phase === "reveal" ? " revealed" : "")}
          data-testid="rr-plate"
        >
          {showing ? (
            <div className="rr-items" key={view.cardNo} data-testid="rr-items">
              {view.card.items.map((it, i) => (
                <div
                  key={i}
                  className="rr-item"
                  data-obj={it.obj}
                  data-color={it.color}
                  style={{
                    left: it.x * 100 + "%",
                    top: it.y * 100 + "%",
                    transform: `translate(-50%, -50%) rotate(${it.rot}deg) scale(${it.scale})`,
                  }}
                >
                  <ObjectArt obj={it.obj} color={it.color} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rr-ready" data-testid="rr-ready">
              <span>准备</span>
              <i
                style={{
                  animationDuration: Math.max(0, view.revealAt - t) + "ms",
                }}
              />
            </div>
          )}
          {view.phase !== "live" && (
            <div className="rr-verdict" data-testid="rr-verdict">
              <div
                style={
                  view.cardWinner
                    ? { background: colorOf[view.cardWinner] }
                    : undefined
                }
              >
                {view.cardWinner ? (
                  <p>
                    {view.cardWinner === me
                      ? "你抢到了！"
                      : `${nameOf(view.cardWinner)} 抢到了`}
                    <b>+1</b>
                  </p>
                ) : (
                  <p className="none">没人答对</p>
                )}
                {answer !== null && <small>答案：{NAMES[answer]}</small>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rr-status">
        {!playing ? (
          <span>本局观战，下一局可以加入</span>
        ) : locked && view.phase === "live" ? (
          <span className="bad">点错了 −1，这张图等别人抢</span>
        ) : wrongTaps.length > 0 && view.phase === "live" ? (
          <span>
            {wrongTaps.map((x) => nameOf(x.player)).join("、")} 点错 −1
          </span>
        ) : error ? (
          <span className="bad">{error}</span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>

      <div className="rr-buttons" data-testid="rr-buttons">
        {BUTTON_ORDER.map((o) => (
          <button
            key={o}
            data-testid={"rr-btn-" + o}
            aria-label={NAMES[o]}
            className={
              "rr-btn" +
              (answer === o ? " answer" : "") +
              (myWrong === o ? " wrong" : "") +
              (pending === o ? " pressed" : "")
            }
            disabled={!canTap}
            onPointerDown={(e) => {
              e.preventDefault();
              void tap(o);
            }}
            onClick={(e) => {
              // 键盘操作（没有指针事件）时才用 click，避免一次点击发两次
              if (e.detail === 0) void tap(o);
            }}
          >
            <ObjectArt obj={o} color={o} />
            {myWrong === o && <span className="minus">−1</span>}
          </button>
        ))}
      </div>

      {view.phase === "over" && (
        <div className="rr-over" data-testid="rr-over">
          <div className="rr-over-card">
            <div className="rr-confetti" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ "--i": i } as React.CSSProperties}>
                  ★
                </i>
              ))}
            </div>
            <p className="crown">🏆</p>
            <h2>
              {view.winner === me
                ? "你赢了！"
                : `${nameOf(view.winner)} 赢了！`}
            </h2>
            <ol>
              {ranking.map((p, i) => (
                <li key={p.id} className={p.id === me ? "me" : ""}>
                  <span className="rank">{i + 1}</span>
                  <i style={{ background: colorOf[p.id] }} />
                  <span className="who">{p.name}</span>
                  <span className="stat">
                    对 {view.stats[p.id].right} · 错 {view.stats[p.id].wrong}
                  </span>
                  <b>{view.scores[p.id]}</b>
                </li>
              ))}
            </ol>
            {host ? (
              <div className="rr-over-actions">
                <button
                  className="rr-go"
                  data-testid="rr-again"
                  onClick={() => void net.lobby({ type: "START" })}
                >
                  再来一局
                </button>
                <button
                  className="rr-ghost"
                  onClick={() => void net.lobby({ type: "NEXT" })}
                >
                  回房间（改目标分 / 换人）
                </button>
              </div>
            ) : (
              <p className="rr-muted">等房主开下一局…</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
