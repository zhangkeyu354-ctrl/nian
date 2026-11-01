import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMALS, previewKB, valueOf, type KBEvent } from "../../../../packages/kariba/src/index.ts";
import type { KBRoomSnapshot } from "../../../../packages/shared/src/kb-protocol.ts";
import { feel, setSoundOn, soundOn } from "../drawing/feel.ts";
import { createKBRoom, savedName, useKBRoom } from "./kb-net.ts";
import { confetti, playFlights } from "./fx.ts";
import "./kb.css";

/** 原创动物插画（ChatGPT 生成，用户提供，见 docs/kariba/ASSETS.md） */
export const Art = ({ v, cls = "" }: { v: number; cls?: string }) => (
  <img className={"kb-art " + cls} src={`/assets/kariba/${v}.webp`} alt="" draggable={false} />
);
const TEAM = ["A", "B", "C", "D"];

export function Kariba() {
  const q = new URLSearchParams(location.search);
  const room = q.get("room")?.toUpperCase() ?? "";
  const [err, setErr] = useState("");
  useEffect(() => {
    if (room) return;
    void createKBRoom().then((r) => {
      if (r.ok) location.replace(`/?game=kb&room=${r.code}`);
      else setErr(r.error);
    });
  }, [room]);
  if (!room) return <div className="kb-world kb-center">{err || "正在创建房间…"}</div>;
  return <KBRoomView code={room} />;
}

function KBRoomView({ code }: { code: string }) {
  const net = useKBRoom(code);
  const { snap } = net;
  if (net.error && !snap) return <div className="kb-world kb-center">{net.error}<a href="/">回大厅</a></div>;
  if (!snap) return <div className="kb-world kb-center">正在进入房间…</div>;
  return (
    <div className="kb-world" data-testid="kb-root">
      {!net.connected && <div className="kb-reconnect" role="status">重连中…</div>}
      {!snap.mySeat ? (
        <Join net={net} snap={snap} />
      ) : snap.stage === "lobby" || !snap.view ? (
        <Lobby net={net} snap={snap} />
      ) : (
        <Game net={net} snap={snap} />
      )}
    </div>
  );
}

type Net = ReturnType<typeof useKBRoom>;

function Join({ net, snap }: { net: Net; snap: KBRoomSnapshot }) {
  const [name, setName] = useState(savedName());
  const [msg, setMsg] = useState("");
  return (
    <div className="kb-panel kb-join">
      <Logo />
      <p>房间 {snap.code} · 已有 {snap.players.length} 人</p>
      <input data-testid="kb-name" value={name} maxLength={12} placeholder="你的昵称" onChange={(e) => setName(e.target.value)} />
      <button className="kb-btn kb-primary" data-testid="kb-claim" onClick={async () => setMsg((await net.claim(name)) ?? "")}>
        加入房间
      </button>
      {snap.stage === "game" && <p className="kb-note">游戏已经开始，只能旁观。</p>}
      {msg && <p className="kb-error">{msg}</p>}
    </div>
  );
}

function Logo() {
  return (
    <div className="kb-logo">
      <img src="/assets/kariba/box.webp" alt="卡里巴湖" />
      <b>卡里巴湖</b>
      <small>Kariba</small>
    </div>
  );
}

function Lobby({ net, snap }: { net: Net; snap: KBRoomSnapshot }) {
  const me = snap.players.find((p) => p.playerId === snap.mySeat);
  const host = !!me?.host;
  const n = snap.players.length;
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const ok = snap.mode === "solo" ? n >= 2 && n <= 5 : [4, 6, 8].includes(n);
  const need =
    snap.mode === "solo"
      ? n < 2 ? `还差 ${2 - n} 人` : n > 5 ? "个人战最多 5 人，请改成组队" : ""
      : n < 4 ? `还差 ${4 - n} 人` : n % 2 ? "再来 1 人就能组队" : n > 8 ? "最多 8 人" : "";
  const act = async (a: Parameters<Net["lobby"]>[0]) => {
    feel("tap");
    setMsg((await net.lobby(a)) ?? "");
  };
  return (
    <div className="kb-panel kb-lobby">
      <Logo />
      <ul className="kb-rules">
        <li>每回合打出一张或几张同种动物，放到水塘对应位置。</li>
        <li>一种动物凑满 3 张，就赶走比它小、最近的一种，那些牌归你。</li>
        <li>老鼠是唯一能赶走大象的动物。牌打完时，收得最多的人（或队伍）赢。</li>
      </ul>
      <div className="kb-row">
        <span>模式</span>
        <div className="kb-seg">
          {(["solo", "team"] as const).map((m) => (
            <button key={m} className={"kb-btn" + (snap.mode === m ? " on" : "")} disabled={!host} aria-pressed={snap.mode === m} data-testid={"kb-mode-" + m} onClick={() => act({ type: "SET_MODE", mode: m })}>
              {m === "solo" ? "个人战 2–5 人" : "组队 4/6/8 人"}
            </button>
          ))}
        </div>
      </div>
      <div className="kb-row">
        <span>每回合</span>
        <div className="kb-seg">
          {([30, 60, 0] as const).map((s) => (
            <button key={s} className={"kb-btn" + (snap.seconds === s ? " on" : "")} disabled={!host} aria-pressed={snap.seconds === s} onClick={() => act({ type: "SET_SECONDS", seconds: s })}>
              {s ? `${s} 秒` : "不限"}
            </button>
          ))}
        </div>
      </div>
      {snap.mode === "team" && <p className="kb-note">开局随机分队，两人一队、交叉入座；队友手牌互相看不到，可以开麦商量。</p>}
      <ol className="kb-players">
        {snap.players.map((p) => (
          <li key={p.playerId} className={p.connected ? "" : "off"}>
            <span className="kb-name">{p.name}</span>
            {p.host && <em>房主</em>}
            {p.playerId === snap.mySeat && <em>我</em>}
            {!p.connected && <em>🔌</em>}
          </li>
        ))}
      </ol>
      <button
        className="kb-btn"
        onClick={() => {
          void navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => {});
        }}
      >
        {copied ? "已复制邀请链接" : `复制邀请链接 · 房间 ${snap.code}`}
      </button>
      <div className="kb-dock">
        {host ? (
          <button className="kb-btn kb-primary" data-testid="kb-start" disabled={!ok} onClick={() => act({ type: "START" })}>
            {ok ? `开始（${n} 人${snap.mode === "team" ? ` · ${n / 2} 队` : ""}）` : need}
          </button>
        ) : (
          <button className="kb-btn kb-primary" disabled>{need || "等待房主开始…"}</button>
        )}
      </div>
      {msg && <p className="kb-error">{msg}</p>}
    </div>
  );
}

function useNow(now: () => number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  return now();
}

function Game({ net, snap }: { net: Net; snap: KBRoomSnapshot }) {
  const v = snap.view!;
  const seat = v.you;
  const myTurn = v.phase === "PLAY" && v.turn === seat;
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState("");
  const [sound, setSound] = useState(soundOn());
  const [menu, setMenu] = useState(false);
  const team = v.options.mode === "team";

  // 新版本到来：清掉不在手里的选择
  useEffect(() => {
    setSel((s) => s.filter((id) => v.hand.includes(id)));
  }, [snap.version]);

  // 出牌后的效果：赶走动画 + 音效
  const [fx, setFx] = useState<{ key: number; events: KBEvent[] } | null>(null);
  const [showFinal, setShowFinal] = useState(v.phase === "FINISHED" && !v.lastEvents.length);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(endTimer.current), []);
  useEffect(() => {
    if (v.phase === "FINISHED" && !endTimer.current) endTimer.current = setTimeout(() => setShowFinal(true), 3500);
    if (v.phase !== "FINISHED") setShowFinal(false);
  }, [v.phase]);
  const [rules, setRules] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; timer: number; ghost: HTMLElement | null; over: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState(0);
  const seen = useRef(snap.version);
  useEffect(() => {
    if (snap.version === seen.current) return;
    seen.current = snap.version;
    const ev = v.lastEvents;
    if (!ev.length) return;
    setFx({ key: snap.version, events: ev });
    feel("page");
    let dur = 0;
    const raf = requestAnimationFrame(() => {
      dur = playFlights(ev, seat, (mine) => feel(mine ? "win" : "stamp", { vibration: mine }));
      if (!dur && ev.some((e) => e.type === "CHASE")) feel("stamp");
      if (ev.some((e) => e.type === "END"))
        endTimer.current = setTimeout(() => setShowFinal(true), dur + 600);
    });
    const t = setTimeout(() => setFx(null), Math.max(2400, dur + 1200));
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [snap.version]);
  useEffect(() => {
    document.querySelector(`[data-kb-seat="${v.turn}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [v.turn]);
  useEffect(() => {
    if (myTurn) feel("turn", { vibration: true });
  }, [myTurn, v.turnNo]);

  const selValue = sel.length ? valueOf(sel[0]) : 0;
  const pv = selValue ? previewKB(v.pond.map((n) => Array(n).fill("x")), selValue, sel.length) : null;
  const toggle = (id: string) => {
    if (!myTurn) return;
    feel("select");
    const val = valueOf(id);
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length && valueOf(s[0]) !== val ? [id] : [...s, id]));
  };
  const pickSlot = (val: number) => {
    if (!myTurn) return;
    const ids = v.hand.filter((id) => valueOf(id) === val);
    if (!ids.length) return;
    feel("select");
    setSel(selValue === val && sel.length < ids.length ? ids.slice(0, sel.length + 1) : selValue === val ? [] : [ids[0]]);
  };
  const submit = async (ids = sel) => {
    if (!ids.length || busy) return;
    setBusy(true);
    feel("submit");
    const e = await net.play(ids, snap.version);
    setBusy(false);
    if (e) {
      setShake(e);
      feel("lose");
      setTimeout(() => setShake(""), 2500);
    } else setSel([]);
  };

  // 拖拽：长按 150ms 拿起，拖到水塘对应位置松手即出牌（同种已选中的牌一起出）
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.ghost?.remove();
    document.querySelector(`[data-testid="kb-card-${d.id}"]`)?.classList.remove("lifting");
    drag.current = null;
    setHover(0);
  };
  const onDown = (e: React.PointerEvent, id: string) => {
    if (!myTurn || busy) return;
    const d = { id, x: e.clientX, y: e.clientY, timer: 0, ghost: null as HTMLElement | null, over: 0, moved: false };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {}
    d.timer = window.setTimeout(() => {
      const g = (e.currentTarget as HTMLElement | null)?.cloneNode(true) as HTMLElement | undefined;
      const src = document.querySelector(`[data-testid="kb-card-${id}"]`) as HTMLElement | null;
      const ghost = (g ?? src?.cloneNode(true)) as HTMLElement | undefined;
      if (!ghost) return;
      ghost.classList.add("kb-ghost");
      ghost.removeAttribute("data-testid");
      ghost.style.left = d.x + "px";
      ghost.style.top = d.y + "px";
      document.body.appendChild(ghost);
      d.ghost = ghost;
      src?.classList.add("lifting");
      feel("select");
    }, 150);
    drag.current = d;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) {
        clearTimeout(d.timer);
        drag.current = null;
      }
      return;
    }
    e.preventDefault();
    d.moved = true;
    d.ghost.style.left = e.clientX + "px";
    d.ghost.style.top = e.clientY + "px";
    d.ghost.style.display = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-kb-slot]") as HTMLElement | null;
    d.ghost.style.display = "";
    const over = under ? Number(under.dataset.kbSlot) : 0;
    if (over !== d.over) {
      d.over = over;
      setHover(over);
    }
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    const dropped = d.ghost && d.over;
    const val = valueOf(d.id);
    const over = d.over;
    endDrag();
    if (!dropped) return;
    if (over !== val) {
      setShake(`${ANIMALS[val]}只能放到 ${val} 号「${ANIMALS[val]}」的位置`);
      feel("lose");
      setTimeout(() => setShake(""), 2200);
      return;
    }
    const same = sel.length && valueOf(sel[0]) === val ? (sel.includes(d.id) ? sel : [...sel, d.id]) : [d.id];
    setSel(same);
    void submit(same);
  };

  const sortedHand = useMemo(() => v.hand.slice().sort((a, b) => valueOf(a) - valueOf(b) || a.localeCompare(b)), [v.hand]);
  const cur = v.players[v.turn];

  if (v.phase === "FINISHED" && showFinal) return <Final snap={snap} net={net} />;

  return (
    <div className={"kb-game" + (myTurn ? " my-turn" : "")}>
      <header className="kb-top">
        <span className="kb-code">房间 {snap.code}</span>
        <span className="kb-deck" data-testid="kb-deck">库 {v.deck}{v.lastRound ? " · 最后一圈" : ""}</span>
        <Timer deadline={v.deadline} total={v.options.seconds} now={net.now} myTurn={myTurn} />
        <button className="kb-btn kb-icon" aria-label="菜单" onClick={() => setMenu(!menu)}>☰</button>
        {menu && (
          <div className="kb-menu" role="menu">
            <button className="kb-btn" onClick={() => { setSoundOn(!sound); setSound(!sound); }}>音效：{sound ? "开" : "关"}</button>
            <button className="kb-btn" onClick={() => { setRules(true); setMenu(false); }}>规则</button>
            <a className="kb-btn" href="/">退出到大厅</a>
          </div>
        )}
      </header>

      {rules && (
        <div className="kb-modal" role="dialog" aria-label="规则" onClick={() => setRules(false)}>
          <div className="kb-panel kb-rules-card" onClick={(e) => e.stopPropagation()}>
            <h3>怎么玩</h3>
            <ul className="kb-rules">
              <li>轮到你时，打出 1 张或几张<b>同一种</b>动物，放到水塘里它的位置。</li>
              <li>这个位置凑满 <b>3 只或更多</b>，就把<b>比它小、最近的一种</b>动物全部赶走，那些牌归你。中间空着的位置跳过。</li>
              <li><b>老鼠</b>只能赶大象，大象被老鼠赶。</li>
              <li>出完补到 5 张。牌库空后有人打完最后一张，游戏结束。收的<b>张数</b>最多的人{team ? "（队伍）" : ""}赢。</li>
              <li>操作：点手牌或点水塘位置选牌，或者长按手牌拖到水塘。</li>
            </ul>
            <button className="kb-btn kb-primary" onClick={() => setRules(false)}>知道了</button>
          </div>
        </div>
      )}
      {v.lastRound && <div className="kb-banner last">🏁 牌库空了 · 补完这一圈就结束</div>}
      {v.phase === "FINISHED" ? (
        <div className="kb-banner turn">本局结束，马上结算…</div>
      ) : myTurn ? (
        <div className="kb-banner turn">轮到你了</div>
      ) : (
        <div className="kb-banner">轮到 {v.turn + 1}号 {cur.name}{team ? `（${TEAM[cur.team]}队）` : ""}</div>
      )}

      <Pond pond={v.pond} sel={selValue || hover} target={pv?.target ?? 0} onPick={pickSlot} fx={fx} hover={hover} />

      <div className="kb-side">
      <div className="kb-preview" data-testid="kb-preview" aria-live="polite">
        {pv ? (
          <span className={"kb-chip" + (pv.target ? " gain" : "")}>
            <Art v={selValue} cls="mini" />×{pv.total}
            {pv.target ? (
              <>
                <span className="arrow">赶走</span>
                <Art v={pv.target} cls="mini" />×{pv.cards}
                <b>+{pv.cards} 张</b>
              </>
            ) : (
              <span className="arrow">{pv.total >= 3 ? "没有可赶的动物" : `还差 ${3 - pv.total} 只触发`}</span>
            )}
          </span>
        ) : fx
            ? describe(fx.events, v.players)
            : myTurn
              ? "点手牌选牌，或长按拖进水塘"
              : null}
      </div>

      <ol className="kb-seats" data-testid="kb-seats">
        {v.players.map((p, i) => (
          <li key={i} data-kb-seat={i} className={(i === v.turn ? "cur " : "") + (i === seat ? "me " : "") + (team ? "t" + p.team : "")}>
            {team && <span className="kb-team">{TEAM[p.team]}</span>}
            <span className="kb-name">{p.name}</span>
            <span className="kb-score" title={team ? `本人 ${p.score} · 队伍 ${p.teamScore}` : undefined}>
              <b>{team ? p.teamScore : p.score}</b>
              <small>{team ? "队分" : "张"}</small>
            </span>
            <span className="kb-hc" aria-label={`手牌 ${p.handCount} 张`}>
              {Array.from({ length: 5 }, (_, k) => (
                <i key={k} className={k < p.handCount ? "on" : ""} />
              ))}
            </span>
            {i === seat && <em>我</em>}
            {!snap.players.find((x) => x.playerId === snap.seats[i])?.connected && <em>🔌</em>}
          </li>
        ))}
      </ol>

      <div className="kb-hand" data-testid="kb-hand">
        {sortedHand.map((id) => {
          const val = valueOf(id);
          return (
            <button
              key={id}
              data-testid={"kb-card-" + id}
              className={"kb-card v" + val + (sel.includes(id) ? " sel" : "") + (selValue && val !== selValue ? " dim" : "")}
              aria-pressed={sel.includes(id)}
              aria-label={`${ANIMALS[val]} ${val}`}
              disabled={!myTurn}
              onClick={() => {
                if (drag.current?.moved) return;
                toggle(id);
              }}
              onPointerDown={(e) => onDown(e, id)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={endDrag}
              onContextMenu={(e) => e.preventDefault()}
            >
              <b>{val}</b>
              <Art v={val} />
              <small>{ANIMALS[val]}</small>
            </button>
          );
        })}
      </div>

      <div className={"kb-dock" + (myTurn ? " glow" : "")}>
        {myTurn ? (
          <>
            <button className={"kb-btn kb-primary" + (shake ? " shake" : "")} data-testid="kb-play" disabled={!sel.length || busy} onClick={() => submit()}>
              {busy ? "…" : sel.length ? `放 ${sel.length} 只${ANIMALS[selValue]}` : "先选牌"}
            </button>
            {sel.length > 0 && <button className="kb-btn" onClick={() => setSel([])}>取消</button>}
          </>
        ) : (
          <button className="kb-btn kb-primary kb-wait" disabled><span>等待 {v.turn + 1}号 {cur.name}…</span></button>
        )}
      </div>
      {shake && <p className="kb-error" role="alert">{shake}</p>}
      </div>
    </div>
  );
}

function describe(ev: KBEvent[], players: { name: string }[]) {
  const play = ev.find((e) => e.type === "PLAY");
  const chase = ev.find((e) => e.type === "CHASE");
  const to = ev.find((e) => e.type === "TIMEOUT");
  if (!play || play.type !== "PLAY") return null;
  const who = players[play.seat].name;
  let s = `${to ? "⏱ 超时，" : ""}${who} 放了 ${play.count} 只${ANIMALS[play.value]}`;
  if (chase && chase.type === "CHASE")
    s += chase.by === 1 ? `，🐭 老鼠吓跑了 ${chase.cards} 头大象！` : `，赶走 ${ANIMALS[chase.target]} ×${chase.cards}`;
  if (ev.some((e) => e.type === "LAST_ROUND")) s += "。牌打完了，补完这一圈结束";
  return s;
}

function Timer({ deadline, total, now, myTurn }: { deadline: number | null; total: number; now: () => number; myTurn: boolean }) {
  const t = useNow(now);
  const left = deadline ? Math.max(0, Math.ceil((deadline - t) / 1000)) : null;
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (myTurn && left !== null && left <= 5 && left > 0 && lastTick.current !== left) {
      lastTick.current = left;
      feel("tick");
    }
  }, [left, myTurn]);
  if (left === null || !total) return <span className="kb-timer">∞</span>;
  const r = left / total;
  const color = r > 0.5 ? "var(--kb-ok)" : r > 0.2 ? "var(--kb-warn)" : "var(--kb-bad)";
  return (
    <span className={"kb-timer" + (left <= 10 ? " hot" : "")} style={{ ["--p" as string]: `${r * 360}deg`, ["--c" as string]: color }} aria-label={`剩 ${left} 秒`}>
      {left}
    </span>
  );
}

/** 水塘：8 个位置排成一圈，1→8 顺时针，老鼠与大象相邻 */
function Pond({ pond, sel, target, onPick, fx, hover }: { pond: number[]; sel: number; target: number; onPick: (v: number) => void; fx: { key: number; events: KBEvent[] } | null; hover: number }) {
  const chase = fx?.events.find((e) => e.type === "CHASE");
  const played = fx?.events.find((e) => e.type === "PLAY");
  return (
    <div className="kb-pond" data-testid="kb-pond">
      <div className="kb-water" aria-hidden>
        <i className="ripple" />
        <i className="ripple r2" />
      </div>
      <div className="kb-rule-hint" aria-hidden>
        <Art v={1} cls="mini" />
        <span>赶</span>
        <Art v={8} cls="mini" />
      </div>
      {Array.from({ length: 8 }, (_, k) => {
        const val = k + 1;
        const ang = ((k / 8) * 360 - 90 - 22.5) * (Math.PI / 180);
        const n = pond[val];
        const cls = [
          "kb-slot",
          "v" + val,
          n >= 3 ? "hot" : "",
          sel === val ? "sel" : "",
          target === val ? "target" : "",
          played && played.type === "PLAY" && played.value === val ? "just" : "",
          chase && chase.type === "CHASE" && chase.target === val ? "fled" : "",
          hover === val ? "drop" : "",
          n ? "has" : "empty",
        ].join(" ");
        return (
          <button
            key={val}
            className={cls}
            style={{ left: `${50 + 36 * Math.cos(ang)}%`, top: `${50 + 36 * Math.sin(ang)}%`, ["--n" as string]: Math.min(n, 6) }}
            data-testid={"kb-slot-" + val}
            data-kb-slot={val}
            aria-label={`${ANIMALS[val]}（${val}）${n} 张`}
            onClick={() => onPick(val)}
          >
            <span className="kb-pad" aria-hidden />
            <Art v={val} cls="kb-ico" />
            <b className="kb-cnt">{n}</b>
            <small className="kb-tag"><i>{val}</i>{ANIMALS[val]}</small>
          </button>
        );
      })}
    </div>
  );
}

function Final({ snap, net }: { snap: KBRoomSnapshot; net: Net }) {
  const v = snap.view!;
  const team = v.options.mode === "team";
  const me = snap.players.find((p) => p.playerId === snap.mySeat);
  const rows = v.players.slice().sort((a, b) => b.teamScore - a.teamScore || b.score - a.score);
  const titles: string[] = [];
  const best = (f: (p: (typeof v.players)[number]) => number, label: string) => {
    const m = Math.max(...v.players.map(f));
    if (m > 0) titles.push(`${label}：${v.players.filter((p) => f(p) === m).map((p) => p.name).join("、")}（${m}）`);
  };
  best((p) => p.stats?.biggest ?? 0, "最大一口");
  best((p) => p.stats?.mouseElephant ?? 0, "老鼠英雄");
  best((p) => p.stats?.chases ?? 0, "驱赶次数最多");
  const win = v.winners;
  const mine = win.includes(v.you);
  useEffect(() => {
    if (mine) confetti();
  }, []);
  return (
    <div className={"kb-panel kb-final" + (mine ? " won" : " lost")} data-testid="kb-final">
      <p className="kb-result">{mine ? "🎉 你赢了！" : "差一点！下一局再来"}</p>
      <Logo />
      <h2>
        {team
          ? `${[...new Set(win.map((i) => TEAM[v.players[i].team]))].join("、")} 队获胜！`
          : `${win.map((i) => v.players[i].name).join("、")} 获胜！`}
      </h2>
      <ol className="kb-podium">
        {rows.map((p) => (
          <li key={p.seat} className={win.includes(p.seat) ? "win" : ""}>
            {team && <span className="kb-team">{TEAM[p.team]}</span>}
            <span className="kb-name">{p.name}</span>
            <b>{p.score} 张</b>
            {team && <small>队伍 {p.teamScore}</small>}
          </li>
        ))}
      </ol>
      {titles.length > 0 && <ul className="kb-titles">{titles.map((t) => <li key={t}>{t}</li>)}</ul>}
      <div className="kb-dock">
        {me?.host ? (
          <button className="kb-btn kb-primary" data-testid="kb-again" onClick={() => net.lobby({ type: "START" })}>再来一局</button>
        ) : (
          <button className="kb-btn kb-primary" disabled>等房主开下一局…</button>
        )}
      </div>
    </div>
  );
}
