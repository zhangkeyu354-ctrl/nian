import { useEffect, useRef, useState } from "react";
import type { GameState } from "../../../packages/shared/src/types.ts";
import {
  majorNotices,
  threatFor,
  type MajorNotice,
} from "./experience-model.ts";
import { useSettings } from "./Settings.tsx";
import { playCue } from "./game-sound.ts";
export function GameExperience({
  state,
  seat,
  masked,
  error,
  pending,
  busy,
}: {
  state: GameState;
  seat: string | null;
  masked: boolean;
  error: string;
  pending: boolean;
  busy: boolean;
}) {
  const settings = useSettings();
  const previous = useRef(state);
  const danger = threatFor(state, masked ? null : seat);
  const previousDanger = useRef<string>(danger.level);
  const [notices, setNotices] = useState<MajorNotice[]>([]);
  const [hurt, setHurt] = useState(false);
  useEffect(() => {
    const prev = previous.current;
    previous.current = state;
    if (prev === state) return;
    const fresh = state.events.slice(prev.events.length);
    setNotices((q) => [...q, ...majorNotices(state, fresh)].slice(-5));
    if (
      fresh.some(
        (e) =>
          e.type === "WOUNDED" &&
          state.actors[String(e.data.actorId)]?.ownerId === seat,
      )
    )
      setHurt(true);
    for (const e of fresh) {
      const cue =
        e.type === "DICE_ROLLED" || e.type === "SPAWNED"
          ? "dice"
          : e.type === "CHECK_RESOLVED"
            ? String(e.data.result)
            : e.type === "WOUNDED"
              ? "injury"
              : null;
      if (cue && !masked) playCue(cue, settings.sound, settings.vibration);
    }
  }, [state, seat, masked, settings.sound, settings.vibration]);
  useEffect(() => {
    if (!notices.length || busy) return;
    const t = setTimeout(
      () => setNotices((q) => q.slice(1)),
      settings.effectiveAnimations ? 1900 : 1700,
    );
    return () => clearTimeout(t);
  }, [notices[0]?.seq, settings.effectiveAnimations, busy]);
  useEffect(() => {
    if (!hurt) return;
    const t = setTimeout(() => setHurt(false), 1000);
    return () => clearTimeout(t);
  }, [hurt]);
  useEffect(() => {
    if (danger.level === "same" && previousDanger.current !== "same" && !masked)
      playCue("danger", settings.sound, settings.vibration);
    previousDanger.current = danger.level;
  }, [danger.level, masked]);
  if (masked) return null;
  return (
    <>
      {danger.level !== "none" && (
        <div
          className={"danger-edge danger-" + danger.level}
          data-testid="danger-warning"
          aria-label={
            danger.level === "same" ? "杀手与你同处一室" : "杀手在相邻房间"
          }
        >
          <span>
            {danger.level === "same" ? "杀手就在这里" : "杀手正在附近"}
          </span>
        </div>
      )}
      {hurt && (
        <div className="injury-edge" data-testid="injury-stamp">
          <strong>受伤</strong>
        </div>
      )}
      {!!notices.length && !busy && (
        <div
          className={"major-notice notice-" + notices[0].kind}
          key={notices[0].seq}
          data-testid="major-notice"
          role="status"
        >
          <span aria-hidden="true">{notices[0].icon}</span>
          <div>
            <strong>{notices[0].title}</strong>
            <p>{notices[0].detail}</p>
          </div>
        </div>
      )}
      {pending && (
        <div className="send-status" role="status">
          <i />
          正在发送…
        </div>
      )}
      {!!error && (
        <div key={error} className="command-rejected" role="status">
          {error}
        </div>
      )}
    </>
  );
}
