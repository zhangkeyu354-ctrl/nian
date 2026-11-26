import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Overlay } from "../src/ma/MagicalAthlete.tsx";
import { testRace } from "../../../packages/magical-athlete/src/engine.ts";
import { viewForMA } from "../../../packages/magical-athlete/src/privacy.ts";

it("shows the drawn Twist card and its effect to every player", () => {
  const view = viewForMA(testRace({ racers: ["twin", "banana"], track: "twisty-twirl", skipSetup: true }), "p1");
  const html = renderToStaticMarkup(<Overlay
    show={{ kind: "twist_card", racer: "twin", card: 2 }} view={view}
    name={(id) => id} colorOf={() => "#ffcc22"} me="p1" onSkip={() => {}}
  />);
  expect(html).toContain("镜像世界生效");
  expect(html).toContain("赛道方向反转");
  expect(html).toContain("事件卡 02");
});

it("broadcasts the curse wand roll, skipped racers and next turn", () => {
  const view = viewForMA(testRace({ racers: ["twin", "banana", "hare"], track: "twisty-twirl", skipSetup: true }), "p1");
  const html = renderToStaticMarkup(<Overlay
    show={{ kind: "curse_wand", player: "p1", value: 2, rolling: false, skipped: [
      { owner: "p2", racer: "banana" },
      { owner: "p3", racer: "hare", status: "out" },
    ], next: { owner: "p1", racer: "twin" } }} view={view}
    name={(id) => `玩家${id.slice(1)}`} colorOf={() => "#ffcc22"} me="p2" onSkip={() => {}}
  />);
  expect(html).toContain("人人诅咒魔杖");
  expect(html).toContain("掷出 2");
  expect(html).toContain("跳过 2 个行动顺位");
  expect(html).toContain("香蕉");
  expect(html).toContain("兔子");
  expect(html).toContain("已淘汰");
  expect(html).toContain("接下来");
});

it("has a named explanation for every Twist card, including extra draws", () => {
  const view = viewForMA(testRace({ racers: ["twin", "banana"], track: "twisty-twirl", skipSetup: true }), "p1");
  for (let card = 1; card <= 13; card++) {
    const html = renderToStaticMarkup(<Overlay
      show={{ kind: "twist_card", racer: "twin", card }} view={view}
      name={(id) => id} colorOf={() => "#ffcc22"} me="p1" onSkip={() => {}}
    />);
    expect(html, `card ${card}`).toContain(`事件卡 ${String(card).padStart(2, "0")}`);
    expect(html, `card ${card}`).not.toContain("事件发生！");
    expect(html, `card ${card}`).not.toContain("请查看比赛记录。");
  }
});

it.each([
  ["mild", "普通赛道"],
  ["wild", "石头上摔倒"],
  ["twisty-twirl", "跨过 TWIST 格时抽一张事件卡"],
  ["whirly-world", "停在彩色管道口会传送"],
])("explains the %s track before the race", (track, explanation) => {
  const view = viewForMA(testRace({ racers: ["twin", "banana"], track: "twisty-twirl", skipSetup: true }), "p1");
  const html = renderToStaticMarkup(<Overlay
    show={{ kind: "start", race: 0, track, text: "开始" }} view={view}
    name={(id) => id} colorOf={() => "#ffcc22"} me="p1" onSkip={() => {}}
  />);
  expect(html).toContain(explanation);
});
