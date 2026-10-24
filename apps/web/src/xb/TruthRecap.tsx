import React from "react";
import type {
  XBSnapshot,
  XBCommand,
} from "../../../../packages/shared/src/xb-protocol.ts";
export function TruthRecap({
  snap,
  command,
  busy,
}: {
  snap: XBSnapshot;
  command: (c: XBCommand) => unknown;
  busy: boolean;
}) {
  const view = snap.view!;
  return (
    <section className="xb-afterparty">
      <h2>本轮真相</h2>
      <p>左右滑动，回味本局已经出过的题。</p>
      <div
        className="xb-truth-carousel"
        data-testid="xb-truth-carousel"
        ref={(el) => {
          if (el && !el.dataset.positioned) {
            el.scrollLeft = el.scrollWidth;
            el.dataset.positioned = "1";
          }
        }}
      >
        {view.history.map((h) => (
          <article
            key={h.round}
            className="xb-truth-card"
            data-testid={`xb-truth-card-${h.round}`}
          >
            <span className="xb-kicker">
              第{h.round}轮 · {"★".repeat(h.difficulty)}
            </span>
            <h2>{h.question}</h2>
            <p>{h.answer}</p>
            <a href={h.source} target="_blank" rel="noreferrer">
              核对真实来源 ↗
            </a>
          </article>
        ))}
      </div>
      {view.phase === "reveal" && (
        <div className="xb-crown-vote" data-testid="xb-crown-vote">
          <h2>👑 最离谱瞎掰</h2>
          <p>一人一顶，送给本轮最离谱的人。只算称号，不加分。</p>
          <div>
            {view.players.map((p) => (
              <button
                key={p.id}
                title={p.name}
                data-testid={`xb-crown-${p.id}`}
                aria-pressed={snap.myCrownVote === p.id}
                disabled={busy || !!snap.myCrownVote}
                onClick={() =>
                  command({ type: "CROWN", round: view.round, target: p.id })
                }
              >
                <span>{p.name}</span> 👑 {snap.crownCounts?.[p.id] ?? 0}
              </button>
            ))}
          </div>
          {snap.myCrownVote && (
            <strong role="status">
              已送给{snap.players.find((p) => p.id === snap.myCrownVote)?.name}
              ，不计分。
            </strong>
          )}
        </div>
      )}
    </section>
  );
}
