import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CNView } from "../../../../packages/codenames/src/privacy.ts";
import type { ClueNumber, Team, CNTurnLog } from "../../../../packages/codenames/src/types.ts";
import type {
  CNClientCommand,
  CNLobbyAction,
  CNRoomSnapshot,
} from "../../../../packages/shared/src/cn-protocol.ts";
import { createCNRoom, savedName, useCNRoom } from "./cn-net.ts";
import "./cn.css";

const TEAM_NAME: Record<Team, string> = { red: "红队", blue: "蓝队" };
const other = (t: Team): Team => (t === "red" ? "blue" : "red");
const numText = (n: ClueNumber) => (n === "inf" ? "∞" : String(n));

const roomFromUrl = () => new URLSearchParams(location.search).get("room")?.toUpperCase() ?? null;
const goRoom = (code: string) => {
  history.pushState(null, "", `/?game=cn&room=${code}`);
  dispatchEvent(new PopStateEvent("popstate"));
};

export function Codenames() {
  const [room, setRoom] = useState(roomFromUrl);
  useEffect(() => {
    document.title = "行动代号 · 桌游合集";
    const on = () => setRoom(roomFromUrl());
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return <div className="cn-app">{room ? <Room code={room} /> : <Home />}</div>;
}

function Masthead({ small }: { small?: boolean }) {
  return (
    <header className={"cn-mast" + (small ? " small" : "")}>
      <a className="cn-back" href="/">
        ← 桌游合集
      </a>
      <h1>
        行动代号<small>中文原创词库</small>
      </h1>
      {!small && (
        <p>
          红蓝两队，各有一名队长知道 25 个词里哪些是自己人。队长只能说一个词加一个数字，队友猜词——小心踩中刺客。
        </p>
      )}
    </header>
  );
}

function Home() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="cn-home">
      <Masthead />
      <section className="cn-panel">
        <h2>开一局</h2>
        <p className="cn-muted">4 人起：每队 1 名队长 + 至少 1 名猜词队员。大家开语音讨论，网页负责计时和翻牌。</p>
        {error && (
          <p className="cn-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="cn-go"
          data-testid="cn-create"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await createCNRoom();
            setBusy(false);
            if (!res.ok) return setError(res.error);
            goRoom(res.code);
          }}
        >
          创建房间
        </button>
      </section>
      <section className="cn-panel">
        <h2>加入朋友的房间</h2>
        <form
          className="cn-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 4) goRoom(code.trim().toUpperCase());
          }}
        >
          <input
            aria-label="房间号"
            placeholder="4 位房间号"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit">加入</button>
        </form>
      </section>
    </main>
  );
}

function useShareUrl(code: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const path = `/?game=cn&room=${code}`;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    fetch("/api/info")
      .then((r) => r.json())
      .then((info: { port: number; lan: string[]; publicUrl?: string | null }) =>
        setUrl(
          info.publicUrl
            ? info.publicUrl + path
            : local && info.lan[0]
              ? `http://${info.lan[0]}:${info.port}${path}`
              : location.origin + path,
        ),
      )
      .catch(() => setUrl(location.origin + path));
  }, [code]);
  return url;
}

type Net = ReturnType<typeof useCNRoom>;

function Room({ code }: { code: string }) {
  const net = useCNRoom(code);
  const snap = net.snap;
  if (!snap)
    return (
      <main className="cn-home">
        <Masthead small />
        <section className="cn-panel">
          {net.error ? (
            <>
              <p className="cn-error" role="alert">
                {net.error}
              </p>
              <a href="/?game=cn">返回</a>
            </>
          ) : (
            <p>正在连接房间 {code}…</p>
          )}
        </section>
      </main>
    );
  return (
    <>
      {!net.connected && <p className="cn-offline">连接中断，正在重新连接…</p>}
      {snap.stage === "game" && snap.view ? (
        <Game snap={snap} view={snap.view} net={net} />
      ) : (
        <Lobby snap={snap} net={net} />
      )}
    </>
  );
}

function JoinForm({ claim }: { claim: Net["claim"] }) {
  const [name, setName] = useState(savedName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="cn-panel cn-claim"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await claim(name);
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <h2>输入你的昵称</h2>
      {error && (
        <p className="cn-error" role="alert">
          {error}
        </p>
      )}
      <input
        aria-label="昵称"
        data-testid="cn-name"
        placeholder="昵称"
        maxLength={12}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="cn-go" type="submit" disabled={busy || !name.trim()} data-testid="cn-claim">
        加入房间
      </button>
    </form>
  );
}

/** 按钮：提交期间禁用，出错时在按钮下方显示原因 */
function useAct<T>(fn: (a: T) => Promise<string | null>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (a: T) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const err = await fn(a);
    setBusy(false);
    if (err) setError(err);
  };
  return { busy, error, run, clear: () => setError("") };
}

function Lobby({ snap, net }: { snap: CNRoomSnapshot; net: Net }) {
  const url = useShareUrl(snap.code);
  const act = useAct((a: CNLobbyAction) => net.lobby(a));
  const me = snap.players.find((p) => p.playerId === snap.mySeat) ?? null;
  const host = !!me?.host;
  const team = (t: Team) => snap.players.filter((p) => p.team === t);
  const watchers = snap.players.filter((p) => !p.team);
  const pick = snap.captainMode === "pick";
  const why =
    team("red").length < 2 || team("blue").length < 2
      ? "每队至少 2 人"
      : pick && (!team("red").some((p) => p.captain) || !team("blue").some((p) => p.captain))
        ? "两队都需要有人报名当队长"
        : "";
  const [copied, setCopied] = useState(false);
  return (
    <main className="cn-home cn-lobby">
      <Masthead small />
      <section className="cn-panel cn-invite">
        <div>
          <p className="cn-muted">房间号</p>
          <p className="cn-code" data-testid="cn-code">
            {snap.code}
          </p>
          {snap.round > 0 && <p className="cn-muted">已经玩了 {snap.round} 局</p>}
          {url && (
            <button
              className="cn-link"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "已复制邀请链接" : "复制邀请链接"}
            </button>
          )}
        </div>
        {url && <img src={`/api/qr?text=${encodeURIComponent(url)}`} alt="扫码加入房间" width={132} height={132} />}
      </section>

      {!me ? (
        <JoinForm claim={net.claim} />
      ) : (
        <>
          <section className="cn-panel">
            <h2>队长怎么定</h2>
            <div className="cn-seg" role="radiogroup" aria-label="队长分配方式">
              {(["random", "pick"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={snap.captainMode === m}
                  className={snap.captainMode === m ? "on" : ""}
                  disabled={!host || act.busy}
                  data-testid={"cn-mode-" + m}
                  onClick={() => act.run({ type: "SET_MODE", mode: m })}
                >
                  {m === "random" ? "随机队长" : "自选队长"}
                </button>
              ))}
            </div>
            <p className="cn-muted">
              {pick
                ? "每队自己报名一名队长，两队都有队长才能开始。"
                : "开局时每队随机抽一名队长。整局不变，下一局重新抽。"}
              {!host && "（房主可以切换）"}
            </p>
          </section>

          <section className="cn-teams">
            {(["red", "blue"] as Team[]).map((t) => (
              <div key={t} className={"cn-teamcol team-" + t} data-testid={"cn-team-" + t}>
                <h2>
                  {TEAM_NAME[t]} <small>{team(t).length} 人</small>
                </h2>
                <ul>
                  {team(t).map((p) => (
                    <li key={p.playerId} className={p.connected ? "" : "off"}>
                      <span className="cn-pname">
                        {p.captain && <b className="cn-capbadge">队长</b>}
                        {p.name}
                        {p.host && " 👑"}
                        {p.playerId === snap.mySeat && <em>（我）</em>}
                        {!p.connected && <em>离线</em>}
                      </span>
                      {host && p.playerId !== snap.mySeat && (
                        <button
                          className="cn-mini"
                          disabled={act.busy}
                          onClick={() => act.run({ type: "MOVE", playerId: p.playerId, team: other(t) })}
                        >
                          换到{TEAM_NAME[other(t)]}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {me.team !== t ? (
                  <button
                    className="cn-teambtn"
                    disabled={act.busy}
                    data-testid={"cn-join-" + t}
                    onClick={() => act.run({ type: "JOIN_TEAM", team: t })}
                  >
                    加入{TEAM_NAME[t]}
                  </button>
                ) : pick ? (
                  me.captain ? (
                    <button className="cn-teambtn ghost" disabled={act.busy} onClick={() => act.run({ type: "RELEASE_CAPTAIN" })}>
                      不当队长了
                    </button>
                  ) : (
                    !team(t).some((p) => p.captain) && (
                      <button
                        className="cn-teambtn"
                        disabled={act.busy}
                        data-testid={"cn-captain-" + t}
                        onClick={() => act.run({ type: "CLAIM_CAPTAIN" })}
                      >
                        我来当队长
                      </button>
                    )
                  )
                ) : null}
              </div>
            ))}
          </section>

          <section className="cn-panel">
            <h2>观战 / 还没选队</h2>
            <p className="cn-watchers">{watchers.length ? watchers.map((p) => p.name).join("、") : "没有"}</p>
            {me.team && (
              <button className="cn-mini" disabled={act.busy} onClick={() => act.run({ type: "JOIN_TEAM", team: null })}>
                我先观战
              </button>
            )}
          </section>

          {act.error && (
            <p className="cn-error" role="alert">
              {act.error}
            </p>
          )}
          {host ? (
            <div className="cn-hostbar">
              <button className="cn-mini" disabled={act.busy} data-testid="cn-shuffle" onClick={() => act.run({ type: "SHUFFLE" })}>
                随机分队
              </button>
              <button
                className="cn-go"
                disabled={act.busy || !!why}
                data-testid="cn-start"
                onClick={() => act.run({ type: "START" })}
              >
                {why ? `开始（${why}）` : "开始游戏"}
              </button>
            </div>
          ) : (
            <p className="cn-muted cn-center">等房主开始游戏…</p>
          )}
        </>
      )}
    </main>
  );
}

/** 每 200ms 刷新一次的服务器时间 */
function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 200);
    setNow(Date.now() + offset);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

function Game({ snap, view, net }: { snap: CNRoomSnapshot; view: CNView; net: Net }) {
  const me = snap.mySeat;
  const name = (id: string) => snap.players.find((p) => p.playerId === id)?.name ?? "?";
  const myTeam = view.players.find((p) => p.id === me)?.team ?? null;
  const amCaptain = !!me && (view.captains.red === me || view.captains.blue === me);
  const over = view.phase === "over";
  const myTurn = !over && myTeam === view.turn;
  const guessing = myTurn && view.phase === "guess" && !amCaptain;
  const amOperator = guessing && view.operators[view.turn] === me;
  const giving = myTurn && view.phase === "clue" && amCaptain;
  const now = useServerNow(net.offset);
  const left = Math.max(0, view.deadline - now);
  const total = view.phase === "clue" ? view.timing.clueMs : view.timing.guessMs;
  const cmd = useAct((c: CNClientCommand) => net.send(c));
  const [selected, setSelected] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<"" | "log" | "players">("");
  // 剩余 = 总数（先手 9、后手 8）− 已翻开；队员也能这样算，不泄露秘密
  const leftOf = (t: Team) =>
    (t === view.first ? 9 : 8) - view.cards.filter((c) => c.revealed && c.role === t).length;
  const turnLog = view.log[view.log.length - 1];
  const clue = turnLog?.clue ?? null;
  const guessesLeft = view.limit === null ? null : view.limit - view.guessesMade;

  useEffect(() => {
    if (selected !== null && view.cards[selected]?.revealed) setSelected(null);
  }, [view, selected]);
  useEffect(() => {
    if (!guessing) setSelected(null);
  }, [guessing]);
  // 轮到自己时震动提醒
  const prevKey = useRef("");
  useEffect(() => {
    const key = view.turn + view.phase;
    if (prevKey.current && prevKey.current !== key && (giving || guessing)) navigator.vibrate?.(120);
    prevKey.current = key;
  }, [view.turn, view.phase, giving, guessing]);

  const status = over
    ? view.endReason === "assassin"
      ? `${TEAM_NAME[other(view.winner!)]}踩中刺客 · ${TEAM_NAME[view.winner!]}获胜`
      : `${TEAM_NAME[view.winner!]}获胜`
    : `${TEAM_NAME[view.turn]} · ${view.phase === "clue" ? "队长出线索" : "猜词"}`;
  const roleText = amCaptain
    ? `你是${TEAM_NAME[myTeam!]}队长：只有你看得到颜色，不要用表情和语气提示！`
    : myTeam
      ? `你是${TEAM_NAME[myTeam]}猜词队员${view.operators[myTeam] === me ? "（负责确认翻牌）" : ""}`
      : "你在观战";

  return (
    <main className={`cn-game turn-${over ? view.winner : view.turn}${over ? " over" : ""}`} data-testid="cn-game">
      <header className="cn-status">
        <a className="cn-back" href="/" aria-label="返回桌游合集">
          ←
        </a>
        <div className="cn-status-main">
          <strong data-testid="cn-status">{status}</strong>
          {!over && (
            <span className={"cn-timer" + (left <= 10_000 ? " hurry" : "")} data-testid="cn-timer">
              {Math.ceil(left / 1000)}
            </span>
          )}
        </div>
        {!over && (
          <div className="cn-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (left / Math.max(total, left)) * 100)}%` }} />
          </div>
        )}
      </header>

      <section className="cn-score">
        {(["red", "blue"] as Team[]).map((t) => (
          <div key={t} className={"cn-sc team-" + t + (view.turn === t && !over ? " active" : "")} data-testid={"cn-left-" + t}>
            <span className="cn-sc-name">{TEAM_NAME[t]}</span>
            <span className="cn-sc-num">{leftOf(t)}</span>
            <span className="cn-sc-sub">张没找到</span>
            <span className={"cn-sc-extra" + (view.extraUsed[t] ? " used" : "")}>
              {view.extraUsed[t] ? "加时已用" : "⏱ 加时可用"}
            </span>
          </div>
        ))}
      </section>

      <p className={"cn-role" + (amCaptain ? " captain" : "")} data-testid="cn-role">
        {roleText}
      </p>

      <section className="cn-clue" aria-live="polite">
        {clue ? (
          <>
            <span className="cn-clue-word" data-testid="cn-clue">
              {clue.word}
            </span>
            <span className="cn-clue-num">{numText(clue.number)}</span>
            <span className="cn-clue-left" data-testid="cn-guesses-left">
              {over ? "" : guessesLeft === null ? "不限次数" : `还能翻 ${guessesLeft} 张`}
            </span>
          </>
        ) : over ? (
          <span className="cn-muted">本局结束，所有身份已公开</span>
        ) : (
          <span className="cn-muted">等 {name(view.captains[view.turn])} 出线索…</span>
        )}
      </section>

      <Board
        view={view}
        me={me}
        amCaptain={amCaptain}
        canMark={guessing}
        selected={selected}
        name={name}
        onTap={(i) => {
          if (!guessing || view.cards[i].revealed) return;
          const mine = (view.marks[i] ?? []).includes(me!);
          if (mine && selected === i) {
            // 再点一次已选中的牌：取消标记
            setSelected(null);
            void cmd.run({ type: "MARK", index: i });
          } else {
            setSelected(i);
            if (!mine) void cmd.run({ type: "MARK", index: i });
          }
        }}
      />

      {cmd.error && (
        <p className="cn-error cn-toast" role="alert" onClick={cmd.clear}>
          {cmd.error}
        </p>
      )}

      <footer className="cn-dock">
        {giving && <ClueInput view={view} busy={cmd.busy} submit={(word, number) => cmd.run({ type: "GIVE_CLUE", word, number })} />}
        {guessing && (
          <GuessDock
            view={view}
            me={me!}
            name={name}
            amOperator={amOperator}
            selected={selected}
            busy={cmd.busy}
            run={cmd.run}
          />
        )}
        {!over && !giving && !guessing && (
          <p className="cn-wait">
            {view.phase === "clue"
              ? amCaptain
                ? `等对方队长 ${name(view.captains[view.turn])} 出线索`
                : `等 ${name(view.captains[view.turn])}（${TEAM_NAME[view.turn]}队长）出线索`
              : amCaptain && myTeam === view.turn
                ? "队友正在猜词——保持安静，不要给任何反应"
                : `${TEAM_NAME[view.turn]}正在猜词，操作员：${name(view.operators[view.turn])}`}
          </p>
        )}
        {over && <Result snap={snap} view={view} net={net} />}
        <nav className="cn-tabs">
          <button className={drawer === "log" ? "on" : ""} onClick={() => setDrawer(drawer === "log" ? "" : "log")}>
            线索记录
          </button>
          <button className={drawer === "players" ? "on" : ""} onClick={() => setDrawer(drawer === "players" ? "" : "players")}>
            玩家
          </button>
        </nav>
        {drawer === "log" && <Log view={view} name={name} />}
        {drawer === "players" && <Players snap={snap} view={view} />}
      </footer>
      <ClueFlash view={view} />
    </main>
  );
}

function Board(props: {
  view: CNView;
  me: string | null;
  amCaptain: boolean;
  canMark: boolean;
  selected: number | null;
  name: (id: string) => string;
  onTap: (i: number) => void;
}) {
  const { view } = props;
  const over = view.phase === "over";
  const last = useMemo(() => {
    const r = view.log.flatMap((l) => l.reveals);
    return r.length ? r[r.length - 1].index : -1;
  }, [view.log]);
  return (
    <section className={"cn-board" + (props.amCaptain ? " captain" : "")} data-testid="cn-board">
      {view.cards.map((c, i) => {
        const marks = view.marks[i] ?? [];
        const cls = [
          "cn-card",
          c.revealed ? "revealed" : "",
          c.role ? "role-" + c.role : "",
          !c.revealed && c.role && !over ? "secret" : "",
          over && !c.revealed ? "unguessed" : "",
          props.selected === i ? "selected" : "",
          marks.includes(props.me ?? "") ? "mine" : "",
          i === last ? "last" : "",
          props.canMark && !c.revealed ? "tappable" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={i}
            className={cls}
            data-testid={"cn-card-" + i}
            data-word={c.word}
            data-role={c.role ?? ""}
            data-revealed={c.revealed ? "1" : "0"}
            disabled={!props.canMark || c.revealed}
            onClick={() => props.onTap(i)}
            aria-label={c.word + (c.revealed ? "（已翻开）" : "") + (marks.length ? `，${marks.length} 人标记` : "")}
          >
            <span className="cn-word">{c.word}</span>
            {c.role === "assassin" && !c.revealed && <span className="cn-skull" aria-hidden="true" />}
            {marks.length > 0 && (
              <span className="cn-marks" title={marks.map(props.name).join("、")}>
                {marks.length}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}

const NUMBERS: ClueNumber[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, "inf"];
function ClueInput({ view, busy, submit }: { view: CNView; busy: boolean; submit: (w: string, n: ClueNumber) => void }) {
  const [word, setWord] = useState("");
  const [num, setNum] = useState<ClueNumber | null>(null);
  // 本地预检（服务器还会再检查一次）
  const clash = view.cards.find((c) => !c.revealed && word.trim() && word.trim().toLowerCase().includes(c.word.toLowerCase()));
  const hint = clash
    ? `不能用桌面上的「${clash.word}」`
    : /\s/.test(word.trim())
      ? "只能一个词，不能有空格"
      : num === null
        ? "再选一个数字"
        : "";
  return (
    <form
      className="cn-clueform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!hint && word.trim() && num !== null) submit(word.trim(), num);
      }}
    >
      <label className="cn-cluelabel">
        <span>你的线索（一个词）</span>
        <input
          data-testid="cn-clue-input"
          value={word}
          maxLength={12}
          placeholder="例如：水果"
          enterKeyHint="done"
          autoComplete="off"
          onChange={(e) => setWord(e.target.value)}
        />
      </label>
      <div className="cn-nums" role="radiogroup" aria-label="数字">
        {NUMBERS.map((n) => (
          <button
            type="button"
            key={String(n)}
            role="radio"
            aria-checked={num === n}
            className={num === n ? "on" : ""}
            data-testid={"cn-num-" + n}
            onClick={() => setNum(n)}
          >
            {numText(n)}
          </button>
        ))}
      </div>
      <p className="cn-numhelp">
        {num === 0
          ? "0：表示没有本队词和它相关，队友可以不限次数猜"
          : num === "inf"
            ? "∞：队友可以不限次数猜（适合补猜以前的词）"
            : num !== null
              ? `队友本回合最多可以翻 ${num + 1} 张`
              : "数字 = 这个线索关联几个本队词"}
      </p>
      <button className="cn-go" type="submit" disabled={busy || !!hint || !word.trim()} data-testid="cn-send-clue">
        {hint || "发出线索（发出后不能修改）"}
      </button>
    </form>
  );
}

function GuessDock(props: {
  view: CNView;
  me: string;
  name: (id: string) => string;
  amOperator: boolean;
  selected: number | null;
  busy: boolean;
  run: (c: CNClientCommand) => void;
}) {
  const { view } = props;
  const [confirmExtra, setConfirmExtra] = useState(false);
  useEffect(() => {
    if (!confirmExtra) return;
    const id = setTimeout(() => setConfirmExtra(false), 3500);
    return () => clearTimeout(id);
  }, [confirmExtra]);
  const sel = props.selected !== null ? view.cards[props.selected] : null;
  const extraUsed = view.extraUsed[view.turn];
  return (
    <div className="cn-guessdock">
      {props.amOperator ? (
        <button
          className="cn-go cn-reveal"
          disabled={props.busy || !sel}
          data-testid="cn-reveal"
          onClick={() => props.selected !== null && props.run({ type: "REVEAL", index: props.selected })}
        >
          {sel ? `确认翻开「${sel.word}」` : "先点一张牌，再在这里确认翻开"}
        </button>
      ) : (
        <div className="cn-notop">
          <p>
            点牌只是标记给队友看。翻牌由 <b>{props.name(view.operators[view.turn])}</b> 确认。
          </p>
          <button className="cn-mini" disabled={props.busy} data-testid="cn-take-op" onClick={() => props.run({ type: "TAKE_OPERATOR" })}>
            我来翻牌
          </button>
        </div>
      )}
      <div className="cn-row">
        {props.amOperator && (
          <button
            className="cn-mini"
            disabled={props.busy || view.guessesMade < 1}
            data-testid="cn-end-turn"
            title={view.guessesMade < 1 ? "至少先翻开一张牌" : ""}
            onClick={() => props.run({ type: "END_GUESSING" })}
          >
            {view.guessesMade < 1 ? "结束猜词（至少先翻一张）" : "结束猜词"}
          </button>
        )}
        <button
          className={"cn-mini cn-extra" + (confirmExtra ? " confirm" : "")}
          disabled={props.busy || extraUsed}
          data-testid="cn-extra"
          onClick={() => {
            if (!confirmExtra) return setConfirmExtra(true);
            setConfirmExtra(false);
            props.run({ type: "EXTRA_TIME" });
          }}
        >
          {extraUsed ? "本队加时已用" : confirmExtra ? "确定？本局只有一次" : "⏱ +30 秒"}
        </button>
      </div>
    </div>
  );
}

const END_TEXT: Record<string, string> = {
  wrong: "翻错，换边",
  limit: "次数用完",
  stop: "主动结束",
  "clue-timeout": "队长超时",
  "guess-timeout": "猜词超时",
  assassin: "踩中刺客",
  win: "获胜",
};
function Log({ view, name }: { view: CNView; name: (id: string) => string }) {
  const rows = view.log.filter((l) => l.clue || l.end);
  return (
    <ol className="cn-log" data-testid="cn-log">
      {rows.length === 0 && <li className="cn-muted">还没有线索</li>}
      {rows.map((l: CNTurnLog, i) => (
        <li key={i} className={"team-" + l.team}>
          <span className="cn-log-clue">
            {l.clue ? `${l.clue.word} · ${numText(l.clue.number)}` : "（没出线索）"}
          </span>
          <span className="cn-log-reveals">
            {l.reveals.map((r) => (
              <span key={r.index} className={"chip role-" + r.role} title={name(r.by)}>
                {r.word}
              </span>
            ))}
            {l.extra && <span className="chip extra">+30秒</span>}
          </span>
          {l.end && <span className="cn-log-end">{END_TEXT[l.end]}</span>}
        </li>
      ))}
    </ol>
  );
}

function Players({ snap, view }: { snap: CNRoomSnapshot; view: CNView }) {
  return (
    <ul className="cn-plist">
      {snap.players.map((p) => {
        const team = view.players.find((x) => x.id === p.playerId)?.team ?? null;
        const cap = view.captains.red === p.playerId || view.captains.blue === p.playerId;
        const op = !cap && team && view.operators[team] === p.playerId;
        return (
          <li key={p.playerId} className={(team ? "team-" + team : "") + (p.connected ? "" : " off")}>
            {p.name}
            {cap && " · 队长"}
            {op && " · 操作员"}
            {!team && " · 观战"}
            {!p.connected && " · 离线"}
          </li>
        );
      })}
    </ul>
  );
}

function Result({ snap, view, net }: { snap: CNRoomSnapshot; view: CNView; net: Net }) {
  const me = snap.players.find((p) => p.playerId === snap.mySeat);
  const myTeam = view.players.find((p) => p.id === snap.mySeat)?.team ?? null;
  const act = useAct((a: CNLobbyAction) => net.lobby(a));
  const won = myTeam && myTeam === view.winner;
  return (
    <div className={"cn-result team-" + view.winner} data-testid="cn-result">
      <p className="cn-result-big">{myTeam ? (won ? "你们赢了！" : "这局输了") : `${TEAM_NAME[view.winner!]}获胜`}</p>
      <p>
        {view.endReason === "assassin"
          ? `${TEAM_NAME[other(view.winner!)]}翻到了刺客。`
          : `${TEAM_NAME[view.winner!]}找齐了全部自己人。`}
        没被翻开的牌用斜纹标出。
      </p>
      {act.error && <p className="cn-error">{act.error}</p>}
      {me?.host ? (
        <button className="cn-go" disabled={act.busy} data-testid="cn-next" onClick={() => act.run({ type: "NEXT" })}>
          再来一局（保留队伍，重新定队长）
        </button>
      ) : (
        <p className="cn-muted">等房主开始下一局</p>
      )}
    </div>
  );
}

/** 新线索出现时中央大字闪现 1.6 秒 */
function ClueFlash({ view }: { view: CNView }) {
  const l = view.log[view.log.length - 1];
  const key = l?.clue ? `${view.log.length}:${l.clue.word}` : "";
  const [shown, setShown] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!key) return;
    setShown(key);
    const id = setTimeout(() => setShown(""), 1600);
    return () => clearTimeout(id);
  }, [key]);
  if (!shown || !l?.clue) return null;
  return (
    <div className={"cn-flash team-" + l.team} aria-hidden="true">
      <span>{l.clue.word}</span>
      <b>{numText(l.clue.number)}</b>
    </div>
  );
}
