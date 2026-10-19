import React, { useEffect, useState } from "react";
import { maps, chars } from "../../../packages/game-engine/src/data.ts";
import { actorName } from "../../../packages/game-engine/src/index.ts";
import { App } from "./App.tsx";
import { SettingsButton } from "./Settings.tsx";
import { Token } from "./Token.tsx";
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
    if (!local) return setUrl(location.origin + path);
    fetch("/api/info")
      .then((r) => r.json())
      .then((info: { port: number; lan: string[] }) =>
        setUrl(
          info.lan[0]
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
        <button className="primary" onClick={onClose}>
          关闭
        </button>
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
        <a href="/">← 本机热座模式</a>
      </p>
    </div>
  );
}

function CreateOrJoin() {
  const survivors = chars.characters.filter((c) => c.side === "survivor");
  const killers = chars.characters.filter((c) => c.side === "killer");
  const [mapId, setMapId] = useState(maps.maps[0].id);
  const [playerCount, setPlayerCount] = useState<3 | 4 | 5>(5);
  const [picked, setPicked] = useState(["dwight", "meg", "claudette", "jake"]);
  const [killer, setKiller] = useState("trapper");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const seed = Number(params().get("seed")); // 仅测试服务器接受
    const res = await createRoom({
      mapId,
      playerCount,
      survivors: picked,
      killer,
      ...(seed ? { seed } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    goto(`/?room=${res.code}`);
  }
  return (
    <main className="lobby">
      <Brand line="一台电脑开房间，大家用自己的手机加入。每个人只看得到自己的秘密移动牌。" />
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
          <button className="primary" type="submit">
            加入
          </button>
        </form>
        <h2>创建房间</h2>
        <label>
          地图
          <select
            data-testid="map-select"
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
          >
            {maps.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name_zh}
              </option>
            ))}
          </select>
        </label>
        <label>
          玩家人数
          <select
            value={playerCount}
            data-testid="player-count"
            onChange={(e) =>
              setPlayerCount(Number(e.target.value) as 3 | 4 | 5)
            }
          >
            <option value={5}>5人 · 各控一个角色</option>
            <option value={4}>4人 · 一人兼控两名逃生者</option>
            <option value={3}>3人 · 两人各控两名逃生者</option>
          </select>
        </label>
        <fieldset>
          <legend>逃生者</legend>
          <div className="setup-row">
            {picked.map((v, i) => (
              <label key={i}>
                角色 {i + 1}
                <select
                  data-testid={"survivor-" + i}
                  value={v}
                  onChange={(e) =>
                    setPicked((p) =>
                      p.map((x, j) => (i === j ? e.target.value : x)),
                    )
                  }
                >
                  {survivors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_zh}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          杀手
          <select
            data-testid="killer-select"
            value={killer}
            onChange={(e) => setKiller(e.target.value)}
          >
            {killers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_zh}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <button
          className="primary start-button"
          data-testid="create-room"
          disabled={busy}
          onClick={create}
        >
          创建房间 <span>→</span>
        </button>
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
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const seats = room.snap!.seats;
  return (
    <main className="lobby">
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
            <button
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
            </button>
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
      <main className="lobby">
        <Brand line="" />
        <section className="setup">
          <div role="alert" className="error">
            {room.error}
          </div>
          <button className="primary" onClick={() => goto("/?online=1")}>
            返回联机大厅
          </button>
        </section>
      </main>
    );
  if (!room.snap)
    return (
      <main className="lobby">
        <p className="muted">正在连接房间 {code} …</p>
      </main>
    );
  if (!room.snap.mySeat) return <SeatPicker room={room} code={code} />;
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
