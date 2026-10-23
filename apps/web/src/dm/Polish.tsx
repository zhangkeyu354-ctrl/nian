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
  const k = v.round + ":" + v.phase + ":" + (v.evidenceTurn?.step ?? 0);
  const meKiller = v.killers.some((x) => x.id === v.me.id);
  switch (v.phase) {
    case "NIGHT_PREPARATION":
      if (v.active && v.me.roleId === "wonder-dog")
        return { key: k, title: "🐕 名犬", sub: "选择今晚要保护的人", tone: "guard" };
      if (v.active && v.me.roleId === "soulmate")
        return { key: k, title: "💞 灵魂伴侣", sub: "选择你的命运之人", tone: "love" };
      return { key: k, title: "夜幕降临", sub: "第 " + v.round + " 夜", tone: "night" };
    case "KILLER_SELECTION":
      return v.active
        ? { key: k, title: "轮到你行凶", sub: "点击圆桌选择目标", tone: "blood" }
        : { key: k, title: "夜幕降临", sub: "杀手正在行动…", tone: "night" };
    case "VICTIM_EVIDENCE":
      if (v.active)
        return {
          key: k,
          title: "你遇害了",
          sub:
            (v.evidenceTurn && v.evidenceTurn.members.length > 1
              ? "和同时死去的人一起"
              : "") +
            "留下 " +
            v.required +
            " 张真正的遗言",
          tone: "blood",
        };
      if ((v.evidenceTurn?.step ?? 1) > 1) return null;
      return { key: k, title: "夜色正浓", sub: "死者正在留下遗言", tone: "night" };
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
      // 在大厅：开局后的第一个阶段也要弹横幅
      prev.current = { key: "lobby", alive: new Set(), votes: 0, speaker: null };
      return;
    }
    const alive = new Set(v.players.filter((p) => p.alive).map((p) => p.id));
    const key = v.round + ":" + v.phase + ":" + (v.evidenceTurn?.step ?? 0);
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

/** 杀手 / 同组死者的小对话框：每阶段每人 2 句，每句 20 字。 */
export function TeamChat({
  v,
  disabled,
  onSend,
}: {
  v: View;
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const chat = v.chat;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const seen = useRef(0);
  const count = chat?.messages.length ?? 0;
  useEffect(() => {
    if (count > seen.current) {
      const last = chat!.messages[count - 1];
      if (last.from !== v.me.id) {
        feel("select");
        setOpen(true);
      }
    }
    seen.current = count;
  }, [count]);
  if (!chat) return null;
  const team =
    v.phase === "VICTIM_EVIDENCE" ? "同时遇害的人" : "杀手同伴";
  return (
    <section
      className={"dm-chat " + (open ? "open" : "closed")}
      aria-label="小队对话"
      data-testid="dm-chat"
    >
      <button
        type="button"
        className="dm-chat-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <b>悄悄话 · 仅{team}可见</b>
        <span>
          你还能说 {chat.left} 句{count ? " · " + count + " 条" : ""}
        </span>
      </button>
      {open && (
        <>
          <ol>
            {chat.messages.length === 0 && (
              <li className="empty">每人每阶段只能说 {chat.limit} 句，想清楚再发</li>
            )}
            {chat.messages.map((m, i) => (
              <li key={i} className={m.from === v.me.id ? "mine" : ""}>
                <em>{label(v, m.from)}</em>
                <span>{m.text}</span>
              </li>
            ))}
          </ol>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const t = text.trim();
              if (!t) return;
              feel("submit");
              if (await onSend(t)) setText("");
            }}
          >
            <input
              aria-label="悄悄话内容"
              placeholder={
                chat.left > 0 ? "最多 " + chat.maxChars + " 字，如：选 4 号" : "本阶段已说完"
              }
              maxLength={chat.maxChars}
              value={text}
              disabled={disabled || chat.left <= 0}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              data-testid="dm-chat-send"
              disabled={disabled || chat.left <= 0 || !text.trim()}
            >
              发送
            </button>
          </form>
        </>
      )}
    </section>
  );
}
