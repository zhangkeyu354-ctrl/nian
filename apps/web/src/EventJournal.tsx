import type { GameState, Event } from "../../../packages/shared/src/types.ts";
import { eventText } from "./labels.ts";
import { actorColor } from "./playerColors.ts";
const icons: Record<string, string> = {
  WOUNDED: "✕",
  HOOKED: "♜",
  GENERATOR_COMPLETED: "⚙",
  ESCAPED: "↗",
  SACRIFICE_PROGRESS: "✦",
  GAME_OVER: "✦",
};
export function EventJournal({
  state,
  events,
}: {
  state: GameState;
  events: Event[];
}) {
  const rounds = [...new Set(events.map((e) => e.round))].reverse();
  return (
    <div className="event-rounds">
      {rounds.map((round) => (
        <section key={round}>
          <h3>第 {round} 轮</h3>
          {events
            .filter((e) => e.round === round)
            .reverse()
            .map((e) => (
              <div
                key={e.seq}
                className={
                  "log-entry" + (icons[e.type] ? " important-event" : "")
                }
                data-event={e.type}
              >
                <i
                  aria-hidden="true"
                  style={{
                    background: actorColor(state, String(e.data.actorId ?? "")),
                  }}
                />
                <p>
                  {icons[e.type] && <b aria-hidden="true">{icons[e.type]} </b>}
                  {eventText(state, e)}
                </p>
                <small>#{e.seq}</small>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
