import React from "react";

/** Original vector artwork. Palette always comes from the scoped world tokens. */
export function Sigil({ kind = "seal" }: { kind?: string }) {
  const drawings: Record<string, React.ReactNode> = {
    seal: <><circle cx="40" cy="40" r="26"/><circle cx="40" cy="40" r="20"/><path d="M30 25v30m20-30v30M27 40h26M30 55l10-10 10 10"/></>,
    evidence: <><path d="M25 12h26l8 9v47H25zM51 12v12h8M32 31h18M32 38h18M32 45h10"/><circle cx="49" cy="52" r="10"/><path d="M56 59l10 10"/></>,
    accusation: <><path d="M20 60l27-27M30 14l34 34-12 12-34-34zM17 66h47M22 59h36v7"/></>,
    alibi: <><path d="M20 18l20-7 20 7v23c0 17-20 28-20 28S20 58 20 41zM29 38l9 9 15-19"/></>,
    cat: <><path d="M21 58c-7-14-1-30 2-40l16 11 17-11 3 26c8 1 10 8 7 15-3 9-18 12-26 7-9-6-5-15 2-13M27 41h4m14 0h4M34 49l5 3 5-3"/></>,
    conspiracy: <><circle cx="40" cy="40" r="25"/><path d="M12 40h56M40 12v56M22 22l36 36M22 58l36-36M19 14l5 9-10-1M66 60l-10-2 2 10"/><circle cx="40" cy="40" r="9"/></>,
    witch: <><path d="M18 53h47L49 43 38 13l-9 30zM24 58c4 10 29 10 34 0M40 24l9 19H29"/><path d="M19 16l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></>,
    not_witch: <><path d="M20 64V32l20-18 20 18v32zM34 64V44h12v20M26 34h7m14 0h7M40 8v10"/><path d="M15 66h50"/></>,
    constable: <><path d="M40 10l8 19 22 2-17 14 5 23-18-13-18 13 5-23-17-14 22-2z"/><circle cx="40" cy="40" r="10"/></>,
    piety: <><path d="M36 12h8v19h18v8H44v28h-8V39H18v-8h18z"/></>,
    matchmaker: <><path d="M40 66S10 49 13 31c3-18 24-17 27-4 4-13 25-14 28 4 3 18-28 35-28 35zM39 27l-6 12 12 5-7 13"/></>,
    stocks: <><rect x="12" y="26" width="56" height="24" rx="3"/><circle cx="40" cy="38" r="10"/><path d="M18 50v18M62 50v18M11 25h58M20 37h4m32 0h4"/></>,
    moon: <path d="M52 12C10 11 6 65 42 68c13 1 23-6 27-15-30 9-44-23-17-41z"/>,
    asylum: <><path d="M15 65V29l25-17 25 17v36zM23 32h34M30 65V41h20v24M11 65h58M40 7v14"/></>,
    scapegoat: <><path d="M22 30c-6-10 0-18 8-16M58 30c6-10 0-18-8-16"/><path d="M26 30c0-9 28-9 28 0v14c0 12-8 20-14 20s-14-8-14-20z"/><path d="M33 42h4m6 0h4M36 54h8"/></>,
    curse: <><path d="M40 10c-14 14 6 22-8 36s10 22 8 24"/><circle cx="40" cy="40" r="26" strokeDasharray="4 6"/><path d="M22 22l36 36"/></>,
    arson: <><path d="M40 68c-15 0-22-10-20-22 2-10 10-14 10-26 8 6 10 14 10 20 4-4 6-10 6-16 10 8 16 18 14 26-2 12-8 18-20 18z"/><path d="M40 68c-6 0-9-5-7-10 2-4 5-6 7-12 3 6 7 8 7 13 0 5-3 9-7 9z"/></>,
    witness: <><path d="M10 40c10-14 20-20 30-20s20 6 30 20c-10 14-20 20-30 20S20 54 10 40z"/><circle cx="40" cy="40" r="9"/><circle cx="40" cy="40" r="3"/></>,
    night: <><path d="M48 14C18 13 14 58 42 62c11 1 19-4 23-12-24 7-35-19-17-36z"/><path d="M18 18l2 4 4 2-4 2-2 4-2-4-4-2 4-2zM62 22l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></>,
    robbery: <><path d="M28 15l6 12h14l6-12zM32 29C10 53 15 68 40 68s31-15 9-39z"/><path d="M41 38v21M47 41c-16-7-18 11-4 10 13 0 5 15-7 6"/></>,
  };
  return <svg className="wt-sigil" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawings[kind] ?? drawings.seal}</svg>;
}

export function Portrait({ index }: { index: number }) {
  const bonnet = index % 3 === 1;
  return <svg viewBox="0 0 80 92" className={`wt-portrait wt-person-${index % 4}`} aria-hidden="true">
    <path d="M0 0h80v92H0z" fill="var(--wt-portrait-bg)"/>
    <path d="M4 92c1-23 14-34 35-34s36 11 38 34" fill="var(--wt-coat)"/>
    <path d="M24 61l16 17 17-17-6-6H30z" fill="var(--wt-collar)"/>
    <path d="M23 25c-2-23 36-24 36 1l-3 25-12 11-15-8z" fill="var(--wt-hair)"/>
    <path d="M27 27q12-2 23-9l6 15-3 17-11 8-12-8z" fill="var(--wt-skin)"/>
    <path d="M33 34h4m9 0h4M41 37l-2 7h5m-9 5q6 4 12-1" fill="none" stroke="var(--wt-paper-ink)" strokeWidth="1.3"/>
    {bonnet ? <><path d="M19 32C9 3 59-9 65 25l-9 7-6-14-25 8z" fill="var(--wt-collar)"/><path d="M22 30l-2 24 10 12-4-39" fill="var(--wt-collar)"/></> : <><path d="M17 22l6-14 28-3 13 19z" fill="var(--wt-hair)"/><path d="M11 22l58 1v5H11z" fill="var(--wt-coat)" stroke="var(--wt-gold-dark)"/></>}
    {index % 4 === 2 && <path d="M30 46l7 11 14-3 5-11-9 7-8-2z" fill="var(--wt-hair)"/>}
    <path d="M4 4v84h72" fill="none" stroke="var(--wt-moon)" opacity=".2"/>
  </svg>;
}

export function RoomArt() {
  // A quiet plaster wall shares the table's two light sources; no pasted scenery.
  return <div className="wt-room-art" aria-hidden="true"><div className="wt-lit-wall"/><div className="wt-grain"/><div className="wt-vignette"/><div className="wt-moon-grid"/></div>;
}

export function Candle() {
  return <div className="wt-candle" aria-hidden="true"><i className="wt-flame"/><i className="wt-wax-stick"/><i className="wt-candle-base"/></div>;
}
