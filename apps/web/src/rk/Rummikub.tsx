import React, { useEffect, useRef, useState } from "react";
import { ActionDock, CountdownRing } from "../dm/Polish.tsx";
import { feel, soundOn, setSoundOn, type Cue } from "../drawing/feel.ts";
import {
  createTiles,
  tileName,
  validateMeld,
  TURN_SECONDS,
  type Meld,
  type Interpretation,
} from "../../../../packages/rummikub/src/index.ts";
import type { RKAction } from "../../../../packages/shared/src/rk-protocol.ts";
import {
  sortRack,
  selectionAfterClick,
  newTableTiles,
  settingsForPlayerCount,
  type SortMode,
} from "./ui-model.ts";
import { useRKRoom } from "./rk-net.ts";
import "./rk.css";
const assets = "/assets/rummikub/";
const tiles = new Map(createTiles("xp").map((t) => [t.id, t]));
const symbols = { R: "●", B: "▲", O: "■", K: "◆" };
const colors = { R: "红", B: "蓝", O: "橙", K: "黑" };
function preference(key: string, fallback: boolean) {
  try {
    return localStorage.getItem(key) === "0"
      ? false
      : localStorage.getItem(key) === "1"
        ? true
        : fallback;
  } catch {
    return fallback;
  }
}
function TileFace({
  id,
  interpretation,
}: {
  id: string;
  interpretation?: Interpretation;
}) {
  const t = tiles.get(id)!;
  const joker = interpretation?.jokers[id];
  return (
    <span className={"rk-tile rk-" + (t.color ?? "J")}>
      <i className="rk-symbol" aria-hidden="true">
        {t.color ? symbols[t.color] : "✧"}
      </i>
      {t.color ? (
        <>
          <b>{t.value}</b>
          <i className="rk-dot" />
        </>
      ) : (
        <>
          <img className="rk-joker" src={assets + "joker.webp"} alt="" />
          {joker && (
            <small className="rk-joker-value">
              ={colors[joker.color]}
              {joker.value}
            </small>
          )}
        </>
      )}
    </span>
  );
}
type Drag = { ids: string[]; x: number; y: number; forbidden?: boolean };
export function Rummikub() {
  const net = useRKRoom();
  const s = net.snapshot,
    v = s?.view;
  const mine = !!v && v.phase === "PLAYING" && v.current === v.me;
  const host = s?.mySeat === s?.hostId;
  const [name, setName] = useState(""),
    [room, setRoom] = useState(
      new URLSearchParams(location.search).get("room") ?? "",
    ),
    [selected, setSelected] = useState<string[]>([]),
    [sort, setSort] = useState<SortMode>("color"),
    [zoom, setZoom] = useState(1),
    [menu, setMenu] = useState(false),
    [rules, setRules] = useState(false),
    [copied, setCopied] = useState(false),
    [sound, setSound] = useState(soundOn),
    [haptics, setHaptics] = useState(() => preference("rk-vibrate", true)),
    [drawVisible, setDrawVisible] = useState(false),
    [now, setNow] = useState(Date.now()),
    [newIds, setNewIds] = useState<string[]>([]),
    [merge, setMerge] = useState<string[]>([]),
    [mergeMode, setMergeMode] = useState(false),
    [splitHint, setSplitHint] = useState(""),
    [drag, setDrag] = useState<Drag | null>(null),
    [target, setTarget] = useState(""),
    [drawnIds, setDrawnIds] = useState<string[]>([]),
    [rackWidth, setRackWidth] = useState(0),
    [handOpen, setHandOpen] = useState(true);
  const handSwipe = useRef<number | null>(null);
  const setHandOpenRef = useRef(setHandOpen);
  const surface = useRef<HTMLDivElement>(null),
    rackArea = useRef<HTMLDivElement>(null),
    prior = useRef<
      | {
          game: number;
          board: Meld[];
          current: number;
          phase: string;
          action: string;
        }
      | undefined
    >(undefined),
    selectRef = useRef(selected),
    snapRef = useRef(s),
    actionRef = useRef(net.act),
    prefs = useRef({ sound, haptics });
  selectRef.current = selected;
  snapRef.current = s;
  actionRef.current = net.act;
  prefs.current = { sound, haptics };
  const buzz = (cue: Cue) =>
    feel(cue, { sound: prefs.current.sound, vibration: prefs.current.haptics });
  const pendingDrag = useRef<{
      id: string;
      ids: string[];
      x: number;
      y: number;
      startX: number;
      startY: number;
      active: boolean;
      type: string;
      timer: ReturnType<typeof setTimeout> | null;
      inRack?: boolean;
    } | null>(null),
    suppressClick = useRef(0);
  const touch = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{ distance: number; zoom: number } | null>(null),
    pan = useRef<{ x: number; y: number } | null>(null),
    zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const board = v?.draft?.board ?? v?.board ?? [],
    rack = v?.draft?.rack ?? v?.players[v.me]?.rack ?? [];
  const oldIds = new Set(v?.board.flatMap((m) => m.tiles) ?? []);
  const left =
    v?.deadline === null
      ? 0
      : Math.max(
          0,
          Math.ceil(((v?.deadline ?? 0) - (now + net.offset.current)) / 1000),
        );
  const send = async (action: RKAction) => {
    const okay = await net.act(action);
    buzz(okay ? (action.type === "COMMIT" ? "submit" : "stamp") : "lose");
    if (okay) {
      setSelected([]);
      setMerge([]);
      setSplitHint("");
    }
    return okay;
  };
  const move = (ids: string[], meld: string | null, index?: number) => {
    if (!ids.length) {
      net.setError("先点选手牌，再选择放置位置");
      return;
    }
    void send({
      type: "MOVE",
      tiles: ids,
      to: { meld, ...(index === undefined ? {} : { index }) },
    });
  };
  useEffect(() => {
    document.title = "拉密 Rummikub";
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!v) return;
    const p = prior.current;

    if (!p || p.game !== v.game) {
      setDrawVisible(true);
    }
    if (p) {
      const added = newTableTiles(p.board, v.board);
      if (added.length) {
        setNewIds(added);
      }
    }
    if (p && p.current !== v.current) {
      setSelected([]);
      setMerge([]);
      if (mine) {
        buzz("turn");
        setHandOpen(true);
      }
    }
    if (v.phase === "FINISHED" && p?.phase !== "FINISHED")
      buzz(v.result?.winners.includes(v.me) ? "win" : "lose");
    const key = JSON.stringify(v.lastAction);
    if (
      p &&
      p.action !== key &&
      v.lastAction?.seat === v.me &&
      ["TIMEOUT", "INVALID"].includes(v.lastAction.type)
    )
      buzz("lose");
    prior.current = {
      game: v.game,
      board: v.board,
      current: v.current,
      phase: v.phase,
      action: key,
    };
  }, [v?.game, v?.board, v?.current, v?.phase, v?.lastAction]);
  useEffect(() => {
    if (!drawVisible) return;
    const timer = setTimeout(() => setDrawVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [drawVisible, v?.game]);
  useEffect(() => {
    if (!newIds.length) return;
    const timer = setTimeout(() => setNewIds([]), 2000);
    return () => clearTimeout(timer);
  }, [newIds]);
  const officialRack = v?.players[v.me]?.rack;
  const priorRack = useRef<{ game: number; ids: string[] } | null>(null);
  useEffect(() => {
    if (!v || !officialRack) return;
    const p = priorRack.current;
    if (p && p.game === v.game) {
      const had = new Set(p.ids);
      const added = officialRack.filter((id) => !had.has(id));
      if (added.length && added.length <= 4) setDrawnIds(added);
    }
    priorRack.current = { game: v.game, ids: [...officialRack] };
  }, [officialRack?.join(","), v?.game]);
  useEffect(() => {
    if (!drawnIds.length) return;
    const timer = setTimeout(() => setDrawnIds([]), 1800);
    return () => clearTimeout(timer);
  }, [drawnIds]);
  useEffect(() => {
    const el = rackArea.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setRackWidth(el.clientWidth));
    ro.observe(el);
    setRackWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [!!v]);
  useEffect(() => {
    if (selected.length && mergeMode) setMergeMode(false);
  }, [selected.length]);
  useEffect(() => {
    if (board.length < 2 && mergeMode) setMergeMode(false);
  }, [board.length]);
  useEffect(() => {
    if (!net.error) return;
    const t = setTimeout(() => net.setError(""), 6500);
    return () => clearTimeout(t);
  }, [net.error]);
  useEffect(() => {
    const dropAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-rk-drop]");
    const onMove = (e: PointerEvent) => {
      const d = pendingDrag.current;
      if (!d) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const distance = Math.hypot(d.x - d.startX, d.y - d.startY);
      if (!d.active && d.type === "mouse" && distance > 6) {
        d.active = true;
        setSelected(d.ids);
        buzz("select");
      }
      if (!d.active && distance > 12 && d.type !== "mouse") {
        if (d.timer) clearTimeout(d.timer);
        if (
          d.inRack &&
          d.y - d.startY > 40 &&
          Math.abs(d.y - d.startY) > Math.abs(d.x - d.startX)
        ) {
          pendingDrag.current = null;
          suppressClick.current = Date.now() + 400;
          setHandOpenRef.current(false);
          return;
        }
        if (d.inRack) rackArea.current?.scrollBy(d.startX - d.x, 0);
        d.startX = d.x;
        return;
      }
      if (d.active) {
        e.preventDefault();
        const el = dropAt(d.x, d.y);
        const forbidden =
          el?.dataset.rkDrop === "rack" &&
          d.ids.some((id) =>
            snapRef.current?.view?.board.some((m) => m.tiles.includes(id)),
          );
        setDrag({ ids: d.ids, x: d.x, y: d.y, forbidden });
        setTarget(el?.dataset.rkDrop ?? "");
      }
    };
    const end = (e: PointerEvent) => {
      const d = pendingDrag.current;
      if (!d) return;
      if (d.timer) clearTimeout(d.timer);
      pendingDrag.current = null;
      if (d.active) {
        suppressClick.current = Date.now() + 400;
        const el = dropAt(e.clientX, e.clientY),
          dest = el?.dataset.rkDrop;
        const view = snapRef.current?.view;
        if (
          dest === "rack" &&
          d.ids.some((id) => view?.board.some((m) => m.tiles.includes(id)))
        ) {
          net.setError("桌面上的牌不能拿回手牌");
          buzz("lose");
        } else if (dest) {
          const to =
            dest === "rack"
              ? { rack: true as const }
              : {
                  meld: dest === "new" ? null : dest,
                  ...(el?.dataset.rkIndex
                    ? { index: Number(el.dataset.rkIndex) }
                    : {}),
                };
          void actionRef
            .current({ type: "MOVE", tiles: d.ids, to })
            .then((ok) => {
              buzz(ok ? "stamp" : "lose");
              if (ok) setSelected([]);
            });
        }
      }
      setDrag(null);
      setTarget("");
    };
    const cancel = () => {
      const d = pendingDrag.current;
      if (d?.timer) clearTimeout(d.timer);
      pendingDrag.current = null;
      setDrag(null);
      setTarget("");
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      cancel();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, []);
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (!mine || net.pending || !net.online) return;
    if (!v!.players[v!.me].opened && oldIds.has(id)) return;
    const ids = selectRef.current.includes(id) ? selectRef.current : [id];
    const d = {
      id,
      ids,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      type: e.pointerType,
      timer: null as ReturnType<typeof setTimeout> | null,
      inRack: !!(e.target as HTMLElement).closest(".rk-rack"),
    };
    pendingDrag.current = d;
    if (e.pointerType !== "mouse")
      d.timer = setTimeout(() => {
        if (pendingDrag.current !== d) return;
        d.active = true;
        setSelected(ids);
        setDrag({ ids, x: d.x, y: d.y });
        buzz("select");
      }, 150);
  };
  const tileButton = (
    id: string,
    interpretation?: Interpretation,
    onTable = false,
  ) => {
    const disabled =
      !mine ||
      net.pending ||
      !net.online ||
      (!v?.players[v.me].opened && oldIds.has(id));
    const chosen = selected.includes(id);
    return (
      <button
        key={id}
        className={
          "rk-hit " +
          (chosen ? "selected " : "") +
          (onTable && newIds.includes(id) ? "arrived " : "") +
          (onTable && !oldIds.has(id) ? "fresh " : "") +
          (!onTable && drawnIds.includes(id) ? "drawn" : "")
        }
        data-tile={id}
        data-testid={"rk-tile-" + id}
        aria-label={
          tileName(id) +
          (interpretation?.jokers[id]
            ? "，代表" +
              colors[interpretation.jokers[id].color] +
              interpretation.jokers[id].value
            : "")
        }
        aria-pressed={chosen}
        disabled={disabled}
        onPointerDown={(e) => startDrag(e, id)}
        onClick={(e) => {
          if (e.detail > 0 && Date.now() < suppressClick.current) return;
          buzz("select");
          setSelected((x) => selectionAfterClick(x, id));
        }}
      >
        <TileFace id={id} interpretation={interpretation} />
      </button>
    );
  };
  const rackRows = rack.length <= 18 ? 2 : rack.length <= 30 ? 3 : 4;
  const rackCols = Math.max(7, Math.ceil(rack.length / rackRows));
  const handW = rackWidth
    ? Math.max(
        28,
        Math.min(
          rackRows > 2 ? 40 : 44,
          Math.floor((rackWidth - 10 - 4 * (rackCols - 1)) / rackCols),
        ),
      )
    : 38;
  const officialBoard = v?.board ?? [];
  const dirty =
    !!v?.draft &&
    (rack.length !== (officialRack?.length ?? rack.length) ||
      board.length !== officialBoard.length ||
      board.some(
        (m, i) =>
          m.id !== officialBoard[i]?.id ||
          m.tiles.join() !== officialBoard[i]?.tiles.join(),
      ));
  const drawMode = mine && !dirty;
  const splitTarget = (() => {
    if (selected.length !== 1) return null;
    const m = board.find((m) => m.tiles.includes(selected[0]));
    if (!m) return null;
    const at = m.tiles.indexOf(selected[0]);
    return at > 0 ? { meld: m.id, at } : null;
  })();
  const openDraw = drawVisible && v?.phase === "PLAYING";
  const playerStrip = (lobby = false) => (
    <div className={"rk-players " + (lobby ? "rk-seats" : "")}>
      {Array.from({ length: s?.count ?? 2 }, (_, i) => {
        const p = s?.players[i],
          vp = v?.players[i];
        return (
          <div
            key={i}
            className={"rk-player " + (v?.current === i ? "active" : "")}
            data-testid={"rk-seat-" + i}
          >
            <span className="rk-avatar">{p?.name.slice(0, 1) ?? "+"}</span>
            <div>
              <strong>
                {i + 1}号 {p?.name ?? "等待朋友"}
              </strong>
              <small>
                {lobby ? (
                  p ? (
                    p.ready ? (
                      "已准备"
                    ) : p.id === s?.hostId ? (
                      "房主"
                    ) : (
                      "未准备"
                    )
                  ) : (
                    "空座位"
                  )
                ) : (
                  <>
                    {vp?.count} 张 {vp?.opened && <em>🧊已破冰</em>}
                  </>
                )}
              </small>
            </div>
            {p && !p.connected && (
              <span className="rk-offline" title="暂时离线">
                ·
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
  const menuPanel = menu && (
    <div className="rk-menu" role="dialog" aria-label="房间菜单">
      <button
        onClick={() => {
          setSound(!sound);
          setSoundOn(!sound);
        }}
        aria-pressed={sound}
      >
        音效 <b>{sound ? "已开" : "已关"}</b>
      </button>
      <button
        onClick={() => {
          const n = !haptics;
          setHaptics(n);
          try {
            localStorage.setItem("rk-vibrate", n ? "1" : "0");
          } catch {}
        }}
        aria-pressed={haptics}
      >
        震动 <b>{haptics ? "已开" : "已关"}</b>
      </button>
      <button
        onClick={() => {
          setRules(true);
          setMenu(false);
        }}
      >
        查看规则
      </button>
      <a href="/">退出房间</a>
      <button onClick={() => setMenu(false)}>收起菜单</button>
    </div>
  );
  return (
    <main
      className={
        "rk-world " +
        (!v ? "rk-lobby-world " : "") +
        (s?.variant === "xp" ? "rk-xp" : "")
      }
    >
      <div className="rk-shell">
        <header className="rk-top">
          <a href="/" aria-label="返回桌游合集">
            <img src={assets + "logo.webp"} alt="Rummikub" />
          </a>
          <span className="rk-room-code">{s ? "房间 " + s.code : "拉密"}</span>
          {s?.variant === "xp" && <b className="rk-variant-badge">XP</b>}
          {v && <span className="rk-pool">池 {v.poolCount}</span>}
          {v?.deadline !== null && v?.phase === "PLAYING" && (
            <span
              className={
                "rk-clock " + (left <= 10 ? "urgent" : left <= 30 ? "warn" : "")
              }
              aria-label={"剩余 " + left + " 秒"}
            >
              <CountdownRing left={left} total={TURN_SECONDS[v?.minutes ?? 1] || 100} />
              <b>{left}</b>
            </span>
          )}
          <button
            className="rk-menu-toggle"
            aria-label="打开房间菜单"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
        </header>
        {!net.online && (
          <div className="rk-connection" role="status">
            重连中…
          </div>
        )}
        {menuPanel}
        {!v ? (
          <section className="rk-lobby">
            <div className="rk-lobby-brand">
              <img
                className="rk-cover"
                src={assets + "box-classic.webp"}
                alt="官方 Rummikub Classic 包装盒"
              />
              <span>THE ORIGINAL</span>
              <h1>
                拉密 <small>Rummikub</small>
              </h1>
              <p>和朋友，把每一张牌放到恰好的位置。</p>
            </div>
            <div className="rk-lobby-main">
              {s?.mySeat ? (
                <>
                  <div className="rk-lobby-title">
                    <span>朋友的牌桌</span>
                    <h2>
                      {s.count - s.players.length > 0
                        ? "还差 " + (s.count - s.players.length) + " 人"
                        : "人齐了，准备开局"}
                    </h2>
                    <p>
                      房间 <b>{s.code}</b> · {s.count} 人 ·{" "}
                      {s.variant === "xp" ? "XP 160 张" : "原版 106 张"} ·{" "}
                      {s.games} 局 ·{" "}
                      {s.minutes ? TURN_SECONDS[s.minutes] + " 秒/回合" : "不限时"}
                    </p>
                  </div>
                  {playerStrip(true)}
                  <div className="rk-settings">
                    <label>
                      玩法
                      <select
                        aria-label="拉密玩法"
                        value={s.variant ?? "classic"}
                        disabled={!host || net.pending}
                        onChange={(e) =>
                          void send({
                            type: "SET_SETTINGS",
                            variant: e.target.value as "classic" | "xp",
                          })
                        }
                      >
                        <option value="classic">原版 · 106 张</option>
                        <option value="xp">XP · 160 张</option>
                      </select>
                    </label>
                    <label>
                      人数
                      <select
                        aria-label="本局人数"
                        value={s.count}
                        disabled={!host || net.pending}
                        onChange={(e) =>
                          void send(
                            settingsForPlayerCount(Number(e.target.value)),
                          )
                        }
                      >
                        {[2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}
                            {n >= 5 ? " · XP" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      计时
                      <select
                        aria-label="每回合计时"
                        value={s.minutes}
                        disabled={!host || net.pending}
                        onChange={(e) =>
                          void send({
                            type: "SET_SETTINGS",
                            minutes: Number(e.target.value) as 0 | 1 | 2,
                          })
                        }
                      >
                        <option value="1">100 秒</option>
                        <option value="2">200 秒</option>
                        <option value="0">不限</option>
                      </select>
                    </label>
                    <label>
                      局数
                      <input
                        aria-label="约定局数"
                        type="number"
                        min="1"
                        max="100"
                        defaultValue={s.games}
                        key={s.games}
                        disabled={!host || net.pending}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== s.games)
                            void send({
                              type: "SET_SETTINGS",
                              games: Number(e.target.value),
                            });
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className="rk-invite"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          location.origin + "/?game=rk&room=" + s.code,
                        );
                        setCopied(true);
                      } catch {
                        net.setError(
                          "邀请链接：" +
                            location.origin +
                            "/?game=rk&room=" +
                            s.code,
                        );
                      }
                    }}
                  >
                    {copied ? "✓ 邀请链接已复制" : "复制邀请链接 ↗"}
                  </button>
                  <div className="rk-lobby-actions">
                    <button
                      onClick={() => void send({ type: "READY" })}
                      disabled={net.pending || !net.online}
                    >
                      {s.players.find((p) => p.id === s.mySeat)?.ready
                        ? "取消准备"
                        : "我准备好了"}
                    </button>
                    {host && (
                      <button
                        className="rk-primary"
                        data-testid="rk-start"
                        disabled={
                          net.pending ||
                          s.players.length !== s.count ||
                          !s.players.every((p) => p.ready)
                        }
                        onClick={() => void send({ type: "START" })}
                      >
                        开始牌局
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2>{room ? "加入朋友的牌桌" : "今晚，来一局拉密"}</h2>
                  <label className="rk-field">
                    你的昵称
                    <input
                      aria-label="你的昵称"
                      maxLength={12}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="朋友怎么称呼你"
                    />
                  </label>
                  <label className="rk-field">
                    房间号
                    <input
                      aria-label="房间号"
                      value={room}
                      maxLength={4}
                      onChange={(e) => setRoom(e.target.value.toUpperCase())}
                      placeholder="输入 4 位房间号"
                    />
                  </label>
                  <button
                    className="rk-primary"
                    data-testid="rk-create"
                    disabled={net.pending || !net.online || !name.trim()}
                    onClick={() =>
                      room ? void net.join(room, name) : void net.create(name)
                    }
                  >
                    {net.pending ? "正在入座…" : room ? "加入房间" : "创建房间"}
                  </button>
                  {room && (
                    <button
                      onClick={() => {
                        setRoom("");
                        history.replaceState(null, "", "/?game=rk");
                      }}
                    >
                      创建自己的房间
                    </button>
                  )}
                  <p className="rk-entry-note">
                    {!s
                      ? "2–6 人 · 5–6 人使用 XP 160 张"
                      : s.variant === "xp"
                        ? "5–6 人 · XP 160 张 · 4 张百搭牌"
                        : "2–4 人 · 原版 106 张"}{" "}
                    · 每人 14 张起手
                  </p>
                </>
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="rk-game">
              <section className="rk-table-section" aria-label="公共桌面">
                <div className="rk-table-heading">
                  <div>
                    <b>公共桌面</b>
                    <span>
                      {board.length} 组{" "}
                      {v.game > 1 ? "· 第 " + v.game + " 局" : ""}
                    </span>
                  </div>
                  <div className="rk-tools">
                    <button
                      aria-label="缩小桌面"
                      onClick={() =>
                        setZoom((z) =>
                          Math.max(0.7, Math.round((z - 0.1) * 10) / 10),
                        )
                      }
                    >
                      −
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      aria-label="放大桌面"
                      onClick={() =>
                        setZoom((z) =>
                          Math.min(1.6, Math.round((z + 0.1) * 10) / 10),
                        )
                      }
                    >
                      +
                    </button>
                    {mine && board.length >= 2 && (
                      <button
                        onClick={() => {
                          setMergeMode(!mergeMode);
                          setMerge([]);
                        }}
                        aria-pressed={mergeMode}
                      >
                        选组
                      </button>
                    )}
                  </div>
                </div>
                {mine && !v.players[v.me].opened && (
                  <div className="rk-progress">
                    <span>
                      本回合已组 <b>{v.validation?.points ?? 0}/30 分</b>
                    </span>
                    <progress max="30" value={v.validation?.points ?? 0} />
                  </div>
                )}
                {mergeMode && (
                  <div className="rk-merge-bar">
                    <span>点选要合并的组合</span>
                    <button
                      disabled={merge.length < 2 || net.pending}
                      onClick={() =>
                        void send({ type: "MERGE", melds: merge }).then(
                          (ok) => ok && setMergeMode(false),
                        )
                      }
                    >
                      合并 {merge.length} 组
                    </button>
                  </div>
                )}
                <div
                  className="rk-table-scroll"
                  ref={surface}
                  onPointerDownCapture={(e) => {
                    if (e.pointerType !== "touch") return;
                    touch.current.set(e.pointerId, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                    if (touch.current.size === 2) {
                      const [a, b] = [...touch.current.values()];
                      pinch.current = {
                        distance: Math.hypot(a.x - b.x, a.y - b.y),
                        zoom: zoomRef.current,
                      };
                      if (pendingDrag.current?.timer)
                        clearTimeout(pendingDrag.current.timer);
                      pendingDrag.current = null;
                      setDrag(null);
                    } else pan.current = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerMove={(e) => {
                    if (
                      e.pointerType !== "touch" ||
                      !touch.current.has(e.pointerId)
                    )
                      return;
                    touch.current.set(e.pointerId, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                    if (touch.current.size === 2 && pinch.current) {
                      const [a, b] = [...touch.current.values()];
                      setZoom(
                        Math.max(
                          0.7,
                          Math.min(
                            1.6,
                            (pinch.current.zoom *
                              Math.hypot(a.x - b.x, a.y - b.y)) /
                              pinch.current.distance,
                          ),
                        ),
                      );
                    } else if (
                      pan.current &&
                      surface.current &&
                      !pendingDrag.current?.active
                    ) {
                      if (
                        Math.abs(pan.current.x - e.clientX) +
                          Math.abs(pan.current.y - e.clientY) >
                        2
                      )
                        suppressClick.current = Date.now() + 300;
                      surface.current.scrollBy(
                        pan.current.x - e.clientX,
                        pan.current.y - e.clientY,
                      );
                      pan.current = { x: e.clientX, y: e.clientY };
                    }
                  }}
                  onPointerUp={(e) => {
                    touch.current.delete(e.pointerId);
                    pinch.current = null;
                    pan.current = null;
                  }}
                  onPointerCancel={(e) => {
                    touch.current.delete(e.pointerId);
                    pinch.current = null;
                    pan.current = null;
                  }}
                >
                  <div
                    className={
                      "rk-table-content " +
                      (mine && selected.length ? "picking" : "")
                    }
                    onClick={(e) => {
                      if (
                        !(e.target as HTMLElement).closest(
                          "button, .rk-meld",
                        ) &&
                        selected.length
                      )
                        setSelected([]);
                    }}
                    style={{ zoom, "--rk-zoom": zoom } as React.CSSProperties}
                    data-testid="rk-table"
                  >
                    {!board.length && (
                      <div className="rk-empty">
                        <span>R</span>
                        <h2>好牌，从这一手开始</h2>
                        <p>
                          {mine
                            ? "选中手牌，点下方「新建一组」"
                            : "等待朋友打出第一组牌"}
                        </p>
                      </div>
                    )}
                    {board.map((m, i) => {
                      const interpretation = validateMeld(m.tiles)[0];
                      const old = v.board.find((b) => b.id === m.id);
                      const changed =
                        !!old &&
                        JSON.stringify(old.tiles) !== JSON.stringify(m.tiles);
                      return (
                        <div
                          key={m.id}
                          className={
                            "rk-meld " +
                            (!interpretation ? "invalid " : "") +
                            (changed ? "changed " : "") +
                            (target === m.id ? "drop-target " : "") +
                            (merge.includes(m.id) ? "merge-selected" : "")
                          }
                          data-rk-drop={m.id}
                          data-testid={"rk-meld-" + m.id}
                        >
                          <span className="rk-meld-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {mergeMode && (
                            <button
                              className="rk-group-check"
                              aria-label={"选择第 " + (i + 1) + " 组"}
                              aria-pressed={merge.includes(m.id)}
                              onClick={() =>
                                setMerge((x) =>
                                  x.includes(m.id)
                                    ? x.filter((id) => id !== m.id)
                                    : [...x, m.id],
                                )
                              }
                            >
                              {merge.includes(m.id) ? "☑" : "□"}
                            </button>
                          )}
                          <div className="rk-meld-tiles">
                            {m.tiles.map((id, j) => (
                              <div className="rk-table-slot" key={id}>
                                {tileButton(id, interpretation, true)}
                              </div>
                            ))}
                          </div>
                          {mine && selected.length > 0 && (
                            <button
                              className="rk-add"
                              data-rk-drop={m.id}
                              aria-label={"放入第 " + (i + 1) + " 组"}
                              disabled={net.pending}
                              onClick={() => move(selected, m.id)}
                            >
                              +
                            </button>
                          )}
                          {!interpretation && (
                            <small className="rk-meld-error">
                              {m.tiles.length < 3
                                ? "至少需要 3 张牌"
                                : "数字不连续或颜色不合法"}
                            </small>
                          )}
                        </div>
                      );
                    })}
                    {mine && (
                      <button
                        className={
                          "rk-new-group " +
                          (target === "new" ? "drop-target" : "")
                        }
                        data-rk-drop="new"
                        data-testid="rk-new-group"
                        disabled={net.pending}
                        onClick={() => move(selected, null)}
                      >
                        <b>＋</b>
                        <span>新建一组</span>
                      </button>
                    )}
                  </div>
                </div>
                {v.lastAction && (
                  <div className="rk-log" aria-live="polite">
                    {v.players[v.lastAction.seat].name}{" "}
                    {v.lastAction.type === "COMMIT"
                      ? "打出 " + v.lastAction.count + " 张"
                      : v.lastAction.type === "DRAW"
                        ? "摸了 " + v.lastAction.count + " 张"
                        : v.lastAction.type === "TIMEOUT"
                          ? "超时，已还原 · 罚摸 " + v.lastAction.count + " 张"
                          : "操作未完成，已还原 · 罚摸 " +
                            v.lastAction.count +
                            " 张"}
                  </div>
                )}
                {mine && splitTarget && !drag && (
                  <button
                    className="rk-quick-new rk-quick-split"
                    data-testid="rk-quick-split"
                    disabled={net.pending}
                    onClick={() =>
                      void send({
                        type: "SPLIT",
                        meld: splitTarget.meld,
                        at: splitTarget.at,
                      })
                    }
                  >
                    ✂ 从这张牌前面拆开
                  </button>
                )}
                {mine && selected.length > 0 && !drag && (
                  <button
                    className="rk-quick-new"
                    data-testid="rk-quick-new"
                    disabled={net.pending}
                    onClick={() => move(selected, null)}
                  >
                    ＋ 用选中的 {selected.length} 张新建一组
                  </button>
                )}
                <p className="rk-table-foot">
                  {drag
                    ? "拖到组合末尾或新建一组"
                    : selected.length
                      ? "已选 " +
                        selected.length +
                        " 张 · 点组合右侧「+」或「新建一组」 · 点空白处取消"
                      : "点任意牌选中 · 按住牌拖动 · 在桌面任意处滑动"}
                </p>
              </section>
              <aside className="rk-sidebar">
                {playerStrip()}
                <section
                  className={"rk-hand " + (handOpen ? "" : "collapsed")}
                  data-rk-drop="rack"
                  aria-label="我的牌架"
                >
                  <div
                    className="rk-hand-heading"
                    onPointerDown={(e) => (handSwipe.current = e.clientY)}
                    onPointerUp={(e) => {
                      const y0 = handSwipe.current;
                      handSwipe.current = null;
                      if (y0 === null) return;
                      if (e.clientY - y0 > 24) setHandOpen(false);
                      else if (y0 - e.clientY > 24) setHandOpen(true);
                    }}
                  >
                    <button
                      className="rk-hand-toggle"
                      aria-expanded={handOpen}
                      aria-label={handOpen ? "收起牌架" : "展开牌架"}
                      onClick={() => setHandOpen((o) => !o)}
                    >
                      <i aria-hidden="true" />
                      <h2>
                        我的牌架 <span>{rack.length} 张</span>
                        <em>{handOpen ? "下拉收起" : "上拉展开"}</em>
                      </h2>
                    </button>
                    <div className="rk-sort">
                      <button
                        aria-pressed={sort === "color"}
                        onClick={() => setSort("color")}
                      >
                        按颜色
                      </button>
                      <button
                        aria-pressed={sort === "number"}
                        onClick={() => setSort("number")}
                      >
                        按数字
                      </button>
                    </div>
                  </div>
                  <div
                    className={
                      "rk-rack " + (target === "rack" ? "rack-target" : "")
                    }
                    ref={rackArea}
                  >
                    <div
                      className="rk-rack-tiles"
                      style={
                        {
                          "--hw": handW + "px",
                          "--cols": rackCols,
                          "--rows": rackRows,
                          "--hh": Math.round(handW * 1.37) + "px",
                        } as React.CSSProperties
                      }
                    >
                      {sortRack(rack, sort).map((id) => tileButton(id))}
                    </div>
                  </div>
                </section>
                <div className={"rk-secondary " + (mine ? "" : "rk-idle")}>
                  <button
                    disabled={!mine || net.pending || !v.canUndo}
                    onClick={() => void send({ type: "UNDO" })}
                  >
                    <i aria-hidden="true">↶</i>撤销
                  </button>
                  <button
                    disabled={!mine || net.pending || !v.canRedo}
                    onClick={() => void send({ type: "REDO" })}
                  >
                    <i aria-hidden="true">↷</i>重做
                  </button>
                  <button
                    disabled={!mine || net.pending || !dirty}
                    onClick={() => void send({ type: "RESET" })}
                  >
                    <i aria-hidden="true">⟲</i>全部还原
                  </button>
                </div>
                <div
                  className={"rk-action-wrap " + (net.error ? "rejected" : "")}
                >
                  <ActionDock
                    hint={
                      mine
                        ? drawMode
                          ? selected.length
                            ? "先点上方「用选中的牌新建一组」放上桌面"
                            : "没有要出的牌？摸 1 张结束回合"
                          : v.validation?.ok
                            ? "组合合法，可以确认"
                            : v.validation?.reason
                        : "等待 " +
                          (v.current + 1) +
                          "号 " +
                          v.players[v.current].name +
                          "…"
                    }
                  >
                    <button
                      className={"rk-primary " + (drawMode ? "draw" : "")}
                      data-testid="rk-commit"
                      disabled={
                        !mine ||
                        net.pending ||
                        !net.online ||
                        (!drawMode && !v.validation?.ok)
                      }
                      onClick={() =>
                        void send({ type: drawMode ? "DRAW" : "COMMIT" })
                      }
                    >
                      {net.pending ? (
                        <>
                          <span className="rk-spinner" aria-hidden="true" />
                          正在确认…
                        </>
                      ) : drawMode ? (
                        "摸牌并结束"
                      ) : mine ? (
                        "确认出牌"
                      ) : (
                        "等待朋友出牌"
                      )}
                    </button>
                  </ActionDock>
                </div>
              </aside>
            </div>
            {openDraw && (
              <div
                className="rk-overlay rk-start-draw"
                role="dialog"
                aria-label="抽牌定先手"
              >
                <div className="rk-dialog">
                  <span className="rk-eyebrow">翻开第一张牌</span>
                  <h2>谁先开始？</h2>
                  <p>每人抽一张，最大点数先手。</p>
                  <div className="rk-draw-tiles">
                    {v.startDraw.map((d, i) => (
                      <div key={i} style={{ animationDelay: i * 160 + "ms" }}>
                        <TileFace id={d.tile} />
                        <strong>{v.players[d.seat].name}</strong>
                      </div>
                    ))}
                  </div>
                  <p>
                    <b>{v.players[v.current].name}</b> 先手
                  </p>
                  <button
                    className="rk-primary"
                    onClick={() => setDrawVisible(false)}
                  >
                    开始这一局
                  </button>
                </div>
              </div>
            )}
            {v.phase === "FINISHED" && (
              <div
                className="rk-overlay rk-results"
                role="dialog"
                aria-label="单局结算"
              >
                <section className="rk-dialog">
                  <span className="rk-eyebrow">第 {v.game} 局结束</span>
                  <h1>
                    {v.result?.winners.map((i) => v.players[i].name).join("、")}{" "}
                    <span className="rk-winner-label">获胜</span>
                  </h1>
                  <p>
                    {v.result?.blocked
                      ? "牌池已空，按剩余手牌点差计分"
                      : "所有手牌都找到了位置。漂亮的一手！"}
                  </p>
                  <div className="rk-score-list">
                    {v.players.map((p, i) => (
                      <div className="rk-score-row" key={i}>
                        <div>
                          <strong>{p.name}</strong>
                          <b
                            className={
                              v.result!.scores[i] >= 0 ? "positive" : ""
                            }
                          >
                            {v.result!.scores[i] > 0 ? "+" : ""}
                            {v.result!.scores[i]}
                          </b>
                        </div>
                        <div className="rk-revealed">
                          {p.rack?.map((id) => (
                            <span key={id}>
                              <TileFace id={id} />
                            </span>
                          ))}
                        </div>
                        <small>
                          累计 {p.score} 分 · {p.wins} 胜
                        </small>
                      </div>
                    ))}
                  </div>
                  {host && v.game < (s?.games ?? 0) ? (
                    <button
                      className="rk-primary"
                      onClick={() => void send({ type: "NEXT_GAME" })}
                      disabled={net.pending}
                    >
                      下一局
                    </button>
                  ) : (
                    <p>
                      {v.game >= (s?.games ?? 0)
                        ? "本场结束，感谢一起玩牌"
                        : "等待房主开启下一局"}
                    </p>
                  )}
                  <a href="/">返回桌游合集</a>
                </section>
              </div>
            )}
          </>
        )}
        {net.online &&
          (net.error ||
            (v?.lastAction?.seat === v?.me &&
              v?.lastAction?.type === "TIMEOUT")) && (
            <div className="rk-toast" role="status">
              {net.error ||
                "超时，桌面已还原 · 罚摸 " + v?.lastAction?.count + " 张"}
            </div>
          )}
        {drag && (
          <div
            className={"rk-drag-ghost " + (drag.forbidden ? "forbidden" : "")}
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${drag.x}px, ${drag.y}px, 0) translate(-50%, -110%) scale(1.15)`,
            }}
          >
            <TileFace id={drag.ids[0]} />
            {drag.ids.length > 1 && <b>+{drag.ids.length - 1}</b>}
            {drag.forbidden && <span>⊘ 不能拿回手牌</span>}
          </div>
        )}
        {rules && (
          <div
            className="rk-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="拉密规则"
          >
            <section className="rk-dialog rk-rule-dialog">
              <span className="rk-eyebrow">THE ORIGINAL RUMMIKUB</span>
              <h2>把手牌，组合成可能</h2>
              <ol>
                <li>
                  {s?.variant === "xp"
                    ? "本房间为 XP：5–6 人、160 张牌，每色数字 3 张、4 张 Joker。"
                    : "本房间为原版：2–4 人、106 张牌，每色数字 2 张、2 张 Joker。"}
                  每人起手 14 张。
                </li>
                <li>
                  同数字 3–4 张，颜色各不相同；或同色至少 3 张连续数字，13
                  后不能接 1。
                </li>
                <li>
                  第一次出牌只用自己的手牌，总分至少 30；Joker
                  按代表的数字计分。
                </li>
                <li>
                  破冰后的回合可拆、移、重组桌面，但确认时所有组合都必须合法，桌面牌不能回手。
                </li>
                <li>
                  释放的 Joker 必须本回合用回新组合，并至少打出一张自己的手牌。
                </li>
                <li>
                  不出牌时摸 1 张结束。本房间超时或确认非法会还原并罚摸 3
                  张（普通超时与纸质版摸 1 张有差异）。
                </li>
                <li>
                  最先出完手牌获胜；剩余 Joker 计 30
                  分。空池后一轮无人出牌，按最低剩余点数结算。
                </li>
              </ol>
              <button className="rk-primary" onClick={() => setRules(false)}>
                知道了，回到牌桌
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
