const POSES = [
  { x: 0, y: 0 },
  { x: 0, y: 180 },
  { x: 0, y: -90 },
  { x: 0, y: 90 },
  { x: -90, y: 0 },
  { x: 90, y: 0 },
];
export function diePose(value: number) {
  return POSES[value - 1] ?? POSES[0];
}
export function skillFlightFrames(
  origin: { x: number; y: number },
  center: { x: number; y: number },
): Keyframe[] {
  const transform = `translate3d(${origin.x - center.x}px,${origin.y - center.y}px,0) scale(.12) rotate(-10deg)`;
  return [
    { transform, opacity: 0, offset: 0 },
    {
      transform: "translate3d(0,0,0) scale(1) rotate(0)",
      opacity: 1,
      offset: 240 / 2600,
    },
    {
      transform: "translate3d(0,0,0) scale(1) rotate(0)",
      opacity: 1,
      offset: 1 - 180 / 2600,
    },
    { transform, opacity: 0, offset: 1 },
  ];
}
