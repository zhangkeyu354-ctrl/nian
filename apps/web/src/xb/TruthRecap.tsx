import React, { useState } from "react";
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
      <h2>节目回放</h2>
      <p>左右滑动选一盘，翻面听真解释。</p>
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
          <ReplayCard key={h.round} item={h} />
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

function ReplayCard({
  item: h,
}: {
  item: NonNullable<XBSnapshot["view"]>["history"][number];
}) {
  const [back, setBack] = useState(false);
  return (
    <article
      className={"xb-truth-card xb-cassette " + (back ? "is-flipped" : "")}
      data-testid={`xb-truth-card-${h.round}`}
    >
      <div className="xb-cassette-shell">
        <span className="xb-cassette-side">
          {back ? "SIDE B · 真解释" : "SIDE A · 本轮题目"}
        </span>
        <div className="xb-cassette-label">
          <span className="xb-kicker">
            第{h.round}轮 · {"★".repeat(h.difficulty)}
          </span>
          <div className="xb-cassette-flip">
            <div className="xb-cassette-inner">
              <div className="xb-cassette-front" aria-hidden={back}>
                <h2>{h.question}</h2>
              </div>
              <div className="xb-cassette-back" aria-hidden={!back}>
                <p>{h.answer}</p>
                <a
                  href={h.source}
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={back ? 0 : -1}
                >
                  核对真实来源 ↗
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="xb-tape-reels" aria-hidden="true">
          <i />
          <span />
          <i />
        </div>
        <button
          data-testid={`xb-replay-flip-${h.round}`}
          aria-pressed={back}
          onClick={() => setBack(!back)}
        >
          {back ? "翻回题目 ↶" : "翻到真解释 ↷"}
        </button>
      </div>
    </article>
  );
}
