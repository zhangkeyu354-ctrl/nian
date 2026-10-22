import React, { useId } from "react";
import { COLORS } from "../../../../packages/drawing-party/src/index.ts";
export function Portrait({ index = 0 }: { index?: number }) {
  const skin = [
    "#f6c393",
    "#b97850",
    "#f0bc8b",
    "#d69b72",
    "#8b503d",
    "#e9ae89",
    "#f4c8a7",
    "#c58d66",
  ][index % 8];
  const hair = [
    "#29344a",
    "#412737",
    "#a64b31",
    "#2d272f",
    "#222837",
    "#704127",
    "#db8b31",
    "#37303b",
  ][index % 8];
  return (
    <svg className="st-portrait" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="38" fill={COLORS[index % 8]} />
      <path
        d="M12 80Q14 58 40 59Q66 58 69 80"
        fill={index % 2 ? "#ffc840" : "#f5f4ed"}
      />
      <path d="M31 53v11q9 9 18 0V53" fill={skin} />
      <ellipse cx="40" cy="34" rx="23" ry="27" fill={hair} />
      <circle cx="20" cy="39" r="5" fill={skin} />
      <circle cx="60" cy="39" r="5" fill={skin} />
      <path d="M20 27q20-20 40 0v15q0 19-20 19T20 42Z" fill={skin} />
      <path
        d={
          index % 3 === 0
            ? "M17 30Q14 4 42 8Q65 8 63 33L54 27L47 18Q37 34 17 30"
            : index % 3 === 1
              ? "M17 30Q14 4 42 8Q65 8 64 33L52 21Q32 31 17 30"
              : "M17 31Q13 7 39 8Q65 5 65 32L54 24L49 29L42 20L33 28L26 21Z"
        }
        fill={hair}
      />
      <path
        d="M28 35q4-3 8 0M45 35q4-3 8 0"
        fill="none"
        stroke={hair}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="32" cy="40" rx="2.2" ry="3" fill="#2f2632" />
      <ellipse cx="49" cy="40" rx="2.2" ry="3" fill="#2f2632" />
      <path d="M39 40l-2 6h5" fill="none" stroke="#b77552" strokeWidth="1.6" />
      <path d="M31 49q10 14 20-1" fill="#713647" />
      <path d="M33 49h16l-2 4H36Z" fill="white" />
      <circle cx="26" cy="46" r="3.5" fill="#e8877b" opacity=".6" />
      <circle cx="54" cy="46" r="3.5" fill="#e8877b" opacity=".6" />
      <circle
        cx="40"
        cy="40"
        r="38"
        fill="none"
        stroke="white"
        strokeWidth="3"
      />
    </svg>
  );
}
export function PaintBrush({
  index = 0,
  number,
  cursor = false,
  mirrored = false,
}: {
  index?: number;
  number?: number;
  cursor?: boolean;
  mirrored?: boolean;
}) {
  const id = useId().replaceAll(":", ""),
    color = COLORS[index % 8];
  return cursor ? (
    <svg viewBox="0 0 180 75" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop stopColor="#6b4726" />
          <stop offset=".3" stopColor="#e7c786" />
          <stop offset=".7" stopColor="#a4793f" />
          <stop offset="1" stopColor="#f3dfaa" />
        </linearGradient>
        <linearGradient id={id + "m"} x2="0" y2="1">
          <stop stopColor="#fbffff" />
          <stop offset=".4" stopColor="#58616a" />
          <stop offset=".75" stopColor="#dce5e5" />
          <stop offset="1" stopColor="#62686b" />
        </linearGradient>
      </defs>
      <path
        d="M37 56L173 3q5-1 4 4L48 65Z"
        fill={"url(#" + id + ")"}
        stroke="#9e763d"
      />
      <path
        d="M20 59L47 48L53 64L24 72Z"
        fill={"url(#" + id + "m)"}
        stroke="#71777a"
      />
      <path d="M1 73q4-17 20-17l7 16Z" fill="#d3b371" />
      <path d="M1 73q2-7 8-11l3 10Z" fill={color} />
      <path d="M11 62l8 9m-3-13 9 12" stroke="#9e783e" opacity=".6" />
    </svg>
  ) : (
    <svg viewBox="0 0 180 48" aria-hidden="true">
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor="#232931" />
          <stop offset=".23" stopColor="#f7f7ef" />
          <stop offset=".48" stopColor="#929b9d" />
          <stop offset=".62" stopColor="#2e3338" />
          <stop offset="1" stopColor="#cdd4ce" />
        </linearGradient>
        <linearGradient id={id + "b"} x2="0" y2="1">
          <stop stopColor="#efd69d" />
          <stop offset=".5" stopColor="#ba8d49" />
          <stop offset="1" stopColor="#f7dfa1" />
        </linearGradient>
      </defs>
      <path
        d="M8 12L123 5L126 43L8 35Z"
        fill={"url(#" + id + ")"}
        stroke="#50545b"
      />
      <path
        d="M119 5h40q9 0 9 9v20q0 9-9 9h-40Z"
        fill={"url(#" + id + "b)"}
        stroke="#a77b3f"
      />
      <path d="M148 6h14q6 0 6 8v20q0 9-6 9h-14Z" fill={color} />
      <path
        d="M125 7v34m5-34v34m6-34v34m5-34v34"
        stroke="#b29057"
        strokeWidth=".7"
      />
      <path d="M14 15l102-7" stroke="white" strokeWidth="2" opacity=".8" />
      {number && (
        <text
          transform={mirrored ? "translate(174 0) scale(-1 1)" : undefined}
          x="87"
          y="33"
          textAnchor="middle"
          fill="white"
          stroke="#222"
          strokeWidth=".8"
          paintOrder="stroke"
          fontSize="28"
          fontWeight="900"
        >
          {number}
        </text>
      )}
    </svg>
  );
}
export function Easel() {
  return (
    <div className="st-easel" aria-hidden="true">
      <i className="st-easel-spine" />
      <i className="st-easel-leg left" />
      <i className="st-easel-leg right" />
      <i className="st-easel-shelf" />
      <i className="st-easel-clip" />
    </div>
  );
}
