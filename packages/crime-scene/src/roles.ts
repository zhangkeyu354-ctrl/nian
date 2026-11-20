export type CrimeSceneRole = "forensic" | "investigator" | "killer" | "accomplice" | "witness";

export function roleCounts(playerCount: number): Record<CrimeSceneRole, number> {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 12) {
    throw new RangeError("犯罪现场需要 4–12 名玩家");
  }
  const advanced = playerCount >= 6;
  return {
    forensic: 1,
    investigator: playerCount - (advanced ? 4 : 2),
    killer: 1,
    accomplice: advanced ? 1 : 0,
    witness: advanced ? 1 : 0,
  };
}

/** 座位顺序由房间保存；洗牌使用服务端注入的随机源。 */
export function assignRoles(
  playerCount: number,
  forensicSeat: number,
  random: () => number = Math.random,
): CrimeSceneRole[] {
  const counts = roleCounts(playerCount);
  if (!Number.isInteger(forensicSeat) || forensicSeat < 0 || forensicSeat >= playerCount) {
    throw new RangeError("鉴证专家座位无效");
  }
  const secret = (Object.entries(counts) as [CrimeSceneRole, number][])
    .flatMap(([role, count]) => role === "forensic" ? [] : Array<CrimeSceneRole>(count).fill(role));
  for (let i = secret.length - 1; i > 0; i--) {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError("随机源须返回 [0, 1) 内的数字");
    const j = Math.floor(n * (i + 1));
    [secret[i], secret[j]] = [secret[j], secret[i]];
  }
  const roles: CrimeSceneRole[] = [];
  for (let seat = 0; seat < playerCount; seat++) roles.push(seat === forensicSeat ? "forensic" : secret.shift()!);
  return roles;
}
