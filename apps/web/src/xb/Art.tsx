import React from "react";
export function Loudmouth({ small = false }: { small?: boolean }) {
  const id = React.useId();
  return (
    <svg
      className={"xb-loudmouth " + (small ? "is-small" : "")}
      viewBox="0 0 160 180"
      fill="none"
      role="img"
      aria-label="原创电台话筒"
    >
      <defs>
        <linearGradient
          id={id}
          x1="40"
          y1="0"
          x2="120"
          y2="160"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f8dd9b" />
          <stop offset=".5" stopColor="#ab7a3c" />
          <stop offset="1" stopColor="#4d3926" />
        </linearGradient>
      </defs>
      <rect
        x="51"
        y="13"
        width="58"
        height="103"
        rx="29"
        fill="#171c20"
        stroke={`url(#${id})`}
        strokeWidth="5"
      />
      {[31, 42, 53, 64, 75].map((y) => (
        <path
          key={y}
          d={`M60 ${y}h40`}
          stroke={`url(#${id})`}
          strokeWidth="2"
        />
      ))}
      <path
        d="M38 86v14c0 54 84 54 84 0V86M80 139v24M53 167h54"
        stroke={`url(#${id})`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="80" cy="96" r="5" fill="#c65d42" />
      <path
        d="M23 47v31m114-31v31"
        stroke="#a17a4b"
        strokeWidth="2"
        opacity=".6"
      />
    </svg>
  );
}
export function HostPortrait({
  seat,
  className = "",
}: {
  seat: number;
  className?: string;
}) {
  return (
    <img
      className={"xb-host-portrait " + className}
      src={`/assets/xiabaiwang-v4/host-${(seat % 10) + 1}.webp`}
      alt=""
      aria-hidden="true"
      width="256"
      height="256"
      loading="lazy"
      decoding="async"
    />
  );
}
export function StudioHeadphones() {
  return (
    <svg
      className="xb-headphones"
      viewBox="0 0 160 130"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M28 83V62a52 52 0 0 1 104 0v21"
        stroke="#dbb878"
        strokeWidth="8"
      />
      <rect
        x="18"
        y="64"
        width="26"
        height="48"
        rx="12"
        fill="#1c262d"
        stroke="#b48b51"
        strokeWidth="3"
      />
      <rect
        x="116"
        y="64"
        width="26"
        height="48"
        rx="12"
        fill="#1c262d"
        stroke="#b48b51"
        strokeWidth="3"
      />
      <path
        d="M58 81q8 12 18 0m10 0q8 12 18 0"
        stroke="#ead9b7"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function CutePoop() {
  return (
    <svg viewBox="0 0 72 72" className="xb-cute-poop" aria-hidden="true">
      <path
        d="M38 5q10 16-6 20 24-8 24 12 18 7 9 21-3 8-27 8H17q-17-2-11-16 2-6 13-8-8-13 8-19 14-5 11-18"
        fill="#B87851"
        stroke="#382C3D"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M20 42q17 5 34-2M16 55q23 6 44 0"
        stroke="#8A5039"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="28" cy="44" rx="4" ry="6" fill="white" />
      <ellipse cx="46" cy="44" rx="4" ry="6" fill="white" />
      <circle cx="29" cy="45" r="2" fill="#242436" />
      <circle cx="45" cy="45" r="2" fill="#242436" />
      <path
        d="M30 55q8 8 15-1"
        stroke="#382C3D"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path d="m11 22-4-5m52-1 5-4" stroke="#FFC83D" strokeWidth="3" />
    </svg>
  );
}
