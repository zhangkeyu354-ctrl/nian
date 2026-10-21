import React from "react";

/** 原创圆角玩具造型。每种颜色独立设计正面、侧面与高光。 */
export const PALETTE = [
  { main: "#ff6159", shade: "#ce3e47", light: "#ff9e88" },
  { main: "#36bf55", shade: "#168d45", light: "#8bea7b" },
  { main: "#16b5e5", shade: "#087faf", light: "#83e4fa" },
  { main: "#ffd139", shade: "#dfa022", light: "#fff18b" },
  { main: "#fffef9", shade: "#cdd7df", light: "#ffffff" },
] as const;
const INK = "#19151f";
type P = { main: string; shade: string; light: string };
const line = {
  stroke: INK,
  strokeWidth: 5.2,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};
function Chair({ main, shade, light }: P) {
  return (
    <g {...line}>
      <path d="M19 73v15l9 4 6-5V76m35-7v17l9 3 5-6V68" fill={shade} />
      <path
        d="M24 10 66 7q11 0 13 11l4 40-54 11-17-9-2-36q-1-11 14-14Z"
        fill={shade}
      />
      <path
        d="M22 14 59 12q10-1 11 10l3 33-51 8-6-34q-2-12 6-15Z"
        fill={main}
        strokeWidth="3"
      />
      <path
        d="m26 21 29-2q6 0 7 6"
        fill="none"
        stroke={light}
        strokeWidth="7"
      />
      <path d="m25 55 42-8 14 14-46 14Z" fill={light} />
      <path d="m32 70 47-9 4 18-49 10-10-9Z" fill={shade} />
      <path d="m31 68 41-8 2 14-42 9Z" fill={main} strokeWidth="3" />
      <path
        d="M13 43q-9 1-7 10l5 25q1 7 11 5l7-2-5-33q-1-7-11-5Z"
        fill={main}
      />
      <path d="m70 40 12-2q9-1 10 8l3 23q1 7-9 9l-6 1-5-26-7-4Z" fill={main} />
      <path d="m13 50 5 23m61-28 6-1" stroke={light} strokeWidth="4" />
    </g>
  );
}
function Bottle({ main, shade, light }: P) {
  return (
    <g {...line}>
      <path
        d="M37 9q13-6 26 0v9l-4 3v15q0 5 10 12 7 6 7 16v22q0 12-25 12T26 86V64q0-10 7-16 10-7 10-12V21l-6-3Z"
        fill={main}
      />
      <path
        d="M58 26v15q0 6 9 13 5 5 5 13v19q0 8-21 8-11 0-17-4 27 2 27-10V64q0-8-6-14-5-6-4-13V26Z"
        fill={shade}
        stroke="none"
      />
      <path d="M37 10q13 5 26 0m-20 12h16" fill="none" strokeWidth="3" />
      <path
        d="M40 57q-5 4-5 12v12m13-52v9"
        fill="none"
        stroke={light}
        strokeWidth="6"
      />
    </g>
  );
}
function Book({ main, shade, light }: P) {
  return (
    <g {...line}>
      <path d="m15 23 54-14 18 11v61L34 96 15 83Z" fill={shade} />
      <path
        d="m25 72 47-13 10 8v13L34 92q-12-2-12-10Z"
        fill="#f8edc9"
        strokeWidth="3"
      />
      <path d="m34 81 40-11m-37 16 38-10" stroke="#d0c397" strokeWidth="2" />
      <path d="m15 23 53-14 4 53-46 13q-9 2-11 10Z" fill={main} />
      <path
        d="m24 28 37-10m-38 14-1 30"
        fill="none"
        stroke={light}
        strokeWidth="5"
      />
      <path d="m49 80 12-3v18l-7-4-5 7Z" fill={main} strokeWidth="3" />
    </g>
  );
}
function Cat({ main, shade, light }: P) {
  return (
    <g {...line}>
      <path d="M68 84q27 3 18-24" fill="none" strokeWidth="14" />
      <path d="M68 84q27 3 18-24" fill="none" stroke={shade} strokeWidth="7" />
      <path
        d="M33 42q34-9 41 28l3 18q-2 8-15 7H25q-12-5-3-13l8-3Z"
        fill={main}
      />
      <path
        d="M57 51q18 19 13 35l-15 4-24-1q27-5 22-25Z"
        fill={shade}
        stroke="none"
      />
      <path d="m34 59-2 21m15-1q-7 7-2 12" fill="none" strokeWidth="3" />
      <path
        d="M20 13 36 21q7-2 14 0l15-13 2 30q0 20-23 21T19 39Z"
        fill={main}
      />
      <path d="m25 20 7 7m25-7-4 8" stroke={light} strokeWidth="4" />
      <ellipse cx="33" cy="36" rx="6" ry="8" fill="white" strokeWidth="2" />
      <ellipse cx="52" cy="35" rx="6" ry="8" fill="white" strokeWidth="2" />
      <path d="M35 35v3m19-4v3m-14 8 4 3 4-3" strokeWidth="3" fill="none" />
      <path d="m24 46-7 1m42-3 9-1" strokeWidth="2" />
    </g>
  );
}
function Snowman({ main, shade, light }: P) {
  return (
    <g {...line}>
      <path d="M27 47q-17 14-13 32 3 18 34 18t35-20q3-19-18-32Z" fill={main} />
      <path
        d="M67 52q16 19 6 32-9 13-37 7 29-1 27-26Z"
        fill={shade}
        stroke="none"
      />
      <path d="M51 7q24 1 24 23T50 54Q26 53 26 31T51 7Z" fill={main} />
      <path
        d="M65 14q11 25-5 33l-13 3q28 0 25-23Z"
        fill={shade}
        stroke="none"
      />
      <path
        d="M37 28q-1-8 6-11m-16 47-3 9"
        stroke={light}
        strokeWidth="5"
        fill="none"
      />
      <path d="M42 29v1m17-1v1" strokeWidth="5" />
      <path d="m49 34 13 3-13 5Z" fill="#ff963b" strokeWidth="2" />
      <path d="M43 44q7 5 12 0" fill="none" strokeWidth="2.5" />
      {[63, 75, 86].map((y) => (
        <circle key={y} cx="47" cy={y} r="3" fill={INK} stroke="none" />
      ))}
    </g>
  );
}
const SHAPES = [Chair, Bottle, Book, Cat, Snowman];
export function ObjectArt({
  obj,
  color,
  size = "100%",
}: {
  obj: number;
  color: number;
  size?: number | string;
}) {
  const Shape = SHAPES[obj];
  return (
    <svg viewBox="0 0 102 102" width={size} height={size} aria-hidden="true">
      <Shape {...PALETTE[color]} />
    </svg>
  );
}
