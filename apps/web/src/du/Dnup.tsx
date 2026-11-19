import { useEffect, useMemo, useRef, useState } from "react";
import "./dnup.css";
import { useDURoom } from "./du-net.ts";
import {
  valueOf,
  otherOf,
  addTargets,
  canPlayView,
  type HeldCard,
  type Group,
  type DUView,
  type LogEntry,
} from "../../../../packages/dnup/src/index.ts";

const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

/** 数字的颜色，参照原版每个数字一种颜色 */
export const NUM_COLOR: Record<number, string> = {
  1: "#c6d63b",
  2: "#e2397d",
  3: "#2bb3c0",
  4: "#f08a24",
  5: "#8e44ad",
  6: "#2f6fd6",
  7: "#f2c94c",
  8: "#1f9e6e",
  9: "#e5533d",
  10: "#5b5bd6",
};

export function DnupCard({
  card,
  size = "md",
  selected,
  dim,
  onClick,
  spin,
}: {
  card: HeldCard;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  spin?: boolean;
}) {
  const v = valueOf(card),
    o = otherOf(card);
  const CardElement = onClick ? "button" : "span";
  return (
    <CardElement
      {...(onClick ? { type: "button" as const } : {})}
      className={`du-card du-${size}${selected ? " sel" : ""}${dim ? " dim" : ""}${spin ? " spin" : ""}`}
      onClick={onClick}
      aria-label={`${v}（另一端 ${o}）`}
      data-testid={`du-card-${card.id}`}
    >
      <span className="du-face">
        <span className="du-corner" style={{ color: NUM_COLOR[v] }}>{v}</span>
        <span className="du-big" style={{ color: NUM_COLOR[v] }}>{v}</span>
        <span className="du-other" style={{ color: NUM_COLOR[o] }}>{o}</span>
        {card.id === 1 && <span className="du-star">★</span>}
      </span>
    </CardElement>
  );
}

function GroupView({ g, size = "sm", onClick, hot }: { g: Group; size?: "sm" | "md"; onClick?: () => void; hot?: boolean }) {
  return (
    <button type="button" className={`du-group${hot ? " hot" : ""}`} onClick={onClick} disabled={!onClick}>
      <span className="du-group-cards">
        {g.cards.map((c) => (
          <DnupCard key={c.id} card={c} size={size} />
        ))}
      </span>
      <span className="du-group-tag">
        {g.cards.length} 张 · {g.value}
      </span>
    </button>
  );
}

const RULES = (
  <div className="du-rules">
    <h3>目标</h3>
    <p>最先出完手牌。第 1 个出完得 2 个标记，第 2 个出完得 1 个，这一轮立即结束。最先累计到获胜分数的人赢（双人局：先赢 2 轮）。</p>
    <h3>牌</h3>
    <p>每张牌上下印着两个数字。<b>大的那个是现在有效的数字</b>，角落小的倒着的是另一端。牌一旦从桌上回到手里，都要转 180°，换成另一端的数字。</p>
    <h3>轮到你时</h3>
    <p>先自动收走你上回合留在面前的组合，然后四选一：</p>
    <ol>
      <li><b>出牌</b>：打出 1 张或多张数字相同的牌。如果桌上已经有同样张数的组合，你的数字必须<b>更大</b>（相等不行），被你压过的那组整组转向后回到主人手里。张数不同的组合互不影响。</li>
      <li><b>加牌</b>：往对手的组合里加 1 张同数字的牌，让它多一张。加完后如果桌上有同张数的组合，也必须更大，并把它压回去。</li>
      <li><b>拿牌</b>：把对手面前的一整组拿到自己手里（转向）。</li>
      <li><b>翻转</b>：把整手牌全部转 180°。</li>
    </ol>
    <h3>其他</h3>
    <p>手牌没有上限。拿到 ★1/5 的人先手。出完手牌的人留在桌上的组合，到他原本的下一回合才收走；如果被压过就直接弃掉。</p>
    <h3>双人局</h3>
    <p>每人有区域 1、区域 2 两个出牌区，每回合连做两次（先区域 1 再区域 2），星牌持有者第一回合只做区域 2。你也可以压回自己另一个区域的牌。</p>
    <h3>本站房规</h3>
    <p>6 人局使用官方 4 人牌组（36 张），每人 6 张。3–6 人局房主可以选 3 分或 4 分获胜。发牌时每张牌朝向随机。</p>
  </div>
);

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="du-sheet-bg" onClick={onClose}>
      <div className="du-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="du-sheet-head">
          <b>{title}</b>
          <button type="button" className="du-x" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function describe(e: LogEntry, names: string[]) {
  const n = names[e.seat] ?? "?";
  const t = e.target !== undefined ? names[e.target] : "";
  const bounce = e.bounced ? `，压掉${names[e.bounced.seat]}的 ${e.bounced.count} 张${e.bounced.discarded ? "（弃掉）" : "（回手）"}` : "";
  switch (e.type) {
    case "PLAY":
      return `${n} 出了 ${e.values!.length} 张 ${e.value}${bounce}`;
    case "ADD":
      return `${n} 给 ${t} 加了一张 ${e.value}${bounce}`;
    case "TAKE":
      return `${n} 拿走了 ${t} 的 ${e.values!.length} 张 ${e.value}`;
    case "ROTATE":
      return `${n} 把整手牌翻转了`;
    case "OUT":
      return `🎉 ${n} 第 ${e.place} 个出完，得 ${e.points} 分`;
    case "WIN_ROUND":
      return `🏆 ${n} 赢下这一轮`;
    default:
      return "";
  }
}

function Lobby({ room }: { room: ReturnType<typeof useDURoom> }) {
  const [name, setName] = useState(storage.get("du:name") ?? "");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("room") ?? "");
  const [rules, setRules] = useState(false);
  const s = room.snapshot;
  const save = (n: string) => {
    setName(n);
    storage.set("du:name", n);
  };
  if (!s || !s.mySeat) {
    return (
      <div className="du-lobby">
        <Logo />
        <p className="du-sub">2–6 人 · 爬梯出牌 · 每张牌两个数字，回手就反转</p>
        <label className="du-field">
          昵称
          <input value={name} maxLength={12} onChange={(e) => save(e.target.value)} placeholder="你的名字" data-testid="du-name" />
        </label>
        {s ? (
          <button className="du-btn main" disabled={room.pending} onClick={() => room.claim(name)} data-testid="du-claim">
            加入房间 {s.code}
          </button>
        ) : (
          <>
            <button className="du-btn main" disabled={room.pending} onClick={() => room.create(name)} data-testid="du-create">
              创建房间
            </button>
            <div className="du-join">
              <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="房间号" data-testid="du-code" />
              <button className="du-btn" disabled={room.pending || code.length !== 4} onClick={() => room.join(code, name)} data-testid="du-join">
                加入
              </button>
            </div>
          </>
        )}
        <button className="du-link" onClick={() => setRules(true)}>
          📖 规则说明
        </button>
        <a className="du-link" href="/">
          ← 返回游戏大厅
        </a>
        {room.error && <p className="du-err">{room.error}</p>}
        {rules && (
          <Sheet title="反转王牌 · 规则" onClose={() => setRules(false)}>
            {RULES}
          </Sheet>
        )}
      </div>
    );
  }
  const host = s.hostId === s.mySeat;
  const me = s.players.find((p) => p.id === s.mySeat)!;
  const full = s.players.length === s.count;
  const allReady = full && s.players.every((p) => p.ready);
  const link = location.origin + "/?game=du&room=" + s.code;
  return (
    <div className="du-lobby">
      <Logo />
      <div className="du-code">
        房间号 <b data-testid="du-room-code">{s.code}</b>
        <button
          className="du-btn sm"
          onClick={() => {
            navigator.clipboard?.writeText(link).catch(() => {});
          }}
        >
          复制邀请链接
        </button>
      </div>
      <div className="du-seats">
        {Array.from({ length: s.count }, (_, i) => {
          const p = s.players[i];
          return (
            <div key={i} className={`du-seat${p ? "" : " empty"}${p?.ready ? " ready" : ""}`}>
              <span className="du-seat-no">{i + 1}</span>
              <span>{p ? p.name : "等待加入…"}</span>
              {p && <span className="du-seat-state">{i === 0 ? "房主 · " : ""}{p.ready ? "已准备" : "未准备"}{p.connected ? "" : " · 离线"}</span>}
            </div>
          );
        })}
      </div>
      {host ? (
        <div className="du-settings">
          <div className="du-row">
            <span>人数</span>
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={`du-chip${s.count === n ? " on" : ""}`} disabled={n < s.players.length || room.pending} onClick={() => room.act({ type: "SET_SETTINGS", count: n })} data-testid={`du-count-${n}`}>
                {n}
              </button>
            ))}
          </div>
          {s.count > 2 && (
            <div className="du-row">
              <span>获胜</span>
              {([4, 3] as const).map((t) => (
                <button key={t} className={`du-chip${s.target === t ? " on" : ""}`} onClick={() => room.act({ type: "SET_SETTINGS", target: t })}>
                  {t} 分{t === 3 ? "（快速）" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="du-sub">
          {s.count} 人局 · {s.count === 2 ? "先赢 2 轮" : `先到 ${s.target} 分获胜`}
        </p>
      )}
      <p className="du-sub small">
        {s.count === 2 ? "双人：26 张牌，每人 13 张，每人两个出牌区" : `${s.count === 6 ? 36 : [0, 0, 26, 30, 36, 40][s.count]} 张牌，每人 ${[0, 0, 13, 10, 9, 8, 6][s.count]} 张`}
        {s.count === 6 && "（6 人为本站房规）"}
      </p>
      <button className={`du-btn ${me.ready ? "" : "main"}`} disabled={room.pending} onClick={() => room.act({ type: "READY" })} data-testid="du-ready">
        {me.ready ? "取消准备" : "准备"}
      </button>
      {host && (
        <button className="du-btn main" disabled={!allReady || room.pending} onClick={() => room.act({ type: "START" })} data-testid="du-start">
          {allReady ? "开始游戏" : full ? "等待所有人准备" : "等待玩家加入"}
        </button>
      )}
      <button className="du-link" onClick={() => setRules(true)}>
        📖 规则说明
      </button>
      <button className="du-link" onClick={() => room.act({ type: "LEAVE" })}>
        离开房间
      </button>
      {room.error && <p className="du-err">{room.error}</p>}
      {rules && (
        <Sheet title="反转王牌 · 规则" onClose={() => setRules(false)}>
          {RULES}
        </Sheet>
      )}
    </div>
  );
}

function Score({ score }: { score: number }) {
  return <span className="du-score" aria-label={`${score} 分`}>{score ? Array.from({ length: score }, (_, i) => <span className="du-token" key={i} aria-hidden="true">{"dnup"[i % 4]}</span>) : "·"}</span>;
}

function Logo() {
  return (
    <div className="du-logo">
      <img className="du-logo-image" src="/assets/dnup/logo.webp" alt="dnup 反转王牌" />
    </div>
  );
}

function Table({ room, v }: { room: ReturnType<typeof useDURoom>; v: DUView }) {
  const s = room.snapshot!;
  const [sel, setSel] = useState<number[]>([]);
  const [target, setTarget] = useState<{ seat: number; zone: number } | null>(null);
  const [rules, setRules] = useState(false);
  const [spin, setSpin] = useState(false);
  const [toast, setToast] = useState("");
  const names = v.players.map((p) => p.name);
  const myTurn = v.phase === "PLAY" && v.turn === v.me;
  const two = v.players.length === 2;
  const lastLog = useRef(v.log.length);
  const lastKey = v.log.length ? JSON.stringify(v.log[v.log.length - 1]) : "";

  // Decorative motion uses only the public action log; it never changes game state.
  const previousLog = useRef(v.log.map((entry) => JSON.stringify(entry)));
  useEffect(() => {
    const current = v.log.map((entry) => JSON.stringify(entry));
    const previous = previousLog.current;
    let overlap = Math.min(previous.length, current.length);
    while (overlap > 0 && previous.slice(-overlap).some((item, i) => item !== current[i])) overlap--;
    const added = v.log.slice(overlap);
    previousLog.current = current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const action = added.find((entry) => entry.type === "TAKE" || entry.bounced);
    if (!action) return;
    const sourceSeat = action.type === "TAKE" ? action.target : action.bounced?.seat;
    const destinationSeat = action.type === "TAKE" ? action.seat : action.bounced?.seat;
    if (sourceSeat === undefined || destinationSeat === undefined || action.bounced?.discarded) return;
    const seatNode = (seat: number) => document.querySelector<HTMLElement>(`[data-du-seat="${seat}"]`);
    const source = seatNode(sourceSeat)?.querySelector<HTMLElement>(".du-zones")?.getBoundingClientRect();
    const destination = destinationSeat === v.me
      ? document.querySelector<HTMLElement>(".du-hand")?.getBoundingClientRect()
      : seatNode(destinationSeat)?.querySelector<HTMLElement>(".du-opp-head")?.getBoundingClientRect();
    if (!source || !destination) return;
    const piece = document.createElement("span");
    piece.className = "du-flying-card";
    piece.setAttribute("aria-hidden", "true");
    piece.textContent = action.value ? String(action.value) : "";
    piece.style.left = `${source.left + source.width / 2}px`;
    piece.style.top = `${source.top + source.height / 2}px`;
    document.body.appendChild(piece);
    const dx = destination.left + destination.width / 2 - source.left - source.width / 2;
    const dy = destination.top + destination.height / 2 - source.top - source.height / 2;
    const animation = piece.animate([
      { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(180deg) scale(.65)`, opacity: .4 },
    ], { duration: 600, easing: "cubic-bezier(.22,.7,.3,1)" });
    animation.onfinish = () => piece.remove();
    return () => { animation.cancel(); piece.remove(); };
  }, [lastKey]);

  // 新动作提示
  useEffect(() => {
    const e = v.log[v.log.length - 1];
    if (!e) return;
    setToast(describe(e, names));
    if (e.type === "ROTATE" && e.seat === v.me) {
      setSpin(true);
      setTimeout(() => setSpin(false), 750);
    }
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [lastKey]);
  useEffect(() => {
    lastLog.current = v.log.length;
    setSel([]);
    setTarget(null);
  }, [v.turn, v.zone, v.round, v.hand.length]);

  useEffect(() => {
    if (myTurn && typeof navigator.vibrate === "function") navigator.vibrate(20);
  }, [myTurn]);

  // 手牌按数字排序
  const hand = useMemo(() => [...v.hand].sort((a, b) => valueOf(a) - valueOf(b) || a.id - b.id), [v.hand]);
  const selCards = hand.filter((c) => sel.includes(c.id));
  const selValue = selCards.length ? valueOf(selCards[0]) : null;
  const playOk = myTurn && selCards.length > 0 && canPlayView(v, selCards.length, selValue!);
  const toggle = (c: HeldCard) => {
    if (!myTurn) return;
    const val = valueOf(c);
    setSel((cur) => (cur.includes(c.id) ? cur.filter((x) => x !== c.id) : selValue !== null && selValue !== val ? [c.id] : [...cur, c.id]));
  };
  // 场上每种张数当前最大的数字
  const ladder = useMemo(() => {
    const m = new Map<number, { value: number; seat: number }>();
    v.players.forEach((p, seat) => p.zones.forEach((g) => g && m.set(g.cards.length, { value: g.value, seat })));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [v.players]);

  const order = v.players.map((_, i) => (v.me + i) % v.players.length).slice(1);
  const tg = target ? v.players[target.seat].zones[target.zone] : null;
  const addable = tg ? hand.filter((c) => addTargets(v, v.me, c).some((t) => t.seat === target!.seat && t.zone === target!.zone)) : [];
  const zoneName = (z: number) => (two ? `区域${z + 1}` : "");

  const [confirmRotate, setConfirmRotate] = useState(false);
  const [flash, setFlash] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  useEffect(() => {
    if (!myTurn) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1100);
    return () => clearTimeout(t);
  }, [myTurn, v.zone]);
  useEffect(() => {
    if (!confirmRotate) return;
    const t = setTimeout(() => setConfirmRotate(false), 3000);
    return () => clearTimeout(t);
  }, [confirmRotate]);
  useEffect(() => setConfirmRotate(false), [v.turn, v.zone]);
  // 出不了时说明原因
  const blocker = selCards.length && !playOk && myTurn
    ? ladder.find(([size]) => size === selCards.length)
    : undefined;
  const many = order.length >= 3;
  const lastEntry = v.log[v.log.length - 1];
  const tap = () => typeof navigator.vibrate === "function" && navigator.vibrate(8);

  return (
    <div className={`du-table${many ? " many" : ""}`} data-testid="du-table">
      <header className="du-top">
        <span className="du-mini-logo">dnup</span>
        <span className="du-top-info">
          第 {v.round} 轮 · {two ? "先赢 2 轮" : `${v.target} 分获胜`}
        </span>
        <span className="du-top-right">
          <span className="du-discard" title="弃牌堆">弃 {v.discard}</span>
          <button className="du-btn sm" onClick={() => setLogOpen(true)}>记录</button>
          <button className="du-btn sm" onClick={() => setRules(true)}>规则</button>
        </span>
      </header>

      <section className="du-opps">
        {order.map((seat) => {
          const p = v.players[seat];
          const active = v.turn === seat && v.phase === "PLAY";
          return (
            <div key={seat} className={`du-opp${active ? " turn" : ""}${p.place ? " out" : ""}`} data-testid={`du-opp-${seat}`} data-du-seat={seat}>
              <div className="du-opp-head">
                <b>{p.name}</b>
                <Score score={p.score} />
              </div>
              <div className="du-opp-meta">
                {p.place ? <span className={`du-place place-${p.place}`}>第{p.place}名 ✓</span> : <span className="du-count">手牌 {p.handCount}</span>}
                {active && <span className="du-thinking">行动中{two ? ` · ${zoneName(v.zone)}` : ""}</span>}
              </div>
              <div className="du-zones">
                {p.zones.map((g, z) =>
                  g ? (
                    <GroupView key={z} g={g} hot={myTurn} onClick={myTurn ? () => { tap(); setTarget({ seat, zone: z }); } : undefined} />
                  ) : two ? (
                    <span key={z} className="du-empty">{zoneName(z)}</span>
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="du-info">
        <div className={`du-feed${room.error ? " err" : ""}`} onClick={() => room.error && room.setError("")} data-testid="du-feed">
          {room.error ? `⚠ ${room.error}` : toast || (lastEntry ? describe(lastEntry, names) : "拿到 ★1/5 的人先出牌")}
        </div>
        <div className="du-ladder">
          <span className="du-ladder-title">场上</span>
          {ladder.length === 0 ? (
            <span className="du-ladder-empty">空桌，出什么都行</span>
          ) : (
            ladder.map(([size, x]) => (
              <span key={size} className="du-ladder-item" style={{ borderColor: NUM_COLOR[x.value] }}>
                {size}张 <b style={{ color: NUM_COLOR[x.value] }}>{x.value}</b>
                <small>{x.seat === v.me ? "我" : names[x.seat]}</small>
              </span>
            ))
          )}
        </div>
      </section>

      <section className={`du-mine${myTurn ? " turn" : ""}`} data-du-seat={v.me}>
        <div className="du-mine-head">
          <b>我</b>
          {v.players[v.me].place && <span className={`du-place place-${v.players[v.me].place}`}>第{v.players[v.me].place}名 ✓</span>}
          <Score score={v.players[v.me].score} />
          <span className="du-status" data-testid="du-status">
            {v.phase !== "PLAY" ? "本轮结束" : myTurn ? `轮到你了${two ? ` · ${zoneName(v.zone)}` : ""}` : `等待 ${names[v.turn]}…`}
          </span>
        </div>
        <div className="du-zones mine">
          {v.players[v.me].zones.map((g, z) =>
            g ? (
              <GroupView key={z} g={g} size="sm" />
            ) : (
              <span key={z} className={`du-empty${myTurn && v.zone === z ? " now" : ""}`}>{two ? zoneName(z) : "我的出牌区（空）"}</span>
            ),
          )}
          {!two && v.players[v.me].zones[0] && myTurn === false && <span className="du-mine-note">下回合开始时收走</span>}
        </div>
      </section>

      <section className={`du-hand${hand.length > 10 ? " dense" : ""}`} data-testid="du-hand">
        {hand.length === 0 && <span className="du-ladder-empty">手牌已出完</span>}
        {hand.map((c) => (
          <DnupCard
            key={c.id}
            card={c}
            size="lg"
            selected={sel.includes(c.id)}
            dim={myTurn && selValue !== null && valueOf(c) !== selValue}
            onClick={() => {
              if (!myTurn) {
                setToast(v.phase === "PLAY" ? `还没轮到你，现在是 ${names[v.turn]}` : "本轮已结束");
                return;
              }
              tap();
              toggle(c);
            }}
            spin={spin}
          />
        ))}
      </section>

      <footer className="du-dock">
        {myTurn ? (
          <>
            <div className="du-dock-hint">
              {blocker
                ? `桌上已有 ${blocker[0]} 张 ${blocker[1].value}，要出比 ${blocker[1].value} 大的`
                : selCards.length
                  ? "再点同数字的牌可以一起出"
                  : ladder.length
                    ? "选牌出牌，或点对手的牌组「拿走 / 加一张」"
                    : "选一张或几张相同数字的牌"}
            </div>
            <div className="du-dock-row">
              <button className="du-btn main grow" disabled={!playOk || room.pending} onClick={() => room.act({ type: "PLAY", cards: sel })} data-testid="du-play">
                {selCards.length === 0 ? "选择要出的牌" : playOk ? `出 ${selCards.length} 张 ${selValue}` : "不够大，出不了"}
              </button>
              <button
                className={`du-btn rotate${confirmRotate ? " confirm" : ""}`}
                disabled={room.pending}
                onClick={() => {
                  tap();
                  if (!confirmRotate) return setConfirmRotate(true);
                  setConfirmRotate(false);
                  room.act({ type: "ROTATE" });
                }}
                data-testid="du-rotate"
              >
                {confirmRotate ? "再点确认翻转" : "⟳ 翻转整手"}
              </button>
            </div>
          </>
        ) : (
          <span className="du-dock-wait">{v.phase === "PLAY" ? `${names[v.turn]} 正在行动${two ? ` · ${zoneName(v.zone)}` : ""}` : ""}</span>
        )}
      </footer>

      {flash && <div className="du-flash" aria-hidden="true">轮到你了</div>}

      {tg && target && (
        <Sheet title={`${names[target.seat]}${two ? " · " + zoneName(target.zone) : ""}：${tg.cards.length} 张 ${tg.value}`} onClose={() => setTarget(null)}>
          <div className="du-sheet-group">
            <GroupView g={tg} size="md" />
          </div>
          <p className="du-sub small">拿走后这些牌会反转成：{tg.cards.map((c) => otherOf(c)).join("、")}</p>
          <button
            className="du-btn main wide"
            onClick={() => {
              room.act({ type: "TAKE", target: target.seat, zone: target.zone });
              setTarget(null);
            }}
            data-testid="du-take"
          >
            拿走整组（{tg.cards.length} 张）
          </button>
          <div className="du-sheet-sep">或者 · 加一张 {tg.value}，让它变成 {tg.cards.length + 1} 张</div>
          <div className="du-addrow">
            {addable.length === 0 && <span className="du-ladder-empty">你没有能加的牌（需要数字 {tg.value}，且加完后要比同张数的组合大）</span>}
            {addable.map((c) => (
              <DnupCard
                key={c.id}
                card={c}
                size="lg"
                onClick={() => {
                  room.act({ type: "ADD", card: c.id, target: target.seat, zone: target.zone });
                  setTarget(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}

      {v.phase !== "PLAY" && <RoundEnd room={room} v={v} />}
      {rules && (
        <Sheet title="反转王牌 · 规则" onClose={() => setRules(false)}>
          {RULES}
        </Sheet>
      )}
      {logOpen && (
        <Sheet title="对局记录" onClose={() => setLogOpen(false)}>
          <div className="du-log">
            {v.log.length === 0 && <span className="du-ladder-empty">还没有记录</span>}
            {[...v.log].reverse().map((e, i) => (
              <div key={i}>{describe(e, names)}</div>
            ))}
          </div>
        </Sheet>
      )}
      <span hidden>{s.code}</span>
    </div>
  );
}

function RoundEnd({ room, v }: { room: ReturnType<typeof useDURoom>; v: DUView }) {
  const s = room.snapshot!;
  const host = s.hostId === s.mySeat;
  const done = v.phase === "FINISHED";
  const names = v.players.map((p) => p.name);
  const rank = v.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
  return (
    <div className="du-over" data-testid={done ? "du-finished" : "du-round-end"}>
      <div className={`du-over-card${done ? " final" : ""}`}>
        {done && <div className="du-confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i}>{(i % 9) + 1}</i>)}</div>}
        {done ? (
          <>
            <div className="du-crown">👑</div>
            <h2>{names[v.winner!]} 获胜！</h2>
          </>
        ) : (
          <h2>第 {v.round} 轮结束</h2>
        )}
        <div className="du-result">
          {v.roundResult.map((r) => (
            <div key={r.seat}>
              {names[r.seat]} <b>+{r.points}</b>
            </div>
          ))}
        </div>
        <div className="du-standings">
          {rank.map((p) => (
            <div key={p.i} className={p.i === v.winner ? "win" : ""}>
              <span>{p.name}</span>
              <Score score={p.score} />
              <b>{p.score}</b>
            </div>
          ))}
        </div>
        {host ? (
          done ? (
            <button className="du-btn main wide" onClick={() => room.act({ type: "REMATCH" })} data-testid="du-rematch">
              再来一局
            </button>
          ) : (
            <button className="du-btn main wide" onClick={() => room.act({ type: "NEXT_ROUND" })} data-testid="du-next">
              下一轮
            </button>
          )
        ) : (
          <p className="du-sub">等待房主{done ? "开新局" : "开始下一轮"}…</p>
        )}
        {done && (
          <a className="du-link" href="/">
            返回游戏大厅
          </a>
        )}
      </div>
    </div>
  );
}

export function Dnup() {
  const room = useDURoom();
  const v = room.snapshot?.view;
  useEffect(() => {
    document.title = "反转王牌 · 桌游";
  }, []);
  return (
    <div className="du-root">
      {!room.online && <div className="du-offline">连接中…</div>}
      {v ? <Table room={room} v={v} /> : <Lobby room={room} />}
    </div>
  );
}
