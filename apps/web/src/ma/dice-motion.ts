const clamp = (p: number) => Math.max(0, Math.min(1, p));
export function rollSample(progress: number) {
  const p = clamp(progress),
    k = p < 0.62 ? p / 0.62 : (p - 0.62) / 0.38;
  return {
    x: p === 1 ? 0 : -0.62 * (1 - p) ** 2,
    height:
      p === 1
        ? 0
        : p < 0.62
          ? 0.18 * (1 - k) + 0.68 * 4 * k * (1 - k)
          : 0.15 * 4 * k * (1 - k),
    angle: (Math.PI * 4.5 * (1 - Math.exp(-3 * p))) / (1 - Math.exp(-3)),
  };
}
export function settleSample(progress: number, fromHeight: number) {
  const p = clamp(progress);
  let height = 0;
  if (p < 0.32) height = fromHeight * (1 - (p / 0.32) ** 2);
  else if (p < 0.64) {
    const k = (p - 0.32) / 0.32;
    height = 0.15 * 4 * k * (1 - k);
  } else if (p < 0.84) {
    const k = (p - 0.64) / 0.2;
    height = 0.04 * 4 * k * (1 - k);
  }
  const hit = Math.max(
    ...[0.32, 0.64, 0.84].map((at) => Math.max(0, 1 - Math.abs(p - at) / 0.04)),
  );
  return {
    height,
    squash: p >= 0.9 ? 1 : 1 - 0.055 * hit,
    orientation: 1 - (1 - Math.min(1, p / 0.72)) ** 3,
  };
}
