import React, { useId } from "react";

/** Original vector box covers for the two drawing games (no third-party art). */

export function FakeArtistCover({ logo = true }: { logo?: boolean }) {
  const u = useId().replaceAll(":", "");
  const id = (s: string) => u + s;
  const url = (s: string) => `url(#${u + s})`;
  return (
    <svg
      className="cover-svg cover-fa"
      viewBox="0 0 800 450"
      role="img"
      aria-label="纽约伪画家 封面"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={id("wall")} cx="62%" cy="38%" r="75%">
          <stop offset="0" stopColor="#ff6d9d" />
          <stop offset=".45" stopColor="#e93a75" />
          <stop offset="1" stopColor="#8e1546" />
        </radialGradient>
        <radialGradient id={id("spot")} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff3d6" stopOpacity=".75" />
          <stop offset=".55" stopColor="#ffd0a8" stopOpacity=".18" />
          <stop offset="1" stopColor="#ffd0a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("floor")} x2="0" y2="1">
          <stop offset="0" stopColor="#8a3d2d" />
          <stop offset="1" stopColor="#4b1c1f" />
        </linearGradient>
        <linearGradient id={id("wood")} x1="0" x2="1">
          <stop offset="0" stopColor="#9d6a36" />
          <stop offset=".35" stopColor="#e2b676" />
          <stop offset=".6" stopColor="#c48f50" />
          <stop offset="1" stopColor="#8a5a2c" />
        </linearGradient>
        <linearGradient id={id("paper")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f3ece1" />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f6223" />
          <stop offset=".18" stopColor="#f6d98f" />
          <stop offset=".45" stopColor="#d9a84d" />
          <stop offset=".7" stopColor="#fff0b8" />
          <stop offset="1" stopColor="#a87531" />
        </linearGradient>
        <linearGradient id={id("night")} x2="0" y2="1">
          <stop offset="0" stopColor="#1d1240" />
          <stop offset="1" stopColor="#4b2a6e" />
        </linearGradient>
        <linearGradient id={id("jar")} x1="0" x2="1">
          <stop offset="0" stopColor="#d9eef2" stopOpacity=".55" />
          <stop offset=".3" stopColor="#ffffff" stopOpacity=".85" />
          <stop offset="1" stopColor="#9cc3cc" stopOpacity=".5" />
        </linearGradient>
        <filter id={id("soft")} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#3a0720" floodOpacity=".45" />
        </filter>
        <filter id={id("lift")} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#3a0720" floodOpacity=".35" />
        </filter>
        <filter id={id("grain")}>
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0" />
        </filter>
        <filter id={id("title")} x="-10%" y="-30%" width="120%" height="170%">
          <feDropShadow dx="0" dy="3" stdDeviation="0" floodColor="#7a1038" floodOpacity="1" />
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#3a0720" floodOpacity=".45" />
        </filter>
      </defs>
      <rect width="800" height="450" fill={url("wall")} />
      {/* wainscot stripes */}
      <g opacity=".08" stroke="#fff" strokeWidth="2">
        {Array.from({ length: 30 }, (_, i) => (
          <path key={i} d={`M${i * 28 + 4} 0V360`} />
        ))}
      </g>
      {/* night window with skyline */}
      <g filter={url("lift")}>
        <rect x="52" y="44" width="170" height="150" rx="6" fill="#5b1734" />
        <rect x="62" y="54" width="150" height="130" rx="3" fill={url("night")} />
        <circle cx="178" cy="82" r="13" fill="#fff4cf" opacity=".9" />
        <path
          d="M62 184V150h14v-22h10v22h10v-40h8l4-12 4 12h6v52h12v-30h16v-12h10v12h8v44h12v-24h12v24h16v-18h8V184Z"
          fill="#120a29"
        />
        <g fill="#ffd77a" opacity=".85">
          <rect x="99" y="120" width="3" height="4" />
          <rect x="105" y="132" width="3" height="4" />
          <rect x="99" y="144" width="3" height="4" />
          <rect x="143" y="146" width="3" height="4" />
          <rect x="150" y="158" width="3" height="4" />
          <rect x="176" y="164" width="3" height="4" />
        </g>
        <path d="M137 54v130M62 119h150" stroke="#5b1734" strokeWidth="6" />
      </g>
      <ellipse cx="520" cy="210" rx="300" ry="230" fill={url("spot")} />
      {/* floor */}
      <path d="M0 360h800v90H0Z" fill={url("floor")} />
      <g stroke="#2e0e12" strokeOpacity=".35">
        <path d="M0 382h800M0 410h800M0 436h800" />
        <path d="M120 360l-30 90M300 360l-12 90M480 360l6 90M660 360l26 90" />
      </g>
      <path d="M0 360h800" stroke="#f9a37c" strokeOpacity=".35" strokeWidth="2" />
      <ellipse cx="520" cy="372" rx="210" ry="16" fill="#2a0612" opacity=".45" />
      {/* easel */}
      <g filter={url("soft")}>
        <path d="M447 120L392 380h20l52-250Z" fill={url("wood")} />
        <path d="M593 120l55 260h-20l-52-250Z" fill={url("wood")} />
        <rect x="510" y="40" width="20" height="335" rx="4" fill={url("wood")} />
        <rect x="372" y="300" width="296" height="16" rx="3" fill={url("wood")} />
        <rect x="372" y="300" width="296" height="4" rx="2" fill="#f5d39a" opacity=".7" />
        <rect x="498" y="52" width="44" height="20" rx="4" fill={url("wood")} />
      </g>
      {/* canvas with the group drawing */}
      <g filter={url("soft")}>
        <rect x="376" y="70" width="288" height="226" rx="3" fill={url("paper")} />
        <rect x="376" y="70" width="288" height="226" rx="3" filter={url("grain")} />
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6.5">
        {/* cat face drawn by several players, one stroke clearly a bluff */}
        <path d="M452 236c-10-36-4-72 14-96l18 36" stroke="#242333" />
        <path d="M484 176c22-8 46-8 70 0l18-36c16 24 22 60 12 96" stroke="#ed5368" />
        <path d="M452 236c26 30 104 30 132 0" stroke="#3e7ee8" />
        <path d="M494 206h.5M546 206h.5" stroke="#242333" strokeWidth="11" />
        <path d="M512 226l8 6 8-6" stroke="#e6a52d" />
        <path d="M470 222l-34-6M470 230l-32 8M568 222l34-6M568 230l32 8" stroke="#2e9f83" strokeWidth="4.5" />
        {/* the suspicious stroke */}
        <path d="M600 108l14 14-12 8 16 10-10 10 14 12" stroke="#9a5fd0" strokeWidth="5.5" />
      </g>
      <g transform="translate(626 92) rotate(12)">
        <circle r="17" fill="#ffd84a" filter={url("lift")} />
        <text y="7" textAnchor="middle" fontSize="22" fontWeight="900" fill="#7a1038">
          ?
        </text>
      </g>
      {/* jar of brushes */}
      <g filter={url("lift")}>
        {[
          ["#ed5368", -16],
          ["#3e7ee8", -4],
          ["#e6a52d", 8],
          ["#2e9f83", 18],
        ].map(([c, r], i) => (
          <g key={i} transform={`translate(${712 + i * 6} 352) rotate(${r})`}>
            <rect x="-3" y="-118" width="6" height="96" rx="3" fill="#d8b071" />
            <rect x="-4" y="-132" width="8" height="18" rx="2" fill="#c5cbd0" />
            <path d="M-4 -132q4-22 8 0Z" fill={String(c)} />
          </g>
        ))}
        <path d="M690 286h70l-6 76h-58Z" fill={url("jar")} stroke="#ffffff" strokeOpacity=".6" />
        <path d="M698 296v58" stroke="#fff" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* gold secret placard */}
      <g transform="translate(268 362) rotate(-6)" filter={url("soft")}>
        <rect width="104" height="76" rx="4" fill={url("gold")} />
        <rect x="6" y="6" width="92" height="64" rx="2" fill="none" stroke="#6a4614" strokeOpacity=".35" />
        <text x="52" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill="#4a2f0d">
          此次的题目
        </text>
        <path d="M18 28h68" stroke="#4a2f0d" strokeOpacity=".4" />
        <text x="52" y="62" textAnchor="middle" fontSize="32" fontWeight="900" fill="#3a2508">
          ?
        </text>
        <circle cx="10" cy="10" r="2.5" fill="#fff6cf" />
        <circle cx="94" cy="10" r="2.5" fill="#fff6cf" />
      </g>
      {logo && (
        <g className="cover-logo">
          <text
            x="56"
            y="262"
            fontSize="17"
            fontWeight="800"
            letterSpacing="5"
            fill="#ffe7ef"
            opacity=".9"
          >
            绘画派对 · 卧底篇
          </text>
          <text
            x="52"
            y="326"
            fontSize="64"
            fontWeight="900"
            fill="#ffffff"
            filter={url("title")}
            letterSpacing="2"
          >
            纽约伪画家
          </text>
          <rect x="56" y="344" width="150" height="4" rx="2" fill="#ffd84a" />
        </g>
      )}
      <rect width="800" height="450" fill="none" filter={url("grain")} />
    </svg>
  );
}

export function TelephoneCover({ logo = true }: { logo?: boolean }) {
  const u = useId().replaceAll(":", "");
  const id = (s: string) => u + s;
  const url = (s: string) => `url(#${u + s})`;
  return (
    <svg
      className="cover-svg cover-tp"
      viewBox="0 0 800 450"
      role="img"
      aria-label="传情画意 封面"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={id("bg")} cx="65%" cy="30%" r="85%">
          <stop offset="0" stopColor="#b277ff" />
          <stop offset=".45" stopColor="#7440d6" />
          <stop offset="1" stopColor="#2c1468" />
        </radialGradient>
        <radialGradient id={id("glow")} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#f3e6ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#f3e6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("page")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f1e9f6" />
        </linearGradient>
        <linearGradient id={id("pencil")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffe07a" />
          <stop offset=".5" stopColor="#f2b632" />
          <stop offset="1" stopColor="#c9861a" />
        </linearGradient>
        <filter id={id("soft")} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#1b0848" floodOpacity=".5" />
        </filter>
        <filter id={id("lift")} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#1b0848" floodOpacity=".35" />
        </filter>
        <filter id={id("grain")}>
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0" />
        </filter>
        <filter id={id("title")} x="-10%" y="-30%" width="120%" height="170%">
          <feDropShadow dx="0" dy="3" stdDeviation="0" floodColor="#2c1468" floodOpacity="1" />
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#14053a" floodOpacity=".5" />
        </filter>
      </defs>
      <rect width="800" height="450" fill={url("bg")} />
      <g opacity=".14" fill="#fff">
        {Array.from({ length: 70 }, (_, i) => (
          <circle key={i} cx={(i * 97) % 800} cy={(i * 53) % 450} r={(i % 3) * 0.6 + 0.6} />
        ))}
      </g>
      <ellipse cx="560" cy="210" rx="290" ry="220" fill={url("glow")} />
      {/* dashed path linking the pages */}
      <path
        d="M378 150C430 70 520 70 548 130M640 250c40 40 40 110-10 140"
        fill="none"
        stroke="#e8dbff"
        strokeOpacity=".7"
        strokeWidth="3"
        strokeDasharray="2 10"
        strokeLinecap="round"
      />
      {/* page 1: the prompt */}
      <g transform="translate(300 128) rotate(-9)" filter={url("soft")}>
        <rect width="190" height="128" rx="10" fill={url("page")} />
        <g stroke="#e1d3ee" strokeWidth="1.5">
          <path d="M16 46h158M16 74h158M16 102h158" />
        </g>
        <g fill="#7b62a5">
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={20 + i * 28} y="-6" width="8" height="16" rx="4" />
          ))}
        </g>
        <text x="18" y="32" fontSize="12" fontWeight="700" fill="#a08ab9">
          第 1 页 · 题目
        </text>
        <text x="95" y="86" textAnchor="middle" fontSize="27" fontWeight="900" fill="#3f2468">
          戴帽子的猫
        </text>
      </g>
      {/* page 2: the drawing */}
      <g transform="translate(516 100) rotate(6)" filter={url("soft")}>
        <rect width="220" height="150" rx="10" fill={url("page")} />
        <g fill="#7b62a5">
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={22 + i * 28} y="-6" width="8" height="16" rx="4" />
          ))}
        </g>
        <text x="18" y="30" fontSize="12" fontWeight="700" fill="#a08ab9">
          第 2 页 · 画
        </text>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
          <path d="M70 128c-8-26-4-50 8-64l12 22c16-6 32-6 46 0l12-22c12 14 16 38 8 64" stroke="#242333" />
          <path d="M70 128c18 18 76 18 86 0" stroke="#242333" />
          <path d="M66 62h92M84 62c0-22 10-34 28-34s28 12 28 34" stroke="#ed5368" />
          <path d="M96 100h.5M130 100h.5" stroke="#242333" strokeWidth="8" />
          <path d="M108 114l5 4 5-4" stroke="#e6a52d" />
        </g>
      </g>
      {/* page 3: the drifted guess */}
      <g transform="translate(520 290) rotate(-4)" filter={url("soft")}>
        <rect width="200" height="112" rx="10" fill={url("page")} />
        <g stroke="#e1d3ee" strokeWidth="1.5">
          <path d="M16 46h168M16 74h168" />
        </g>
        <text x="18" y="30" fontSize="12" fontWeight="700" fill="#a08ab9">
          第 3 页 · 猜
        </text>
        <text x="100" y="84" textAnchor="middle" fontSize="25" fontWeight="900" fill="#3f2468">
          企鹅去开会？
        </text>
      </g>
      {/* pencil */}
      <g transform="translate(420 345) rotate(-28)" filter={url("lift")}>
        <rect x="0" y="0" width="150" height="20" rx="3" fill={url("pencil")} />
        <path d="M0 0l-30 10 30 10Z" fill="#f1d2a4" />
        <path d="M-30 10l10-3.4v6.8Z" fill="#3a2f45" />
        <rect x="150" y="0" width="16" height="20" fill="#c9ced6" />
        <rect x="166" y="0" width="18" height="20" rx="4" fill="#ff8fb1" />
      </g>
      {/* sparkles */}
      <g fill="#83ffe3">
        <path d="M498 70l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" />
        <path d="M748 270l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" opacity=".8" />
        <path d="M470 278l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" opacity=".7" />
      </g>
      {logo && (
        <g className="cover-logo">
          <text x="56" y="262" fontSize="17" fontWeight="800" letterSpacing="5" fill="#e7dbff" opacity=".9">
            绘画派对 · 传话篇
          </text>
          <text x="52" y="326" fontSize="64" fontWeight="900" fill="#ffffff" filter={url("title")} letterSpacing="4">
            传情画意
          </text>
          <rect x="56" y="344" width="150" height="4" rx="2" fill="#83ffe3" />
        </g>
      )}
      <rect width="800" height="450" fill="none" filter={url("grain")} />
    </svg>
  );
}
