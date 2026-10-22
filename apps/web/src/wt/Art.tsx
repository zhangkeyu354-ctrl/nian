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
  return <div className="wt-room-art" aria-hidden="true">
    <svg className="wt-wide-room" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      <defs><pattern id="wt-grain" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M0 5h120M0 38h120M0 86h120M9 0v120M68 0v120" stroke="var(--wt-moon)" strokeWidth=".5" opacity=".06"/></pattern><radialGradient id="wt-moonshine"><stop stopColor="var(--wt-moon)" stopOpacity=".25"/><stop offset="1" stopColor="var(--wt-moon)" stopOpacity="0"/></radialGradient></defs>
      <rect width="1440" height="900" fill="var(--wt-ink)"/>
      <path d="M0 0h1440v900H0z" fill="url(#wt-grain)"/>
      <ellipse cx="260" cy="190" rx="470" ry="380" fill="url(#wt-moonshine)"/>
      <g stroke="var(--wt-wood-dark)" strokeWidth="10">
        <path d="M71 340V130a105 105 0 0 1 210 0v210z" fill="var(--wt-night)"/>
        <circle cx="115" cy="107" r="29" fill="var(--wt-moon)" stroke="none" opacity=".35"/>
        <path d="M78 278l27-29 23 29v56H78zm55 56V221l27-27 28 27v113m8 0v-68l33-25 35 25v68" fill="var(--wt-wall)" strokeWidth="2"/>
        <path d="M80 170h194M80 254h194M176 30v307"/>
      </g>
      <g fill="var(--wt-candle)"><path d="M145 235h6v11h-6zm15 15h6v12h-6zm65 27h6v12h-6z"/></g>
      <path d="M77 340L500 750h380L280 340z" fill="var(--wt-moon)" opacity=".025"/>
      <g fill="var(--wt-night)" stroke="var(--wt-line)" strokeWidth="2">
        <path d="M1060 774V477l98-79 112 79v297zM1020 477l138-106 148 106z"/>
        <path d="M1179 774V573l89-79 102 79v201M1144 574l124-109 132 109z"/>
        <path d="M1065 758V625l-45-45-45 45v133M938 626l82-81 81 81z"/>
      </g>
      <g fill="var(--wt-candle)" opacity=".4"><path d="M1136 516h16v25h-16zm38 0h16v25h-16zm81 94h12v20h-12zm24 0h12v20h-12z"/></g>
      <path d="M0 806q350-55 720-5t720-20v119H0z" fill="var(--wt-wood-dark)"/>
      <path d="M0 830l1440-12M0 867l1440-13M240 820l-80 80M1050 820l90 80" stroke="var(--wt-wood)" opacity=".5"/>
      <path d="M1350 900q-30-230 45-443m-35 243-70-55m86-8 50-73m-45 12-54-80" stroke="var(--wt-night)" strokeWidth="13" fill="none"/>
    </svg>
    <svg className="wt-mobile-room" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <rect width="390" height="844" fill="var(--wt-ink)"/>
      <g stroke="var(--wt-wood-dark)" strokeWidth="6">
        <path d="M-28 350V146a58 58 0 0 1 116 0v204z" fill="var(--wt-night)"/>
        <circle cx="49" cy="151" r="18" fill="var(--wt-moon)" stroke="none" opacity=".5"/>
        <path d="M-28 226H88M30 91v259M-28 290H88"/>
      </g>
      <g fill="var(--wt-wall)" stroke="var(--wt-line)" strokeWidth=".5">
        <path d="M290 382V206l39-43 40 43v176zM282 207l47-54 48 54z"/>
        <path d="M248 400V280l36-35 33 35v120M240 281l44-44 42 44z"/>
        <path d="M345 420V321l35-33 35 33v99"/>
      </g>
      <path d="M313 224h7v12h-7zm18 0h7v12h-7zm-61 77h7v11h-7z" fill="var(--wt-candle)" opacity=".25"/>
      <path d="M0 780q180-25 390 10v54H0z" fill="var(--wt-wood-dark)"/>
      <path d="M0 818h390M90 794l-20 50M290 794l10 50" stroke="var(--wt-wood)" opacity=".5"/>
    </svg>
    <div className="wt-grain"/><div className="wt-vignette"/><div className="wt-moon-grid"/>
  </div>;
}

export function Candle() {
  return <div className="wt-candle" aria-hidden="true"><i className="wt-flame"/><i className="wt-wax-stick"/><i className="wt-candle-base"/></div>;
}
