// 保留既有验收入口，UI v1 默认验证用户指定的3/6/10人。
if (process.env.XB_MIN_PLAYERS || process.env.XB_MAX_PLAYERS) {
  const min = Number(process.env.XB_MIN_PLAYERS ?? 3),
    max = Number(process.env.XB_MAX_PLAYERS ?? 10);
  process.env.XB_PLAYER_COUNTS = Array.from(
    { length: max - min + 1 },
    (_, i) => min + i,
  ).join(",");
}
await import("./verify-xb-ui-v1.ts");
