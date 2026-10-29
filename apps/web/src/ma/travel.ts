export type TravelKind = "forward" | "backward" | "drag" | "warp";
export interface TravelCue {
  id: number;
  kind: TravelKind;
  to: number;
  weight: number;
}
export interface Point {
  x: number;
  y: number;
}
const translate = (p: Point) => `translate3d(${p.x}px,${p.y}px,0)`;

/** Presentation classification only. The authoritative destination is untouched. */
export function classifyTravel(
  fx: { kind: "move" | "warp"; from?: number; to?: number; why?: string },
  pulled = false,
): TravelKind {
  if (pulled || /拉|拖|牵/.test(fx.why ?? "")) return "drag";
  if (fx.kind === "warp") return "warp";
  return fx.to! < fx.from! ? "backward" : "forward";
}
export function travelFrames(
  from: Point,
  to: Point,
  kind: TravelKind,
  vertical: boolean,
): Keyframe[] {
  const start = { transform: translate(from), opacity: 1 },
    end = { transform: translate(to), opacity: 1 };
  if (kind === "warp")
    return [
      { ...start, offset: 0 },
      { ...start, opacity: 0, offset: 0.28 },
      { ...end, opacity: 0, offset: 0.3 },
      { ...end, opacity: 1, offset: 0.72 },
      { ...end, offset: 1 },
    ];
  if (kind === "drag") return [start, end];
  const lift = kind === "backward" ? 5 : 10;
  return [0, 0.25, 0.5, 0.75, 0.88, 1].map((t) => {
    if (t === 0.88)
      return {
        transform:
          translate(to) + (vertical ? " scale(0.9,1.07)" : " scale(1.07,0.9)"),
        opacity: 1,
        offset: t,
      };
    const hop = lift * 4 * t * (1 - t),
      wobble = kind === "backward" ? Math.sin(t * Math.PI * 3) * 2 : 0;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    if (vertical) {
      point.x -= hop;
      point.y += wobble;
    } else {
      point.y -= hop;
      point.x += wobble;
    }
    if (t === 0) return { ...start, offset: 0 };
    if (t === 1) return { ...end, offset: 1 };
    return {
      transform:
        translate(point) +
        (kind === "backward"
          ? ` rotate(${-8 * Math.sin(t * Math.PI)}deg)`
          : ""),
      opacity: 1,
      offset: t,
    };
  });
}

export function cameraTarget(
  actor: number,
  viewport: number,
  scroll: number,
  extent: number,
) {
  if (actor >= viewport * 0.35 && actor <= viewport * 0.65) return null;
  return Math.max(
    0,
    Math.min(Math.max(0, extent - viewport), scroll + actor - viewport * 0.5),
  );
}
export class ManualCameraPause {
  private until = 0;
  constructor(private readonly clock = () => performance.now()) {}
  manual() {
    this.until = this.clock() + 3000;
  }
  remaining() {
    return Math.max(0, this.until - this.clock());
  }
}
