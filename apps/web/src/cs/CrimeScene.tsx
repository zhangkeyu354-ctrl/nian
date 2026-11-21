import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CS_EVENTS } from "../../../../packages/shared/src/cs-protocol.ts";
import tiles from "../../../../data/crime-scene/tiles.json" with { type: "json" };
import clues from "../../../../data/crime-scene/clues.json" with { type: "json" };
import means from "../../../../data/crime-scene/means.json" with { type: "json" };
import cardArt from "./card-art.json" with { type: "json" };
import CrimeEventPanel from "./CrimeEventPanel.tsx";
import CrimeRules from "./CrimeRules.tsx";
import MeansIcon from "./MeansIcon.tsx";
import "./crime-scene.css";

type Role = "forensic" | "investigator" | "killer" | "accomplice" | "witness";
type Pair = { owner: number; clue: string; means: string };
type PlayerCards = { seat: number; clues: string[]; means: string[]; excludedClues: string[] };
type View = {
  phase: string; myRole: Role; forensicSeat: number; players: PlayerCards[];
  answer?: Pair; roles?: Role[]; evilPartnerSeat?: number; witnessCandidates?: number[];
  nightDeadline?: number; locationOptions?: string[]; badges: boolean[]; bonusAttempts: number; bonusSeat?: number | null; winner: "good" | "evil" | null;
  event?: { id: string; drawn?: string[]; exclusionNext?: number | null };
  resultReason?: "all_good_badges" | "three_rounds" | "countdown" | null;
  board: { phase: string; round: number; tiles: string[]; markers: Record<string, number>; replaced: boolean; speaker: number; speechStartedAt: number | null; speechDurationMs: number } | null;
  hunt?: { deadline: number; suggestions: Record<number, number>; candidates: number[] };
  log: { type: string; at: number; detail: string }[];
  records?: { round: number; tiles: string[]; markers: Record<string, number>; at: number }[];
};
type Snapshot = {
  code: string; stage: "lobby" | "game"; mySeat: number; hostSeat: number;
  players: { seat: number; name: string; connected: boolean }[];
  cardsPerKind: 3 | 4 | 5; eventsEnabled: boolean; mode: "local" | "online";
  chat: { seat: number; text: string; at: number }[]; paused: boolean; version: number; view: View | null;
};
type Ack = { ok: boolean; error?: string; code?: string; token?: string; snapshot?: Snapshot; privateMessage?: string };
const byId = new Map(tiles.map((tile) => [tile.id, tile]));
const clueIds = new Map(clues.map((card) => [card.name, card.id]));
const meansIds = new Map(means.map((card) => [card.name, card.id]));
const availableArt = new Set<string>(cardArt);
const roleName: Record<Role, string> = { forensic: "鉴证专家", investigator: "调查员", killer: "凶手", accomplice: "帮凶", witness: "目击者" };
const roleTone: Record<Role, string> = { forensic: "teal", investigator: "blue", killer: "red", accomplice: "red", witness: "green" };
const nameOf = (snapshot: Snapshot, seat: number) => snapshot.players[seat]?.name ?? `玩家 ${seat + 1}`;
const storageKey = (code: string) => `crime-scene:${code.toUpperCase()}`;

function EvidenceCard({ name, kind, selected, important, excluded, onClick }: { name: string; kind: "clue" | "means"; selected?: boolean; important?: boolean; excluded?: boolean; onClick?: () => void }) {
  const className = `cs-evidence ${kind} ${selected ? "selected" : ""} ${important ? "important" : ""} ${excluded ? "excluded" : ""}`;
  const id = (kind === "clue" ? clueIds : meansIds).get(name);
  const image = id && availableArt.has(id) ? `/assets/crime-scene/cards/${id}-512.webp` : null;
  const content = <><span className="cs-evidence-name">{name}</span>{image ? <img src={image} alt="" loading="lazy" /> : id?.startsWith("means-") ? <MeansIcon id={id} /> : <span className="cs-evidence-glyph" aria-hidden="true">{name.slice(0, 1)}</span>}</>;
  return onClick ? <button type="button" className={className} disabled={excluded} onClick={onClick} aria-pressed={!!selected}>{content}</button> : <div className={className}>{content}</div>;
}

function SceneTile({ id, marker, canMark, onMark }: { id: string; marker?: number; canMark: boolean; onMark: (option: number) => void }) {
  const tile = byId.get(id);
  const options = "options" in (tile ?? {}) ? (tile as { options: string[] }).options : [];
  const kind = tile?.kind ?? "scene";
  return <section className={`cs-tile ${kind}`} aria-label={tile?.title ?? id}>
    <h3>{tile?.title ?? id}</h3>
    <div className="cs-tile-options">{options.map((label, option) => {
      const marked = marker === option;
      return <button key={option} type="button" disabled={!canMark || marker !== undefined} onClick={() => onMark(option)} className={marked ? "marked" : ""} aria-label={`${tile?.title}：${label}${marked ? "，已标记" : ""}`}>
        <span className="cs-bullet" aria-hidden="true" />{label}
      </button>;
    })}</div>
  </section>;
}

export default function CrimeScene() {
  const [code, setCode] = useState(new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "");
  const [name, setName] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [roleOpen, setRoleOpen] = useState(false);
  const [pendingMarker, setPendingMarker] = useState<{ tile: string; option: number } | null>(null);
  const [solveOpen, setSolveOpen] = useState(false);
  const [guessOwner, setGuessOwner] = useState<number | null>(null);
  const [guessClue, setGuessClue] = useState("");
  const [guessMeans, setGuessMeans] = useState("");
  const [nightClue, setNightClue] = useState("");
  const [nightMeans, setNightMeans] = useState("");
  const [replaceTile, setReplaceTile] = useState("");
  const [chatText, setChatText] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);

  const send = useCallback(async (event: string, payload: object): Promise<Ack> => {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error("连接中断，请稍后重试");
    const result = await socket.timeout(10_000).emitWithAck(event, payload) as Ack;
    if (!result.ok) throw new Error(result.error ?? "操作失败");
    if (result.snapshot) setSnapshot(result.snapshot);
    if (result.privateMessage) setError(result.privateMessage);
    return result;
  }, []);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    try { setError(""); await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
  }, []);

  useEffect(() => {
    const socket = io({ transports: ["websocket"], reconnection: true });
    socketRef.current = socket;
    socket.on(CS_EVENTS.update, (next: Snapshot) => { if (next.code === codeRef.current) setSnapshot(next); });
    socket.on("connect", () => {
      const roomCode = codeRef.current;
      const token = roomCode ? localStorage.getItem(storageKey(roomCode)) : null;
      if (roomCode && token) void run(async () => { const result = await send(CS_EVENTS.join, { code: roomCode, token }); if (result.snapshot) setSnapshot(result.snapshot); });
    });
    socket.on("connect_error", () => setError("无法连接游戏服务器"));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); socket.disconnect(); socketRef.current = null; };
  }, [run, send]);

  const rememberRoom = (roomCode: string) => {
    const upper = roomCode.toUpperCase(); setCode(upper); codeRef.current = upper;
    history.replaceState({}, "", `/?game=crime-scene&room=${upper}`);
  };
  const claim = async (roomCode: string) => {
    if (!name.trim()) throw new Error("请先填写昵称");
    const result = await send(CS_EVENTS.claim, { code: roomCode, name: name.trim() });
    if (!result.token || !result.snapshot) throw new Error("加入房间失败");
    localStorage.setItem(storageKey(roomCode), result.token);
    rememberRoom(roomCode);
    setSnapshot(result.snapshot);
  };
  const create = () => run(async () => { if (!name.trim()) throw new Error("请先填写昵称"); const result = await send(CS_EVENTS.create, {}); if (!result.code) throw new Error("建房失败"); await claim(result.code); });
  const join = () => run(async () => { if (!code.trim()) throw new Error("请输入房间号"); await claim(code.toUpperCase()); });
  const token = code ? localStorage.getItem(storageKey(code)) : null;
  const lobby = (action: object) => run(async () => { await send(CS_EVENTS.lobby, { code, token, action }); });
  const command = (command: object) => run(async () => { await send(CS_EVENTS.command, { code, token, command }); });
  const chat = () => run(async () => { await send(CS_EVENTS.chat, { code, token, text: chatText }); setChatText(""); });

  const view = snapshot?.view;
  const own = view?.players[snapshot!.mySeat];
  const phase = view?.phase ?? "";
  const canSolve = (phase === "event_bonus" ? view?.bonusSeat === snapshot?.mySeat : (!!view?.badges[snapshot!.mySeat] || !!view?.bonusAttempts) && /^round[123]_(search|brief)$/.test(phase)) && view?.myRole !== "forensic";
  const chosenPair = guessOwner === null ? null : { owner: guessOwner, clue: guessClue, means: guessMeans };
  const realPair = view?.answer;
  const blockedTruePair = !!chosenPair && !!realPair && chosenPair.owner === realPair.owner && chosenPair.clue === realPair.clue && chosenPair.means === realPair.means && (view?.myRole === "killer" || view?.myRole === "accomplice");
  const seconds = (deadline?: number, limit?: number) => Math.min(limit ?? Infinity, Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000)));
  const lastLog = view?.log.at(-1);

  return <main className="cs-app">
    <header className="cs-topbar"><a href="/" aria-label="返回桌游大厅">← 大厅</a><strong>犯罪现场</strong><div className="cs-top-actions"><button onClick={() => setRulesOpen(true)}>规则</button>{snapshot && <span>房间 {snapshot.code}</span>}</div></header>
    {!snapshot ? <section className="cs-entry">
      <div className="cs-entry-art" role="img" aria-label="线索牌、手段牌与场景板"><span className="cs-entry-board"><i /><i /><i /><i /><i /><i /></span><span className="cs-entry-card clue" /><span className="cs-entry-card means" /></div>
      <div className="cs-entry-form"><h1>犯罪现场</h1><p>4–12 人 · 推理派对游戏</p>
        <label>你的昵称<input maxLength={12} value={name} onChange={(event) => setName(event.target.value)} placeholder="输入昵称" /></label>
        <button className="cs-primary" onClick={create}>创建房间</button>
        <div className="cs-join"><input aria-label="房间号" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="输入房间号" /><button onClick={join}>加入</button></div>
      </div>
    </section> : <>
      <div className="cs-status"><span>{phase === "result" ? "案件结案" : snapshot.stage === "lobby" ? "等待玩家" : phase.includes("night") ? "夜幕降临" : phase === "setup" ? "准备案卷" : `第 ${view?.board?.round ?? "–"} 轮`}</span><span>{snapshot.players.length} 人 · {snapshot.mode === "online" ? "线上" : "同桌"}</span></div>
      {snapshot.paused && <div className="cs-paused">鉴证专家已掉线，对局暂停。重连后继续。</div>}
      {snapshot.stage === "lobby" ? <section className="cs-lobby">
        <div className="cs-lobby-code"><small>房间号</small><b>{snapshot.code}</b><button onClick={() => void navigator.clipboard?.writeText(location.href)}>复制邀请链接</button></div>
        <h2>玩家席位 <small>{snapshot.players.length}/12</small></h2>
        <ol>{snapshot.players.map((player) => <li key={player.seat}><span>{player.name}{player.seat === snapshot.hostSeat ? " · 房主" : ""}</span><small>{player.connected ? "在线" : "离线"}</small></li>)}</ol>
        {snapshot.mySeat === snapshot.hostSeat && <div className="cs-settings">
          <label>发牌数量 <select value={snapshot.cardsPerKind} onChange={(event) => lobby({ type: "configure", cardsPerKind: Number(event.target.value) })}><option value={3}>简单 · 3+3</option><option value={4}>标准 · 4+4</option><option value={5}>困难 · 5+5</option></select></label>
          <label>游玩方式 <select value={snapshot.mode} onChange={(event) => lobby({ type: "configure", mode: event.target.value })}><option value="local">同桌聚会</option><option value="online">线上文字讨论</option></select></label>
          <label>鉴证专家 <select value={snapshot.view?.forensicSeat ?? 0} onChange={(event) => lobby({ type: "configure", forensicSeat: Number(event.target.value) })}>{snapshot.players.map((player) => <option value={player.seat} key={player.seat}>{player.name}</option>)}</select></label>
          <label className="cs-event-setting"><input type="checkbox" checked={snapshot.eventsEnabled} onChange={(event) => lobby({ type: "configure", eventsEnabled: event.target.checked })} /><span>启用特殊事件 <small>第 2 轮起，六种事件洗入橙色牌堆</small></span></label>
          <button className="cs-primary" disabled={snapshot.players.length < 4} onClick={() => lobby({ type: "start" })}>开始游戏</button>
        </div>}
      </section> : view && <>
        <button className={`cs-role ${roleTone[view.myRole]} ${roleOpen || view.myRole === "forensic" || phase === "result" ? "open" : ""}`} onPointerDown={() => setRoleOpen(true)} onPointerUp={() => setRoleOpen(false)} onPointerCancel={() => setRoleOpen(false)} onPointerLeave={() => setRoleOpen(false)} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") setRoleOpen(true); }} onKeyUp={() => setRoleOpen(false)}>
          <span className="cs-role-art" aria-hidden="true" /><span className="cs-role-title">{roleOpen || view.myRole === "forensic" || phase === "result" ? roleName[view.myRole] : "长按查看身份"}</span><small>{phase === "result" ? "身份已公开" : view.myRole === "forensic" ? "公开身份" : "松手盖回"}</small>
        </button>
        {view.evilPartnerSeat !== undefined && <p className="cs-private">同伴：{nameOf(snapshot, view.evilPartnerSeat)}</p>}
        {view.witnessCandidates && <p className="cs-private">你目击到两人：{view.witnessCandidates.map((seat) => nameOf(snapshot, seat)).join("、")}；不知道谁是凶手。</p>}
        {phase === "setup" && <section className="cs-section"><h2>案发地点</h2>{view.myRole === "forensic" ? <><p>从四块地点板中选一块，随后进入夜晚。</p><div className="cs-locations">{view.locationOptions?.map((id) => <button key={id} onClick={() => command({ type: "start", location: id })}>{byId.get(id)?.options?.join(" · ")}</button>)}</div></> : <p>等待鉴证专家选择案发地点…</p>}</section>}
        {phase.includes("night") && <section className="cs-night"><div className="cs-night-rain" /><h2>夜幕降临…</h2>
          {view.myRole === "killer" && !view.answer ? <><p>从自己面前各选一张牌。</p><strong className={`cs-countdown ${seconds(view.nightDeadline) <= 15 ? "urgent" : ""}`} aria-live={seconds(view.nightDeadline) <= 15 ? "assertive" : "off"}>{seconds(view.nightDeadline)} 秒</strong><h3>关键证物</h3><div className="cs-card-row">{own?.clues.map((card) => <EvidenceCard key={card} name={card} kind="clue" selected={nightClue === card} onClick={() => setNightClue(card)} />)}</div><h3>行凶手法</h3><div className="cs-card-row">{own?.means.map((card) => <EvidenceCard key={card} name={card} kind="means" selected={nightMeans === card} onClick={() => setNightMeans(card)} />)}</div><button className="cs-primary" disabled={!nightClue || !nightMeans} onClick={() => command({ type: "choose", clue: nightClue, means: nightMeans })}>确认作案证据</button></> : view.myRole === "killer" ? <p>证据已选定。所有人将在同一时间进入调查。</p> : <p>请等待调查开始。</p>}
        </section>}
        {(phase === "event" || phase === "event_bonus_scene") && view.board && view.event && <CrimeEventPanel key={view.event.id} event={view.event} board={view.board} players={view.players} mySeat={snapshot.mySeat} forensicSeat={view.forensicSeat} myRole={view.myRole} names={snapshot.players.map((player) => player.name)} send={command} />}
        {phase === "event_bonus" && <section className="cs-event-panel"><div className="cs-event-kicker">扭转局势</div><h2>额外破案机会</h2><p>{view.bonusSeat === snapshot.mySeat ? "现在可以再指认一次；这次机会不会消耗原有徽章。" : `等待 ${nameOf(snapshot, view.bonusSeat ?? -1)} 决定是否再次破案。`}</p>{view.bonusSeat === snapshot.mySeat && <button onClick={() => command({ type: "skip_bonus" })}>放弃这次机会</button>}</section>}
        {(/round[123]_(search|brief)/.test(phase) || phase === "event_bonus" || phase === "event" || phase === "event_bonus_scene") && view.board && <>
          <section className="cs-section"><div className="cs-heading"><h2>案件板</h2><span>{view.board.round}/3 轮</span></div><div className="cs-board-row">{view.board.tiles.map((tile) => <SceneTile key={tile} id={tile} marker={view.board!.markers[tile]} canMark={view.myRole === "forensic" && phase.endsWith("_search") && !snapshot.paused} onMark={(option) => setPendingMarker({ tile, option })} />)}</div>
            {view.myRole === "forensic" && view.answer && <p className="cs-answer">关键证物：{view.answer.clue}　行凶手法：{view.answer.means}</p>}
            {phase.endsWith("_search") && view.myRole === "forensic" && <div className="cs-actions">{view.board.round > 1 && !view.board.replaced && <div className="cs-replace"><label>选择要换掉的橙色板<select value={replaceTile} onChange={(event) => setReplaceTile(event.target.value)}><option value="">请选择</option>{view.board.tiles.filter((tile) => tile.startsWith("scene-")).map((tile) => <option key={tile} value={tile}>{byId.get(tile)?.title}</option>)}</select></label><button disabled={!replaceTile} onClick={() => { command({ type: "replace", oldTile: replaceTile }); setReplaceTile(""); }}>换一块线索板</button></div>}<button className="cs-primary" onClick={() => command({ type: "brief" })}>开始简报</button></div>}
          </section>
          {phase.endsWith("_brief") && <section className="cs-speaker"><div className="cs-ring" style={{ background: `conic-gradient(#d7c5a1 ${Math.min(100, Math.max(0, 100 - seconds((view.board.speechStartedAt ?? now) + view.board.speechDurationMs, view.board.speechDurationMs / 1000) / (view.board.speechDurationMs / 1000) * 100))}%, #423934 0)` }}><span>{seconds((view.board.speechStartedAt ?? now) + view.board.speechDurationMs, view.board.speechDurationMs / 1000)}</span></div><div><small>当前发言</small><strong>{nameOf(snapshot, view.board.speaker)}</strong><p>可跳过或延长；计时只作提醒。</p></div>{(view.board.speaker === snapshot.mySeat || view.myRole === "forensic") && <div className="cs-speaker-actions"><button onClick={() => command({ type: "extend_speaker" })}>延长 30 秒</button><button onClick={() => command({ type: "next_speaker" })}>下一位</button></div>}</section>}
          <section className="cs-section"><h2>公开证物</h2><div className="cs-player-strip">{view.players.filter((player) => player.seat !== view.forensicSeat).map((player) => <article key={player.seat} className="cs-player"><h3>{nameOf(snapshot, player.seat)} <small>{view.badges[player.seat] ? "● 有徽章" : "○ 已用"}</small></h3><div className="cs-card-row">{player.clues.map((card) => <EvidenceCard key={card} name={card} kind="clue" excluded={player.excludedClues.includes(card)} important={view.myRole === "forensic" && view.answer?.owner === player.seat && view.answer.clue === card} />)}</div><div className="cs-card-row">{player.means.map((card) => <EvidenceCard key={card} name={card} kind="means" important={view.myRole === "forensic" && view.answer?.owner === player.seat && view.answer.means === card} />)}</div></article>)}</div></section>
          {snapshot.mode === "online" && phase.endsWith("_brief") && <section className="cs-section cs-chat"><h2>文字讨论</h2><div className="cs-chat-log">{snapshot.chat.map((line, index) => <p key={index}><b>{nameOf(snapshot, line.seat)}</b> {line.text}</p>)}</div><div className="cs-chat-send"><input maxLength={280} value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="输入发言" /><button disabled={!chatText.trim()} onClick={chat}>发送</button></div></section>}
          {canSolve && <button className="cs-solve-trigger" onClick={() => { setSolveOpen(true); setGuessOwner(null); setGuessClue(""); setGuessMeans(""); }}>我要破案</button>}
        </>}
        {phase === "witness_hunt" && <section className="cs-section cs-hunt"><h2>目击者反杀</h2>{view.hunt ? <><p>与同伴讨论，选出你认为的目击者。凶手负责提交最终指认。</p><strong>{seconds(view.hunt.deadline)} 秒</strong><div className="cs-hunt-targets">{view.hunt.candidates.map((seat) => <button key={seat} className={view.hunt!.suggestions[snapshot.mySeat] === seat ? "active" : ""} onClick={() => command({ type: "suggest", target: seat })}>{nameOf(snapshot, seat)}</button>)}</div>{view.myRole === "killer" && <button className="cs-primary" disabled={view.hunt.suggestions[snapshot.mySeat] === undefined} onClick={() => command({ type: "submit_hunt" })}>提交最终指认</button>}</> : <p>凶手与帮凶正在讨论，请等待结果。</p>}</section>}
        {phase === "result" && <section className="cs-result"><h2>{view.winner === "good" ? "案件侦破" : "凶手逍遥法外"}</h2>{view.resultReason === "all_good_badges" && <p>所有调查员都已失去破案机会，凶手逍遥法外。</p>}{view.resultReason === "countdown" && <p>倒数计时结束，本轮无人正确破案。</p>}<p>关键证物：{view.answer?.clue}　行凶手法：{view.answer?.means}</p><ul>{view.roles?.map((role, seat) => <li key={seat}><span>{nameOf(snapshot, seat)}</span><strong>{roleName[role]}</strong></li>)}</ul><h3>逐轮提示</h3>{view.records?.map((record) => <details key={record.round} className="cs-record"><summary>第 {record.round} 轮</summary><ul>{record.tiles.map((id) => { const tile = byId.get(id); return <li key={id}><span>{tile?.title}</span><strong>{tile?.options?.[record.markers[id]] ?? "未标记"}</strong></li>; })}</ul></details>)}<a href="/">返回大厅</a></section>}
        {lastLog?.detail === "错！" && <div className="cs-stamp" role="status">错！</div>}
      </>}
    </>}
    {pendingMarker && <div className="cs-dialog-backdrop"><div className="cs-dialog" role="dialog" aria-modal="true"><h2>放下提示标记？</h2><p>{byId.get(pendingMarker.tile)?.title} · {byId.get(pendingMarker.tile)?.options?.[pendingMarker.option]}</p><small>确认后不能移动。</small><div><button onClick={() => setPendingMarker(null)}>取消</button><button className="cs-primary" onClick={() => { command({ type: "mark", tile: pendingMarker.tile, option: pendingMarker.option }); setPendingMarker(null); }}>确认放下</button></div></div></div>}
    {solveOpen && view && snapshot && <div className="cs-dialog-backdrop"><div className="cs-dialog cs-solve-dialog" role="dialog" aria-modal="true"><button className="cs-close" onClick={() => setSolveOpen(false)} aria-label="关闭">×</button><h2>我要破案</h2><p>选择另一名玩家面前的一张线索和一张手段。</p><div className="cs-targets">{view.players.filter((player) => player.seat !== snapshot.mySeat && player.seat !== view.forensicSeat).map((player) => <button key={player.seat} className={guessOwner === player.seat ? "active" : ""} onClick={() => { setGuessOwner(player.seat); setGuessClue(""); setGuessMeans(""); }}>{nameOf(snapshot, player.seat)}</button>)}</div>{guessOwner !== null && <><h3>关键证物</h3><div className="cs-card-row">{view.players[guessOwner].clues.map((card) => <EvidenceCard key={card} name={card} kind="clue" excluded={view.players[guessOwner].excludedClues.includes(card)} selected={guessClue === card} onClick={() => setGuessClue(card)} />)}</div><h3>行凶手法</h3><div className="cs-card-row">{view.players[guessOwner].means.map((card) => <EvidenceCard key={card} name={card} kind="means" selected={guessMeans === card} onClick={() => setGuessMeans(card)} />)}</div></>}{blockedTruePair && <p className="cs-private">不能指认真实证据，请重新选择</p>}<button className="cs-primary" disabled={!guessClue || !guessMeans || blockedTruePair} onClick={() => { if (chosenPair) command({ type: "solve", guess: chosenPair }); setSolveOpen(false); }}>提交指认</button></div></div>}
    {error && <div className="cs-error" role="alert" onClick={() => setError("")}>{error}</div>}
    {rulesOpen && <CrimeRules close={() => setRulesOpen(false)} />}
  </main>;
}
