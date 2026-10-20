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
const q = new URLSearchParams(location.search);
/** 部署到公网（例如 Render）时，首页直接进入联机；本机/局域网开发仍默认热座 */
const publicHost =
  !location.port &&
  !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(location.hostname);
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    {q.get("view") === "mobile-preview" ? (
      <Suspense fallback={<p>正在打开手机样稿…</p>}>
        <MobilePreview />
      </Suspense>
    ) : q.get("view") === "props" ? (
      <Gallery />
    ) : !q.has("hotseat") && (q.has("room") || q.has("online") || publicHost) ? (
      <Online />
    ) : (
      <App />
    )}
  </SettingsProvider>,
);
import "./board-visuals.css";
import "./mobile-game.css";
