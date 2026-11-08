import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createTARoom, savedName, useTARoom } from "./ta-net.ts";
import { ABILITIES, AGENDA_TEXT, CARD_TEXT, CHAR_NAME, QUESTION, WOUND_TEXT, RULES, zh, type Step } from "./text.ts";
import { CHARACTERS, ENERGY_GOAL, ENERGY_SAFE, OXYGEN_MAX, SETUP } from "../../../../packages/menace/src/data.ts";
import "./ta.css";
import type { Contribution } from "../../../../packages/menace/src/index.ts";
import type { Scene } from "./scenes.ts";
import vfxMeta from "../vfx-meta.json" with { type: "json" };
import { music, sfx, setMute, muted, playEnding, stopEnding } from "./sound.ts";
const img = (n: string) => `/assets/menace/${n}.webp`;
const PHASE: Record<string, string> = { setup: "选择角色", action: "行动阶段", resolve: "匿名结算", review: "结算回顾", accuse: "讨论与指控", vote: "放逐投票", over: "对局结束" };
export function Menace() {
  const q = new URLSearchParams(location.search); const code = q.get("room")?.toUpperCase();
  if (!code) return <Entry />;
  return <Room code={code} />;
}
const TABS: [string, string[]][] = [["玩法", ["游戏目标", "胜利条件", "开局", "每轮流程", "重要限制", "操作提示"]], ["名词", ["卡牌和名词"]], ["受伤投票", ["受伤是什么", "死亡", "投票与放逐", "伤害牌一览"]], ["卡牌", ["行动牌一览"]], ["身份", ["身份牌一览"]], ["角色", ["角色能力一览"]]];
function factions(n: number) {
  const setup = SETUP[n];
  if (!setup) return "满 4 人后显示本局阵营构成";
  return `本局 ${setup.menace} 名内鬼、${setup.crew + (setup.saint ? 1 : 0)} 名船员${setup.coward ? "、1 名中立" : ""}`;
}
function Rules({ count }: { count?: number }) { const [t, setT] = useState(0); return <div className="ta-help" onClick={(e) => e.stopPropagation()}><div className="ta-tabs">{TABS.map(([n], i) => <button key={n} type="button" className={i === t ? "on" : ""} onClick={() => setT(i)}>{n}</button>)}</div><div className="ta-tabbody">{count ? <p className="ta-factions">{factions(count)}</p> : null}{RULES.filter(([h]) => TABS[t][1].includes(h)).map(([h, ps]) => <section key={h}><h3>{h}</h3>{ps.map((x) => <p key={x}>{x}</p>)}</section>)}</div></div>; }
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
  if (s.stage === "lobby") return <div className="ta-world ta-entry"><h2>房间 {code}</h2><p>把房间号发给朋友，需要 4–8 人。</p><p className="ta-factions">{factions(s.players.length)}</p><details className="ta-rules"><summary>查看游戏规则</summary><Rules count={s.players.length} /></details><ul className="ta-list">{s.players.map((p: any) => <li key={p.playerId}>{p.name}{p.host ? "（房主）" : ""}{p.connected ? "" : " · 离线"}</li>)}</ul>
    {host ? <><div className="ta-row"><button className={s.mode === "basic" ? "on" : ""} onClick={() => r.lobby({ type: "SET_MODE", mode: "basic" })}>基础模式</button><button className={s.mode === "advanced" ? "on" : ""} onClick={() => r.lobby({ type: "SET_MODE", mode: "advanced" })}>进阶模式</button></div><button onClick={async () => setMsg((await r.lobby({ type: "ADD_BOT" })) ?? "")}>添加人机</button><button className="ta-primary" onClick={async () => setMsg((await r.lobby({ type: "START" })) ?? "")}>开始（{s.players.length} 人）</button></> : <p>{s.mode === "basic" ? "基础模式" : "进阶模式"}，等待房主开始。</p>}<p className="ta-err">{msg}</p></div>;
  return <Game key={`${s.code}-${s.round}`} snap={s} seen={r.sceneDone} takeScenes={r.takeScenes} send={async (c) => setMsg((await r.command(c)) ?? "")} msg={msg} clear={() => setMsg("")} restart={() => r.lobby({ type: "START" })} host={host} online={r.connected} />;
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
const zoomOf = { agenda: (a: string) => <InfoCard round tone={AGENDA_TONE(a)} kind="身份" name={AGENDA_TEXT[a][0].split("（")[0]} pic={img("a_" + a)} text={AGENDA_TEXT[a][1]} />, wound: (w: string) => <InfoCard round tone="#b3201a" kind="伤害报告" name={WOUND_TEXT[w].split("：")[0]} pic={w === "frenzied" ? "" : img("w_" + w)} text={WOUND_TEXT[w].split("：")[1]} />, char: (c: string) => { const [x, y] = CHARACTERS[c].ab; return <InfoCard tone="#3fb0a0" kind="角色" name={CHAR_NAME[c]} pic={img("p_" + c)} text={`${ABILITIES[x].name}${ABILITIES[x].cost ? "（" + ABILITIES[x].cost + "）" : ""}：${ABILITIES[x].text}\n${ABILITIES[y].name}${ABILITIES[y].cost ? "（" + ABILITIES[y].cost + "）" : ""}：${ABILITIES[y].text}`} />; } };
const CARD_FX: Record<string, string> = { basic_repair: "repair", advanced_repair: "repair", raise_morale: "heal", command: "complete", replicate: "teleport", brawl: "hook", backstab: "slash", panic: "shock", airlock: "crow", explosion: "pallet", reactor: "power" };
const SKILL_FX: Record<string, string> = { first_aid: "heal", regenerate: "heal", laser_pistol: "slash", crunch: "hook", bloodwork: "reveal", surveillance: "reveal", restructure: "teleport", rush: "dust", efficiency: "dust", equip: "complete", resupply: "complete", synchronize: "complete", formulate: "complete", commandeer: "coins", salvage: "coins", todays_special: "coins", system_refresh: "portal", delegate: "power", veto: "shock", guard: "trap", lockdown: "trap", deflect: "trap", moxie: "power", damage_control: "repair", rewind: "teleport", mimic: "teleport", helping_hand: "rescue", strategize: "hide" };
function Vfx({ id }: { id: string }) {
  const m = (vfxMeta as any)[id]; if (!m) return null; const k = Math.min(5, 300 / m.w);
  return <div className="ta-vfx" style={{ width: m.w, height: m.h, zoom: undefined, transform: `translate(-50%,-50%) scale(${k})` }}><i style={{ width: m.w * m.n, height: m.h, backgroundImage: `url(/assets/cc0/vfx/${id}.png)`, animation: `ta-vfx ${m.n * m.ms}ms steps(${m.n}) forwards`, "--x": `-${m.w * m.n}px` } as any} /></div>;
}
function Bar({ label, v, max, mark, cls, delay }: { label: string; v: number; max: number; mark?: number; cls: string; delay: number }) {
  const [display, setDisplay] = useState({ value: v, previous: v });
  useEffect(() => {
    const update = () => setDisplay(current => current.value === v ? current : { value: v, previous: current.value });
    if (delay === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }
    const timer = setTimeout(update, delay);
    return () => clearTimeout(timer);
  }, [v, delay]);
  return <div className={"ta-bar " + cls}><span>{label}</span>
    <i><b style={{ transform: `scaleX(${display.value / max})` }} />
      {display.previous !== display.value ? <span key={display.value} className="ta-meter-light" /> : null}
      {mark ? <u style={{ left: `${(mark / max) * 100}%` }} /> : null}
    </i>
    <em aria-label={`${v}/${max}`}>
      {display.previous !== display.value ? <span key={display.value} className="ta-meter-numbers" aria-hidden="true"><span>{display.previous}/{max}</span><span>{display.value}/{max}</span></span> : <span aria-hidden="true">{display.value}/{max}</span>}
    </em>
  </div>;
}
const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0";
function ContributionLine({ entry }: { entry: Contribution }) {
  return <div className="ta-contributions">
    <div><small>造成伤害</small><strong>{entry.damage}</strong><small>受到 {entry.damageTaken ?? 0}</small></div>
    {(["oxygen", "energy"] as const).map(resource => {
      const { gained, spent } = entry[resource];
      const net = gained - spent;
      return <div key={resource}>
        <small>{resource === "oxygen" ? "氧气净值" : "能量净值"}</small>
        <strong className={net > 0 ? "gain" : net < 0 ? "loss" : ""}>{signed(net)}</strong>
        <small>补充 {gained} · 消耗 {spent}</small>
      </div>;
    })}
  </div>;
}

function SceneOverlay({ scene, name, finish }: { scene: Scene; name: (seat: number) => string; finish: () => void }) {
  const fixName = (t: string) => t.replace(/座位(\d+)/g, (_, seat) => name(Number(seat) - 1));
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const ending = scene.kind === "ending";
  const endingAsset = scene.kind === "ending" ? scene.win ? "end_win" : "end_lose" : null;
  useEffect(() => {
    if (!endingAsset) return;
    // 音频独立于过场节点，过场退出后仍由音频模块持有。
    const track = new Audio(`/assets/menace/audio/${endingAsset}.mp3`);
    track.preload = "auto";
    audio.current = track;
    return () => { audio.current = null; };
  }, [endingAsset]);
  const close = useRef(finish);
  close.current = finish;
  const [unavailable, setUnavailable] = useState(false);
  const videoKind = scene.kind === "death" || scene.kind === "exile" || scene.kind === "ending";
  useEffect(() => {
    if (videoKind || scene.kind === "private") return;
    const sound = setTimeout(() => {
      if (scene.kind === "reveal") sfx(scene.card.includes("repair") ? "repair" : "reveal");
      if (scene.kind === "wound") sfx("sabotage");
    }, scene.kind === "reveal" ? 340 : 0);
    const manual = scene.kind === "notice" || scene.kind === "agenda";
    const timer = manual ? undefined : setTimeout(() => close.current(), scene.kind === "reveal" ? 1400 : scene.kind === "wound" ? 1900 : scene.kind === "vote" ? 1300 : 850);
    return () => { clearTimeout(sound); clearTimeout(timer); };
  }, [scene, videoKind]);
  useEffect(() => {
    const element = video.current;
    if (!videoKind || !element) return;
    let active = true;
    let bridgeRetry = false;
    const play = () => {
      if (!active || element.error) return;
      try { void element.play()?.catch(() => {}); } catch { /* 等待启动检查 */ }
    };
    const retry = () => {
      if (!bridgeRetry && element.paused) { bridgeRetry = true; play(); }
    };
    play();
    document.addEventListener("WeixinJSBridgeReady", retry);
    element.addEventListener("canplay", play, { once: true });
    const startup = setTimeout(() => {
      if (element.currentTime <= 0) setUnavailable(true);
    }, 6000);
    const watchdog = setTimeout(() => close.current(), 16000);
    return () => {
      active = false;
      document.removeEventListener("WeixinJSBridgeReady", retry);
      element.removeEventListener("canplay", play);
      clearTimeout(startup);
      clearTimeout(watchdog);
    };
  }, [videoKind]);
  useEffect(() => {
    if (!unavailable) return;
    const timer = setTimeout(() => close.current(), ending ? 4000 : 1500);
    return () => clearTimeout(timer);
  }, [unavailable, ending]);
  if (scene.kind === "death" || scene.kind === "exile" || scene.kind === "ending") {
    const asset = endingAsset ?? (scene.kind === "death" ? "fx_death" : "fx_exile");
    const label = ending ? scene.win ? "船员胜利" : "内鬼胜利" : `${name(scene.seat)} ${scene.kind === "death" ? "阵亡" : "被放逐"}`;
    return <div className="ta-sequence ta-sequence-video" role="dialog" aria-modal="true" data-scene={scene.kind}>
      <video ref={element => {
        video.current = element;
        if (!element) return;
        element.muted = true;
        element.setAttribute("muted", "");
        element.setAttribute("webkit-playsinline", "");
      }} autoPlay muted playsInline poster={img(asset + "_poster")} preload="auto" src={`/assets/menace/${asset}.mp4`}
        onPlaying={() => {
          setUnavailable(false);
          if (audio.current) playEnding(audio.current);
        }} onEnded={finish} onError={() => setUnavailable(true)} />
      <h2 className="ta-cinematic-caption">{label}</h2>
      <button className="ta-sequence-skip" onClick={finish}>跳过演出</button>
    </div>;
  }
  if (scene.kind === "resource") {
    return <div className="ta-resource-float" data-scene="resource" role="status">
      {scene.label.split("　").map(label => <strong key={label} className={label.includes("-") ? "loss" : "gain"}>{label}</strong>)}
    </div>;
  }
  return <div className="ta-sequence" role="dialog" aria-modal="true" data-scene={scene.kind}>
    {scene.kind === "reveal" ? <div className="ta-sequence-card"><div className="ta-flip"><div className="ta-flip-back">暗置行动</div><div className="ta-flip-front"><GameCard type={scene.card} /></div></div><Vfx id={CARD_FX[scene.card]} /></div> : null}
    {scene.kind === "wound" ? <><h2>{name(scene.seat)} 受伤</h2><div className="ta-sequence-card"><div className="ta-flip"><div className="ta-flip-back">伤害报告</div><div className="ta-flip-front">{zoomOf.wound(scene.wound)}</div></div></div></> : null}
    {scene.kind === "vote" ? <><h2>发起放逐投票</h2><div className="ta-gun ta-sequence-gun"><svg viewBox="0 0 200 120" aria-hidden="true"><path d="M8 28h150l14 12v16H92l-10 12-8 44H34l10-52H8z" fill="#2c332c" stroke="#000" strokeWidth="5"/><path d="M8 28h150v10H8z" fill="#6f8350"/><rect x="150" y="44" width="46" height="9" fill="#e0a92a" stroke="#000" strokeWidth="3"/></svg></div></> : null}
    {scene.kind === "private" ? <><h2>{scene.label}</h2><div className="ta-sequence-card"><GameCard type={scene.card} /></div></> : null}
    {scene.kind === "agenda" ? <div className="ta-skill-notice agenda"><Vfx id="power" /><strong>身份能力发动</strong><h2>{fixName(scene.label)}</h2>{scene.effects?.length ? <ul>{scene.effects.map((e) => <li key={e} className={/-|受到|阵亡/.test(e) ? "loss" : "gain"}>{fixName(e)}</li>)}</ul> : null}</div> : null}
    {scene.kind === "notice" ? <div className="ta-skill-notice">{scene.ab ? <Vfx id={SKILL_FX[scene.ab] ?? "power"} /> : null}<strong>技能发动</strong>{scene.seat !== undefined ? <p className="who">{name(scene.seat)}</p> : null}<h2>{scene.label}</h2>{scene.ab ? <p className="desc">{ABILITIES[scene.ab]?.text}</p> : null}{scene.effects?.length ? <ul>{scene.effects.map((e) => <li key={e} className={/-|受到|阵亡/.test(e) ? "loss" : "gain"}>{fixName(e)}</li>)}</ul> : null}</div> : null}
    <button className="ta-sequence-skip" onClick={finish}>{scene.kind === "private" ? "关闭牌面" : scene.kind === "notice" || scene.kind === "agenda" ? "知道了" : "跳过演出"}</button>
  </div>;
}

function Game({ snap: incoming, send: command, seen, takeScenes, msg, clear, restart, host, online }: { snap: any; send: (c: any) => void; seen: (version: number) => void; takeScenes: () => Scene[]; msg: string; clear: () => void; restart: () => void; host: boolean; online: boolean }) {
  const [snap, setFrame] = useState(incoming);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const last = useRef(incoming);
  const scene = scenes[0];
  const busy = useRef(false);
  useLayoutEffect(() => {
    last.current = incoming;
    const added = takeScenes();
    busy.current = Boolean(scene || added.length);
    if (added.length) setScenes(queue => [...queue, ...added]);
    else if (!scene && !incoming.sceneGate) setFrame(last.current);
  }, [incoming, scene, takeScenes]);
  useEffect(() => {
    if (!busy.current && !scene && online && (incoming.sceneGate || snap === incoming)) {
      seen(incoming.sceneGate?.version ?? snap.version);
    }
  }, [scene, snap, incoming, online, seen]);
  const send = (c: any) => {
    if (!scene && !busy.current && !incoming.sceneGate) command(c);
  };
  const finish = () => setScenes(queue => queue[0] === scene ? queue.slice(1) : queue);
  const v = snap.view; const [zoom, setZoom] = useState<{ src: string; text: string; play?: number; selected?: number; node?: any } | null>(null); const [flow, setFlow] = useState<{ ab: string; steps: Step[]; args: any } | null>(null); const [pick, setPick] = useState<number[]>([]); const [showRoundLog, setShowRoundLog] = useState(false);
  const name = (seat: number) => snap.players.find((p: any) => p.playerId === snap.seats[seat])?.name ?? `座位${seat + 1}`;
  const me = v.players[v.you]; const myTurn = v.waiting.includes(v.you); const q = v.question;
  useEffect(() => { setFlow(null); setPick([]); }, [v.phase, v.round, q?.q]);
  useEffect(() => { if (msg) { const t = setTimeout(clear, 3000); return () => clearTimeout(t); } }, [msg]);
  const ending = v.phase === "over";
  const urgent = v.oxygen <= 6;
  const finalizing = incoming.view.phase === "over";
  useEffect(() => {
    if (finalizing) music(null, 1200);
    else music(urgent ? "urgent" : v.phase === "vote" ? "pulse" : "transmission");
  }, [finalizing, urgent, v.phase]);
  useEffect(() => () => { music(null); stopEnding(); }, []);
  useEffect(() => { if (myTurn && !scene && !finalizing) sfx("commit"); }, [myTurn, scene, finalizing]);
  const board = useRef<HTMLDivElement>(null);
  const previousCards = useRef({ round: v.round, hand: me.hand, deck: me.deck, played: me.played });
  useEffect(() => {
    const previous = previousCards.current;
    previousCards.current = { round: v.round, hand: me.hand, deck: me.deck, played: me.played };
    if (previous.round !== v.round || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = board.current;
    const hand = root?.querySelector("nav.ta-hand");
    const seat = root?.querySelector(".ta-seat.me .face");
    const field = root?.querySelector(".ta-main");
    const played = me.played > previous.played;
    const drew = me.deck < previous.deck && me.hand > previous.hand;
    if ((!played && !drew) || !seat || !field) return;
    const positions = played ? [hand ?? seat, seat, field] : [seat, hand ?? seat];
    const points = positions.map((element) => {
      const rect = element.getBoundingClientRect();
      return { transform: `translate(${rect.left + rect.width / 2 - 13}px, ${rect.top + rect.height / 2 - 18}px)`, opacity: 1 };
    });
    points[points.length - 1].opacity = 0;
    const card = document.createElement("span");
    card.className = "ta-flight";
    card.setAttribute("aria-hidden", "true");
    root?.append(card);
    const motion = card.animate(points, { duration: 380, easing: "ease-in-out" });
    motion.onfinish = () => card.remove();
    return () => { motion.cancel(); card.remove(); };
  }, [v.round, me.hand, me.deck, me.played]);
  const offline = host ? v.waiting.flatMap((seat: number) => {
    const player = snap.players.find((p: any) => p.playerId === snap.seats[seat]);
    return player && !player.connected ? [player] : [];
  }) : [];
  const offlineActions = offline.map((player: any) => <button key={player.playerId} onClick={() => send({ t: "auto", player: player.playerId })}>{player.name} 已离线，代为操作</button>);
  const [mute, setM] = useState(muted());
  const [rev, setRev] = useState(false); const start = useRef({ o: v.oxygen, e: v.energy });
  useEffect(() => { if (v.phase === "action") start.current = { o: v.oxygen, e: v.energy }; setRev(false); }, [v.phase, v.round]);
  const [reviewLong, setReviewLong] = useState(false);
  useEffect(() => { setReviewLong(false); if (v.phase !== "review") return; const t = setTimeout(() => setReviewLong(true), 20000); return () => clearTimeout(t); }, [v.phase, v.round]);
  const [banner, setBanner] = useState("");
  useEffect(() => { if (v.phase === "setup") return; if (v.phase === "over") { setBanner(""); return; } setBanner(PHASE[v.phase]); const t = setTimeout(() => setBanner(""), 1100); return () => clearTimeout(t); }, [v.phase]);
  const [help, setHelp] = useState(false);
  const acting = v.phase === "action" && myTurn && !q;
  const abilities: string[] = me.character ? CHARACTERS[me.character].ab : [];
  const step = flow?.steps[Object.keys(flow.args).filter((k) => k !== "_").length];
  const put = (key: string, val: any) => { const args = { ...flow!.args, [key]: val }; const steps = key === "ab" ? [flow!.steps[0], ...ABILITIES[val].steps] : flow!.steps; flow!.steps = steps; const left = steps.slice(Object.keys(args).length); if (!left.length) { send({ t: "ability", ab: flow!.ab, args }); setFlow(null); setPick([]); } else setFlow({ ...flow!, args }); };
  const hint = useMemo(() => { if (v.phase === "over") return v.winner === "crew" ? "船员修复了飞船" : "内鬼得逞了"; if (q) return "需要你决定"; if (myTurn) return v.phase === "accuse" ? "讨论结束后由你结束回合" : "轮到你了"; if (v.waiting.length) return "等待 " + v.waiting.map(name).join("、"); return ""; }, [v]);
  const targets = (other: boolean) => v.players.filter((p: any) => !p.killed && (!other || p.seat !== v.you));
  const confirmChoice = (cards: any[], verb: string, onPick: (id: number) => void, danger = true) => { const sel = cards.find((c) => pick[0] === c.id); return <>
    <p className="ta-pick-hint">先点一张牌选中，再点下方按钮{verb}</p>
    <div className="ta-hand inline">{cards.map((c) => <button key={c.id} className="ta-card" aria-pressed={pick[0] === c.id} onClick={() => setPick(pick[0] === c.id ? [] : [c.id])}><GameCard type={c.type} />{pick[0] === c.id ? <span className="ta-picked">已选择</span> : null}</button>)}</div>
    <button className={danger ? "ta-danger" : "ta-primary"} disabled={!sel} onClick={() => { if (sel) { setPick([]); onPick(sel.id); } }}>{sel ? `确认${verb}「${CARD_TEXT[sel.type][0]}」` : `请选择要${verb}的牌`}</button></>; };
  const cardChoice = (cards: any[], onPick: (id: number) => void) => <div className="ta-hand inline">{cards.map((c) => <button key={c.id} className="ta-card" aria-pressed={pick.includes(c.id)} onClick={() => onPick(c.id)}><GameCard type={c.type} />{pick.includes(c.id) ? <span className="ta-picked">已选择</span> : null}</button>)}</div>;
  const seatChoice = (list: any[], onPick: (s: number) => void) => <div className="ta-grid">{list.map((p: any) => <button key={p.seat} onClick={() => onPick(p.seat)}>{name(p.seat)}</button>)}</div>;
  function question() { if (!q) return null; const a = (value: any) => send({ t: "answer", value }); const yes = <div className="ta-grid"><button className="ta-primary" onClick={() => a(true)}>是</button><button onClick={() => a(false)}>否</button></div>;
    const skip = (t: string) => <button onClick={() => a(null)}>{t}</button>;
    let body: any = yes;
    if (q.q === "discard_down") body = confirmChoice(v.hand, "弃掉", a); if (q.q === "bloodwork") body = confirmChoice(v.hand, "公开", a, false); if (q.q === "formulate") body = confirmChoice(v.hand, "放到牌库底", a, false);
    if (q.q === "heal") body = <div className="ta-grid">{q.data.wounds.map((w: string, i: number) => <button key={i} onClick={() => a(i)}>{WOUND_TEXT[w].split("：")[0]}</button>)}</div>;
    if (q.q === "surveillance") body = <div className="ta-grid">{Array.from({ length: q.data.count }, (_, i) => <button key={i} onClick={() => a(i)}>查看第 {i + 1} 张</button>)}</div>;
    if (q.q === "rush") body = <><p>只有你能看到：{CARD_TEXT[q.data.type][0]}</p><button className="ta-primary" onClick={() => a(true)}>暗置打出</button></>;
    if (q.q === "austere") body = <>{confirmChoice(v.hand, "弃掉", a)}{skip("不使用")}</>;
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
    return <section className="ta-panel ta-skill-flow"><h3>{ab.name}</h3><p>{step.label}</p>
      {step.kind === "seat" ? seatChoice(targets(!!step.other).filter((p: any) => {
        const ab = flow.args.ab ?? flow.ab;
        if (ab === "first_aid") return p.wounds.length > 0;
        if (ab === "commandeer") return p.deck > 0;
        if (ab === "surveillance") return p.played > 0;
        return true;
      }), (s) => put(step.key, s)) : null}
      {step.kind === "card" ? confirmChoice(v.hand, step.key === "discard" ? "弃掉" : step.key === "aside" ? "盖放" : "交出", (id) => put(step.key, id), step.key === "discard") : null}
      {step.kind === "two" ? <><p>已选择 {pick.length}/2 张</p>{cardChoice(v.hand, (id) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id].slice(-2)))}<button className="ta-primary" disabled={pick.length !== 2} onClick={() => put(step.key, pick)}>确定 {pick.length}/2 张</button></> : null}
      {step.kind === "aside" ? <><button className="ta-primary" onClick={() => put(step.key, [...v.aside.map((card: { id: number }) => card.id), flow.args.aside])}>打出全部盖放牌</button><button onClick={() => put(step.key, [])}>保留盖放牌</button></> : null}
      {step.kind === "used" ? <div className="ta-grid">{v.roundAbilities.filter((x: string) => x !== "mimic").map((x: string) => <button key={x} onClick={() => put(step.key, x)}>{ABILITIES[x].name}</button>)}</div> : null}
      <button onClick={() => setFlow(null)}>取消</button></section>; }
  const roundTable = v.phase === "accuse" || v.phase === "vote";
  const hand = v.hand?.length && v.phase !== "setup" ? <nav className={"ta-hand" + (zoom?.selected !== undefined ? " has-selection" : "")}>{v.hand.map((c: any) => <button key={c.id} className="ta-card" aria-pressed={zoom?.selected === c.id} onClick={() => setZoom({ src: img(c.type), text: CARD_TEXT[c.type].join("：\n"), selected: c.id, play: acting ? c.id : undefined })}><GameCard type={c.type} /></button>)}</nav> : null;
  const waitingForScenes = incoming.sceneGate && !scene
    ? <p className="ta-scene-wait" role="status">等待其他玩家查看完毕（{incoming.sceneGate.ready}/{incoming.sceneGate.total}）</p>
    : null;
  if (incoming.sceneGate && snap.sceneGate) {
    return <div className="ta-world ta-game">{scene ? <SceneOverlay key={scene.id} scene={scene} name={name} finish={finish} /> : waitingForScenes}</div>;
  }
  return <div ref={board} className={"ta-world ta-game ph-" + (v.phase === "over" ? (v.winner === "crew" ? "win" : "lose") : v.phase) + (v.oxygen <= 6 ? " danger" : "")}>
    {v.phase !== "setup" ? <div key={v.phase} className="ta-scene" aria-hidden="true" /> : null}
    <header className="ta-hud"><div className="ta-top"><b>{PHASE[v.phase]}{v.round ? ` · 第 ${v.round} 回合` : ""}</b><button className="ta-mute" onClick={() => setHelp(true)}>规则</button><button className="ta-mute" onClick={() => setShowRoundLog(true)}>记录</button><button className="ta-mute" onClick={() => { setMute(!mute); setM(!mute); }}>{mute ? "开声音" : "静音"}</button>{v.agenda && v.phase !== "setup" ? <button className="ta-mute" onClick={() => setZoom({ src: "", text: "", node: zoomOf.agenda(v.agenda) })}>身份</button> : null}<span className={online ? "" : "off"}>{online ? incoming.sceneGate ? "" : hint : "连接中断，正在重连…"}</span></div>{waitingForScenes}
      <Bar label="氧气" v={v.oxygen} max={OXYGEN_MAX} cls="o" delay={v.phase === "resolve" ? 560 : 0} /><Bar label="能量" v={v.energy} max={ENERGY_GOAL} mark={ENERGY_SAFE} cls="e" delay={v.phase === "resolve" ? 560 : 0} /></header>
    <div key={v.phase} className="ta-table"><div className="core" style={{ "--o": `${(v.oxygen / OXYGEN_MAX) * 100}%`, "--e": `${(v.energy / ENERGY_GOAL) * 100}%` } as any}><b>{v.phase === "action" ? v.players.reduce((n: number, p: any) => n + p.played, 0) : v.phase === "vote" ? v.voted : v.remaining}</b><small>{v.phase === "action" ? "已暗置" : v.phase === "resolve" ? "待揭示" : v.phase === "vote" ? "已投票" : PHASE[v.phase]}</small></div>
      {v.players.map((p: any) => { const n = v.players.length, a = ((p.seat - v.you + n) % n) / n * Math.PI * 2 + Math.PI / 2, x = 50 + 38 * Math.cos(a), y = 50 + 38 * Math.sin(a); return <button type="button" key={p.seat} style={{ left: `${x}%`, top: `${y}%` }} className={["ta-seat", v.waiting.includes(p.seat) && v.phase !== "accuse" ? "turn" : "", v.phase === "accuse" && v.speakOrder?.[v.speakIdx] === p.seat ? "turn speaking" : "", p.killed ? "dead" : "", p.exiled ? "exiled" : "", p.seat === v.you ? "me" : ""].join(" ")} onClick={() => setZoom({ src: "", text: "", node: <div className="ta-detail"><h3>{name(p.seat)}{p.seat === v.leader ? " · 任务领袖" : ""}</h3><p>手牌 {p.hand}　牌库 {p.deck}　本轮已出 {p.played}{p.killed ? "　已阵亡" : p.exiled ? "　已放逐" : ""}{snap.players.find((x: any) => x.playerId === snap.seats[p.seat])?.connected ? "" : "　离线"}</p>{p.agenda && p.seat !== v.you ? <p className="rev">身份：{AGENDA_TEXT[p.agenda][0]}</p> : null}{p.wounds.map((w: string, i: number) => <p key={i} className="wd">{WOUND_TEXT[w]}</p>)}{p.character ? zoomOf.char(p.character) : null}</div> })}>
        <i className="face">{v.phase === "accuse" && v.speakOrder?.includes(p.seat) ? <em className="ord">{v.speakOrder.indexOf(p.seat) + 1}</em> : null}{p.character ? <img src={img("p_" + p.character)} alt="" /> : null}{p.seat === v.leader ? <u>★</u> : null}{p.played ? <s aria-label={`已暗置 ${p.played} 张`}>{p.played}</s> : null}</i><b>{name(p.seat)}</b><small>手{p.hand} 库{p.deck}{p.wounds.length ? <em> 伤{p.wounds.length}</em> : null}</small>{p.agenda && p.seat !== v.you ? <small className="rev">{AGENDA_TEXT[p.agenda][0].split("（")[0]}</small> : null}{p.exiled ? <small className="rev">放逐</small> : p.killed ? <small className="rev">阵亡</small> : null}</button>; })}</div>
    <main className="ta-main" inert={Boolean(incoming.sceneGate || (scene && scene.kind !== "resource"))}>
      {offline.length > 0 ? (v.phase === "vote"
        ? <details className="ta-offline"><summary>离线代操作 · {offline.length} 人</summary>{offlineActions}</details>
        : offlineActions) : null}
      {msg ? <p className="ta-err">{msg}</p> : null}
      {v.phase === "setup" ? <section className="ta-panel"><h3>滑动选择角色 · 你的身份：<a onClick={() => setZoom({ src: "", text: "", node: zoomOf.agenda(v.agenda) })}>{AGENDA_TEXT[v.agenda][0]}</a></h3>{v.choices.length ? <div className="ta-chars">{v.choices.map((c: string) => <figure key={c}><div className="ta-pick" onClick={() => setZoom({ src: "", text: "", node: zoomOf.char(c) })}>{zoomOf.char(c)}</div><button className="ta-primary" onClick={() => send({ t: "choose", name: c })}>选 {CHAR_NAME[c]}</button></figure>)}</div> : <p>等待其他玩家选角色…</p>}</section> : null}
      {question()}{flowPanel()}
      {v.phase === "resolve" ? <section className="ta-panel"><h3>已揭示 · 还剩 {v.remaining} 张</h3><div className="ta-hand inline">{v.revealed.map((t: string, i: number) => <button key={i} className="ta-card flip" onClick={() => setZoom({ src: img(t), text: CARD_TEXT[t].join("：") })}><GameCard type={t} /></button>)}</div></section> : null}
      {v.phase === "resolve" && !incoming.sceneGate && !q && v.leader === v.you ? <button className="ta-primary" onClick={() => send({ t: "reveal" })}>揭示下一张（还剩 {v.remaining}）</button> : null}
      {acting && !flow ? <section className="ta-panel ta-dock"><h3>选择一项行动</h3><div className="ta-grid"><button onClick={() => send({ t: "draw" })}>抽一张牌</button><button onClick={() => send({ t: "pass" })}>跳过</button></div>
        {me.exiled ? null : <div className="ta-abs">{abilities.map((a) => { const m = ABILITIES[a]; const used = !v.legalAbilities.includes(a); return <button key={a} disabled={used} onClick={() => m.steps.length ? setFlow({ ab: a, steps: m.steps, args: {} }) : send({ t: "ability", ab: a, args: {} })}><b>{m.name}{m.cost ? ` · ${m.cost}` : ""}</b><small>{m.text}</small></button>; })}</div>}</section> : null}
      {v.phase === "review" && !incoming.sceneGate && !q ? <section className="ta-panel ta-review"><h3>本轮结算回顾</h3>
        <div className="ta-review-cards">{v.revealed.map((t: string, i: number) => <button key={i} className="ta-card" onClick={() => setRev(true)}><GameCard type={t} /></button>)}</div>
        <p className="ta-sum"><span>氧气 {v.oxygen - start.current.o >= 0 ? "+" : ""}{v.oxygen - start.current.o}　能量 {v.energy - start.current.e >= 0 ? "+" : ""}{v.energy - start.current.e}</span><span>已确认 {v.confirms.length}/{v.players.filter((p: any) => !p.killed).length}</span></p>
        {(v.roundLog ?? []).filter((l: string) => /受伤|死亡|放逐|身份发动/.test(l)).slice(-4).map((l: string, i: number) => <p key={i} className="ta-review-ev">{zh(l).replace(/座位(\d+)/g, (_: string, seat: string) => name(Number(seat) - 1))}</p>)}
        {!me.killed && !v.confirms.includes(v.you) ? <button className="ta-primary" onClick={() => send({ t: "confirm" })}>确认，进入圆桌讨论</button> : <p className="ta-wait">等待其他人确认…</p>}
        {host && reviewLong ? <button onClick={() => send({ t: "force" })}>强制继续（有人未确认）</button> : null}</section> : null}
      {v.phase === "accuse" && !incoming.sceneGate && !q ? <section className="ta-panel ta-speak">{v.speakOrder?.length ? <p>发言顺序：{v.speakDir === 1 ? "从任务领袖左边" : "从任务领袖右边"} · 当前 <b>{name(v.speakOrder[v.speakIdx])}</b></p> : <p>请任务领袖 <b>{name(v.leader)}</b> 选择从左边还是右边开始发言</p>}
        {v.leader === v.you ? (v.speakOrder?.length ? <button onClick={() => send({ t: "next_speaker" })}>下一位发言</button> : <div className="ta-grid"><button onClick={() => send({ t: "speak", dir: 1 })}>从左边开始</button><button onClick={() => send({ t: "speak", dir: -1 })}>从右边开始</button></div>) : null}</section> : null}
      {v.phase === "accuse" && !incoming.sceneGate && !q ? <section className="ta-panel"><div className="ta-sum"><span>本轮 氧气 {v.oxygen - start.current.o >= 0 ? "+" : ""}{v.oxygen - start.current.o}　能量 {v.energy - start.current.e >= 0 ? "+" : ""}{v.energy - start.current.e}</span>{v.revealed.length ? <button onClick={() => setRev(true)}>查看揭示的 {v.revealed.length} 张牌</button> : null}</div><div className="ta-grid">{!me.killed && !me.exiled ? <button className="ta-danger" onClick={() => send({ t: "call_vote" })}>拿起手枪</button> : null}{v.leader === v.you ? <button className="ta-primary" onClick={() => send({ t: "end_accuse" })}>结束本回合</button> : null}</div></section> : null}
      {v.phase === "vote" ? <section className="ta-panel alert"><h3>放逐投票 · 已投 {v.voted}</h3>{myTurn ? <>{seatChoice(v.players.filter((p: any) => !p.killed && !p.exiled && p.seat !== v.you), (s) => send({ t: "vote", target: s }))}<button onClick={() => send({ t: "vote", target: null })}>弃权</button></> : <p>等待其他人投票…</p>}</section> : null}
      
      {v.notes?.length ? <details className="ta-log"><summary>私密记录</summary>{v.notes.map((n: string, i: number) => <p key={i}>{zh(n)}</p>)}</details> : null}

      {roundTable ? hand : null}
    </main>
    {!roundTable && !flow && !q ? hand : null}
    {showRoundLog ? <div className="ta-round-log" role="dialog" aria-modal="true" aria-label="公开记录"><section><h3>公开记录 · 本轮及上一轮</h3><div>{[...(v.roundLog ?? v.log)].reverse().map((l: string, i: number) => <p key={i}>{zh(l).replace(/座位(\d+)/g, (_: string, seat: string) => name(Number(seat) - 1))}</p>)}</div><button onClick={() => setShowRoundLog(false)}>关闭</button></section></div> : null}
    {help ? <div className="ta-zoom" onClick={() => setHelp(false)}><Rules count={v.players.length} /></div> : null}
    {v.phase === "over" && !scene ? <div className={"ta-end " + (v.winner === "crew" ? "win" : "lose")}><div className="fx">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * .35}s` }} />)}</div>
      <small>{v.winner === "crew" ? "警戒号 · 引擎重启" : "警戒号 · 生命维持终止"}</small><h1>{v.winner === "crew" ? "劫后余生" : "全员窒息"}</h1><p className="why">{v.winner === "crew" ? (v.energy >= ENERGY_GOAL ? `能量充满，氧气仅剩 ${v.oxygen} 格。你们活下来了。` : "内鬼全部伏诛，飞船脱离危险。") : (v.oxygen === 0 ? "最后一口氧气耗尽，内鬼的计划得逞。" : "船员无一生还，飞船落入内鬼之手。")}</p>
      <p className={"mine " + (v.winners.includes(v.you) ? "yes" : "no")}>{v.winners.includes(v.you) ? "你赢了" : "你输了"}</p>
      {v.contributions ? <p className="ta-contribution-note">{v.contributions.partial ? "本局为旧存档，仅统计更新后发生的变化。" : "个人贡献 · 按实际生效值统计"}</p> : <p className="ta-contribution-note">本局没有个人贡献记录。</p>}
      <ul>{v.players.map((p: any, i: number) => <li key={p.seat} style={{ animationDelay: `${.25 + i * .12}s` }} className={v.winners.includes(p.seat) ? "w" : ""}>{p.character ? <img src={img("p_" + p.character)} alt="" /> : null}<span><b>{name(p.seat)}</b><small>{AGENDA_TEXT[p.agenda][0]}{p.killed ? " · 阵亡" : p.exiled ? " · 被放逐" : ""}</small></span><em>{v.winners.includes(p.seat) ? "胜" : "败"}</em>{v.contributions?.seats[p.seat] ? <ContributionLine entry={v.contributions.seats[p.seat]} /> : null}</li>)}</ul>
      {host ? <button className="ta-primary" onClick={() => { stopEnding(); restart(); }}>再来一局</button> : <p className="why">等待房主开始下一局</p>}</div> : null}
    {rev ? <div className="ta-revall" onClick={() => setRev(false)}><h3>本轮揭示的牌</h3><div>{v.revealed.map((t: string, i: number) => <div key={i} className="one"><GameCard type={t} /></div>)}</div><p>点任意处返回</p></div> : null}
    <div key={"veil" + v.phase} className="ta-veil" />
    {scene ? <SceneOverlay key={`${incoming.round}-${scene.id}`} scene={scene} name={name} finish={finish} /> : null}
    {banner && !q ? <div key={banner} className={"ta-banner b-" + v.phase}><b>{banner}</b></div> : null}
    {zoom ? <div className="ta-zoom" onClick={() => setZoom(null)}>{zoom.node ? <div className="ta-big">{zoom.node}</div> : CARD_TEXT[zoom.src.split("/").pop()!.replace(".webp", "")] ? <div className="ta-big"><GameCard type={zoom.src.split("/").pop()!.replace(".webp", "")} /></div> : <img src={zoom.src} alt="" />}{zoom.node ? null : <p>{zoom.text}</p>}{zoom.play !== undefined ? <button className="ta-primary" onClick={() => send({ t: "play", card: zoom.play })}>暗置打出</button> : null}</div> : null}
  </div>;
}
