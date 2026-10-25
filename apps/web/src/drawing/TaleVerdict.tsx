import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  type GameView,
  type VerdictChoice,
  type AwardBallot,
} from "../../../../packages/drawing-party/src/index.ts";
import { Portrait } from "./StudioArt.tsx";
import { Thumb } from "./Results.tsx";
import { feel } from "./feel.ts";
export const verdictLabel = (v: VerdictChoice | undefined) =>
  v === "success"
    ? "成功"
    : v === "offtrack"
      ? "跑偏"
      : v === null
        ? "弃权"
        : "未投票";
export const outcomeLabel = (v?: string) =>
  v === "success" ? "传达成功" : v === "offtrack" ? "脑洞跑偏" : "意见不一";
export function PublicVoteRows({
  v,
  chain,
  awards = false,
}: {
  v: GameView;
  chain: number;
  awards?: boolean;
}) {
  const hasVerdict =
    v.verdictResults?.some((r) => r.chain === chain) ||
    (v.awardChain === chain && v.verdictVotes !== undefined);
  const hasAwards =
    v.awardResults?.some((r) => r.chain === chain && r.votes !== undefined) ||
    (v.awardChain === chain && v.awardVotes !== undefined);
  const verdict =
    v.verdictResults?.find((r) => r.chain === chain)?.votes ??
    (v.awardChain === chain ? v.verdictVotes : undefined) ??
    {};
  const ballots: Record<string, AwardBallot> =
    v.awardResults?.find((r) => r.chain === chain)?.votes ??
    (v.awardChain === chain ? v.awardVotes : undefined) ??
    {};
  const name = (id?: string | null) =>
    id === null
      ? "弃权"
      : id
        ? (v.players.find((p) => p.id === id)?.name ?? "未知玩家")
        : hasAwards
          ? "未投票"
          : "未记录";
  return (
    <div className="tp-public-list" role="table" aria-label="公开投票明细">
      <div role="row" className="tp-public-head">
        <b role="columnheader">玩家</b>
        <b role="columnheader">成功判断</b>
        {awards && (
          <>
            <b role="columnheader">MVP投给</b>
            <b role="columnheader">坑货投给</b>
          </>
        )}
      </div>
      {v.players.map((p, i) => (
        <div role="row" key={p.id}>
          <span role="cell">
            <Portrait index={i} tale />
            <b>{p.name}</b>
          </span>
          <span role="cell">
            {hasVerdict ? verdictLabel(verdict[p.id]) : "未记录"}
          </span>
          {awards && (
            <>
              <span role="cell">{name(ballots[p.id]?.mvp)}</span>
              <span role="cell">{name(ballots[p.id]?.dud)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
export function PublicBallots({ v, chain }: { v: GameView; chain: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="tp-ledger-toggle"
        onClick={() => {
          setOpen(true);
          feel("tap");
        }}
      >
        公开投票明细
      </button>
      {open &&
        createPortal(
          <div className="tp-ledger-shade" onClick={() => setOpen(false)}>
            <section
              className="tp-ledger-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="公开投票明细"
              onClick={(e) => e.stopPropagation()}
            >
              <header>
                <h2>这一本，大家怎么投</h2>
                <button
                  className="st-btn st-ghost"
                  onClick={() => setOpen(false)}
                  autoFocus
                >
                  关闭明细
                </button>
              </header>
              <PublicVoteRows v={v} chain={chain} awards />
              <p>投票公开 · 未提交者到时按弃权处理</p>
            </section>
          </div>,
          document.querySelector(".st-world")!,
        )}
    </>
  );
}
export function TaleVerdict({
  v,
  me,
  host,
  locked,
  onVote,
  onNext,
}: {
  v: GameView;
  me: string | null;
  host: boolean;
  locked: boolean;
  onVote: (a: any) => void;
  onNext: () => void;
}) {
  const chain = v.awardChain!,
    album = v.albums?.[chain],
    first = album?.entries[0],
    last = album?.entries.at(-1),
    done = !!me && Object.hasOwn(v.verdictVotes ?? {}, me),
    result = v.verdictResults?.find((r) => r.chain === chain);
  return (
    <div className="tp-verdict" aria-label="传达成功判断">
      <div className="tp-verdict-story">
        <span className="st-chip">{album?.owner.name}的传话本</span>
        <h1>
          {result ? outcomeLabel(result.outcome) : "这一题，传成功了吗？"}
        </h1>
        <div className="tp-before-after">
          <article>
            <small>最初的题目</small>
            <q>{first?.text}</q>
          </article>
          <b aria-hidden="true">→</b>
          <article>
            <small>最后的答案</small>
            {last?.kind === "drawing" ? (
              <Thumb drawing={last.drawing} />
            ) : (
              <q>{last?.text}</q>
            )}
          </article>
        </div>
        <details className="tp-story-recap">
          <summary>回看这一本的传递过程</summary>
          <div>
            {album?.entries.map((e, i) => (
              <article key={i}>
                <small>
                  第{i + 1}页 · {v.players.find((p) => p.id === e.author)?.name}
                </small>
                {e.kind === "drawing" ? (
                  <Thumb drawing={e.drawing} />
                ) : (
                  <p>{e.text}</p>
                )}
              </article>
            ))}
          </div>
        </details>
        {result ? (
          <>
            <p className="tp-verdict-tally">
              成功 {result.success} · 跑偏 {result.offtrack} · 弃权{" "}
              {result.abstain}
            </p>
            {host ? (
              <button
                className="st-btn st-primary"
                disabled={locked}
                onClick={onNext}
              >
                选 MVP 与坑货 →
              </button>
            ) : (
              <p className="st-pill">等房主开始奖项投票</p>
            )}
          </>
        ) : (
          <>
            <div className="tp-verdict-buttons">
              {(["success", "offtrack", null] as const).map((choice) => (
                <button
                  className="st-btn st-ghost"
                  key={String(choice)}
                  aria-pressed={done && v.verdictVotes?.[me!] === choice}
                  disabled={locked || done || !me}
                  onClick={() => {
                    feel("select");
                    onVote({ type: "VERDICT_VOTE", chain, choice });
                  }}
                >
                  {verdictLabel(choice)}
                </button>
              ))}
            </div>
            <p className="tp-verdict-note">
              {done ? "已投票，等大家选好" : "你觉得，最初的意思传到了吗？"}{" "}
              {v.completed}/{v.players.length}
            </p>
          </>
        )}
      </div>
      <aside className="tp-verdict-public">
        <h2>
          大家的选择 <small>公开投票</small>
        </h2>
        <PublicVoteRows v={v} chain={chain} />
      </aside>
    </div>
  );
}
