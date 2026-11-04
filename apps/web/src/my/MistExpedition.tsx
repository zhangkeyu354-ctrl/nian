import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import DiceRaw from "react-dice-complete";
import { tsParticles } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";
import gsap from "gsap";
import confetti from "canvas-confetti";
import "./my.css";
const sock = io({ transports: ["websocket", "polling"] });
const call = (ev: string, a?: any) => new Promise<any>((ok) => sock.timeout(8000).emit(ev, a ?? {}, (e: any, r: any) => ok(e ? { ok: false, error: "连接超时，请检查网络" } : r)));
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 隐私模式 */ } };
const sfx = (n: string) => { if (get("my-mute") === "1") return; try { const a = new Audio(`/assets/mist-expedition/audio/${n}.mp3`); a.volume = .6; void a.play().catch(() => {}); } catch { /* 无声继续 */ } };
const bgm = new Audio(); bgm.loop = true; bgm.volume = .3; let want = "";
const playBgm = (n: string) => { if (get("my-mute") === "1" || !n) { bgm.pause(); return; } if (want !== n) { want = n; bgm.src = `/assets/mist-expedition/audio/bgm-${n}.mp3`; } void bgm.play().catch(() => {}); };
const I = ({ n }: { n: string }) => <img className="my-ic" src={`/assets/mist-expedition/icons/${n}.svg`} alt="" />;
const CI: any = { 刚: "gang", 影: "ying", 智: "zhi", 言: "yan" };
const ReactDice: any = (DiceRaw as any).default ?? DiceRaw;
let engineReady: Promise<void> | null = null;
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const EMBERS: any = { fullScreen: { enable: false }, fpsLimit: 30, detectRetina: false, background: { color: "transparent" }, particles: { number: { value: 16 }, color: { value: ["#ffc46b", "#ff9a4d", "#dfe7ea"] }, opacity: { value: { min: .15, max: .7 }, animation: { enable: true, speed: .6 } }, size: { value: { min: 1, max: 2.6 } }, move: { enable: true, speed: { min: .2, max: .8 }, direction: "top", random: true, straight: false, outModes: "out" } } };
function Embers() { const id = useRef("my-embers-" + Math.random().toString(36).slice(2)).current; useEffect(() => { if (reduced()) return; let dead = false, c: any; (engineReady ??= Promise.resolve(loadSlim(tsParticles))).then(() => tsParticles.load({ id, options: EMBERS })).then((x: any) => { c = x; if (dead) c?.destroy(); }).catch(() => {}); return () => { dead = true; c?.destroy(); }; }, [id]); return <div id={id} className="my-embers" />; }
function Dice3D({ values }: { values: number[] }) { const r = useRef<any>(null); useEffect(() => { const t = setTimeout(() => r.current?.rollAll(values), 60); return () => clearTimeout(t); }, [values.join()]); return <div className="my-dice"><ReactDice ref={r} numDice={values.length} defaultRoll={1} dieSize={54} faceColor="#e9dfc7" dotColor="#2a2118" outline outlineColor="#7a5a2a" rollTime={1.1} disableIndividual rollDone={() => {}} /></div>; }
function Trail({ idx }: { idx: number }) { return <div className="my-trail" aria-label={`第 ${idx + 1} 场`}>{[0, 1, 2, 3].map((i) => <span key={i} className={i < idx ? "done" : i === idx ? "now" : ""}><img src={`/assets/mist-expedition/icons/n${i}.svg`} alt="" /></span>)}</div>; }
const ACT = ["第一幕", "第二幕", "第三幕", "终幕"];
function Cinematic({ art, kicker, title, tone, onDone }: any) {
  const r = useRef<HTMLDivElement>(null);
  useEffect(() => { const q = gsap.utils.selector(r); const tl = gsap.timeline({ onComplete: onDone });
    tl.from(r.current, { opacity: 0, duration: .35 }).from(q("img"), { scale: 1.45, y: 50, duration: 3.2, ease: "power2.out" }, 0)
      .from(q(".bar"), { scaleY: 0, duration: .5, ease: "power3.out" }, .05).from(q("small"), { opacity: 0, y: 12, duration: .5 }, .55)
      .from(q("h1"), { opacity: 0, scale: 1.7, letterSpacing: "0.5em", duration: .8, ease: "power4.out" }, .8).to(r.current, { opacity: 0, duration: .4 }, 2.9);
    if (tone === "bad") tl.to(q("img"), { x: "+=10", yoyo: true, repeat: 7, duration: .05 }, .8);
    return () => { tl.kill(); }; }, []);
  return <div ref={r} className={`my-cine ${tone}`} onClick={onDone} data-testid="my-cine"><img src={art} alt="" /><i className="bar t" /><i className="bar b" /><div><small>{kicker}</small><h1>{title}</h1></div></div>;
}
const STEP: any = { COUNCIL: "营地议事", FORK: "岔路抉择", PLAN: "商量方案", CONTRIBUTE: "暗中出力", ROLL: "掷骰", FLASHBACK: "闪回窗口" };
export function MistExpedition() {
  const q = new URLSearchParams(location.search); const [code, setCode] = useState(q.get("room")?.toUpperCase() ?? "");
  const [name, setName] = useState(get("my-name") ?? ""); const [v, setV] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [now, setNow] = useState(Date.now());
  useEffect(() => { sock.on("my:state", setV); const t = setInterval(() => setNow(Date.now()), 500); const rejoin = () => { const c = new URLSearchParams(location.search).get("room")?.toUpperCase(); const tk = c && get("my-seat-" + c); if (tk) call("my:join", { code: c, token: tk }).then((r) => r.ok && setV(r.snapshot)); }; sock.on("connect", rejoin); if (sock.connected) rejoin(); return () => { sock.off("my:state", setV); sock.off("connect", rejoin); clearInterval(t); }; }, []);
  const [cine, setCine] = useState<any>(null); const seen = useRef("");
  useEffect(() => { if (!v?.started || reduced()) return; const bg = (v.bossView?.art ?? (v.sceneInfo?.id === "s06" ? "boss-giant" : v.sceneInfo?.id)); const art = v.ending ? `/assets/mist-expedition/endings/${v.ending.toLowerCase()}.webp` : `/assets/mist-expedition/scenes/${bg}.webp`; const scene = v.ending ? "end" + v.ending : v.bossView ? "boss" + v.bossView.enraged : "s" + v.sceneIdx; if (seen.current === scene) return; seen.current = scene; setCine(v.ending ? { art, kicker: "终章", title: v.endingInfo.title, tone: v.ending === "E02" ? "bad" : "good" } : v.bossView ? { art, kicker: v.bossView.enraged ? "狂暴！" : "决战", title: v.bossView.name, tone: "bad" } : { art, kicker: ACT[v.sceneIdx], title: v.sceneInfo.title, tone: "" }); }, [v?.sceneIdx, v?.ending, v?.started, v?.bossView?.enraged, !!v?.bossView]);
  const key = v?.started ? `${v.sceneIdx}|${v.phase}|${v.ending ?? ""}` : "";
  useEffect(() => { if (!key) return; if (v.ending) { if (v.ending !== "E02" && !reduced()) confetti({ particleCount: 120, spread: 80, origin: { y: .35 }, colors: ["#d9b45b", "#fff3c9", "#8fc7c0"], disableForReducedMotion: true }); return sfx(v.ending === "E02" ? "lose" : "win"); } if (v.phase === "PLAN") sfx("scene"); if (v.phase === "ROLL") { sfx("shuffle"); (v.reveal ?? []).forEach((_: any, i: number) => setTimeout(() => sfx("card"), i * 1000)); } if (v.phase === "FLASHBACK") sfx(v.roll?.panic ? "panic" : "dice"); }, [key]);
  const track = !v?.started ? "" : v.ending ? (v.ending === "E02" ? "tense" : "win") : v.bossView ? "final" : v.doom >= 6 || ["CONTRIBUTE", "ROLL", "FLASHBACK"].includes(v.phase) ? "tense" : "explore";
  useEffect(() => { playBgm(track); const f = () => playBgm(track); addEventListener("pointerdown", f); return () => removeEventListener("pointerdown", f); }, [track]);
  const join = async (c: string) => { set("my-name", name); const r = await call("my:join", { code: c, name, token: get("my-seat-" + c) }); if (!r.ok) return setErr(r.error); set("my-seat-" + c, r.token); history.replaceState(null, "", "/?game=my&room=" + c); setV(r.snapshot); };
  const create = async () => { const r = await call("my:create"); if (!r.ok) return setErr(r.error); setCode(r.code); join(r.code); };
  const cmd = async (c: any) => { if (busy) return; sfx("click"); setBusy(true); const r = await call("my:cmd", c); setBusy(false); setErr(r.ok ? "" : r.error); };
  if (!v) return <div className="my-world"><img className="my-cover" src="/assets/mist-expedition/cover.webp" alt="" /><h1>迷雾远征</h1><p>夺回圣物。提防身边的人。</p><input data-testid="my-name" placeholder="你的名字" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />{code ? <button data-testid="my-join" onClick={() => join(code)}>加入房间 {code}</button> : <><button data-testid="my-create" onClick={create}>创建房间</button><input placeholder="房间码" onChange={(e) => setCode(e.target.value.toUpperCase())} /></>}<Err m={err} /></div>;
  if (!v.started) return <div className="my-world"><h1>房间 {v.code}</h1><p>把网址发给朋友。{v.names.length} / 8 人</p><ul>{v.names.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>{v.host ? <button data-testid="my-start" disabled={v.names.length < 3} onClick={async () => { const r = await call("my:start"); if (!r.ok) setErr(r.error); }}>{v.names.length < 3 ? "至少 3 人" : "开始冒险"}</button> : <p>等待房主开始…</p>}<Err m={err} /></div>;
  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - (now + 0)) / 1000)) : 0; const me = v.players[v.me]; const actor = v.actor === v.me; const dn = (s: number) => v.names[s];
  const fx = `my-world my-ph-${v.phase}${v.roll?.panic && v.phase === "FLASHBACK" ? " my-shake" : ""}${v.doom >= 6 ? " my-danger" : ""}`;
  return <div className={fx}>
    {cine && <Cinematic {...cine} onDone={() => setCine(null)} />}
    <header className="my-top"><b>第 {v.sceneIdx + 1}/4 场</b><span data-testid="my-doom"><I n="doom" />{v.doom}/8</span><span><I n="supplies" />{v.supplies}</span><span><I n="clues" />{v.clues}</span><span><I n="omen" />{v.omen}</span><button className="my-mute" aria-label="音效开关" onClick={() => { set("my-mute", get("my-mute") === "1" ? "0" : "1"); playBgm(track); setNow(Date.now()); }}>{get("my-mute") === "1" ? "🔇" : "🔊"}</button>{left > 0 && <span>⏱{left}</span>}</header>
    {v.ending ? <End v={v} dn={dn} /> : <>
      <div className="my-stage" key={v.sceneInfo.id}><img className="my-art" src={`/assets/mist-expedition/scenes/${v.bossView?.art ?? (v.sceneInfo.id === "s06" ? "boss-giant" : v.sceneInfo.id)}.webp`} alt="" /><i className="my-glow" /><Embers /><i className="my-fog" /><i className="my-fog b" /></div><Trail idx={v.sceneIdx} /><Party v={v} dn={dn} />{v.bossView && <section className="my-boss" data-testid="my-boss"><b>{v.bossView.name}</b>（第 {v.bossView.round}/3 回合）<i><u key={v.bossView.hp} style={{ width: v.bossView.hp / v.bossView.max * 100 + "%" }} /></i><small>下一招：{v.bossView.move.name}，{v.bossView.move.text}{v.bossView.enraged ? "（狂暴：翻倍）" : ""}</small></section>}<div className="my-spacer" /><section className="my-scene"><small>{v.sceneInfo.type} · {STEP[v.phase]}</small><h2>{v.sceneInfo.title}</h2>{!v.bossView && (v.phase === "PLAN" || v.phase === "FORK") && <p>{v.sceneInfo.narration}</p>}<p className="my-actor">主行动者：{dn(v.actor)}{actor && "（你）"}</p></section>
      {v.intelText.map((t: string, i: number) => <section key={i} className="my-intel" data-testid="my-intel"><b>🔒 独家情报，只有你能看到</b><p>{t}</p></section>)}
      <Act v={v} me={me} actor={actor} cmd={cmd} dn={dn} /><Skill v={v} me={me} cmd={cmd} dn={dn} />
    </>}
    <Err m={err} />
    <details className="my-drawer"><summary>我的角色与誓约</summary><img className="my-portrait" src={`/assets/mist-expedition/classes/${me.cls}.webp`} alt="" />{(me.traitor || me.recruit) && <p className="my-err">你是{me.traitor ? "内奸" : "被策反者"}：全队失败，你就获胜。</p>}<p>生命 {me.hp} · 压力 {me.stress} · 闪回 {me.flashback ? "可用" : "已用"}</p><p><b>{v.myOath.name}</b>：{v.myOath.text}{v.myOath.target !== undefined && `（目标：${dn(v.myOath.target)}）`}</p></details>
  </div>;
}
const CLS: any = { warrior: "战士：队友受伤时自动替他承受（生命大于 1 时）", ranger: "游侠", mage: "法师", bard: "吟游诗人" };
function Skill({ v, me, cmd, dn }: any) {
  if (me.cls === "warrior") return <p className="my-skill">{CLS.warrior}</p>;
  if (me.uses < 1) return null;
  if (me.cls === "ranger") return <section className="my-skill">{me.peek ? <p>下一张命运牌：{me.peek.color} {me.peek.value}</p> : v.phase === "CONTRIBUTE" && <button onClick={() => cmd({ t: "ABILITY" })}>偷看 1 张命运牌（剩 {me.uses} 次）</button>}</section>;
  if (me.cls === "mage") return v.phase === "CONTRIBUTE" && !v.colorSwap ? <section className="my-skill"><p>把第一种有效色改成（剩 {me.uses} 次）：</p><div className="my-hand">{["刚", "影", "智", "言"].filter((c) => !v.validNow.includes(c)).map((c) => <button key={c} onClick={() => cmd({ t: "ABILITY", to: c })}>{c}</button>)}</div></section> : null;
  return <details className="my-skill"><summary>安抚队友，压力 -2（剩 {me.uses} 次）</summary>{v.players.filter((p: any) => p.seat !== v.me).map((p: any) => <button key={p.seat} onClick={() => cmd({ t: "ABILITY", target: p.seat })}>{dn(p.seat)}（压力 {p.stress}）</button>)}</details>;
}
function Council({ v, me, cmd, dn }: any) {
  const [mode, setMode] = useState("");
  const others = v.players.filter((p: any) => p.seat !== v.me);
  const pickers = (t: string) => others.map((p: any) => <button key={p.seat} onClick={() => { cmd({ t, target: p.seat }); setMode(""); }}>{dn(p.seat)}</button>);
  return <section data-testid="my-council"><h3>营地议事（{v.voted.length}/{v.n} 已投票）</h3>
    {v.defections > 0 && <p>📜 已有 {v.defections} 人投诚。</p>}
    {v.myInspect && <p className="my-intel">🔒 搜身结果：{dn(v.myInspect.target)} 上一场{v.myInspect.effective === null ? "没有出牌" : v.myInspect.effective ? "出了有效牌" : "出了无效牌"}。只有你知道。</p>}
    {me.letter && <div className="my-intel"><b>✉️ 匿名密信：跟我合作吧，胜利后分你一份。</b><button onClick={() => cmd({ t: "ANSWER", accept: true })}>接受（改为随内奸获胜）</button><button onClick={() => cmd({ t: "ANSWER", accept: false })}>拒绝</button></div>}
    {!v.inspected && v.inspectLeft > 0 && v.clues > 0 && <button onClick={() => setMode("INSPECT")}>搜身：花 1 线索（全队剩 {v.inspectLeft} 次）</button>}
    {me.traitor && <button onClick={() => cmd({ t: "DEFECT" })}>投诚：放弃内奸身份，灾厄 -1</button>}
    {me.traitor && !me.letterUsed && <button onClick={() => setMode("LETTER")}>发送匿名密信</button>}
    {mode && pickers(mode)}
    {v.voted.includes(v.me) ? <p>已投票，等待其他人…</p> : <><p>关禁闭投票：过半数通过，下一场不能行动，全队灾厄 +1。</p><button data-testid="my-novote" onClick={() => cmd({ t: "VOTE", target: null })}>不关任何人</button>{pickers("VOTE")}</>}
  </section>;
}
const FOE: any = { s06: "golem" };
function Party({ v, dn }: any) {
  const foe = v.bossView ? (v.bossView.art === "boss-debtor" ? "debtor" : v.bossView.enraged ? "accountant-2" : "accountant") : FOE[v.sceneInfo.id]; const foeRef = useRef<HTMLImageElement>(null); const hp = useRef(v.bossView?.hp); const [dmg, setDmg] = useState<any>(null);
  const actRef = useRef<HTMLDivElement>(null);
  const doom = useRef(v.doom); const [burst, setBurst] = useState(0);
  useEffect(() => { if (v.doom > doom.current && !reduced()) setBurst(Date.now()); doom.current = v.doom; }, [v.doom]);
  useEffect(() => { const h = v.bossView?.hp; if (h !== undefined && hp.current !== undefined && h < hp.current && !reduced()) { const d = hp.current - h; setDmg({ d, k: Date.now() }); if (actRef.current) gsap.fromTo(actRef.current, { y: 0 }, { y: -46, scale: 1.2, duration: .16, yoyo: true, repeat: 1 }); if (foeRef.current) gsap.fromTo(foeRef.current, { filter: "brightness(3)", x: -10 }, { filter: "brightness(1)", x: 0, duration: .5, ease: "elastic.out(1,.3)" }); sfx("panic"); } hp.current = h; }, [v.bossView?.hp]);
  return <div className="my-field">{foe && <img ref={foeRef} className={`my-foe${v.bossView ? " boss" : ""}`} src={`/assets/mist-expedition/standees/${foe}.webp`} alt="" />}{burst > 0 && <img key={burst} className="my-fx fogb" src="/assets/mist-expedition/fx/fog.webp" alt="" />}{dmg && <><img key={"s" + dmg.k} className="my-fx" src="/assets/mist-expedition/fx/slash.webp" alt="" /><img key={"h" + dmg.k} className="my-fx hit" src="/assets/mist-expedition/fx/hit.webp" alt="" /><b key={dmg.k} className="my-dmg">-{dmg.d}</b></>}
    <div className="my-party">{v.players.map((p: any) => <div key={p.seat} ref={p.seat === v.actor ? actRef : undefined} style={{ animationDelay: p.seat * .23 + "s" }} className={`${p.seat === v.actor ? "act" : ""}${p.seat === v.jailed ? " jail" : ""}${p.seat === v.me ? " me" : ""}${p.hp <= 0 ? " down" : ""}`}><img src={`/assets/mist-expedition/standees/${p.cls}.webp`} alt="" /><i className="hp"><u style={{ width: p.hp / 3 * 100 + "%" }} /></i><i className="st"><u style={{ width: p.stress / 6 * 100 + "%" }} /></i><span>{dn(p.seat)}</span></div>)}</div></div>;
}
function Err({ m }: { m: string }) { return m ? <p className="my-err">{m}</p> : null; }
function Act({ v, me, actor, cmd, dn }: any) {
  const [deal, setDeal] = useState(false); const reveal = useMemo(() => v.reveal ?? [], [v.reveal]);
  if (v.phase === "FORK") return <section><h3>{v.fork.title}</h3><p>{v.fork.text}</p>{actor ? v.fork.options.map((o: any) => <button key={o.id} onClick={() => cmd({ t: "FORK", optionId: o.id })}>{o.name}</button>) : <p>等待 {dn(v.actor)} 选择…</p>}</section>;
  if (v.phase === "PLAN") return <section><h3>方案（可语音商量）</h3>{v.plans.map((p: any) => <button key={p.id} data-testid="my-plan" disabled={!actor} onClick={() => cmd({ t: "PLAN", planId: p.id, acceptDeal: deal })}>{p.name}<small>{p.attribute} · {p.difficulty} · 有效 {p.valid_colors.join("、")}</small></button>)}{actor && v.dealOffer && <label className="my-deal"><input type="checkbox" checked={deal} onChange={(e) => setDeal(e.target.checked)} /> 魔鬼交易「{v.dealOffer.name}」：{v.dealOffer.text}（+2）</label>}{!actor && <p>等待 {dn(v.actor)} 决定…</p>}</section>;
  if (v.phase === "CONTRIBUTE" && v.jailed !== v.me) { if (actor) return <p>队友正在暗中出牌（{v.playedCount}/{v.n - 1}）…</p>; if (me.hand.length < 3) return <p>已出牌，等待其他人（{v.playedCount}/{v.n - 1}）…</p>; const p = v.plans.find((x: any) => x.id === v.planId); return <section><h3>暗中出 1 张牌{p ? `（有效：${v.validNow.join("、")}）` : ""}</h3><div className="my-hand">{me.hand.map((c: any) => <button key={c.id} data-testid="my-card" onClick={() => cmd({ t: "CONTRIBUTE", cardId: c.id })}><img className="my-face" src={`/assets/mist-expedition/cards/${CI[c.color]}.webp`} alt="" /><em>{c.color}</em><b>{c.value}</b></button>)}</div></section>; }
  if (v.phase === "COUNCIL") return <Council v={v} me={me} cmd={cmd} dn={dn} />;
  if (v.phase === "CONTRIBUTE" && v.jailed === v.me) return <p>你被关禁闭，这一场不能行动。</p>;
  const cards = <div className="my-hand">{reveal.map((c: any, i: number) => <span key={c.id} className="my-flip" style={{ animationDelay: i + "s" }}><img className="my-face" src={`/assets/mist-expedition/cards/${CI[c.color]}.webp`} alt="" /><em>{c.color}</em><b>{c.value}</b></span>)}</div>;
  if (v.phase === "ROLL") return <section><h3>翻牌结果</h3>{cards}{actor ? <><button data-testid="my-roll" onClick={() => cmd({ t: "ROLL", push: false })}>稳妥掷骰</button><button onClick={() => cmd({ t: "ROLL", push: true })}>加压力骰（压力 +1，可能失控）</button></> : <p>等待 {dn(v.actor)} 掷骰…</p>}</section>;
  return <section><h3 className="my-pop" key={v.total}>总值 {v.total}</h3>{v.roll && <Dice3D values={v.roll.dice} />}<p>骰子 {v.roll?.dice.join("+")}{v.roll?.pd?.length ? ` · 压力骰 ${v.roll.pd.join(",")}` : ""}{v.roll?.panic && " · ⚠失控！"}</p>{cards}{v.log?.some((l: any) => l.type === "flashback") && <img key={v.total} className="my-fx magic" src="/assets/mist-expedition/fx/magic.webp" alt="" />}{me.flashback && v.jailed !== v.me && <button onClick={() => cmd({ t: "FLASHBACK", pay: v.supplies > 0 ? "supplies" : "stress" })}>闪回：其实我早有准备（总值 +3）</button>}{v.passed.includes(v.me) ? <p>等待其他人…</p> : <button data-testid="my-pass" onClick={() => cmd({ t: "PASS" })}>不闪回，继续</button>}</section>;
}
function End({ v, dn }: any) { const r = v.reveal_all; return <section data-testid="my-end"><img className="my-endart" src={`/assets/mist-expedition/endings/${v.ending.toLowerCase()}.webp`} alt="" /><h2>{v.endingInfo.title}</h2><p>{v.endingInfo.text}</p><h3>秘密誓约</h3><ul>{r.oaths.map((o: any) => <li key={o.seat}>{dn(o.seat)}（{o.role}）：{o.name} {o.done ? "✅" : "❌"}</li>)}</ul><h3>独家情报回顾</h3><ul>{r.intel.map((i: any, k: number) => <li key={k}>{dn(i.seat)}：{i.text}</li>)}</ul><small>音乐：North Fantasy Music（CC-BY 4.0）· 音效：Kenney（CC0）· 图标：game-icons.net（Lorc、Delapouite、Skoll，CC-BY 3.0）</small></section>; }
