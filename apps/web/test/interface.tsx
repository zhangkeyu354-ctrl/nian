// Development-only harness. This is not an application route or production entry.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.tsx";
import { SettingsProvider } from "../src/Settings.tsx";
import { reduce, viewFor } from "../../../packages/game-engine/src/index.ts";
import type { GameState, Command } from "../../../packages/shared/src/types.ts";
import samples from "./scenarios.generated.json" with { type: "json" };
import "../src/style.css";
import "../src/visuals.css";
import "../src/board-visuals.css";
import "../src/mobile-game.css";
const sample = samples.find(
  (x) => x.id === new URLSearchParams(location.search).get("case"),
)!;
function Harness() {
  const [state, setState] = useState(sample.before as unknown as GameState),
    [version, setVersion] = useState(0);
  const seat = state.actors[sample.command.actorId!].ownerId;
  return (
    <App
      net={{
        code: "TEST",
        seat,
        version,
        view: viewFor(state, seat),
        connected: true,
        seats: [],
        leave: () => {},
        send: async (c: Command) => {
          try {
            const next = reduce(state, c);
            setState(next);
            setVersion((v) => v + 1);
            (window as any).__sent = [...((window as any).__sent ?? []), c];
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
