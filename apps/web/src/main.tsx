import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";
import "./visuals.css";
import { SettingsProvider } from "./Settings.tsx";
import { Gallery } from "./Gallery.tsx";
const MobilePreview = lazy(() =>
  import("./MobilePreview.tsx").then((m) => ({ default: m.MobilePreview })),
);
import { Online } from "./Online.tsx";
const DyingMessage = lazy(() =>
  import("./dm/DyingMessage.tsx").then((m) => ({ default: m.DyingMessage })),
);
const q = new URLSearchParams(location.search);
import { GameLobby } from "./GameLobby.tsx";
const Codenames = lazy(() =>
  import("./cn/Codenames.tsx").then((m) => ({ default: m.Codenames })),
);
const ReflexRace = lazy(() =>
  import("./rr/ReflexRace.tsx").then((m) => ({ default: m.ReflexRace })),
);
const MagicalAthlete = lazy(() =>
  import("./ma/MagicalAthlete.tsx").then((m) => ({
    default: m.MagicalAthlete,
  })),
);
/**
 * 路由：
 *   /                  桌游合集首页（选游戏）
 *   /?game=ma[&room=]  魔法运动员
 *   /?game=cn[&room=]  行动代号
 *   /?game=rr[&room=]  眼疾手快
 *   /?online=1、/?room=XXXX   黎明杀机联机（原有入口不变）
 *   /?hotseat=1        黎明杀机本机热座
 *   /?view=...         样稿与图鉴
 */
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    {q.get("view") === "mobile-preview" ? (
      <Suspense fallback={<p>正在打开手机样稿…</p>}>
        <MobilePreview />
      </Suspense>
    ) : q.get("view") === "props" ? (
      <Gallery />
    ) : q.get("game") === "dm" ? (
      <Suspense fallback={<p>正在打开请留遗言…</p>}>
        <DyingMessage />
      </Suspense>
    ) : q.get("game") === "ma" ? (
      <Suspense fallback={<p>正在打开魔法运动员…</p>}>
        <MagicalAthlete />
      </Suspense>
    ) : q.get("game") === "rr" ? (
      <Suspense fallback={<p>正在打开眼疾手快…</p>}>
        <ReflexRace />
      </Suspense>
    ) : q.get("game") === "cn" ? (
      <Suspense fallback={<p>正在打开行动代号…</p>}>
        <Codenames />
      </Suspense>
    ) : q.has("hotseat") ? (
      <App />
    ) : q.has("room") || q.has("online") ? (
      <Online />
    ) : (
      <GameLobby />
    )}
  </SettingsProvider>,
);
import "./board-visuals.css";
import "./mobile-game.css";
