import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";
import "./visuals.css";
import { SettingsProvider } from "./Settings.tsx";
import { Gallery } from "./Gallery.tsx";
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    {new URLSearchParams(location.search).get("view") === "props" ? (
      <Gallery />
    ) : (
      <App />
    )}
  </SettingsProvider>,
);
