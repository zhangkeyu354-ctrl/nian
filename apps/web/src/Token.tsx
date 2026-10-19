import React, { useState, useEffect } from "react";
import manifest from "../../../assets/manifest.json" with { type: "json" };
import type { VisualToken } from "../../../packages/game-engine/src/presentation.ts";
import { useSettings } from "./Settings.tsx";
export function Art({ id }: { id: string }) {
  const settings = useSettings(),
    [loaded, setLoaded] = useState<string | null>(null),
    [failed, setFailed] = useState<string | null>(null);
  const entry =
    manifest.assets.find((a) => a.id === id) ??
    manifest.assets.find((a) => a.id === "portrait_anonymous")!;
  const png =
    settings.art && entry.source === "AI 生成" && failed !== entry.file;
  return (
    <g
      data-asset={id}
      data-fallback={!png || loaded !== entry.file ? "true" : "false"}
    >
      <image
        className="asset-svg"
        data-testid="svg-fallback"
        href={"/assets/" + entry.svg}
        width="128"
        height="128"
        opacity={png && loaded === entry.file ? 0 : 1}
      />
      {png && (
        <image
          className="asset-png"
          href={"/assets/" + entry.file}
          width="128"
          height="128"
          onLoad={() => setLoaded(entry.file)}
          onError={() => setFailed(entry.file)}
        />
      )}
    </g>
  );
}
export function Token({
  token,
  size = 100,
  showLabel = false,
}: {
  token: VisualToken;
  size?: number;
  showLabel?: boolean;
}) {
  const blocked =
    ["blocked", "broken"].includes(token.state) &&
    ["generator", "hook"].includes(token.kind);
  const removed = [
    "cleansed",
    "searched",
    "removed",
    "destroyed",
    "broken",
  ].includes(token.state);
  return (
    <svg
      className={"visual-token kind-" + token.kind + " state-" + token.state}
      data-kind={token.kind}
      data-state={token.state}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      role="img"
      aria-label={token.label}
    >
      <title>{token.label}</title>
      <g
        opacity={removed ? 0.44 : 1}
        transform={token.state === "on_path" ? "rotate(25 64 64)" : undefined}
      >
        <Art id={token.asset} />
      </g>
      {token.kind === "wall" && (
        <path
          d="M18 18l8-6 8 6 8-6 8 6 8-6 8 6 8-6 8 6 8-6 8 6v90l-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6z"
          fill="none"
          stroke="#baaa88"
          strokeWidth="3"
        />
      )}
      {token.kind === "back" && (
        <path
          d="M64 7l50 29v56l-50 29-50-29V36z"
          fill="none"
          stroke={token.color}
          strokeWidth="7"
        />
      )}
      {["generator", "exit_gate"].includes(token.kind) && (
        <g className="token-progress">
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={29 + i * 25}
              y="99"
              width="20"
              height="9"
              rx="2"
              fill={i < (token.progress ?? 0) ? "#f1d47c" : "#4b5650"}
            />
          ))}
        </g>
      )}
      {blocked && (
        <g>
          <path
            d="M29 26l70 76M99 26l-70 76"
            stroke="#c986b5"
            strokeWidth="9"
          />
          <text x="64" y="74" textAnchor="middle" fill="#ffe0f2" fontSize="26">
            封
          </text>
          <g transform="translate(83 2) scale(.34)">
            <title>恶灵指示物</title>
            <Art id="entity" />
          </g>
        </g>
      )}
      {token.state === "occupied" && (
        <g>
          <circle cx="96" cy="31" r="22" fill="#e6c57a" />
          <text x="96" y="40" textAnchor="middle" fontSize="27" fill="#25332f">
            占
          </text>
        </g>
      )}
      {token.kind === "hook" && token.state === "occupied" && (
        <g fill="#ddd2ad" stroke="#ddd2ad" strokeWidth="5">
          <circle cx="69" cy="59" r="7" />
          <path
            d="M69 68v22m0-13-14 10m14-10 14 10m-14 3-8 18m8-18 8 18"
            fill="none"
          />
        </g>
      )}
      {token.state === "unpowered" && (
        <path d="M36 92l56-56" stroke="#a8adb0" strokeWidth="8" />
      )}
      {["powered", "open", "completed"].includes(token.state) && (
        <circle cx="96" cy="29" r="15" fill="#e6ce77" />
      )}
      {token.wounded && (
        <circle
          className="injury-ring"
          cx="64"
          cy="64"
          r="57"
          fill="none"
          stroke="#da695a"
          strokeWidth="9"
        />
      )}
      {token.state === "hooked" && (
        <path
          d="M33 9v56q0 20 21 20V66"
          fill="none"
          stroke="#d2ac86"
          strokeWidth="8"
        />
      )}
      {token.state === "carried" && (
        <path
          d="M21 91h84M31 80l20-16h34"
          fill="none"
          stroke="#ddbd7b"
          strokeWidth="8"
        />
      )}
      {token.madness && (
        <g transform="translate(77 77) scale(.38)">
          <Art id="madness" />
        </g>
      )}
      {token.state === "hidden" && (
        <g>
          <rect x="22" y="25" width="84" height="76" rx="7" fill="#25332f" />
          <text x="64" y="72" textAnchor="middle" fill="#dfcf99" fontSize="24">
            被占用
          </text>
        </g>
      )}
      {["on_path", "startled", "destroyed", "broken"].includes(token.state) && (
        <path
          d={
            token.state === "startled"
              ? "M22 34L10 16m91 18 17-18M64 16V3"
              : token.state === "on_path"
                ? "M24 112h80"
                : "M33 88l22-33 14 18 26-32"
          }
          fill="none"
          stroke="#e6b77b"
          strokeWidth="6"
        />
      )}
      {showLabel && (
        <text x="64" y="124" textAnchor="middle" fill="#e6ddbb" fontSize="13">
          {token.label}
        </text>
      )}
    </svg>
  );
}
