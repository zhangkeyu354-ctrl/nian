import React from "react";

/** 原创扁平插画：5 个物品，每个都可以换成 5 种颜色之一（序号：0 红 1 绿 2 蓝 3 黄 4 白） */
export const PALETTE = [
  { main: "#ee6a5f", shade: "#c94c44" },
  { main: "#5dba5b", shade: "#3f9542" },
  { main: "#4da9e0", shade: "#2f86bd" },
  { main: "#f5c84a", shade: "#d6a52a" },
  { main: "#ffffff", shade: "#d9d9e3" },
] as const;
const INK = "#231d2c";
const PAGE = "#efe4c4";

type P = { main: string; shade: string };
const line = {
  stroke: INK,
  strokeWidth: 4,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

function Chair({ main, shade }: P) {
  return (
    <g {...line}>
      <rect x="21" y="76" width="8" height="14" rx="2" fill={shade} />
      <rect x="71" y="76" width="8" height="14" rx="2" fill={shade} />
      <path
        d="M26 14 h48 a9 9 0 0 1 9 9 v38 h-66 v-38 a9 9 0 0 1 9 -9z"
        fill={main}
      />
      <path d="M30 26 q20 -8 40 0" fill="none" stroke={shade} strokeWidth="3" />
      <rect x="22" y="52" width="56" height="16" rx="5" fill={shade} />
      <rect x="9" y="40" width="19" height="40" rx="8" fill={main} />
      <rect x="72" y="40" width="19" height="40" rx="8" fill={main} />
      <rect x="22" y="64" width="56" height="16" rx="4" fill={main} />
    </g>
  );
}

function Bottle({ main, shade }: P) {
  return (
    <g {...line}>
      <rect x="42" y="5" width="16" height="9" rx="2.5" fill={shade} />
      <path
        d="M44 13 h12 v17 c0 7 13 11 13 24 v34 a6 6 0 0 1 -6 6 h-26 a6 6 0 0 1 -6 -6 v-34 c0 -13 13 -17 13 -24z"
        fill={main}
      />
      <rect
        x="37"
        y="52"
        width="6"
        height="30"
        rx="3"
        fill="#fff"
        opacity="0.55"
        stroke="none"
      />
      <path d="M57 56 v28" stroke={shade} strokeWidth="5" />
    </g>
  );
}

function Book({ main, shade }: P) {
  return (
    <g transform="rotate(-14 50 50)" {...line}>
      <path d="M66 82 v14 l6 -5 l6 5 v-14z" fill={shade} />
      <rect x="28" y="12" width="52" height="74" rx="5" fill={PAGE} />
      <path d="M74 20 v60 M70 20 v60" stroke="#c9bb93" strokeWidth="2" />
      <rect x="18" y="8" width="54" height="76" rx="6" fill={main} />
      <rect x="18" y="8" width="11" height="76" rx="5" fill={shade} />
      <path d="M38 24 h22" stroke={shade} strokeWidth="4" />
    </g>
  );
}

function Cat({ main, shade }: P) {
  return (
    <g {...line}>
      <path
        d="M66 88 c22 2 26 -20 13 -30"
        fill="none"
        stroke={INK}
        strokeWidth="14"
      />
      <path
        d="M66 88 c22 2 26 -20 13 -30"
        fill="none"
        stroke={main}
        strokeWidth="7"
      />
      <path d="M26 90 c-6 -22 2 -46 22 -48 c18 -2 28 20 24 48z" fill={main} />
      <path
        d="M38 88 c-2 -12 2 -22 10 -24"
        fill="none"
        stroke={shade}
        strokeWidth="4"
      />
      <path d="M27 30 l-2 -21 l15 11z M47 20 l11 -14 l3 20z" fill={main} />
      <circle cx="42" cy="33" r="17" fill={main} />
      <circle cx="35" cy="31" r="4.6" fill="#fff" strokeWidth="2.5" />
      <circle cx="49" cy="31" r="4.6" fill="#fff" strokeWidth="2.5" />
      <circle cx="35.6" cy="31.5" r="1.8" fill={INK} stroke="none" />
      <circle cx="49.6" cy="31.5" r="1.8" fill={INK} stroke="none" />
      <path d="M40 39 l2 2 l2 -2" fill="none" strokeWidth="2.5" />
    </g>
  );
}

function Snowman({ main, shade }: P) {
  return (
    <g {...line}>
      <circle cx="50" cy="69" r="25" fill={main} />
      <path
        d="M33 83 a22 22 0 0 0 34 0"
        fill="none"
        stroke={shade}
        strokeWidth="5"
      />
      <circle cx="50" cy="31" r="17" fill={main} />
      <circle cx="44" cy="28" r="2.4" fill={INK} stroke="none" />
      <circle cx="56" cy="28" r="2.4" fill={INK} stroke="none" />
      <path d="M50 32 l10 2.5 l-10 2.5z" fill="#f08a2c" strokeWidth="2" />
      <path d="M44 39 q6 4 12 0" fill="none" strokeWidth="2.5" />
      {[58, 69, 80].map((y) => (
        <circle key={y} cx="50" cy={y} r="2.8" fill={INK} stroke="none" />
      ))}
    </g>
  );
}

const SHAPES = [Chair, Bottle, Book, Cat, Snowman];

/** 单个物品（obj：形状，color：颜色） */
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
    <svg viewBox="-4 -4 108 108" width={size} height={size} aria-hidden="true">
      <Shape {...PALETTE[color]} />
    </svg>
  );
}
