import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RACER_BY_ID,
  racerName,
  total,
  TRACKS,
  HIDDEN_CHOICE,
  type MAView,
} from "../../../../packages/magical-athlete/src/index.ts";
import type { MARoomSnapshot } from "../../../../packages/shared/src/ma-protocol.ts";
import { racerArtId } from "../../../../packages/magical-athlete/src/second-wind-preview.ts";
import { createMARoom, savedName, useMARoom } from "./ma-net.ts";
import { ART, PLAYER_COLORS, Track, useVerticalBoard } from "./Track.tsx";
import { installAudioUnlock, onMutedChange, setSfxMuted, sfxMuted, sfxShake, sfxTap, sfxYourTurn, vibrate } from "./sfx.ts";
import { getSpeed, setSpeed, usePlayback, type Show, type Speed } from "./playback.ts";
import "./ma.css";

const roomFromUrl = () => new URLSearchParams(location.search).get("room")?.toUpperCase() ?? null;
const expansionRacers = [...RACER_BY_ID.values()].filter((r) => r.id.startsWith("sw_"));
const goRoom = (code: string) => {
  history.pushState(null, "", `/?game=ma&room=${code}`);
  dispatchEvent(new PopStateEvent("popstate"));
};

export function MagicalAthlete() {
  const [room, setRoom] = useState(roomFromUrl);
  useEffect(() => {
    document.title = "魔法运动员 · 桌游合集";
    installAudioUnlock();
    const on = () => setRoom(roomFromUrl());
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return <div className="ma-app">{room ? <Room code={room} /> : <Home />}</div>;
}

function Masthead({ small }: { small?: boolean }) {
  return (
    <header className={"ma-mast" + (small ? " small" : "")}>
      <a className="ma-back" href="/">
        ← 桌游合集
      </a>
      <h1>魔法运动员</h1>
      {!small && (
        <>
          <img className="ma-cover" src={`${ART}/lobby/cover.webp`} alt="" />
          <p>2–8 名玩家各自选秀怪咖选手，比四场赛跑。掷骰、发动能力、把别人绊倒——前两个冲线的拿奖牌。</p>
        </>
      )}
    </header>
  );
}

function Home() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="ma-home">
      <Masthead />
      <section className="ma-panel">
        <h2>开一场比赛</h2>
        <p className="ma-muted">建好房间后把房间号或二维码发给朋友，每人用自己的手机加入。2–8 人都能玩。</p>
        {error && <p className="ma-error" role="alert">{error}</p>}
        <button
          className="ma-go"
          data-testid="ma-create"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await createMARoom();
            setBusy(false);
            if (!res.ok) return setError(res.error);
            goRoom(res.code);
          }}
        >
          创建房间
        </button>
      </section>
      <section className="ma-panel">
        <h2>加入朋友的房间</h2>
        <form
          className="ma-join"
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
    </main>
  );
}

function useShareUrl(code: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const path = `/?game=ma&room=${code}`;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    fetch("/api/info")
      .then((r) => r.json())
      .then((info: { port: number; lan: string[]; publicUrl?: string | null }) =>
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

function Room({ code }: { code: string }) {
  const net = useMARoom(code);
  const snap = net.snap;
  const [watching, setWatching] = useState(false);
  if (!snap)
    return (
      <main className="ma-home">
        <Masthead small />
        <section className="ma-panel">
          {net.error ? (
            <>
              <p className="ma-error" role="alert">{net.error}</p>
              <a href="/?game=ma">返回</a>
            </>
          ) : (
            <p>正在连接房间 {code}…</p>
          )}
        </section>
      </main>
    );
  if (!snap.mySeat && !watching && (snap.stage === "lobby" || snap.players.length > 0))
    return <JoinForm snap={snap} claim={net.claim} onWatch={snap.stage === "game" ? () => setWatching(true) : undefined} />;
  if (snap.stage === "lobby" || !snap.view) return <Lobby snap={snap} lobby={net.lobby} />;
  return <Game snap={snap} view={snap.view} send={net.send} connected={net.connected} />;
}

function JoinForm({
  snap,
  claim,
  onWatch,
}: {
  snap: MARoomSnapshot;
  claim: (n: string, takeover?: boolean) => Promise<string | null>;
  onWatch?: () => void;
}) {
  const [name, setName] = useState(savedName);
  const [error, setError] = useState("");
  const [taken, setTaken] = useState<string | null>(null);
  const lobby = snap.stage === "lobby";
  const full = snap.players.length >= 8;
  const join = async (n: string, takeover = false) => {
    setError("");
    const err = await claim(n, takeover);
    if (!err) return;
    if (err.includes("已经在房间里")) setTaken(n.trim());
    else setError(err);
  };
  return (
    <main className="ma-home">
      <Masthead small />
      <section className="ma-panel">
        <h2>{lobby ? `加入房间 ${snap.code}` : `房间 ${snap.code} 已经开始了`}</h2>
        {snap.players.length > 0 && (
          <>
            <p className="ma-muted">
              {lobby ? "之前进过这个房间（换了浏览器、退出微信后再进）？点自己的名字接回位置：" : "你是这局的玩家吗？点自己的名字接回位置："}
            </p>
            <div className="ma-rejoin">
              {snap.players.map((p, i) => (
                <button
                  key={p.playerId}
                  type="button"
                  data-testid={"rejoin-" + i}
                  onClick={() => (p.connected ? setTaken(p.name) : void join(p.name))}
                >
                  <span className="ma-dot" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                  我是 {p.name}
                  {!p.connected && <em>离线</em>}
                </button>
              ))}
            </div>
          </>
        )}
        {taken && (
          <div className="ma-taken" role="alert">
            <p>「{taken}」现在显示在线（可能是你之前没关的窗口）。确定是你本人吗？</p>
            <button type="button" className="ma-go small" data-testid="ma-takeover" onClick={() => void join(taken, true)}>
              是我，接回这个位置
            </button>
            <button type="button" onClick={() => setTaken(null)}>
              不是我
            </button>
          </div>
        )}
        {lobby && (
          <>
            <p className="ma-muted">{snap.players.length > 0 ? "第一次来？输入昵称加入：" : "输入昵称加入："}</p>
            <form
              className="ma-join"
              onSubmit={async (e) => {
                e.preventDefault();
                await join(name);
              }}
            >
              <input data-testid="ma-name" aria-label="昵称" placeholder="你的昵称" maxLength={12} value={name} onChange={(e) => setName(e.target.value)} />
              <button type="submit" className="ma-go" disabled={full || !name.trim()} data-testid="ma-claim">
                {full ? "房间已满" : "加入"}
              </button>
            </form>
          </>
        )}
        {onWatch && (
          <button type="button" onClick={onWatch} data-testid="ma-watch">
            我只是来观战
          </button>
        )}
        {error && <p className="ma-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}

function Lobby({ snap, lobby }: { snap: MARoomSnapshot; lobby: (a: Parameters<ReturnType<typeof useMARoom>["lobby"]>[0]) => Promise<string | null> }) {
  const url = useShareUrl(snap.code);
  const [error, setError] = useState("");
  const host = snap.players.find((p) => p.host)?.playerId === snap.mySeat;
  const [points, setPoints] = useState(snap.points);
  useEffect(() => setPoints(snap.points), [snap.points]);
  const run = async (a: Parameters<typeof lobby>[0]) => setError((await lobby(a)) ?? "");
  return (
    <main className="ma-home">
      <Masthead small />
      <section className="ma-panel ma-invite">
        <div>
          <h2>房间号</h2>
          <div className="ma-code" data-testid="ma-code">
            {snap.code}
          </div>
          <code className="ma-url">{url}</code>
        </div>
        {url && <img src={`/api/qr?text=${encodeURIComponent(url)}`} alt="扫码加入房间" width={150} height={150} />}
      </section>
      <section className="ma-panel">
        <h2>选手们（{snap.players.length}/8）</h2>
        <ul className="ma-players">
          {snap.players.map((p, i) => (
            <li key={p.playerId}>
              <span className="ma-dot" style={{ background: PLAYER_COLORS[i] }} />
              {p.name}
              {p.host && <em>房主</em>}
              {p.playerId === snap.mySeat && <em>你</em>}
              {!p.connected && <em className="off">离线</em>}
              {host && p.playerId !== snap.mySeat && (
                <button
                  type="button"
                  className="ma-kick"
                  data-testid={"kick-" + i}
                  aria-label={`移出 ${p.name}`}
                  onClick={() => void run({ type: "KICK", playerId: p.playerId })}
                >
                  移出
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="ma-panel">
        <h2>每场奖牌分值</h2>
        <p className="ma-muted">
          规则书只说「越后面的比赛越值钱」，没写具体数字（印在奖牌实物上）。现在默认金牌 3、银牌
          1（来自评测文章，待核对），房主可以按实物改。
        </p>
        <table className="ma-points">
          <thead>
            <tr>
              <th>场次</th>
              <th>金牌</th>
              <th>银牌</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>第 {i + 1} 场</td>
                {(["gold", "silver"] as const).map((k) => (
                  <td key={k}>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      disabled={!host}
                      aria-label={`第 ${i + 1} 场${k === "gold" ? "金牌" : "银牌"}分值`}
                      value={p[k]}
                      onChange={(e) => {
                        const next = points.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x));
                        setPoints(next);
                        void run({ type: "SET_POINTS", points: next });
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ma-muted">
          赛道顺序：温和 → 狂野 → 温和 → 狂野。
          <a href={`${ART}/docs/skillbook.pdf`} target="_blank" rel="noreferrer">
            原版 36 名选手技能书（PDF）
          </a>
        </p>
      </section>
      <section className="ma-panel">
        <h2>怎么拿选手</h2>
        <label className="ma-expansion-toggle">
          <input
            type="checkbox"
            data-testid="ma-second-wind"
            checked={snap.secondWind === true}
            disabled={!host}
            onChange={(e) => void run({ type: "SET_SECOND_WIND", enabled: e.target.checked })}
          />
          <span>
            <b>开启新角色</b>
            <small>
              当前可用 {expansionRacers.length} 名：{expansionRacers.map((r) => r.zh).join("、")}
              。开启后与原版选手混合招募；关闭则只使用原版 36 名。
            </small>
          </span>
        </label>
        <div className="ma-variant" role="radiogroup" aria-label="怎么拿选手">
          {(
            [
              ["draft", "轮流选秀", "翻开一排选手，大家蛇形轮流挑，每人挑 4 名。"],
              ["random", "🎲 随机模式", "不选秀，系统直接给每人随机发 4 名，全场不会有人拿到同一名选手。"],
            ] as const
          ).map(([k, label, hint]) => (
            <button
              key={k}
              role="radio"
              aria-checked={snap.deal === k}
              data-testid={`ma-deal-${k}`}
              className={snap.deal === k ? "on" : ""}
              disabled={!host}
              onClick={() => run({ type: "SET_DEAL", deal: k })}
            >
              <b>{label}</b>
              <br />
              <small>{hint}</small>
            </button>
          ))}
        </div>
        {!host && <p className="ma-muted">由房主决定。</p>}
        <p className="ma-muted">共 4 场，每场每人派 1 名上场（2 人局也一样）。</p>
      </section>
      {error && (
        <p className="ma-error" role="alert">
          {error}
        </p>
      )}
      {host ? (
        <button className="ma-go" data-testid="ma-start" disabled={snap.players.length < 2} onClick={() => run({ type: "START" })}>
          {snap.players.length < 2 ? "还差 1 人才能开始" : snap.deal === "random" ? "人齐了，随机发选手" : "人齐了，开始选秀"}
        </button>
      ) : (
        <p className="ma-wait">等房主开始…</p>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- 游戏中
type Send = ReturnType<typeof useMARoom>["send"];

function RacerCard({
  id,
  onPick,
  pickLabel,
  dim,
  compact,
}: {
  id: string;
  onPick?: () => void;
  pickLabel?: string;
  dim?: boolean;
  compact?: boolean;
}) {
  const r = RACER_BY_ID.get(id);
  const [zoom, setZoom] = useState(false);
  if (!r) return null;
  const cardSrc = `${ART}/cards/zh/${id}.webp`;
  return (
    <article className={"ma-card" + (dim ? " dim" : "") + (compact ? " compact" : "")}>
      <button type="button" className="ma-card-art" onClick={() => setZoom(true)} aria-label={`放大查看 ${r.zh}`}>
        <img src={`${ART}/cards/zh/${id}.webp`} alt={`${r.zh}：${r.powerZh}。${r.text}`} loading="lazy" />
      </button>
      {onPick && (
        <button className="ma-go small" onClick={onPick} data-testid={"pick-" + id}>
          {pickLabel ?? "选它"}
        </button>
      )}
      {zoom && (
        <div className="ma-lightbox" role="dialog" aria-label={r.zh} onClick={() => setZoom(false)}>
          <img src={`${ART}/cards/zh/${id}.webp`} alt="" />
          <div className="ma-lightbox-text">
            <h3>{r.zh} <small>{r.en}</small></h3>
            <p><b>{r.powerZh}</b> {r.text}</p>
            {r.notes && <p className="ma-notes">{r.notes}</p>}
            <button type="button">关闭</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Game({ snap, view, send, connected }: { snap: MARoomSnapshot; view: MAView; send: Send; connected: boolean }) {
  const me = snap.mySeat;
  const [error, setError] = useState("");
  const colorOf = useMemo(() => {
    const m = new Map(view.seats.map((id, i) => [id, PLAYER_COLORS[i % PLAYER_COLORS.length]]));
    return (id: string) => m.get(id) ?? "#888";
  }, [view.seats]);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  // 操作手感：按下就有声音/震动；点了之后按钮转圈、其他按钮暂时点不了，直到服务器回应
  const lastBtn = useRef<HTMLElement | null>(null);
  const [sending, setSending] = useState(false);
  const act = async (c: Parameters<Send>[0]) => {
    const b = lastBtn.current;
    b?.classList.add("sending");
    setSending(true);
    const err = await send(c);
    b?.classList.remove("sending");
    setSending(false);
    setError(err ?? "");
    if (err) vibrate([30, 40, 30]);
  };
  const onPress = (e: React.PointerEvent) => {
    const b = (e.target as Element).closest<HTMLElement>("button, a.ma-go, [role=button]");
    lastBtn.current = b;
    if (b && !(b as HTMLButtonElement).disabled) {
      sfxTap();
      // 按下的位置泛起一圈涟漪
      const r = b.getBoundingClientRect();
      const s = document.createElement("span");
      s.className = "ma-ripple";
      const size = Math.max(r.width, r.height) * 2;
      s.style.width = s.style.height = `${size}px`;
      s.style.left = `${e.clientX - r.left - size / 2}px`;
      s.style.top = `${e.clientY - r.top - size / 2}px`;
      b.appendChild(s);
      setTimeout(() => s.remove(), 600);
    }
  };
  useEffect(() => setError(""), [snap.version]);
  const pb = usePlayback(view);
  // 轮到你：响一声、震一下、底部弹出提醒（动画播完才算）
  const mine = view.players.find((p) => p.id === me);
  const myTurn =
    !!me &&
    !pb.busy &&
    ((view.phase === "draft" && view.draft?.order[view.draft.step] === me) ||
      (view.phase === "choose" && !!mine && !mine.choices.length) ||
      (view.phase === "race" && view.pending?.player === me));
  const [toast, setToast] = useState(false);
  const wasTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasTurn.current) {
      sfxYourTurn();
      setToast(true);
      const id = setTimeout(() => setToast(false), 2600);
      wasTurn.current = true;
      return () => clearTimeout(id);
    }
    if (!myTurn) {
      wasTurn.current = false;
      setToast(false);
    }
  }, [myTurn]);
  const [card, setCard] = useState<string | null>(null);
  // 比赛刚结束时，等动画（冲线、颁奖）播完再切到下一场的选人界面
  const showRace = !!view.race && (view.phase === "race" || view.phase === "over" || (view.phase === "choose" && pb.busy));
  return (
    <main className={"ma-game phase-" + view.phase + (sending ? " is-sending" : "")} onPointerDownCapture={onPress}>
      {pb.show && <Overlay show={pb.show} view={view} name={name} colorOf={colorOf} me={me} onSkip={pb.skip} />}
      {toast && !pb.show && (
        <button
          type="button"
          className="ma-turn-toast"
          onClick={() => {
            setToast(false);
            document.querySelector(".ma-cc.you, .ma-decide.you, .ma-banner.you")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          👉 轮到你了！
        </button>
      )}
      {card && <CardLightbox id={card} onClose={() => setCard(null)} />}
      <div className="ma-topbar">
        <a className="ma-back" href="/">← 合集</a>
        <strong>魔法运动员</strong>
        <span className="ma-muted">房间 {snap.code}{!connected && " · 重新连接中…"}</span>
        <SpeedToggle />
        <SoundToggle />
      </div>
      <Scores view={view} me={me} colorOf={colorOf} compact={showRace} />
      {error && <p className="ma-error" role="alert">{error}</p>}
      {view.phase === "draft" && <Draft view={view} me={me} name={name} act={act} />}
      {view.phase === "choose" && !showRace && <Choose view={view} me={me} act={act} />}
      {showRace && (
        <Race view={view} me={me} name={name} colorOf={colorOf} act={act} pb={pb} openCard={setCard} />
      )}
      {view.phase === "over" && <Final view={view} />}
      <Log view={view} />
    </main>
  );
}

/** 决定选项按钮：选项是一名选手时（神秘蛋三选一、军师预测等），直接显示它的头像和技能介绍 */
function OptionButton({ o, onPick }: { o: { value: string; label: string }; onPick: () => void }) {
  const r = RACER_BY_ID.get(o.value);
  if (o.value === "roll" && o.label !== "秘密设骰") return <RollButton label={o.label} onRoll={onPick} />;
  if (!r)
    return (
      <button className="" onClick={onPick}>
        {o.label}
      </button>
    );
  return (
    <button className="ma-opt-racer" onClick={onPick} data-racer={r.id}>
      <img src={`${ART}/portraits/${r.id}.webp`} alt="" />
      <span>
        <b>{o.label}</b>
        <em>【{r.powerZh}】</em>
        <small>{r.text}</small>
      </span>
    </button>
  );
}

/** 掷骰按钮：按住时骰子在手里晃（声音 + 震动），松手就掷；轻点也能直接掷 */
function RollButton({ label, onRoll }: { label: string; onRoll: () => void }) {
  const [hold, setHold] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setHold(false);
  };
  useEffect(() => stop, []);
  return (
    <button
      className={"ma-go ma-roll" + (hold ? " holding" : "")}
      onPointerDown={() => {
        setHold(true);
        sfxShake();
        timer.current = setInterval(sfxShake, 110);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={onRoll}
    >
      <span className="ma-roll-die" aria-hidden="true">🎲</span>
      {label.replace("🎲", "").trim() || "掷骰"}
      <small>{hold ? "松手掷出！" : "按住摇一摇"}</small>
    </button>
  );
}

/** 动画速度：慢 / 正常 / 快，点一下换一档，只影响自己的手机 */
function SpeedToggle() {
  const [s, setS] = useState<Speed>(getSpeed);
  const next: Record<Speed, Speed> = { slow: "normal", normal: "fast", fast: "slow" };
  const label: Record<Speed, string> = { slow: "🐢 慢", normal: "🚶 正常", fast: "🐇 快" };
  return (
    <button
      type="button"
      className="ma-sound ma-speed"
      data-testid="ma-speed"
      aria-label={`动画速度：${label[s]}，点一下切换`}
      onClick={() => {
        const n = next[s];
        setSpeed(n);
        setS(n);
      }}
    >
      {label[s]}
    </button>
  );
}

function SoundToggle() {
  const [m, setM] = useState(sfxMuted);
  useEffect(() => onMutedChange(setM), []);
  return (
    <button type="button" className="ma-sound" onClick={() => setSfxMuted(!m)} aria-label={m ? "打开声音" : "关闭声音"} data-testid="ma-sound">
      {m ? "🔇" : "🔊"}
    </button>
  );
}

function Scores({ view, me, colorOf, compact }: { view: MAView; me: string | null; colorOf: (id: string) => string; compact?: boolean }) {
  // 得分变化时：分数跳一下，旁边弹出「+N」
  const prev = useRef<Map<string, number> | null>(null);
  const [bump, setBump] = useState<Map<string, { id: number; d: number }>>(new Map());
  const totals = view.players.map((p) => [p.id, total(p.chips)] as const);
  const key = totals.map(([, v]) => v).join(",");
  useEffect(() => {
    const now = new Map(totals);
    if (prev.current) {
      const next = new Map<string, { id: number; d: number }>();
      for (const [id, v] of now) {
        const d = v - (prev.current.get(id) ?? v);
        if (d) next.set(id, { id: Date.now() + Math.random(), d });
      }
      if (next.size) {
        setBump(next);
        setTimeout(() => setBump(new Map()), 1600);
      }
    }
    prev.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <ul className={"ma-scores" + (compact ? " compact" : "")}>
      {view.players.map((p) => {
        const runners = view.race && !view.race.over ? view.race.tokens.filter((t) => t.owner === p.id) : [];
        return (
          <li key={p.id} className={p.id === me ? "me" : ""} style={{ borderColor: colorOf(p.id) }}>
            <span className="ma-dot" style={{ background: colorOf(p.id) }} />
            <span className="ma-pname">{p.name}</span>
            <b key={bump.get(p.id)?.id ?? "t"} className={"ma-total" + (bump.has(p.id) ? " bump" : "")}>
              {total(p.chips)}
            </b>
            {bump.has(p.id) && (
              <em className="ma-score-pop">
                {bump.get(p.id)!.d > 0 ? "+" : ""}
                {bump.get(p.id)!.d}
              </em>
            )}
            <small>
              {runners.length ? runners.map((r) => racerName(r.racer)).join("、") : view.phase === "choose" ? (p.choices.length ? "已选好" : "选择中") : `${p.hand.length} 名选手`}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

function Draft({ view, me, name, act }: { view: MAView; me: string | null; name: (id: string) => string; act: (c: Parameters<Send>[0]) => void }) {
  const d = view.draft!;
  const turn = d.order[d.step];
  const mine = view.players.find((p) => p.id === me);
  return (
    <section className="ma-stage">
      <h2>第 {d.round + 1} 轮选秀（蛇形）</h2>
      <p className={"ma-banner" + (turn === me ? " you" : "")}>
        {turn === me ? "轮到你了：从下面挑一名选手" : `等待 ${name(turn)} 挑选…`}
      </p>
      <ol className="ma-order">
        {d.order.map((id, i) => (
          <li key={i} className={i < d.step ? "done" : i === d.step ? "now" : ""}>{name(id)}</li>
        ))}
      </ol>
      <div className="ma-cards">
        {d.pool.map((id) => (
          <RacerCard key={id} id={id} onPick={turn === me ? () => act({ type: "DRAFT", racer: id }) : undefined} />
        ))}
      </div>
      {mine && mine.hand.length > 0 && (
        <>
          <h3>你的队伍</h3>
          <div className="ma-cards">{mine.hand.map((id) => <RacerCard key={id} id={id} compact />)}</div>
        </>
      )}
    </section>
  );
}

function Choose({ view, me, act }: { view: MAView; me: string | null; act: (c: Parameters<Send>[0]) => void }) {
  const mine = view.players.find((p) => p.id === me);
  const idx = view.race ? view.race.index + 1 : 0;
  const track = TRACKS[view.settings.schedule[idx] ?? "mild"];
  const pts = view.settings.points[idx];
  const need = view.settings.variant === "double" ? 2 : 1;
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [idx]);
  const sent = mine?.choices.filter((c) => c !== HIDDEN_CHOICE) ?? [];
  return (
    <section className="ma-stage">
      <h2>第 {idx + 1} 场 · {track.zh}</h2>
      <p className="ma-muted">
        本场冠军 {pts.gold} 分、亚军 {pts.silver} 分。大家秘密选好后同时公开，每名选手只能上场一次。
        {need === 2 && " 双选手规则：这一场派 2 名不同的选手。"}
      </p>
      {mine ? (
        sent.length ? (
          <p className="ma-banner">你派出了 {sent.map(racerName).join("、")}，等其他人选好…</p>
        ) : (
          <p className="ma-banner you">{need === 2 ? `选出本场的 2 名选手（已选 ${sel.length}/2）` : "选出本场的选手"}</p>
        )
      ) : (
        <p className="ma-banner">观战中</p>
      )}
      {need === 2 && mine && !sent.length && sel.length === 2 && (
        <button className="ma-go" data-testid="ma-choose-confirm" onClick={() => act({ type: "CHOOSE", racers: sel })}>
          派 {sel.map(racerName).join("、")} 上场
        </button>
      )}
      {mine && (
        <div className="ma-cards">
          {mine.hand.map((id) => {
            const used = mine.used.includes(id);
            const picked = need === 2 ? sel.includes(id) : sent.includes(id);
            return (
              <RacerCard
                key={id}
                id={id}
                dim={used}
                onPick={
                  used
                    ? undefined
                    : need === 1
                      ? () => act({ type: "CHOOSE", racer: id })
                      : () => setSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id].slice(-2)))
                }
                pickLabel={picked ? (need === 2 ? "已选（再点取消）" : "已选（可改）") : "派它上场"}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function Race({
  view,
  me,
  name,
  colorOf,
  act,
  pb,
  openCard,
}: {
  view: MAView;
  me: string | null;
  name: (id: string) => string;
  colorOf: (id: string) => string;
  act: (c: Parameters<Send>[0]) => void;
  pb: ReturnType<typeof usePlayback>;
  openCard: (id: string) => void;
}) {
  const race = view.race!;
  const p = view.pending;
  const track = TRACKS[race.track];
  const mine = race.tokens.filter((t) => t.owner === me);
  const shownOf = (racer: string) => pb.shown?.get(racer);
  const [fit, setFit] = useState(true);
  // 手机竖屏：默认「清晰棋盘」（格子大、一屏放得下），可切到原版棋盘（放大、可上下滑）
  const portrait = useVerticalBoard();
  const [layout, setLayout] = useState<"grid" | "art">(() => {
    try {
      return localStorage.getItem("ma-board-layout") === "art" ? "art" : "grid";
    } catch {
      return "grid";
    }
  });
  const flipLayout = () =>
    setLayout((l) => {
      const n = l === "grid" ? "art" : "grid";
      try {
        localStorage.setItem("ma-board-layout", n);
      } catch {
        /* 忽略 */
      }
      return n;
    });
  const useGrid = portrait && layout === "grid";
  // 棋盘占满屏宽后，操作区可能在屏幕下面：轮到你且看不到操作区时，底部浮出一条操作栏
  const decideRef = useRef<HTMLDivElement>(null);
  const [decideSeen, setDecideSeen] = useState(true);
  useEffect(() => {
    const el = decideRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setDecideSeen(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  });
  // 竖版原版棋盘：操作放在赛道中间空白处，下面的操作区隐藏，棋盘更大
  const centerMode = portrait && !useGrid;
  // 底部浮动操作栏只给手机竖屏用（电脑屏幕够大，操作区本来就看得到）
  const showBar = portrait && !centerMode && !!p && !race.over && p.player === me && !pb.busy && !decideSeen;
  // 普通掷骰（只有「掷骰」一个选项）：不需要说明文字，只留「谁在动」和骰子按钮
  const rollOnly = !!p && p.options.length === 1 && p.options[0].value === "roll" && p.options[0].label !== "秘密设骰";
  const centerCard =
    centerMode && p && !race.over ? (
      <div className={"ma-cc" + (p.player === me ? " you" : "") + (pb.busy ? " waiting" : "") + (rollOnly ? " roll-only" : "")}>
        <p className="ma-who">
          <span className="ma-dot" style={{ background: colorOf(p.player) }} />
          {p.player === me ? "你" : name(p.player)}
          {p.racer && ` · ${racerName(p.racer)}`}
        </p>
        {!rollOnly && <p className="ma-cc-prompt">{p.prompt}</p>}
        {pb.busy ? (
          <p className="ma-muted">动画播放中…</p>
        ) : p.player === me ? (
          <div className="ma-options">
            {p.options.map((o) => (
              <OptionButton key={o.value} o={o} onPick={() => act({ type: "ANSWER", value: o.value })} />
            ))}
          </div>
        ) : (
          <p className="ma-muted">等待对方操作…</p>
        )}
      </div>
    ) : null;
  return (
    <section className="ma-race">
      {mine.length > 0 && (
        <Fold
          id="mine"
          className="ma-mine-fold"
          defaultOpen={!isPhone()}
          title={
            <span className="ma-mine-title">
              {mine.map((t) => (
                <img key={t.racer} src={`${ART}/portraits/${racerArtId(t)}.webp`} alt="" />
              ))}
              我的选手：{mine.map((t) => `${racerName(t.racer)}【${RACER_BY_ID.get(t.base)?.powerZh}】`).join("、")}
            </span>
          }
        >
          <div className="ma-mine" data-testid="ma-mine">
            {mine.map((t) => {
              const r = RACER_BY_ID.get(t.racer)!;
              const power = RACER_BY_ID.get(t.base);
              return (
                <button key={t.racer} type="button" className="ma-mine-card" onClick={() => openCard(t.racer)}>
                  <img src={`${ART}/portraits/${racerArtId(t)}.webp`} alt="" />
                  <span>
                    <small>点开看卡</small>
                    <b>{r.zh}</b>
                    <em>
                      【{power?.powerZh}】{power?.text}
                      {t.base !== t.racer && `（来自${racerName(t.base)}）`}
                      {race.hogs?.some((h) => h.rider === t.racer) && " · 🐗 持有野猪坐骑"}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>
        </Fold>
      )}
      <div className={"ma-board" + (useGrid ? " grid-mode" : "") + (pb.shake ? " shake" : "")}>
        <div className="ma-board-head">
          <b>第 {race.index + 1} 场 · {track.zh}</b>
          {portrait ? (
            <button type="button" className="ma-zoom" onClick={flipLayout} data-testid="ma-zoom">
              {useGrid ? "🖼 原版棋盘" : "🔲 清晰棋盘"}
            </button>
          ) : (
            <button type="button" className="ma-zoom" onClick={() => setFit((f) => !f)} data-testid="ma-zoom">
              {fit ? "🔍 放大赛道" : "🗺 看整条赛道"}
            </button>
          )}
          {race.track === "wild" ? (
            <span className="ma-legend">
              <i className="star">★</i>星星 +1 分 <i className="rock">▲</i>石头摔倒 <i className="arrow">➜</i>箭头额外前进/后退
            </span>
          ) : (
            <span className="ma-legend">普通赛道，没有特殊格</span>
          )}
        </div>
        <Track
          race={race}
          colorOf={colorOf}
          me={me}
          shown={pb.shown}
          moving={pb.moving}
          onPawn={openCard}
          fit={portrait ? false : fit}
          layout={useGrid ? "grid" : "art"}
          center={centerCard}
          floats={pb.floats}
          link={pb.link}
          spot={pb.spot}
          hit={pb.hit}
          target={pb.target}
        />
      </div>
      {showBar && p && (
        <div className="ma-actbar" role="region" aria-label="轮到你操作">
          <p>{rollOnly ? `你 · ${p.racer ? racerName(p.racer) : ""}` : `${p.racer && !p.prompt.includes(racerName(p.racer)) ? `${racerName(p.racer)}：` : ""}${p.prompt}`}</p>
          <div className="ma-options">
            {p.options.map((o) => (
              <OptionButton key={o.value} o={o} onPick={() => act({ type: "ANSWER", value: o.value })} />
            ))}
          </div>
        </div>
      )}
      <div className={"ma-side" + (centerMode ? " center-mode" : "")}>
        {p && !race.over && (
          <div ref={decideRef} className={"ma-decide" + (p.player === me ? " you" : "") + (pb.busy ? " waiting" : "")} data-testid="ma-decide">
            <p className="ma-who">
              <span className="ma-dot" style={{ background: colorOf(p.player) }} />
              {p.player === me ? "你" : name(p.player)}
              {p.racer && ` · ${racerName(p.racer)}`}
            </p>
            <p className="ma-prompt">{p.prompt}</p>
            {pb.busy ? (
              <p className="ma-muted">动画播放中…</p>
            ) : p.player === me ? (
              <div className="ma-options">
                {p.options.map((o) => (
                  <OptionButton key={o.value} o={o} onPick={() => act({ type: "ANSWER", value: o.value })} />
                ))}
              </div>
            ) : (
              <p className="ma-muted">等待对方操作…</p>
            )}
          </div>
        )}
        <Fold id="runners" title="场上选手（点选手看卡）" defaultOpen={!isPhone()}>
        <ul className="ma-runners">
          {race.tokens.map((t0) => {
            const t = { ...t0, ...(shownOf(t0.racer) ?? {}) };
            const r = RACER_BY_ID.get(t.racer)!;
            const copied = t.base !== t.racer ? `（能力：${racerName(t.base)}）` : "";
            return (
              <li
                key={t.racer}
                className={(t.out ? "out" : "") + (t.owner === me ? " me" : "")}
                style={{ borderLeftColor: colorOf(t.owner) }}
                onClick={() => openCard(t.racer)}
              >
                <img className="ma-portrait" src={`${ART}/portraits/${racerArtId(t)}.webp`} alt="" />
                <div>
                  <b>{r.zh}</b> <small>{name(t.owner)}</small>
                  <small className="ma-state">
                    {t.place ? `🏁 第 ${t.place} 名` : t.out ? "已淘汰" : `第 ${t.pos} 格${t.tripped ? " · 摔倒" : ""}`}
                  </small>
                  <p>{RACER_BY_ID.get(t.base)?.powerZh ?? r.powerZh}：{RACER_BY_ID.get(t.base)?.text ?? r.text}{copied}</p>
                </div>
              </li>
            );
          })}
        </ul>
        </Fold>
      </div>
    </section>
  );
}

/** 可以收起 / 展开的区块（手机上省地方，把屏幕留给赛道） */
function Fold({
  id,
  title,
  defaultOpen,
  children,
  className = "",
}: {
  id: string;
  title: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const key = "ma-fold-" + id;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? "0" : "1");
      } catch {
        /* 忽略 */
      }
      return !o;
    });
  };
  return (
    <section className={"ma-fold " + className + (open ? " open" : "")}>
      <button type="button" className="ma-fold-head" onClick={toggle} aria-expanded={open} data-testid={"fold-" + id}>
        <span>{title}</span>
        <i>{open ? "收起 ▲" : "展开 ▼"}</i>
      </button>
      {open && <div className="ma-fold-body">{children}</div>}
    </section>
  );
}

const isPhone = () => typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches;

function CardLightbox({ id, onClose }: { id: string; onClose: () => void }) {
  const r = RACER_BY_ID.get(id);
  if (!r) return null;
  return (
    <div className="ma-lightbox" role="dialog" aria-label={r.zh} onClick={onClose}>
      <img src={`${ART}/cards/zh/${id}.webp`} alt="" />
      <div className="ma-lightbox-text">
        <h3>{r.zh} <small>{r.en}</small></h3>
        <p><b>{r.powerZh}</b> {r.text}</p>
        {r.notes && <p className="ma-notes">{r.notes}</p>}
        <button type="button">关闭</button>
      </div>
    </div>
  );
}

/** 屏幕中央的大骰子 / 技能发动 / 冲线 / 开场提示：所有人同时看到 */
function Overlay({
  show,
  view,
  name,
  colorOf,
  me,
  onSkip,
}: {
  show: Show;
  view: MAView;
  name: (id: string) => string;
  colorOf: (id: string) => string;
  me: string | null;
  onSkip: () => void;
}) {
  const owner = (racer: string) => view.race?.tokens.find((t) => t.racer === racer)?.owner ?? "";
  const artId = (racer: string) => racerArtId(view.race?.tokens.find((t) => t.racer === racer) ?? { racer });
  const seatNo = (pid: string) => (view.seats.indexOf(pid) % 6) + 1;
  let body: React.ReactNode;
  if (show.kind === "roll") {
    body = (
      <div className="ma-ov-roll">
        <p>
          <span className="ma-dot" style={{ background: colorOf(show.player) }} />
          {show.player === me ? "你" : name(show.player)} 为 {racerName(show.racer)}{show.reroll ? " 重掷" : " 掷骰"}
        </p>
        <RollingDie pid={show.player} value={show.value} rolling={show.rolling} seatNo={seatNo} />
        {!show.rolling && <p className="ma-ov-big">掷出 {show.value}</p>}
      </div>
    );
  } else if (show.kind === "duel") {
    body = (
      <div className="ma-ov-roll">
        <p>⚔️ 决斗！</p>
        <div className="ma-duel">
          {[show.a, show.b].map((d, i) => (
            <div key={i}>
              <RollingDie pid={owner(d.racer)} value={d.value} rolling={show.rolling} seatNo={seatNo} />
              <small>{racerName(d.racer)}</small>
            </div>
          ))}
        </div>
        {!show.rolling && (
          <p className="ma-ov-big">
            {show.a.value} : {show.b.value}
          </p>
        )}
      </div>
    );
  } else if (show.kind === "power") {
    const r = RACER_BY_ID.get(show.power);
    const pid = owner(show.racer);
    const mine = pid === me;
    body = (
      <div className={"ma-ov-skill" + (mine ? " mine" : "")} style={{ ["--pc" as string]: colorOf(pid) }}>
        <p className="ma-skill-who">{mine ? "✨ 你的技能触发了！" : `✨ ${name(pid)} 的技能触发了！`}</p>
        <img src={`${ART}/portraits/${artId(show.racer)}.webp`} alt="" />
        <b className="ma-skill-name">
          {racerName(show.racer)}【{r?.powerZh ?? show.power}】
        </b>
        <p className="ma-skill-text">{show.text.replace(/^[^】]*】：?/, "")}</p>
      </div>
    );
  } else if (show.kind === "finish") {
    body = (
      <div className="ma-ov-power finish" style={{ ["--pc" as string]: colorOf(owner(show.racer)) }}>
        <img src={`${ART}/portraits/${artId(show.racer)}.webp`} alt="" />
        <div>
          <small>{name(owner(show.racer))}</small>
          <b>🏁 {racerName(show.racer)} 第 {show.place} 个冲线！</b>
        </div>
      </div>
    );
  } else if (show.kind === "podium") {
    const at = (n: number) => show.places.find((x) => x.place === n);
    const cancelled = view.race?.index === show.race && !!view.race.cancelledBy;
    body = (
      <div className="ma-ov-podium">
        {!cancelled && <Confetti n={28} />}
        <small>第 {show.race + 1} 场 · {cancelled ? "本场取消，不发奖牌" : "颁奖"}</small>
        <div className="ma-podium">
          {[2, 1, 3].map((n) => {
            const pl = at(n);
            return (
              <div key={n} className={"ma-step p" + n + (pl ? "" : " empty")} style={{ ["--pc" as string]: pl ? colorOf(pl.owner) : "#999" }}>
                {pl && (
                  <div className="ma-step-who">
                    {n === 1 && <span className="ma-crown">👑</span>}
                    <img src={`${ART}/tokens/${artId(pl.racer)}.png`} alt="" />
                    <b>{racerName(pl.racer)}</b>
                    <small>
                      {pl.owner === me ? "你" : name(pl.owner)}
                      {n === 2 && at(1)?.racer === pl.racer && " · 军师猜中，再拿亚军"}
                    </small>
                  </div>
                )}
                <div className="ma-step-block">
                  <span>{n}</span>
                  {pl && <em>{pl.points ? `+${pl.points} 分` : "不计分"}</em>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  } else if (show.kind === "champion") {
    const rows = [...show.totals].sort((a, b) => b.total - a.total);
    const iWon = me !== null && show.winners.includes(me);
    body = (
      <div className="ma-ov-champion">
        <Confetti n={70} />
        <div className="ma-trophy">🏆</div>
        <small>4 场比赛全部结束 · 总冠军</small>
        <b className="ma-champ-name">
          {show.winners.map((id) => (
            <span key={id} style={{ ["--pc" as string]: colorOf(id) }}>
              {id === me ? "你" : name(id)}
            </span>
          ))}
        </b>
        <p className="ma-champ-sub">{iWon ? "恭喜你拿下总冠军！🎉" : "全场欢呼！"}</p>
        <ol className="ma-champ-rank">
          {rows.map((r, i) => (
            <li key={r.player} className={show.winners.includes(r.player) ? "win" : ""}>
              <span className="ma-dot" style={{ background: colorOf(r.player) }} />
              <i>{i + 1}</i>
              {r.player === me ? `${name(r.player)}（你）` : name(r.player)}
              <b>{r.total} 分</b>
            </li>
          ))}
        </ol>
      </div>
    );
  } else if (show.kind === "stats") {
    const awards: Array<{ icon: string; title: string; unit: string; key: "forward" | "powers" | "back" | "trips" }> = [
      { icon: "🏃", title: "跑得最远", unit: "格", key: "forward" },
      { icon: "✨", title: "技能王", unit: "次", key: "powers" },
      { icon: "↩️", title: "倒退王", unit: "格", key: "back" },
      { icon: "💫", title: "摔跤王", unit: "次", key: "trips" },
    ];
    body = (
      <div className="ma-ov-stats">
        <small>第 {show.race + 1} 场 · 本场数据</small>
        {awards.map((a, i) => {
          const max = Math.max(0, ...show.rows.map((r) => r[a.key]));
          const top = max > 0 ? show.rows.filter((r) => r[a.key] === max) : [];
          return (
            <div key={a.key} className="ma-stat-row" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
              <span className="ma-stat-icon">{a.icon}</span>
              <span className="ma-stat-title">{a.title}</span>
              {top.length ? (
                <span className="ma-stat-who">
                  {top.map((r) => (
                    <span key={r.racer} className="ma-stat-racer" style={{ ["--pc" as string]: colorOf(r.owner) }}>
                      <img src={`${ART}/portraits/${artId(r.racer)}.webp`} alt="" />
                      {racerName(r.racer)}
                      <small>{r.owner === me ? "你" : name(r.owner)}</small>
                    </span>
                  ))}
                  <b>
                    {max} {a.unit}
                  </b>
                </span>
              ) : (
                <span className="ma-stat-none">本场没有人</span>
              )}
            </div>
          );
        })}
      </div>
    );
  } else if (show.kind === "count") {
    body = (
      <div key={show.n} className={"ma-ov-count" + (show.n === 0 ? " go" : "")}>
        {show.n === 0 ? "开跑！" : show.n}
      </div>
    );
  } else if (show.kind === "start") {
    const tr = TRACKS[show.track as "mild" | "wild"];
    body = (
      <div className="ma-ov-start">
        <small>第 {show.race + 1} 场</small>
        <b>{tr?.zh ?? show.track}</b>
        {show.track === "wild" ? (
          <p>第二张地图：特殊赛道！停在 ★ 得 1 分，停在石头上摔倒，停在箭头上额外前进或后退。</p>
        ) : (
          <p>普通赛道，前两个冲线的拿奖牌。</p>
        )}
      </div>
    );
  } else {
    body = (
      <div className="ma-ov-power note" style={{ ["--pc" as string]: colorOf(owner(show.racer)) }}>
        <img src={`${ART}/portraits/${artId(show.racer)}.webp`} alt="" />
        <div>
          <b>{racerName(show.racer)}</b>
          <p>{show.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={"ma-overlay ov-" + show.kind} onClick={onSkip} role="status" aria-live="polite" title="点一下跳过动画">
      {body}
      <span className="ma-ov-skip">{show.kind === "champion" ? "点屏幕查看成绩" : show.kind === "podium" || show.kind === "stats" ? "点屏幕继续" : "点屏幕跳过动画"}</span>
    </div>
  );
}

/** 彩带：纯 CSS 下落，位置和颜色固定（不用随机数，重渲染不跳） */
function Confetti({ n }: { n: number }) {
  const colors = ["#e8443a", "#2f7fd8", "#f2b705", "#8a4fd6", "#1fa37a", "#f07c1e", "#ffffff"];
  return (
    <div className="ma-confetti" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const x = (i * 37 + 11) % 100;
        const delay = ((i * 53) % 100) / 60;
        const dur = 2.2 + ((i * 29) % 100) / 70;
        const rot = (i * 71) % 360;
        return (
          <i
            key={i}
            style={{
              left: `${x}%`,
              background: colors[i % colors.length],
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
              transform: `rotate(${rot}deg)`,
              width: i % 3 ? 8 : 12,
              height: i % 3 ? 14 : 8,
            }}
          />
        );
      })}
    </div>
  );
}

/** 转动中的骰子：每 90ms 换一面，落定后显示真实点数 */
function RollingDie({ pid, value, rolling, seatNo }: { pid: string; value: number; rolling: boolean; seatNo: (p: string) => number }) {
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace((f) => (f % 6) + 1), 90);
    return () => clearInterval(id);
  }, [rolling]);
  return (
    <div className={"ma-bigdie" + (rolling ? " rolling" : " landed")}>
      <img src={`${ART}/dice/player-${seatNo(pid)}-${rolling ? face : value}.svg`} alt={rolling ? "骰子转动中" : `${value} 点`} />
    </div>
  );
}

function Final({ view }: { view: MAView }) {
  const rows = [...view.players].sort((a, b) => total(b.chips) - total(a.chips));
  const max = total(rows[0].chips);
  return (
    <section className="ma-stage ma-final">
      <h2>最终成绩</h2>
      <ol>
        {rows.map((p) => (
          <li key={p.id} className={total(p.chips) === max ? "win" : ""}>
            {p.name} <b>{total(p.chips)} 分</b>
            <small>
              {p.chips.map((c) => (c.kind === "gold" ? "🥇" : c.kind === "silver" ? "🥈" : "🥉") + c.value).join(" ")}
            </small>
          </li>
        ))}
      </ol>
      <a className="ma-go" href="/?game=ma">再开一局</a>
    </section>
  );
}

function Log({ view }: { view: MAView }) {
  const entries = view.log.filter((l) => l.text).slice(-40).reverse();
  return (
    <Fold id="log" title="比赛记录" defaultOpen={!isPhone()} className="ma-log">
      <ol>
        {entries.map((l, i) => (
          <li key={view.log.length - i}>{l.text}</li>
        ))}
      </ol>
    </Fold>
  );
}
