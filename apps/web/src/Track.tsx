import React from "react";
import { Token } from "./Token.tsx";
/** 发电机 / 献祭进度轨（官方桌游顶栏样式的图标轨）；mini 用于手机地图左上角浮签 */
export function Track({
  name,
  value,
  max,
  mini = false,
}: {
  name: string;
  value: number;
  max: number;
  mini?: boolean;
}) {
  return (
    <div className={"track" + (mini ? " track-mini" : "")}>
      <div>
        <span>{name}</span>
        <strong>
          {value}
          <small> / {max}</small>
        </strong>
      </div>
      <div className="track-steps">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={i < value ? "filled" : ""}
            data-track-icon={max === 8 ? "hook" : "generator"}
          >
            {max === 8 ? (
              <svg
                className="track-hook"
                viewBox="0 0 40 40"
                width="36"
                height="36"
                aria-hidden="true"
              >
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill={i < value ? "#733f39" : "#252b2d"}
                  stroke={i < value ? "#e28274" : "#797463"}
                />
                <path
                  d="M25 8v17c0 9-14 9-14 0v-4l5 4"
                  fill="none"
                  stroke={i < value ? "#ffd4b9" : "#c9bc98"}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <Token
                token={{
                  id: "track-" + i,
                  kind: max === 8 ? "hook" : "generator",
                  state: "normal",
                  asset: max === 8 ? "hook" : "generator",
                  label: max === 8 ? "献祭格" + (i + 1) : "发电机格" + (i + 1),
                  location: "track",
                }}
                size={36}
              />
            )}
          </span>
        ))}
        {max === 4 && (
          <span data-track-icon="exit_gate">
            <Token
              token={{
                id: "track-exit",
                kind: "exit_gate",
                state: value >= 4 ? "powered" : "unpowered",
                asset: "exit_gate",
                label: "出口大门",
                location: "track",
              }}
              size={36}
            />
          </span>
        )}
      </div>
    </div>
  );
}
