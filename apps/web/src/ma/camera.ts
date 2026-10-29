import { useEffect, useRef, useState } from "react";
import { cameraTarget, ManualCameraPause } from "./travel.ts";
import { reduced } from "./motion-clock.ts";

/** One read/write batch per destination, never a per-frame React update. */
export function useRaceCamera(
  scroller: React.RefObject<HTMLDivElement | null>,
  surface: React.RefObject<HTMLDivElement | null>,
  focus: { x: number; y: number } | null,
  vertical: boolean,
  grid: boolean,
) {
  const [pause] = useState(() => new ManualCameraPause());
  const latest = useRef<() => void>(() => {}),
    wake = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);
  latest.current = () => {
    if (dragging.current || pause.remaining() > 0 || reduced()) return;
    const el = scroller.current,
      board = surface.current;
    if (!el || !board || !focus) return;
    const rect = board.getBoundingClientRect();
    if (vertical || grid) {
      const actor = rect.top + (vertical ? focus.x : focus.y) * rect.height;
      const target = cameraTarget(
        actor,
        window.innerHeight,
        window.scrollY,
        document.documentElement.scrollHeight,
      );
      if (target !== null && Math.abs(target - window.scrollY) > 2)
        window.scrollTo({ top: target, behavior: "smooth" });
    } else if (el.scrollWidth > el.clientWidth) {
      const actor =
        rect.left + focus.x * rect.width - el.getBoundingClientRect().left;
      const target = cameraTarget(
        actor,
        el.clientWidth,
        el.scrollLeft,
        el.scrollWidth,
      );
      if (target !== null && Math.abs(target - el.scrollLeft) > 2)
        el.scrollTo({ left: target, behavior: "smooth" });
    }
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let origin: { x: number; y: number; id: number } | null = null;
    const manual = () => {
      pause.manual();
      clearTimeout(wake.current);
      wake.current = setTimeout(() => latest.current(), 3000);
    };
    const down = (e: PointerEvent) => {
      origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (
        origin?.id === e.pointerId &&
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 6
      ) {
        dragging.current = true;
        manual();
      }
    };
    const touch = () => {
      dragging.current = true;
      manual();
    };
    const up = () => {
      origin = null;
      if (dragging.current) manual();
      dragging.current = false;
    };
    el.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    window.addEventListener("wheel", manual, { passive: true });
    el.addEventListener("touchmove", touch, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", up, { passive: true });
    return () => {
      clearTimeout(wake.current);
      dragging.current = false;
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("wheel", manual);
      el.removeEventListener("touchmove", touch);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, [grid, vertical]);
  useEffect(() => {
    const id = requestAnimationFrame(() => latest.current());
    return () => cancelAnimationFrame(id);
  }, [focus?.x, focus?.y, vertical, grid]);
}
