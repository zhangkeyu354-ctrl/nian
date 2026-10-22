import React, { useEffect, useMemo, useRef } from "react";
import {
  COLORS,
  type Drawing,
  type GameView,
} from "../../../../packages/drawing-party/src/index.ts";
import { Portrait } from "./StudioArt.tsx";
import { paint } from "./render.ts";
import { feel } from "./feel.ts";

export function Thumb({ drawing, className }: { drawing?: Drawing; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !drawing) return;
    c.width = 640;
    c.height = 320;
    paint(c, drawing);
  }, [drawing]);
  return <canvas ref={ref} className={"rs-thumb " + (className ?? "")} aria-hidden="true" />;
}

function Confetti({ count = 36, palette }: { count?: number; palette: string[] }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 90) / 100,
        dur: 2.2 + ((i * 29) % 12) / 10,
        rot: (i * 47) % 360,
        drift: ((i * 31) % 40) - 20,
        color: palette[i % palette.length],
        shape: i % 3,
      })),
    [count],
  );
  return (
    <div className="rs-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          className={"s" + b.shape}
          style={
            {
              left: b.left + "%",
              background: b.color,
              animationDelay: 2.1 + b.delay + "s",
              animationDuration: b.dur + "s",
              "--rot": b.rot + "deg",
              "--drift": b.drift + "vw",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 纽约伪画家结算：揭晓伪画家 → 判定胜负 → 题目、猜题、投票明细。 */
export function FakeResult(p: {
  v: GameView;
  me: string | null;
  host: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  const { v, me } = p;
  const fakeIndex = v.players.findIndex((x) => x.id === v.fakeId),
    fake = v.players[fakeIndex];
  const fakeWins = v.winner === "fake";
  const iAmFake = me === v.fakeId;
  const iWin = iAmFake === fakeWins;
  const caught = !!v.guess || v.phase === "RESULT" && !fakeWins;
  const guessedRight = !!v.guess && v.guess === v.word;
  const reason = fakeWins
    ? v.guess
      ? `被抓到了，却猜中了题目「${v.word}」，完美翻盘！`
      : "没有被大家识破，成功蒙混过关。"
    : v.guess
      ? `被识破，还猜错了题目（猜的是「${v.guess}」）。`
      : "被大家识破，也没能说出题目。";
  const tally = useMemo(() => {
    const t = v.players.map((x, i) => ({
      player: x,
      index: i,
      voters: v.players
        .map((y, j) => ({ y, j }))
        .filter(({ y }) => v.votes?.[y.id] === x.id),
    }));
    return t.sort((a, b) => b.voters.length - a.voters.length);
  }, [v.players, v.votes]);
  const maxVotes = Math.max(1, ...tally.map((t) => t.voters.length));
  useEffect(() => {
    const a = setTimeout(() => feel("stamp"), 1250);
    const b = setTimeout(() => feel(iWin ? "win" : "lose"), 2100);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div
      className={"rs-stage rs-fa " + (fakeWins ? "is-fake-win" : "is-artist-win")}
      role="dialog"
      aria-label="本局结算"
    >
      <div className="rs-curtain" aria-hidden="true">
        <i className="rs-spot" />
      </div>
      {iWin && (
        <Confetti
          palette={
            fakeWins
              ? ["#ffd84a", "#fff3b0", "#c99a2e", "#ffffff"]
              : ["#ffd84a", "#ff6f9c", "#5fd1c1", "#8fb4ff", "#ffffff"]
          }
        />
      )}
      <p className="rs-drum">
        伪画家是<span>.</span>
        <span>.</span>
        <span>.</span>
      </p>
      <div className="rs-layout">
        <div className="rs-reveal">
          <div
            className="rs-suspect"
            style={{ "--seat": COLORS[fakeIndex % COLORS.length] } as React.CSSProperties}
          >
            <div className="rs-suspect-face">
              <Portrait index={fakeIndex} />
            </div>
            <b>{fake?.name}</b>
            <span className="rs-tag">伪画家{iAmFake ? " · 你" : ""}</span>
          </div>
          <div className="rs-verdict">
            <small>{fakeWins ? "FAKE ARTIST WINS" : "REAL ARTISTS WIN"}</small>
            <h1>{fakeWins ? "伪画家胜利" : "真画家胜利"}</h1>
            <p>{reason}</p>
            <span className={"rs-me " + (iWin ? "is-win" : "is-lose")}>
              {iWin ? "你赢了" : "你输了"}
            </span>
          </div>
        </div>
        <div className="rs-details">
          <div className="rs-artwork">
            <Thumb drawing={v.drawing} />
            <div className="rs-answer">
              <small>题目 · {v.category}</small>
              <b>{v.word}</b>
              {caught && (
                <span className={"rs-guess " + (guessedRight ? "is-right" : "is-wrong")}>
                  {v.guess
                    ? (guessedRight ? "✓ 卧底猜中：" : "✗ 卧底猜了：") + v.guess
                    : "✗ 卧底没有作答"}
                </span>
              )}
            </div>
          </div>
          <div className="rs-votes">
            <h2>投票结果</h2>
            <ul>
              {tally.map((t, k) => (
                <li
                  key={t.player.id}
                  className={t.player.id === v.fakeId ? "is-fake" : ""}
                  style={{ "--k": k } as React.CSSProperties}
                >
                  <Portrait index={t.index} />
                  <span className="rs-vname">
                    {t.player.name}
                    {t.player.id === v.fakeId && <em>伪画家</em>}
                  </span>
                  <span className="rs-bar">
                    <i
                      style={{
                        width: (100 * t.voters.length) / maxVotes + "%",
                        background: COLORS[t.index % COLORS.length],
                      }}
                    />
                  </span>
                  <span className="rs-voters">
                    {t.voters.map(({ y, j }) => (
                      <span key={y.id} title={y.name}>
                        <Portrait index={j} />
                      </span>
                    ))}
                    <b>{t.voters.length}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rs-actions">
            <button className="st-btn st-ghost" onClick={p.onClose}>
              看看画作
            </button>
            {p.host ? (
              <button className="st-btn st-gold" onClick={p.onRestart}>
                再来一局 →
              </button>
            ) : (
              <p className="st-pill is-soft">等房主开始下一局</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 传情画意结算：每本传话本从第一句到最后一页的跑偏对比。 */
export function TaleResult(p: {
  v: GameView;
  host: boolean;
  onRestart: () => void;
  onOpen: (i: number) => void;
  onClose: () => void;
  exportAlbum: (a: any) => void;
}) {
  const { v } = p;
  const albums = v.albums ?? [];
  useEffect(() => {
    const t = setTimeout(() => feel("win"), 500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="rs-stage rs-tp" role="dialog" aria-label="本局结算">
      <div className="rs-curtain" aria-hidden="true">
        <i className="rs-spot" />
      </div>
      <Confetti count={28} palette={["#83ffe3", "#c8a9ff", "#ffd36b", "#ff8fb1", "#ffffff"]} />
      <header className="rs-tp-head">
        <small>THE END</small>
        <h1>传话本全部翻完</h1>
        <p>从第一句话到最后一页，看看跑偏了多远</p>
      </header>
      <div className="rs-books">
        {albums.map((a, i) => {
          const firstE = a.entries[0],
            lastE = a.entries[a.entries.length - 1],
            owner = v.players.findIndex((x) => x.id === a.owner.id);
          return (
            <article
              className="rs-book"
              key={a.owner.id}
              style={
                { "--k": i, "--seat": COLORS[owner % COLORS.length] } as React.CSSProperties
              }
            >
              <header>
                <Portrait index={owner} />
                <b>{a.owner.name}的传话本</b>
                <small>{Math.max(0, a.entries.length - 1)} 次传递</small>
              </header>
              <div className="rs-chain">
                <div className="rs-chain-start">
                  <small>起点</small>
                  <q>{firstE?.text ?? "…"}</q>
                </div>
                <i className="rs-arrow" aria-hidden="true" />
                <div className="rs-chain-end">
                  <small>终点</small>
                  {lastE?.kind === "drawing" ? (
                    <Thumb drawing={lastE.drawing} />
                  ) : (
                    <q>{lastE?.text ?? "…"}</q>
                  )}
                </div>
              </div>
              <footer>
                <button className="st-btn st-ghost" onClick={() => p.onOpen(i)}>
                  翻看这本
                </button>
                {a.entries.length === v.steps + 1 && (
                  <button
                    className="st-btn st-ghost"
                    aria-label={"保存" + a.owner.name + "的传话链"}
                    onClick={() => p.exportAlbum(a)}
                  >
                    保存 ↓
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      <div className="rs-actions">
        <button className="st-btn st-ghost" onClick={p.onClose}>
          回到相册
        </button>
        {p.host ? (
          <button className="st-btn st-primary" onClick={p.onRestart}>
            再来一局 →
          </button>
        ) : (
          <p className="st-pill is-soft">等房主开始下一局</p>
        )}
      </div>
    </div>
  );
}
