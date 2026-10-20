import React, { useEffect, useMemo, useState } from "react";
import {
  RACER_BY_ID,
  racerName,
  total,
  TRACKS,
  HIDDEN_CHOICE,
  type MAView,
} from "../../../../packages/magical-athlete/src/index.ts";
import type { MARoomSnapshot } from "../../../../packages/shared/src/ma-protocol.ts";
import { createMARoom, savedName, useMARoom } from "./ma-net.ts";
import { ART, PLAYER_COLORS, Track } from "./Track.tsx";
import { usePlayback, type Show } from "./playback.ts";
import "./ma.css";

const roomFromUrl = () => new URLSearchParams(location.search).get("room")?.toUpperCase() ?? null;
const goRoom = (code: string) => {
  history.pushState(null, "", `/?game=ma&room=${code}`);
  dispatchEvent(new PopStateEvent("popstate"));
};

export function MagicalAthlete() {
  const [room, setRoom] = useState(roomFromUrl);
  useEffect(() => {
    document.title = "魔法运动员 · 桌游合集";
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
          <p>2–6 名玩家各自选秀怪咖选手，比四场赛跑。掷骰、发动能力、把别人绊倒——前两个冲线的拿奖牌。</p>
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
        <p className="ma-muted">建好房间后把房间号或二维码发给朋友，每人用自己的手机加入。2–6 人都能玩。</p>
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
  if (!snap.mySeat && snap.stage === "lobby") return <JoinForm snap={snap} claim={net.claim} />;
  if (snap.stage === "lobby" || !snap.view) return <Lobby snap={snap} lobby={net.lobby} />;
  return <Game snap={snap} view={snap.view} send={net.send} connected={net.connected} />;
}

function JoinForm({ snap, claim }: { snap: MARoomSnapshot; claim: (n: string) => Promise<string | null> }) {
  const [name, setName] = useState(savedName);
  const [error, setError] = useState("");
  const full = snap.players.length >= 6;
  return (
    <main className="ma-home">
      <Masthead small />
      <section className="ma-panel">
        <h2>加入房间 {snap.code}</h2>
        <p className="ma-muted">
          已在房间：{snap.players.map((p) => p.name).join("、") || "还没有人"}
        </p>
        <form
          className="ma-join"
          onSubmit={async (e) => {
            e.preventDefault();
            const err = await claim(name);
            if (err) setError(err);
          }}
        >
          <input data-testid="ma-name" aria-label="昵称" placeholder="你的昵称" maxLength={12} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="ma-go" disabled={full || !name.trim()} data-testid="ma-claim">
            {full ? "房间已满" : "加入"}
          </button>
        </form>
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
          <div className="ma-code" data-testid="ma-code">{snap.code}</div>
          <code className="ma-url">{url}</code>
        </div>
        {url && <img src={`/api/qr?text=${encodeURIComponent(url)}`} alt="扫码加入房间" width={150} height={150} />}
      </section>
      <section className="ma-panel">
        <h2>选手们（{snap.players.length}/6）</h2>
        <ul className="ma-players">
          {snap.players.map((p, i) => (
            <li key={p.playerId}>
              <span className="ma-dot" style={{ background: PLAYER_COLORS[i] }} />
              {p.name}
              {p.host && <em>房主</em>}
              {p.playerId === snap.mySeat && <em>你</em>}
              {!p.connected && <em className="off">离线</em>}
            </li>
          ))}
        </ul>
      </section>
      <section className="ma-panel">
        <h2>每场奖牌分值</h2>
        <p className="ma-muted">
          规则书只说「越后面的比赛越值钱」，没写具体数字（印在奖牌实物上）。现在默认金牌 3、银牌 1（来自评测文章，待核对），房主可以按实物改。
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
        <p className="ma-muted">赛道顺序：温和 → 狂野 → 温和 → 狂野。<a href={`${ART}/docs/skillbook.pdf`} target="_blank" rel="noreferrer">36 名选手技能书（PDF）</a></p>
      </section>
      <section className="ma-panel">
        <h2>规则</h2>
        <p className="ma-muted">每人选秀 4 名选手，共 4 场，每场每人派 1 名上场（2 人局也一样）。</p>
      </section>
      {error && <p className="ma-error" role="alert">{error}</p>}
      {host ? (
        <button className="ma-go" data-testid="ma-start" disabled={snap.players.length < 2} onClick={() => run({ type: "START" })}>
          {snap.players.length < 2 ? "还差 1 人才能开始" : "人齐了，开始选秀"}
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
  const act = async (c: Parameters<Send>[0]) => setError((await send(c)) ?? "");
  useEffect(() => setError(""), [snap.version]);
  const pb = usePlayback(view);
  const [card, setCard] = useState<string | null>(null);
  // 比赛刚结束时，等动画（冲线、颁奖）播完再切到下一场的选人界面
  const showRace = !!view.race && (view.phase === "race" || view.phase === "over" || (view.phase === "choose" && pb.busy));
  return (
    <main className={"ma-game phase-" + view.phase}>
      {pb.show && <Overlay show={pb.show} view={view} name={name} colorOf={colorOf} me={me} onSkip={pb.skip} />}
      {card && <CardLightbox id={card} onClose={() => setCard(null)} />}
      <div className="ma-topbar">
        <a className="ma-back" href="/">← 合集</a>
        <strong>魔法运动员</strong>
        <span className="ma-muted">房间 {snap.code}{!connected && " · 重新连接中…"}</span>
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

function Scores({ view, me, colorOf, compact }: { view: MAView; me: string | null; colorOf: (id: string) => string; compact?: boolean }) {
  return (
    <ul className={"ma-scores" + (compact ? " compact" : "")}>
      {view.players.map((p) => {
        const runners = view.race && !view.race.over ? view.race.tokens.filter((t) => t.owner === p.id) : [];
        return (
          <li key={p.id} className={p.id === me ? "me" : ""} style={{ borderColor: colorOf(p.id) }}>
            <span className="ma-dot" style={{ background: colorOf(p.id) }} />
            <span className="ma-pname">{p.name}</span>
            <b className="ma-total">{total(p.chips)}</b>
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
                <img key={t.racer} src={`${ART}/portraits/${t.racer}.webp`} alt="" />
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
                  <img src={`${ART}/portraits/${t.racer}.webp`} alt="" />
                  <span>
                    <small>点开看卡</small>
                    <b>{r.zh}</b>
                    <em>
                      【{power?.powerZh}】{power?.text}
                      {t.base !== t.racer && `（来自${racerName(t.base)}）`}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>
        </Fold>
      )}
      <div className="ma-board">
        <div className="ma-board-head">
          <b>第 {race.index + 1} 场 · {track.zh}</b>
          <button type="button" className="ma-zoom" onClick={() => setFit((f) => !f)} data-testid="ma-zoom">
            {fit ? "🔍 放大赛道" : "🗺 看整条赛道"}
          </button>
          {race.track === "wild" ? (
            <span className="ma-legend">
              <i className="star">★</i>星星 +1 分 <i className="rock">▲</i>石头摔倒 <i className="arrow">➜</i>箭头额外前进/后退
            </span>
          ) : (
            <span className="ma-legend">普通赛道，没有特殊格</span>
          )}
        </div>
        <Track race={race} colorOf={colorOf} me={me} shown={pb.shown} moving={pb.moving} onPawn={openCard} fit={fit} />
      </div>
      <div className="ma-side">
        {p && !race.over && (
          <div className={"ma-decide" + (p.player === me ? " you" : "")} data-testid="ma-decide">
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
                  <button key={o.value} className={o.value === "roll" ? "ma-go" : ""} onClick={() => act({ type: "ANSWER", value: o.value })}>
                    {o.label}
                  </button>
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
                <img className="ma-portrait" src={`${ART}/portraits/${t.racer}.webp`} alt="" />
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
    body = (
      <div className="ma-ov-power" style={{ ["--pc" as string]: colorOf(pid) }}>
        <img src={`${ART}/portraits/${show.racer}.webp`} alt="" />
        <div>
          <small>{name(pid)} 的 {racerName(show.racer)} 发动技能</small>
          <b>【{r?.powerZh ?? show.power}】</b>
          <p>{show.text.replace(/^[^】]*】：?/, "")}</p>
        </div>
      </div>
    );
  } else if (show.kind === "finish") {
    body = (
      <div className="ma-ov-power finish" style={{ ["--pc" as string]: colorOf(owner(show.racer)) }}>
        <img src={`${ART}/portraits/${show.racer}.webp`} alt="" />
        <div>
          <small>{name(owner(show.racer))}</small>
          <b>🏁 {racerName(show.racer)} 第 {show.place} 个冲线！</b>
        </div>
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
        <img src={`${ART}/portraits/${show.racer}.webp`} alt="" />
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
      <span className="ma-ov-skip">点屏幕跳过动画</span>
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
