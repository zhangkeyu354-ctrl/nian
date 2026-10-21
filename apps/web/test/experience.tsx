// Development-only view-transition harness. Not included in the production build.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createGame,
  reduce,
  viewFor,
} from "../../../packages/game-engine/src/index.ts";
import { App } from "../src/App.tsx";
import { SettingsProvider } from "../src/Settings.tsx";
import r1 from "../../../docs/phase1/games/4111.replay.json" with { type: "json" };
import r2 from "../../../docs/phase1/games/1701.replay.json" with { type: "json" };
import "../src/style.css";
import "../src/visuals.css";
import "../src/board-visuals.css";
import "../src/mobile-game.css";
const q = new URLSearchParams(location.search),
  kind = q.get("case") ?? "move";
const desired: Record<string, string> = {
  move: "MOVED",
  injury: "WOUNDED",
  hook: "HOOKED",
  repair: "PROP_PROGRESS",
  complete: "GENERATOR_COMPLETED",
};
function sample() {
  for (const r of [r1, r2]) {
    let s = createGame(r.options);
    for (const c of r.commands) {
      const n = reduce(s, c);
      const e = n.events
        .slice(s.events.length)
        .find((e) => e.type === desired[kind]);
      if (e) return { before: s, after: n, command: c, event: e };
      s = n;
    }
  }
  throw new Error("Missing real event " + kind);
}
const x = sample();
function Harness() {
  const [state, setState] = useState(x.before),
    [version, setVersion] = useState(0);
  const viewer =
    q.get("observer") === "victim"
      ? String(x.event.data.actorId)
      : x.command.actorId!;
  const seat = state.actors[viewer].ownerId;
  (window as any).__command = x.command;
  (window as any).__receive = () => {
    setState(x.after);
    setVersion(1);
  };
  return (
    <App
      net={{
        code: "TEST",
        seat,
        version,
        view: viewFor(state, seat),
        seats: [],
        connected: true,
        leave: () => {},
        send: async (c) => {
          (window as any).__sent = [...((window as any).__sent ?? []), c];
          if (q.has("reject")) {
            await new Promise((r) => setTimeout(r, 350));
            return "操作被拒绝：测试目标已变化";
          }
          try {
            setState(reduce(state, c));
            setVersion((v) => v + 1);
            return null;
          } catch (e) {
            return String(e);
          }
        },
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <Harness />
  </SettingsProvider>,
);
