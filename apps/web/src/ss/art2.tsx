// 汽水走私犯 UI 第二版：原创矢量角色、图标与瓶盖堆（不使用表情符号）。
import React from "react";

const SKIN = ["#f6c89f", "#e0a57a", "#c98b5e", "#8d5a3b", "#f2d0b3", "#b77b53", "#ffd9b8", "#a86b46"];
const SHIRT = ["#ff5fa2", "#ffd23f", "#3ee6a8", "#4fc3ff", "#ff8a3d", "#b07cff", "#ff4f5e", "#9be15d"];
const HAIR = ["#2b1a12", "#5a3311", "#111", "#e8b04a", "#7a2e1d", "#2b1a12", "#333", "#c4562d"];

/** 每个座位一个固定角色：肤色、花衬衫颜色和配饰都由座位号决定。 */
export function Avatar({
  seat,
  guard = false,
  size = 40,
  className = "",
}: {
  seat: number;
  guard?: boolean;
  size?: number;
  className?: string;
}) {
  const k = seat % 8;
  const skin = SKIN[k],
    shirt = SHIRT[k],
    hair = HAIR[k];
  const acc = guard ? "cap" : (["shades", "straw", "flower", "beanie", "shades", "bandana", "straw", "flower"] as const)[k];
  return (
    <svg
      className={`ss2-avatar ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="31" fill={guard ? "#1d3a8a" : "#2a1940"} stroke="#120a1c" strokeWidth="2" />
      {/* 衬衫 */}
      <path d="M10 64c2-14 10-20 22-20s20 6 22 20z" fill={guard ? "#2f5bd3" : shirt} stroke="#120a1c" strokeWidth="2.5" />
      {!guard && <path d="M22 50l4 4M40 52l3-3M30 58l2 2" stroke="#120a1c" strokeWidth="2" strokeLinecap="round" opacity=".55" />}
      {guard && <path d="M32 46v18M26 52h4" stroke="#ffd23f" strokeWidth="3" />}
      {/* 头 */}
      <circle cx="32" cy="28" r="14" fill={skin} stroke="#120a1c" strokeWidth="2.5" />
      <path d={k % 2 ? "M18 26c2-10 26-12 28 0c-6-4-20-4-28 0z" : "M18 24c4-9 24-9 28 0c-2 2-6-1-14-1s-12 3-14 1z"} fill={hair} stroke="#120a1c" strokeWidth="2" />
      {/* 脸 */}
      {acc === "shades" ? (
        <g>
          <rect x="21" y="25" width="9" height="6" rx="2" fill="#120a1c" />
          <rect x="34" y="25" width="9" height="6" rx="2" fill="#120a1c" />
          <path d="M30 27h4" stroke="#120a1c" strokeWidth="2" />
        </g>
      ) : (
        <g fill="#120a1c">
          <circle cx="26" cy="28" r="2" />
          <circle cx="38" cy="28" r="2" />
        </g>
      )}
      <path d="M27 35c3 3 7 3 10 0" stroke="#120a1c" strokeWidth="2" fill="none" strokeLinecap="round" />
      {acc === "cap" && (
        <g stroke="#120a1c" strokeWidth="2.5">
          <path d="M16 20c2-10 30-10 32 0z" fill="#1d3a8a" />
          <path d="M14 21h36" strokeLinecap="round" />
          <circle cx="32" cy="15" r="3" fill="#ffd23f" />
        </g>
      )}
      {acc === "straw" && (
        <g stroke="#120a1c" strokeWidth="2.5" fill="#f5d06b">
          <ellipse cx="32" cy="17" rx="20" ry="4" />
          <path d="M22 17c0-9 20-9 20 0z" />
          <path d="M22 15h20" stroke="#ff4f5e" strokeWidth="3" />
        </g>
      )}
      {acc === "flower" && (
        <g stroke="#120a1c" strokeWidth="1.5">
          <circle cx="44" cy="19" r="4" fill="#ff5fa2" />
          <circle cx="44" cy="19" r="1.6" fill="#ffd23f" />
        </g>
      )}
      {acc === "beanie" && (
        <path d="M17 22c0-12 30-12 30 0z" fill="#3ee6a8" stroke="#120a1c" strokeWidth="2.5" />
      )}
      {acc === "bandana" && (
        <path d="M17 21c4-6 26-6 30 0l-2 3c-8-3-18-3-26 0z" fill="#ff4f5e" stroke="#120a1c" strokeWidth="2" />
      )}
    </svg>
  );
}

type IconName = "guard" | "deal" | "check" | "wait" | "trophy" | "scan";
/** 统一手绘风格的小图标，替代 🔍🤝✅🏆。 */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    className: "ss2-icon",
  };
  switch (name) {
    case "guard":
      return (
        <svg {...common}>
          <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#4fc3ff" stroke="#120a1c" strokeWidth="2" />
          <path d="M12 7l1.5 3 3.2.4-2.4 2.2.7 3.2L12 14.2 9 15.8l.7-3.2-2.4-2.2 3.2-.4z" fill="#ffd23f" />
        </svg>
      );
    case "deal":
      return (
        <svg {...common}>
          <path d="M2 12l5-5 5 3 5-3 5 5-6 6c-1 1-3 1-4 0z" fill="#ffd23f" stroke="#120a1c" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 13l3 3M12 11l3 3" stroke="#120a1c" strokeWidth="1.6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="#3ee6a8" stroke="#120a1c" strokeWidth="2" />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="#120a1c" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "wait":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="#b07cff" stroke="#120a1c" strokeWidth="2" />
          <path d="M12 6v6l4 2" stroke="#120a1c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" fill="#4fc3ff" stroke="#120a1c" strokeWidth="2.2" />
          <path d="M15 15l6 6" stroke="#120a1c" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M7 3h10v5a5 5 0 01-10 0z" fill="#ffd23f" stroke="#120a1c" strokeWidth="2" />
          <path d="M7 5H3c0 4 2 5 4 5M17 5h4c0 4-2 5-4 5" fill="none" stroke="#120a1c" strokeWidth="2" />
          <path d="M10 14h4v3h3v4H7v-4h3z" fill="#ff8a3d" stroke="#120a1c" strokeWidth="2" />
        </svg>
      );
  }
}

const DENOMS = [30, 20, 10, 5, 3, 1];
/** 把瓶盖数拆成面值，画成一小堆真实瓶盖（最多 6 枚），数字放在旁边。 */
export function CapPile({ caps, base }: { caps: number; base: string }) {
  const coins: number[] = [];
  let left = caps;
  for (const d of DENOMS)
    while (left >= d && coins.length < 6) {
      coins.push(d);
      left -= d;
    }
  return (
    <span className="ss2-caps" aria-label={`${caps} 瓶盖`}>
      <span className="ss2-cap-stack" aria-hidden="true">
        {coins.length === 0 ? (
          <img src={`${base}cap-1.webp`} alt="" style={{ opacity: 0.35 }} />
        ) : (
          coins.map((d, i) => (
            <img key={i} src={`${base}cap-${d}.webp`} alt="" style={{ "--i": i } as React.CSSProperties} />
          ))
        )}
      </span>
      <b>{caps}</b>
    </span>
  );
}

/** 揭晓时的橡皮章：SVG 画墨迹边框，文字用普通 HTML（便于读屏和对比度检查）。 */
export function Stamp({ text, tone }: { text: string; tone: "caught" | "clear" | "warn" }) {
  const color = tone === "caught" ? "#ff6b78" : tone === "clear" ? "#3ee6a8" : "#ffd23f";
  return (
    <span className={`ss2-stamp ss2-stamp-${tone}`} style={{ color }}>
      <svg viewBox="0 0 220 90" aria-hidden="true">
        <defs>
          <filter id={`rough-${tone}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
          </filter>
        </defs>
        <g filter={`url(#rough-${tone})`} fill="none" stroke="currentColor">
          <rect x="6" y="6" width="208" height="78" rx="12" strokeWidth="6" />
          <rect x="14" y="14" width="192" height="62" rx="8" strokeWidth="2" />
        </g>
      </svg>
      <span className="ss2-stamp-text">{text}</span>
    </span>
  );
}
