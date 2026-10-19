export function resultClass(face: number) {
  if (!Number.isInteger(face) || face < 0 || face > 5)
    throw new Error("INVALID_DIE");
  return face === 0 ? "failure" : face === 5 ? "great_success" : "success";
}
export function resolveDice(
  faces: number[],
  kept: number,
  kind: string,
  rerolls: Array<{ index: number; face: number }> = [],
) {
  if (
    !faces.length ||
    !Number.isInteger(kept) ||
    kept < 0 ||
    kept >= faces.length
  )
    throw new Error("INVALID_KEEP");
  const finalFaces = [...faces];
  const changed = new Set<number>();
  for (const r of rerolls) {
    if (
      !Number.isInteger(r.index) ||
      r.index < 0 ||
      r.index >= faces.length ||
      changed.has(r.index)
    )
      throw new Error("INVALID_REROLL: each die at most once");
    resultClass(r.face);
    changed.add(r.index);
    finalFaces[r.index] = r.face;
  }
  const result = resultClass(finalFaces[kept]);
  return {
    result,
    killerBloodpoints: finalFaces.filter((f) => resultClass(f) === "failure")
      .length,
    amount:
      result === "failure"
        ? 0
        : kind === "generator" && result === "great_success"
          ? 2
          : 1,
  };
}
