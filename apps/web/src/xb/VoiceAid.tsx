import React from "react";
import type {
  XBCommand,
  XBSnapshot,
  XBNoteTag,
} from "../../../../packages/shared/src/xb-protocol.ts";
export const NOTE_TAGS: Record<XBNoteTag, string> = {
  suspect: "可疑",
  truthy: "像真的",
  unknown: "？",
};
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
    <details className="xb-cheatsheet" data-testid="xb-cheatsheet">
      <summary>
        🎙 点名与小抄 <small>标签现在只有你能看，揭晓后公开</small>
      </summary>
      {view.players
        .filter((p) => p.id !== view.guesser)
        .map((p) => (
          <div className="xb-note-person" key={p.id}>
            <b title={p.name}>{p.name}</b>
            <button
              data-testid={`xb-call-${p.id}`}
              disabled={busy || view.muted === p.id}
              onClick={() =>
                command({ type: "CALL", round: view.round, target: p.id })
              }
            >
              点名
            </button>
            <div role="group" aria-label={`${p.name}的私密标签`}>
              {Object.entries(NOTE_TAGS).map(([tag, label]) => (
                <button
                  key={tag}
                  data-testid={`xb-note-${p.id}-${tag}`}
                  aria-pressed={snap.privateNotes?.[p.id] === tag}
                  disabled={busy}
                  onClick={() =>
                    command({
                      type: "NOTE",
                      round: view.round,
                      target: p.id,
                      tag:
                        snap.privateNotes?.[p.id] === tag
                          ? null
                          : (tag as XBNoteTag),
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
    </details>
  );
}
export function PublicNotes({ snap }: { snap: XBSnapshot }) {
  const notes = snap.revealedNotes?.find((n) => n.round === snap.view?.round);
  if (!notes) return null;
  return (
    <article className="xb-public-notes" data-testid="xb-public-notes">
      <h2>想想的小抄，摊开了！</h2>
      {Object.entries(notes.tags).map(([id, tag]) => (
        <p key={id}>
          {snap.players.find((p) => p.id === id)?.name}：<b>{NOTE_TAGS[tag]}</b>
        </p>
      ))}
      {!Object.keys(notes.tags).length && <p>这轮想想没留小抄。</p>}
    </article>
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
