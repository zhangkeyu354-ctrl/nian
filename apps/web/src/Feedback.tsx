import React from "react";
import type { Feedback as Effect } from "../../../packages/game-engine/src/presentation.ts";
import {
  boardVisuals,
  sampleVisual,
} from "../../../packages/game-engine/src/index.ts";
import type { GameState } from "../../../packages/shared/src/types.ts";
import { Token } from "./Token.tsx";
function EffectArt({ effect: e }: { effect: Effect }) {
  const kind = e.asset.startsWith("portrait_") ? "actor" : e.asset;
  const token = {
    ...sampleVisual(
      kind,
      e.kind === "hook"
        ? "occupied"
        : e.kind === "attack"
          ? "wounded"
          : e.kind === "progress" && e.progress === 3
            ? "completed"
            : e.kind === "progress"
              ? "progress_" + (e.progress ?? 0)
              : "normal",
    ),
    asset: e.asset,
    label: e.label,
    progress: e.progress,
  };
  const face = <Token token={token} size={126} />;
  return e.kind === "flip" && e.backAsset ? (
    <div className="flip-assembly">
      <div className="flip-front">{face}</div>
      <div className="flip-back">
        <Token token={sampleVisual("back", e.backAsset.slice(5))} size={126} />
      </div>
    </div>
  ) : (
    face
  );
}
export function FeedbackPanel({
  effects,
  onDone,
  toast = false,
}: {
  effects: Effect[];
  onDone: () => void;
  toast?: boolean;
}) {
  if (!effects.length) return null;
  return (
    <div
      className={"feedback-overlay" + (toast ? " toast-feedback" : "")}
      role={toast ? "status" : "dialog"}
      aria-modal={toast ? undefined : true}
      aria-label="操作反馈"
    >
      <p className="eyebrow">棋盘上的变化</p>
      <div className="feedback-list">
        {effects.map((e) => (
          <article
            key={e.id}
            className={"feedback-card fx-" + e.kind}
            data-effect={e.kind}
          >
            <div className="effect-art">
              <EffectArt effect={e} />
              {e.kind === "hook" && <span className="hook-chain" />}
            </div>
            <h2>{e.label}</h2>
            {e.kind === "progress" && (
              <div className="repair-meter">
                <i style={{ width: `${((e.progress ?? 0) / 3) * 100}%` }} />
              </div>
            )}
          </article>
        ))}
      </div>
      {!toast && (
        <button className="primary" data-testid="ack-feedback" onClick={onDone}>
          已查看变化，继续
        </button>
      )}
    </div>
  );
}
export function CompletedGenerators({ state }: { state: GameState }) {
  const tokens = boardVisuals(state).props.filter(
    (p) => p.location === "track",
  );
  return (
    !!tokens.length && (
      <div className="completed-tray" aria-label="已修好的发电机进度轨">
        {tokens.map((t) => (
          <Token key={t.id} token={t} size={38} />
        ))}
      </div>
    )
  );
}
