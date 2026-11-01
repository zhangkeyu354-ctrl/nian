import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMALS, previewKB, valueOf, type KBEvent } from "../../../../packages/kariba/src/index.ts";
import type { KBRoomSnapshot } from "../../../../packages/shared/src/kb-protocol.ts";
import { feel, setSoundOn, soundOn } from "../drawing/feel.ts";
import { createKBRoom, savedName, useKBRoom } from "./kb-net.ts";
import "./kb.css";

/** 自绘占位图标（官方美术待取，见 docs/kariba/ASSETS.md） */
export const ICON = ["", "🐭", "🦦", "🦓", "🦒", "🪶", "🐆", "🦏", "🐘"];
const TEAM = ["A", "B", "C", "D"];
const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      <span>🐭🐘</span>
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
  const now = useNow(net.now);
  const team = v.options.mode === "team";

  // 新版本到来：清掉不在手里的选择
  useEffect(() => {
    setSel((s) => s.filter((id) => v.hand.includes(id)));
  }, [snap.version]);

  // 出牌后的效果：赶走动画 + 音效
  const [fx, setFx] = useState<{ key: number; events: KBEvent[] } | null>(null);
  const seen = useRef(snap.version);
  useEffect(() => {
    if (snap.version === seen.current) return;
    seen.current = snap.version;
    const ev = v.lastEvents;
    if (!ev.length) return;
    setFx({ key: snap.version, events: ev });
    const chase = ev.find((e) => e.type === "CHASE");
    if (chase) feel(chase.seat === seat ? "win" : "stamp");
    else feel("page");
    if (ev.some((e) => e.type === "END")) feel(v.winners.includes(seat) ? "win" : "lose");
    const t = setTimeout(() => setFx(null), reduced() ? 1200 : 2200);
    return () => clearTimeout(t);
  }, [snap.version]);
  useEffect(() => {
    if (myTurn) feel("turn");
  }, [myTurn, v.turnNo]);

  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - now) / 1000)) : null;
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (myTurn && left !== null && left <= 5 && left > 0 && lastTick.current !== left) {
      lastTick.current = left;
      feel("tick");
    }
  }, [left, myTurn]);

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
  const submit = async () => {
    if (!sel.length || busy) return;
    setBusy(true);
    feel("submit");
    const e = await net.play(sel, snap.version);
    setBusy(false);
    if (e) {
      setShake(e);
      feel("lose");
      setTimeout(() => setShake(""), 2500);
    } else setSel([]);
  };

  const sortedHand = useMemo(() => v.hand.slice().sort((a, b) => valueOf(a) - valueOf(b) || a.localeCompare(b)), [v.hand]);
  const cur = v.players[v.turn];

  if (v.phase === "FINISHED") return <Final snap={snap} net={net} />;

  return (
    <div className={"kb-game" + (myTurn ? " my-turn" : "")}>
      <header className="kb-top">
        <span className="kb-code">房间 {snap.code}</span>
        <span className="kb-deck" data-testid="kb-deck">库 {v.deck}{v.lastRound ? " · 最后一圈" : ""}</span>
        <Timer left={left} total={v.options.seconds} />
        <button className="kb-btn kb-icon" aria-label="菜单" onClick={() => setMenu(!menu)}>☰</button>
        {menu && (
          <div className="kb-menu" role="menu">
            <button className="kb-btn" onClick={() => { setSoundOn(!sound); setSound(!sound); }}>音效：{sound ? "开" : "关"}</button>
            <a className="kb-btn" href="/">退出到大厅</a>
          </div>
        )}
      </header>

      {myTurn ? (
        <div className="kb-banner turn">轮到你了</div>
      ) : (
        <div className="kb-banner">轮到 {v.turn + 1}号 {cur.name}{team ? `（${TEAM[cur.team]}队）` : ""}</div>
      )}

      <Pond pond={v.pond} sel={selValue} target={pv?.target ?? 0} onPick={pickSlot} fx={fx} />

      <div className="kb-side">
      <div className="kb-preview" data-testid="kb-preview" aria-live="polite">
        {pv
          ? pv.target
            ? `放下后 ${ANIMALS[selValue]} 共 ${pv.total} 只 → 赶走 ${ANIMALS[pv.target]} ×${pv.cards}，你拿 ${pv.cards} 张`
            : pv.total >= 3
              ? `${ANIMALS[selValue]} 共 ${pv.total} 只，但没有可赶的动物`
              : `${ANIMALS[selValue]} 将有 ${pv.total} 只，不会触发`
          : fx
            ? describe(fx.events, v.players)
            : myTurn
              ? "点手牌或水塘里的动物来选牌"
              : " "}
      </div>

      <ol className="kb-seats" data-testid="kb-seats">
        {v.players.map((p, i) => (
          <li key={i} className={(i === v.turn ? "cur " : "") + (i === seat ? "me " : "") + (team ? "t" + p.team : "")}>
            {team && <span className="kb-team">{TEAM[p.team]}</span>}
            <span className="kb-name">{p.name}</span>
            <span className="kb-score">🃏{p.score}{team ? ` · 队${p.teamScore}` : ""}</span>
            <span className="kb-hc">手 {p.handCount}</span>
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
              onClick={() => toggle(id)}
            >
              <b>{val}</b>
              <span>{ICON[val]}</span>
              <small>{ANIMALS[val]}</small>
            </button>
          );
        })}
      </div>

      <div className={"kb-dock" + (myTurn ? " glow" : "")}>
        {myTurn ? (
          <>
            <button className={"kb-btn kb-primary" + (shake ? " shake" : "")} data-testid="kb-play" disabled={!sel.length || busy} onClick={submit}>
              {busy ? "…" : sel.length ? `放 ${sel.length} 只${ANIMALS[selValue]}` : "先选牌"}
            </button>
            {sel.length > 0 && <button className="kb-btn" onClick={() => setSel([])}>取消</button>}
          </>
        ) : (
          <button className="kb-btn kb-primary" disabled>等待 {v.turn + 1}号 {cur.name}…</button>
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
  if (!play || play.type !== "PLAY") return " ";
  const who = players[play.seat].name;
  let s = `${to ? "⏱ 超时，" : ""}${who} 放了 ${play.count} 只${ANIMALS[play.value]}`;
  if (chase && chase.type === "CHASE")
    s += chase.by === 1 ? `，🐭 老鼠吓跑了 ${chase.cards} 头大象！` : `，赶走 ${ANIMALS[chase.target]} ×${chase.cards}`;
  if (ev.some((e) => e.type === "LAST_ROUND")) s += "。牌打完了，补完这一圈结束";
  return s;
}

function Timer({ left, total }: { left: number | null; total: number }) {
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
function Pond({ pond, sel, target, onPick, fx }: { pond: number[]; sel: number; target: number; onPick: (v: number) => void; fx: { key: number; events: KBEvent[] } | null }) {
  const chase = fx?.events.find((e) => e.type === "CHASE");
  const played = fx?.events.find((e) => e.type === "PLAY");
  return (
    <div className="kb-pond" data-testid="kb-pond">
      <div className="kb-water">
        <span>水塘</span>
        <small>🐭 赶 🐘</small>
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
        ].join(" ");
        return (
          <button
            key={fx?.key + "-" + val}
            className={cls}
            style={{ left: `${50 + 38 * Math.cos(ang)}%`, top: `${50 + 38 * Math.sin(ang)}%` }}
            data-testid={"kb-slot-" + val}
            aria-label={`${ANIMALS[val]}（${val}）${n} 张`}
            onClick={() => onPick(val)}
          >
            <span className="kb-ico">{ICON[val]}</span>
            <b>{n}</b>
            <small>{val} {ANIMALS[val]}</small>
            {chase && chase.type === "CHASE" && chase.target === val && (
              <span className="kb-flee" aria-hidden>
                {Array.from({ length: Math.min(chase.cards, 6) }, (_, i) => (
                  <i key={i} style={{ ["--i" as string]: i }}>{ICON[val]}</i>
                ))}
              </span>
            )}
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
  return (
    <div className="kb-panel kb-final" data-testid="kb-final">
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
