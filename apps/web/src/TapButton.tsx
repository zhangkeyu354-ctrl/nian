import React, { useRef } from "react";
// A handled touch may remove its DOM target (drawer, overview, action row).
// Suppress that touch's compatibility click at document capture so it cannot
// activate the newly exposed element underneath. A fresh pointerdown resets it.
export function suppressCompatibilityClick() {
  const cleanup = () => {
    document.removeEventListener("click", block, true);
    document.removeEventListener("pointerdown", cleanup, true);
    clearTimeout(timer);
  };
  const block = (event: MouseEvent) => {
    if (!event.isTrusted || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
  };
  const timer = setTimeout(cleanup, 900);
  document.addEventListener("click", block, true);
  document.addEventListener("pointerdown", cleanup, {
    capture: true,
    once: true,
  });
}
// Handle the physical touch release. Some mobile browsers suppress the first
// compatibility click after a pan. Ignore its later click to avoid two commands.
export function TapButton({
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const origin = useRef<{ x: number; y: number } | null>(null),
    handled = useRef(0);
  return (
    <button
      type="button"
      {...props}
      onPointerDown={(e) => {
        origin.current = { x: e.clientX, y: e.clientY };
        onPointerDown?.(e);
      }}
      onPointerCancel={(e) => {
        origin.current = null;
        onPointerCancel?.(e);
      }}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        const start = origin.current;
        origin.current = null;
        if (
          e.pointerType !== "touch" ||
          !onClick ||
          props.disabled ||
          !start ||
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8
        )
          return;
        suppressCompatibilityClick();
        handled.current = Date.now();
        e.preventDefault();
        onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
      }}
      onClick={(e) => {
        if (
          (e.nativeEvent as PointerEvent).pointerType === "touch" &&
          Date.now() - handled.current < 800
        ) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
