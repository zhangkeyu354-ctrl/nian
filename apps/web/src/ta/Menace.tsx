import { useEffect, useMemo, useRef, useState } from "react";
import { createTARoom, savedName, useTARoom } from "./ta-net.ts";
import { ABILITIES, AGENDA_TEXT, CARD_TEXT, CHAR_NAME, QUESTION, WOUND_TEXT, zh, type Step } from "./text.ts";
import { CHARACTERS, ENERGY_GOAL, ENERGY_SAFE, OXYGEN_MAX } from "../../../../packages/menace/src/data.ts";
import "./ta.css";
import { music, sfx, setMute, muted } from "./sound.ts";
const img = (n: string) => `/assets/menace/${n}.webp`;
const PHASE: Record<string, string> = { setup: "选择角色", action: "行动阶段", resolve: "匿名结算", accuse: "讨论与指控", vote: "放逐投票", over: "对局结束" };
export function Menace() {
  const q = new URLSearchParams(location.search); const code = q.get("room")?.toUpperCase();
  if (!code) return <Entry />;
  return <Room code={code} />;
}
function Entry() {
  const [code, setCode] = useState(""); const [err, setErr] = useState("");
  const go = (c: string) => { const u = new URL(location.href); u.searchParams.set("room", c); location.href = u.toString(); };
  return <div className="ta-world ta-entry"><h1>我们之中的威胁</h1><p>ISV-VIGILANT 失去动力，氧气正在流失。修好飞船，或者让所有人窒息。</p>
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
  if (s.stage === "lobby") return <div className="ta-world ta-entry"><h2>房间 {code}</h2><p>把房间号发给朋友，需要 4–8 人。</p><ul className="ta-list">{s.players.map((p: any) => <li key={p.playerId}>{p.name}{p.host ? "（房主）" : ""}{p.connected ? "" : " · 离线"}</li>)}</ul>
    {host ? <><div className="ta-row"><button className={s.mode === "basic" ? "on" : ""} onClick={() => r.lobby({ type: "SET_MODE", mode: "basic" })}>基础模式</button><button className={s.mode === "advanced" ? "on" : ""} onClick={() => r.lobby({ type: "SET_MODE", mode: "advanced" })}>进阶模式</button></div><button className="ta-primary" onClick={async () => setMsg((await r.lobby({ type: "START" })) ?? "")}>开始（{s.players.length} 人）</button></> : <p>{s.mode === "basic" ? "基础模式" : "进阶模式"}，等待房主开始。</p>}<p className="ta-err">{msg}</p></div>;
  return <Game snap={s} send={async (c) => setMsg((await r.command(c)) ?? "")} msg={msg} clear={() => setMsg("")} restart={() => r.lobby({ type: "START" })} host={host} online={r.connected} />;
}
function Bar({ label, v, max, mark, cls }: { label: string; v: number; max: number; mark?: number; cls: string }) {
  return <div className={"ta-bar " + cls}><span>{label}</span><i><b style={{ width: `${(v / max) * 100}%` }} />{mark ? <u style={{ left: `${(mark / max) * 100}%` }} /> : null}</i><em>{v}/{max}</em></div>;
}
function Game({ snap, send, msg, clear, restart, host, online }: { snap: any; send: (c: any) => void; msg: string; clear: () => void; restart: () => void; host: boolean; online: boolean }) {
  const v = snap.view; const [zoom, setZoom] = useState<{ src: string; text: string; play?: number } | null>(null); const [flow, setFlow] = useState<{ ab: string; steps: Step[]; args: any } | null>(null); const [pick, setPick] = useState<number[]>([]);
  const name = (seat: number) => snap.players.find((p: any) => p.playerId === snap.seats[seat])?.name ?? `座位${seat + 1}`;
  const me = v.players[v.you]; const myTurn = v.waiting.includes(v.you); const q = v.question;
  useEffect(() => { setFlow(null); setPick([]); }, [v.phase, v.round, q?.q]);
  useEffect(() => { if (msg) { const t = setTimeout(clear, 3000); return () => clearTimeout(t); } }, [msg]);
  useEffect(() => { music(v.phase === "over" ? null : v.oxygen <= 6 ? "urgent" : v.phase === "vote" ? "pulse" : "transmission"); if (v.phase === "over") sfx(v.winner === "crew" ? "victory" : "sabotage"); }, [v.phase, v.oxygen <= 6]);
  const lastT = v.revealed[v.revealed.length - 1]; const count = v.revealed.length;
  useEffect(() => { if (count) sfx(["airlock", "explosion", "panic", "reactor", "backstab", "brawl"].includes(lastT) ? "sabotage" : lastT?.includes("repair") ? "repair" : "reveal"); }, [count]);
  useEffect(() => { if (myTurn) sfx("commit"); }, [myTurn]);
  const [mute, setM] = useState(muted());
  const exiled = v.players.filter((p: any) => p.exiled).length; const [door, setDoor] = useState(false); const prevEx = useRef(exiled);
  useEffect(() => { if (exiled > prevEx.current) { setDoor(true); sfx("sabotage"); setTimeout(() => setDoor(false), 2600); } prevEx.current = exiled; }, [exiled]);
  const [banner, setBanner] = useState("");
  useEffect(() => { if (v.phase === "setup") return; setBanner(v.phase === "over" ? (v.winner === "crew" ? "飞船得救" : "内鬼胜利") : PHASE[v.phase]); const t = setTimeout(() => setBanner(""), v.phase === "over" ? 2200 : 1100); return () => clearTimeout(t); }, [v.phase]);
  const acting = v.phase === "action" && myTurn && !q;
  const abilities: string[] = me.character ? CHARACTERS[me.character].ab : [];
  const step = flow?.steps[Object.keys(flow.args).filter((k) => k !== "_").length];
  const put = (key: string, val: any) => { const args = { ...flow!.args, [key]: val }; const steps = key === "ab" ? [flow!.steps[0], ...ABILITIES[val].steps] : flow!.steps; flow!.steps = steps; const left = steps.slice(Object.keys(args).length); if (!left.length) { send({ t: "ability", ab: flow!.ab, args }); setFlow(null); setPick([]); } else setFlow({ ...flow!, args }); };
  const hint = useMemo(() => { if (v.phase === "over") return v.winner === "crew" ? "船员修复了飞船" : "内鬼得逞了"; if (q) return "需要你决定"; if (myTurn) return v.phase === "accuse" ? "讨论结束后由你结束回合" : "轮到你了"; if (v.waiting.length) return "等待 " + v.waiting.map(name).join("、"); return ""; }, [v]);
  const targets = (other: boolean) => v.players.filter((p: any) => !p.killed && (!other || p.seat !== v.you));
  const cardChoice = (cards: any[], onPick: (id: number) => void) => <div className="ta-hand inline">{cards.map((c) => <button key={c.id} className="ta-card" onClick={() => onPick(c.id)}><img src={img(c.type)} alt={CARD_TEXT[c.type]?.[0]} /></button>)}</div>;
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
    <header className="ta-hud"><div className="ta-top"><b>{PHASE[v.phase]}{v.round ? ` · 第 ${v.round} 回合` : ""}</b><button className="ta-mute" onClick={() => { setMute(!mute); setM(!mute); }}>{mute ? "开声音" : "静音"}</button><span className={online ? "" : "off"}>{online ? hint : "连接中断，正在重连…"}</span></div>
      <Bar label="氧气" v={v.oxygen} max={OXYGEN_MAX} cls="o" /><Bar label="能量" v={v.energy} max={ENERGY_GOAL} mark={ENERGY_SAFE} cls="e" /></header>
    <ul className="ta-seats">{v.players.map((p: any) => <li key={p.seat} className={[v.waiting.includes(p.seat) ? "turn" : "", p.killed ? "dead" : "", p.exiled ? "exiled" : "", p.seat === v.you ? "me" : ""].join(" ")} onClick={() => p.character && setZoom({ src: img("c_" + p.character), text: CHAR_NAME[p.character] })}>
      <b>{name(p.seat)}{p.seat === v.leader ? " ★" : ""}</b><small>{p.character ? CHAR_NAME[p.character] : "选择中"}</small><small>手{p.hand} 库{p.deck}{p.played ? ` · 已出${p.played}` : ""}{p.wounds.length ? ` · 伤${p.wounds.length}` : ""}</small>{p.agenda && p.seat !== v.you ? <small className="rev">{AGENDA_TEXT[p.agenda][0]}</small> : null}{p.wounds.map((w: string, i: number) => <em key={i} onClick={(e) => { e.stopPropagation(); setZoom({ src: img("w_" + w), text: WOUND_TEXT[w] }); }}>{WOUND_TEXT[w].split("：")[0]}</em>)}</li>)}</ul>
    <main className="ta-main">
      {msg ? <p className="ta-err">{msg}</p> : null}
      {v.phase === "setup" ? <section className="ta-panel"><h3>你的身份：<a onClick={() => setZoom({ src: img(v.agenda), text: AGENDA_TEXT[v.agenda].join("\n") })}>{AGENDA_TEXT[v.agenda][0]}</a></h3>{v.choices.length ? <div className="ta-chars">{v.choices.map((c: string) => <figure key={c}><img src={img("c_" + c)} alt={CHAR_NAME[c]} onClick={() => setZoom({ src: img("c_" + c), text: CHAR_NAME[c] })} /><button className="ta-primary" onClick={() => send({ t: "choose", name: c })}>选 {CHAR_NAME[c]}</button></figure>)}</div> : <p>等待其他玩家选角色…</p>}</section> : null}
      {question()}{flowPanel()}
      {v.phase === "resolve" || v.revealed.length ? <section className="ta-panel"><h3>已揭示 · 还剩 {v.remaining} 张</h3><div className="ta-hand inline">{v.revealed.map((t: string, i: number) => <button key={i} className="ta-card flip" onClick={() => setZoom({ src: img(t), text: CARD_TEXT[t].join("：") })}><img src={img(t)} alt={CARD_TEXT[t][0]} /></button>)}</div></section> : null}
      {v.phase === "resolve" && !q && v.leader === v.you ? <button className="ta-primary" onClick={() => send({ t: "reveal" })}>揭示下一张（还剩 {v.remaining}）</button> : null}
      {acting && !flow ? <section className="ta-panel"><h3>选择一项行动</h3><div className="ta-grid"><button onClick={() => send({ t: "draw" })}>抽一张牌</button><button onClick={() => send({ t: "pass" })}>无可行动时跳过</button></div>
        {me.exiled ? null : <div className="ta-abs">{abilities.map((a) => { const m = ABILITIES[a]; const used = me.used.includes(a); return <button key={a} disabled={used} onClick={() => m.steps.length ? setFlow({ ab: a, steps: m.steps, args: {} }) : send({ t: "ability", ab: a, args: {} })}><b>{m.name}{m.cost ? ` · ${m.cost}` : ""}</b><small>{m.text}</small></button>; })}</div>}</section> : null}
      {v.phase === "accuse" && !q ? <section className="ta-panel"><h3>语音讨论</h3><p>可以开枪发起放逐投票，发起后不能撤回。</p><div className="ta-grid">{!me.killed && !me.exiled ? <button className="ta-danger" onClick={() => send({ t: "call_vote" })}>拿起手枪</button> : null}{v.leader === v.you ? <button className="ta-primary" onClick={() => send({ t: "end_accuse" })}>结束本回合</button> : null}</div></section> : null}
      {v.phase === "vote" ? <section className="ta-panel alert"><h3>放逐投票 · 已投 {v.voted}</h3>{myTurn ? <>{seatChoice(v.players.filter((p: any) => !p.killed && !p.exiled && p.seat !== v.you), (s) => send({ t: "vote", target: s }))}<button onClick={() => send({ t: "vote", target: null })}>弃权</button></> : <p>等待其他人投票…</p>}</section> : null}
      {v.phase === "over" ? <section className="ta-panel"><h2>{v.winner === "crew" ? "飞船得救" : "内鬼胜利"}</h2><p>获胜：{v.winners.map(name).join("、") || "无人"}</p><ul className="ta-list">{v.players.map((p: any) => <li key={p.seat}>{name(p.seat)}：{AGENDA_TEXT[p.agenda][0]}</li>)}</ul>{host ? <button className="ta-primary" onClick={restart}>再来一局</button> : null}</section> : null}
      {v.notes?.length ? <details className="ta-log"><summary>私密记录</summary>{v.notes.map((n: string, i: number) => <p key={i}>{zh(n)}</p>)}</details> : null}
      <details className="ta-log"><summary>航行日志</summary>{[...v.log].reverse().map((l: string, i: number) => <p key={i}>{zh(l)}</p>)}</details>
    </main>
    {v.agenda && v.phase !== "setup" ? <button className="ta-id" onClick={() => setZoom({ src: img(v.agenda), text: AGENDA_TEXT[v.agenda].join("\n") })}>身份</button> : null}
    {v.hand?.length && v.phase !== "setup" ? <nav className="ta-hand">{v.hand.map((c: any) => <button key={c.id} className="ta-card" onClick={() => setZoom({ src: img(c.type), text: CARD_TEXT[c.type].join("：\n"), play: acting ? c.id : undefined })}><img src={img(c.type)} alt={CARD_TEXT[c.type][0]} /></button>)}</nav> : null}
    {door ? <div className="ta-door"><i /><i /><b>舱门关闭</b></div> : null}
    {banner ? <div key={banner} className={"ta-banner b-" + v.phase}><b>{banner}</b></div> : null}
    {zoom ? <div className="ta-zoom" onClick={() => setZoom(null)}>{zoom.src.includes("w_frenzied") ? null : <img src={zoom.src} alt="" />}<p>{zoom.text}</p>{zoom.play !== undefined ? <button className="ta-primary" onClick={() => send({ t: "play", card: zoom.play })}>暗置打出</button> : null}</div> : null}
  </div>;
}
