import React, { useState } from "react";
import catalog from "./illustrations.json" with { type: "json" };
import { useSettings } from "./Settings.tsx";
export function Illustration({
  id,
  className = "",
  alt = "",
}: {
  id: string;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false),
    settings = useSettings();
  const entry = catalog.find((e) => e.id === id);
  if (!entry) return null;
  const fallback = failed || !settings.art || entry.source !== "AI 生成";
  return (
    <img
      className={className}
      data-illustration={id}
      data-art-source={fallback ? "占位" : "AI 生成"}
      src={"/assets/" + (fallback ? entry.svg : entry.file)}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
