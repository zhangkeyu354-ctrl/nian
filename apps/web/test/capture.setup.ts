import { vi, afterAll, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
const samples: any[] = [];
vi.mock(
  "../../../packages/game-engine/src/index.ts",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../packages/game-engine/src/index.ts")
      >();
    return {
      ...actual,
      reduce: (s: any, c: any) => {
        const next = actual.reduce(s, c);
        const special =
          c.type === "USE_PERK" ||
          c.type === "USE_ITEM" ||
          (c.type === "INTERACT" && c.action === "power") ||
          (c.type === "SELECT" &&
            [
              "MAP_REVEAL",
              "PHANTASM_TARGET",
              "CARRY_REROUTE",
              "REPLAN",
            ].includes(s.choice?.kind));
        if (special) {
          const key =
            c.type === "USE_PERK"
              ? c.perkId
              : c.type === "USE_ITEM"
                ? "item_" + s.actors[c.actorId].item
                : c.type === "INTERACT"
                  ? "power_" + c.actorId
                  : "choice_" + s.choice.kind;
          if (!samples.some((x) => x.id === key)) {
            const command =
              c.type === "USE_ITEM"
                ? (actual
                    .itemActions(s, c.actorId)
                    .find((a) =>
                      Object.entries(c).every(
                        ([k, v]) =>
                          JSON.stringify((a.command as any)[k]) ===
                          JSON.stringify(v),
                      ),
                    )?.command ?? c)
                : c;
            samples.push({
              id: key,
              before: structuredClone(s),
              command,
              afterEvents: next.events.length,
            });
          }
        }
        return next;
      },
    };
  },
);
afterAll(() => {
  mkdirSync("work/mobile-implementation", { recursive: true });
  writeFileSync(
    "work/mobile-implementation/capture-" +
      basename(expect.getState().testPath ?? "unknown") +
      ".json",
    JSON.stringify(samples),
  );
});
