import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
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
const STEP: any = { FORK: "岔路抉择", PLAN: "商量方案", CONTRIBUTE: "暗中出力", ROLL: "掷骰", FLASHBACK: "闪回窗口" };
export function MistExpedition() {
  const q = new URLSearchParams(location.search); const [code, setCode] = useState(q.get("room")?.toUpperCase() ?? "");
  const [name, setName] = useState(get("my-name") ?? ""); const [v, setV] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [now, setNow] = useState(Date.now());
  useEffect(() => { sock.on("my:state", setV); const t = setInterval(() => setNow(Date.now()), 500); const rejoin = () => { const c = new URLSearchParams(location.search).get("room")?.toUpperCase(); const tk = c && get("my-seat-" + c); if (tk) call("my:join", { code: c, token: tk }).then((r) => r.ok && setV(r.snapshot)); }; sock.on("connect", rejoin); if (sock.connected) rejoin(); return () => { sock.off("my:state", setV); sock.off("connect", rejoin); clearInterval(t); }; }, []);
  const key = v?.started ? `${v.sceneIdx}|${v.phase}|${v.ending ?? ""}` : "";
  useEffect(() => { if (!key) return; if (v.ending) return sfx(v.ending === "E02" ? "lose" : "win"); if (v.phase === "PLAN") sfx("scene"); if (v.phase === "ROLL") { sfx("shuffle"); (v.reveal ?? []).forEach((_: any, i: number) => setTimeout(() => sfx("card"), i * 1000)); } if (v.phase === "FLASHBACK") sfx(v.roll?.panic ? "panic" : "dice"); }, [key]);
  const track = !v?.started ? "" : v.ending ? (v.ending === "E02" ? "tense" : "win") : v.sceneIdx === 3 ? "final" : v.doom >= 6 || ["CONTRIBUTE", "ROLL", "FLASHBACK"].includes(v.phase) ? "tense" : "explore";
  useEffect(() => { playBgm(track); const f = () => playBgm(track); addEventListener("pointerdown", f); return () => removeEventListener("pointerdown", f); }, [track]);
  const join = async (c: string) => { set("my-name", name); const r = await call("my:join", { code: c, name, token: get("my-seat-" + c) }); if (!r.ok) return setErr(r.error); set("my-seat-" + c, r.token); history.replaceState(null, "", "/?game=my&room=" + c); setV(r.snapshot); };
  const create = async () => { const r = await call("my:create"); if (!r.ok) return setErr(r.error); setCode(r.code); join(r.code); };
  const cmd = async (c: any) => { if (busy) return; sfx("click"); setBusy(true); const r = await call("my:cmd", c); setBusy(false); setErr(r.ok ? "" : r.error); };
  if (!v) return <div className="my-world"><h1>迷雾远征</h1><p>夺回圣物。提防身边的人。</p><input data-testid="my-name" placeholder="你的名字" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />{code ? <button data-testid="my-join" onClick={() => join(code)}>加入房间 {code}</button> : <><button data-testid="my-create" onClick={create}>创建房间</button><input placeholder="房间码" onChange={(e) => setCode(e.target.value.toUpperCase())} /></>}<Err m={err} /></div>;
  if (!v.started) return <div className="my-world"><h1>房间 {v.code}</h1><p>把网址发给朋友。{v.names.length} / 8 人</p><ul>{v.names.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>{v.host ? <button data-testid="my-start" disabled={v.names.length < 3} onClick={async () => { const r = await call("my:start"); if (!r.ok) setErr(r.error); }}>{v.names.length < 3 ? "至少 3 人" : "开始冒险"}</button> : <p>等待房主开始…</p>}<Err m={err} /></div>;
  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - (now + 0)) / 1000)) : 0; const me = v.players[v.me]; const actor = v.actor === v.me; const dn = (s: number) => v.names[s];
  return <div className="my-world">
    <header className="my-top"><b>第 {v.sceneIdx + 1}/4 场</b><span data-testid="my-doom"><I n="doom" />灾厄 {v.doom}/8</span><span><I n="supplies" />物资 {v.supplies}</span><span><I n="clues" />线索 {v.clues}</span><span><I n="omen" />预兆 {v.omen}</span><button className="my-mute" aria-label="音效开关" onClick={() => { set("my-mute", get("my-mute") === "1" ? "0" : "1"); playBgm(track); setNow(Date.now()); }}>{get("my-mute") === "1" ? "🔇" : "🔊"}</button>{left > 0 && <span>⏱{left}</span>}</header>
    {v.ending ? <End v={v} dn={dn} /> : <>
      <section className="my-scene"><small>{v.sceneInfo.type} · {STEP[v.phase]}</small><h2>{v.sceneInfo.title}</h2><p>{v.sceneInfo.narration}</p><p className="my-actor">主行动者：{dn(v.actor)}{actor && "（你）"}</p></section>
      {v.intelText.map((t: string, i: number) => <section key={i} className="my-intel" data-testid="my-intel"><b>🔒 独家情报，只有你能看到</b><p>{t}</p></section>)}
      <Act v={v} me={me} actor={actor} cmd={cmd} dn={dn} /><Skill v={v} me={me} cmd={cmd} dn={dn} />
    </>}
    <Err m={err} />
    <details className="my-drawer"><summary>我的角色与誓约</summary><p><I n={me.cls} />生命 {me.hp} · 压力 {me.stress} · 闪回 {me.flashback ? "可用" : "已用"}</p><p><b>{v.myOath.name}</b>：{v.myOath.text}{v.myOath.target !== undefined && `（目标：${dn(v.myOath.target)}）`}</p></details>
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
function Err({ m }: { m: string }) { return m ? <p className="my-err">{m}</p> : null; }
function Act({ v, me, actor, cmd, dn }: any) {
  const [deal, setDeal] = useState(false); const reveal = useMemo(() => v.reveal ?? [], [v.reveal]);
  if (v.phase === "FORK") return <section><h3>{v.fork.title}</h3><p>{v.fork.text}</p>{actor ? v.fork.options.map((o: any) => <button key={o.id} onClick={() => cmd({ t: "FORK", optionId: o.id })}>{o.name}</button>) : <p>等待 {dn(v.actor)} 选择…</p>}</section>;
  if (v.phase === "PLAN") return <section><h3>方案（可语音商量）</h3>{v.plans.map((p: any) => <button key={p.id} data-testid="my-plan" disabled={!actor} onClick={() => cmd({ t: "PLAN", planId: p.id, acceptDeal: deal })}>{p.name}<small>{p.attribute} · {p.difficulty} · 有效 {p.valid_colors.join("、")}</small></button>)}{actor && v.dealOffer && <label className="my-deal"><input type="checkbox" checked={deal} onChange={(e) => setDeal(e.target.checked)} /> 魔鬼交易「{v.dealOffer.name}」：{v.dealOffer.text}（+2）</label>}{!actor && <p>等待 {dn(v.actor)} 决定…</p>}</section>;
  if (v.phase === "CONTRIBUTE") { if (actor) return <p>队友正在暗中出牌（{v.playedCount}/{v.n - 1}）…</p>; if (me.hand.length < 3) return <p>已出牌，等待其他人（{v.playedCount}/{v.n - 1}）…</p>; const p = v.plans.find((x: any) => x.id === v.planId); return <section><h3>暗中出 1 张牌{p ? `（有效：${v.validNow.join("、")}）` : ""}</h3><div className="my-hand">{me.hand.map((c: any) => <button key={c.id} data-testid="my-card" onClick={() => cmd({ t: "CONTRIBUTE", cardId: c.id })}><I n={CI[c.color]} />{c.color}<b>{c.value}</b></button>)}</div></section>; }
  const cards = <div className="my-hand">{reveal.map((c: any, i: number) => <span key={c.id} className="my-flip" style={{ animationDelay: i + "s" }}><I n={CI[c.color]} />{c.color}<b>{c.value}</b></span>)}</div>;
  if (v.phase === "ROLL") return <section><h3>翻牌结果</h3>{cards}{actor ? <><button data-testid="my-roll" onClick={() => cmd({ t: "ROLL", push: false })}>稳妥掷骰</button><button onClick={() => cmd({ t: "ROLL", push: true })}>加压力骰（压力 +1，可能失控）</button></> : <p>等待 {dn(v.actor)} 掷骰…</p>}</section>;
  return <section><h3>总值 {v.total}</h3><p>骰子 {v.roll?.dice.join("+")}{v.roll?.pd?.length ? ` · 压力骰 ${v.roll.pd.join(",")}` : ""}{v.roll?.panic && " · ⚠失控！"}</p>{cards}{me.flashback && <button onClick={() => cmd({ t: "FLASHBACK", pay: v.supplies > 0 ? "supplies" : "stress" })}>闪回：其实我早有准备（总值 +3）</button>}{v.passed.includes(v.me) ? <p>等待其他人…</p> : <button data-testid="my-pass" onClick={() => cmd({ t: "PASS" })}>不闪回，继续</button>}</section>;
}
function End({ v, dn }: any) { const r = v.reveal_all; return <section data-testid="my-end"><h2>{v.endingInfo.title}</h2><p>{v.endingInfo.text}</p><h3>秘密誓约</h3><ul>{r.oaths.map((o: any) => <li key={o.seat}>{dn(o.seat)}：{o.name} {o.done ? "✅" : "❌"}</li>)}</ul><h3>独家情报回顾</h3><ul>{r.intel.map((i: any, k: number) => <li key={k}>{dn(i.seat)}：{i.text}</li>)}</ul><small>音乐：North Fantasy Music（CC-BY 4.0）· 音效：Kenney（CC0）· 图标：game-icons.net（Lorc、Delapouite、Skoll，CC-BY 3.0）</small></section>; }
