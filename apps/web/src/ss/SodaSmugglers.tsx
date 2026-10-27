import React, { useEffect, useState } from "react";
import { ActionDock, CountdownRing } from "../dm/Polish.tsx";
import { feel } from "../drawing/feel.ts";
import { EVENT_NAMES } from "../../../../packages/soda-smugglers/src/index.ts";
import { useSSRoom } from "./ss-net.ts";
import "./ss.css";
export function SodaSmugglers() {
  const net = useSSRoom();
  const s = net.snapshot,
    v = s?.view;
  const [name, setName] = useState(""),
    [room, setRoom] = useState(
      new URLSearchParams(location.search).get("room") ?? "",
    ),
    [selected, setSelected] = useState<string[]>([]),
    [bribe, setBribe] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + net.offset.current), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setSelected([]);
    setBribe("");
  }, [v?.round, s?.mySeat]);
  useEffect(() => {
    if (v?.phase) feel("turn");
  }, [v?.phase]);
  const seat = s?.players.findIndex((p) => p.id === s.mySeat) ?? -1;
  const me = v?.players[seat];
  const host = s?.mySeat === s?.hostId;
  const guard = seat === v?.guard;
  const bagCount = v?.event === "holiday" ? 3 : 2;
  const act = net.act;
  const phaseLabels = {
    PACK: "秘密装包",
    BRIBE: "受贿",
    INSPECT: "检查",
    ARREST: "逮捕",
    ROUND_END: "本轮结束",
    FINISHED: "本局结束",
  };
  const canSubmit =
    !!v && v.phase === "PACK" && seat !== v.guard && !me?.submitted;
  const blocked = net.pending || !net.online;
  return (
    <main className="ss-world" data-testid="ss-world">
      <header>
        <strong>汽水走私犯</strong>
        <span data-testid="ss-room">{s?.code ?? "联机房间"}</span>
        {v && (
          <span>
            第 {v.round}/{v.totalRounds} 轮
          </span>
        )}
        {v?.deadline && (
          <span className="ss-clock">
            <CountdownRing
              left={Math.max(0, Math.ceil((v.deadline - now) / 1000))}
              total={s?.seconds ?? 60}
            />
            {Math.max(0, Math.ceil((v.deadline - now) / 1000))}秒
          </span>
        )}
      </header>
      {!net.online && (
        <p className="ss-disconnect" role="status">
          重连中…
        </p>
      )}
      {net.error && <p role="alert">{net.error}</p>}
      {!s ? (
        <section>
          <h1>汽水走私犯 Soda Smugglers</h1>
          <label>
            昵称
            <input
              data-testid="ss-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={12}
            />
          </label>
          <button
            data-testid="ss-create"
            disabled={blocked}
            onClick={() => net.create(name)}
          >
            创建房间
          </button>
          <label>
            房间号
            <input
              data-testid="ss-code"
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
            />
          </label>
          <button
            data-testid="ss-join"
            disabled={blocked}
            onClick={() => net.join(room, name)}
          >
            加入房间
          </button>
        </section>
      ) : !s.mySeat ? (
        <section>
          <label>
            昵称
            <input
              data-testid="ss-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            data-testid="ss-claim"
            disabled={blocked}
            onClick={() => net.claim(name)}
          >
            入座
          </button>
        </section>
      ) : !v ? (
        <section>
          <h1>还差 {s.count - s.players.length} 人</h1>
          <p>
            首位缉私警长：
            {s.firstGuard === "random"
              ? "开局随机指定"
              : (s.players[s.firstGuard]?.name ?? `${s.firstGuard + 1}号座位`)}
          </p>
          {host && (
            <fieldset disabled={blocked}>
              <legend>房主设置</legend>
              <label>
                人数
                <select
                  data-testid="ss-count"
                  value={s.count}
                  onChange={(e) =>
                    act({ type: "SET_SETTINGS", count: Number(e.target.value) })
                  }
                >
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}人
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  data-testid="ss-events"
                  type="checkbox"
                  checked={s.events}
                  onChange={(e) =>
                    act({ type: "SET_SETTINGS", events: e.target.checked })
                  }
                />
                随机事件（默认关）
              </label>
              <label>
                计时
                <select
                  data-testid="ss-seconds"
                  value={s.seconds}
                  onChange={(e) =>
                    act({
                      type: "SET_SETTINGS",
                      seconds: Number(e.target.value) as 0 | 60 | 120,
                    })
                  }
                >
                  <option value={0}>不限时</option>
                  <option value={60}>60秒</option>
                  <option value={120}>120秒</option>
                </select>
              </label>
              <label>
                房主指定
                <select
                  data-testid="ss-first-guard"
                  value={s.firstGuard}
                  onChange={(e) =>
                    act({
                      type: "SET_SETTINGS",
                      firstGuard: Number(e.target.value),
                    })
                  }
                >
                  {s.firstGuard === "random" && (
                    <option value="random">开局随机</option>
                  )}
                  {Array.from({ length: s.count }, (_, i) => (
                    <option key={i} value={i}>
                      {i + 1}号 {s.players[i]?.name ?? "待入座"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                data-testid="ss-random-guard"
                onClick={() => act({ type: "RANDOM_GUARD" })}
              >
                随机指定
              </button>
            </fieldset>
          )}
          <button
            onClick={() =>
              navigator.clipboard
                ?.writeText(location.href)
                .catch(() => net.setError("复制失败，请复制地址栏链接"))
            }
          >
            复制邀请链接
          </button>
          <ActionDock hint="全员准备后由房主开始">
            <button
              data-testid="ss-ready"
              disabled={blocked}
              onClick={() => act({ type: "READY" })}
            >
              {s.players[seat].ready ? "取消准备" : "准备"}
            </button>
            {host && (
              <button
                data-testid="ss-start"
                disabled={
                  blocked ||
                  s.players.length !== s.count ||
                  !s.players.every((p) => p.ready)
                }
                onClick={() => act({ type: "START" })}
              >
                开始对局
              </button>
            )}
          </ActionDock>
        </section>
      ) : (
        <section>
          <h1 data-testid="ss-phase">{phaseLabels[v.phase]}</h1>
          <p>
            缉私警长：{v.players[v.guard].name}　
            {v.event ? `随机事件：${EVENT_NAMES[v.event]}` : "无随机事件"}
          </p>
          {v.phase === "PACK" && seat !== v.guard && (
            <div className="ss-hand" data-testid="ss-hand">
              {me?.hand?.map((c) => (
                <button
                  key={c.id}
                  data-testid={`ss-card-${c.id}`}
                  aria-pressed={selected.includes(c.id) || bribe === c.id}
                  disabled={blocked || !canSubmit}
                  onClick={() => {
                    feel("tap");
                    if (selected.includes(c.id)) {
                      setSelected(selected.filter((x) => x !== c.id));
                    } else if (selected.length < bagCount) {
                      setSelected([...selected, c.id]);
                      if (bribe === c.id) setBribe("");
                    } else setBribe(bribe === c.id ? "" : c.id);
                  }}
                >
                  手提箱 {c.bottles} 瓶
                  {selected.includes(c.id)
                    ? " · 行李"
                    : bribe === c.id
                      ? " · 贿赂"
                      : ""}
                </button>
              ))}
            </div>
          )}
          <div className="ss-seats">
            {v.players.map((p, i) => (
              <article key={i} data-testid={`ss-seat-${i}`}>
                <h2>
                  {i + 1}号 {p.name} · {p.caps}瓶盖
                </h2>
                <p>
                  {i === v.guard
                    ? "🔍缉私警长"
                    : p.settled
                      ? "✅已结算"
                      : p.submitted
                        ? "✅已提交"
                        : "选择中"}
                  {v.pendingDog === i ? " · 等待翻箱" : ""}
                </p>
                {i !== v.guard && (
                  <>
                    <p>贿赂：{p.bribe?.bottles ?? "未公开"}</p>
                    <p>
                      行李：
                      {p.luggage
                        .map((c) => (c === null ? "🔒" : `${c.bottles}瓶`))
                        .join(" / ")}
                    </p>
                  </>
                )}
                {guard &&
                  !p.settled &&
                  i !== v.guard &&
                  v.pendingDog === null && (
                    <div className="ss-target-actions">
                      {v.phase === "BRIBE" && (
                        <>
                          <button
                            data-testid={`ss-accept-${i}`}
                            disabled={blocked || v.budget.bribe === 0}
                            onClick={() => act({ type: "ACCEPT", target: i })}
                          >
                            接受贿赂
                          </button>
                          {v.event === "night" && !v.eventUsed && (
                            <button
                              data-testid={`ss-event-accept-${i}`}
                              disabled={blocked}
                              onClick={() =>
                                act({
                                  type: "ACCEPT",
                                  target: i,
                                  useEvent: true,
                                })
                              }
                            >
                              起早贪黑
                            </button>
                          )}
                        </>
                      )}
                      {v.phase === "INSPECT" &&
                        p.luggage.map(
                          (c, j) =>
                            c === null && (
                              <button
                                key={j}
                                data-testid={`ss-inspect-${i}-${j}`}
                                disabled={
                                  blocked ||
                                  v.budget.inspect === 0 ||
                                  p.luggage.some((x) => x !== null)
                                }
                                onClick={() =>
                                  act({ type: "INSPECT", target: i, index: j })
                                }
                              >
                                检查第{j + 1}箱
                              </button>
                            ),
                        )}
                      {v.phase === "INSPECT" &&
                        !v.eventUsed &&
                        v.event === "inspection" &&
                        p.luggage.map(
                          (c, j) =>
                            c === null && (
                              <button
                                key={j}
                                data-testid={`ss-event-inspect-${i}-${j}`}
                                disabled={blocked}
                                onClick={() =>
                                  act({
                                    type: "INSPECT",
                                    target: i,
                                    index: j,
                                    useEvent: true,
                                  })
                                }
                              >
                                领导视察第{j + 1}箱
                              </button>
                            ),
                        )}
                      {v.phase === "INSPECT" &&
                        !v.eventUsed &&
                        v.event === "dog" &&
                        p.luggage.every((x) => x === null) && (
                          <button
                            data-testid={`ss-dog-${i}`}
                            disabled={blocked}
                            onClick={() =>
                              act({
                                type: "INSPECT",
                                target: i,
                                useEvent: true,
                              })
                            }
                          >
                            缉私犬长
                          </button>
                        )}
                      {v.phase === "ARREST" && (
                        <>
                          <button
                            data-testid={`ss-arrest-${i}`}
                            disabled={blocked || v.budget.arrest === 0}
                            onClick={() => act({ type: "ARREST", target: i })}
                          >
                            逮捕
                          </button>
                          {v.event === "impartial" && !v.eventUsed && (
                            <button
                              data-testid={`ss-event-arrest-${i}`}
                              disabled={blocked}
                              onClick={() =>
                                act({
                                  type: "ARREST",
                                  target: i,
                                  useEvent: true,
                                })
                              }
                            >
                              铁面无私
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
              </article>
            ))}
          </div>
          <ActionDock
            hint={
              v.phase === "FINISHED"
                ? "本局结束"
                : v.phase === "ROUND_END"
                  ? "本轮结束，等待进入下一轮"
                  : canSubmit
                    ? `先选${bagCount}张行李，再选1张贿赂牌`
                    : v.pendingDog !== null
                      ? `等待 ${v.players[v.pendingDog].name} 翻开最多瓶的一箱`
                      : guard
                        ? "由你选择行动或进入下一阶段"
                        : `等待 ${v.players[v.guard].name}…`
            }
          >
            {canSubmit ? (
              <button
                data-testid="ss-submit"
                disabled={blocked || selected.length !== bagCount || !bribe}
                onClick={() =>
                  act({ type: "SUBMIT", luggage: selected, bribe })
                }
              >
                提交并锁定
              </button>
            ) : v.pendingDog === seat ? (
              me?.luggage.map(
                (c, i) =>
                  c && (
                    <button
                      key={i}
                      data-testid={`ss-reveal-dog-${i}`}
                      disabled={blocked}
                      onClick={() => act({ type: "REVEAL_DOG", index: i })}
                    >
                      翻开第{i + 1}箱（{c.bottles}瓶）
                    </button>
                  ),
              )
            ) : guard && ["BRIBE", "INSPECT", "ARREST"].includes(v.phase) ? (
              <>
                <button
                  data-testid="ss-advance"
                  disabled={blocked || v.pendingDog !== null}
                  onClick={() => act({ type: "ADVANCE" })}
                >
                  {v.phase === "ARREST"
                    ? "结束行动，放行其余旅客"
                    : "进入下一阶段"}
                </button>
                {v.phase === "BRIBE" &&
                  v.event === "greedy" &&
                  !v.history.some(
                    (a) => a.round === v.round && a.type === "ACCEPT",
                  ) && (
                    <button
                      data-testid="ss-greedy"
                      disabled={blocked}
                      onClick={() => act({ type: "GREEDY" })}
                    >
                      全收全放
                    </button>
                  )}
              </>
            ) : guard && v.phase === "ROUND_END" ? (
              <button
                data-testid="ss-next-round"
                disabled={blocked}
                onClick={() => act({ type: "NEXT_ROUND" })}
              >
                下一轮
              </button>
            ) : v.phase === "FINISHED" ? (
              <>
                <p data-testid="ss-result">
                  获胜：
                  {v.result?.winners.map((i) => v.players[i].name).join("、")}
                </p>
                {host && (
                  <button
                    disabled={blocked}
                    data-testid="ss-rematch"
                    onClick={() => act({ type: "REMATCH" })}
                  >
                    再来一局
                  </button>
                )}
              </>
            ) : (
              <button disabled>等待其他玩家…</button>
            )}
          </ActionDock>
        </section>
      )}
      {s && !v && (
        <ul>
          {s.players.map((p) => (
            <li key={p.id}>
              {p.seat + 1}号 {p.name} {p.ready ? "✅已准备" : "未准备"}{" "}
              {p.connected ? "在线" : "离线"}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
