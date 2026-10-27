import React, { useEffect, useRef, useState } from "react";
import { ActionDock, CountdownRing, PhaseBanner } from "../dm/Polish.tsx";
import { feel, soundOn, setSoundOn } from "../drawing/feel.ts";
import type {
  PublicAction,
  EventId,
} from "../../../../packages/soda-smugglers/src/index.ts";
import type {
  SSAction,
  SSSnapshot,
} from "../../../../packages/shared/src/ss-protocol.ts";
import {
  arrestText,
  eventCopy,
  recapByRound,
  selectionAfterDrop,
  winnerTitles,
  type Selection,
} from "./ui-model.ts";
import { useSSRoom } from "./ss-net.ts";
import "./ss.css";
const A = "/assets/soda-smugglers/";
type View = NonNullable<SSSnapshot["view"]>;
const phases: Record<View["phase"], string> = {
  PACK: "秘密装包",
  BRIBE: "受贿与讨论",
  INSPECT: "检查手提箱",
  ARREST: "决定逮捕",
  ROUND_END: "本轮结束",
  FINISHED: "本局结束",
};
const label = (v: View, i: number) =>
  `${i + 1}号 ${v.players[i]?.name ?? "旅客"}`;
const loadBool = (k: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : v !== "0";
  } catch {
    return fallback;
  }
};
const saveBool = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? "1" : "0");
  } catch {}
};
function Suitcase({
  bottles,
  back = false,
  className = "",
}: {
  bottles?: number;
  back?: boolean;
  className?: string;
}) {
  return (
    <img
      className={`ss-case ${className}`}
      src={`${A}${back ? "suitcase-back" : `suitcase-${bottles ?? 0}`}.webp`}
      alt={back ? "未打开的手提箱" : `${bottles}瓶汽水的手提箱`}
    />
  );
}
function EventCard({ event, onOpen }: { event: EventId; onOpen: () => void }) {
  const e = eventCopy[event];
  return (
    <button
      type="button"
      className="ss-event"
      data-testid="ss-event-banner"
      onClick={onOpen}
    >
      <img src={`${A}event-${event}.webp`} alt={`${e.title}中文版事件牌`} />
      <span>
        <small>本轮事件 · 查看卡文</small>
        <strong>{e.title}</strong>
        <span>{e.summary}</span>
      </span>
    </button>
  );
}
function SeatStrip({
  v,
  selected,
  onSelect,
}: {
  v: View;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      className="ss-seatstrip"
      data-testid="ss-seatstrip"
      aria-label="玩家座位"
      style={{
        gridTemplateColumns: `repeat(${Math.min(v.players.length, 2)}, minmax(0,1fr))`,
      }}
    >
      {v.players.map((p, i) => (
        <button
          type="button"
          data-testid={`ss-seat-${i}`}
          data-seat={i}
          className={`ss-seat ${i === v.guard ? "is-guard" : ""} ${selected === i ? "is-selected" : ""}`}
          aria-pressed={selected === i}
          key={i}
          onClick={() => onSelect(i)}
        >
          <span className="ss-seat-top">
            <span className="ss-avatar" aria-hidden="true">
              {i + 1}
            </span>
            <strong>{p.name}</strong>
          </span>
          <span className="ss-seat-bottom">
            <span aria-label={`${p.caps} 瓶盖`}>
              <img src={`${A}cap-1.webp`} alt="瓶盖" />
              {p.caps}
            </span>
            <span>
              {i === v.guard
                ? "🔍警长"
                : p.settled
                  ? "✅已结算"
                  : v.phase === "BRIBE" && p.submitted
                    ? "🤝谈判中"
                    : p.submitted
                      ? "✅已提交"
                      : "等待提交"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
function HistoryText({ a, v }: { a: PublicAction; v: View }) {
  const target =
    a.target === undefined ? "" : (v.players[a.target]?.name ?? "旅客");
  if (
    a.type === "CONFISCATE" ||
    a.type === "WRONGFUL" ||
    a.type === "RELEASE"
  ) {
    const x = arrestText(a);
    return (
      <>
        {target}：{x.title.replace(/[！!]$/, "")}，{x.detail}
      </>
    );
  }
  if (a.type === "ACCEPT")
    return (
      <>
        接受{target}的受贿，支付 {a.amount ?? 0} 瓶盖。
      </>
    );
  if (a.type === "INSPECT" || a.type === "DOG_REVEAL")
    return (
      <>
        检查{target}的手提箱，打开 {a.bottles?.[0] ?? 0} 瓶。
      </>
    );
  if (a.type.startsWith("EVENT_")) {
    const e = eventCopy[a.type.slice(6) as EventId];
    return <>随机事件：{e?.title ?? "事件"}</>;
  }
  if (a.type === "BIRTHDAY_BONUS")
    return <>警长从公共区获得 {a.amount ?? 0} 瓶盖。</>;
  if (a.type === "DESPERATE_PAYMENT")
    return <>警长向公共区付出 {a.amount ?? 0} 瓶盖。</>;
  return null;
}
type RevealItem = PublicAction & {
  bribed?: boolean;
  items?: RevealItem[];
};
function BatchReveal({
  action,
  v,
  onClose,
}: {
  action: RevealItem;
  v: View;
  onClose: () => void;
}) {
  return (
    <div className="ss-reveal ss-clear" role="dialog" aria-label="本轮结算" data-testid="ss-reveal">
      <div className="ss-reveal-card ss-batch">
        <small>本轮结算 · 其余旅客放行</small>
        <ul className="ss-batch-list">
          {action.items!.map((a, i) => (
            <li key={i}>
              <b>{label(v, a.target ?? a.seat)}</b>
              <span>
                {a.bribed ? "受贿放行" : arrestText(a).title} · 行李{" "}
                {(a.bottles ?? []).join(" + ")} 瓶 · +{a.amount ?? 0} 瓶盖
              </span>
            </li>
          ))}
        </ul>
        <button data-testid="ss-skip" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  );
}
function Reveal({
  action,
  v,
  onClose,
  sound,
  vibration,
}: {
  action: RevealItem;
  v: View;
  onClose: () => void;
  sound: boolean;
  vibration: boolean;
}) {
  const x = arrestText(action);
  const heading = action.bribed
    ? "受贿放行"
    : action.type === "RELEASE"
      ? "放行开箱"
      : "逮捕开箱";
  const [step, setStep] = useState(0);
  const target = action.target ?? action.seat;
  const receiver = action.type === "CONFISCATE" ? action.seat : target;
  const [flight, setFlight] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setStep(0);
    feel("stamp", { sound, vibration });
    const el = document.querySelector(`[data-seat="${receiver}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setFlight({
        x: r.left + r.width / 2 - innerWidth / 2,
        y: r.top + r.height / 2 - innerHeight / 2,
      });
    }
    const timers = [
      setTimeout(() => setStep(1), 350),
      setTimeout(() => {
        setStep(2);
        feel("stamp", { sound, vibration });
      }, 950),
      setTimeout(onClose, 3800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [action]);
  return (
    <div
      className={`ss-reveal ss-${x.tone}`}
      role="dialog"
      aria-label={heading}
      data-testid="ss-reveal"
    >
      <div className="ss-reveal-card">
        <small>{heading} · {label(v, target)}</small>
        <div className="ss-reveal-bags">
          {(action.bottles ?? []).map((n, i) => (
            <span key={i} className={step > i ? "is-open" : ""}>
              <Suitcase back={step <= i} bottles={n} />
            </span>
          ))}
        </div>
        {step >= 2 && (
          <>
            <strong className="ss-stamp" data-testid="ss-reveal-title">
              {action.bribed ? "受贿放行" : x.title}
            </strong>
            <p>{x.detail}</p>
            <span
              className="ss-flying-cap"
              style={
                {
                  "--fly-x": `${flight.x}px`,
                  "--fly-y": `${flight.y}px`,
                } as React.CSSProperties
              }
            >
              +
              {(action.amount ?? 0) +
                (action.type === "WRONGFUL" ? (action.penalty ?? 0) : 0)}
              <img src={`${A}cap-1.webp`} alt="瓶盖" />
            </span>
          </>
        )}
        <button data-testid="ss-skip" onClick={onClose}>
          跳过
        </button>
      </div>
    </div>
  );
}
function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="ss-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ss-rules-title"
    >
      <div className="ss-sheet">
        <button className="ss-close" onClick={onClose} aria-label="关闭规则">
          ✕
        </button>
        <h2 id="ss-rules-title">怎么玩</h2>
        <ol>
          <li>每轮一位缉私警长，其余玩家是旅客。</li>
          <li>
            旅客从五张手提箱牌中选两张行李、一张受贿牌；全员提交后公开受贿。
          </li>
          <li>警长依次选择受贿、检查一只箱子、逮捕，最后放行剩余旅客。</li>
          <li>
            行李共两瓶或以上算走私；误捕时警长赔两瓶盖。余额不足时付出现有瓶盖。
          </li>
          <li>每个人当过规定次数的警长后，瓶盖最多的人获胜；同分共同获胜。</li>
        </ol>
        <p>事件牌会改变本轮规则。语音自由讨论，无需输入聊天。</p>
        <button onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}
export function SodaSmugglers() {
  const net = useSSRoom(),
    s = net.snapshot,
    v = s?.view;
  const [name, setName] = useState(""),
    [room, setRoom] = useState(
      new URLSearchParams(location.search).get("room") ?? "",
    ),
    [choice, setChoice] = useState<Selection>({ luggage: [], bribe: "" }),
    [target, setTarget] = useState<number | null>(null),
    [box, setBox] = useState(0),
    [mode, setMode] = useState<"normal" | "event">("normal"),
    [menu, setMenu] = useState(false),
    [rules, setRules] = useState(false),
    [eventOpen, setEventOpen] = useState(false),
    [sound, setSound] = useState(soundOn),
    [vibration, setVibration] = useState(() => loadBool("ss-vibration", true)),
    [now, setNow] = useState(Date.now()),
    [identity, setIdentity] = useState(false),
    [revealQueue, setRevealQueue] = useState<RevealItem[]>([]),
    [banner, setBanner] = useState<{
      key: string;
      title: string;
      sub?: string;
      tone: string;
    } | null>(null);
  const historySeen = useRef<number | null>(null),
    priorPhase = useRef<string>(""),
    touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dragged = useRef<string | null>(null),
    dragStarted = useRef(false);
  const seat = s?.players.findIndex((p) => p.id === s.mySeat) ?? -1,
    me = v?.players[seat],
    host = !!s?.mySeat && s.mySeat === s.hostId,
    guard = seat === v?.guard,
    bagCount = v?.event === "holiday" ? 3 : 2,
    blocked = net.pending || !net.online,
    canSubmit = !!v && v.phase === "PACK" && seat !== v.guard && !me?.submitted;
  const cue = (c: Parameters<typeof feel>[0]) => feel(c, { sound, vibration });
  const remaining = v?.deadline
    ? Math.max(0, Math.ceil((v.deadline - now) / 1000))
    : null;
  const lastTick = useRef("");
  useEffect(() => {
    const key = `${v?.deadline}:${remaining}`;
    if (
      remaining !== null &&
      remaining > 0 &&
      remaining <= 10 &&
      lastTick.current !== key
    )
      cue("tick");
    lastTick.current = key;
  }, [remaining, v?.deadline, sound, vibration]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + net.offset.current), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setChoice({ luggage: [], bribe: "" });
    setTarget(null);
    setBox(0);
    setMode("normal");
    if (v) {
      setIdentity(true);
      const t = setTimeout(() => setIdentity(false), 3000);
      return () => clearTimeout(t);
    }
  }, [v?.round, s?.mySeat]);
  useEffect(() => {
    if (!v) {
      historySeen.current = null;
      priorPhase.current = "";
      return;
    }
    const key = `${v.round}:${v.phase}`;
    if (priorPhase.current && priorPhase.current !== key) {
      const title =
        v.phase === "PACK"
          ? `下一位缉私警长：${v.players[v.guard].name}`
          : phases[v.phase];
      setBanner({
        key,
        title,
        sub: guard && !["ROUND_END", "FINISHED"].includes(v.phase) ? "轮到你行动" : undefined,
        tone: "guard",
      });
      const t = setTimeout(() => setBanner(null), 1900);
      cue(guard ? "turn" : "page");
      priorPhase.current = key;
      return () => clearTimeout(t);
    }
    priorPhase.current = key;
  }, [v?.phase, v?.round]);
  useEffect(() => {
    if (!v) return;
    const n = v.history.length;
    if (historySeen.current === null) {
      historySeen.current = n;
      return;
    }
    const fresh = v.history.slice(historySeen.current);
    const items: RevealItem[] = fresh.flatMap((a, k) =>
      ["CONFISCATE", "WRONGFUL", "RELEASE"].includes(a.type)
        ? [
            {
              ...a,
              bribed:
                a.type === "RELEASE" &&
                fresh[k - 1]?.type === "ACCEPT" &&
                fresh[k - 1]?.target === a.target,
            },
          ]
        : [],
    );
    historySeen.current = n;
    // 本轮末自动放行、贪得无厌全放：多人合并成一个结算弹窗，只点一次。
    if (items.length > 1)
      setRevealQueue((q) => [...q, { type: "BATCH", round: v.round, seat: v.guard, items }]);
    else if (items.length) setRevealQueue((q) => [...q, ...items]);
  }, [v?.history.length]);
  useEffect(() => {
    if (net.error) cue("lose");
  }, [net.error]);
  const clearReveal = () => setRevealQueue((q) => q.slice(1));
  const closeMenu = () => setMenu(false);
  const drop = (id: string, z: "luggage" | "bribe") => {
    if (!canSubmit || blocked || !me?.hand?.some((c) => c.id === id)) return;
    setChoice((c) => selectionAfterDrop(c, id, z, bagCount));
    cue("select");
  };
  const clickCard = (id: string) => {
    if (dragStarted.current) {
      dragStarted.current = false;
      return;
    }
    if (choice.luggage.includes(id)) {
      setChoice((c) => ({ ...c, luggage: c.luggage.filter((x) => x !== id) }));
      cue("tap");
    } else if (choice.bribe === id) {
      setChoice((c) => ({ ...c, bribe: "" }));
      cue("tap");
    } else drop(id, choice.luggage.length < bagCount ? "luggage" : "bribe");
  };
  const pointerStart = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "mouse") return;
    dragged.current = id;
    const x = e.clientX,
      y = e.clientY;
    touchTimer.current = setTimeout(() => {
      dragStarted.current = true;
      document.body.classList.add("ss-dragging");
    }, 150);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).dataset.startX = String(x);
    (e.currentTarget as HTMLElement).dataset.startY = String(y);
  };
  const pointerMove = (e: React.PointerEvent) => {
    if (!dragged.current || e.pointerType === "mouse") return;
    const el = e.currentTarget as HTMLElement;
    if (
      !dragStarted.current &&
      Math.hypot(
        e.clientX - Number(el.dataset.startX),
        e.clientY - Number(el.dataset.startY),
      ) > 12
    ) {
      if (touchTimer.current) clearTimeout(touchTimer.current);
      dragged.current = null;
      return;
    }
    if (dragStarted.current) {
      const dest = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-ss-drop]");
      document
        .querySelectorAll(".ss-drop-active")
        .forEach((x) => x.classList.remove("ss-drop-active"));
      dest?.classList.add("ss-drop-active");
    }
  };
  const pointerEnd = (e: React.PointerEvent) => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    if (dragStarted.current && dragged.current) {
      const dest = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-ss-drop]")?.dataset.ssDrop;
      if (dest === "luggage" || dest === "bribe") drop(dragged.current, dest);
    }
    document.body.classList.remove("ss-dragging");
    document
      .querySelectorAll(".ss-drop-active")
      .forEach((x) => x.classList.remove("ss-drop-active"));
    dragged.current = null;
  };
  const chooseTarget = (i: number) => {
    setTarget(i);
    setBox(0);
    cue("tap");
  };
  const candidates =
      v?.players.flatMap((p, i) => (i !== v.guard && !p.settled ? [i] : [])) ??
      [],
    chosen = v
      ? target !== null && candidates.includes(target)
        ? target
        : (candidates[0] ?? null)
      : null;
  const focus = v
    ? v.pendingDog === seat
      ? seat
      : (chosen ??
        (seat !== v.guard
          ? seat
          : v.players.findIndex((_, i) => i !== v.guard)))
    : 0;
  const person = v && focus >= 0 ? v.players[focus] : undefined;
  const eventAvailable =
    !!v &&
    !v.eventUsed &&
    ((v.phase === "BRIBE" && v.event === "night") ||
      (v.phase === "INSPECT" &&
        (v.event === "inspection" || v.event === "dog")) ||
      (v.phase === "ARREST" && v.event === "impartial"));
  const greedy =
    !!v &&
    v.phase === "BRIBE" &&
    v.event === "greedy" &&
    !v.history.some((a) => a.round === v.round && a.type === "ACCEPT");
  const eventMode = mode === "event" && eventAvailable;
  let action: SSAction | null = null,
    actionLabel = "",
    actionTest = "";
  if (v && guard && chosen !== null && v.pendingDog === null) {
    if (v.phase === "BRIBE" && (eventMode || v.budget.bribe > 0)) {
      action = {
        type: "ACCEPT",
        target: chosen,
        ...(eventMode ? { useEvent: true } : {}),
      };
      actionLabel = `接受 ${chosen + 1}号 的受贿`;
      actionTest = `${eventMode ? "ss-event-accept" : "ss-accept"}-${chosen}`;
    }
    if (v.phase === "INSPECT") {
      const p = v.players[chosen];
      const hidden = p.luggage[box] === null;
      if (
        eventMode &&
        v.event === "dog" &&
        p.luggage.every((c) => c === null)
      ) {
        action = { type: "INSPECT", target: chosen, useEvent: true };
        actionLabel = `犬长检查 ${chosen + 1}号`;
        actionTest = `ss-dog-${chosen}`;
      } else if (
        hidden &&
        ((eventMode && v.event === "inspection") ||
          (!eventMode &&
            v.budget.inspect > 0 &&
            p.luggage.every((c) => c === null)))
      ) {
        action = {
          type: "INSPECT",
          target: chosen,
          index: box,
          ...(eventMode ? { useEvent: true } : {}),
        };
        actionLabel = `检查 ${chosen + 1}号`;
        actionTest = `${eventMode ? "ss-event-inspect" : "ss-inspect"}-${chosen}-${box}`;
      }
    }
    if (v.phase === "ARREST" && (eventMode || v.budget.arrest > 0)) {
      action = {
        type: "ARREST",
        target: chosen,
        ...(eventMode ? { useEvent: true } : {}),
      };
      actionLabel = `逮捕 ${chosen + 1}号`;
      actionTest = `${eventMode ? "ss-event-arrest" : "ss-arrest"}-${chosen}`;
    }
  }
  const send = (a: SSAction) => {
    cue("submit");
    void net.act(a);
  };
  const waitingSeat =
    v?.phase === "PACK"
      ? v.players.findIndex((p, i) => i !== v.guard && !p.submitted)
      : -1;
  const waitName = v
    ? v.pendingDog !== null
      ? label(v, v.pendingDog)
      : waitingSeat >= 0
        ? label(v, waitingSeat)
        : label(v, v.guard)
    : "其他玩家";
  const primary = () => {
    if (!s || !s.mySeat) return null;
    if (!v) {
      const ready = s.players[seat]?.ready;
      const othersReady =
        s.players.length === s.count &&
        s.players.every((p, i) => i === seat || p.ready);
      return (
        <>
          <button
            className="ss-primary"
            data-testid={host && ready ? "ss-start" : "ss-ready"}
            disabled={
              blocked ||
              (host &&
                ready &&
                (s.players.length !== s.count ||
                  !s.players.every((p) => p.ready)))
            }
            onClick={async () => {
              if (host && !ready && othersReady) {
                cue("submit");
                if (await net.act({ type: "READY" })) void net.act({ type: "START" });
                return;
              }
              send(host && ready ? { type: "START" } : { type: "READY" });
            }}
          >
            {net.pending ? (
              <span className="ss-pending">
                <i aria-hidden="true" />
                正在确认…
              </span>
            ) : host && ready ? (
              "开始对局"
            ) : host && othersReady ? (
              "准备并开始"
            ) : ready ? (
              "已准备"
            ) : (
              "准备"
            )}
          </button>
          {ready && (
            <button
              className="ss-secondary"
              data-testid="ss-unready"
              disabled={blocked}
              onClick={() => send({ type: "READY" })}
            >
              取消准备
            </button>
          )}
        </>
      );
    }
    if (canSubmit)
      return (
        <button
          className="ss-primary"
          data-testid="ss-submit"
          disabled={
            blocked || choice.luggage.length !== bagCount || !choice.bribe
          }
          onClick={() =>
            send({
              type: "SUBMIT",
              luggage: choice.luggage,
              bribe: choice.bribe,
            })
          }
        >
          {net.pending ? (
            <span className="ss-pending">
              <i aria-hidden="true" />
              正在提交…
            </span>
          ) : (
            "提交并锁定"
          )}
        </button>
      );
    if (v.pendingDog === seat) {
      const c = me?.luggage[box];
      return (
        <button
          className="ss-primary"
          data-testid={`ss-reveal-dog-${box}`}
          disabled={blocked || !c}
          onClick={() => send({ type: "REVEAL_DOG", index: box })}
        >
          翻开第 {box + 1} 个手提箱
        </button>
      );
    }
    if (
      guard &&
      ["BRIBE", "INSPECT", "ARREST"].includes(v.phase) &&
      v.pendingDog === null
    ) {
      const next =
        v.phase === "ARREST" ? "结束行动，放行其余旅客" : "进入下一阶段";
      return (
        <>
          {action ? (
            <button
              className="ss-primary"
              data-testid={actionTest}
              disabled={blocked}
              onClick={() => send(action!)}
            >
              {net.pending ? (
                <span className="ss-pending">
                  <i aria-hidden="true" />
                  正在确认…
                </span>
              ) : (
                actionLabel
              )}
            </button>
          ) : (
            <button
              className="ss-primary"
              data-testid="ss-advance"
              disabled={blocked}
              onClick={() => send({ type: "ADVANCE" })}
            >
              {next}
            </button>
          )}
          {action && (
            <button
              className="ss-secondary"
              data-testid="ss-advance"
              disabled={blocked}
              onClick={() => send({ type: "ADVANCE" })}
            >
              {next}
            </button>
          )}
          {greedy && (
            <button
              className="ss-secondary"
              data-testid="ss-greedy"
              disabled={blocked}
              onClick={() => send({ type: "GREEDY" })}
            >
              全收全放
            </button>
          )}
        </>
      );
    }
    if (v.phase === "ROUND_END")
      return (
        <button
          className="ss-primary"
          data-testid="ss-next-round"
          disabled={blocked}
          onClick={() => send({ type: "NEXT_ROUND" })}
        >
          下一轮
        </button>
      );
    if (v.phase === "FINISHED")
      return host ? (
        <button
          className="ss-primary"
          data-testid="ss-rematch"
          disabled={blocked}
          onClick={() => send({ type: "REMATCH" })}
        >
          再来一局
        </button>
      ) : (
        <button className="ss-primary" disabled>
          等待房主开始下一局…
        </button>
      );
    return (
      <button className="ss-primary" disabled>
        {v.phase === "PACK" && me?.submitted
          ? "已锁定，等待其他旅客…"
          : `等待 ${waitName}…`}
      </button>
    );
  };
  const mainActive =
    canSubmit ||
    (guard &&
      !!v &&
      ["BRIBE", "INSPECT", "ARREST"].includes(v.phase)) ||
    v?.phase === "ROUND_END" ||
    v?.pendingDog === seat;
  const wasActive = useRef(false);
  useEffect(() => {
    if (v && mainActive && !wasActive.current) {
      setBanner((previous) =>
        v.phase === "PACK" && previous?.key === `${v.round}:${v.phase}`
          ? { ...previous, sub: "轮到你装包" }
          : {
              key: `active:${v.round}:${v.phase}`,
              title: v.phase === "ROUND_END" ? "本轮结束" : "轮到你行动",
              tone: "guard",
            },
      );
      cue("turn");
      const t = setTimeout(() => setBanner(null), 1900);
      wasActive.current = mainActive;
      return () => clearTimeout(t);
    }
    wasActive.current = !!mainActive;
  }, [mainActive, v?.round, v?.phase]);
  const statusCount = Number(!net.online) + Number(!!net.error);
  return (
    <main
      className={`ss-world ${statusCount ? "ss-has-status" : ""} ${statusCount === 2 ? "ss-status-two" : ""}`}
      data-testid="ss-world"
    >
      <header className="ss-topbar">
        <a className="ss-brand" href="/" aria-label="返回桌游大厅">
          <img src={`${A}logo.webp`} alt="Soda Smugglers" />
        </a>
        <span className="ss-roomno" data-testid="ss-room">
          {s?.code ?? "汽水走私犯"}
        </span>
        {v && (
          <strong className="ss-round">
            第 {v.round}/{v.totalRounds} 轮
          </strong>
        )}
        {v?.deadline && remaining !== null && (
          <span
            className={`ss-clock ${remaining <= 10 ? "urgent" : remaining <= 30 ? "warn" : ""}`}
            aria-label={`剩余 ${remaining} 秒`}
            style={
              {
                "--ss-ring-offset": `${2 * Math.PI * 46 * (1 - Math.min(1, remaining / (s?.seconds || 60)))}`,
              } as React.CSSProperties
            }
          >
            <CountdownRing left={s?.seconds || 60} total={s?.seconds || 60} />
            <b>{remaining}</b>
          </span>
        )}
        <button
          className="ss-menu-button"
          data-testid="ss-menu"
          aria-label="菜单"
          onClick={() => setMenu(true)}
        >
          ☰
        </button>
      </header>
      {!net.online && (
        <div
          className="ss-disconnect"
          role="status"
          data-testid="ss-disconnect"
        >
          重连中…
        </div>
      )}
      {net.error && (
        <div className="ss-error" role="alert" data-testid="ss-error">
          {net.error}
          <button aria-label="关闭提示" onClick={() => net.setError("")}>
            ✕
          </button>
        </div>
      )}
      {!s ? (
        <section className="ss-entry">
          <img
            className="ss-entry-cover"
            src={`${A}box-logo.webp`}
            alt="汽水走私犯官方包装"
          />
          <div className="ss-entry-panel">
            <span className="ss-kicker">3–8 人 · 语音派对</span>
            <h1>汽水走私犯</h1>
            <p>装好手提箱，准备过关。</p>
            <label>
              你的昵称
              <input
                data-testid="ss-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                placeholder="输入昵称"
              />
            </label>
            <button
              className="ss-primary"
              data-testid="ss-create"
              disabled={blocked}
              onClick={() => net.create(name)}
            >
              创建房间
            </button>
            <label>
              加入已有房间
              <input
                data-testid="ss-code"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
                placeholder="输入房间号"
                maxLength={4}
              />
            </label>
            <button
              className="ss-secondary"
              data-testid="ss-join"
              disabled={blocked}
              onClick={() => net.join(room, name)}
            >
              加入房间
            </button>
          </div>
        </section>
      ) : !s.mySeat ? (
        <section className="ss-entry ss-entry-claim">
          <img className="ss-entry-cover" src={`${A}box-logo.webp`} alt="" />
          <div className="ss-entry-panel">
            <h1>加入 {s.code}</h1>
            <label>
              你的昵称
              <input
                data-testid="ss-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
              />
            </label>
            <button
              className="ss-primary"
              data-testid="ss-claim"
              disabled={blocked}
              onClick={() => net.claim(name)}
            >
              入座
            </button>
          </div>
        </section>
      ) : (
        <div
          className={`ss-layout ${v ? `ss-phase-${v.phase.toLowerCase()}` : "ss-lobby"}`}
        >
          <section className="ss-stage" data-testid="ss-stage" tabIndex={0}>
            {v?.phase === "ROUND_END" && <p className="ss-scroll-hint" data-testid="ss-scroll-hint">↓ 向下滚动查看本轮回顾</p>}
            {!v ? (
              <>
                <div className="ss-stage-title">
                  <span className="ss-kicker">房间 {s.code}</span>
                  <h1>准备出发</h1>
                  <p>
                    还差 {s.count - s.players.length} 人 · {s.players.length}/
                    {s.count} 已入座
                  </p>
                </div>
                <div className="ss-lobby-art">
                  <img src={`${A}suitcase-closed.webp`} alt="官方手提箱" />
                  <p>把房间号发给朋友，一起准备过关。</p>
                </div>
                {host && (
                  <div className="ss-settings" aria-label="房主设置">
                    <label>
                      人数
                      <select
                        data-testid="ss-count"
                        value={s.count}
                        disabled={blocked}
                        onChange={(e) =>
                          send({
                            type: "SET_SETTINGS",
                            count: Number(e.target.value),
                          })
                        }
                      >
                        {[3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>
                            {n} 人
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ss-event-setting">
                      随机事件
                      <span className="ss-toggle"><input
                        data-testid="ss-events"
                        type="checkbox"
                        checked={s.events}
                        disabled={blocked}
                        onChange={(e) =>
                          send({
                            type: "SET_SETTINGS",
                            events: e.target.checked,
                          })
                        }
                      /><span className="ss-toggle-track" aria-hidden="true">{s.events ? "开" : "关"}</span></span>
                    </label>
                    <label>
                      计时
                      <select
                        data-testid="ss-seconds"
                        value={s.seconds}
                        disabled={blocked}
                        onChange={(e) =>
                          send({
                            type: "SET_SETTINGS",
                            seconds: Number(e.target.value) as 0 | 60 | 120,
                          })
                        }
                      >
                        <option value={0}>不限时</option>
                        <option value={60}>60 秒</option>
                        <option value={120}>120 秒</option>
                      </select>
                    </label>
                    <label className="ss-first-guard">
                      首位警长
                      <select
                        data-testid="ss-first-guard"
                        value={s.firstGuard}
                        disabled={blocked}
                        onChange={(e) =>
                          send({
                            type: "SET_SETTINGS",
                            firstGuard: Number(e.target.value),
                          })
                        }
                      >
                        {s.firstGuard === "random" && (
                          <option value="random">开局随机</option>
                        )}
                        {Array.from({ length: s.count }, (_, i) => (
                          <option key={i} value={i}>
                            {i + 1}号 {s.players[i]?.name ?? "待入座"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      data-testid="ss-random-guard"
                      disabled={blocked}
                      onClick={() => send({ type: "RANDOM_GUARD" })}
                    >
                      随机指定
                    </button>
                  </div>
                )}
                <button
                  className="ss-copy"
                  data-testid="ss-copy"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      net.setError("复制失败，请复制地址栏链接");
                      return;
                    }
                    void navigator.clipboard.writeText(location.href).then(
                      () => {
                        cue("tap");
                      },
                      () => net.setError("复制失败，请复制地址栏链接"),
                    );
                  }}
                >
                  复制邀请链接
                </button>
              </>
            ) : (
              <>
                {v.event && (
                  <EventCard
                    event={v.event}
                    onOpen={() => setEventOpen(true)}
                  />
                )}
                <div className="ss-stage-title">
                  <span className="ss-kicker">
                    {v.phase === "FINISHED" ? "最终结果" : v.phase === "ROUND_END" ? "结算完成" : guard
                      ? ["BRIBE", "INSPECT", "ARREST"].includes(
                          v.phase,
                        )
                        ? "轮到你行动 · 缉私警长"
                        : "缉私警长 · 等待旅客"
                      : v.pendingDog === seat
                        ? "轮到你翻箱 · 旅客"
                        : "边境检查 · 旅客"}
                  </span>
                  <h1 data-testid="ss-phase">{phases[v.phase]}</h1>
                  <p>
                    {v.phase === "PACK"
                      ? guard
                        ? "旅客们正在秘密装包。"
                        : me?.submitted
                          ? "已锁定，等待其他旅客。"
                          : `选 ${bagCount} 张行李，再选 1 张受贿牌。`
                      : v.phase === "FINISHED"
                        ? "瓶盖最多的玩家获胜。"
                        : v.phase === "ROUND_END"
                          ? "所有旅客已结算。"
                          : v.pendingDog === seat
                            ? "请选择汽水最多的手提箱。"
                            : guard
                              ? "选择旅客和行动，或进入下一阶段。"
                              : "请用语音自由讨论，等待警长行动。"}
                  </p>
                </div>
                {v.phase === "PACK" && seat !== v.guard && !me?.submitted ? (
                  <>
                    <div className="ss-packing">
                      <div
                        className="ss-dropzone"
                        data-ss-drop="luggage"
                        data-testid="ss-drop-luggage"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          drop(e.dataTransfer.getData("text/plain"), "luggage");
                        }}
                      >
                        <strong>
                          我的行李{" "}
                          <small>
                            {choice.luggage.length}/{bagCount}
                          </small>
                        </strong>
                        <div>
                          {Array.from({ length: bagCount }, (_, i) => {
                            const id = choice.luggage[i],
                              card = me?.hand?.find((c) => c.id === id);
                            return (
                              <button
                                key={i}
                                aria-label={
                                  card
                                    ? `移除行李${i + 1}，${card.bottles}瓶`
                                    : `行李位置${i + 1}`
                                }
                                onClick={() =>
                                  id &&
                                  setChoice((c) => ({
                                    ...c,
                                    luggage: c.luggage.filter((x) => x !== id),
                                  }))
                                }
                              >
                                {card ? (
                                  <Suitcase bottles={card.bottles} />
                                ) : (
                                  <span>＋</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div
                        className="ss-dropzone ss-bribe-zone"
                        data-ss-drop="bribe"
                        data-testid="ss-drop-bribe"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          drop(e.dataTransfer.getData("text/plain"), "bribe");
                        }}
                      >
                        <strong>受贿牌</strong>
                        <div>
                          <button
                            aria-label="移除受贿牌"
                            onClick={() =>
                              setChoice((c) => ({ ...c, bribe: "" }))
                            }
                          >
                            {choice.bribe ? (
                              <Suitcase
                                bottles={
                                  me?.hand?.find((c) => c.id === choice.bribe)
                                    ?.bottles
                                }
                              />
                            ) : (
                              <span>＋</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div
                      className="ss-hand"
                      data-testid="ss-hand"
                      aria-label="你的手提箱牌"
                    >
                      {me?.hand
                        ?.filter(
                          (c) =>
                            !choice.luggage.includes(c.id) &&
                            choice.bribe !== c.id,
                        )
                        .map((c) => (
                        <button
                          key={c.id}
                          data-testid={`ss-card-${c.id}`}
                          aria-pressed={
                            choice.luggage.includes(c.id) ||
                            choice.bribe === c.id
                          }
                          disabled={blocked}
                          draggable
                          onDragStart={(e) => {
                            dragged.current = c.id;
                            e.dataTransfer.setData("text/plain", c.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            dragged.current = null;
                            document
                              .querySelectorAll(".ss-drop-active")
                              .forEach((x) =>
                                x.classList.remove("ss-drop-active"),
                              );
                          }}
                          onPointerDown={(e) => pointerStart(e, c.id)}
                          onPointerMove={pointerMove}
                          onPointerUp={pointerEnd}
                          onPointerCancel={pointerEnd}
                          onClick={() => clickCard(c.id)}
                        >
                          <Suitcase bottles={c.bottles} />
                          <span>
                            {choice.luggage.includes(c.id)
                              ? "行李"
                              : choice.bribe === c.id
                                ? "受贿牌"
                                : `${c.bottles} 瓶`}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="ss-help">
                      点手牌放进行李（满了放进受贿牌）；点上方已放的牌可退回。也可以拖动。
                    </p>
                  </>
                ) : v.phase === "FINISHED" ? (
                  <div className="ss-results" data-testid="ss-result">
                    <div className="ss-podium">
                      <span>🏆</span>
                      <h2>胜利属于</h2>
                      <strong>
                        {v.result?.winners
                          .map((i) => v.players[i].name)
                          .join("、")}
                      </strong>
                      <p>
                        {v.result?.winners
                          .map((i) => `${v.players[i].caps} 瓶盖`)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="ss-ranking" aria-label="领奖台排名">
                      {[...v.players]
                        .sort((a, b) => b.caps - a.caps)
                        .filter(
                          (p) =>
                            1 +
                              v.players.filter((q) => q.caps > p.caps).length <=
                            3,
                        )
                        .map((p, i) => (
                          <div key={i}>
                            <b>
                              第{" "}
                              {1 +
                                v.players.filter((q) => q.caps > p.caps)
                                  .length}{" "}
                              名
                            </b>
                            <span>{p.name}</span>
                            <strong>{p.caps} 瓶盖</strong>
                          </div>
                        ))}
                    </div>
                    <div className="ss-awards">
                      {winnerTitles(v.players).map((a) => (
                        <p key={a.name + a.label}>
                          ✦ {a.label}：{a.name} · {a.value} 瓶
                        </p>
                      ))}
                    </div>
                    <details>
                      <summary>每轮回顾</summary>
                      {recapByRound(v.history).map((r) => (
                        <div key={r.round}>
                          <h3>第 {r.round} 轮</h3>
                          {r.actions.map((a, i) => (
                            <p key={i}>
                              <HistoryText a={a} v={v} />
                            </p>
                          ))}
                        </div>
                      ))}
                    </details>
                  </div>
                ) : (
                  <>
                    {guard && (
                      <div className="ss-budget" data-testid="ss-budget" aria-label="本轮剩余指示物">
                        <span>受贿 {v.budget.bribe}</span><span>检查 {v.budget.inspect}</span><span>逮捕 {v.budget.arrest}</span>
                      </div>
                    )}
                    {["BRIBE", "INSPECT", "ARREST"].includes(v.phase) && (
                      <div className="ss-bribe-cards" data-testid="ss-bribe-cards" aria-label={guard ? "选择旅客" : "公开的受贿牌"}>
                        {v.players.map((player, i) => i === v.guard || !player.bribe ? null : (
                          <button
                            type="button"
                            className={`ss-bribe-card ${guard && chosen === i ? "is-selected" : ""} ${player.settled ? "is-settled" : ""}`}
                            data-testid={`ss-public-bribe-${i}`}
                            key={i}
                            disabled={!guard || player.settled || blocked}
                            aria-pressed={guard && chosen === i}
                            onClick={() => chooseTarget(i)}
                          >
                            <strong title={player.name}>{i + 1}号 {player.name}</strong>
                            <Suitcase bottles={player.bribe.bottles} />
                            <span>{player.settled ? "✅ 已结算" : `受贿 ${player.bribe.bottles} 瓶`}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {guard && ["BRIBE", "INSPECT", "ARREST"].includes(v.phase) && (
                      <p className="ss-help ss-pick-hint">点上面的旅客选择对象，再按下方按钮执行。</p>
                    )}
                    {guard &&
                      ["BRIBE", "INSPECT", "ARREST"].includes(v.phase) && (
                        <div
                          className="ss-action-tokens"
                          aria-label="本轮行动指示物"
                        >
                          <button
                            data-testid="ss-mode-normal"
                            className={!eventMode ? "is-active" : ""}
                            onClick={() => setMode("normal")}
                          >
                            <img
                              src={`${A}action-${v.phase === "BRIBE" ? "bribe" : v.phase === "INSPECT" ? "inspect" : "arrest"}.webp`}
                              alt=""
                            />
                            {v.phase === "BRIBE"
                              ? `受贿 ${v.budget.bribe}`
                              : v.phase === "INSPECT"
                                ? `检查 ${v.budget.inspect}`
                                : `逮捕 ${v.budget.arrest}`}
                          </button>
                          {eventAvailable && (
                            <button
                              data-testid="ss-mode-event"
                              className={eventMode ? "is-active" : ""}
                              onClick={() => setMode("event")}
                            >
                              <img src={`${A}event-${v.event}.webp`} alt="" />
                              {eventCopy[v.event!].title}
                            </button>
                          )}
                        </div>
                      )}
                    {person && !(guard && v.phase === "BRIBE") && (
                      <div
                        className="ss-traveler"
                        data-testid={`ss-traveler-${focus}`}
                      >
                        <div className="ss-traveler-head">
                          <span className="ss-passport">{focus + 1}</span>
                          <div>
                            <small>正在查看</small>
                            <h2>{person.name}</h2>
                          </div>
                          <span className="ss-bribe">
                            受贿 <b>{person.bribe?.bottles ?? "?"}</b> 瓶盖
                          </span>
                        </div>
                        <div
                          className="ss-luggage"
                          aria-label={`${person.name}的手提箱`}
                        >
                          {person.luggage.map((c, i) => (
                            <button
                              key={i}
                              data-testid={`ss-box-${i}`}
                              className={box === i ? "is-selected" : ""}
                              aria-label={`第 ${i + 1} 个手提箱，${c ? `${c.bottles}瓶` : "未打开"}`}
                              aria-pressed={box === i}
                              onClick={() => setBox(i)}
                            >
                              <Suitcase back={!c} bottles={c?.bottles} />
                              <span>
                                第 {i + 1} 箱{" "}
                                {c ? `· ${c.bottles} 瓶` : "· 未打开"}
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="ss-help">
                          {person.settled
                            ? "该旅客已结算。"
                            : v.phase === "PACK"
                              ? "手提箱内容只有旅客自己可见。"
                              : v.phase === "INSPECT"
                                ? "选择一只手提箱，检查后才会公开。"
                                : "受贿牌已公开，手提箱内容仍然保密。"}
                        </p>
                      </div>
                    )}
                    {v.phase === "ROUND_END" && (
                      <div className="ss-round-summary">
                        <h2>本轮回顾</h2>
                        {v.history
                          .filter(
                            (a) =>
                              a.round === v.round &&
                              ["CONFISCATE", "WRONGFUL", "RELEASE"].includes(
                                a.type,
                              ),
                          )
                          .map((a, i) => (
                            <p key={i}>
                              <HistoryText a={a} v={v} />
                            </p>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
          <aside className="ss-side">
            {v ? (
              <SeatStrip v={v} selected={chosen} onSelect={chooseTarget} />
            ) : (
              <div
                className="ss-seatstrip ss-lobby-seats"
                data-testid="ss-seatstrip"
              >
                {Array.from({ length: s.count }, (_, i) => {
                  const p = s.players[i];
                  return (
                    <div className="ss-seat" key={i}>
                      <span className="ss-seat-top">
                        <span className="ss-avatar">{i + 1}</span>
                        <strong>{p?.name ?? "等待入座"}</strong>
                      </span>
                      <span className="ss-seat-bottom">
                        {p ? (p.ready ? "✅已准备" : "等待准备") : "空座位"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={`ss-dock-wrap ${mainActive ? "is-active" : ""}`}>
              <ActionDock
                hint={
                  !v
                    ? "全员准备后由房主开始"
                    : v.phase === "FINISHED"
                      ? "本局结束"
                      : v.phase === "ROUND_END"
                        ? "本轮结算完成"
                        : canSubmit
                          ? "行李与受贿牌只在提交后锁定"
                          : v.pendingDog !== null
                            ? `等待 ${label(v, v.pendingDog)} 翻箱`
                            : guard
                              ? "轮到你行动"
                              : me?.submitted || v.phase !== "PACK"
                                ? phases[v.phase]
                                : "请装包"
                }
              >
                {primary()}
              </ActionDock>
            </div>
          </aside>
        </div>
      )}
      <PhaseBanner banner={banner} />
      {identity && v && seat >= 0 && (
        <div
          className="ss-identity"
          role="dialog"
          aria-label="本轮职务"
          data-testid="ss-identity"
        >
          <div>
            <small>第 {v.round} 轮 · 你的职务</small>
            <img src={`${A}suitcase-back.webp`} alt="" />
            <strong>{guard ? "缉私警长" : "旅客"}</strong>
            <p>{guard ? "你负责受贿、检查和逮捕。" : "秘密装包，准备过关。"}</p>
            <button
              data-testid="ss-identity-close"
              onClick={() => setIdentity(false)}
            >
              知道了
            </button>
          </div>
        </div>
      )}
      {revealQueue[0]?.type === "BATCH" && v && (
        <BatchReveal action={revealQueue[0]} v={v} onClose={clearReveal} />
      )}
      {revealQueue[0] && revealQueue[0].type !== "BATCH" && v && (
        <Reveal
          key={`${revealQueue[0].round}-${revealQueue[0].target}-${revealQueue[0].type}`}
          action={revealQueue[0]}
          v={v}
          onClose={clearReveal}
          sound={sound}
          vibration={vibration}
        />
      )}
      {menu && (
        <div
          className="ss-modal"
          role="dialog"
          aria-modal="true"
          aria-label="菜单"
        >
          <div className="ss-sheet">
            <button
              className="ss-close"
              onClick={closeMenu}
              aria-label="关闭菜单"
            >
              ✕
            </button>
            <h2>菜单</h2>
            <button
              data-testid="ss-sound"
              aria-pressed={sound}
              onClick={() => {
                const x = !sound;
                setSound(x);
                setSoundOn(x);
                saveBool("ss-sound", x);
              }}
            >
              音效：{sound ? "开" : "关"}
            </button>
            <button
              data-testid="ss-vibration"
              aria-pressed={vibration}
              onClick={() => {
                const x = !vibration;
                setVibration(x);
                saveBool("ss-vibration", x);
              }}
            >
              震动：{vibration ? "开" : "关"}
            </button>
            <button
              data-testid="ss-rules"
              onClick={() => {
                closeMenu();
                setRules(true);
              }}
            >
              游戏规则
            </button>
            <button
              data-testid="ss-leave"
              onClick={() => {
                if (s && !v) void net.act({ type: "LEAVE" });
                location.href = "/";
              }}
            >
              退出
            </button>
          </div>
        </div>
      )}
      {rules && <Rules onClose={() => setRules(false)} />}
      {eventOpen && v?.event && (
        <div
          className="ss-modal"
          role="dialog"
          aria-modal="true"
          aria-label={eventCopy[v.event].title}
        >
          <div className="ss-sheet ss-event-detail">
            <button
              className="ss-close"
              aria-label="关闭事件"
              onClick={() => setEventOpen(false)}
            >
              ✕
            </button>
            <img
              src={`${A}event-${v.event}.webp`}
              alt={`${eventCopy[v.event].title}中文版卡面`}
            />
            <div>
              <h2>{eventCopy[v.event].title}</h2>
              <p>{eventCopy[v.event].text}</p>
              <button onClick={() => setEventOpen(false)}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
