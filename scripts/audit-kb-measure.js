(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const pond = r(".kb-pond"), hand = r(".kb-hand"), dock = r(".kb-game .kb-dock") || r(".kb-dock"), seats = r(".kb-seats");
  const small = [...document.querySelectorAll(".kb-world *")].filter((e) => {
    const s = getComputedStyle(e);
    return [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(s.fontSize) < 12 && s.display !== "none";
  }).map((e) => (e.textContent || "").trim().slice(0, 10) + ":" + getComputedStyle(e).fontSize);
  const tiny = [...document.querySelectorAll(".kb-world button")].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width && (b.width < 44 || b.height < 44);
  }).map((e) => e.className.slice(0, 20) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height));
  return {
    pondPct: pond ? Math.round((pond.width * pond.height) / (innerWidth * innerHeight) * 100) : 0,
    pondW: Math.round(pond?.width ?? 0), handBottom: Math.round(hand?.bottom ?? 0), dockTop: Math.round(dock?.top ?? 0),
    seatsH: Math.round(seats?.height ?? 0), scrollH: document.documentElement.scrollHeight,
    small: [...new Set(small)].slice(0, 8), tiny: tiny.slice(0, 6), longTask: window.__lt,
  };
})()
