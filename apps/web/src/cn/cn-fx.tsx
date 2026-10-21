import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CNView } from "../../../../packages/codenames/src/privacy.ts";
import type { Team } from "../../../../packages/codenames/src/types.ts";

const TEAM_NAME: Record<Team, string> = { red: "红队", blue: "蓝队" };

/* ---------- 音效（Web Audio 合成，不需要音频文件；第一次点屏幕后才能出声） ---------- */
let ctx: AudioContext | null = null;
const audio = () => {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};
if (typeof window !== "undefined") addEventListener("pointerdown", () => audio(), { once: true, capture: true });
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
export const sfx = {
  good: () => (tone(660, 0, 0.12, "triangle"), tone(990, 0.09, 0.18, "triangle")),
  bad: () => tone(220, 0, 0.35, "sawtooth", 0.12, 140),
  turn: () => (tone(523, 0, 0.12), tone(784, 0.12, 0.2)),
  clue: () => tone(880, 0, 0.15, "square", 0.08),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.35, "triangle", 0.16)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.4, "sine", 0.14)),
  boom: () => {
    tone(90, 0, 1.2, "sawtooth", 0.35, 30);
    tone(55, 0.05, 1.4, "square", 0.25, 25);
  },
};
const buzz = (p: number | number[]) => navigator.vibrate?.(p);

/* ---------- 翻牌 / 换边的即时反馈横幅 ---------- */
interface Banner {
  id: number;
  tone: "good" | "bad" | "neutral" | "turn";
  title: string;
  sub?: string;
}
export function FeedbackBanner({ view, me, myTeam, name }: { view: CNView; me: string | null; myTeam: Team | null; name: (id: string) => string }) {
  const reveals = useMemo(() => view.log.flatMap((l) => l.reveals.map((r) => ({ ...r, team: l.team }))), [view.log]);
  const prev = useRef<{ n: number; key: string } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const amCaptain = !!me && (view.captains.red === me || view.captains.blue === me);
  useEffect(() => {
    const key = view.turn + ":" + view.phase + ":" + view.log.length;
    const p = prev.current;
    prev.current = { n: reveals.length, key };
    if (!p || view.phase === "over") return;
    let b: Banner | null = null;
    if (reveals.length > p.n) {
      const r = reveals[reveals.length - 1];
      const by = name(r.by);
      if (r.role === "assassin") return; // 刺客交给全屏特效
      const left = view.limit === null ? null : view.limit - view.guessesMade;
      if (r.role === r.team) {
        const still = view.turn === r.team && view.phase === "guess";
        b = {
          id: Date.now(),
          tone: "good",
          title: `✔ 猜对了！「${r.word}」`,
          sub: still ? (left === null ? `${by} 翻的 · 可以继续猜` : `${by} 翻的 · 还能翻 ${left} 张`) : `${by} 翻的 · 次数用完，换边`,
        };
        sfx.good();
        buzz(40);
      } else {
        b = {
          id: Date.now(),
          tone: r.role === "neutral" ? "neutral" : "bad",
          title: r.role === "neutral" ? `✖ 「${r.word}」是路人` : `✖ 「${r.word}」是${TEAM_NAME[r.role as Team]}的！`,
          sub: `${by} 翻的 · 换${TEAM_NAME[view.turn]}`,
        };
        sfx.bad();
        buzz([60, 40, 60]);
      }
    } else if (p.key !== key) {
      const mine = myTeam === view.turn;
      const ended = view.log.at(-2)?.end;
      const why = ended === "clue-timeout" ? "队长超时 · " : ended === "guess-timeout" ? "猜词超时 · " : ended === "stop" ? "主动结束 · " : ended === "foul" ? "🚩 违规成立 · " : "";
      if (view.phase === "clue" && mine) {
        b = { id: Date.now(), tone: "turn", title: amCaptain ? "轮到你出线索了" : "轮到你们队了", sub: why + (amCaptain ? "3 分钟内给出一个词 + 数字" : "等队长出线索") };
        sfx.turn();
        buzz(120);
      } else if (view.phase === "guess" && mine && !amCaptain) {
        sfx.clue();
        buzz(80);
      } else if (view.phase === "clue" && why) {
        b = { id: Date.now(), tone: "neutral", title: why.replace(" · ", ""), sub: `换${TEAM_NAME[view.turn]}` };
      }
    }
    if (!b) return;
    setBanner(b);
    const id = setTimeout(() => setBanner((x) => (x?.id === b!.id ? null : x)), 2200);
    return () => clearTimeout(id);
  }, [reveals.length, view.turn, view.phase, view.log.length]);
  if (!banner) return null;
  return (
    <div className={"cn-fb tone-" + banner.tone} key={banner.id} role="status" data-testid="cn-feedback">
      <b>{banner.title}</b>
      {banner.sub && <span>{banner.sub}</span>}
    </div>
  );
}

/* ---------- 结束特效：胜利庆祝 / 刺客冲击 ---------- */
export function EndFX({ view, myTeam }: { view: CNView; myTeam: Team | null }) {
  const over = view.phase === "over";
  const wasOver = useRef(over);
  const [stage, setStage] = useState<"" | "assassin" | "party" | "sad">("");
  useEffect(() => {
    const before = wasOver.current;
    wasOver.current = over;
    if (!over || before) return; // 只在「刚刚结束」时播放，刷新页面不重播
    const iWon = myTeam ? myTeam === view.winner : true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const celebrate = () => {
      if (iWon) {
        setStage("party");
        sfx.win();
        buzz([80, 60, 80, 60, 200]);
      } else {
        setStage("sad");
        sfx.lose();
      }
      timers.push(setTimeout(() => setStage(""), 4200));
    };
    if (view.endReason === "assassin") {
      setStage("assassin");
      sfx.boom();
      buzz([300, 80, 500]);
      document.documentElement.classList.add("cn-shake");
      timers.push(setTimeout(() => document.documentElement.classList.remove("cn-shake"), 900));
      timers.push(setTimeout(celebrate, 2600));
    } else celebrate();
    return () => {
      timers.forEach(clearTimeout);
      document.documentElement.classList.remove("cn-shake");
    };
  }, [over]);
  if (!stage) return null;
  const w = view.winner!;
  const loser: Team = w === "red" ? "blue" : "red";
  if (stage === "assassin")
    return (
      <div className="cn-fx cn-fx-assassin" data-testid="cn-fx-assassin" onClick={() => setStage("")}>
        <div className="cn-crack" aria-hidden="true" />
        <div className="cn-fx-skull" aria-hidden="true">☠</div>
        <p className="cn-fx-big">刺 客</p>
        <p className="cn-fx-sub">{myTeam === loser ? "你们踩中了刺客……" : `${TEAM_NAME[loser]}踩中了刺客！`}</p>
      </div>
    );
  return (
    <div className={`cn-fx cn-fx-${stage} team-${w}`} data-testid={"cn-fx-" + stage} onClick={() => setStage("")}>
      {stage === "party" && <Confetti />}
      <div className="cn-fx-emoji" aria-hidden="true">
        {stage === "party" ? "🍾🎉🏆" : "😵"}
      </div>
      <p className="cn-fx-big">{stage === "party" ? (myTeam ? "胜利！" : `${TEAM_NAME[w]}胜利！`) : "惜败"}</p>
      <p className="cn-fx-sub">
        {stage === "party"
          ? view.endReason === "assassin"
            ? `对手踩雷，${TEAM_NAME[w]}躺赢！`
            : `${TEAM_NAME[w]}找齐了全部自己人！`
          : view.endReason === "assassin"
            ? `踩中刺客，${TEAM_NAME[w]}获胜`
            : `${TEAM_NAME[w]}先找齐了`}
      </p>
      <p className="cn-fx-tap">点一下继续</p>
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.2 + Math.random() * 1.8,
        rot: Math.random() * 720 - 360,
        drift: Math.random() * 160 - 80,
        color: ["#ffd34d", "#ffffff", "#c4313b", "#2a5db3", "#3fa565", "#ff8ad8"][i % 6],
        w: 6 + Math.random() * 8,
      })),
    [],
  );
  return (
    <div className="cn-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={
            {
              left: b.left + "%",
              width: b.w,
              height: b.w * 1.6,
              background: b.color,
              animationDelay: b.delay + "s",
              animationDuration: b.dur + "s",
              "--rot": b.rot + "deg",
              "--drift": b.drift + "px",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
