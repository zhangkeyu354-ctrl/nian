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
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    {q.get("view") === "mobile-preview" ? (
      <Suspense fallback={<p>正在打开手机样稿…</p>}>
        <MobilePreview />
      </Suspense>
    ) : q.get("view") === "props" ? (
      <Gallery />
    ) : q.has("room") || q.has("online") ? (
      <Online />
    ) : (
      <App />
    )}
  </SettingsProvider>,
);
import "./board-visuals.css";
