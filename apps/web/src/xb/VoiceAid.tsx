import React from "react";
import type {
  XBCommand,
  XBSnapshot,
} from "../../../../packages/shared/src/xb-protocol.ts";
export function VoiceAid({
  snap,
  command,
  busy,
}: {
  snap: XBSnapshot;
  command: (c: XBCommand) => unknown;
  busy: boolean;
}) {
  const view = snap.view!;
  if (view.phase !== "discussion" || snap.me !== view.guesser) return null;
  return (
    <details className="xb-voice-aid" data-testid="xb-voice-aid">
      <summary>点名追问</summary>
      {view.players
        .filter((p) => p.id !== view.guesser)
        .map((p) => (
          <button
            key={p.id}
            data-testid={`xb-call-${p.id}`}
            disabled={busy || view.muted === p.id}
            onClick={() =>
              command({ type: "CALL", round: view.round, target: p.id })
            }
          >
            {p.name} · 点名
          </button>
        ))}
    </details>
  );
}
export function SpeechBar({
  snap,
  id,
  now,
}: {
  snap: XBSnapshot;
  id: string;
  now: number;
}) {
  const used =
      (snap.speechUsed?.[id] ?? 0) +
      (snap.view?.speaker === id && snap.speakerAt
        ? Math.max(0, now - snap.speakerAt)
        : 0),
    limit = snap.speechSeconds ?? 0;
  if (!limit)
    return snap.view?.speaker === id ? (
      <span className="xb-speech-time">
        已聊 {Math.floor(used / 1000)}s · 不限
      </span>
    ) : null;
  const remaining = Math.max(0, limit - Math.floor(used / 1000));
  return (
    <span
      className={"xb-speech-meter " + (!remaining ? "is-expired" : "")}
      aria-label={`发言剩余${remaining}秒`}
    >
      <span style={{ transform: `scaleX(${remaining / limit})` }} />
      <b>{remaining}s</b>
    </span>
  );
}
