import React, { useEffect, useState } from "react";
import { maps, chars } from "../../../packages/game-engine/src/data.ts";
import { actorName } from "../../../packages/game-engine/src/index.ts";
import { App } from "./App.tsx";
import { SettingsButton } from "./Settings.tsx";
import { Token } from "./Token.tsx";
import { usePhone } from "./MobileDock.tsx";
import { TapButton } from "./TapButton.tsx";
import { createRoom, useRoom, type NetBinding } from "./net.ts";

const params = () => new URLSearchParams(location.search);
const goto = (q: string) => {
  history.pushState(null, "", q);
  dispatchEvent(new PopStateEvent("popstate"));
};

/** 分享给同一 Wi-Fi 的手机时，把 localhost 换成电脑的局域网地址 */
export function useShareUrl(code: string | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!code) return;
    const path = `/?room=${code}`;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      location.hostname,
    );
    // 优先使用外网链接；其次在本机打开时换成局域网地址；否则用当前网址
    fetch("/api/info")
      .then((r) => r.json())
      .then(
        (info: { port: number; lan: string[]; publicUrl?: string | null }) =>
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

export function InvitePanel({
  code,
  onClose,
}: {
  code: string;
  onClose?: () => void;
}) {
  const url = useShareUrl(code);
  return (
    <div className="invite" data-testid="invite">
      <p className="eyebrow">邀请朋友</p>
      <div className="room-code" aria-label="房间号">
        {code}
      </div>
      {url && (
        <img
          className="qr"
          src={`/api/qr?text=${encodeURIComponent(url)}`}
          alt="扫码加入房间"
          width={180}
          height={180}
        />
      )}
      <p className="small">手机扫码，或在浏览器打开</p>
      <code className="share-url">{url}</code>
      {onClose && (
        <TapButton className="primary" onClick={onClose}>
          关闭
        </TapButton>
      )}
    </div>
  );
}

function Brand({ line }: { line: string }) {
  return (
    <div className="lobby-brand">
      <div className="lobby-settings">
        <SettingsButton />
      </div>
      <div className="tally" aria-hidden="true">
        <Token
          token={{
            id: "brand",
            kind: "brand_lantern",
            state: "normal",
            asset: "brand_lantern",
            label: "原创灯笼",
            location: "room",
          }}
          size={100}
        />
      </div>
      <p className="eyebrow">中文版 · 实体桌游规则</p>
      <h1>
        黎明杀机<span>桌游版</span>
      </h1>
      <p>{line}</p>
      <div className="lobby-line" />
      <p className="muted">
        <a href="/?hotseat=1">← 本机热座模式</a>
      </p>
    </div>
  );
}

/** 测试用：?preset=地图,逃生者1,逃生者2,逃生者3,逃生者4,杀手&seed=N（只有测试服务器接受） */
function presetFromUrl() {
  const raw = params().get("preset");
  const seed = Number(params().get("seed"));
  if (!raw || !seed) return undefined;
  const [mapId, a, b, c, d, killer] = raw.split(",");
  return { mapId, survivors: [a, b, c, d], killer, seed };
}

function CreateOrJoin() {
  const [playerCount, setPlayerCount] = useState<3 | 4 | 5>(5);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const preset = presetFromUrl();
    const res = await createRoom({
      playerCount,
      ...(preset ? { preset } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    goto(`/?room=${res.code}`);
  }
  return (
    <main className="lobby room-flow">
      <Brand line="开一个房间，大家用自己的手机加入。每个人只看得到自己的秘密移动牌。" />
      <section className="setup">
        <h2>加入房间</h2>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) goto(`/?room=${code.trim().toUpperCase()}`);
          }}
        >
          <input
            data-testid="join-code"
            aria-label="房间号"
            placeholder="输入 4 位房间号"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <TapButton className="primary" type="submit">
            加入
          </TapButton>
        </form>
        <h2>创建房间</h2>
        <CountPicker value={playerCount} onChange={setPlayerCount} />
        <p className="small muted">
          进房后每人自己选阵营；地图每局随机。人数之后还能改。
        </p>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <TapButton
          className="primary start-button"
          data-testid="create-room"
          disabled={busy}
          onClick={create}
        >
          创建房间 <span>→</span>
        </TapButton>
      </section>
    </main>
  );
}

const countText: Record<3 | 4 | 5, string> = {
  5: "5 人 · 各控一个角色",
  4: "4 人 · 一人兼控两名逃生者",
  3: "3 人 · 两人各控两名逃生者",
};
function CountPicker({
  value,
  onChange,
  disabled,
  min = 3,
}: {
  value: 3 | 4 | 5;
  onChange: (n: 3 | 4 | 5) => void;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <div className="count-picker" role="radiogroup" aria-label="玩家人数">
      {([3, 4, 5] as const).map((n) => (
        <TapButton
          key={n}
          role="radio"
          aria-checked={value === n}
          data-testid={"count-" + n}
          className={value === n ? "on" : ""}
          disabled={disabled || n < min}
          onClick={() => onChange(n)}
        >
          <strong>{n} 人</strong>
          <small>{countText[n].split(" · ")[1]}</small>
        </TapButton>
      ))}
    </div>
  );
}

/** 加入（lobby 房间）：只填昵称 */
function JoinRoom({
  room,
  code,
}: {
  room: ReturnType<typeof useRoom>;
  code: string;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const l = room.snap!.lobby;
  const full = l.players.length >= l.playerCount;
  return (
    <main className="lobby room-flow">
      <Brand line={`房间 ${code} · ${l.players.length}/${l.playerCount} 人`} />
      <section className="setup">
        {l.stage !== "lobby" ? (
          <div role="alert" className="error">
            这个房间的游戏已经开始了。
          </div>
        ) : (
          <>
            <label>
              你的昵称
              <input
                data-testid="player-name"
                value={name}
                maxLength={16}
                placeholder="让朋友认得出你"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <TapButton
              className="primary start-button"
              data-testid="join-room"
              disabled={full}
              onClick={async () => {
                const err = await room.claim(undefined, name);
                if (err) setError(err);
              }}
            >
              {full ? "房间已满" : "加入房间"} <span>→</span>
            </TapButton>
          </>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <TapButton onClick={() => goto("/?online=1")}>返回</TapButton>
      </section>
    </main>
  );
}

const sideName = { survivor: "逃生者", killer: "杀手" } as const;

/** 房间：选阵营、报名控两名、房主改人数并开始 */
function LobbyRoom({
  room,
  code,
}: {
  room: ReturnType<typeof useRoom>;
  code: string;
}) {
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(false);
  const snap = room.snap!;
  const l = snap.lobby;
  const me = l.players.find((p) => p.playerId === snap.mySeat)!;
  const act = async (a: Parameters<typeof room.lobby>[0]) => {
    const err = await room.lobby(a);
    setError(err ?? "");
  };
  const full = l.players.length === l.playerCount;
  const ready = full && l.players.every((p) => p.side);
  const killers = l.players.filter((p) => p.side === "killer").length;
  return (
    <main className="lobby room-flow">
      <Brand line={`房间 ${code} · ${l.players.length}/${l.playerCount} 人`} />
      <section className="setup" data-testid="lobby-room">
        <div className="room-title">
          <strong>房间 {code}</strong>
          <TapButton onClick={() => setInvite(true)}>邀请朋友</TapButton>
        </div>
        {invite && (
          <div className="handoff" role="dialog" aria-label="邀请朋友">
            <InvitePanel code={code} onClose={() => setInvite(false)} />
          </div>
        )}
        <h2>你的阵营</h2>
        <div className="side-picker" role="radiogroup" aria-label="选择阵营">
          {(["survivor", "killer"] as const).map((side) => (
            <TapButton
              key={side}
              role="radio"
              aria-checked={me.side === side}
              data-testid={"side-" + side}
              className={"side-" + side + (me.side === side ? " on" : "")}
              onClick={() => act({ type: "SET_SIDE", side })}
            >
              {sideName[side]}
            </TapButton>
          ))}
        </div>
        <p className="small muted">
          多人选杀手时随机一位当杀手，其余当逃生者；没人选杀手时从所有人里随机一位。
        </p>
        {l.playerCount === 4 && me.side !== "killer" && (
          <label className="volunteer">
            <input
              type="checkbox"
              data-testid="volunteer"
              checked={me.volunteer}
              onChange={(e) =>
                act({ type: "SET_VOLUNTEER", volunteer: e.target.checked })
              }
            />
            我愿意一个人操控两名逃生者（没人报名就随机）
          </label>
        )}
        <h2>
          玩家 {l.players.length}/{l.playerCount}
          {killers > 1 && (
            <small className="muted"> · {killers} 人想当杀手，开始时随机</small>
          )}
        </h2>
        <ul className="player-list" data-testid="player-list">
          {l.players.map((p) => (
            <li key={p.playerId} className={p.connected ? "" : "offline"}>
              <strong>
                {p.name ?? "玩家"}
                {p.playerId === snap.mySeat && "（你）"}
              </strong>
              {p.host && <span className="tag">房主</span>}
              <span className={"tag " + (p.side ?? "none")}>
                {p.side ? sideName[p.side] : "未选阵营"}
              </span>
              {l.playerCount === 4 && p.volunteer && p.side !== "killer" && (
                <span className="tag">愿控两名</span>
              )}
              {!p.connected && <small className="muted">离线</small>}
            </li>
          ))}
          {Array.from({ length: l.playerCount - l.players.length }, (_, i) => (
            <li key={"empty" + i} className="empty">
              等待加入…
            </li>
          ))}
        </ul>
        {me.host ? (
          <>
            <h2>人数（房主可改）</h2>
            <CountPicker
              value={l.playerCount}
              min={Math.max(3, l.players.length)}
              onChange={(n) =>
                act({ type: "SET_PLAYER_COUNT", playerCount: n })
              }
            />
            <TapButton
              className="primary start-button"
              data-testid="start-draft"
              disabled={!ready}
              onClick={() => act({ type: "START" })}
            >
              {!full
                ? "等人到齐"
                : !ready
                  ? "等所有人选好阵营"
                  : "开始：分配阵营和地图"}{" "}
              <span>→</span>
            </TapButton>
          </>
        ) : (
          <p className="muted">
            {ready ? "等房主开始…" : "人到齐、都选好阵营后，由房主开始。"}
          </p>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

/** 选角色：杀手三选一，逃生者每个名额二选一 */
function DraftRoom({
  room,
  code,
}: {
  room: ReturnType<typeof useRoom>;
  code: string;
}) {
  const [error, setError] = useState("");
  const snap = room.snap!;
  const l = snap.lobby;
  const d = l.draft!;
  const name = (id: string) =>
    l.players.find((p) => p.playerId === id)?.name ?? "玩家";
  const mine = d.slots.filter((s) => s.playerId === snap.mySeat);
  const [slotIndex, setSlotIndex] = useState(0);
  const phone = usePhone();
  const mapName = maps.maps.find((m) => m.id === d.mapId)?.name_zh;
  return (
    <main className="lobby room-flow">
      <Brand line={`房间 ${code} · 地图：${mapName}`} />
      <section className="setup" data-testid="draft-room">
        <p className="draft-banner">
          杀手是 <strong>{name(d.killerPlayer)}</strong>
          {d.killerPlayer === snap.mySeat && "（你）"}
        </p>
        {phone && mine.length > 1 && (
          <div className="draft-tabs">
            {mine.map((s, i) => (
              <TapButton
                key={s.slotId}
                onClick={() => setSlotIndex(i)}
                aria-pressed={slotIndex === i}
              >
                第 {i + 1} 名{s.pick ? " · 已选" : " · 待选"}
              </TapButton>
            ))}
          </div>
        )}
        {mine.map(
          (s, i) =>
            (!phone || slotIndex === i) && (
              <div key={s.slotId} className="draft-slot">
                <h2>
                  {s.side === "killer"
                    ? "选你的杀手（三选一）"
                    : mine.length > 1
                      ? `选你的第 ${i + 1} 名逃生者（二选一）`
                      : "选你的逃生者（二选一）"}
                </h2>
                <div className="draft-options">
                  {(s.options ?? []).map((c) => (
                    <TapButton
                      key={c}
                      data-testid={`pick-${s.slotId}-${c}`}
                      className={"draft-option" + (s.pick === c ? " on" : "")}
                      disabled={!!s.pick}
                      onClick={async () => {
                        const err = await room.lobby({
                          type: "PICK",
                          slotId: s.slotId,
                          characterId: c,
                        });
                        setError(err ?? "");
                      }}
                    >
                      <Token
                        token={{
                          id: c,
                          kind: "actor",
                          state: "healthy",
                          asset: "portrait_" + c,
                          label: actorName(c),
                          location: "room",
                        }}
                        size={72}
                      />
                      <strong>{actorName(c)}</strong>
                      <small>
                        {chars.characters.find((x) => x.id === c)?.power
                          ?.name_zh ?? ""}
                      </small>
                    </TapButton>
                  ))}
                </div>
              </div>
            ),
        )}
        <h2 className="draft-status-title">大家的选择</h2>
        <ul className="player-list">
          {d.slots.map((s) => (
            <li key={s.slotId}>
              <strong>{name(s.playerId)}</strong>
              <span className={"tag " + s.side}>{sideName[s.side]}</span>
              <span>{s.pick ? actorName(s.pick) : "选择中…"}</span>
            </li>
          ))}
        </ul>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

function SeatPicker({
  room,
  code,
}: {
  room: ReturnType<typeof useRoom>;
  code: string;
}) {
  const phone = usePhone();
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const seats = room.snap!.seats;
  if (phone)
    return (
      <main className="phone-seat">
        <header>
          <strong>房间 {code}</strong>
          <TapButton data-testid="invite" onClick={() => setShowInvite(true)}>
            邀请朋友
          </TapButton>
        </header>
        <h1>选择你的座位</h1>
        <label>
          昵称
          <input
            data-testid="player-name"
            value={name}
            maxLength={16}
            placeholder="可留空"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="phone-seats">
          {seats.map((s) => (
            <TapButton
              key={s.seatId}
              data-testid={"seat-" + s.seatId}
              disabled={s.claimed}
              onClick={async () => {
                const err = await room.claim(s.seatId, name);
                if (err) setError(err);
              }}
            >
              <span>
                {s.actors.map((id) => (
                  <Token
                    key={id}
                    size={48}
                    token={{
                      id,
                      kind: "actor",
                      state: "healthy",
                      asset: "portrait_" + id,
                      label: actorName(id),
                      location: "room",
                    }}
                  />
                ))}
              </span>
              <div>
                <strong>{s.actors.map(actorName).join(" · ")}</strong>
                <small>{s.claimed ? "已有玩家" : "空位 · 点击加入"}</small>
              </div>
            </TapButton>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        {showInvite && (
          <div className="handoff" role="dialog" aria-label="邀请朋友">
            <InvitePanel code={code} onClose={() => setShowInvite(false)} />
          </div>
        )}
      </main>
    );
  return (
    <main className="lobby room-flow">
      <Brand line="选择你要扮演的座位。同一座位只能有一个人，刷新页面会自动回到原座位。" />
      <section className="setup">
        <InvitePanel code={code} />
        <h2>选择座位</h2>
        <label>
          你的昵称
          <input
            data-testid="player-name"
            value={name}
            maxLength={16}
            placeholder="可留空"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="seat-list">
          {seats.map((s) => (
            <TapButton
              key={s.seatId}
              className={"seat " + s.side + (s.claimed ? " taken" : "")}
              data-testid={"seat-" + s.seatId}
              disabled={s.claimed}
              onClick={async () => {
                const err = await room.claim(s.seatId, name);
                if (err) setError(err);
              }}
            >
              <span className="seat-side">
                {s.side === "killer" ? "杀手" : "逃生者"}
              </span>
              <strong>{s.actors.map(actorName).join(" · ")}</strong>
              <small>
                {s.claimed
                  ? `${s.name ?? "已有玩家"}${s.connected ? " · 在线" : " · 离线"}`
                  : "空位 · 点击加入"}
              </small>
            </TapButton>
          ))}
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

function RoomView({ code }: { code: string }) {
  const room = useRoom(code);
  if (room.error && !room.snap)
    return (
      <main className="lobby room-flow">
        <Brand line="" />
        <section className="setup">
          <div role="alert" className="error">
            {room.error}
          </div>
          <TapButton className="primary" onClick={() => goto("/?online=1")}>
            返回联机大厅
          </TapButton>
        </section>
      </main>
    );
  if (!room.snap)
    return (
      <main className="lobby room-flow">
        <p className="muted">正在连接房间 {code} …</p>
      </main>
    );
  const l = room.snap.lobby;
  if (l.mode === "preset" && !room.snap.mySeat)
    return <SeatPicker room={room} code={code} />;
  if (l.mode === "lobby" && !room.snap.mySeat)
    return <JoinRoom room={room} code={code} />;
  if (l.stage === "lobby") return <LobbyRoom room={room} code={code} />;
  if (l.stage === "draft") return <DraftRoom room={room} code={code} />;
  if (!room.snap.view || !room.snap.mySeat)
    return (
      <main className="lobby room-flow">
        <p className="muted">正在进入对局…</p>
      </main>
    );
  const net: NetBinding = {
    code,
    seat: room.snap.mySeat,
    version: room.snap.version,
    view: room.snap.view,
    seats: room.snap.seats,
    connected: room.connected,
    send: room.send,
    leave: () => goto("/?online=1"),
  };
  return <App net={net} />;
}

export function Online() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  const code = params().get("room");
  return code ? (
    <RoomView key={code} code={code.toUpperCase()} />
  ) : (
    <CreateOrJoin />
  );
}
