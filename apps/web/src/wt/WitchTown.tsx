import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { io, type Socket } from "socket.io-client";
import { feel, soundOn, setSoundOn } from "../drawing/feel.ts";
import { Candle, Portrait, RoomArt, Sigil } from "./Art.tsx";
import "./world.css";
import "./live.css";
import { CARDS as CARD_DATA, CHARACTERS } from "../../../../packages/witch-town/src/data.ts";
import { WT_EVENTS, type WTRoomSnapshot } from "../../../../packages/shared/src/wt-protocol.ts";

/* ------------------------------------------------------------------ data */
type AnyView = any; // WTView pending/choice unions are wide; every field is read defensively.
type Card = { id: string; kind: string; asWitness?: true };
const cardInfo = (kind: string, asWitness?: boolean) => {
  const c = CARD_DATA.find(x => x.key === kind);
  const color = asWitness ? "red" : (c?.color ?? "green");
  const mark = asWitness || kind === "witness" ? "+7" : kind === "evidence" ? "+3" : kind === "accusation" ? "+1"
    : color === "blue" ? "持续" : color === "black" ? "事件" : "行动";
  return { name: asWitness ? "目击（辩护）" : c?.nameZh ?? kind, color, text: c?.effectZh ?? "", mark, policy: (c as any)?.targetPolicy as string | undefined };
};
const charInfo = (key: string) => CHARACTERS.find(c => c.key === key);
const charName = (key: string) => charInfo(key)?.nameZh ?? key;
const tryalName = (k: string) => (k === "witch" ? "女巫" : k === "constable" ? "警长" : "平民");

/* -------------------------------------------------------------- pieces */
function CardFace({ card, selected, onClick, compact = false, disabled }: { card: Card; selected?: boolean; onClick?: () => void; compact?: boolean; disabled?: boolean }) {
  const c = cardInfo(card.kind, card.asWitness), Tag = onClick ? "button" : "span";
  return <Tag className={`wt-card wt-${c.color} ${compact ? "wt-card-small" : ""}`} aria-label={`${c.name}，${c.text}`} aria-pressed={!!selected} onClick={onClick} disabled={disabled} data-kind={card.kind} data-testid={`wt-card-${card.kind}`}>
    <span className="wt-card-rim"><span className="wt-card-top">{c.mark}<i>1692</i></span><span className="wt-card-art"><Sigil kind={card.kind === "black_cat" ? "cat" : card.kind}/></span><strong>{c.name}</strong><span className="wt-card-caption">{c.color === "red" ? "指控牌" : c.color === "blue" ? "持续效果" : c.color === "black" ? "黑色事件" : "行动牌"}</span></span>
  </Tag>;
}
function Tryal({ kind, revealed, onClick, selected, number, testid }: { kind?: string; revealed?: boolean; onClick?: () => void; selected?: boolean; number: number; testid?: string }) {
  const Tag = onClick ? "button" : "span";
  return <Tag data-testid={testid} aria-label={revealed ? `审判牌：${tryalName(kind ?? "")}` : `背面审判牌${number}`} aria-pressed={!!selected} className={`wt-tryal ${revealed ? "is-revealed" : ""} ${kind === "witch" && revealed ? "is-witch" : ""}`} onClick={onClick}>
    <span className="wt-tryal-inner"><span className="wt-tryal-back"><i className="wt-wax-seal"><Sigil/></i><small>{number}</small></span><span className="wt-tryal-front">{revealed && kind && <><Sigil kind={kind}/><strong>{tryalName(kind)}</strong></>}</span></span>
  </Tag>;
}
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [active]);
  return now;
}
function Ring({ deadline, total }: { deadline: number; total: number }) {
  const left = Math.max(0, Math.ceil((deadline - useNow(true)) / 1000));
  const last = useRef(left);
  useEffect(() => { if (left !== last.current && left <= 10 && left > 0) feel("tick"); last.current = left; }, [left]);
  return <div className={`wt-timer ${left <= 10 ? "is-urgent" : ""}`} aria-label={`剩余${left}秒`} data-testid="wt-timer"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><circle cx="32" cy="32" r="28" className="wt-ring-fill" strokeDasharray={176} strokeDashoffset={176 * (1 - Math.min(1, left / total))}/></svg><b>{left}</b><small>秒</small></div>;
}

/* --------------------------------------------------------- seat layout */
function useSeatLayout(count: number, el: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 360, h: 340 });
  useEffect(() => {
    const node = el.current; if (!node) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(node); return () => ro.disconnect();
  }, [el, count]);
  return useMemo(() => {
    const dense = count >= 9;
    const big = size.w > 600 && size.h > 500;
    let seatW = Math.round(Math.min(dense ? (big ? 120 : 96) : (big ? 142 : 116), Math.max(dense ? 66 : 84, size.w * (dense ? .2 : .25))));
    // Keep room for all three content rows. Fitting the perimeter may reduce width,
    // but must never compress the rows or hide their contents.
    const seatH = dense ? (big ? 64 : 56) : (big ? 88 : 76);
    // Seats spread at equal arc length on a superellipse (round → rounded rectangle);
    // if nothing fits, seats shrink a little and we try again. No per-count tables.
    const place = (e: number, w: number, h: number) => {
      const rx = Math.max(0, size.w / 2 - w / 2 - 10), ry = Math.max(0, size.h / 2 - h / 2 - 12);
      const pt = (t: number) => ({ x: Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), e) * rx, y: Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), e) * ry });
      const S = 1600, pts = Array.from({ length: S + 1 }, (_, i) => pt(Math.PI / 2 + i * Math.PI * 2 / S)), len = [0];
      for (let i = 1; i <= S; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const total = len[S], out: { x: number; y: number }[] = [];
      for (let k = 0, j = 0; k < count; k++) { const want = total * k / count; while (j < S && len[j] < want) j++; out.push(pts[j]); }
      const ok = out.every((p, i) => out.every((q, j) => i === j || Math.abs(p.x - q.x) >= w + 3 || Math.abs(p.y - q.y) >= h + 6));
      return { out, ok, rx, ry };
    };
    let best = place(1, seatW, seatH);
    search: for (let shrink = 0; shrink < 6; shrink++) {
      for (const e of [1, .7, .5, .35, .22]) { const r = place(e, seatW, seatH); if (r.ok) { best = r; break search; } best = r; }
      if (shrink < 5) seatW = Math.max(dense ? 52 : 88, Math.round(seatW * .93));
    }
    return { seatW, seatH, dense, pos: best.out.map(p => ({ left: 50 + p.x / size.w * 100, top: 50 + p.y / size.h * 100, a: Math.atan2(p.y, p.x) })) };
  }, [size, count]);
}

/* -------------------------------------------------------- storage/id */
const rid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
function secret() { const b = new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
type Saved = { name: string; claimKey: string; token?: string; playerId?: string };
const loadSeat = (code: string): Saved | null => { try { return JSON.parse(localStorage.getItem(`wt-seat-${code}`) ?? "null"); } catch { return null; } };
const saveSeat = (code: string, s: Saved) => { try { localStorage.setItem(`wt-seat-${code}`, JSON.stringify(s)); } catch { /* private mode */ } };
const ERR: Record<string, string> = {
  ROOM_FULL: "房间已满", ALREADY_STARTED: "游戏已开始，只能观战", NOT_READY: "还有人没准备", NEED_FOUR_PLAYERS: "至少需要4人", HOST_ONLY: "只有房主可以开始",
  NOT_YOUR_TURN: "还没轮到你", DRAW_AFTER_PLAY: "出过牌后不能再抽牌", MUST_DRAW_OR_PLAY: "请先抽2张或至少出1张牌", ALIBI_LIMIT: "辩护最多移除3点指控",
  BAD_ALIBI_SELECTION: "请选择要移除的红牌", SELECT_ONE_BLUE_CARD: "请选择一张蓝牌", ALREADY_MATCHED: "对方已有情侣牌", NEED_THREE_LIVING_PLAYERS: "存活玩家不足3人，不能使用此牌",
  DISTINCT_TARGETS_REQUIRED: "两个对象必须不同", TURN_DEADLINE_PASSED: "沙漏已到时", HOURGLASS_ALREADY_RUNNING: "沙漏已经在计时", PLAYER_DEAD: "该玩家已淘汰",
  ABILITY_EXHAUSTED: "能力次数已用完", BAD_NAME: "昵称需1–24字", CLAIM_KEY_REUSED: "此设备已用其他昵称入座", NO_ROOM: "房间不存在或已关闭", ROOM_NOT_FOUND: "房间不存在或已关闭",
};
const errText = (e: string) => ERR[e] ?? `操作未完成（${e}）`;

/* ------------------------------------------------------- log wording */
function describe(e: any, nameOf: (id?: string) => string) {
  const a = nameOf(e.actorId), t = nameOf(e.targetId);
  switch (e.type) {
    case "DAWN_COMPLETE": return `黎明：黑猫来到${t}面前，由${t}先行动`;
    case "DRAW": return `${a}抽了1张牌`;
    case "PLAY": return `${a}对${t}使用了「${cardInfo(e.cardKind).name}」`;
    case "BLACK_EVENT": return `${a}抽到黑牌「${cardInfo(e.cardKind).name}」`;
    case "TRYAL_REVEALED": return `${t}的审判牌被揭开：${tryalName(e.tryalKind)}`;
    case "ELIMINATED": return `${t}被淘汰`;
    case "CONSPIRACY_RESOLVED": return "阴谋结束：审判牌已传递";
    case "NIGHT_TARGET_REVEALED": return `女巫昨夜的目标是${t}`;
    case "NIGHT_SAVED": return `${t}昨夜幸存`;
    case "NIGHT_COMPLETE": return "天亮了";
    case "CONFESSED": case "CONFESS": case "CONFESSION_REVEAL": return `${a || t}进行了自白`;
    case "HOURGLASS_STARTED": return `${a}翻转了沙漏（30秒）`;
    case "HOURGLASS_EXPIRED": return "沙漏流尽，回合强制结束";
    case "END_TURN": return `${a}结束回合`;
    case "TURN_SKIPPED": return `${t || a}被拘留，跳过回合`;
    case "PARRIS_DRAW": return `${a}（牧师）从弃牌堆取回${e.count}张`;
    case "TITUBA_START": return `${a}（说书人）开始重排牌堆`;
    case "TITUBA_COMPLETE": return "说书人完成排序";
    case "LOOT_PICK": return `${a}继承了1张牌`;
    case "ABILITY_DECISION": return `${a}使用了人物能力`;
    case "WITCH_EXEMPTION_LOST": return `${t}失去了最后的隐藏女巫牌`;
    case "GAME_OVER": return "游戏结束";
    case "DRAW_DECK_EXHAUSTED": return "牌堆已抽空";
    default: return null;
  }
}

/* ================================================================ app */
export function WitchTown() {
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState(() => (params.get("room") ?? "").toUpperCase());
  const [snap, setSnap] = useState<WTRoomSnapshot | null>(null);
  const snapRef = useRef<WTRoomSnapshot | null>(null);
  const [conn, setConn] = useState<"connecting" | "online" | "offline">("connecting");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const socket = useMemo<Socket>(() => io({ autoConnect: false, transports: ["websocket", "polling"] }), []);
  const [name, setName] = useState(() => { try { return localStorage.getItem("wt-name") ?? ""; } catch { return ""; } });

  const accept = useCallback((s: WTRoomSnapshot) => { if (snapRef.current && s.code === snapRef.current.code && s.version < snapRef.current.version) return; snapRef.current = s; setSnap(s); }, []);
  const call = useCallback(<T,>(event: string, payload: unknown) => new Promise<T>((res, rej) => {
    if (!socket.connected) { rej(new Error("OFFLINE")); return; }
    socket.timeout(8000).emit(event, payload, (err: unknown, r: any) => err ? rej(new Error("TIMEOUT")) : r?.ok ? res(r.data) : rej(new Error(r?.error ?? "WT_ERROR")));
  }), [socket]);
  const say = (t: string) => { setToast(t); };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2800); return () => clearTimeout(t); }, [toast]);

  const rejoin = useCallback(async () => {
    if (!code) return;
    const saved = loadSeat(code);
    try {
      if (saved?.token) accept(await call<WTRoomSnapshot>(WT_EVENTS.join, { code, token: saved.token }));
      else if (saved?.claimKey && saved.name) { // first claim's ACK may have been lost: replay identical claim
        const r = await call<any>(WT_EVENTS.claim, { code, name: saved.name, claimKey: saved.claimKey });
        saveSeat(code, { ...saved, token: r.token, playerId: r.playerId }); accept(r.snapshot);
      } else accept(await call<WTRoomSnapshot>(WT_EVENTS.join, { code, token: null }));
    } catch (e) { say(errText((e as Error).message)); }
  }, [code, call, accept]);

  useEffect(() => {
    socket.on("connect", () => { setConn("online"); void rejoin(); });
    socket.on("disconnect", () => setConn("offline"));
    socket.on(WT_EVENTS.update, (s: WTRoomSnapshot) => accept(s));
    socket.connect();
    const back = () => { if (document.visibilityState === "visible" && !socket.connected) socket.connect(); };
    document.addEventListener("visibilitychange", back);
    return () => { socket.removeAllListeners(); socket.disconnect(); document.removeEventListener("visibilitychange", back); };
  }, [socket, rejoin, accept]);

  async function act(action: any) {
    if (busy) return false;
    setBusy(true);
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const s = snapRef.current; if (!s) throw new Error("OFFLINE");
        try { accept(await call<WTRoomSnapshot>(WT_EVENTS.action, { code: s.code, request: { requestId: rid(), version: s.version, action } })); return true; }
        catch (e) {
          if ((e as Error).message !== "STALE_VERSION") throw e;
          await new Promise(r => setTimeout(r, 120 + Math.random() * 200));
          try { accept(await call<WTRoomSnapshot>(WT_EVENTS.join, { code: s.code, token: loadSeat(s.code)?.token ?? null })); } catch { /* next loop */ }
        }
      }
      throw new Error("STALE_VERSION");
    } catch (e) { feel("lose"); say(errText((e as Error).message)); return false; }
    finally { setBusy(false); }
  }

  async function create(capacity: number) {
    if (!name.trim()) { say("请先填写昵称"); return; }
    try {
      const r = await call<{ code: string }>(WT_EVENTS.create, { capacity });
      await claim(r.code);
    } catch (e) { say(errText((e as Error).message)); }
  }
  async function claim(target: string) {
    if (!name.trim()) { say("请先填写昵称"); return; }
    try { localStorage.setItem("wt-name", name.trim()); } catch { /* ignore */ }
    const c = target.toUpperCase();
    const saved: Saved = loadSeat(c)?.name === name.trim() ? loadSeat(c)! : { name: name.trim(), claimKey: secret() };
    saveSeat(c, saved); // persist secret BEFORE sending, so a lost ACK can be replayed
    try {
      const r = await call<any>(WT_EVENTS.claim, { code: c, name: saved.name, claimKey: saved.claimKey });
      saveSeat(c, { ...saved, token: r.token, playerId: r.playerId });
      history.replaceState(null, "", `/?game=wt&room=${c}`);
      setCode(c); accept(r.snapshot); feel("submit");
    } catch (e) { say(errText((e as Error).message)); }
  }

  if (!snap || !code) return <Entrance name={name} setName={setName} code={code} setCode={setCode} create={create} claim={claim} conn={conn} toast={toast} snap={snap}/>;
  return <Table snap={snap} act={act} busy={busy} conn={conn} toast={toast} say={say} name={name} setName={setName} claim={claim}/>;
}

/* ---------------------------------------------------------- entrance */
function Entrance({ name, setName, code, setCode, create, claim, conn, toast }: any) {
  const [cap, setCap] = useState(6), [joinCode, setJoinCode] = useState(code);
  return <main className="wt-world wt-entrance" data-testid="wt-world">
    <RoomArt/>
    <header className="wt-top"><a href="/" aria-label="返回桌游合集">‹</a><div className="wt-brand"><strong>女巫镇</strong><span>SALEM 1692</span></div></header>
    <div className="wt-entry-stage">
      <div className="wt-entry-crest"><Candle/><h1>女巫镇</h1><p>1692 年，塞勒姆。<br/>找出隐藏在镇民中的女巫。</p></div>
      <section className="wt-entry-card">
        <label>你的昵称<input data-testid="wt-name" value={name} maxLength={12} placeholder="例如：阿宁" onChange={e => setName(e.target.value)}/></label>
        {code ? <><p className="wt-entry-note">房间 <b>{code}</b></p><button className="wt-primary" data-testid="wt-claim" disabled={conn !== "online"} onClick={() => claim(code)}>{conn === "online" ? "入座" : "正在连接服务器…"}</button></> : <>
          <div className="wt-seg" role="radiogroup" aria-label="房间人数">{Array.from({ length: 9 }, (_, i) => i + 4).map(n => <button key={n} role="radio" aria-pressed={cap === n} onClick={() => setCap(n)}>{n}</button>)}</div>
          <button className="wt-primary" data-testid="wt-create" disabled={conn !== "online"} onClick={() => create(cap)}>{conn === "online" ? `创建 ${cap} 人房间` : "正在连接服务器…"}</button>
          <div className="wt-entry-join"><input data-testid="wt-code" value={joinCode} maxLength={8} placeholder="房间号" onChange={e => setJoinCode(e.target.value.toUpperCase())}/><button data-testid="wt-join" disabled={joinCode.length < 8 || conn !== "online"} onClick={() => { setCode(joinCode); claim(joinCode); }}>{conn === "online" ? "加入" : "正在连接服务器…"}</button></div>
        </>}
        <p className="wt-entry-status">{conn === "online" ? "已连接服务器" : conn === "offline" ? "连接中断，正在重连…" : "正在连接…"}</p>
      </section>
    </div>
    {toast && <div className="wt-toast" role="status">{toast}</div>}
  </main>;
}

/* ============================================================== table */
type Sel = { card: Card; witness?: boolean; step: "target" | "recipient" | "alibi" | "curse"; targetId?: string; recipientId?: string; removeIds: string[]; blueId?: string };

function Table({ snap, act, busy, conn, toast, say, name, setName, claim }: any) {
  const v: AnyView | null = snap.view;
  const me: string | null = snap.mySeat;
  const priv = v?.private ?? null;
  const players: any[] = v?.players ?? snap.players.map((p: any) => ({ id: p.id, name: p.name, alive: true, character: "", hiddenTryalCount: 0, revealedTryals: [], handCount: 0, table: [], accusations: 0 }));
  const count = Math.max(players.length, snap.stage === "lobby" ? snap.capacity : 0);
  const myIdx = Math.max(0, players.findIndex(p => p.id === me));
  const nameOf = useCallback((id?: string) => { if (!id) return ""; const i = players.findIndex(p => p.id === id); return i < 0 ? "" : `${i + 1}号${players[i].name}`; }, [players]);
  const tableRef = useRef<HTMLElement>(null);
  const layout = useSeatLayout(count, tableRef);
  const [sel, setSel] = useState<Sel | null>(null);
  const [sheet, setSheet] = useState<null | { kind: "seat"; id: string } | { kind: "card"; card: Card } | { kind: "identity" } | { kind: "records" } | { kind: "menu" } | { kind: "parris" }>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [peek, setPeek] = useState(false);
  const [peekIdx, setPeekIdx] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; tone?: string } | null>(null);
  const queue = useRef<{ id: number; text: string; tone?: string; at: number }[]>([]), bid = useRef(0);
  const [hits, setHits] = useState<Record<string, number>>({});
  const [fly, setFly] = useState<{ id: number; kind: string; from: { x: number; y: number }; to: { x: number; y: number } }[]>([]);
  const [reveal, setReveal] = useState<{ id: number; who: string; kind: string; reason: string } | null>(null);
  const [blackCard, setBlackCard] = useState<{ id: number; kind: string; who: string } | null>(null);
  const fxId = useRef(0);
  const seatCenter = (id?: string) => { const el = id ? document.querySelector(`[data-player="${id}"]`) as HTMLElement | null : null; const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight * .8 }; };
  const [muted, setMuted] = useState(!soundOn());
  const [parrisPick, setParrisPick] = useState<string[]>([]);
  const [order, setOrder] = useState<Card[] | null>(null);
  const [nightSel, setNightSel] = useState<string | null>(null);

  const phase: string = v?.phase ?? "lobby";
  const pending = v?.pending ?? null;
  const choice = priv?.choice ?? null;
  const loot = choice?.kind === "loot" ? choice : priv?.lootChoices?.[0] ?? null;
  const meP = players.find(p => p.id === me);
  const alive = !!meP?.alive && snap.stage === "game";
  const isNight = pending?.kind === "black-event" && pending.cardKind === "night" || phase === "dawn";
  const myTurn = phase === "day" && !pending && v?.turnPlayerId === me && alive;
  const dayDeadline: number | undefined = phase === "day" && !pending ? v?.day?.deadline : undefined;

  const nextBanner = () => { const now = Date.now(); queue.current = queue.current.filter(b => now - b.at < 2500).slice(-2); return queue.current.shift() ?? null; };
  const announce = useCallback((text: string, tone?: string) => { queue.current.push({ id: ++bid.current, text, tone, at: Date.now() }); setBanner(b => b ?? nextBanner()); }, []); // eslint-disable-line
  useEffect(() => { if (phase === "over") { queue.current = []; } }, [phase]); // eslint-disable-line
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(nextBanner()), 1700); return () => clearTimeout(t); }, [banner]); // eslint-disable-line

  // reset local selections whenever the server moves the game forward
  const stageKey = `${phase}|${pending?.kind}|${pending?.stage}|${v?.turnPlayerId}|${choice?.kind}|${choice?.submitted}`;
  useEffect(() => { setPick(null); setNightSel(null); setPeek(false); }, [stageKey]);
  useEffect(() => { if (choice?.kind === "tituba") setOrder(o => o ?? choice.deck); else setOrder(null); }, [choice?.kind]); // eslint-disable-line

  // banners, sound and seat hits from new public log lines
  const seenLog = useRef<number | null>(null);
  useEffect(() => {
    const log: any[] = v?.log ?? [];
    const last = log.length ? log[log.length - 1].seq : 0;
    if (seenLog.current == null) { seenLog.current = last; return; }
    const fresh = log.filter(e => e.seq > seenLog.current!);
    seenLog.current = last;
    for (const e of fresh) {
      if (e.type === "PLAY" && e.targetId) {
        const id = ++fxId.current, from = seatCenter(e.actorId), to = seatCenter(e.targetId);
        setFly(f => [...f, { id, kind: e.cardKind, from, to }]);
        setTimeout(() => { setFly(f => f.filter(x => x.id !== id)); setHits(h => ({ ...h, [e.targetId]: Date.now() })); feel(cardInfo(e.cardKind).color === "red" ? "submit" : "tap"); }, 560);
      }
      if (e.type === "BLACK_EVENT") { const id = ++fxId.current; setBlackCard({ id, kind: e.cardKind, who: nameOf(e.actorId) }); setTimeout(() => setBlackCard(b => b?.id === id ? null : b), 2300); feel("tick"); try { navigator.vibrate?.([30, 60, 30]); } catch { /* */ } }
      if (e.type === "TRYAL_REVEALED") {
        const w = e.tryalKind === "witch", id = ++fxId.current;
        setReveal({ id, who: nameOf(e.targetId), kind: e.tryalKind, reason: "" });
        setTimeout(() => setReveal(r => r?.id === id ? null : r), 2600);
        setTimeout(() => { feel(w ? "lose" : "submit"); if (w) try { navigator.vibrate?.([60, 40, 90]); } catch { /* unsupported */ } }, 700);
      }
      if (e.type === "ELIMINATED") announce(`${nameOf(e.targetId)} 被淘汰`, "death");
      if (e.type === "NIGHT_SAVED") announce(`天亮了 · ${nameOf(e.targetId)} 幸存`);
      if (e.type === "NIGHT_COMPLETE") announce("天亮了");
      if (e.type === "CONSPIRACY_RESOLVED") announce("传牌完成 · 查看你的审判牌");
      if (e.type === "DAWN_COMPLETE") announce("天亮了 · 第一日");
      if (e.type === "HOURGLASS_STARTED") announce("沙漏翻转 · 30秒");
    }
  }, [v?.log?.length]); // eslint-disable-line
  const wasMyTurn = useRef(false);
  useEffect(() => { if (myTurn && !wasMyTurn.current) { announce("轮到你了", "gold"); try { navigator.vibrate?.(35); } catch { /* */ } } wasMyTurn.current = myTurn; }, [myTurn, announce]);
  const choiceKey = choice ? `${choice.kind}|${choice.submitted ?? ""}` : "";
  useEffect(() => { if (choice && !choice.submitted && !["loot"].includes(choice.kind)) { feel("tick"); try { navigator.vibrate?.(25); } catch { /* */ } } }, [choiceKey]); // eslint-disable-line
  useEffect(() => { document.title = (myTurn || (choice && !choice.submitted)) ? "⚠ 轮到你了 · 女巫镇" : "女巫镇"; return () => { document.title = "桌游合集"; }; }, [myTurn, choice]);
  useEffect(() => { // keep screen awake during a game
    let lock: any = null, live = true;
    const get = async () => { if (snap.stage !== "game" || document.visibilityState !== "visible" || lock) return; try { const l = await (navigator as any).wakeLock?.request("screen"); if (!live) await l?.release(); else { lock = l; l?.addEventListener("release", () => { lock = null; }); } } catch { /* */ } };
    const vis = () => { setPeek(false); void get(); };
    void get(); document.addEventListener("visibilitychange", vis);
    return () => { live = false; void lock?.release(); document.removeEventListener("visibilitychange", vis); };
  }, [snap.stage]);

  /* ----- derived rules helpers (display only; server stays authoritative) */
  const effChar = (id: string) => { const i = players.findIndex(p => p.id === id); const p = players[i]; if (!p || p.character !== "martha_corey") return p?.character; for (let s = 1; s < players.length; s++) { const n = players[(i - s + players.length) % players.length]; if (n.alive) return n.character; } return p.character; };
  const threshold = (target: any) => { const judge = me ? effChar(me) === "thomas_danforth" : false, strong = effChar(target.id) === "george_burroughs"; return (7 + (strong ? 1 : 0) - (judge ? 1 : 0)) * (target.table.some((c: Card) => c.kind === "piety") ? 2 : 1); };
  const living = players.filter(p => p.alive);

  /* ----- play flow */
  function beginPlay(card: Card, witness = false) {
    setSheet(null);
    if (!myTurn) { say("还没轮到你"); return; }
    if (cardInfo(card.kind).color === "black") { say("黑牌不能主动打出"); return; }
    if ((card.kind === "robbery" || card.kind === "scapegoat") && living.length < 3) { say(errText("NEED_THREE_LIVING_PLAYERS")); return; }
    setSel({ card, witness, step: "target", removeIds: [] }); feel("tap");
  }
  function seatTap(p: any) {
    if (sel) {
      if (p.id === me) { setHits(h => ({ ...h, [p.id]: -Date.now() })); say("不能对自己出牌"); return; }
      if (!p.alive) { say("该玩家已淘汰"); return; }
      if (sel.step === "target") {
        if (sel.card.kind === "curse" && !p.table.some((c: Card) => cardInfo(c.kind).color === "blue")) { say("对方面前没有蓝牌"); return; }
        if (sel.card.kind === "alibi" && !sel.witness && !p.table.some((c: Card) => cardInfo(c.kind, c.asWitness).color === "red")) { say("对方面前没有指控牌"); return; }
        const next: Sel["step"] = ["robbery", "scapegoat"].includes(sel.card.kind) ? "recipient" : sel.card.kind === "alibi" && !sel.witness ? "alibi" : sel.card.kind === "curse" ? "curse" : "target";
        setSel({ ...sel, targetId: p.id, step: next, recipientId: undefined }); return;
      }
      if (sel.step === "recipient") { if (p.id === sel.targetId) { say("两个对象必须不同"); return; } setSel({ ...sel, recipientId: p.id }); return; }
      return;
    }
    if (choice?.kind === "night-witch" || choice?.kind === "night-constable" || (phase === "dawn" && priv?.witchAllies)) {
      if (choice?.kind === "night-constable" && p.id === me) { say("警长不能保护自己"); return; }
      if (!p.alive) return; setNightSel(p.id); return;
    }
    setSheet({ kind: "seat", id: p.id });
  }
  const selReady = sel && sel.targetId && (sel.step === "target" || (sel.step === "recipient" && sel.recipientId) || (sel.step === "alibi" && sel.removeIds.length > 0) || (sel.step === "curse" && sel.blueId));
  async function confirmPlay() {
    if (!sel || !selReady) return;
    const ok = await act({ type: "PLAY", cardId: sel.card.id, targetId: sel.targetId, ...(sel.recipientId ? { recipientId: sel.recipientId } : {}), ...(sel.step === "alibi" ? { removeIds: sel.removeIds } : {}), ...(sel.blueId ? { blueId: sel.blueId } : {}), ...(sel.witness ? { asWitness: true } : {}) });
    if (ok) { feel("submit"); setSel(null); }
  }
  useEffect(() => { if (!myTurn) setSel(null); }, [myTurn]);

  /* ----- dock hint & buttons */
  const turnName = nameOf(v?.turnPlayerId);
  let hint = "", buttons: React.ReactNode = null;
  const B = (label: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean; testid?: string } = {}) => <button key={label} className={opts.primary ? "wt-primary" : ""} disabled={busy || opts.disabled} onClick={onClick} data-testid={opts.testid}>{label}</button>;
  const host = snap.players.find((p: any) => p.host)?.id === me;
  if (snap.stage === "lobby") {
    const mine = snap.players.find((p: any) => p.id === me);
    const all = snap.players.length >= 4 && snap.players.every((p: any) => p.ready);
    hint = !me ? "房间已开始或你尚未入座" : all ? (host ? "全员已准备，可以开始" : "全员已准备，等待房主开始") : `已入座 ${snap.players.length}/${snap.capacity} · ${snap.players.filter((p: any) => p.ready).length}人已准备`;
    buttons = me ? <>{B(mine?.ready ? "取消准备" : "准备", () => act({ type: "READY", ready: !mine?.ready }), { testid: "wt-ready" })}{host && B("开始游戏", () => act({ type: "START" }), { primary: true, disabled: !all, testid: "wt-start" })}</> : null;
  } else if (phase === "over") {
    hint = v?.outcome?.team === "witches" ? "女巫阵营获胜" : "平民阵营获胜";
    buttons = <>{B("公开记录", () => setSheet({ kind: "records" }))}{B("返回大厅", () => { location.href = "/"; }, { primary: true })}</>;
  } else if (!me || !alive) {
    hint = !me ? "观战中" : "你已淘汰 · 观战公开局势"; buttons = <button disabled>观战中 · 无法行动</button>;
  } else if (sel) {
    const c = cardInfo(sel.card.kind, sel.witness);
    hint = !sel.targetId ? `选择『${c.name}』的目标` : sel.step === "recipient" ? (sel.recipientId ? `把${nameOf(sel.targetId)}的${sel.card.kind === "robbery" ? "手牌" : "面前牌"}交给${nameOf(sel.recipientId)}？` : `选择接收者（不能是${nameOf(sel.targetId)}）`) : sel.step === "alibi" ? "勾选要移除的指控牌（合计≤3点）" : sel.step === "curse" ? "选择要弃掉的蓝牌" : `对${nameOf(sel.targetId)}使用『${c.name}』？`;
    buttons = <>{B("取消", () => setSel(null))}{B("确认出牌", confirmPlay, { primary: true, disabled: !selReady, testid: "wt-confirm-play" })}</>;
  } else if (phase === "dawn") {
    if (priv?.witchAllies) { hint = nightSel ? `把黑猫交给${nameOf(nightSel)}？（女巫需全体一致）` : "黎明 · 女巫选择黑猫的主人（可以是自己）"; buttons = B("确认", () => nightSel && act({ type: "DAWN_TARGET", targetId: nightSel }), { primary: true, disabled: !nightSel, testid: "wt-dawn-confirm" }); }
    else { hint = "黎明 · 请闭眼，女巫正在行动"; buttons = <button disabled>静候黎明…</button>; }
  } else if (choice?.kind === "trial") {
    hint = `审判${nameOf(choice.targetId)}：选择一张背面牌揭开`; buttons = B("确认揭牌", () => pick != null && act({ type: "REVEAL_TRYAL", index: pick }), { primary: true, disabled: pick == null, testid: "wt-reveal" });
  } else if (choice?.kind === "conspiracy-cat") {
    hint = `阴谋：揭开黑猫主人${nameOf(choice.targetId)}的一张牌`; buttons = B("确认揭牌", () => pick != null && act({ type: "CONSPIRACY_REVEAL", index: pick }), { primary: true, disabled: pick == null, testid: "wt-cat-reveal" });
  } else if (choice?.kind === "conspiracy-pick") {
    hint = choice.submitted ? "已选择 · 等待其他人" : `从左邻${nameOf(choice.sourceId)}的背面牌中拿一张`; buttons = B(choice.submitted ? "已提交" : "确认选择", () => pick != null && act({ type: "CONSPIRACY_PICK", index: pick }), { primary: true, disabled: pick == null || choice.submitted, testid: "wt-conspiracy-pick" });
  } else if (choice?.kind === "night-witch") {
    hint = nightSel ? `今晚袭击${nameOf(nightSel)}？女巫须全体一致` : "女巫：点选今晚的目标（可以是自己）"; buttons = B("秘密确认", () => nightSel && act({ type: "NIGHT_TARGET", targetId: nightSel }), { primary: true, disabled: !nightSel, testid: "wt-night-target" });
  } else if (choice?.kind === "night-constable") {
    hint = nightSel ? `保护${nameOf(nightSel)}？` : "警长：点选今晚要保护的人（不能是自己）"; buttons = B("确认保护", () => nightSel && act({ type: "NIGHT_PROTECT", targetId: nightSel }), { primary: true, disabled: !nightSel, testid: "wt-protect" });
  } else if (choice?.kind === "confession") {
    hint = choice.confessed ? "你已自白，今晚不会被女巫杀死" : "可选：公开一张自己的审判牌自白，免于今晚死亡";
    buttons = choice.confessed ? <button disabled>已自白</button> : <>{choice.governorAvailable && B("官员：不揭牌自白", () => act({ type: "CONFESS", useGovernor: true }))}{B("确认自白", () => pick != null && act({ type: "CONFESS", index: pick }), { primary: true, disabled: pick == null, testid: "wt-confess" })}</>;
  } else if (loot && loot.playerId === me) {
    hint = "继承遗物：挑一张牌"; buttons = B("收下", () => pick != null && act({ type: "LOOT_PICK", cardId: loot.pool[pick].id }), { primary: true, disabled: pick == null, testid: "wt-loot" });
  } else if (choice?.kind === "ability") {
    const ab: Record<string, string> = { ann: "少女：揭牌前先抽2张？", abigail: "小孩：弃掉自己面前全部指控牌？", rebecca: "家庭主妇：抽1张牌？", giles: "地主：展示两张指控并再抽1张？" };
    hint = ab[choice.ability] ?? "是否使用人物能力？"; buttons = <>{B("不使用", () => act({ type: "ABILITY_DECISION", use: false }))}{B("使用", () => act({ type: "ABILITY_DECISION", use: true }), { primary: true, testid: "wt-ability-yes" })}</>;
  } else if (choice?.kind === "tituba") {
    hint = "说书人：调整牌堆顺序（最上面先抽）";
    const finish = async (a: "draw" | "play") => { if (order && await act({ type: "TITUBA_REORDER", cardIds: order.map(c => c.id) })) await act({ type: "TITUBA_FINISH", action: a }); };
    buttons = <>{B("出牌", () => finish("play"))}{B("抽2张", () => finish("draw"), { primary: true, testid: "wt-tituba-draw" })}</>;
  } else if (myTurn) {
    const ch = effChar(me!), uses = priv?.abilityUses ?? {};
    hint = v.day.played ? "可以继续出牌，或结束回合" : "轮到你了 · 抽2张，或打出至少1张牌（点手牌）";
    buttons = v.day.played ? B("结束回合", () => act({ type: "END_TURN" }), { primary: true, testid: "wt-end" }) : <>
      {ch === "samuel_parris" && (uses.samuel_parris ?? 0) < 2 && B("牧师取牌", () => { setParrisPick([]); setSheet({ kind: "parris" }); })}
      {ch === "tituba" && !uses.tituba && B("说书人", () => act({ type: "TITUBA_START" }))}
      {B("抽2张", () => act({ type: "DRAW" }), { primary: true, testid: "wt-draw" })}</>;
  } else {
    const p = pending;
    hint = p?.kind === "trial" ? `${nameOf(p.actorId)}正在揭开${nameOf(p.targetId)}的审判牌…` : p?.kind === "black-event" ? (p.cardKind === "night" ? (p.stage === "confession" ? "天亮前 · 自白时间" : "夜晚 · 请闭眼") : p.stage === "picking" ? "阴谋 · 等待所有人选牌" : `阴谋 · ${nameOf(p.drawerId)}正在揭开黑猫主人的牌`) : p?.kind === "loot" ? `${nameOf(p.playerId)}正在继承遗物…` : p?.kind === "tituba" ? `${nameOf(p.playerId)}（说书人）正在重排牌堆…` : p?.kind === "ability" ? `${nameOf(p.playerId)}正在决定是否使用能力…` : `等待${turnName}行动…`;
    const canHourglass = phase === "day" && !p && !dayDeadline;
    buttons = canHourglass ? B("催促 · 翻沙漏", () => act({ type: "START_HOURGLASS" }), { testid: "wt-hourglass" }) : <button disabled>{p?.kind === "black-event" && p.cardKind === "night" ? "静候黎明…" : "等待中…"}</button>;
  }
  const activeDock = !!(myTurn || sel || (choice && !choice.submitted && !choice.confessed && choice.kind !== "night-witch-wait") || (loot && loot.playerId === me) || (phase === "dawn" && priv?.witchAllies));

  /* ----- panels */
  const hiddenMine: any[] = (priv?.tryals ?? []).filter((t: any) => !t.revealed);
  function eventPanel(): React.ReactNode {
    if (snap.stage === "lobby") return <div className="wt-lobby-form">
      <div className="wt-section-label"><b>房间 {snap.code}</b><span>{snap.players.length}/{snap.capacity}席</span></div>
      {!me && <><label>你的昵称<input data-testid="wt-name" value={name} maxLength={12} onChange={e => setName(e.target.value)}/></label><button className="wt-primary" data-testid="wt-claim" disabled={conn !== "online" || snap.players.length >= snap.capacity} onClick={() => claim(snap.code)}>{conn !== "online" ? "正在连接服务器…" : snap.players.length >= snap.capacity ? "房间已满" : "入座"}</button></>}
      <button className="wt-invite" data-testid="wt-invite" onClick={async () => { const url = `${location.origin}/?game=wt&room=${snap.code}`; try { if (navigator.share) await navigator.share({ title: "女巫镇", text: `来女巫镇入座：房间 ${snap.code}`, url }); else { await navigator.clipboard.writeText(url); say("邀请链接已复制"); } } catch { /* cancelled */ } }}>邀请朋友入座 ↗</button>
      <div className="wt-lobby-list">{snap.players.map((p: any, i: number) => <div key={p.id} className={p.ready ? "is-ready" : ""}><b>{i + 1}</b><span>{p.name}{p.id === me ? "（我）" : ""}</span><em>{p.host ? "房主 · " : ""}{p.ready ? "已准备" : "未准备"}{p.connected ? "" : " · 离线"}</em></div>)}</div>
      <p className="wt-entry-note">4–12人 · 身份与人物开局随机发放</p>
    </div>;
    if (phase === "over") return resultPanel();
    if (choice?.kind === "trial" || choice?.kind === "conspiracy-cat") {
      const target = players.find(p => p.id === choice.targetId);
      return <><div className="wt-event-heading"><span>{choice.kind === "trial" ? "公开审判" : "阴谋 · 黑猫"} · {nameOf(choice.targetId)}</span><h2>揭开一张审判牌</h2><p>{choice.kind === "trial" ? `${target?.accusations ?? 0} 点指控已达门槛 · 由你选择` : "黑猫主人先失去一张审判牌"}</p></div>
        <div className="wt-tryals wt-tryals-big">{Array.from({ length: choice.concealedCount }, (_, i) => <Tryal key={i} number={i + 1} selected={pick === i} onClick={() => { setPick(i); feel("tap"); }} testid={`wt-pick-${i}`}/>)}</div></>;
    }
    if (choice?.kind === "conspiracy-pick") return <><div className="wt-event-heading"><span>阴谋 · 同时传牌</span><h2>{choice.submitted ? "已选好 · 等待他人" : "从左邻拿一张"}</h2><p>{nameOf(choice.sourceId)} · 只能选择背面</p></div>
      <div className="wt-tryals wt-tryals-big">{Array.from({ length: choice.concealedCount }, (_, i) => <Tryal key={i} number={i + 1} selected={(choice.submitted ? choice.selectedIndex : pick) === i} onClick={choice.submitted ? undefined : () => { setPick(i); feel("tap"); }} testid={`wt-pick-${i}`}/>)}</div></>;
    if (pending?.kind === "black-event" && pending.cardKind === "conspiracy" && pending.stage !== "picking") return waitPanel("阴谋浮现", `${nameOf(pending.drawerId)}正在揭开黑猫主人的审判牌`, "conspiracy");
    if (pending?.kind === "black-event" && pending.cardKind === "conspiracy") return waitPanel("阴谋 · 传牌", "所有人正同时从左邻拿牌", "conspiracy");
    if (isNight && pending?.stage !== "confession") {
      if (choice?.kind === "night-witch" || (phase === "dawn" && priv?.witchAllies)) {
        const votes = choice?.votes ?? priv?.dawnVotes ?? {}, allies: string[] = choice?.allies ?? priv?.witchAllies ?? [];
        return <><div className="wt-event-heading"><span>私人行动 · 仅女巫可见</span><h2>{phase === "dawn" ? "黎明 · 放置黑猫" : "今夜，女巫苏醒"}</h2><p>点上方座位选择 · 全体女巫一致才生效</p></div>
          <div className="wt-night-panel wt-ally-list">{allies.map(id => <p key={id}><b>{nameOf(id)}{id === me ? "（你）" : ""}</b><span>{votes[id] ? `→ ${nameOf(votes[id])}` : "尚未选择"}</span></p>)}
            {(() => { const tally: Record<string, number> = {}; for (const id of allies) if (votes[id]) tally[votes[id]] = (tally[votes[id]] ?? 0) + 1;
              const top = Object.entries(tally).sort((a, b) => b[1] - a[1] || players.findIndex(p => p.id === a[0]) - players.findIndex(p => p.id === b[0]))[0];
              return top && votes[me!] !== top[0] ? <button className="wt-follow" data-testid="wt-follow" disabled={busy} onClick={() => act(phase === "dawn" ? { type: "DAWN_TARGET", targetId: top[0] } : { type: "NIGHT_TARGET", targetId: top[0] })}>采用最多票：{nameOf(top[0])}（{top[1]}票）</button> : null; })()}</div></>;
      }
      if (choice?.kind === "night-constable") return <><div className="wt-event-heading"><span>私人行动 · 警长</span><h2>守护一人</h2><p>点上方座位 · 不能保护自己{choice.knownAttackTargetId ? ` · 女巫目标：${nameOf(choice.knownAttackTargetId)}` : ""}</p></div><div className="wt-night-panel wt-night-icon"><Sigil kind="constable"/></div></>;
      return waitPanel(phase === "dawn" ? "黎明之前" : "夜色正浓", choice?.kind === "night-witch-wait" ? `目标已定：${nameOf(choice.knownAttackTargetId)} · 等待警长` : "请闭眼，静候黎明", "moon");
    }
    if (choice?.kind === "confession") return <><div className="wt-event-heading"><span>天亮之前 · 自白</span><h2>{choice.confessed ? "你已自白" : "要向小镇自白吗？"}</h2><p>{choice.confessed ? "今晚不会被女巫杀死" : "公开自己一张审判牌，可免于今晚的死亡"}{choice.knownAttackTargetId ? ` · 目标：${nameOf(choice.knownAttackTargetId)}` : ""}</p></div>
      <div className="wt-confession-row">{choice.deadline && <Ring deadline={choice.deadline} total={30}/>}<div className="wt-tryals">{hiddenMine.map((t, i) => <span key={t.id} className="wt-hold" onPointerDown={() => setPeekIdx(i)} onPointerUp={() => setPeekIdx(null)} onPointerLeave={() => setPeekIdx(null)} onPointerCancel={() => setPeekIdx(null)} onContextMenu={e => e.preventDefault()}><Tryal number={i + 1} kind={t.kind} revealed={peekIdx === i} selected={pick === i} onClick={choice.confessed ? undefined : () => setPick(i)} testid={`wt-pick-${i}`}/></span>)}</div></div>
      {!choice.confessed && <p className="wt-hold-tip">按住牌可偷看，松手盖回 · 点一下选择</p>}</>;
    if (pending?.kind === "black-event" && pending.stage === "confession") return waitPanel("天亮之前", "存活者正在决定是否自白", "moon", pending.deadline);
    if (loot) return <><div className="wt-event-heading"><span>继承遗物</span><h2>{loot.playerId === me ? "轮到你挑选" : `等待${nameOf(loot.playerId)}挑选`}</h2><p>{loot.recipients.map((id: string, i: number) => `${nameOf(id)} ${loot.taken[i]}/3`).join(" · ")}</p></div>
      <div className="wt-loot-cards">{loot.pool.map((c: Card, i: number) => <CardFace key={c.id} card={c} compact selected={pick === i} onClick={loot.playerId === me ? () => setPick(i) : undefined}/>)}</div></>;
    if (choice?.kind === "tituba" && order) return <><div className="wt-event-heading"><span>说书人 · 每局一次</span><h2>重排命运</h2><p>最上方先抽 · 共{order.length}张</p></div><Ring deadline={choice.deadline} total={60}/>
      <div className="wt-order-list">{order.map((c, i) => <div key={c.id} className={`wt-order-${cardInfo(c.kind).color}`}><b>{i + 1}</b><Sigil kind={c.kind === "black_cat" ? "cat" : c.kind}/><span>{cardInfo(c.kind).name}</span><button aria-label="置顶" disabled={i === 0} onClick={() => setOrder(o => { const a = [...o!]; a.unshift(a.splice(i, 1)[0]); return a; })}>⤒</button><button aria-label="上移" disabled={i === 0} onClick={() => setOrder(o => { const a = [...o!]; a.splice(i - 1, 0, a.splice(i, 1)[0]); return a; })}>↑</button><button aria-label="下移" disabled={i === order.length - 1} onClick={() => setOrder(o => { const a = [...o!]; a.splice(i + 1, 0, a.splice(i, 1)[0]); return a; })}>↓</button></div>)}</div></>;
    if (choice?.kind === "ability") return waitPanel("人物能力", charInfo(effChar(me!))?.abilityZh ?? "", "seal");
    if (pending?.kind === "trial") return waitPanel("公开审判", `${nameOf(pending.actorId)}正在揭开${nameOf(pending.targetId)}的审判牌`, "accusation");
    if (sel && (sel.step === "alibi" || sel.step === "curse") && sel.targetId) {
      const t = players.find(p => p.id === sel.targetId);
      const items: Card[] = t.table.filter((c: Card) => cardInfo(c.kind, c.asWitness).color === (sel.step === "alibi" ? "red" : "blue"));
      return <><div className="wt-event-heading"><span>{cardInfo(sel.card.kind).name} · {nameOf(sel.targetId)}</span><h2>{sel.step === "alibi" ? "移除指控（合计≤3点）" : "弃掉一张蓝牌"}</h2><p>点选下方的牌</p></div>
        <div className="wt-loot-cards">{items.map(c => <CardFace key={c.id} card={c} compact selected={sel.step === "alibi" ? sel.removeIds.includes(c.id) : sel.blueId === c.id} onClick={() => setSel(s => s && (s.step === "alibi" ? { ...s, removeIds: s.removeIds.includes(c.id) ? s.removeIds.filter(x => x !== c.id) : [...s.removeIds, c.id] } : { ...s, blueId: c.id }))}/>)}</div></>;
    }
    return null;
  }
  function waitPanel(title: string, sub: string, sigil: string, deadline?: number) {
    return <><div className="wt-event-heading"><span>{phase === "dawn" || isNight ? "私人行动" : "公开事件"}</span><h2>{title}</h2><p>{sub}</p></div><div className="wt-night-panel wt-night-icon">{deadline ? <Ring deadline={deadline} total={30}/> : <Sigil kind={sigil}/>}<span className="wt-wait-dots">· · ·</span></div></>;
  }
  function resultPanel() {
    const o = v.outcome, fin: any[] = v.final ?? [];
    const iWon = o?.winners?.includes(me);
    return <><div className="wt-event-heading"><span>{o?.reason === "all-witch-tryals-revealed" ? "全部女巫牌已揭开" : o?.reason === "last-townsperson-infected" ? "最后的平民也被感染" : "平民已全部倒下"}</span><h2>{o?.team === "witches" ? "女巫获胜" : "平民获胜"}</h2></div>
      {me && <div className={`wt-victory-seal ${iWon ? "" : "is-lost"}`}><Sigil kind={o?.team === "witches" ? "witch" : "not_witch"}/><strong>{iWon ? "你赢了" : "你输了"}</strong></div>}
      <div className="wt-result-list">{players.map((p, i) => { const f = fin.find(x => x.id === p.id); const won = o?.winners?.includes(p.id); return <div key={p.id} className={f?.everWitch ? "wt-result-witch" : won ? "wt-result-winner" : ""} style={{ "--wt-i": i } as CSSProperties}><b>{i + 1}号 {p.name}{f?.everWitch && <em>曾是女巫</em>}{!p.alive && <em className="wt-dead-tag">已淘汰</em>}</b><span>{charName(p.character)}</span><span className="wt-result-tryals">{(f?.tryals ?? []).map((k: string, j: number) => <Tryal key={j} number={j + 1} revealed kind={k}/>)}</span></div>; })}</div>
      {iWon && <div className="wt-confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--wt-i": i } as CSSProperties}/>)}</div>}</>;
  }
  const peekProps = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); setPeek(true); },
    onPointerUp: () => setPeek(false), onPointerCancel: () => setPeek(false), onLostPointerCapture: () => setPeek(false), onBlur: () => setPeek(false),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setPeek(true); } }, onKeyUp: () => setPeek(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const panel = eventPanel();
  const hand: Card[] = priv?.hand ?? [];
  const center = () => {
    if (isNight) return <div className="wt-night-center"><Sigil kind="moon"/><h2>{phase === "dawn" ? "黎明" : "夜晚"}</h2>{pending?.deadline && <Ring deadline={pending.deadline} total={30}/>}</div>;
    const label = snap.stage === "lobby" ? "小镇集会" : phase === "over" ? "终局" : pending?.kind === "black-event" ? "阴谋" : pending?.kind === "trial" ? "审判" : `${turnName} 的回合`;
    return <div className="wt-table-center"><Candle/><h2>{label}</h2>{dayDeadline ? <Ring deadline={dayDeadline} total={30}/> : v && <small>牌堆 {v.deckCount} · 弃牌 {v.discard.length}</small>}</div>;
  };
  const now = useNow(true);
  const sceneClass = snap.stage === "lobby" ? "wt-scene-lobby" : phase === "over" ? "wt-scene-result" : choice?.kind === "tituba" && order ? "wt-scene-tituba" : !panel && layout.dense ? "wt-scene-day-12" : "";

  return <main className={`wt-world wt-live ${sceneClass} ${isNight ? "wt-is-night" : ""} ${myTurn ? "wt-my-turn" : ""} ${sel ? "wt-selecting" : ""}`} data-testid="wt-world" data-phase={phase} onClickCapture={e => { const b = (e.target as HTMLElement).closest("button"); if (b) { feel("tap"); if (b.classList.contains("wt-primary")) try { navigator.vibrate?.(10); } catch { /* */ } } }}>
    <RoomArt/>
    <header className="wt-top"><a href="/" aria-label="返回桌游合集">‹</a><div className="wt-brand wt-brand-live"><strong>女巫镇</strong><span>SALEM 1692</span></div><div className="wt-top-info"><b>{snap.stage === "lobby" ? `房间 ${snap.code}` : phase === "over" ? "终局" : isNight ? "夜晚" : "白天"}</b><span>{v ? `牌堆 ${v.deckCount}` : `${snap.players.length}/${snap.capacity}人`}</span></div><button className="wt-icon-button" aria-label={muted ? "开启音效" : "关闭音效"} onClick={() => { setSoundOn(muted); setMuted(!muted); }}>{muted ? "静" : "声"}</button><button className="wt-icon-button" aria-label="菜单" onClick={() => setSheet({ kind: "menu" })}>☷</button></header>
    {conn !== "online" && <span className="wt-resumed wt-offline">{conn === "offline" ? "连接中断 · 正在重连…" : "正在连接…"}</span>}
    <div className="wt-workspace">
      <section ref={tableRef} className={`wt-table-space ${layout.dense ? "wt-dense" : ""}`} aria-label={`${count}人圆桌`}>
        <div className="wt-table-wood"><div className="wt-table-felt"/><div className="wt-candle-light"/></div>
        {center()}
        {Array.from({ length: count }, (_, k) => {
          const i = (myIdx + k) % Math.max(1, count), p = players[i], pos = layout.pos[k];
          if (!pos) return null;
          const style = { left: `${pos.left}%`, top: `${pos.top}%`, "--wt-seat-w": `${layout.seatW}px`, "--wt-seat-h": `${layout.seatH}px`, "--wt-light-angle": `${Math.atan2(-Math.sin(pos.a), -Math.cos(pos.a)) * 180 / Math.PI + 90}deg` } as CSSProperties;
          const number = <b key={`n${k}`} className="wt-seat-number" aria-hidden="true" style={{ left: `${pos.left}%`, top: `${pos.top}%`, transform: `translate(${-layout.seatW / 2 - 15}px,${-layout.seatH / 2 - 8}px)` }}>{i + 1}</b>;
          if (!p) return <React.Fragment key={k}><span className="wt-seat wt-seat-empty" style={style}><span className="wt-seat-name">空位</span></span>{number}</React.Fragment>;
          const lobbyP = snap.players.find((x: any) => x.id === p.id);
          const th = snap.stage === "game" ? threshold(p) : 7, acc = p.accusations ?? 0;
          const blues: Card[] = (p.table ?? []).filter((c: Card) => cardInfo(c.kind, c.asWitness).color === "blue");
          const hasGavel = v?.gavelTargetId === p.id;
          // Budget the status row before rendering it: counts stay visible, blue
          // cards use at most two icons and the rest remain accessible via +N/details.
          const innerW = layout.seatW - (layout.dense ? 12 : 14);
          const fixedW = 22 + (layout.dense ? 0 : 7 + String(p.handCount ?? 0).length * 7);
          const fixedN = 1 + (layout.dense ? 0 : 1);
          let blueIcons = Math.min(2, blues.length);
          while (blueIcons > 0) {
            const more = blues.length > blueIcons;
            const used = fixedW + blueIcons * 12 + (more ? 14 : 0) + fixedN + blueIcons + Number(more) - 1;
            if (used <= innerW) break;
            blueIcons--;
          }
          const hit = hits[p.id], recentHit = hit && now - Math.abs(hit) < 700;
          const pickable = (sel && p.id !== me && p.alive && (sel.step === "target" || sel.step === "recipient")) || ((choice?.kind === "night-witch" || (phase === "dawn" && priv?.witchAllies)) && p.alive) || (choice?.kind === "night-constable" && p.alive && p.id !== me);
          const selected = sel ? sel.targetId === p.id || sel.recipientId === p.id : nightSel === p.id;
          const active = snap.stage === "game" && (v?.turnPlayerId === p.id && phase === "day" || pending?.actorId === p.id || pending?.playerId === p.id);
          return <React.Fragment key={k}><button data-testid={`wt-seat-${i}`} data-player={p.id} className={`wt-seat ${p.id === me ? "wt-self" : ""} ${active ? "wt-active" : ""} ${pickable ? "wt-pickable" : ""} ${selected ? "wt-selected" : ""} ${!p.alive ? "wt-dead-seat" : ""} ${recentHit ? (hit > 0 ? "wt-hit" : "wt-shake") : ""} ${acc >= th - 1 && snap.stage === "game" && p.alive ? "wt-near" : ""} ${lobbyP && !lobbyP.connected ? "wt-away" : ""}`} style={style} onClick={() => seatTap(p)} aria-label={`${i + 1}号${p.name}，${charName(p.character)}，${acc}/${th}点指控`}>
            <span className="wt-seat-person">{!layout.dense && <span className="wt-seat-face"><Portrait index={i}/></span>}<span className="wt-seat-text"><span className="wt-seat-name">{p.name}</span>{!layout.dense && <span className="wt-seat-role">{snap.stage === "lobby" ? (lobbyP?.ready ? "已准备" : "未准备") : charName(p.character)}</span>}</span>{hasGavel && <span className="wt-gavel-chip" title="警长木槌"><Sigil kind="constable"/></span>}</span>
            {snap.stage === "game" ? <span className="wt-accuse-row"><span className={`wt-accuse ${acc >= th ? "is-full" : ""}`}><i style={{ width: `${Math.min(100, acc / th * 100)}%` }}/></span><b key={acc} className={acc ? "wt-bump" : ""}>{acc}/{th}</b></span> : <span className="wt-accuse-row"><b>{lobbyP?.host ? "房主" : ""}</b></span>}
            {snap.stage === "game" && <span className="wt-seat-public">{!layout.dense && <span className="wt-hand-count" title={`手牌${p.handCount}张`}>▤{p.handCount}</span>}{blues.slice(0, blueIcons).map(c => <span key={c.id} className="wt-effect-token" title={cardInfo(c.kind).name}><Sigil kind={c.kind === "black_cat" ? "cat" : c.kind}/></span>)}{blues.length > blueIcons && <span className="wt-more" title={`另有${blues.length-blueIcons}张蓝牌，点座位查看全部`}>+{blues.length - blueIcons}</span>}<span className={`wt-tryal-counts ${p.revealedTryals.includes("witch") ? "is-witch" : ""}`} title={`已公开${p.revealedTryals.length}张 / 隐藏${p.hiddenTryalCount}张审判牌`} aria-label={`已公开${p.revealedTryals.length}张，隐藏${p.hiddenTryalCount}张审判牌`}>{p.revealedTryals.length}/{p.hiddenTryalCount}</span></span>}
            {p.id === me && <i className="wt-me-tag wt-me-inside">我</i>}
            {sel && sel.targetId === p.id && sel.step !== "target" && <i className="wt-role-tag">{sel.card.kind === "robbery" ? "被抢" : sel.card.kind === "scapegoat" ? "转出" : "目标"}</i>}
            {sel?.recipientId === p.id && <i className="wt-role-tag is-to">接收</i>}
          </button>{number}</React.Fragment>;
        })}
      </section>
      <aside className={`wt-personal ${panel ? "wt-event-panel" : ""}`} aria-label={panel ? "当前事件" : "我的区域"}>
        {panel ?? <>
          <div className="wt-private-heading"><div><b>{alive ? "我的审判牌" : "观战"}</b><span>{me ? `${hiddenMine.length}张隐藏 · ${charName(meP?.character)}` : "仅公开信息"}</span></div>{me && <button onClick={() => setSheet({ kind: "identity" })} data-testid="wt-identity">查看私牌</button>}</div>
          {me && <div className="wt-mini-tryals">{(priv?.tryals ?? []).map((t: any, i: number) => <Tryal key={t.id} number={i + 1} kind={t.kind} revealed={t.revealed}/>)}</div>}
          <div className="wt-section-label"><b>{alive ? "我的手牌" : ""}</b><span>{alive && `手牌 ${hand.length} 张`}</span><button onClick={() => setSheet({ kind: "records" })}>记录 ↗</button></div>
          {alive ? <div className="wt-hand wt-hand-fan" style={{ "--wt-n": Math.max(1, hand.length) } as CSSProperties}>{hand.map((c, i) => <div key={c.id} className="wt-hand-slot" style={{ "--wt-tilt": `${(i - (hand.length - 1) / 2) * Math.min(2.5, 16 / Math.max(1, hand.length - 1))}deg`, "--wt-i": i } as CSSProperties}><CardFace card={c} compact selected={sel?.card.id === c.id} onClick={() => setSheet({ kind: "card", card: c })}/></div>)}{!hand.length && <p className="wt-spectator-note">手里没有牌</p>}</div>
            : <p className="wt-spectator-note">你只能查看公开局势。存活玩家的手牌与隐藏身份仍然保密。</p>}
        </>}
      </aside>
    </div>
    <footer className={`wt-dock ${activeDock ? "wt-dock-active" : ""}`} aria-label="行动栏"><div className="wt-dock-hint" data-testid="wt-hint"><i/>{hint}</div><div className="wt-dock-buttons">{buttons}</div></footer>
    {fly.map(f => <div key={f.id} className="wt-fly" style={{ "--fx": `${f.from.x}px`, "--fy": `${f.from.y}px`, "--tx": `${f.to.x}px`, "--ty": `${f.to.y}px` } as CSSProperties}><CardFace card={{ id: "fly", kind: f.kind }} compact/></div>)}
    {blackCard && <div key={blackCard.id} className="wt-fx-black" role="status"><div className="wt-fx-black-card"><CardFace card={{ id: "bk", kind: blackCard.kind }}/></div><p>{blackCard.who} 抽到了</p><strong>{cardInfo(blackCard.kind).name}</strong></div>}
    {reveal && <div key={reveal.id} className={`wt-fx-reveal ${reveal.kind === "witch" ? "is-witch" : ""}`} role="status"><p>{reveal.who} 的审判牌</p><div className="wt-fx-flip"><Tryal number={0} kind={reveal.kind} revealed/></div><strong>{tryalName(reveal.kind)}</strong>{reveal.kind === "witch" && <div className="wt-smoke-fx" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ "--wt-i": i } as CSSProperties}/>)}</div>}</div>}
    {banner && !reveal && !blackCard && <div key={banner.id} className={`wt-phase-banner ${banner.tone ? `wt-banner-${banner.tone}` : ""}`} role="status"><strong>{banner.text}</strong></div>}
    {toast && <div className="wt-toast" role="status">{toast}</div>}
    {sheet && <div className="wt-modal-backdrop" onClick={() => { setSheet(null); setPeek(false); }}><section className={`wt-modal ${sheet.kind === "card" ? "wt-card-sheet" : ""}`} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
      <div className="wt-sheet-grip" aria-hidden="true"><i/></div><button className="wt-close" aria-label="关闭" onClick={() => { setSheet(null); setPeek(false); }}>×</button>
      <div className="wt-sheet-body">{sheetBody()}</div>
      <button className="wt-sheet-close" onClick={() => { setSheet(null); setPeek(false); }}>关闭</button></section></div>}
  </main>;

  function sheetBody(): React.ReactNode {
    if (!sheet) return null;
    if (sheet.kind === "card") { const c = cardInfo(sheet.card.kind); const doctor = sheet.card.kind === "alibi" && me && effChar(me) === "will_griggs";
      return <><CardFace card={sheet.card}/><h2>{c.name}</h2><p>{c.text}</p><div className="wt-sheet-actions">{doctor && <button disabled={!myTurn} onClick={() => beginPlay(sheet.card, true)}>作为目击（+7）</button>}<button className="wt-primary" data-testid="wt-use-card" disabled={!myTurn || c.color === "black"} onClick={() => beginPlay(sheet.card)}>{myTurn ? "使用" : "还没轮到你"}</button></div></>; }
    if (sheet.kind === "identity") return <><span className="wt-kicker">仅你可见 · 注意身旁的人</span><h2>我的审判牌</h2><p>{priv?.everWitch ? "你曾持有女巫牌，属于女巫阵营。" : "按住下方按钮查看，松手立即盖回。"}</p><div className="wt-tryals">{(priv?.tryals ?? []).map((t: any, i: number) => <Tryal key={t.id} number={i + 1} kind={t.kind} revealed={peek || t.revealed}/>)}</div><button className="wt-peek-button" data-testid="wt-peek" {...peekProps}>按住查看 · 松手盖回</button><h3>我的人物：{charName(meP?.character)}</h3><p>{charInfo(meP?.character)?.abilityZh}</p></>;
    if (sheet.kind === "seat") { const p = players.find(x => x.id === sheet.id); if (!p) return null; const i = players.indexOf(p);
      const reds = (p.table ?? []).filter((c: Card) => cardInfo(c.kind, c.asWitness).color === "red"), blues = (p.table ?? []).filter((c: Card) => cardInfo(c.kind).color === "blue");
      return <><Portrait index={i}/><h2>{i + 1}号 {p.name}</h2><p>{charName(p.character)} · {p.alive ? "存活" : "已淘汰"} · 手牌{p.handCount}张 · 隐藏审判牌{p.hiddenTryalCount}张</p>{snap.stage === "game" && <p>指控 {p.accusations}/{threshold(p)}（你审判此人的门槛）</p>}<h3>人物能力</h3><p>{charInfo(p.character)?.abilityZh ?? "—"}</p>
        <h3>面前的蓝牌</h3>{blues.length ? <div className="wt-public-effects">{blues.map((c: Card) => <div key={c.id}><Sigil kind={c.kind === "black_cat" ? "cat" : c.kind}/><strong>{cardInfo(c.kind).name}</strong><p>{cardInfo(c.kind).text}</p></div>)}</div> : <p>无</p>}
        <h3>面前的红牌</h3><p>{reds.length ? reds.map((c: Card) => cardInfo(c.kind, c.asWitness).name).join(" · ") : "无"}</p>
        <h3>已公开审判牌</h3>{p.revealedTryals.length ? <div className="wt-detail-revealed">{p.revealedTryals.map((k: string, j: number) => <Tryal key={j} number={j + 1} revealed kind={k}/>)}</div> : <p>无</p>}</>; }
    if (sheet.kind === "parris") { const pool: Card[] = (v?.discard ?? []).filter((c: Card) => cardInfo(c.kind).color !== "black");
      return <><span className="wt-kicker">牧师 · 每局两次 · 代替抽牌</span><h2>从弃牌堆取牌</h2><p>最多选2张，取回后回合结束。</p><div className="wt-loot-cards">{pool.map(c => <CardFace key={c.id} card={c} compact selected={parrisPick.includes(c.id)} onClick={() => setParrisPick(x => x.includes(c.id) ? x.filter(y => y !== c.id) : x.length < 2 ? [...x, c.id] : x)}/>)}{!pool.length && <p>弃牌堆没有可取的牌。</p>}</div><button className="wt-primary" disabled={busy || !myTurn} onClick={async () => { if (await act({ type: "PARRIS_DRAW", cardIds: parrisPick })) setSheet(null); }}>取回 {parrisPick.length} 张并结束回合</button></>; }
    if (sheet.kind === "menu") return <><span className="wt-kicker">房间 {snap.code}</span><h2>女巫镇</h2><p>{v?.notices?.join(" · ") ?? "部分张数待官方核实"}。规则依据《Salem 1692》官方规则书（第15印次）。</p><button onClick={() => setSheet({ kind: "records" })}>公开记录</button><button onClick={async () => { const url = `${location.origin}/?game=wt&room=${snap.code}`; try { await navigator.clipboard.writeText(url); say("邀请链接已复制"); } catch { say(url); } }}>复制房间链接</button></>;
    const lines = (v?.log ?? []).map((e: any) => describe(e, nameOf)).filter(Boolean).reverse();
    return <><span className="wt-kicker">公开事件</span><h2>小镇记录</h2><div className="wt-record-list">{lines.length ? lines.map((x: string, i: number) => <p key={i}>{x}</p>) : <p>暂无记录</p>}</div></>;
  }
}
