import { useEffect, useMemo, useRef, useState } from "react";
import { createTARoom, savedName, useTARoom } from "./ta-net.ts";
import { ABILITIES, AGENDA_TEXT, CARD_TEXT, CHAR_NAME, QUESTION, WOUND_TEXT, RULES, zh, type Step } from "./text.ts";
import { CHARACTERS, ENERGY_GOAL, ENERGY_SAFE, OXYGEN_MAX } from "../../../../packages/menace/src/data.ts";
import "./ta.css";
import vfxMeta from "../vfx-meta.json" with { type: "json" };
import { music, sfx, setMute, muted } from "./sound.ts";
const img = (n: string) => `/assets/menace/${n}.webp`;
const PHASE: Record<string, string> = { setup: "选择角色", action: "行动阶段", resolve: "匿名结算", accuse: "讨论与指控", vote: "放逐投票", over: "对局结束" };
export function Menace() {
  const q = new URLSearchParams(location.search); const code = q.get("room")?.toUpperCase();
  if (!code) return <Entry />;
  return <Room code={code} />;
}
const TABS: [string, string[]][] = [["玩法", ["游戏目标", "胜利条件", "开局", "每轮流程", "重要限制", "操作提示"]], ["名词", ["卡牌和名词"]], ["受伤投票", ["受伤是什么", "死亡", "投票与放逐", "伤害牌一览"]], ["卡牌", ["行动牌一览"]], ["身份", ["身份牌一览"]], ["角色", ["角色能力一览"]]];
function Rules() { const [t, setT] = useState(0); return <div className="ta-help" onClick={(e) => e.stopPropagation()}><div className="ta-tabs">{TABS.map(([n], i) => <button key={n} type="button" className={i === t ? "on" : ""} onClick={() => setT(i)}>{n}</button>)}</div><div className="ta-tabbody">{RULES.filter(([h]) => TABS[t][1].includes(h)).map(([h, ps]) => <section key={h}><h3>{h}</h3>{ps.map((x) => <p key={x}>{x}</p>)}</section>)}</div></div>; }
function Entry() {
  const [code, setCode] = useState(""); const [err, setErr] = useState("");
  const go = (c: string) => { const u = new URL(location.href); u.searchParams.set("room", c); location.href = u.toString(); };
  return <div className="ta-world ta-entry"><h1>我们之中的威胁</h1><details className="ta-rules"><summary>查看游戏规则</summary><Rules /></details><p>ISV-VIGILANT 失去动力，氧气正在流失。修好飞船，或者让所有人窒息。</p>
    <button className="ta-primary" onClick={async () => { const r = await createTARoom(); r.ok ? go((r as any).code) : setErr(r.error); }}>创建房间</button>
    <div className="ta-row"><input value={code} maxLength={4} placeholder="房间号" onChange={(e) => setCode(e.target.value.toUpperCase())} /><button onClick={() => code && go(code)}>加入</button></div><p className="ta-err">{err}</p></div>;
}
function Room({ code }: { code: string }) {
  const r = useTARoom(code); const [name, setName] = useState(savedName()); const [msg, setMsg] = useState("");
  const s = r.snap;
  if (r.error) return <div className="ta-world ta-entry"><p className="ta-err">{r.error}</p></div>;
  if (!s) return <div className="ta-world ta-entry"><p>正在连接…</p></div>;
  if (!s.mySeat) return <div className="ta-world ta-entry"><h2>房间 {code}</h2>{s.stage === "game" ? <p>游戏已开始。</p> : <><input value={name} placeholder="昵称" maxLength={12} onChange={(e) => setName(e.target.value)} /><button className="ta-primary" onClick={async () => setMsg((await r.claim(name)) ?? "")}>登舰</button></>}<p className="ta-err">{msg}</p></div>;
  const host = s.hostId === s.mySeat;
  if (s.stage === "lobby") return <div className="ta-world ta-entry"><h2>房间 {code}</h2><p>把房间号发给朋友，需要 4–8 人。</p><details className="ta-rules"><summary>查看游戏规则</summary><Rules /></details><ul className="ta-list">{s.players.map((p: any) => <li key={p.playerId}>{p.name}{p.host ? "（房主）" : ""}{p.connected ? "" : " · 离线"}</li>)}</ul>
    {host ? <><div className="ta-row"><button className={s.mode === "basic" ? "on" : ""} onClick={() => r.lobby({ type: "SET_MODE", mode: "basic" })}>基础模式</button><button className={s.mode === "advanced" ? "on" : ""} onClick={() => r.lobby({ type: "SET_MODE", mode: "advanced" })}>进阶模式</button></div><button onClick={async () => setMsg((await r.lobby({ type: "ADD_BOT" })) ?? "")}>添加人机</button><button className="ta-primary" onClick={async () => setMsg((await r.lobby({ type: "START" })) ?? "")}>开始（{s.players.length} 人）</button></> : <p>{s.mode === "basic" ? "基础模式" : "进阶模式"}，等待房主开始。</p>}<p className="ta-err">{msg}</p></div>;
  return <Game snap={s} send={async (c) => setMsg((await r.command(c)) ?? "")} msg={msg} clear={() => setMsg("")} restart={() => r.lobby({ type: "START" })} host={host} online={r.connected} />;
}
const TONE: Record<string, string> = { advanced_repair: "#f0a020", airlock: "#2f8fe0", backstab: "#d9352c", basic_repair: "#f0b81e", brawl: "#f07020", command: "#8a55c8", explosion: "#f05a20", panic: "#ee3f92", raise_morale: "#2f9fe0", reactor: "#74c52c", replicate: "#2fc0a0" };
function GameCard({ type }: { type: string }) {
  const [name, text] = CARD_TEXT[type];
  return <div className="ta-gc" style={{ "--k": TONE[type] } as any}><div className="h"><small>台面下行动</small><b>{name}</b></div><div className="m"><img src={img("m_" + type)} alt={name} /></div><div className="t"><span>{text}</span></div><div className="s" /></div>;
}
function InfoCard({ tone, kind, name, pic, text, round }: { tone: string; kind: string; name: string; pic: string; text: string; round?: boolean }) {
  return <div className={"ta-gc" + (round ? "" : " tall")} style={{ "--k": tone } as any}><div className="h"><small>{kind}</small><b>{name}</b></div><div className="m">{pic ? <img src={pic} alt={name} /> : null}</div><div className="t"><span>{text}</span></div><div className="s" /></div>;
}
const AGENDA_TONE = (a: string) => (["contagion", "butcher"].includes(a) ? "#d9352c" : a === "coward" ? "#e0a92a" : "#74a83c");
const zoomOf = { agenda: (a: string) => <InfoCard round tone={AGENDA_TONE(a)} kind="身份" name={AGENDA_TEXT[a][0].split("（")[0]} pic={img("a_" + a)} text={AGENDA_TEXT[a][1]} />, wound: (w: string) => <InfoCard round tone="#b3201a" kind="伤害报告" name={WOUND_TEXT[w].split("：")[0]} pic="" text={WOUND_TEXT[w].split("：")[1]} />, char: (c: string) => { const [x, y] = CHARACTERS[c].ab; return <InfoCard tone="#3fb0a0" kind="角色" name={CHAR_NAME[c]} pic={img("p_" + c)} text={`${ABILITIES[x].name}${ABILITIES[x].cost ? "（" + ABILITIES[x].cost + "）" : ""}：${ABILITIES[x].text}\n${ABILITIES[y].name}${ABILITIES[y].cost ? "（" + ABILITIES[y].cost + "）" : ""}：${ABILITIES[y].text}`} />; } };
const CARD_FX: Record<string, string> = { basic_repair: "repair", advanced_repair: "repair", raise_morale: "heal", command: "complete", replicate: "teleport", brawl: "hook", backstab: "slash", panic: "shock", airlock: "crow", explosion: "pallet", reactor: "power" };
function Vfx({ id }: { id: string }) {
  const m = (vfxMeta as any)[id]; if (!m) return null; const k = Math.min(5, 300 / m.w);
  return <div className="ta-vfx" style={{ width: m.w, height: m.h, zoom: undefined, transform: `translate(-50%,-50%) scale(${k})` }}><i style={{ width: m.w * m.n, height: m.h, backgroundImage: `url(/assets/cc0/vfx/${id}.png)`, animation: `ta-vfx ${m.n * m.ms}ms steps(${m.n}) forwards`, "--x": `-${m.w * m.n}px` } as any} /></div>;
}
function Bar({ label, v, max, mark, cls }: { label: string; v: number; max: number; mark?: number; cls: string }) {
  return <div className={"ta-bar " + cls}><span>{label}</span><i><b style={{ width: `${(v / max) * 100}%` }} />{mark ? <u style={{ left: `${(mark / max) * 100}%` }} /> : null}</i><em>{v}/{max}</em></div>;
}
function Game({ snap, send, msg, clear, restart, host, online }: { snap: any; send: (c: any) => void; msg: string; clear: () => void; restart: () => void; host: boolean; online: boolean }) {
  const v = snap.view; const [zoom, setZoom] = useState<{ src: string; text: string; play?: number; node?: any } | null>(null); const [flow, setFlow] = useState<{ ab: string; steps: Step[]; args: any } | null>(null); const [pick, setPick] = useState<number[]>([]);
  const name = (seat: number) => snap.players.find((p: any) => p.playerId === snap.seats[seat])?.name ?? `座位${seat + 1}`;
  const me = v.players[v.you]; const myTurn = v.waiting.includes(v.you); const q = v.question;
  useEffect(() => { setFlow(null); setPick([]); }, [v.phase, v.round, q?.q]);
  useEffect(() => { if (msg) { const t = setTimeout(clear, 3000); return () => clearTimeout(t); } }, [msg]);
  useEffect(() => { music(v.phase === "over" ? null : v.oxygen <= 6 ? "urgent" : v.phase === "vote" ? "pulse" : "transmission"); if (v.phase === "over") sfx(v.winner === "crew" ? "victory" : "sabotage"); }, [v.phase, v.oxygen <= 6]);
  const lastT = v.revealed[v.revealed.length - 1]; const count = v.revealed.length;
  useEffect(() => { if (count) sfx(["airlock", "explosion", "panic", "reactor", "backstab", "brawl"].includes(lastT) ? "sabotage" : lastT?.includes("repair") ? "repair" : "reveal"); }, [count]);
  useEffect(() => { if (myTurn) sfx("commit"); }, [myTurn]);
  const [show, setShow] = useState<{ id: number; type: string } | null>(null);
  useEffect(() => { if (!count || v.phase !== "resolve") return; const id = Date.now(); setShow({ id, type: lastT }); const t = setTimeout(() => setShow((x) => (x?.id === id ? null : x)), 2000); return () => clearTimeout(t); }, [count]);
  const [hit, setHit] = useState<{ id: number; who: string; w: string } | null>(null);
  const seen = useRef<string[]>(v.players.map((p: any) => p.wounds.join()));
  useEffect(() => { v.players.forEach((p: any, i: number) => { const w = p.wounds.join(); if (w !== seen.current[i] && p.wounds.length > seen.current[i].split(",").filter(Boolean).length) { const id = Date.now() + i; const w2 = p.wounds[p.wounds.length - 1], who = name(p.seat), d = v.phase === "resolve" ? 1500 : 0; setTimeout(() => { setShow(null); setHit({ id, who, w: w2 }); sfx("sabotage"); setTimeout(() => setHit((x) => (x?.id === id ? null : x)), 3200); }, d); } seen.current[i] = w; }); }, [v.players]);
  const [mute, setM] = useState(muted());
  const exiled = v.players.filter((p: any) => p.exiled).length; const [door, setDoor] = useState(false); const prevEx = useRef(exiled);
  useEffect(() => { if (exiled > prevEx.current) { setDoor(true); sfx("sabotage"); setTimeout(() => setDoor(false), 2600); } prevEx.current = exiled; }, [exiled]);
  const [banner, setBanner] = useState("");
  useEffect(() => { if (v.phase === "setup") return; setBanner(v.phase === "over" ? (v.winner === "crew" ? "飞船得救" : "内鬼胜利") : PHASE[v.phase]); const t = setTimeout(() => setBanner(""), v.phase === "over" ? 2200 : 1100); return () => clearTimeout(t); }, [v.phase]);
  const [gun, setGun] = useState(false); const [fly, setFly] = useState<{ id: number; t: string; c: string }[]>([]); const [hurt, setHurt] = useState(0); const [help, setHelp] = useState(false);
  const prevR = useRef({ o: v.oxygen, e: v.energy, w: v.players.reduce((n: number, p: any) => n + p.wounds.length, 0) });
  useEffect(() => { const w = v.players.reduce((n: number, p: any) => n + p.wounds.length, 0), r = prevR.current, add: { id: number; t: string; c: string }[] = []; const id = Date.now();
    if (v.oxygen !== r.o) add.push({ id, t: `氧气 ${v.oxygen > r.o ? "+" : ""}${v.oxygen - r.o}`, c: "#7fdcf2" }); if (v.energy !== r.e) add.push({ id: id + 1, t: `能量 ${v.energy > r.e ? "+" : ""}${v.energy - r.e}`, c: "#c6e860" });
    if (w > r.w) setHurt(id); prevR.current = { o: v.oxygen, e: v.energy, w }; if (add.length) { setFly((f) => [...f, ...add]); setTimeout(() => setFly((f) => f.filter((x) => !add.includes(x))), 1500); } }, [v.oxygen, v.energy, v.players]);
  useEffect(() => { if (v.phase === "vote") { setGun(true); const t = setTimeout(() => setGun(false), 1300); return () => clearTimeout(t); } }, [v.phase]);
  const acting = v.phase === "action" && myTurn && !q;
  const abilities: string[] = me.character ? CHARACTERS[me.character].ab : [];
  const step = flow?.steps[Object.keys(flow.args).filter((k) => k !== "_").length];
  const put = (key: string, val: any) => { const args = { ...flow!.args, [key]: val }; const steps = key === "ab" ? [flow!.steps[0], ...ABILITIES[val].steps] : flow!.steps; flow!.steps = steps; const left = steps.slice(Object.keys(args).length); if (!left.length) { send({ t: "ability", ab: flow!.ab, args }); setFlow(null); setPick([]); } else setFlow({ ...flow!, args }); };
  const hint = useMemo(() => { if (v.phase === "over") return v.winner === "crew" ? "船员修复了飞船" : "内鬼得逞了"; if (q) return "需要你决定"; if (myTurn) return v.phase === "accuse" ? "讨论结束后由你结束回合" : "轮到你了"; if (v.waiting.length) return "等待 " + v.waiting.map(name).join("、"); return ""; }, [v]);
  const targets = (other: boolean) => v.players.filter((p: any) => !p.killed && (!other || p.seat !== v.you));
  const cardChoice = (cards: any[], onPick: (id: number) => void) => <div className="ta-hand inline">{cards.map((c) => <button key={c.id} className="ta-card" onClick={() => onPick(c.id)}><GameCard type={c.type} /></button>)}</div>;
  const seatChoice = (list: any[], onPick: (s: number) => void) => <div className="ta-grid">{list.map((p: any) => <button key={p.seat} onClick={() => onPick(p.seat)}>{name(p.seat)}</button>)}</div>;
  function question() { if (!q) return null; const a = (value: any) => send({ t: "answer", value }); const yes = <div className="ta-grid"><button className="ta-primary" onClick={() => a(true)}>是</button><button onClick={() => a(false)}>否</button></div>;
    const skip = (t: string) => <button onClick={() => a(null)}>{t}</button>;
    let body: any = yes;
    if (["discard_down", "bloodwork", "formulate"].includes(q.q)) body = cardChoice(v.hand, a);
    if (q.q === "austere") body = <>{cardChoice(v.hand, a)}{skip("不使用")}</>;
    if (q.q === "severed") body = <div className="ta-grid">{q.data.options.map((x: string) => <button key={x} onClick={() => a(x)}>{ABILITIES[x].name}</button>)}</div>;
    if (q.q === "veto") body = <><p>揭示：{CARD_TEXT[q.data.type][0]}</p><div className="ta-grid"><button className="ta-primary" onClick={() => a(true)}>否决这张</button>{q.data.forced ? null : <button onClick={() => a(false)}>留到后面</button>}</div></>;
    if (q.q === "brawl") body = seatChoice(targets(false), a);
    if (q.q === "deflect") body = <>{seatChoice(targets(false).filter((p: any) => p.seat !== q.data.victim), a)}{skip("不转移")}</>;
    if (["contagion", "butcher", "vengeant"].includes(q.q)) body = <>{seatChoice(targets(false), a)}{skip("放弃")}</>;
    if (q.q === "rewind") body = cardChoice(q.data.cards, a);
    if (q.q === "salvage") body = <>{cardChoice(q.data.cards, (id) => { const n = pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id].slice(-2); setPick(n); })}<button className="ta-primary" onClick={() => { a(pick); setPick([]); }}>取走 {pick.length} 张</button></>;
    if (q.q === "restructure") body = <><p>先点要换走的牌，再点你的手牌。</p>{cardChoice(q.data.cards, (id) => setPick([id]))}{pick.length ? cardChoice(v.hand, (id) => { a({ out: pick[0], in: id }); setPick([]); }) : null}{skip("不交换")}</>;
    return <section className="ta-panel alert"><h3>{QUESTION[q.q] ?? "请选择"}</h3>{body}</section>; }
  function flowPanel() { if (!flow || !step) return null; const ab = ABILITIES[flow.ab];
    return <section className="ta-panel"><h3>{ab.name}</h3><p>{step.label}</p>
      {step.kind === "seat" ? seatChoice(targets(!!step.other), (s) => put(step.key, s)) : null}
      {step.kind === "card" ? cardChoice(v.hand, (id) => put(step.key, id)) : null}
      {step.kind === "two" ? <>{cardChoice(v.hand, (id) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id].slice(-2)))}<button className="ta-primary" onClick={() => put(step.key, pick)}>确定 {pick.length} 张</button></> : null}
      {step.kind === "aside" ? <>{cardChoice(v.aside, (id) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id]))}<button className="ta-primary" onClick={() => put(step.key, pick)}>打出 {pick.length} 张</button></> : null}
      {step.kind === "used" ? <div className="ta-grid">{v.roundAbilities.filter((x: string) => x !== "mimic").map((x: string) => <button key={x} onClick={() => put(step.key, x)}>{ABILITIES[x].name}</button>)}</div> : null}
      <button onClick={() => setFlow(null)}>取消</button></section>; }
  return <div className={"ta-world ta-game ph-" + (v.phase === "over" ? (v.winner === "crew" ? "win" : "lose") : v.phase) + (v.oxygen <= 6 ? " danger" : "")}>
    <header className="ta-hud"><div className="ta-top"><b>{PHASE[v.phase]}{v.round ? ` · 第 ${v.round} 回合` : ""}</b><button className="ta-mute" onClick={() => setHelp(true)}>规则</button><button className="ta-mute" onClick={() => { setMute(!mute); setM(!mute); }}>{mute ? "开声音" : "静音"}</button><span className={online ? "" : "off"}>{online ? hint : "连接中断，正在重连…"}</span></div>
      <Bar label="氧气" v={v.oxygen} max={OXYGEN_MAX} cls="o" /><Bar label="能量" v={v.energy} max={ENERGY_GOAL} mark={ENERGY_SAFE} cls="e" /></header>
    <div className="ta-table"><div className="core" style={{ "--o": `${(v.oxygen / OXYGEN_MAX) * 100}%`, "--e": `${(v.energy / ENERGY_GOAL) * 100}%` } as any}><b>{v.phase === "action" ? v.players.reduce((n: number, p: any) => n + p.played, 0) : v.remaining}</b><small>{v.phase === "action" ? "已暗置" : v.phase === "resolve" ? "待揭示" : PHASE[v.phase]}</small></div>
      {v.players.map((p: any) => { const n = v.players.length, a = ((p.seat - v.you + n) % n) / n * Math.PI * 2 + Math.PI / 2, x = 50 + 38 * Math.cos(a), y = 49 + 37 * Math.sin(a); return <button type="button" key={p.seat} style={{ left: `${x}%`, top: `${y}%` }} className={["ta-seat", v.waiting.includes(p.seat) ? "turn" : "", p.killed ? "dead" : "", p.exiled ? "exiled" : "", p.seat === v.you ? "me" : ""].join(" ")} onClick={() => setZoom({ src: "", text: "", node: <div className="ta-detail"><h3>{name(p.seat)}{p.seat === v.leader ? " · 任务领袖" : ""}</h3><p>手牌 {p.hand}　牌库 {p.deck}　本轮已出 {p.played}{p.killed ? "　已阵亡" : p.exiled ? "　已放逐" : ""}{snap.players.find((x: any) => x.playerId === snap.seats[p.seat])?.connected ? "" : "　离线"}</p>{p.agenda && p.seat !== v.you ? <p className="rev">身份：{AGENDA_TEXT[p.agenda][0]}</p> : null}{p.wounds.map((w: string, i: number) => <p key={i} className="wd">{WOUND_TEXT[w]}</p>)}{p.character ? zoomOf.char(p.character) : null}</div> })}>
        <i className="face">{p.character ? <img src={img("p_" + p.character)} alt="" /> : null}{p.seat === v.leader ? <u>★</u> : null}{p.played ? <s>{p.played}</s> : null}</i><b>{name(p.seat)}</b><small>手{p.hand} 库{p.deck}{p.wounds.length ? <em> 伤{p.wounds.length}</em> : null}</small>{p.agenda && p.seat !== v.you ? <small className="rev">{AGENDA_TEXT[p.agenda][0].split("（")[0]}</small> : null}{p.exiled ? <small className="rev">放逐</small> : p.killed ? <small className="rev">阵亡</small> : null}</button>; })}</div>
    <main className="ta-main">
      {host ? v.waiting.map((w: number) => { const pl = snap.players.find((p: any) => p.playerId === snap.seats[w]); return pl && !pl.connected ? <button key={w} className="ta-danger" onClick={() => send({ t: "auto", player: pl.playerId })}>{pl.name} 已离线，代为操作</button> : null; }) : null}
      {msg ? <p className="ta-err">{msg}</p> : null}
      {v.phase === "setup" ? <section className="ta-panel"><h3>你的身份：<a onClick={() => setZoom({ src: "", text: "", node: zoomOf.agenda(v.agenda) })}>{AGENDA_TEXT[v.agenda][0]}</a></h3>{v.choices.length ? <div className="ta-chars">{v.choices.map((c: string) => <figure key={c}><div className="ta-pick" onClick={() => setZoom({ src: "", text: "", node: zoomOf.char(c) })}>{zoomOf.char(c)}</div><button className="ta-primary" onClick={() => send({ t: "choose", name: c })}>选 {CHAR_NAME[c]}</button></figure>)}</div> : <p>等待其他玩家选角色…</p>}</section> : null}
      {question()}{flowPanel()}
      {v.phase === "resolve" || (v.phase === "accuse" && v.revealed.length) ? <section className="ta-panel"><h3>已揭示 · 还剩 {v.remaining} 张</h3><div className="ta-hand inline">{v.revealed.map((t: string, i: number) => <button key={i} className="ta-card flip" onClick={() => setZoom({ src: img(t), text: CARD_TEXT[t].join("：") })}><GameCard type={t} /></button>)}</div></section> : null}
      {v.phase === "resolve" && !q && v.leader === v.you ? <button className="ta-primary" onClick={() => send({ t: "reveal" })}>揭示下一张（还剩 {v.remaining}）</button> : null}
      {acting && !flow ? <section className="ta-panel"><h3>选择一项行动</h3><div className="ta-grid"><button onClick={() => send({ t: "draw" })}>抽一张牌</button><button onClick={() => send({ t: "pass" })}>无可行动时跳过</button></div>
        {me.exiled ? null : <div className="ta-abs">{abilities.map((a) => { const m = ABILITIES[a]; const used = me.used.includes(a); return <button key={a} disabled={used} onClick={() => m.steps.length ? setFlow({ ab: a, steps: m.steps, args: {} }) : send({ t: "ability", ab: a, args: {} })}><b>{m.name}{m.cost ? ` · ${m.cost}` : ""}</b><small>{m.text}</small></button>; })}</div>}</section> : null}
      {v.phase === "accuse" && !q ? <section className="ta-panel"><h3>语音讨论</h3><p>可以开枪发起放逐投票，发起后不能撤回。</p><div className="ta-grid">{!me.killed && !me.exiled ? <button className="ta-danger" onClick={() => send({ t: "call_vote" })}>拿起手枪</button> : null}{v.leader === v.you ? <button className="ta-primary" onClick={() => send({ t: "end_accuse" })}>结束本回合</button> : null}</div></section> : null}
      {v.phase === "vote" ? <section className="ta-panel alert"><h3>放逐投票 · 已投 {v.voted}</h3>{myTurn ? <>{seatChoice(v.players.filter((p: any) => !p.killed && !p.exiled && p.seat !== v.you), (s) => send({ t: "vote", target: s }))}<button onClick={() => send({ t: "vote", target: null })}>弃权</button></> : <p>等待其他人投票…</p>}</section> : null}
      
      {v.notes?.length ? <details className="ta-log"><summary>私密记录</summary>{v.notes.map((n: string, i: number) => <p key={i}>{zh(n)}</p>)}</details> : null}
      <details className="ta-log"><summary>航行日志</summary>{[...v.log].reverse().map((l: string, i: number) => <p key={i}>{zh(l)}</p>)}</details>
    </main>
    {v.agenda && v.phase !== "setup" ? <button className="ta-id" onClick={() => setZoom({ src: "", text: "", node: zoomOf.agenda(v.agenda) })}>身份</button> : null}
    {v.hand?.length && v.phase !== "setup" ? <nav className="ta-hand">{v.hand.map((c: any) => <button key={c.id} className="ta-card" onClick={() => setZoom({ src: img(c.type), text: CARD_TEXT[c.type].join("：\n"), play: acting ? c.id : undefined })}><GameCard type={c.type} /></button>)}</nav> : null}
    {gun ? <div className="ta-gun"><svg viewBox="0 0 200 120"><path d="M8 28h150l14 12v16H92l-10 12-8 44H34l10-52H8z" fill="#2c332c" stroke="#000" strokeWidth="5"/><path d="M8 28h150v10H8z" fill="#6f8350"/><rect x="150" y="44" width="46" height="9" fill="#e0a92a" stroke="#000" strokeWidth="3"/></svg></div> : null}
    {show ? <div key={show.id} className="ta-stage" onClick={() => setShow(null)}><div className="card"><GameCard type={show.type} /></div><Vfx id={CARD_FX[show.type]} />{fly.map((x) => <b key={x.id} style={{ color: x.c }}>{x.t}</b>)}</div> : null}
    {hit ? <div key={hit.id} className="ta-hit"><Vfx id="blood" /><small>{hit.who} 受伤，抽取伤害牌…</small><div className="wc"><i className="back">伤害报告</i><div className="face">{zoomOf.wound(hit.w)}</div></div></div> : null}
    {hurt ? <div key={hurt} className="ta-hurt" /> : null}
    <div className="ta-fly">{show ? null : fly.map((x) => <b key={x.id} style={{ color: x.c }}>{x.t}</b>)}</div>
    {help ? <div className="ta-zoom" onClick={() => setHelp(false)}><Rules /></div> : null}
    {v.phase === "over" ? <div className={"ta-end " + (v.winner === "crew" ? "win" : "lose")}><div className="fx">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * .35}s` }} />)}</div>
      <small>{v.winner === "crew" ? "ISV-警戒号 · 引擎重启" : "ISV-警戒号 · 生命维持终止"}</small><h1>{v.winner === "crew" ? "劫后余生" : "全员窒息"}</h1><p className="why">{v.winner === "crew" ? (v.energy >= ENERGY_GOAL ? `能量充满，氧气仅剩 ${v.oxygen} 格。你们活下来了。` : "内鬼全部伏诛，飞船脱离危险。") : (v.oxygen === 0 ? "最后一口氧气耗尽，内鬼的计划得逞。" : "船员无一生还，飞船落入内鬼之手。")}</p>
      <p className={"mine " + (v.winners.includes(v.you) ? "yes" : "no")}>{v.winners.includes(v.you) ? "你赢了" : "你输了"}</p>
      <ul>{v.players.map((p: any, i: number) => <li key={p.seat} style={{ animationDelay: `${1.2 + i * .35}s` }} className={v.winners.includes(p.seat) ? "w" : ""}>{p.character ? <img src={img("p_" + p.character)} alt="" /> : null}<span><b>{name(p.seat)}</b><small>{AGENDA_TEXT[p.agenda][0]}{p.killed ? " · 阵亡" : p.exiled ? " · 被放逐" : ""}</small></span><em>{v.winners.includes(p.seat) ? "胜" : "败"}</em></li>)}</ul>
      {host ? <button className="ta-primary" onClick={restart}>再来一局</button> : <p className="why">等待房主开始下一局</p>}</div> : null}
    {door ? <div className="ta-door"><i /><i /><b>舱门关闭</b></div> : null}
    {banner ? <div key={banner} className={"ta-banner b-" + v.phase}><b>{banner}</b></div> : null}
    {zoom ? <div className="ta-zoom" onClick={() => setZoom(null)}>{zoom.node ? <div className="ta-big">{zoom.node}</div> : CARD_TEXT[zoom.src.split("/").pop()!.replace(".webp", "")] ? <div className="ta-big"><GameCard type={zoom.src.split("/").pop()!.replace(".webp", "")} /></div> : <img src={zoom.src} alt="" />}{zoom.node ? null : <p>{zoom.text}</p>}{zoom.play !== undefined ? <button className="ta-primary" onClick={() => send({ t: "play", card: zoom.play })}>暗置打出</button> : null}</div> : null}
  </div>;
}
