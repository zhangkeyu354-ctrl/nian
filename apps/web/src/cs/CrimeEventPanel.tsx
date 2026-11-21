import { useState } from "react";
import tiles from "../../../../data/crime-scene/tiles.json" with { type: "json" };

const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
const instructions: Record<string, string> = {
  "event-01": "目击者秘密选一块橙色场景板。鉴证专家将其弃掉，并从橙色牌堆补上一块。",
  "event-02": "鉴证专家查看抽出的五块橙色板，选一块替换场上的橙色板。",
  "event-03": "上一局成功破案的玩家立即获得一次额外破案机会，不占用他本局的机会。第一局或上一局无人破案时，鉴证专家改抽一块橙色板替换。",
  "event-04": "鉴证专家将任意一块场景板上的标记移到同板另一选项。",
  "event-05": "从鉴证专家右边开始，逆时针逐人翻面一张自己的线索牌。",
  "event-06": "鉴证专家再替换两块橙色板。本轮简报结束后结案。",
};

interface Props {
  event: { id: string; drawn?: string[]; exclusionNext?: number | null };
  board: { tiles: string[]; markers: Record<string, number> };
  players: { seat: number; clues: string[]; excludedClues: string[] }[];
  mySeat: number;
  forensicSeat: number;
  myRole: string;
  names: string[];
  send: (command: object) => void;
}

export default function CrimeEventPanel({ event, board, players, mySeat, forensicSeat, myRole, names, send }: Props) {
  const [oldTiles, setOldTiles] = useState<string[]>([]);
  const [newTile, setNewTile] = useState("");
  const [markerTile, setMarkerTile] = useState("");
  const [markerOption, setMarkerOption] = useState<number | null>(null);
  const orange = board.tiles.filter((tile) => tile.startsWith("scene-"));
  const expert = mySeat === forensicSeat;
  const title = tileById.get(event.id)?.title ?? "特殊事件";
  const toggleOld = (tile: string) => setOldTiles((current) => current.includes(tile) ? current.filter((item) => item !== tile) : current.length < 2 ? [...current, tile] : [current[1], tile]);
  const choices = (items: string[], selected: string[], select: (tile: string) => void) => <div className="cs-event-choices">{items.map((tile) => <button key={tile} className={selected.includes(tile) ? "active" : ""} onClick={() => select(tile)}>{tileById.get(tile)?.title ?? tile}</button>)}</div>;

  return <section className="cs-event-panel" aria-live="polite">
    <div className="cs-event-number" aria-hidden="true" style={{ backgroundImage: `url(/assets/crime-scene/events/${event.id}.webp)` }}><span>{event.id.slice(-2)}</span></div>
    <div className="cs-event-kicker">特殊事件</div><h2>{title}</h2><p>{instructions[event.id]}</p>
    {event.id === "event-01" && (myRole === "witness" ? <><h3>选择要弃掉的橙色板</h3>{choices(orange, oldTiles, (tile) => setOldTiles([tile]))}<button className="cs-primary" disabled={!oldTiles[0]} onClick={() => send({ type: "event_secret", oldTile: oldTiles[0] })}>秘密提交</button></> : <p>等待目击者秘密指定场景板…</p>)}
    {event.id === "event-02" && (expert ? <><h3>抽出的五块板</h3>{choices(event.drawn ?? [], [newTile], setNewTile)}<h3>选择场上要换掉的橙色板</h3>{choices(orange, oldTiles, (tile) => setOldTiles([tile]))}<button className="cs-primary" disabled={!newTile || !oldTiles[0]} onClick={() => send({ type: "event_traceable", oldTile: oldTiles[0], newTile })}>确认替换</button></> : <p>鉴证专家正在选择场景板…</p>)}
    {event.id === "event-03" && (expert ? <><h3>额外抽出的板：{tileById.get(event.drawn?.[0] ?? "")?.title}</h3><h3>选择场上要换掉的橙色板</h3>{choices(orange, oldTiles, (tile) => setOldTiles([tile]))}<button className="cs-primary" disabled={!oldTiles[0]} onClick={() => send({ type: "event_bonus_scene", oldTile: oldTiles[0] })}>放下额外场景板</button></> : <p>等待鉴证专家放置额外场景板…</p>)}
    {event.id === "event-04" && (expert ? <><h3>选择要移动的标记</h3>{choices(board.tiles.filter((tile) => tile in board.markers), [markerTile], (tile) => { setMarkerTile(tile); setMarkerOption(null); })}{markerTile && <div className="cs-event-choices">{(tileById.get(markerTile) as { options?: string[] } | undefined)?.options?.map((option, index) => <button key={index} disabled={index === board.markers[markerTile]} className={markerOption === index ? "active" : ""} onClick={() => setMarkerOption(index)}>{option}</button>)}</div>}<button className="cs-primary" disabled={!markerTile || markerOption === null} onClick={() => send({ type: "event_misinformation", tile: markerTile, option: markerOption })}>移动标记</button></> : <p>等待鉴证专家移动标记…</p>)}
    {event.id === "event-05" && (event.exclusionNext === mySeat || (event.exclusionNext === undefined && mySeat === (forensicSeat - 1 + players.length) % players.length) ? <><h3>翻面一张自己的线索牌</h3><div className="cs-event-choices">{players[mySeat].clues.filter((clue) => !players[mySeat].excludedClues.includes(clue)).map((clue) => <button key={clue} onClick={() => send({ type: "event_exclude", clue })}>{clue}</button>)}</div></> : <p>等待 {names[event.exclusionNext ?? (forensicSeat - 1 + players.length) % players.length]} 翻面线索牌…</p>)}
    {event.id === "event-06" && (expert ? <><h3>选择两块橙色板</h3>{choices(orange, oldTiles, toggleOld)}<button className="cs-primary" disabled={oldTiles.length !== 2} onClick={() => send({ type: "event_countdown", oldTiles })}>替换两块板</button></> : <p>等待鉴证专家替换两块板…</p>)}
  </section>;
}
