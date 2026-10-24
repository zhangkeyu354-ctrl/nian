import React, { useEffect, useRef, useState } from "react";
import { XB_RULES } from "../../../../packages/xiabaiwang/src/rules.ts";
import { claimOnce, safeGet, safeSet } from "./storage.ts";
const pages = [
  {
    icon: "🎭",
    title: "一桌人，三种身份",
    text: `${XB_RULES.roles.guesser}公开主持，${XB_RULES.roles.truth}偷偷知道答案，其余都是${XB_RULES.roles.bluffer}。每轮换一位想想。`,
  },
  {
    icon: "🎙",
    title: "嘴硬一点，开麦就掰",
    text: "老实人把真解释讲出来，瞎掰人现场编；想想随意追问。大家同时点屏假装在想，别让动作泄露身份。不用交文字稿。",
  },
  {
    icon: "⭐",
    title: "看难度拿分，皇冠只图一乐",
    text: `初始${XB_RULES.initialScore}分。指中老实人，双方各得本题D分；指中瞎掰人，只有他得D分。质疑分另算、可负分；扔粑粑和皇冠都不加分。`,
  },
];
export function FirstGame({
  joined,
  role,
  job,
  ready,
  request = 0,
  active = true,
}: {
  joined: boolean;
  role: string;
  job: string;
  ready: boolean;
  request?: number;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0),
    [hint, setHint] = useState("");
  const swipe = useRef<number | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setHint("");
  }, [role]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        safeSet("local", "xb-onboarding-v3", "1");
        setOpen(false);
      }
      if (e.key !== "Tab") return;
      const buttons = Array.from(
        dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons[0],
        last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  useEffect(() => {
    if (joined && !safeGet("local", "xb-onboarding-v3")) setOpen(true);
  }, [joined]);
  useEffect(() => {
    if (request) {
      setPage(0);
      setOpen(true);
    }
  }, [request]);
  useEffect(() => {
    if (
      joined &&
      active &&
      ready &&
      !open &&
      role &&
      claimOnce("xb-role-hint-v3:" + role, "local")
    )
      setHint(role);
  }, [joined, active, ready, open, role]);
  const close = () => {
    safeSet("local", "xb-onboarding-v3", "1");
    setOpen(false);
  };
  return (
    <>
      {open && joined && (
        <div className="xb-overlay xb-tutorial" data-testid="xb-tutorial">
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="第一次开播教学"
            onTouchStart={(e) => (swipe.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (swipe.current !== null) {
                const dx = e.changedTouches[0].clientX - swipe.current;
                if (Math.abs(dx) > 40)
                  setPage((p) =>
                    Math.min(2, Math.max(0, p + (dx < 0 ? 1 : -1))),
                  );
              }
              swipe.current = null;
            }}
          >
            <button
              className="xb-tutorial-skip"
              data-testid="xb-tutorial-skip"
              onClick={close}
            >
              跳过教学
            </button>
            <span className="xb-tutorial-icon" aria-hidden="true">
              {pages[page].icon}
            </span>
            <p className="xb-kicker">
              新手频道 · {page + 1}/{pages.length}
            </p>
            <h1>{pages[page].title}</h1>
            <p>{pages[page].text}</p>
            <nav aria-label="教学页码">
              {pages.map((_, i) => (
                <button
                  key={i}
                  aria-label={`第${i + 1}页`}
                  aria-current={i === page ? "step" : undefined}
                  data-testid={`xb-tutorial-page-${i}`}
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
            <button
              className="xb-main"
              data-testid="xb-tutorial-next"
              onClick={() => (page === 2 ? close() : setPage(page + 1))}
            >
              {page === 2 ? "懂了，开播吧" : "下一页 →"}
            </button>
          </section>
        </div>
      )}
      {hint && ready && !open && (
        <aside
          className="xb-first-hint"
          data-testid={`xb-first-hint-${hint}`}
          role="status"
        >
          <b>第一次当{XB_RULES.roles[hint as keyof typeof XB_RULES.roles]}</b>
          <p>{job}</p>
          <button data-testid="xb-hint-dismiss" onClick={() => setHint("")}>
            知道了
          </button>
        </aside>
      )}
    </>
  );
}
export function EyesWindow({
  until,
  now,
  role,
  answer,
  round,
}: {
  until: number;
  now: number;
  role: string;
  answer?: string;
  round: number;
}) {
  const [opened, setOpened] = useState(false);
  if (until <= now) return null;
  return (
    <div
      className="xb-eyes"
      role="dialog"
      aria-modal="true"
      aria-label="所有人同步闭眼"
      data-testid="xb-eyes"
    >
      <header>
        <b>闭眼中… · 第{round}轮</b>
        <span data-testid="xb-eyes-count">
          {Math.ceil((until - now) / 1000)}s
        </span>
      </header>
      {opened ? (
        <article
          className="xb-private-reading"
          data-testid="xb-private-reading"
        >
          <span className="xb-kicker">只给你看 · 假装在想</span>
          <h1>{role === "truth" ? "这轮真解释" : "先把表情装到位"}</h1>
          <p>
            {role === "truth"
              ? answer
              : "想一想这题能怎么解释。没有真答案也别慌，待会儿一本正经地说。"}
          </p>
          <button onClick={() => setOpened(false)}>继续假装在想</button>
        </article>
      ) : (
        <>
          <div className="xb-eyes-art" aria-hidden="true">
            🙈
          </div>
          <h1>大家一起，假装在想。</h1>
          <p>其他人也在同时点屏幕，谁也别偷看别人。</p>
          <button
            className="xb-main"
            data-testid="xb-eyes-open"
            onClick={() => setOpened(true)}
          >
            点屏假装在想
          </button>
        </>
      )}
      <small>所有人的倒计时相同；结束后自动开麦。</small>
    </div>
  );
}
