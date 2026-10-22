import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { feel, soundOn, setSoundOn } from "../drawing/feel.ts";
import { Candle, Portrait, RoomArt, Sigil } from "./Art.tsx";
import "./world.css";
import { CHARACTERS } from "../../../../packages/witch-town/src/data.ts";

export const SCENES = [
  ["lobby", "大厅"], ["day-me", "白天 · 轮到我"], ["day-12", "白天 · 12人"],
  ["target", "出牌选目标"], ["trial", "审判揭牌"], ["black", "黑牌 · 阴谋"],
  ["conspiracy", "阴谋传牌"], ["night-witch", "夜晚 · 女巫"], ["night-town", "夜晚 · 等待"],
  ["confession", "自白"], ["loot", "共同分牌"], ["tituba", "说书人排序"],
  ["dead", "死亡观战"], ["result", "终局"], ["day-4", "白天 · 4人"],
] as const;
type Scene = typeof SCENES[number][0];
const PEOPLE = [
  ["阿宁", "说书人"], ["小雨", "农民"], ["山姆", "部长"], ["阿梨", "女仆"],
  ["林恩", "牧师"], ["木木", "少女"], ["阿布", "法官"], ["苏珊", "裁缝"],
  ["乔恩", "医生"], ["桃子", "小孩"], ["艾达", "大力士"], ["阿泽", "乞丐"],
];
const CARDS: Record<string, { name: string; tone: string; text: string; mark: string }> = {
  evidence: { name: "证据", tone: "red", text: "向另一名玩家放置，增加3点指控。达到审判门槛时揭示一张审判牌。", mark: "+3" },
  accusation: { name: "指控", tone: "red", text: "向另一名玩家增加1点指控。", mark: "+1" },
  alibi: { name: "辩护", tone: "green", text: "移除另一名玩家面前合计不超过3点的指控。", mark: "−3" },
  robbery: { name: "抢劫", tone: "green", text: "从另一名玩家手中随机取得两张手牌。", mark: "行动" },
  piety: { name: "信徒", tone: "blue", text: "审判此玩家所需的指控门槛加倍。移除时按专条检查审判。", mark: "持续" },
  matchmaker: { name: "情侣", tone: "blue", text: "两位情侣中有一方死亡，另一方也会死亡；按角色免疫与胜负例外结算。", mark: "持续" },
  stocks: { name: "拘留", tone: "blue", text: "目标下次回合跳过，然后弃掉此牌。", mark: "持续" },
  conspiracy: { name: "阴谋", tone: "black", text: "黑猫持有者先揭示一张审判牌；随后同时从左邻选取一张隐藏审判牌。", mark: "立即事件" },
};
type CardKey = keyof typeof CARDS;
function Card({ kind, selected, onClick, compact = false }: { kind: CardKey; selected?: boolean; onClick?: () => void; compact?: boolean }) {
  const c = CARDS[kind], Tag = onClick ? "button" : "span";
  return <Tag className={`wt-card wt-${c.tone} ${compact ? "wt-card-small" : ""}`} aria-label={`${c.name}，${c.text}`} aria-pressed={!!selected} onClick={onClick} data-kind={kind}>
    <span className="wt-card-rim"><span className="wt-card-top">{c.mark}<i>1692</i></span><span className="wt-card-art"><Sigil kind={kind}/></span><strong>{c.name}</strong><span className="wt-card-caption">{c.tone === "red" ? "指控牌" : c.tone === "blue" ? "持续效果" : c.tone === "black" ? "黑色事件" : "行动牌"}</span></span>
  </Tag>;
}
function SealedCard({ revealed, kind = "not_witch", onClick, selected, number }: { revealed?: boolean; kind?: string; onClick?: () => void; selected?: boolean; number: number }) {
  const Tag = onClick ? "button" : "span";
  return <Tag aria-label={revealed ? `公开审判牌：${kind === "witch" ? "女巫" : kind === "constable" ? "警长" : "平民"}` : `背面审判牌${number}`} aria-pressed={!!selected} className={`wt-tryal ${revealed ? "is-revealed" : ""} ${kind === "witch" && revealed ? "is-witch" : ""}`} onClick={onClick}>
    <span className="wt-tryal-inner"><span className="wt-tryal-back"><i className="wt-wax-seal"><Sigil/></i><small>{number}</small></span><span className="wt-tryal-front">{revealed && <><Sigil kind={kind}/><strong>{kind === "witch" ? "女巫" : kind === "constable" ? "警长" : "平民"}</strong></>}</span></span>
  </Tag>;
}
function Ring({ left, total = 30 }: { left: number; total?: number }) {
  return <div className={`wt-timer ${left <= 10 ? "is-urgent" : ""}`} aria-label={`剩余${left}秒`}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><circle cx="32" cy="32" r="28" className="wt-ring-fill" strokeDasharray={176} strokeDashoffset={176 * (1 - left / total)}/></svg><b>{left}</b><small>秒</small></div>;
}

export function WitchTownMock() {
  const q = new URLSearchParams(location.search), requested = q.get("mock");
  const initial = (SCENES.some(([id]) => id === requested) ? requested : "lobby") as Scene;
  const [scene, setScene] = useState<Scene>(initial);
  const requestedCount = Number(q.get("players"));
  const [count, setCount] = useState(Number.isInteger(requestedCount) && requestedCount >= 4 && requestedCount <= 12 ? requestedCount : initial === "day-12" ? 12 : initial === "day-4" || initial === "lobby" ? 4 : 8);
  const handCount = Math.max(5,Math.min(14,Number(q.get("hand")) || 5));
  const mockHand = Array.from({length:handCount},(_,i)=>Object.keys(CARDS)[i % Object.keys(CARDS).length]);
  const [selected, setSelected] = useState<number | null>(initial === "target" ? Math.min(4,count-1) : null);
  const [card, setCard] = useState<CardKey | null>(initial === "target" ? "evidence" : null);
  const [details, setDetails] = useState<string | null>(null), [detailSeat, setDetailSeat] = useState(0);
  const [banner, setBanner] = useState<{id:number;text:string} | null>(null), bannerQueue = useRef<{id:number;text:string}[]>([]), bannerId = useRef(0);
  const [notice, setNotice] = useState(""), [log, setLog] = useState(["第2日 · 小雨向林恩出示了1点指控。", "天亮了，昨夜无人死亡。"]);
  const [muted, setMuted] = useState(!soundOn()), [ready, setReady] = useState(false), [name, setName] = useState("阿宁");
  const [reveal, setReveal] = useState(false), [selfReveal, setSelfReveal] = useState(false), [confirmSelf, setConfirmSelf] = useState(false);
  const [pick, setPick] = useState<number | null>(null), [taken, setTaken] = useState(2), [passed, setPassed] = useState(false);
  const [order, setOrder] = useState<CardKey[]>(["alibi", "evidence", "piety", "accusation", "robbery"]), drag = useRef<number | null>(null);
  const [sorted, setSorted] = useState(false), [seconds, setSeconds] = useState(initial === "tituba" ? 60 : 30), [liveTimer, setLiveTimer] = useState(false);
  const [flying, setFlying] = useState(false), [extra, setExtra] = useState(0), [shake, setShake] = useState<number | null>(null);
  const [peek, setPeek] = useState<"own"|"new"|null>(null), [confirmNight,setConfirmNight] = useState(false);
  const [powerSaving,setPowerSaving] = useState(() => {try {return localStorage.getItem("wt-power")==="1";} catch {return false;}});
  const [resumed,setResumed] = useState(false);
  const swipeStart = useRef<number|null>(null);
  const tableRef = useRef<HTMLElement>(null);
  const [tableSize, setTableSize] = useState({ w:360, h:340 });
  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const ro = new ResizeObserver(([entry]) => setTableSize({ w:entry.contentRect.width, h:entry.contentRect.height }));
    ro.observe(element);
    return () => ro.disconnect();
  }, [scene]);
  // Equal arc length on the actual ellipse, instead of equal angles which crowd its sides.
  const compact = tableSize.w < 600;
  const seatWidth = count >= 9 ? (compact ? 72 : 94) : (compact ? 86 : 104);
  const seatHeight = count >= 9 ? (compact ? 48 : 58) : compact ? 76 : 86;
  // Actual plaque bounds, external number seal and self label all count as clearance.
  const radiusX = Math.max(0, .5 - (seatWidth / 2 + 17) / tableSize.w);
  const radiusY = Math.max(0, .5 - (seatHeight / 2 + 17) / tableSize.h);
  // Select points on a rounded ellipse using each plaque's complete rectangle.
  // A greedy clearance pass + spacing search keeps labels out of neighbours,
  // even when a short phone needs a squarer oval. No player-count lookup table.
  let exponent=1;
  const curve = (a: number) => ({x:Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),exponent),y:Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),exponent)});
  let angles = Array.from({length:count},(_,i)=>Math.PI/2+i*Math.PI*2/count);
  const rx=tableSize.w*radiusX, ry=tableSize.h*radiusY;
  function fit(spacing:number) {
    const found=[Math.PI/2], points=[{x:0,y:ry}];
    for(let j=1;j<=1440&&found.length<count;j++) {
      const a=Math.PI/2+j*Math.PI*2/1440,c=curve(a),p={x:c.x*rx,y:c.y*ry};
      if(points.every(v=>Math.abs(v.x-p.x)>=(seatWidth+3)*spacing||Math.abs(v.y-p.y)>=(seatHeight+10)*spacing)) {found.push(a);points.push(p);}
    }
    return found.length===count ? found : null;
  }
  for(const power of [1,.8,.6,.4,.25,.12]) {
    exponent=power;
    const first=fit(1);
    if(!first) continue;
    angles=first;
    for(let spacing=1.02;spacing<=1.5;spacing+=.02) {const next=fit(spacing);if(!next) break;angles=next;}
    break;
  }
  const night = scene.startsWith("night") || scene === "confession";
  const tryalCount = count <= 7 ? 5 : count <= 9 ? 4 : 3;
  function shownRole(i: number) {
    // Shared-farmer fixture: Martha sits immediately after John and copies him.
    if (scene === "loot") { if (i === 0) return "农民"; if (i === 1) return "裁缝"; if (i === 7) return "说书人"; }
    return PEOPLE[i][1];
  }
  const myTurn = ["day-me","day-4","target"].includes(scene);
  const stage = scene === "lobby" ? "小镇集会" : scene === "tituba" ? "说书人" : scene === "confession" ? "夜晚 · 自白" : night ? "第2夜" : scene === "trial" ? "公开审判" : ["black", "conspiracy"].includes(scene) ? "阴谋" : scene === "result" ? "终局" : "第2日 · 白天";
  const trialSeat = Math.min(4,count-1), trialName = PEOPLE[trialSeat][0];
  const eventScene = !["lobby", "day-me", "day-12", "day-4", "target", "dead"].includes(scene);
  useEffect(() => {
    document.title = myTurn ? "⚠ 轮到你了 · 女巫镇" : "女巫镇 · 月鸦小镇";
    let lock:any=null, active=true;
    const acquire=async()=>{if(document.visibilityState!=="visible"||scene==="lobby"||powerSaving||lock) return;try {const next=await (navigator as any).wakeLock?.request("screen"); if(!active) await next?.release(); else {lock=next;next?.addEventListener("release",()=>{lock=null;});}} catch {/* Unsupported or denied: gameplay stays available. */}};
    const visibility=()=>{setPeek(null);if(document.visibilityState==="visible") {setResumed(true);setTimeout(()=>setResumed(false),2200);if(myTurn){announce("轮到你了");try{navigator.vibrate?.(35);}catch{}}void acquire();}};
    void acquire(); document.addEventListener("visibilitychange",visibility);
    const hide=()=>setPeek(null);window.addEventListener("blur",hide);window.addEventListener("pagehide",hide);
    return()=>{active=false;void lock?.release();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("blur",hide);window.removeEventListener("pagehide",hide);document.title="桌游合集";};
  },[scene,myTurn,powerSaving]);
  useEffect(()=>{
    const preventZoom=(e:Event)=>{if(!(e.target instanceof Element)||!e.target.closest(".wt-world"))return;if(e.type==="gesturestart"||((e as TouchEvent).touches?.length??0)>1)e.preventDefault();};
    document.addEventListener("gesturestart",preventZoom,{passive:false});document.addEventListener("touchmove",preventZoom,{passive:false});
    return()=>{document.removeEventListener("gesturestart",preventZoom);document.removeEventListener("touchmove",preventZoom);};
  },[]);
  function pressProps(scope:"own"|"new") {return {
    onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);setPeek(scope);},
    onPointerUp:()=>setPeek(null),onPointerCancel:()=>setPeek(null),onLostPointerCapture:()=>setPeek(null),onBlur:()=>setPeek(null),
    onKeyDown:(e:React.KeyboardEvent)=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();setPeek(scope);}},
    onKeyUp:()=>setPeek(null),
  };}
  function announce(text: string) { bannerQueue.current.push({id:++bannerId.current,text}); setBanner(current => current ?? bannerQueue.current.shift() ?? null); }
  function message(text: string) { setNotice(text); setLog(x => [text, ...x]); }
  function go(next: Scene) { setPeek(null);setConfirmNight(false);setNotice(""); setScene(next); setDetails(null); setPick(null); setReveal(false); setPassed(false); setCard(next === "target" ? "evidence" : null); setSelected(next === "target" ? Math.min(4,count-1) : null); setSorted(false); setSelfReveal(false); setConfirmSelf(false); setSeconds(next === "tituba" ? 60 : 30); setLiveTimer(false); if (next === "day-12") setCount(12); if (next === "day-4") setCount(4); announce(SCENES.find(([id]) => id === next)![1]); }
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(bannerQueue.current.shift() ?? null), 1900); return () => clearTimeout(t); }, [banner]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 2800); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (!liveTimer || seconds <= 0) return; const t = setTimeout(() => { setSeconds(x => x - 1); if (seconds <= 11) feel("tick"); }, 1000); return () => clearTimeout(t); }, [seconds, liveTimer]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") setDetails(null); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, []);
  useEffect(() => {
    const w = window as any;
    w.render_game_to_text = () => JSON.stringify({ prototype: true, scene, players: count, task: hint, selectedTarget: selected, selectedCard: card, revealed: reveal, ownCardRevealed: selfReveal, seconds, lootPicked: taken, order, details, coordinates: "DOM: origin top-left; x right; y down" });
    w.advanceTime = (ms: number) => setSeconds(x => Math.max(0, x - Math.floor(ms / 1000)));
    return () => { delete w.render_game_to_text; delete w.advanceTime; };
  });
  function chooseSeat(i: number) {
    if (scene === "target" && i === 0) { setShake(i); message("不能对自己出牌；请选择其他玩家。"); setTimeout(() => setShake(null), 450); return; }
    if (scene === "target" || scene === "night-witch") { setNotice(""); setSelected(i); return; }
    setDetailSeat(i); setDetails("seat");
  }
  function move(from: number, to: number) { if (to < 0 || to >= order.length) return; setOrder(x => { const a = [...x]; a.splice(to, 0, a.splice(from, 1)[0]); return a; }); setSorted(false); }
  function play() { const used = card ?? "evidence"; setFlying(true); feel("submit"); setTimeout(() => { setFlying(false); if (used === "evidence") setExtra(x => x + 3); message(`向${(selected ?? 4) + 1}号使用${CARDS[used].name}。`); announce(`${CARDS[used].name}已出示${used === "evidence" ? " · +3 指控" : ""}`); setCard(null); setSelected(null); setScene("day-me"); }, 620); }
  const hint = scene === "lobby" ? ready ? "所有人已准备，可以开始" : "确认昵称与人数，然后准备" : scene === "day-12" ? "等待3号 山姆出牌…" : scene === "target" ? selected == null ? "请选择一位玩家作为目标" : `对${selected + 1}号 ${PEOPLE[selected][0]}使用『${CARDS[card ?? "evidence"].name}』？` : scene === "trial" ? reveal ? `女巫身份已揭示，${trialName}被淘汰` : `你正在审判${trialSeat+1}号${trialName}，选择一张背面牌` : scene === "black" ? "你抽到了黑牌：阴谋，立即处理" : scene === "conspiracy" ? passed ? `已完成${count}/${count}人 · 查看你的新审判牌` : `从左邻${count}号${PEOPLE[count-1][0]}的背面牌中选一张` : scene === "night-witch" ? "秘密商议后，选择今晚的袭击目标" : scene === "night-town" ? "请闭眼 · 等待夜间秘密行动完成" : scene === "confession" ? selfReveal ? "你已自白，等待天亮" : "你可以公开一张自己的审判牌进行自白" : scene === "loot" ? taken >= 3 ? "你已选满3张 · 等待裁缝挑选" : `轮到你挑选 · 已选${taken}/3张` : scene === "tituba" ? sorted ? "顺序已保存，选择抽2张或出牌" : "调整牌序，然后选择本回合行动" : scene === "dead" ? "你已被淘汰 · 正在观战公开局势" : scene === "result" ? "全部女巫审判牌已揭示 · 平民获胜" : "轮到你了 · 抽2张，或打出至少1张牌";

  function publicKinds(i:number) {
    if(scene === "dead" && i === 0) return Array.from({length:tryalCount},(_,j)=>j===tryalCount-1?"constable":"not_witch");
    if(scene === "trial" && reveal && i === trialSeat) return Array.from({length:tryalCount},(_,j)=>j===0?"witch":"not_witch");
    return i===4 ? ["not_witch"] : [];
  }
  function effects(i: number) { return i === 3 ? ["cat"] : i === 1 ? ["matchmaker"] : i === 7 ? ["asylum"] : []; }
  const effectNames: Record<string,string> = {cat:"黑猫",matchmaker:"情侣",asylum:"避难"};
  function center() {
    if (night) return <div className="wt-night-center"><Sigil kind="moon"/><h2>第2夜</h2><span className="wt-wait-dots">· · ·</span></div>;
    return <div className="wt-table-center"><Candle/><h2>{scene === "lobby" ? "小镇集会" : scene === "result" ? "终局" : scene === "black" || scene === "conspiracy" ? "阴谋" : scene === "trial" ? "审判" : "白天 · 第2日"}</h2><small>牌堆 28 · 弃牌 9</small></div>;
  }

  function eventContent() {
    if (scene === "black") return <><div className="wt-event-heading"><span>黑色事件</span><h2>阴谋</h2><p>抽到时立即执行</p></div><div className="wt-black-display"><Card kind="conspiracy"/></div><p className="wt-event-copy">先处理黑猫，再由所有存活玩家同时传牌。</p></>;
    if (scene === "trial") return <><div className="wt-event-heading"><span>公开审判 · {trialSeat+1}号 {trialName}</span><h2>{reveal ? "女巫现形" : "揭开一张审判牌"}</h2><p>{reveal ? "审判牌已公开，进入死亡结算" : "7/7 指控 · 由你选择背面牌"}</p></div><div className={`wt-tryals wt-reveal-stage ${reveal ? "wt-smoke" : ""}`}>{Array.from({length:tryalCount-(trialSeat===4?1:0)},(_,i)=>i).map(i => <SealedCard key={i} number={i + 1} selected={pick === i} revealed={reveal} kind={pick === i ? "witch" : "not_witch"} onClick={() => !reveal && setPick(i)}/>)}</div></>;
    if (scene === "conspiracy") return <><div className="wt-event-heading"><span>阴谋 · 同时传牌</span><h2>{passed ? "你的新审判牌" : "从左邻抽取一张"}</h2><p>{passed ? "仅你可见，随后混入自己的隐藏牌" : `${count}号 ${PEOPLE[count-1][0]} · 只能选择背面`}</p></div><div className="wt-tryals">{(passed ? [0] : Array.from({length:tryalCount},(_,i)=>i)).map(i => <SealedCard key={i} number={i + 1} selected={pick === i} revealed={passed && peek === "new"} kind="not_witch" onClick={() => setPick(i)}/>)}</div>{passed && <button className="wt-peek-button" {...pressProps("new")}>按住查看新牌</button>}<p className="wt-completion"><i/>{passed ? count : count-1}/{count} 人已完成选择</p></>;
    if (scene === "night-town" || scene === "night-witch") return <><div className="wt-event-heading"><span>私人行动</span><h2>{scene === "night-witch" ? "今夜，女巫苏醒" : "请闭眼，静候黎明"}</h2><p>{scene === "night-witch" ? "只有你与同伴看得到这里" : "秘密行动正在进行"}</p></div><div className="wt-night-panel"><Sigil kind="moon"/>{scene === "night-witch" ? <><p>同伴已提议：{trialSeat+1}号 {trialName}</p><div className="wt-target-chips">{[0, 1, 4, 6].filter(i => i < count).map(i => <button key={i} aria-pressed={selected === i} onClick={() => setSelected(i)}>{i + 1}号 {i === 0 ? "自己" : PEOPLE[i][0]}</button>)}</div><p>等待女巫共同确认同一目标</p></> : <><p>无需操作，请保持页面打开。</p><span className="wt-wait-dots">· · ·</span><p>夜间行动结束后，自动迎来黎明</p></>}</div></>;
    if (scene === "confession") return <><div className="wt-event-heading"><span>天亮之前</span><h2>{selfReveal ? "你的自白已公开" : confirmSelf ? "确认公开这张牌？" : "要向小镇自白吗？"}</h2><p>{selfReveal ? "今晚不会因女巫袭击死亡" : "公开自己的一张审判牌，自白后无法收回"}</p></div><div className="wt-confession-row"><Ring left={seconds}/><div className="wt-tryals">{Array.from({length:tryalCount},(_,i)=>i).map(i => <SealedCard key={i} number={i + 1} selected={pick === i} revealed={selfReveal && pick === i} onClick={() => { if (!selfReveal) { setPick(i); setConfirmSelf(true); } }}/>)}</div></div></>;
    if (scene === "loot") return <><div className="wt-event-heading"><span>{Math.min(5,count-1)+1}号 {PEOPLE[Math.min(5,count-1)][0]}的遗留牌</span><h2>共同分牌</h2><p>农民先选，随后轮到裁缝 · 余牌归农民</p></div><div className="wt-loot-progress"><span className="is-current">你 · 农民 {taken}/3</span><span>小雨 · 裁缝 2/3</span><Ring left={seconds}/></div><div className="wt-loot-cards">{["evidence", "robbery", "piety", "alibi"].map((k, i) => <Card key={k} kind={k} selected={pick === i} compact onClick={() => setPick(i)}/>)}</div></>;
    if (scene === "tituba") return <><div className="wt-event-heading"><span>说书人 · 每局一次</span><h2>重排命运</h2><p>最上方先抽 · 拖动或使用上下箭头</p><Ring left={seconds} total={60}/></div><div className="wt-order-list">{order.map((k, i) => <div key={k} draggable onDragStart={() => { drag.current = i; }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag.current != null) move(drag.current, i); drag.current = null; }}><b>{i + 1}</b><Sigil kind={k}/><span>{CARDS[k].name}</span><button aria-label={`上移${CARDS[k].name}`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button><button aria-label={`下移${CARDS[k].name}`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>↓</button></div>)}</div></>;
    if (scene === "result") return <><div className="wt-event-heading"><span>小镇重获安宁</span><h2>平民获胜</h2><p>全部女巫审判牌已揭示</p></div><div className="wt-victory-seal"><Sigil kind="not_witch"/><strong>你赢了</strong></div><div className="wt-result-list">{PEOPLE.slice(0, count).map(([n, role], i) => <div key={n} className={i === 2 || i === 4 ? "wt-result-witch" : "wt-result-winner"} style={{ "--wt-i": i } as CSSProperties}><b>{i + 1}号 {i === 0 ? name : n}{(i === 2 || i === 4) && <em>曾是女巫</em>}</b><span>{role}</span><span className="wt-result-tryals" aria-label={`${tryalCount}张已公开审判牌`}>{Array.from({length:tryalCount},(_,j)=><SealedCard key={j} number={j+1} revealed kind={(i === 2 || i === 4) && j === 0 ? "witch" : "not_witch"}/>)}</span></div>)}</div><div className="wt-confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--wt-i": i } as CSSProperties}/>)}</div></>;
    return null;
  }

  function actions() {
    if (scene === "lobby") return <><button onClick={() => { setReady(!ready); message(ready ? "已取消准备" : "你已准备就绪"); }}>{ready ? "取消准备" : "准备"}</button><button className="wt-primary" disabled={!ready} onClick={() => go("day-me")}>房主开始</button></>;
    if (scene === "target") return <><button onClick={() => go("day-me")}>取消</button><button className="wt-primary" disabled={selected == null || flying} onClick={play}>确认出牌</button></>;
    if (scene === "trial") return <button className="wt-primary" disabled={pick == null || reveal} onClick={() => { setReveal(true); feel("lose"); announce(`${trialSeat+1}号${trialName}是女巫`); message(`${trialSeat+1}号${trialName}的女巫审判牌已公开。`); }}>确认揭牌</button>;
    if (scene === "black") return <button className="wt-primary" onClick={() => go("conspiracy")}>处理阴谋</button>;
    if (scene === "conspiracy") return <button className="wt-primary" disabled={pick == null || passed} onClick={() => { setPassed(true); announce("传牌完成"); }}>确认选择</button>;
    if (scene === "night-witch") return <><button disabled={!confirmNight} onClick={()=>setConfirmNight(false)}>取消</button><button className="wt-primary" disabled={selected == null} onClick={() => {if(!confirmNight) setConfirmNight(true); else {message("你已秘密确认目标，等待同伴一致。");setConfirmNight(false);}}}>{confirmNight ? "再次确认袭击" : "秘密确认目标"}</button></>;
    if (scene === "night-town") return <button disabled>等待秘密行动…</button>;
    if (scene === "confession") return <><button onClick={() => { setLiveTimer(x => !x); message("样稿：计时演示已切换"); }}>{liveTimer ? "暂停演示" : "演示计时"}</button><button className="wt-primary" disabled={selfReveal} onClick={() => { if (!confirmSelf) { setConfirmSelf(true); message("请选择自己的一张审判牌，再确认。"); } else if (pick == null) message("请先选择一张审判牌"); else { setSelfReveal(true); setNotice(""); announce("阿宁已自白"); } }}>{confirmSelf ? "确认自白" : "自白"}</button></>;
    if (scene === "loot") return <button className="wt-primary" disabled={pick == null || taken >= 3} onClick={() => { setTaken(3); setPick(null); message("你已选满3张，等待裁缝选择。"); }}>收下选中的牌</button>;
    if (scene === "tituba") return sorted ? <><button onClick={() => { announce("顺序已保存 · 开始出牌"); go("day-me"); }}>出牌</button><button className="wt-primary" onClick={() => { message("样稿：按新顺序抽2张，回合结束"); setScene("day-12"); }}>抽2张</button></> : <button className="wt-primary" onClick={() => { setSorted(true); message("已保存排序，请选择抽2张或出牌。"); }}>保存排序</button>;
    if (scene === "dead") return <button disabled>观战中 · 无法行动</button>;
    if (scene === "result") return <><button onClick={() => setDetails("records")}>结算记录</button><button className="wt-primary" onClick={() => go("lobby")}>返回大厅</button></>;
    if (scene === "day-12") return <button disabled>等待山姆出牌…</button>;
    return <><button onClick={() => { message("样稿：已抽到辩护与证据"); announce("抽取2张 · 回合结束"); }}>抽2张</button><button className="wt-primary" onClick={() => { if (card) { setScene("target"); setSelected(null); } else message("先点选底部的一张手牌，再选择目标。"); }}>选牌出牌</button></>;
  }

  return <main className={`wt-world ${night ? "wt-is-night" : ""} ${myTurn ? "wt-my-turn" : ""} wt-scene-${scene} ${reveal ? "wt-witch-revealed" : ""} ${powerSaving ? "wt-power-saving" : ""}`} onClickCapture={e => { if ((e.target as HTMLElement).closest("button,summary")) feel("tap"); }} data-testid="wt-world">
    <RoomArt/>
    <header className="wt-top"><a href="/" aria-label="返回桌游合集">‹</a><div className="wt-brand"><strong>女巫镇</strong><span>SALEM 1692</span></div><div className="wt-top-info"><b>月鸦 W1692</b><span>{stage} · {scene === "lobby" ? `${count}人` : "28张"}</span></div><button className="wt-icon-button" aria-label={muted ? "开启音效" : "关闭音效"} onClick={() => { setSoundOn(muted); setMuted(!muted); }}>{muted ? "静" : "声"}</button><button className="wt-icon-button" aria-label="场景与记录" onClick={() => setDetails("menu")}>☷</button></header>
    {resumed && <span className="wt-resumed">已回到当前阶段 · 样稿未联网</span>}<span className="wt-preview-watermark">视觉样稿 · 未联网</span>
    <div className="wt-workspace">
      <section ref={tableRef} className={`wt-table-space ${count >= 9 ? "wt-dense" : ""}`} aria-label={`${count}人圆桌`}>
        <div className="wt-table-wood"><div className="wt-table-felt"/><div className="wt-candle-light"/></div>
        {center()}
        {!night && PEOPLE.slice(0, count).map(([n, role], i) => {
          const theta = angles[i], position = curve(theta), threshold = i === 10 ? 8 : 7, accusations = i === 4 ? Math.min(7, 5 + extra) : i % 4 === 2 ? 3 : i % 3;
          return <React.Fragment key={i}><button className={`wt-seat ${i === 0 ? "wt-self" : ""} ${i === (scene === "day-12" ? 2 : 0) && scene !== "dead" ? "wt-active" : ""} ${scene === "target" && i !== 0 ? "wt-pickable" : ""} ${selected === i ? "wt-selected" : ""} ${((scene === "dead" && i === 0) || (scene === "trial" && reveal && i === trialSeat)) ? "wt-dead-seat" : ""} ${shake === i ? "wt-shake" : ""}`} style={{ left: `${50 + radiusX * 100 * position.x}%`, top: `${50 + radiusY * 100 * position.y}%`, "--wt-seat-w": `${seatWidth}px`, "--wt-seat-h": `${seatHeight}px`, "--wt-light-angle": `${Math.atan2(-Math.sin(theta), -Math.cos(theta)) * 180 / Math.PI + 90}deg`, "--wt-sx": `${Math.cos(theta) * 3}px`, "--wt-sy": `${Math.sin(theta) * 3}px` } as CSSProperties} onClick={() => chooseSeat(i)} aria-label={`${i + 1}号${i === 0 ? name : n}，${shownRole(i)}，${accusations}/${threshold}点指控，点击查看详情`} aria-pressed={selected === i} aria-disabled={scene === "target" && i === 0} data-seat={i}>
            <span className="wt-seat-person">{count <= 8 && <span className="wt-seat-face"><Portrait index={i}/></span>}<span className="wt-seat-text"><span className="wt-seat-name">{i === 0 ? name : n}</span>{count <= 8 && <span className="wt-seat-role">{scene === "lobby" ? i === 0 ? "房主" : "已入座" : shownRole(i)}</span>}</span></span>
            <span className="wt-accuse-row"><span className={`wt-accuse ${accusations >= threshold ? "is-full" : ""}`}><i style={{width:`${scene === "lobby" ? 0 : accusations / threshold * 100}%`}}/></span><b>{scene === "lobby" ? i !== 0 || ready ? "准备" : "待定" : `${accusations}/${threshold}`}</b></span>
            <span className="wt-seat-public">{scene !== "lobby" && <>{count <= 8 && <span className="wt-hand-count" aria-label={`手牌${i === 0 ? handCount : 3}张`}>▤{i === 0 ? handCount : 3}</span>}{effects(i).map(k=><span key={k} className="wt-effect-token" title={effectNames[k]} aria-label={effectNames[k]}><Sigil kind={k}/></span>)}{i === 6 && <span className="wt-effect-token" title="警长木槌" aria-label="警长木槌"><Sigil kind="constable"/></span>}{publicKinds(i).length > 0 && <span className={`wt-public-mini ${publicKinds(i).includes("witch") ? "is-witch" : ""}`} aria-label={`已公开${publicKinds(i).length}张审判牌`}><Sigil kind={publicKinds(i).includes("witch") ? "witch" : "not_witch"}/><span>{publicKinds(i).length}</span></span>}</>}</span>
            {i === 0 && <i className="wt-me-tag">我</i>}

          </button><b className="wt-seat-number" data-seat-number={i} aria-hidden="true" style={{left:`${50 + radiusX*100*position.x}%`,top:`${50+radiusY*100*position.y}%`,transform:`translate(${-seatWidth/2-15}px,${-seatHeight/2-8}px)`}}>{i+1}</b></React.Fragment>;
        })}
        {flying && <div className="wt-flying-card"><Card kind="evidence" compact/></div>}
      </section>
      <aside className={`wt-personal ${eventScene ? "wt-event-panel" : ""}`} aria-label={eventScene ? "当前事件" : "我的区域"}>
        {scene === "lobby" ? <div className="wt-lobby-form"><div className="wt-section-label"><b>召集你的镇民</b><span>{count}/12席</span></div><label>你的昵称<input value={name} maxLength={12} onChange={e => setName(e.target.value)}/></label><label className="wt-room-count">房间人数<select aria-label="房间人数" value={count} onChange={e=>setCount(Number(e.target.value))}>{Array.from({length:9},(_,i)=>i+4).map(n=><option key={n} value={n}>{n} 人</option>)}</select></label><button className="wt-invite" onClick={() => message("这是视觉样稿；邀请链接将在关卡2接入。")}>邀请朋友入座 ↗</button><p>你是房主 · {ready ? "已准备" : "尚未准备"}</p></div> : eventScene ? eventContent() : <><div className="wt-private-heading"><div><b>{scene === "dead" ? "公开审判牌" : "我的审判牌"}</b><span>{count <= 7 ? 5 : count <= 9 ? 4 : 3}张 · {scene === "dead" ? "已全部公开" : "身份保密"}</span></div><button onClick={() => setDetails("identity")}>{scene === "dead" ? "查看公开牌" : "查看私牌"}</button></div><div className="wt-mini-tryals">{Array.from({ length: count <= 7 ? 5 : count <= 9 ? 4 : 3 }, (_, i) => <SealedCard key={i} number={i + 1} revealed={scene === "dead"} kind={i === tryalCount-1 ? "constable" : "not_witch"} />)}</div><div className="wt-section-label"><b>{scene === "dead" ? "仅可观战" : "我的手牌"}</b><span>{scene !== "dead" && `手牌 ${handCount} 张`}</span><button onClick={() => setDetails("records")}>记录 ↗</button></div>{scene !== "dead" ? <div className={`wt-hand ${handCount > 5 ? "wt-hand-many" : ""}`}>{mockHand.map((k, i) => <div key={`${k}-${i}`} style={{ "--wt-tilt": `${(i - 2) * 2.5}deg`, "--wt-i": i } as CSSProperties}><Card kind={k} compact selected={card === k} onClick={() => { setCard(k); setDetails("card"); }}/></div>)}</div> : <p className="wt-spectator-note">你只能查看公开局势。存活玩家的手牌、隐藏身份与夜间选择仍然保密。</p>}<details className="wt-inline-records" open={tableSize.w >= 600}><summary>公开记录</summary><div>{log.map((x,i)=><p key={i}>{x}</p>)}</div></details></>}
      </aside>
    </div>
    <footer className={`wt-dock ${myTurn && scene !== "lobby" ? "wt-dock-active" : ""}`} aria-label="行动栏"><div className="wt-dock-hint"><i/>{hint}</div><div className="wt-dock-buttons">{actions()}</div></footer>
    {banner && <div key={banner.id} className="wt-phase-banner" role="status"><strong>{banner.text}</strong></div>}
    {notice && <div className="wt-toast" role="status">{notice}</div>}
    {details && <div className="wt-modal-backdrop" onClick={() => setDetails(null)}><section className={`wt-modal ${details === "card" ? "wt-card-sheet" : ""}`} role="dialog" aria-modal="true" aria-label="详细信息" onClick={e => e.stopPropagation()}><div className="wt-sheet-grip" onPointerDown={e=>{swipeStart.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{if(swipeStart.current!=null&&e.clientY-swipeStart.current>65){setDetails(null);setPeek(null);}swipeStart.current=null;}} aria-hidden="true"><i/></div><button className="wt-close" aria-label="关闭详情" onClick={() => setDetails(null)}>×</button>
      <div className="wt-sheet-body">{details === "menu" ? <><span className="wt-kicker">视觉审核 · 场景导航</span><h2>月鸦小镇</h2><p>房间信息：假数据样稿，不连接真实房间。部分张数待官方核实。</p><div className="wt-scene-menu">{SCENES.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}</div><button onClick={() => {setPowerSaving(v=>{try{localStorage.setItem("wt-power",v?"0":"1");}catch{}return !v;});}} aria-pressed={powerSaving}>省电模式：{powerSaving ? "开启" : "关闭"}</button><button onClick={() => setDetails("records")}>查看公开记录</button></> : details === "card" && card ? <><Card kind={card}/><h2>{CARDS[card].name}</h2><p>{CARDS[card].text}</p><button className="wt-primary" disabled={!myTurn} onClick={() => { setDetails(null); setScene("target"); setSelected(null); }}>使用</button></> : details === "identity" ? <><span className="wt-kicker">仅你可见</span><h2>我的审判牌</h2><p>请留意身旁的人。这里不会显示其他人的秘密。</p><div className="wt-tryals">{Array.from({length:tryalCount},(_,i)=> <SealedCard key={i} number={i + 1} revealed={peek === "own" || scene === "dead"} kind={i === tryalCount-1 ? "constable" : "not_witch"}/>)}</div><button className="wt-peek-button" {...pressProps("own")}>按住查看审判牌 · 松手盖回</button></> : details === "seat" ? <><Portrait index={detailSeat}/><h2>{detailSeat + 1}号 {detailSeat === 0 ? name : PEOPLE[detailSeat][0]}</h2><p>{shownRole(detailSeat)} · {(detailSeat === 0 && scene === "dead") || (scene === "trial" && reveal && detailSeat === trialSeat) ? "已淘汰" : "存活"}</p><p>隐藏审判牌 {tryalCount - publicKinds(detailSeat).length}张 · 手牌{detailSeat === 0 ? handCount : 3}张</p><p>指控 {detailSeat === 4 ? Math.min(7, 5 + extra) : detailSeat % 4 === 2 ? 3 : detailSeat % 3}/{detailSeat === 10 ? 8 : 7}</p><h3>人物能力</h3><p>{CHARACTERS.find(c => c.nameZh === shownRole(detailSeat))?.abilityZh}</p><h3>面前的蓝牌</h3><div className="wt-public-effects">{effects(detailSeat).length ? effects(detailSeat).map(k=><div key={k}><Sigil kind={k}/><strong>{effectNames[k]}</strong><p>{k === "cat" ? "阴谋发生时先揭示一张审判牌。" : k === "matchmaker" ? "情侣一方死亡时，另一方连锁死亡；按规则例外处理。" : "夜晚不会被女巫袭击。"}</p></div>) : "无"}</div><h3>面前的红牌</h3><p>{detailSeat === 4 ? "证据 ×1（3点） · 指控 ×2（各1点）" : detailSeat % 4 === 2 ? "证据 ×1（3点）" : `指控 ×${detailSeat % 3}`}</p><h3>已公开审判牌</h3>{publicKinds(detailSeat).length ? <div className="wt-detail-revealed">{publicKinds(detailSeat).map((k,i)=><SealedCard key={i} number={i+1} revealed kind={k}/>)}</div> : <p>无。其他隐藏身份不显示。</p>}</> : <><span className="wt-kicker">公开事件</span><h2>小镇记录</h2><div className="wt-record-list">{log.map((x, i) => <p key={i}>{x}</p>)}</div><p>未记录他人的秘密操作。</p></>}
    </div><button className="wt-sheet-close" onClick={()=>{setDetails(null);setPeek(null);}}>关闭</button></section></div>}
  </main>;
}
