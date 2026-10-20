import { TapButton } from "./TapButton.tsx";
import React, { useState } from "react";
import type { CreateOptions } from "../../../packages/shared/src/types.ts";
import { maps, chars } from "../../../packages/game-engine/src/data.ts";
import { Token } from "./Token.tsx";
import { Illustration } from "./Illustration.tsx";
export function PhoneSetup({
  options,
  setOptions,
  count,
  setCount,
  start,
  error,
  online = false,
  busy = false,
  join,
}: {
  options: CreateOptions;
  setOptions: (o: CreateOptions) => void;
  count: number;
  setCount: (n: number) => void;
  start: () => void;
  error: string;
  online?: boolean;
  busy?: boolean;
  join?: (code: string) => void;
}) {
  const [step, setStep] = useState(0),
    [code, setCode] = useState(""),
    [joining, setJoining] = useState(false);
  const titles = [
    "选择地图",
    "选择四名逃生者",
    "选择杀手",
    "确认玩家人数",
    "准备开始",
  ];
  return (
    <main className="phone-setup" data-testid="phone-setup">
      <Illustration id="lobby" className="setup-atmosphere" />
      <header>
        <strong>
          黎明杀机<span>桌游版</span>
        </strong>
        <a href={online ? "/" : "/?online=1"}>
          {online ? "热座模式" : "联机对战"}
        </a>
      </header>
      <div className="setup-step">
        <small>
          {online ? "私人联机" : "本机热座"} · {step + 1}/5
        </small>
        <h1>{titles[step]}</h1>
      </div>
      <section className="setup-stage">
        {step === 0 && (
          <>
            <div className="map-choices">
              {maps.maps.map((m) => (
                <TapButton
                  key={m.id}
                  data-map-choice={m.id}
                  aria-pressed={options.mapId === m.id}
                  onClick={() => setOptions({ ...options, mapId: m.id })}
                >
                  <img
                    src={`/assets/mobile/rooms/${m.id === "macmillan_estate" ? "mine_entrance" : "wreckers_garage_north"}.webp`}
                    alt=""
                  />
                  <strong>{m.name_zh}</strong>
                  <span>{m.nodes.length}个房间</span>
                </TapButton>
              ))}
            </div>
            {join && (
              <>
                <TapButton
                  className="join-entry"
                  onClick={() => setJoining((v) => !v)}
                >
                  已有房间号？加入朋友
                </TapButton>
                {joining && (
                  <form
                    className="join-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (code.trim()) join(code.trim().toUpperCase());
                    }}
                  >
                    <input
                      data-testid="join-code"
                      aria-label="房间号"
                      placeholder="4位房间号"
                      maxLength={4}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <TapButton className="primary" type="submit">
                      加入
                    </TapButton>
                  </form>
                )}
              </>
            )}
          </>
        )}
        {(step === 1 || step === 2) && (
          <>
            <div className="roster-heading">
              <span>
                {step === 1
                  ? `已选 ${options.survivors.length}/4，按顺序行动`
                  : "一名杀手对四名逃生者"}
              </span>
              {step === 1 && (
                <TapButton
                  data-testid="clear-survivors"
                  onClick={() => setOptions({ ...options, survivors: [] })}
                >
                  清空
                </TapButton>
              )}
            </div>
            <div className="phone-roster">
              {chars.characters
                .filter((c) => c.side === (step === 1 ? "survivor" : "killer"))
                .map((c) => (
                  <TapButton
                    key={c.id}
                    data-character-choice={c.id}
                    aria-pressed={
                      step === 1
                        ? options.survivors.includes(c.id)
                        : options.killer === c.id
                    }
                    onClick={() =>
                      step === 1
                        ? setOptions({
                            ...options,
                            survivors: options.survivors.includes(c.id)
                              ? options.survivors.filter((id) => id !== c.id)
                              : options.survivors.length < 4
                                ? [...options.survivors, c.id]
                                : options.survivors,
                          })
                        : setOptions({ ...options, killer: c.id })
                    }
                  >
                    <Token
                      token={{
                        id: c.id,
                        kind: "actor",
                        state: "healthy",
                        asset: "portrait_" + c.id,
                        label: c.name_zh,
                        location: "room",
                      }}
                      size={64}
                    />
                    <span>{c.name_zh}</span>
                    {step === 1 && options.survivors.includes(c.id) && (
                      <b>{options.survivors.indexOf(c.id) + 1}</b>
                    )}
                  </TapButton>
                ))}
            </div>
          </>
        )}
        {step === 3 && (
          <div className="player-choices">
            {[5, 4, 3].map((n) => (
              <TapButton
                key={n}
                data-player-count={n}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                <strong>{n}人</strong>
                <span>
                  {n === 5
                    ? "每人控制一名角色"
                    : n === 4
                      ? "一名玩家兼控两位逃生者"
                      : "两名玩家各控制两位逃生者"}
                </span>
              </TapButton>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="setup-review">
            <p>
              {maps.maps.find((m) => m.id === options.mapId)?.name_zh} · {count}
              名玩家
            </p>
            <div className="review-portraits">
              {[...options.survivors, options.killer].map((id) => (
                <Token
                  key={id}
                  token={{
                    id,
                    kind: "actor",
                    state: "healthy",
                    asset: "portrait_" + id,
                    label: chars.characters.find((c) => c.id === id)!.name_zh,
                    location: "room",
                  }}
                  size={56}
                />
              ))}
            </div>
            <p>
              {online
                ? "创建后将显示房间号和邀请二维码。"
                : "轮流操作时，会遮挡其他玩家的秘密移动牌。"}
            </p>
            {!online && (
              <label className="seed-setting">
                对局种子
                <input
                  type="number"
                  data-testid="seed-input"
                  value={options.seed}
                  onChange={(e) =>
                    setOptions({ ...options, seed: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
        )}
      </section>
      {error && (
        <p className="setup-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <TapButton
          disabled={step === 0 || busy}
          onClick={() => setStep((s) => s - 1)}
        >
          上一步
        </TapButton>
        {step < 4 ? (
          <TapButton
            className="primary"
            data-testid="setup-next"
            disabled={step === 1 && options.survivors.length !== 4}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步
          </TapButton>
        ) : (
          <TapButton
            className="primary"
            data-testid={online ? "create-room" : "start"}
            disabled={busy}
            onClick={start}
          >
            {busy ? "正在创建…" : online ? "创建房间" : "布置棋盘"}
          </TapButton>
        )}
      </footer>
    </main>
  );
}
