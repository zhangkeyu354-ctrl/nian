import React from "react";
export function Loudmouth({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={"xb-loudmouth " + (small ? "is-small" : "")}
      viewBox="0 0 320 230"
      fill="none"
      role="img"
      aria-label="原创大嘴喇叭"
    >
      <path
        d="M96 127 80 196q-2 13 12 12l25-2 15-73"
        fill="#FFC83D"
        stroke="#171925"
        strokeWidth="7"
      />
      <path
        d="m86 86 123-49 15 129-134-28q-28-8-29-24T86 86"
        fill="#FF5A3C"
        stroke="#171925"
        strokeWidth="7"
      />
      <path d="M97 84v58" stroke="#FFF2D5" strokeWidth="12" />
      <ellipse
        cx="218"
        cy="101"
        rx="48"
        ry="76"
        transform="rotate(-8 218 101)"
        fill="#FFF2D5"
        stroke="#171925"
        strokeWidth="7"
      />
      <path
        d="M189 101q27-20 57-7 4 45-25 47-26-1-32-40"
        fill="#271C35"
        stroke="#171925"
        strokeWidth="5"
      />
      <path d="m192 99 48-3-4 13-38 2Z" fill="white" />
      <path d="M210 137q10-25 27-7" stroke="#FF5A3C" strokeWidth="13" />
      <ellipse cx="199" cy="71" rx="5" ry="8" fill="#171925" />
      <ellipse cx="229" cy="67" rx="5" ry="8" fill="#171925" />
      <path
        d="m278 65 23-11m-19 43 28 3m-32 31 22 15M47 56l-8-14m25 4 2-20"
        stroke="#FFC83D"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M41 162q-11-17-25-6 10-23 26-9" fill="#9B6BFF" />
      <circle cx="155" cy="27" r="9" fill="#3DDC97" />
      <path
        d="m273 187 9-16 8 16 18 3-14 13 2 19-15-9-17 8 4-20-13-13Z"
        fill="#9B6BFF"
      />
      <path
        d="M114 166q16 7 30 0"
        stroke="#171925"
        strokeWidth="5"
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
export const AVATARS = [
  "🐱",
  "🐸",
  "🐻",
  "🦊",
  "🐼",
  "🐙",
  "🐰",
  "🦁",
  "🐧",
  "🐨",
];
