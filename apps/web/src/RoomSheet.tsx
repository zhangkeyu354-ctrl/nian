import React from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { maps } from "../../../packages/game-engine/src/data.ts";
import { boardVisuals, roomName, cardNames } from "../../../packages/game-engine/src/index.ts";
import { Token } from "./Token.tsx";
import { TapButton } from "./TapButton.tsx";
import { actorColor, ROOM_ACCENTS } from "./playerColors.ts";

const PATH_COLORS: Record<string, string> = {
  blue: "#33a8ff",
  green: "#2fd65c",
  red: "#ff4d3d",
  yellow: "#ffd21f",
};
const STATE_TEXT: Record<string, string> = {
  hooked: "挂在钩子上",
  carried: "被扛着",
  wounded: "受伤",
  healthy: "健康",
};

/** 手机上点房间：底部弹出大卡片，看清房间里有谁、有什么、通往哪里（2026-10-21） */
export function RoomSheet({
  state,
  roomId,
  close,
}: {
  state: GameState;
  roomId: string;
  close: () => void;
}) {
  const map = maps.maps.find((m) => m.id === state.mapId)!;
  const index = map.nodes.findIndex((n) => n.id === roomId);
  const v = boardVisuals(state);
  const people = v.actors.filter((a) => a.room === roomId);
  const props = v.props.filter((p) => p.room === roomId && p.location !== "removed" && p.location !== "track");
  const exits = Object.values(state.paths).filter((p) => p.rooms.includes(roomId));
  return (
    <div className="phone-sheet room-sheet" role="dialog" aria-modal="true" aria-label="房间详情" data-testid="room-sheet">
      <div className="sheet-heading" style={{ borderColor: ROOM_ACCENTS[index % ROOM_ACCENTS.length] }}>
        <h2>{roomName(state, roomId)}</h2>
        <TapButton onClick={close}>关闭</TapButton>
      </div>
      <img className="room-sheet-art" src={`/assets/mobile/rooms/${roomId}.webp`} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      <h3>在这里的人</h3>
      {people.length ? (
        <ul className="room-sheet-people">
          {people.map((a) => (
            <li key={a.id} style={{ borderColor: actorColor(state, a.id) }}>
              <Token token={a} size={44} />
              <span style={{ color: actorColor(state, a.id) }}>{a.label}</span>
              <small>{STATE_TEXT[a.state] ?? (a.wounded ? "受伤" : "健康")}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">没有人</p>
      )}
      <h3>道具</h3>
      <ul className="room-sheet-props">
        {props.map((p) => (
          <li key={p.id}>
            <Token token={p} size={40} />
            <span>{p.label}</span>
          </li>
        ))}
      </ul>
      <h3>出口</h3>
      <ul className="room-sheet-exits">
        {exits.map((p) => {
          const to = p.rooms.find((r) => r !== roomId) ?? roomId;
          return (
            <li key={p.id} style={{ borderColor: PATH_COLORS[p.color] }}>
              <b style={{ background: PATH_COLORS[p.color] }}>{cardNames[p.color]?.split("（")[0]}</b>
              <span>→ {roomName(state, to)}</span>
              {p.direction !== "both" && <small>单向</small>}
              {p.wall && <small>有墙</small>}
              {p.pallet && <small>有木板</small>}
              {p.bearTrap && <small>捕兽夹</small>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
