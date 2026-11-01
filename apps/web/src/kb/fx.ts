// 卡里巴湖动效：用 Web Animations 在页面最上层放「飞行的牌」，不进 React 状态，不挡点击。
import type { KBEvent } from "../../../../packages/kariba/src/index.ts";

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const center = (el: Element | null) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const q = (sel: string) => document.querySelector(sel);
const seatEl = (seat: number, me: number) =>
  seat === me ? q('[data-testid="kb-hand"]') ?? q(`[data-kb-seat="${seat}"]`) : q(`[data-kb-seat="${seat}"]`);
const slotEl = (v: number) => q(`[data-testid="kb-slot-${v}"]`);

function sprite(v: number, size: number) {
  const el = document.createElement("div");
  el.className = "kb-fly";
  el.style.width = el.style.height = size + "px";
  el.innerHTML = `<img src="/assets/kariba/${v}.webp" alt="" draggable="false">`;
  document.body.appendChild(el);
  return el;
}

function fly(v: number, from: { x: number; y: number }, to: { x: number; y: number }, opts: { delay: number; dur: number; size: number; arc: number; spin: number }) {
  const el = sprite(v, opts.size);
  const h = opts.size / 2;
  const mx = (from.x + to.x) / 2;
  const my = Math.min(from.y, to.y) - opts.arc;
  const a = el.animate(
    [
      { transform: `translate(${from.x - h}px, ${from.y - h}px) scale(0.7) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${from.x - h}px, ${from.y - h}px) scale(1) rotate(0deg)`, opacity: 1, offset: 0.08 },
      { transform: `translate(${mx - h}px, ${my - h}px) scale(1.15) rotate(${opts.spin / 2}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${to.x - h}px, ${to.y - h}px) scale(0.55) rotate(${opts.spin}deg)`, opacity: 0.2 },
    ],
    { duration: opts.dur, delay: opts.delay, easing: "cubic-bezier(.45,.05,.4,1)", fill: "both" },
  );
  a.onfinish = a.oncancel = () => el.remove();
  return opts.delay + opts.dur;
}

function pop(text: string, at: { x: number; y: number }, delay: number, cls = "") {
  const el = document.createElement("div");
  el.className = "kb-pop " + cls;
  el.textContent = text;
  document.body.appendChild(el);
  const a = el.animate(
    [
      { transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(0.4)`, opacity: 0 },
      { transform: `translate(${at.x}px, ${at.y - 18}px) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${at.x}px, ${at.y - 46}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ],
    { duration: 1300, delay, easing: "ease-out", fill: "both" },
  );
  a.onfinish = a.oncancel = () => el.remove();
}

function bump(el: Element | null, delay: number) {
  el?.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
    { duration: 420, delay, easing: "ease-out" },
  );
}

/** 播放一次出牌的动效；返回总时长（毫秒），供结算画面延迟出现 */
export function playFlights(events: KBEvent[], me: number, onChase?: (mine: boolean) => void): number {
  if (reducedMotion()) return 0;
  let end = 0;
  const play = events.find((e) => e.type === "PLAY");
  const chase = events.find((e) => e.type === "CHASE");
  const slotSize = (slotEl(1)?.getBoundingClientRect().width ?? 80) * 0.62;
  if (play && play.type === "PLAY") {
    const from = center(seatEl(play.seat, me));
    const to = center(slotEl(play.value));
    if (from && to) {
      for (let i = 0; i < Math.min(play.count, 4); i++)
        end = Math.max(end, fly(play.value, from, to, { delay: i * 90, dur: 460, size: slotSize, arc: 40, spin: (i - 1) * 8 }));
      bump(slotEl(play.value), end - 60);
    }
  }
  if (chase && chase.type === "CHASE") {
    const from = center(slotEl(chase.target));
    const seat = q(`[data-kb-seat="${chase.seat}"]`);
    const to = center(seat);
    const start = end + 120;
    if (from && to) {
      setTimeout(() => onChase?.(chase.seat === me), start);
      let last = start;
      for (let i = 0; i < Math.min(chase.cards, 8); i++)
        last = Math.max(last, fly(chase.target, from, to, { delay: start + i * 70, dur: 720, size: slotSize, arc: 90, spin: (i % 2 ? 1 : -1) * (20 + i * 6) }));
      bump(seat, last - 100);
      pop(`+${chase.cards}`, to, last - 200, chase.by === 1 ? "mouse" : "");
      if (chase.by === 1) pop("🐭 吓跑大象！", center(slotEl(1)) ?? from, start, "big");
      end = last + 300;
    }
  }
  return end;
}

/** 终局撒彩纸 */
export function confetti() {
  if (reducedMotion()) return;
  const colors = ["#ff8a3d", "#ffc83d", "#4cd18a", "#59b8ff", "#c38bff", "#f4e6c8"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("i");
    el.className = "kb-confetti";
    el.style.background = colors[i % colors.length];
    el.style.left = Math.random() * 100 + "vw";
    document.body.appendChild(el);
    const a = el.animate(
      [
        { transform: `translateY(-20px) rotate(0)`, opacity: 1 },
        { transform: `translate(${(Math.random() - 0.5) * 160}px, 105vh) rotate(${Math.random() * 720}deg)`, opacity: 0.9 },
      ],
      { duration: 1600 + Math.random() * 1200, delay: Math.random() * 400, easing: "cubic-bezier(.2,.6,.4,1)" },
    );
    a.onfinish = a.oncancel = () => el.remove();
  }
}
