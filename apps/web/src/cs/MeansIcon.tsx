import type { ReactNode } from "react";

/** Simple single-object silhouettes for the six means cards without raster art. */
export default function MeansIcon({ id }: { id: string }) {
  const common = { fill: "#c0c8b8", stroke: "#16292b", strokeWidth: 2.5, strokeLinejoin: "round" as const };
  const art: Record<string, ReactNode> = {
    "means-005": <><path d="M17 45h58v14H58l-7 27H34l5-27H17z" {...common} /><path d="M65 59v10h-9M25 43v-6h14v6" fill="none" stroke="#e5e1cb" strokeWidth="3" /></>,
    "means-019": <><path d="M35 25h30v12l7 8v46H28V45l7-8z" {...common} /><path d="M35 37h30M34 62h32" fill="none" stroke="#e5e1cb" strokeWidth="3" /><circle cx="39" cy="72" r="2" fill="#1d3737" /><circle cx="51" cy="78" r="2" fill="#1d3737" /><circle cx="61" cy="69" r="2" fill="#1d3737" /></>,
    "means-053": <><path d="M28 95l13-31 32-39 9 5-25 49-19 22z" {...common} /><path d="M28 95l-8 15 10 5 8-14M43 66l18 9" fill="none" stroke="#e5e1cb" strokeWidth="4" /></>,
    "means-055": <><rect x="22" y="48" width="56" height="45" rx="3" {...common} /><path d="M34 48V37h32v11M50 37V21M50 21c10 2 14 8 13 16" fill="none" stroke="#d8d6bf" strokeWidth="3" /><path d="M30 70h40" stroke="#1a3434" strokeWidth="3" /></>,
    "means-060": <><path d="M12 56h67v11H48l-10 19H25l7-19H12z" {...common} /><path d="M29 55h25v-7H29zM56 48h15M79 61h11" fill="none" stroke="#e5e1cb" strokeWidth="3" /><circle cx="41" cy="47" r="5" fill="#263d3d" stroke="#d8d6bf" strokeWidth="2" /></>,
    "means-086": <><path d="M32 39h36v58H32z" {...common} /><path d="M39 39V24h5v15M56 39V24h5v15M41 58h18M41 68h18" fill="none" stroke="#e5e1cb" strokeWidth="3" /></>,
  };
  return <svg className="cs-means-icon" viewBox="0 0 100 130" aria-hidden="true" focusable="false">{art[id]}</svg>;
}
