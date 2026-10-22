// 《请留遗言》手感层：阶段横幅、投票揭晓、计时圆环、底部行动栏、音效与震动。
// 只读 view 数据，不发送任何游戏指令（指令仍由 DyingMessage 里的按钮发出）。
import React, { useEffect, useRef, useState } from "react";
import type { DMSnapshot } from "../../../../packages/shared/src/dm-protocol.ts";
import { feel, soundOn, setSoundOn } from "../drawing/feel.ts";

export { feel };
type View = NonNullable<DMSnapshot["view"]>;
type Banner = { key: string; title: string; sub?: string; tone: string };

const seatOf = (v: View, id?: string | null) =>
  v.players.find((p) => p.id === id);
const label = (v: View, id?: string | null) => {
  const p = seatOf(v, id);
  return p ? p.seat + "号 " + p.name : "";
};

function bannerFor(v: View, newlyDead: string[]): Banner | null {
  const k = v.round + ":" + v.phase;
  const meKiller = v.killers.some((x) => x.id === v.me.id);
  switch (v.phase) {
    case "NIGHT_PREPARATION":
      return { key: k, title: "夜幕降临", sub: "第 " + v.round + " 夜", tone: "night" };
    case "KILLER_SELECTION":
      return v.active
        ? { key: k, title: "轮到你行凶", sub: "点击圆桌选择目标", tone: "blood" }
        : { key: k, title: "夜幕降临", sub: "杀手正在行动…", tone: "night" };
    case "VICTIM_EVIDENCE":
      return v.active
        ? { key: k, title: "你遇害了", sub: "留下一张真正的遗言", tone: "blood" }
        : { key: k, title: "夜色正浓", sub: "死者正在留下遗言", tone: "night" };
    case "KILLER_FAKE_EVIDENCE":
      return v.active
        ? { key: k, title: "混入假遗言", sub: "让真相变得模糊", tone: "blood" }
        : null;
    case "INVESTIGATION":
      return {
        key: k,
        title: "天亮了",
        sub: newlyDead.length
          ? newlyDead.map((id) => label(v, id)).join("、") + " 遇害"
          : "昨夜无人遇害",
        tone: "dawn",
      };
    case "FIRST_VOTE":
      return { key: k, title: "第一次投票", sub: "过半才进入辩解", tone: "vote" };
    case "DEFENSE":
      return {
        key: k,
        title: "最后的辩解",
        sub: label(v, v.suspect),
        tone: "vote",
      };
    case "SECOND_VOTE":
      return { key: k, title: "第二次投票", sub: "同一人再次过半即处决", tone: "vote" };
    case "ROUND_END":
      return { key: k, title: "本轮结束", tone: "dawn" };
    default:
      return meKiller ? null : null;
  }
}

/** 监听 view 变化：弹出阶段横幅、轮到我发言提示、投票揭晓，并配音效震动。 */
export function useStageFeedback(v: View | null | undefined) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [vote, setVote] = useState<View["voteResults"][number] | null>(null);
  // 投票揭晓时，同时到来的阶段横幅排在揭晓关闭之后
  const pending = useRef<Banner | null>(null);
  const prev = useRef<{
    key: string;
    alive: Set<string>;
    votes: number;
    speaker: string | null;
  } | null>(null);
  useEffect(() => {
    if (!v) {
      prev.current = null;
      return;
    }
    const alive = new Set(v.players.filter((p) => p.alive).map((p) => p.id));
    const key = v.round + ":" + v.phase;
    const p = prev.current;
    prev.current = {
      key,
      alive,
      votes: v.voteResults.length,
      speaker: v.speaker ?? null,
    };
    if (!p) return; // 首次进入/刷新不弹
    const voted = v.voteResults.length > p.votes;
    if (voted) {
      setVote(v.voteResults.at(-1)!);
      feel("stamp");
    }
    if (key !== p.key && !v.winner) {
      const dead = [...p.alive].filter((id) => !alive.has(id));
      const b = bannerFor(v, dead);
      if (b && voted && !v.winner) {
        pending.current = b;
      } else if (b) {
        setBanner(b);
        feel(
          b.tone === "blood"
            ? v.active && v.phase === "VICTIM_EVIDENCE"
              ? "lose"
              : "turn"
            : v.active
              ? "turn"
              : "page",
        );
      }
    } else if (
      v.phase === "INVESTIGATION" &&
      v.speaker !== p.speaker &&
      v.speaker === v.me.id
    ) {
      setBanner({ key: key + ":speak", title: "轮到你发言", sub: "最多 5 分钟", tone: "dawn" });
      feel("turn");
    }
  }, [v]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1900);
    return () => clearTimeout(t);
  }, [banner]);
  return {
    banner,
    vote,
    closeVote: () => {
      setVote(null);
      if (pending.current) {
        setBanner(pending.current);
        feel("turn");
        pending.current = null;
      }
    },
  };
}

export function PhaseBanner({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  return (
    <div
      key={banner.key}
      className={"dm-banner dm-banner-" + banner.tone}
      role="status"
      aria-live="polite"
    >
      <div>
        <strong>{banner.title}</strong>
        {banner.sub && <span>{banner.sub}</span>}
      </div>
    </div>
  );
}

/** 投票揭晓：票数条逐条长出，标出过半线。点击任意处关闭，4.5 秒后自动关闭。 */
export function VoteReveal({
  v,
  result,
  onClose,
}: {
  v: View;
  result: View["voteResults"][number] | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [result]);
  if (!result) return null;
  const rows = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, ...rows.map((r) => r[1]));
  const voters = v.players.filter((p) => p.alive).length;
  const half = voters / 2;
  return (
    <div
      className="dm-vote-reveal"
      role="dialog"
      aria-label="投票结果"
      data-testid="dm-vote-reveal"
      onClick={onClose}
    >
      <div className="dm-vote-card">
        <p>
          第 {result.round} 轮 · 第 {result.ballot} 次投票
        </p>
        <h2>投票结果</h2>
        <ul>
          {rows.map(([id, n], i) => {
            const over = n > half;
            return (
              <li key={id} className={over ? "over" : ""} style={{ ["--i" as any]: i }}>
                <span className="who">{label(v, id)}</span>
                <span className="bar">
                  <i style={{ width: (n / total) * 100 + "%" }} />
                </span>
                <b>{n} 票</b>
                {over && <em>过半</em>}
              </li>
            );
          })}
        </ul>
        <small>点击任意处关闭</small>
      </div>
    </div>
  );
}

/** 中央计时圆环，最后 10 秒滴答。 */
export function CountdownRing({
  left,
  total,
}: {
  left: number;
  total: number;
}) {
  const last = useRef(left);
  useEffect(() => {
    if (left !== last.current && left > 0 && left <= 10) feel("tick");
    last.current = left;
  }, [left]);
  const r = 46,
    c = 2 * Math.PI * r,
    f = Math.max(0, Math.min(1, left / Math.max(1, total)));
  return (
    <svg
      className={
        "dm-ring " + (left <= 10 ? "urgent" : left <= 30 ? "warn" : "")
      }
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r={r} className="track" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className="fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - f)}
      />
    </svg>
  );
}

/** 底部行动栏：当前该做的事 + 主按钮，始终在拇指够得到的地方。 */
export function ActionDock({
  hint,
  children,
}: {
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dm-dock" role="region" aria-label="行动栏">
      <div className="dm-dock-hint">{hint}</div>
      <div className="dm-dock-actions">{children}</div>
    </div>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(soundOn());
  return (
    <button
      type="button"
      className="dm-sound"
      aria-label={on ? "关闭音效" : "打开音效"}
      aria-pressed={on}
      onClick={() => {
        setSoundOn(!on);
        setOn(!on);
        if (!on) feel("select");
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? (
          <path
            d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16 9l5 6M21 9l-5 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}
