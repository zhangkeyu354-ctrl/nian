type Area = "local" | "session";
const memory = new Map<string, string>();
export function safeGet(area: Area, key: string): string | null {
  try {
    return (
      globalThis[area === "local" ? "localStorage" : "sessionStorage"].getItem(
        key,
      ) ??
      memory.get(area + key) ??
      null
    );
  } catch {
    return memory.get(area + key) ?? null;
  }
}
export function safeSet(area: Area, key: string, value: string) {
  memory.set(area + key, value);
  try {
    globalThis[area === "local" ? "localStorage" : "sessionStorage"].setItem(
      key,
      value,
    );
  } catch {}
}
export function claimOnce(key: string, area: Area = "session") {
  if (safeGet(area, key) !== null) return false;
  safeSet(area, key, "1");
  return true;
}
export const revealAge = (anchor: number, now: number) =>
  anchor > 0 ? Math.max(0, Math.min(12000, now - anchor)) : 12000;
