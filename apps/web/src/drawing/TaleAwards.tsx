import React, { useEffect, useState } from "react";
import {
  type GameView,
  type AwardResult,
} from "../../../../packages/drawing-party/src/index.ts";
import { Portrait, AwardIcon } from "./StudioArt.tsx";
import { PublicBallots } from "./TaleVerdict.tsx";
import { feel } from "./feel.ts";
export function AwardWinners({
  v,
  result,
  all = false,
}: {
  v: GameView;
  result?: AwardResult;
  all?: boolean;
}) {
  return (
    <div className={"tp-award-winners " + (all ? "is-total" : "")}>
      {(["mvp", "dud"] as const).map((kind) => (
        <section key={kind} className={"tp-prize is-" + kind}>
          <h3>
            <AwardIcon kind={kind} />
            {all
              ? kind === "mvp"
                ? "全场 MVP"
                : "全场最佳坑货"
              : kind === "mvp"
                ? "本轮 MVP"
                : "本轮坑货"}
          </h3>
          <div className="tp-prize-people">
            {!result?.[(kind + "Winners") as "mvpWinners" | "dudWinners"]
              .length ? (
              <span>无人获票</span>
            ) : (
              result[(kind + "Winners") as "mvpWinners" | "dudWinners"].map(
                (id) => {
                  const i = v.players.findIndex((p) => p.id === id);
                  return (
                    <div key={id}>
                      <div className="tp-prize-portrait">
                        <Portrait index={i} tale />
                        <b>
                          {kind === "mvp" ? <AwardIcon kind="mvp" /> : "坑"}
                        </b>
                      </div>
                      <strong>{v.players[i]?.name}</strong>
                      <small>{result[kind][id]} 票</small>
                    </div>
                  );
                },
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
export function TaleAwards({
  v,
  me,
  locked,
  host,
  onVote,
  onNext,
}: {
  v: GameView;
  me: string | null;
  locked: boolean;
  host: boolean;
  onVote: (a: any) => void;
  onNext: () => void;
}) {
  const [announced, setAnnounced] = useState(false);
  const [mvp, setMvp] = useState<string | null | undefined>(),
    [dud, setDud] = useState<string | null | undefined>();
  useEffect(() => {
    setMvp(undefined);
    setDud(undefined);
  }, [v.awardChain]);
  useEffect(() => {
    if (v.phase === "AWARD_RESULT") {
      setAnnounced(false);
      const ready = setTimeout(() => setAnnounced(true), 1500);
      feel("win");
      const t = setTimeout(() => feel("lose"), 500);
      return () => {
        clearTimeout(t);
        clearTimeout(ready);
      };
    }
  }, [v.phase, v.awardChain]);
  if (v.phase === "AWARD_RESULT")
    return (
      <div className="tp-award-panel is-announced" aria-label="本轮奖项公布">
        <AwardWinners
          v={v}
          result={v.awardResults?.find((r) => r.chain === v.awardChain)}
        />
        <div className="tp-award-next">
          <PublicBallots v={v} chain={v.awardChain!} />
          {host ? (
            <button
              className="st-btn st-primary tp-next-book"
              onClick={onNext}
              disabled={locked || !announced}
            >
              {v.awardChain === v.players.length - 1
                ? "查看全场结算 →"
                : "翻开下一本 →"}
            </button>
          ) : (
            <p className="st-pill">等房主翻开下一本</p>
          )}
        </div>
      </div>
    );
  const submitted = !!v.myAwardVote;
  return (
    <section className="tp-award-panel" aria-label="本轮奖项投票">
      {(["mvp", "dud"] as const).map((kind) => {
        const value = submitted
          ? v.myAwardVote![kind]
          : kind === "mvp"
            ? mvp
            : dud;
        return (
          <div
            className="tp-award-row"
            key={kind}
            role="group"
            aria-label={kind === "mvp" ? "本轮 MVP" : "本轮坑货"}
          >
            <b>
              <AwardIcon kind={kind} />
              {kind === "mvp" ? "MVP" : "坑货"}
            </b>
            <div className="tp-award-candidates">
              {v.awardCandidates
                ?.filter((id) => id !== me)
                .map((id) => {
                  const i = v.players.findIndex((p) => p.id === id);
                  return (
                    <button
                      key={id}
                      aria-label={
                        (kind === "mvp" ? "MVP：" : "坑货：") +
                        v.players[i].name
                      }
                      aria-pressed={value === id}
                      disabled={locked || submitted || !me}
                      onClick={() => {
                        feel("select");
                        (kind === "mvp" ? setMvp : setDud)(id);
                      }}
                    >
                      <Portrait index={i} tale />
                      <span>{v.players[i].name}</span>
                    </button>
                  );
                })}
            </div>
            <button
              className="st-btn st-ghost tp-abstain"
              aria-pressed={value === null}
              disabled={locked || submitted || !me}
              onClick={() => {
                feel("select");
                (kind === "mvp" ? setMvp : setDud)(null);
              }}
            >
              弃权
            </button>
          </div>
        );
      })}
      <footer>
        <span>
          <small>
            已投 {v.completed}/{v.players.length}
          </small>
          <PublicBallots v={v} chain={v.awardChain!} />
        </span>
        <button
          className="st-btn st-primary"
          disabled={
            locked || submitted || !me || mvp === undefined || dud === undefined
          }
          onClick={() => {
            feel("stamp");
            onVote({ type: "AWARD_VOTE", chain: v.awardChain, mvp, dud });
          }}
        >
          {submitted ? "已投票 ✓" : "确认投票"}
        </button>
      </footer>
    </section>
  );
}
