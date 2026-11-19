import { useEffect, useRef, useState } from "react";
import "./skull-king.css";
import { useSKRoom } from "./sk-net.ts";
import {
  CARDS,
  SUIT_NAME,
  PIRATE_NAME,
  PIRATE_SKILL,
  SCHEDULES,
  cardName,
  countsFor,
  sortHand,
  type Played,
  type SKView,
  type TrickResult,
  type ScheduleKey,
  type Suit,
} from "../../../../packages/skull-king/src/index.ts";

type Room = ReturnType<typeof useSKRoom>;
const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const SUIT_ICON: Record<Suit, string> = { green: "🦜", purple: "🗺️", yellow: "💰", black: "☠️" };
const KIND_ICON: Record<string, string> = { escape: "🏳️", pirate: "🏴‍☠️", tigress: "🐯", king: "👑", mermaid: "🧜‍♀️", kraken: "🐙", whale: "🐋", loot: "🪙" };

/* ---------------- 动画帧 ---------------- */
const ASSET = "/assets/skullking/";
const frames = (name: string, n: number) => Array.from({ length: n }, (_, i) => `${ASSET}${name}-${String(i).padStart(2, "0")}.webp`);
const FX = { kraken: frames("fx/kraken", 16), whale: frames("fx/whale", 16), coins: frames("fx/win-coins", 16), reveal: frames("ui/bid-reveal", 12) };
const preloaded = new Set<string>();
function preload(list: string[]) {
  for (const src of list)
    if (!preloaded.has(src)) {
      preloaded.add(src);
      const im = new Image();
      im.src = src;
    }
}
function Sprite({ list, ms = 50, className, hold = true }: { list: string[]; ms?: number; className?: string; hold?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const t = setInterval(() => setI((k) => (k + 1 < list.length ? k + 1 : hold ? k : (clearInterval(t), k))), ms);
    return () => clearInterval(t);
  }, [list]);
  return <img className={className} src={list[i]} alt="" draggable={false} />;
}
const BONUS_IMG = new Set([10, 20, 30, 40]);

/* ---------------- 卡牌 ---------------- */
export function SKCard({ id, as, size = "md", selected, dim, onClick, testid }: { id: number; as?: "pirate" | "escape"; size?: "sm" | "md" | "lg"; selected?: boolean; dim?: boolean; onClick?: () => void; testid?: string }) {
  const c = CARDS[id];
  const [art, setArt] = useState(true);
  const El = onClick ? "button" : "span";
  const cls = c.kind === "suit" ? "suit-" + c.suit : "kind-" + c.kind;
  return (
    <El
      {...(onClick ? { type: "button" as const } : {})}
      className={`sk-card sk-${size} ${cls}${selected ? " sel" : ""}${dim ? " dim" : ""}`}
      onClick={onClick}
      aria-label={cardName(id)}
      data-testid={testid ?? `sk-card-${id}`}
    >
      {c.kind === "suit" ? (
        <>
          <span className="sk-num tl">{c.n}</span>
          <span className="sk-icon">{SUIT_ICON[c.suit!]}</span>
          <span className="sk-num br">{c.n}</span>
        </>
      ) : (
        <>
          <span className="sk-icon">{KIND_ICON[c.kind]}</span>
          <span className="sk-label">{c.kind === "pirate" ? PIRATE_NAME[c.pirate!].replace(/·.*/, "").slice(0, 4) : cardName(id)}</span>
          {c.kind === "pirate" && <span className="sk-sub">海盗</span>}
        </>
      )}
      {art && <img className="sk-art" src={`/assets/skullking/cards/${c.key}.webp`} alt="" onError={() => setArt(false)} />}
      {art && c.kind === "suit" && <span className="sk-badge">{c.n}</span>}
      {as && <span className={`sk-as ${as}`}>{as === "pirate" ? "当海盗" : "当逃跑"}</span>}
    </El>
  );
}

/* ---------------- 规则 ---------------- */
const RULES = (
  <div className="sk-rules">
    <h3>目标</h3>
    <p>每轮先猜自己能赢几墩，<b>正好猜中</b>才得分。打完所有轮，总分最高的人成为七海船长。</p>
    <h3>轮数与发牌</h3>
    <p>标准 10 轮：第 1 轮每人 1 张，第 2 轮 2 张……第 10 轮 10 张。每轮全部牌重新洗。7–8 人时牌不够，最后几轮重复发能平均发的最大张数（8 人第 9、10 轮各 8 张）。发牌人轮流向左换。</p>
    <h3>下注</h3>
    <p>看完手牌，所有人同时亮出自己猜的墩数（0 到本轮张数）。</p>
    <h3>出牌</h3>
    <p>发牌人左手边先出，顺时针每人一张为一墩，最大的人收下这墩并先出下一墩。</p>
    <p>
      <b>跟色：</b>第一张数字牌决定花色，有这个颜色的数字牌就必须出这个颜色；没有才能出别的颜色。<b>特殊牌随时都能出</b>，不受跟色限制。
    </p>
    <h3>牌的大小</h3>
    <img className="sk-hier" src="/assets/skullking/ui/hierarchy.webp" alt="克制关系：海盗克美人鱼，美人鱼克骷髅王，骷髅王克海盗" />
    <ul>
      <li>数字牌：鹦鹉🦜、藏宝图🗺️、宝箱💰 三色，各 1–14。跟出的颜色里数字大的赢；别的颜色不能赢。</li>
      <li>骷髅旗☠️（黑色）是王牌，比其他三色都大。</li>
      <li>🏳️ 逃跑：永远输。全是逃跑时第一张赢。</li>
      <li>🏴‍☠️ 海盗：大过所有数字牌。几个海盗同墩，先出的赢。</li>
      <li>🐯 母老虎：打出时自选当海盗或当逃跑。</li>
      <li>👑 骷髅王：大过所有海盗和数字牌，只怕美人鱼。</li>
      <li>🧜‍♀️ 美人鱼：大过数字牌，输给海盗；但能诱捕骷髅王。两条同墩先出的赢。</li>
      <li>海盗、骷髅王、美人鱼三者同墩：美人鱼赢。</li>
    </ul>
    <h3>特殊引牌</h3>
    <p>逃跑（或当逃跑的母老虎、战利品）开头：下一个出数字牌的人决定花色。海盗/骷髅王/美人鱼/巨兽开头：这墩没有花色，随便出。</p>
    <h3>骷髅王计分（经典）</h3>
    <ul>
      <li>猜 1 墩以上并猜中：每墩 +20。猜错：差几墩扣几个 10。</li>
      <li>猜 0 墩并做到：+10 × 本轮张数；吃到墩：−10 × 本轮张数。</li>
    </ul>
    <h3>奖励分（必须猜中才拿）</h3>
    <ul>
      <li>收到鹦鹉/藏宝图/宝箱 14：每张 +10；收到黑色 14：+20（谁出的都算）。</li>
      <li>海盗赢下美人鱼：每条 +20。骷髅王赢下海盗：每个 +30。美人鱼赢下骷髅王：+40。</li>
      <li>母老虎当逃跑时被收走不算奖励。</li>
    </ul>
    <h3>无赖计分（可选）</h3>
    <p>每轮人人潜在分数相同：10 × 本轮张数。猜中拿全部（奖励也全拿），差 1 拿一半（奖励也一半），差 2 以上 0 分。</p>
    <p>加炮弹规则时，下注后再同时选：霰弹＝按上面算；炮弹＝猜中得 15 × 张数（加全部奖励），差 1 也是 0。</p>
    <h3>进阶牌（可选）</h3>
    <ul>
      <li>🐙 克拉肯：这墩直接作废谁也不赢；本来会赢的人带下一墩。</li>
      <li>🐋 白鲸：所有特殊牌失效，数字牌不分颜色比大小（相同先出赢）；只有特殊牌就作废，白鲸主人带下一墩。</li>
      <li>克拉肯和白鲸同墩：后出的那只生效，先出的当逃跑。</li>
      <li>🪙 战利品（2 张）：当逃跑打出；收走它的人和你结盟，本轮两人都猜中各 +20。</li>
    </ul>
    <h3>海盗技能（可选）</h3>
    <p>用海盗<b>赢下</b>一墩才能立刻发动（只被收走不算），不能留到下一轮。最后一墩只有哈利能用。</p>
    <ul>
      {(["rosie", "bendt", "rascal", "juanita", "harry"] as const).map((p) => (
        <li key={p}>
          <b>{PIRATE_NAME[p]}</b>：{PIRATE_SKILL[p]}
        </li>
      ))}
    </ul>
    <h3>双人局</h3>
    <p>额外发一手给「灰胡子幽灵」。他不下注不计分，永远第二个出（从他那手牌顶上翻一张），不用跟色，母老虎当逃跑；他赢了就由他带下一墩。两名玩家每轮轮流先出。</p>
  </div>
);

function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="sk-sheet-bg" onClick={onClose}>
      <div className="sk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sk-sheet-head">
          <b>{title}</b>
          {onClose && (
            <button type="button" className="sk-x" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Logo() {
  const [img, setImg] = useState(true);
  return (
    <div className="sk-logo">
      {img ? (
        <img className="sk-logo-img" src="/assets/skullking/logo.webp" alt="骷髅王" onError={() => setImg(false)} />
      ) : (
        <>
          <span className="sk-logo-skull">💀</span>
          <span className="sk-logo-cn">骷髅王</span>
          <span className="sk-logo-en">海盗猜墩</span>
        </>
      )}
    </div>
  );
}

/* ---------------- 大厅 ---------------- */
function Toggle({ on, label, desc, onClick, disabled }: { on: boolean; label: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`sk-toggle${on ? " on" : ""}`} onClick={onClick} disabled={disabled}>
      <span className="sk-toggle-dot" />
      <span>
        <b>{label}</b>
        <small>{desc}</small>
      </span>
    </button>
  );
}

function Lobby({ room }: { room: Room }) {
  const [name, setName] = useState(storage.get("sk:name") ?? "");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("room") ?? "");
  const [rules, setRules] = useState(false);
  const s = room.snapshot;
  const save = (n: string) => {
    setName(n);
    storage.set("sk:name", n);
  };
  const rulesSheet = rules && (
    <Sheet title="骷髅王 · 规则" onClose={() => setRules(false)}>
      {RULES}
    </Sheet>
  );
  if (!s || !s.mySeat) {
    return (
      <div className="sk-lobby">
        <Logo />
        <p className="sk-sub">2–8 人 · 海盗吃墩 · 猜中几墩才得分</p>
        <label className="sk-field">
          昵称
          <input value={name} maxLength={12} onChange={(e) => save(e.target.value)} placeholder="你的名字" data-testid="sk-name" />
        </label>
        {s ? (
          <button className="sk-btn main" disabled={room.pending} onClick={() => room.claim(name)} data-testid="sk-claim">
            加入房间 {s.code}
          </button>
        ) : (
          <>
            <button className="sk-btn main" disabled={room.pending} onClick={() => room.create(name)} data-testid="sk-create">
              创建房间
            </button>
            <div className="sk-join">
              <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="房间号" data-testid="sk-code" />
              <button className="sk-btn" disabled={room.pending || code.length !== 4} onClick={() => room.join(code, name)} data-testid="sk-join">
                加入
              </button>
            </div>
          </>
        )}
        <button className="sk-link" onClick={() => setRules(true)}>
          📖 规则说明
        </button>
        <a className="sk-link" href="/">
          ← 返回游戏大厅
        </a>
        {room.error && <p className="sk-err">{room.error}</p>}
        {rulesSheet}
      </div>
    );
  }
  const host = s.hostId === s.mySeat;
  const me = s.players.find((p) => p.id === s.mySeat)!;
  const full = s.players.length === s.count;
  const allReady = full && s.players.every((p) => p.ready);
  const link = location.origin + "/?game=sk&room=" + s.code;
  const st = s.settings;
  const set = (patch: Omit<Extract<Parameters<Room["act"]>[0], { type: "SET_SETTINGS" }>, "type">) => room.act({ type: "SET_SETTINGS", ...patch });
  const counts = countsFor(s.count, st);
  return (
    <div className="sk-lobby">
      <Logo />
      <div className="sk-code">
        房间号 <b data-testid="sk-room-code">{s.code}</b>
        <button className="sk-btn sm" onClick={() => navigator.clipboard?.writeText(link).catch(() => {})}>
          复制邀请链接
        </button>
      </div>
      <div className="sk-seats">
        {Array.from({ length: s.count }, (_, i) => {
          const p = s.players[i];
          return (
            <div key={i} className={`sk-seat${p ? "" : " empty"}${p?.ready ? " ready" : ""}`}>
              <span className="sk-seat-no">{i + 1}</span>
              <span>{p ? p.name : "等待加入…"}</span>
              {p &&
                (p.bot ? (
                  <span className="sk-seat-state">
                    🤖 人机
                    {host && (
                      <button className="sk-btn sm" onClick={() => room.act({ type: "REMOVE_BOT", seat: i })}>
                        移除
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="sk-seat-state">
                    {i === 0 ? "船长 · " : ""}
                    {p.ready ? "已准备" : "未准备"}
                    {p.connected ? "" : " · 离线"}
                  </span>
                ))}
            </div>
          );
        })}
      </div>
      {host && !full && (
        <button className="sk-btn" disabled={room.pending} onClick={() => room.act({ type: "ADD_BOT" })} data-testid="sk-add-bot">
          🤖 添加人机（补位或测试）
        </button>
      )}
      <div className="sk-settings">
        <div className="sk-row">
          <span>人数</span>
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} className={`sk-chip${s.count === n ? " on" : ""}`} disabled={!host || n < s.players.length || room.pending} onClick={() => set({ count: n })} data-testid={`sk-count-${n}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="sk-row">
          <span>计分</span>
          <button className={`sk-chip${st.scoring === "skull" ? " on" : ""}`} disabled={!host} onClick={() => set({ scoring: "skull" })}>
            骷髅王计分
          </button>
          <button className={`sk-chip${st.scoring === "rascal" ? " on" : ""}`} disabled={!host} onClick={() => set({ scoring: "rascal" })}>
            无赖计分
          </button>
        </div>
        <div className="sk-row">
          <span>轮数</span>
          {(Object.keys(SCHEDULES) as ScheduleKey[]).map((k) => (
            <button key={k} className={`sk-chip${st.schedule === k ? " on" : ""}`} disabled={!host} onClick={() => set({ schedule: k })}>
              {SCHEDULES[k].name}
            </button>
          ))}
        </div>
        <p className="sk-sub small">
          {SCHEDULES[st.schedule].desc} → 本局每轮张数：{counts.join("、")}
        </p>
        <div className="sk-toggles">
          {st.scoring === "rascal" && <Toggle on={st.cannon} label="炮弹规则" desc="下注后选霰弹或炮弹" disabled={!host} onClick={() => set({ cannon: !st.cannon })} />}
          <Toggle on={st.kraken} label="🐙 克拉肯" desc="整墩作废" disabled={!host} onClick={() => set({ kraken: !st.kraken })} />
          <Toggle on={st.whale} label="🐋 白鲸" desc="特殊牌失效，只比数字" disabled={!host} onClick={() => set({ whale: !st.whale })} />
          <Toggle on={st.loot} label="🪙 战利品" desc="结盟各 +20" disabled={!host} onClick={() => set({ loot: !st.loot })} />
          <Toggle on={st.abilities} label="🏴‍☠️ 海盗技能" desc="海盗赢墩发动技能" disabled={!host} onClick={() => set({ abilities: !st.abilities })} />
        </div>
        {s.count === 2 && <p className="sk-sub small">双人局会加入「灰胡子幽灵」一起出牌（官方双人规则）</p>}
        {!host && <p className="sk-sub small">只有船长（房主）能改设置</p>}
      </div>
      <button className={`sk-btn ${me.ready ? "" : "main"}`} disabled={room.pending} onClick={() => room.act({ type: "READY" })} data-testid="sk-ready">
        {me.ready ? "取消准备" : "准备"}
      </button>
      {host && (
        <button className="sk-btn main" disabled={!allReady || room.pending} onClick={() => room.act({ type: "START" })} data-testid="sk-start">
          {allReady ? "起航！开始游戏" : full ? "等待所有人准备" : "等待玩家加入"}
        </button>
      )}
      <button className="sk-link" onClick={() => setRules(true)}>
        📖 规则说明
      </button>
      <button className="sk-link" onClick={() => room.act({ type: "LEAVE" })}>
        离开房间
      </button>
      {room.error && <p className="sk-err">{room.error}</p>}
      {rulesSheet}
    </div>
  );
}

/* ---------------- 牌桌 ---------------- */
function nameOf(v: SKView, seat: number) {
  return seat === v.players.length ? "灰胡子幽灵" : v.players[seat]?.name ?? "?";
}

function TrickBanner({ r, v, onDone }: { r: TrickResult; v: SKView; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [r.no]);
  const total = r.bonus.reduce((a, b) => a + b.pts, 0);
  const mermaidKing = r.bonus.some((b) => b.label.includes("诱捕"));
  return (
    <div className={`sk-banner${r.destroyed ? " " + r.destroyed : ""}`} onClick={onDone} data-testid="sk-trick-banner">
      {mermaidKing && <img className="sk-capture" src="/assets/skullking/fx/mermaid-capture.webp" alt="美人鱼诱捕骷髅王" />}
      <div className="sk-banner-stage">
        <div className="sk-banner-cards">
          {r.cards.map((p) => (
            <div key={p.id} className={`sk-banner-slot${p.seat === r.winner ? " win" : ""}`}>
              <SKCard id={p.id} as={p.as} size="sm" />
              <small>{nameOf(v, p.seat)}</small>
            </div>
          ))}
        </div>
        {r.destroyed === "kraken" && <Sprite className="sk-fx" list={FX.kraken} />}
        {r.destroyed === "whale" && <Sprite className="sk-fx" list={FX.whale} />}
        {!r.destroyed && r.winner !== null && <Sprite className="sk-fx coins" list={FX.coins} hold={false} />}
      </div>
      <div className="sk-banner-text">
        {r.destroyed === "kraken" ? (
          <>🐙 克拉肯吞掉了这一墩！{nameOf(v, r.next)} 带下一墩</>
        ) : r.winner === null ? (
          <>🐋 白鲸冲散了这一墩！{nameOf(v, r.next)} 带下一墩</>
        ) : (
          <>
            <b>{r.winner === v.me ? "你" : nameOf(v, r.winner)}</b> 赢下第 {r.no} 墩{r.destroyed === "whale" ? "（白鲸：只比数字）" : ""}
          </>
        )}
      </div>
      {r.bonus.length > 0 && (
        <div className="sk-badges">
          {r.bonus.map((b, k) => (
            <span key={k} className="sk-badge-item" style={{ animationDelay: 0.3 + k * 0.15 + "s" }}>
              {BONUS_IMG.has(b.pts) ? <img src={`/assets/skullking/ui/bonus-${b.pts}.webp`} alt={"+" + b.pts} /> : <i>+{b.pts}</i>}
              <small>{b.label}</small>
            </span>
          ))}
        </div>
      )}
      {total > 0 && <div className="sk-banner-notes">奖励共 +{total}，本轮猜中才算</div>}
    </div>
  );
}

function BidReveal({ v, onDone }: { v: SKView; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="sk-reveal" onClick={onDone} data-testid="sk-bid-reveal">
      <Sprite className="sk-reveal-fx" list={FX.reveal} ms={65} />
      <div className="sk-reveal-title">哟—嗬—嗬！</div>
      <div className="sk-reveal-list">
        {v.players.map((p, i) => (
          <div key={i} className={`sk-reveal-item${i === v.me ? " me" : ""}`} style={{ animationDelay: i * 0.08 + "s" }}>
            <span className="sk-fist">{p.bid === 0 ? "✊" : "🖐️"}</span>
            <b>{p.bid}</b>
            <small>{p.name}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreTable({ v }: { v: SKView }) {
  return (
    <div className="sk-score-wrap">
      <table className="sk-score">
        <thead>
          <tr>
            <th>轮</th>
            {v.players.map((p, i) => (
              <th key={i} className={i === v.me ? "me" : ""}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {v.counts.map((k, r) => (
            <tr key={r} className={r === v.round ? "cur" : ""}>
              <td>
                {r + 1}
                <small>{k}张</small>
              </td>
              {v.players.map((p, i) => {
                const row = p.rows[r];
                return (
                  <td key={i} className={row ? row.hit : ""}>
                    {row ? (
                      <>
                        <span className="sk-bw">
                          {row.bid}/{row.won}
                          {row.shot === "cannon" ? "💣" : ""}
                        </span>
                        <b>{row.total > 0 ? "+" + row.total : row.total}</b>
                      </>
                    ) : (
                      "·"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="sum">
            <td>总分</td>
            {v.players.map((p, i) => (
              <td key={i}>
                <b>{p.score}</b>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="sk-sub small">格子里：下注/实际墩数，下面是本轮得分</p>
    </div>
  );
}

function RoundEnd({ room, v, host }: { room: Room; v: SKView; host: boolean }) {
  const fin = v.phase === "FINISHED";
  const rank = v.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
  return (
    <Sheet title={fin ? "🏆 航行结束" : `第 ${v.round + 1} 轮结算`}>
      {fin && (
        <div className="sk-final">
          <img className="sk-victory" src="/assets/skullking/fx/victory.webp" alt="" />
          <div className="sk-final-name">{v.winners.map((i) => v.players[i].name).join("、")}</div>
          <div className="sk-sub">成为七海船长！</div>
          <ol className="sk-rank">
            {rank.map((p, n) => (
              <li key={p.i} className={p.i === v.me ? "me" : ""}>
                <span>{n + 1}</span>
                {p.name}
                <b>{p.score}</b>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!fin && (
        <div className="sk-round-rows">
          {v.players.map((p, i) => {
            const r = p.rows.at(-1)!;
            return (
              <div key={i} className={`sk-round-row ${r.hit}${i === v.me ? " me" : ""}`} data-testid={`sk-round-row-${i}`}>
                <div className="sk-rr-head">
                  <b>{p.name}</b>
                  <span>
                    猜 {r.bid} · 赢 {r.won} {r.hit === "exact" ? "🎯 猜中" : r.hit === "glance" ? "差 1" : `差 ${Math.abs(r.bid - r.won)}`}
                    {r.shot ? (r.shot === "cannon" ? " · 💣炮弹" : " · 霰弹") : ""}
                  </span>
                  <b className="sk-rr-total">{r.total > 0 ? "+" + r.total : r.total}</b>
                </div>
                <div className="sk-rr-detail">
                  下注分 {r.bidPts >= 0 ? "+" : ""}
                  {r.bidPts}
                  {r.bonusItems.length > 0 && (
                    <>
                      {" · "}奖励 {r.bonusPts >= 0 ? "+" : ""}
                      {r.bonusPts}（{r.bonusItems.map((b) => `${b.label}${b.pts >= 0 ? "+" : ""}${b.pts}`).join("、")}
                      {r.hit !== "exact" && r.bonusItems.some((b) => b.label !== "无赖押注") ? "，没猜中不算" : ""}）
                    </>
                  )}
                  <span className="sk-rr-sum">总分 {p.score}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {fin && <ScoreTable v={v} />}
      {host ? (
        <button className="sk-btn main wide" disabled={room.pending} onClick={() => room.act(fin ? { type: "REMATCH" } : { type: "NEXT_ROUND" })} data-testid="sk-next">
          {fin ? "再来一局" : `开始第 ${v.round + 2} 轮（每人 ${v.counts[v.round + 1]} 张）`}
        </button>
      ) : (
        <p className="sk-sub">等待船长{fin ? "开新局" : "开始下一轮"}…</p>
      )}
    </Sheet>
  );
}

function Ability({ room, v }: { room: Room; v: SKView }) {
  const a = v.ability!;
  const mine = a.seat === v.me;
  const [pick, setPick] = useState<number[]>([]);
  if (!mine)
    return (
      <div className="sk-panel">
        <div className="sk-hint">
          🏴‍☠️ {nameOf(v, a.seat)} 正在发动 <b>{PIRATE_NAME[a.pirate]}</b> 的技能：{PIRATE_SKILL[a.pirate]}
        </div>
      </div>
    );
  return (
    <div className="sk-panel ability" data-testid="sk-ability">
      <div className="sk-hint">
        🏴‍☠️ 你的 <b>{PIRATE_NAME[a.pirate]}</b> 赢下了这墩！{PIRATE_SKILL[a.pirate]}
      </div>
      {a.pirate === "rosie" && (
        <div className="sk-choices">
          {v.players.map((p, i) => (
            <button key={i} className="sk-btn" onClick={() => room.act({ type: "ROSIE", target: i })}>
              {i === v.me ? "我自己" : p.name}
            </button>
          ))}
        </div>
      )}
      {a.pirate === "rascal" && (
        <div className="sk-choices">
          {([0, 10, 20] as const).map((b) => (
            <button key={b} className="sk-btn" onClick={() => room.act({ type: "RASCAL", bet: b })}>
              押 {b} 分
            </button>
          ))}
        </div>
      )}
      {a.pirate === "juanita" && (
        <>
          <div className="sk-peek">{a.deck?.length ? sortHand(a.deck).map((id) => <SKCard key={id} id={id} size="sm" />) : <span className="sk-sub">本轮所有牌都发出去了</span>}</div>
          <button className="sk-btn main wide" onClick={() => room.act({ type: "JUANITA" })}>
            看完了
          </button>
        </>
      )}
      {a.pirate === "harry" && (
        <div className="sk-choices">
          {([-1, 0, 1] as const).map((d) => {
            const nb = (v.players[v.me].bid ?? 0) + d;
            return (
              <button key={d} className="sk-btn" disabled={nb < 0 || nb > v.cards} onClick={() => room.act({ type: "HARRY", delta: d })}>
                {d === 0 ? `保持 ${nb}` : `改成 ${nb}`}
              </button>
            );
          })}
        </div>
      )}
      {a.pirate === "bendt" && a.pirate === "bendt" && (
        <>
          <p className="sk-sub small">
            新摸到：{a.drawn.map((id) => cardName(id)).join("、")}。在下面手牌里选 {a.drawn.length} 张弃掉（已选 {pick.length}）
          </p>
          <div className="sk-peek">
            {sortHand(v.hand).map((id) => (
              <SKCard key={id} id={id} size="sm" selected={pick.includes(id)} onClick={() => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < a.drawn.length ? [...p, id] : p))} />
            ))}
          </div>
          <button className="sk-btn main wide" disabled={pick.length !== a.drawn.length} onClick={() => room.act({ type: "BENDT", discard: pick })}>
            弃掉这 {a.drawn.length} 张
          </button>
        </>
      )}
    </div>
  );
}

function Table({ room, v }: { room: Room; v: SKView }) {
  const s = room.snapshot!;
  const host = s.hostId === s.mySeat;
  const [sel, setSel] = useState<number | null>(null);
  const [tig, setTig] = useState(false);
  const [sheet, setSheet] = useState<"" | "score" | "rules" | "log">("");
  const [banner, setBanner] = useState<TrickResult | null>(null);
  const [reveal, setReveal] = useState(false);
  const [bid, setBid] = useState<number | null>(null);
  const seen = useRef({ tricks: v.tricks.length, round: v.round, phase: v.phase });
  useEffect(() => {
    preload([...FX.coins, ...FX.reveal, ...(v.settings.kraken ? FX.kraken : []), ...(v.settings.whale ? FX.whale : []), ...v.hand.map((id) => `${ASSET}cards/${CARDS[id].key}.webp`)]);
  }, []);
  useEffect(() => {
    const p = seen.current;
    if (v.round === p.round && v.tricks.length > p.tricks) setBanner(v.tricks[v.tricks.length - 1]);
    if (v.round !== p.round) setBanner(null);
    if ((p.phase === "BID" || p.phase === "SHOT") && v.phase !== "BID" && v.phase !== "SHOT" && p.round === v.round) setReveal(true);
    if (p.phase === "BID" && v.phase === "SHOT") setReveal(true);
    if (v.phase === "BID" && p.phase !== "BID") setBid(null);
    seen.current = { tricks: v.tricks.length, round: v.round, phase: v.phase };
  }, [v.tricks.length, v.round, v.phase]);
  const me = v.players[v.me];
  const myTurn = v.phase === "PLAY" && v.turn === v.me;
  const hand = sortHand(v.hand);
  useEffect(() => setSel(null), [v.turn, v.phase, v.hand.length]);
  const seats = [...v.players.map((p, i) => ({ i, p })), ...(v.ghost ? [{ i: v.players.length, p: null }] : [])];
  const play = (as?: "pirate" | "escape") => {
    if (sel === null) return;
    if (CARDS[sel].kind === "tigress" && !as) return setTig(true);
    setTig(false);
    void room.act({ type: "PLAY", id: sel, ...(as ? { as } : {}) });
  };
  const slotFor = (seat: number): Played | undefined => v.trick.find((p) => p.seat === seat);
  const status = (() => {
    if (v.phase === "BID") return me.bidDone ? `等待其他人下注（${v.players.filter((p) => p.bidDone).length}/${v.players.length}）` : "看牌，猜猜这一轮你能赢几墩";
    if (v.phase === "SHOT") return me.shotDone ? "等待其他人选择炮弹…" : "选择霰弹或炮弹";
    if (v.phase === "ABILITY") return "海盗技能发动中";
    if (v.phase === "PLAY") return myTurn ? (v.lead ? `轮到你出牌 · 本墩跟${SUIT_NAME[v.lead]}${SUIT_ICON[v.lead]}` : "轮到你出牌") : `等待 ${nameOf(v, v.turn)} 出牌…`;
    return "";
  })();
  return (
    <div className="sk-table">
      <header className="sk-top">
        <div className="sk-round">
          第 <b>{v.round + 1}</b>/{v.rounds} 轮 · 每人 {v.cards} 张
        </div>
        <div className="sk-top-btns">
          <button className="sk-icon-btn" onClick={() => setSheet("score")} data-testid="sk-open-score">
            📜 计分
          </button>
          <button className="sk-icon-btn" onClick={() => setSheet("log")}>
            🧭 记录
          </button>
          <button className="sk-icon-btn" onClick={() => setSheet("rules")}>
            ❓
          </button>
        </div>
      </header>
      <div className={`sk-seatbar n${seats.length}`}>
        {seats.map(({ i, p }) => {
          const turn = v.phase === "PLAY" && v.turn === i;
          const ghost = !p;
          return (
            <div key={i} className={`sk-pl${turn ? " turn" : ""}${i === v.me ? " me" : ""}${ghost ? " ghost" : ""}`} data-testid={`sk-seat-${i}`}>
              <div className="sk-pl-name">
                {i === v.dealer && !ghost && <span className="sk-dealer" title="发牌人">🂠</span>}
                {ghost ? "👻 灰胡子" : i === v.me ? "你" : p!.name}
              </div>
              <div className="sk-pl-bid">
                {ghost ? (
                  <span>不下注</span>
                ) : v.phase === "BID" ? (
                  <span className={p!.bidDone ? "done" : "think"}>{p!.bidDone ? (i === v.me ? `猜 ${p!.bid}` : "✓ 已下注") : "思考中…"}</span>
                ) : (
                  <span className={p!.won === p!.bid ? "ok" : p!.won > (p!.bid ?? 0) ? "over" : ""}>
                    🎯{p!.bid} · <img className="sk-coin" src="/assets/skullking/ui/tricks-coin.webp" alt="赢" />
                    {p!.won}
                    {p!.shot === "cannon" ? "💣" : ""}
                  </span>
                )}
              </div>
              <div className="sk-pl-score">
                {ghost ? `赢 ${v.ghost!.won} 墩` : `${p!.score} 分`}
                {i !== v.me && (ghost ? v.ghost!.handCount : p!.handCount) > 0 && (
                  <span className="sk-backs">
                    <img src="/assets/skullking/cards/back.webp" alt="" />×{ghost ? v.ghost!.handCount : p!.handCount}
                  </span>
                )}
              </div>
              <div className="sk-pl-slot">{slotFor(i) ? <SKCard id={slotFor(i)!.id} as={slotFor(i)!.as} size="sm" /> : turn ? <span className="sk-wait">⏳</span> : null}</div>
            </div>
          );
        })}
      </div>
      <div className="sk-status" data-testid="sk-status">
        {status}
      </div>
      <main className="sk-felt">
        {v.phase === "PLAY" || v.phase === "ABILITY" ? (
          <div className="sk-trick">
            {v.trick.length === 0 ? (
              <div className="sk-trick-empty">
                第 {v.tricks.length + 1} 墩 · {nameOf(v, v.order[0])} 先出
              </div>
            ) : (
              v.trick.map((p, k) => (
                <div key={p.id} className="sk-trick-slot" style={{ ["--k" as string]: k }}>
                  <SKCard id={p.id} as={p.as} size="md" />
                  <small>{nameOf(v, p.seat)}</small>
                </div>
              ))
            )}
            {v.lead && v.trick.length > 0 && (
              <div className={`sk-lead suit-${v.lead}`}>
                跟 {SUIT_ICON[v.lead]} {SUIT_NAME[v.lead]}
              </div>
            )}
          </div>
        ) : null}
        {v.phase === "BID" && !me.bidDone && (
          <div className="sk-panel bid" data-testid="sk-bid-panel">
            <div className="sk-hint">你觉得这一轮能赢几墩？</div>
            <div className="sk-bid-grid">
              {Array.from({ length: v.cards + 1 }, (_, k) => (
                <button key={k} className={`sk-bid-btn${bid === k ? " on" : ""}`} onClick={() => setBid(k)} data-testid={`sk-bid-${k}`} aria-label={`${k} 墩`}>
                  <img src={`/assets/skullking/ui/bid-${k}.webp`} alt="" />
                </button>
              ))}
            </div>
            <button className="sk-btn main wide" disabled={bid === null || room.pending} onClick={() => bid !== null && room.act({ type: "BID", bid })} data-testid="sk-bid-go">
              {bid === null ? "选一个数字" : bid === 0 ? `✊ 猜 0 墩（猜中 +${(v.settings.scoring === "skull" ? 10 : 10) * v.cards}）` : `🖐️ 猜 ${bid} 墩，亮出！`}
            </button>
          </div>
        )}
        {v.phase === "BID" && me.bidDone && (
          <div className="sk-panel">
            <div className="sk-waiting">
              你猜了 <b>{me.bid}</b> 墩，等大家一起亮出…
            </div>
          </div>
        )}
        {v.phase === "SHOT" && !me.shotDone && (
          <div className="sk-panel" data-testid="sk-shot-panel">
            <div className="sk-hint">装填哪种炮弹？</div>
            <div className="sk-choices">
              <button className="sk-btn" onClick={() => room.act({ type: "SHOT", shot: "grape" })}>
                🖐️ 霰弹
                <small>猜中 {10 * v.cards}，差 1 得一半</small>
              </button>
              <button className="sk-btn" onClick={() => room.act({ type: "SHOT", shot: "cannon" })}>
                💣 炮弹
                <small>猜中 {15 * v.cards}，差 1 就 0</small>
              </button>
            </div>
          </div>
        )}
        {v.phase === "ABILITY" && v.ability && <Ability room={room} v={v} />}
      </main>
      <footer className={`sk-hand-wrap${myTurn ? " active" : ""}`}>
        {myTurn && sel !== null && (
          <div className="sk-play-bar">
            <span>{cardName(sel)}</span>
            <button className="sk-btn main" disabled={room.pending} onClick={() => play()} data-testid="sk-play">
              出这张
            </button>
          </div>
        )}
        <div className={`sk-hand n${Math.min(hand.length, 10)}`} data-testid="sk-hand">
          {hand.map((id) => {
            const ok = !myTurn || v.legal.includes(id);
            return (
              <SKCard
                key={id}
                id={id}
                size="lg"
                selected={sel === id}
                dim={myTurn && !ok}
                onClick={
                  myTurn
                    ? () => {
                        if (!ok) return room.setError(`有${SUIT_NAME[v.lead!]}必须先跟${SUIT_NAME[v.lead!]}（特殊牌可以随时出）`);
                        if (sel === id) play();
                        else setSel(id);
                      }
                    : undefined
                }
              />
            );
          })}
          {hand.length === 0 && <span className="sk-sub small">手牌已出完</span>}
        </div>
        {room.error && (
          <p className="sk-err" onClick={() => room.setError("")}>
            {room.error}
          </p>
        )}
      </footer>
      {tig && (
        <Sheet title="🐯 母老虎当什么？" onClose={() => setTig(false)}>
          <div className="sk-choices">
            <button className="sk-btn main" onClick={() => play("pirate")} data-testid="sk-tig-pirate">
              🏴‍☠️ 当海盗
              <small>大过数字牌，同墩先出赢</small>
            </button>
            <button className="sk-btn" onClick={() => play("escape")} data-testid="sk-tig-escape">
              🏳️ 当逃跑
              <small>一定不赢</small>
            </button>
          </div>
        </Sheet>
      )}
      {banner && <TrickBanner r={banner} v={v} onDone={() => setBanner(null)} />}
      {reveal && !banner && <BidReveal v={v} onDone={() => setReveal(false)} />}
      {(v.phase === "ROUND_END" || v.phase === "FINISHED") && !banner && <RoundEnd room={room} v={v} host={host} />}
      {sheet === "score" && (
        <Sheet title="📜 计分表" onClose={() => setSheet("")}>
          <ScoreTable v={v} />
        </Sheet>
      )}
      {sheet === "rules" && (
        <Sheet title="骷髅王 · 规则" onClose={() => setSheet("")}>
          {RULES}
        </Sheet>
      )}
      {sheet === "log" && (
        <Sheet title="🧭 航海日志" onClose={() => setSheet("")}>
          <ol className="sk-log">
            {[...v.log].reverse().map((e, k) => (
              <li key={k}>{e.t}</li>
            ))}
          </ol>
        </Sheet>
      )}
    </div>
  );
}

export function SkullKing() {
  const room = useSKRoom();
  const v = room.snapshot?.view;
  useEffect(() => {
    document.title = "骷髅王 · 桌游";
  }, []);
  return (
    <div className="sk-root">
      {!room.online && <div className="sk-offline">连接中…</div>}
      {v ? <Table room={room} v={v} /> : <Lobby room={room} />}
    </div>
  );
}
