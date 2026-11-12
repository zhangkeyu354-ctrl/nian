import { useEffect, useMemo, useRef, useState } from "react";
import {
  BOSSES,
  BOSS_ORDER,
  CARDS,
  CLASSES,
  CURSE_BY_ID,
  IDENTITIES,
  ITEM_ZH,
  RACES,
  STATUS_ZH,
  TYPE_ZH,
  cardKind,
  cardNeedsTarget,
  cardText,
  unlocks,
  type DamageType,
  type Difficulty,
  type ItemId,
  type StatusKind,
} from "../../../../packages/boss-fighters/src/index.ts";
import type { BFRoomSnapshot, BFView } from "../../../../packages/shared/src/bf-protocol.ts";
import { feel } from "../drawing/feel.ts";
import { createBFRoom, savedName, useBFRoom } from "./bf-net.ts";
import { ICON_PATHS } from "./icon-paths.ts";
import "./bf.css";
import { HIT_FX, SHIELD_FX, StatusLoop, avatarUrl, bgUrl, bossUrl, cardArtUrl, frameUrl, heroUrl, partUrl, useFx } from "./art.tsx";

type Net = ReturnType<typeof useBFRoom>;
type ViewHero = BFView["heroes"][number];

const DIFF_ZH: Record<Difficulty, string> = { beginner: "新手", advanced: "进阶", pro: "专家", insane: "疯狂" };
const DIFFS: Difficulty[] = ["beginner", "advanced", "pro", "insane"];
const STATUSES: StatusKind[] = ["poison", "fire", "panic", "paralysis"];
const TYPES: DamageType[] = ["melee", "ranged", "magic"];
/** 战役地图上 11 个关卡的位置（百分比，沿地图小路从下到上） */
const MAP_POS: [number, number][] = [[44, 91], [70, 80], [58, 69], [32, 59], [48, 52], [70, 45], [50, 37], [30, 29], [62, 23], [28, 14], [74, 6]];

/** 每关一句话介绍（按官方魔王说明概括） */
const BOSS_BLURB: Record<string, string> = {
  puppet: "教学关。熟悉护盾、攻击和保护：先打掉护盾，伤害才能落到魔王身上。",
  prince: "王子护盾厚，攒满怒气会吐东西。注意他盯上生命最高的人。",
  soulHuntress: "打倒后会以更强的灵魂形态复活一次，留好血量和关键牌。",
  aetherDragon: "护盾带尖刺，打上去会反伤；龙越打越愤怒。",
  stoneGolem: "水晶护盾很厚，打碎水晶能大幅削弱它。每回合只有一面护盾最危险。",
  ogre: "三个头各自有生命，各有脾气。先打哪个头决定这场怎么打。",
  tentacolossus: "触手挡在本体前面：每种攻击和助攻都先打对应的触手。",
  magmaros: "熔岩王会不断召唤小熔岩怪，手下挡伤害，溢出伤害会浪费。",
  bombossa: "限时战斗：每个行动都消耗时间，炸弹倒数归零就输。",
  jelly: "果冻怪会分裂出小果冻，还会往你手里塞黏液牌。",
  madameVoodoo: "巫毒娃娃会把伤害转到英雄身上。先处理娃娃再打天后。",
};

export function Icon({ name, cls = "" }: { name: string; cls?: string }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg className={"bf-icon " + cls} viewBox="0 0 512 512" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const raceName = (id: string | null, lv = 1) => (id ? IDENTITIES[id]?.levelNames[lv - 1] ?? id : "未选");
const clsName = (id: string | null, lv = 1) => (id ? IDENTITIES[id]?.levelNames[lv - 1] ?? id : "未选");

export function BossFighters() {
  const q = new URLSearchParams(location.search);
  const room = q.get("room")?.toUpperCase() ?? "";
  const [err, setErr] = useState("");
  useEffect(() => {
    document.title = "魔王试炼：码上开战";
    if (room) return;
    void createBFRoom().then((r) => {
      if (r.ok) location.replace(`/?game=bf&room=${r.code}`);
      else setErr(r.error);
    });
  }, [room]);
  if (!room) return <div className="bf-world bf-center">{err || "正在创建房间…"}</div>;
  return <RoomView code={room} />;
}

function RoomView({ code }: { code: string }) {
  const net = useBFRoom(code);
  const { snap } = net;
  if (net.error && !snap) return <div className="bf-world bf-center">{net.error}<a className="bf-btn" href="/">回大厅</a></div>;
  if (!snap) return <div className="bf-world bf-center">正在进入房间…</div>;
  const seated = snap.seats.some((s) => s.id === snap.me);
  const known = !!snap.me;
  return (
    <div className="bf-world" data-testid="bf-root" style={{ ["--bf-bgimg" as string]: `url(${bgUrl(snap.stage === "game" && snap.view ? snap.view.bossId : null)})` }}>
      {!net.connected && <div className="bf-reconnect" role="status">重连中…</div>}
      {!known ? (
        <Join net={net} snap={snap} />
      ) : snap.stage === "lobby" || !snap.view ? (
        <Lobby net={net} snap={snap} seated={seated} />
      ) : (
        <Battle net={net} snap={snap} />
      )}
    </div>
  );
}

function Title() {
  return (
    <header className="bf-title">
      <Icon name="crown" cls="bf-title-crown" />
      <h1>魔王试炼</h1>
      <p>码上开战 · 合作卡牌</p>
    </header>
  );
}

function Join({ net, snap }: { net: Net; snap: BFRoomSnapshot }) {
  const [name, setName] = useState(savedName());
  const [msg, setMsg] = useState("");
  return (
    <div className="bf-panel bf-join">
      <Title />
      <p className="bf-note">房间 {snap.code} · 已有 {snap.seats.filter((s) => !s.bot).length} 名冒险者</p>
      <input data-testid="bf-name" value={name} maxLength={12} placeholder="你的昵称" onChange={(e) => setName(e.target.value)} />
      <button className="bf-btn bf-primary" data-testid="bf-claim" onClick={async () => setMsg((await net.claim(name)) ?? "")}>
        加入冒险
      </button>
      {snap.stage === "game" && <p className="bf-note">战斗进行中，加入后先观战；有机器人座位时下一场可以顶替。</p>}
      {msg && <p className="bf-error">{msg}</p>}
    </div>
  );
}

// ———————————————————— 大厅 ————————————————————

function Lobby({ net, snap, seated }: { net: Net; snap: BFRoomSnapshot; seated: boolean }) {
  const me = snap.seats.find((s) => s.id === snap.me);
  const host = snap.seats.find((s) => s.host)?.id === snap.me;
  const mySeat = snap.seats.findIndex((s) => s.id === snap.me);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const act = async (a: Parameters<Net["lobby"]>[0]) => {
    feel("tap");
    setMsg((await net.lobby(a)) ?? "");
  };
  const camp = snap.campaign;
  const locked = !!camp;
  const progress = camp?.progress ?? -1;
  const ready = snap.seats.length >= 2 && snap.seats.every((s) => s.race && s.cls);
  return (
    <div className="bf-panel bf-lobby">
      <Title />
      <section className="bf-card">
        <h2>冒险团</h2>
        <ul className="bf-seats">
          {snap.seats.map((s) => (
            <li key={s.id} className={s.id === snap.me ? "me" : ""}>
              <span className="bf-seat-art">
                {s.race && s.cls ? <img src={avatarUrl(s.race, s.cls)} alt="" /> : <Icon name={s.race ?? "skull"} />}
              </span>
              <span className="bf-seat-name">
                <b>{s.name}{s.host && " · 房主"}{!s.connected && " · 离线"}</b>
                <small>{s.race && s.cls ? `${raceName(s.race)} · ${clsName(s.cls)}` : "还没选英雄"}</small>
              </span>
              {host && !locked && s.id !== snap.me && (
                <button className="bf-btn bf-mini" onClick={() => act({ type: "REMOVE", id: s.id })}>移出</button>
              )}
            </li>
          ))}
        </ul>
        {host && !locked && snap.seats.length < 4 && (
          <button className="bf-btn" data-testid="bf-add-bot" onClick={() => act({ type: "ADD_BOT" })}>＋ 机器人队友</button>
        )}
        {!seated && <p className="bf-note">你在观战。</p>}
      </section>

      {seated && !locked && me && (
        <section className="bf-card">
          <h2>选择你的英雄</h2>
          <p className="bf-note">英雄 = 种族 + 职业。同一队种族不能重复。</p>
          <div className="bf-picker">
            {RACES.map((r) => {
              const taken = snap.seats.some((s, i) => i !== mySeat && s.race === r);
              const id = IDENTITIES[r];
              return (
                <button key={r} className={"bf-pick" + (me.race === r ? " on" : "")} disabled={taken} data-testid={"bf-race-" + r} onClick={() => act({ type: "PICK", race: r, cls: me.cls })}>
                  <Icon name={r} />
                  <b>{id.name}</b>
                  <small>手牌 {id.levels[0][0]} · 生命 {id.levels[0][1]}</small>
                </button>
              );
            })}
          </div>
          <div className="bf-picker">
            {CLASSES.map((c) => {
              const id = IDENTITIES[c];
              return (
                <button key={c} className={"bf-pick" + (me.cls === c ? " on" : "")} data-testid={"bf-cls-" + c} onClick={() => act({ type: "PICK", race: me.race, cls: c })}>
                  <Icon name={c} />
                  <b>{id.name}</b>
                  <small>手牌 +{id.levels[0][0]} · 生命 +{id.levels[0][1]}</small>
                </button>
              );
            })}
          </div>
          {me.race && me.cls && (
            <img className="bf-hero-preview" src={heroUrl(me.race, me.cls)} alt={`${IDENTITIES[me.race].name}${IDENTITIES[me.cls].name}`} />
          )}
          {me.race && me.cls && (
            <p className="bf-ability">
              <b>{IDENTITIES[me.race].name}能力（2 级起）：</b>{IDENTITIES[me.race].ability}
              <br />
              <b>{IDENTITIES[me.cls].name}能力（2 级起）：</b>{IDENTITIES[me.cls].ability}
            </p>
          )}
        </section>
      )}

      <section className="bf-card">
        <h2>挑战</h2>
        <div className="bf-seg">
          {(["campaign", "single"] as const).map((m) => (
            <button key={m} className={"bf-btn" + (snap.mode === m ? " on" : "")} disabled={!host} aria-pressed={snap.mode === m} data-testid={"bf-mode-" + m} onClick={() => act({ type: "SET_MODE", mode: m })}>
              {m === "campaign" ? "战役（逐关解锁）" : "自由挑战"}
            </button>
          ))}
        </div>
        {snap.mode === "campaign" && camp && (
          <p className="bf-note">
            已通关 {progress + 1} 关 · 英雄 {unlocks(progress).raceLevel} 级 · 职业 {unlocks(progress).clsLevel} 级
            {host && (
              <button className="bf-link" onClick={() => confirm("重开冒险团会清空战役进度，确定吗？") && act({ type: "RESET_CAMPAIGN" })}>重开冒险团</button>
            )}
          </p>
        )}
        <div className="bf-map" style={{ backgroundImage: "url(/assets/bf/bg/map.webp)" }}>
          {BOSS_ORDER.map((id, n) => {
            const b = BOSSES[id];
            const open = snap.mode === "single" || b.order <= progress + 1;
            const best = camp?.results[id]?.best;
            const [x, y] = MAP_POS[n] ?? [50, 50];
            const cur = snap.mode === "campaign" && b.order === progress + 1;
            return (
              <button key={id} className={`bf-node${snap.bossId === id ? " on" : ""}${open ? "" : " locked"}${cur ? " cur" : ""}${best ? " done" : ""}`}
                style={{ left: x + "%", top: y + "%" }} disabled={!host || !open} data-testid={"bf-boss-" + id}
                aria-label={open ? b.name : "未解锁"} onClick={() => act({ type: "SET_BOSS", bossId: id })}>
                {open ? <img src={bossUrl(id, "idle")} alt="" /> : <Icon name="skull" />}
                <i>{b.order === 0 ? "教" : b.order}</i>
                {best && <em>✓</em>}
              </button>
            );
          })}
        </div>
        <div className="bf-boss-desc">
          <img src={bossUrl(snap.bossId, "idle")} alt="" />
          <span>
            <b>{BOSSES[snap.bossId].order === 0 ? "教学" : `第 ${BOSSES[snap.bossId].order} 关`} · {BOSSES[snap.bossId].name}</b>
            <small>{BOSS_BLURB[snap.bossId]}</small>
          </span>
        </div>
        <div className="bf-seg">
          {DIFFS.map((d) => (
            <button key={d} className={"bf-btn" + (snap.difficulty === d ? " on" : "")} disabled={!host} aria-pressed={snap.difficulty === d} onClick={() => act({ type: "SET_DIFFICULTY", difficulty: d })}>
              {DIFF_ZH[d]}
            </button>
          ))}
        </div>
      </section>

      {camp?.pendingLoot && <LootPanel net={net} snap={snap} />}

      <button className="bf-btn" onClick={() => void navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => {})}>
        {copied ? "已复制邀请链接" : `复制邀请链接 · 房间 ${snap.code}`}
      </button>
      {host ? (
        <button className="bf-btn bf-primary bf-go" disabled={!ready || !!camp?.pendingLoot} data-testid="bf-start" onClick={() => act({ type: "START" })}>
          {snap.seats.length < 2 ? "至少 2 名英雄（可加机器人）" : !ready ? "等待大家选好英雄" : "开 战 ！"}
        </button>
      ) : (
        <p className="bf-note bf-center-text">等房主开始…</p>
      )}
      {msg && <p className="bf-error" role="alert">{msg}</p>}
      <p className="bf-credit">图标：game-icons.net（CC BY 3.0）</p>
    </div>
  );
}

function LootPanel({ net, snap }: { net: Net; snap: BFRoomSnapshot }) {
  const p = snap.campaign!.pendingLoot!;
  const mySeat = snap.seats.findIndex((s) => s.id === snap.me);
  const mine = p.picked[mySeat];
  const [msg, setMsg] = useState("");
  return (
    <section className="bf-card bf-loot">
      <h2>战利品 · {"★".repeat(p.stars)}</h2>
      <p className="bf-note">每人选 1 张加入牌组（同星级只能带 1 张，旧的进收纳盒）。</p>
      <div className="bf-hand bf-hand-wrap">
        {p.offer.map((c) => {
          const owner = Object.entries(p.picked).find(([, x]) => x === c)?.[0];
          return (
            <CardFace key={c} id={c} selected={mine === c} dim={owner !== undefined && Number(owner) !== mySeat}
              onClick={async () => {
                if (mySeat < 0) return;
                feel("select");
                setMsg((await net.lobby({ type: "PICK_LOOT", card: c })) ?? "");
              }}
              badge={owner !== undefined ? snap.seats[Number(owner)]?.name : undefined}
            />
          );
        })}
      </div>
      {msg && <p className="bf-error">{msg}</p>}
    </section>
  );
}

// ———————————————————— 卡牌 ————————————————————

function CardFace({ id, selected, dim, onClick, badge }: { id: string; selected?: boolean; dim?: boolean; onClick?: () => void; badge?: string }) {
  const c = CARDS[id];
  const kind = cardKind(id);
  const lines = cardText(id);
  return (
    <button className={`bf-cardface k-${kind}${selected ? " sel" : ""}${dim ? " dim" : ""}`} onClick={onClick} data-card={id}>
      <img className="bf-cf-art" src={cardArtUrl(id)} alt="" loading="lazy" />
      <img className="bf-cf-frame" src={frameUrl(id)} alt="" />
      <b className="bf-cf-name">{c?.name ?? id}</b>
      {c?.stars ? <i className="bf-stars">{"★".repeat(c.stars)}</i> : null}
      <span className="bf-cf-text">
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </span>
      {badge && <em className="bf-cf-badge">{badge}</em>}
    </button>
  );
}

// ———————————————————— 战斗 ————————————————————

function Battle({ net, snap }: { net: Net; snap: BFRoomSnapshot }) {
  const v = snap.view!;
  const me = v.heroes.find((h) => h.seat === snap.mySeat) ?? null;
  const [sel, setSel] = useState<string | null>(null);
  const [discards, setDiscards] = useState<number[]>([]);
  const [msg, setMsg] = useState("");
  const [showLog, setShowLog] = useState(false);
  const busy = useRef(false);
  const myTurn = v.phase === "action" && v.actor === snap.mySeat;
  const over = v.phase === "won" || v.phase === "lost";
  const host = snap.seats.find((s) => s.host)?.id === snap.me;

  useEffect(() => {
    setSel(null);
    setDiscards([]);
  }, [v.phase, v.round]);
  useEffect(() => {
    if (myTurn) feel("turn");
  }, [myTurn]);
  useEffect(() => {
    if (over) feel(v.phase === "won" ? "win" : "lose");
  }, [over, v.phase]);

  const send = async (intent: Parameters<Net["send"]>[0]) => {
    if (busy.current) return;
    busy.current = true;
    feel("submit");
    const e = await net.send(intent);
    busy.current = false;
    setMsg(e ?? "");
    if (!e) setSel(null);
  };

  const limit = me ? Math.max(0, me.handLimit - me.status.paralysis - me.curses.filter((c) => c.state === "active").reduce((t, c) => t + (CURSE_BY_ID[c.id]?.handMinus ?? 0), 0)) : 0;
  const mustDiscard = me && v.phase === "discard" && !me.discardDone ? Math.max(0, me.hand.length - limit) : 0;
  const decision = v.phase === "decision" ? v.decisions[0] : null;
  const latestEvent = v.events[v.events.length - 1];

  return (
    <div className={"bf-battle" + (myTurn ? " my-turn" : "")}>
      <TopBar snap={snap} onLog={() => setShowLog(true)} />
      <BossPanel v={v} />
      <EventBanner ev={latestEvent} count={v.events.length} round={v.round} />
      <Attacks v={v} />
      <Heroes v={v} mySeat={snap.mySeat} />

      <div className="bf-dock">
        {v.phase === "chooseStarter" && snap.mySeat >= 0 && (
          <div className="bf-prompt">
            <p>这一回合谁先行动？（任何人都可以决定）</p>
            <div className="bf-seg">
              {v.heroes.map((h) => (
                <button key={h.seat} className="bf-btn" data-testid={"bf-starter-" + h.seat} onClick={() => send({ type: "CHOOSE_STARTER", starter: h.seat })}>{h.name}</button>
              ))}
            </div>
          </div>
        )}
        {decision && (
          <div className="bf-prompt">
            <p>{decision.seat === snap.mySeat ? decision.prompt : `等待 ${v.heroes.find((h) => h.seat === decision.seat)?.name} 决定…`}</p>
            {decision.seat === snap.mySeat && (
              <div className="bf-seg">
                <button className="bf-btn" onClick={() => send({ type: "DECIDE", choice: "exile" })}>本战移除</button>
                <button className="bf-btn" onClick={() => send({ type: "DECIDE", choice: "burn" })}>弃掉并失去 2 生命</button>
              </div>
            )}
          </div>
        )}
        {v.phase === "action" && !myTurn && (
          <p className="bf-wait">{v.actor !== null ? `${v.heroes.find((h) => h.seat === v.actor)?.name} 行动中…` : "结算中…"}</p>
        )}
        {v.phase === "discard" && me && (
          <p className="bf-wait">
            {me.discardDone ? "等待队友弃牌…" : mustDiscard ? `弃牌阶段：手牌上限 ${limit}，请选 ${mustDiscard} 张弃掉` : "手牌没超上限，确认即可"}
          </p>
        )}

        {me && (
          <>
            <div className="bf-hand" data-testid="bf-hand">
              {me.hand.map((c, i) => (
                <CardFace
                  key={c + i}
                  id={c}
                  selected={v.phase === "discard" ? discards.includes(i) : sel === c + "#" + i}
                  onClick={() => {
                    feel("select");
                    if (v.phase === "discard") {
                      if (me.discardDone || c === "slime") return;
                      setDiscards((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
                    } else setSel(sel === c + "#" + i ? null : c + "#" + i);
                  }}
                />
              ))}
              {me.hand.length === 0 && <p className="bf-note">没有手牌</p>}
            </div>
            {v.phase === "discard" && !me.discardDone && (
              <button className="bf-btn bf-primary" disabled={discards.length !== mustDiscard} data-testid="bf-discard"
                onClick={() => send({ type: "DISCARD", cards: discards.map((i) => me.hand[i]) })}>
                {mustDiscard ? `弃掉 ${discards.length}/${mustDiscard} 张` : "确认"}
              </button>
            )}
            {myTurn && sel && <PlaySheet card={sel.split("#")[0]} v={v} onPlay={(target) => send({ type: "PLAY_CARD", card: sel.split("#")[0], target })} onCancel={() => setSel(null)} />}
            {myTurn && !sel && (
              <div className="bf-actions">
                <Items me={me} v={v} onUse={(item, target) => send({ type: "USE_ITEM", item, target })} />
                <button className="bf-btn bf-end" data-testid="bf-end" onClick={() => send({ type: "END_ACTIONS" })}>结束行动</button>
              </div>
            )}
          </>
        )}
        {msg && <p className="bf-error" role="alert">{msg}</p>}
      </div>

      {showLog && <LogSheet v={v} onClose={() => setShowLog(false)} />}
      {over && <Verdict net={net} snap={snap} host={host} />}
    </div>
  );
}

function TopBar({ snap, onLog }: { snap: BFRoomSnapshot; onLog: () => void }) {
  const v = snap.view!;
  return (
    <div className="bf-top">
      <span>第 {v.round} 回合</span>
      <span>{DIFF_ZH[v.difficulty]}</span>
      {v.time !== null && (
        <span className="bf-time"><Icon name="hourglass" /> {v.time}</span>
      )}
      <button className="bf-btn bf-mini" onClick={onLog}>记录</button>
    </div>
  );
}

function Bar({ hp, max, cls = "" }: { hp: number; max: number; cls?: string }) {
  return (
    <span className={"bf-bar " + cls}>
      <i style={{ width: `${Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100))}%` }} />
      <em>{hp}/{max}</em>
    </span>
  );
}

function BossPanel({ v }: { v: BFView }) {
  const b = v.boss;
  const prev = useRef({ hp: b.hp, sh: { ...b.shields }, parts: b.parts.map((p) => p.hp).join(), log: v.log.length });
  const [hit, setHit] = useState(0);
  const fx = useFx();
  useEffect(() => {
    const p = prev.current;
    const recent = v.log.slice(p.log).map((l) => l.text).join("");
    const t = /魔法/.test(recent) ? "magic" : /远程/.test(recent) ? "ranged" : "melee";
    for (const k of TYPES) if (p.sh[k] > 0 && b.shields[k] === 0) fx.play(SHIELD_FX[k]);
    const partsNow = b.parts.map((x) => x.hp).join();
    if (b.hp < p.hp || partsNow !== p.parts) {
      setHit((x) => x + 1);
      fx.play(HIT_FX[t]);
      feel("stamp");
    }
    prev.current = { hp: b.hp, sh: { ...b.shields }, parts: partsNow, log: v.log.length };
  }, [b.hp, b.shields.melee, b.shields.ranged, b.shields.magic, v.log.length]);
  const over = v.phase === "won";
  const [pose, setPose] = useState<"idle" | "hit">("idle");
  useEffect(() => {
    if (!hit) return;
    setPose("hit");
    const t = setTimeout(() => setPose("idle"), 450);
    return () => clearTimeout(t);
  }, [hit]);
  const alt = b.phase2 ? "phase2" : (b as { flags?: Record<string, unknown> }).flags?.rage ? "rage" : undefined;
  return (
    <section className="bf-boss">
      <div className={"bf-boss-art" + (pose === "hit" ? " hit" : "")}>
        <img src={bossUrl(v.bossId, over ? "defeated" : pose, alt)} alt={b.name} />
        {fx.layer}
      </div>
      <div className="bf-boss-info">
        <h2>{b.name}{b.phase2 && " · 第二形态"}</h2>
        <Bar hp={b.hp} max={b.maxHp} cls="boss" />
        <div className="bf-shields">
          {TYPES.map((t) => (
            <span key={t} className={`bf-shield t-${t}${b.spikedShields.includes(t) ? " spiked" : ""}${b.immune.includes(t) ? " immune" : ""}${b.shields[t] === 0 ? " broken" : ""}`} title={TYPE_ZH[t] + "护盾"}>
              <Icon name={t} />
              <b>{b.immune.includes(t) ? "免疫" : b.shields[t]}</b>
              {b.spikedShields.includes(t) && <Icon name="spiked" cls="bf-spike" />}
            </span>
          ))}
          {b.poison > 0 && (
            <span className="bf-chip s-poison"><Icon name="poison" />{b.poison}</span>
          )}
        </div>
        {b.parts.length > 0 && (
          <ul className="bf-parts">
            {b.parts.map((p) => {
              const art = partUrl(v.bossId, p.id);
              return (
                <li key={p.id} className={p.alive ? "" : "down"}>
                  <span>{art ? <img className="bf-part-art" src={art} alt="" /> : p.slot && <Icon name={p.slot} />}{p.name}</span>
                  <Bar hp={p.hp} max={p.maxHp} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function EventBanner({ ev, count, round }: { ev?: BFView["events"][number]; count: number; round: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ev) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [count, round]);
  if (!ev || !show) return null;
  return (
    <div className="bf-event" role="status" key={count}>
      <b>{ev.title}</b>
      <span>{ev.text}</span>
    </div>
  );
}

function Attacks({ v }: { v: BFView }) {
  if (!v.planned.length) return null;
  return (
    <section className="bf-attacks">
      <h3>魔王本回合的攻击</h3>
      <ul>
        {v.planned.map((a) => {
          const t = v.heroes.find((h) => h.seat === a.target);
          const left = a.value < 0 ? "?" : Math.max(0, a.value - a.reducedBy);
          const extras = Object.entries(a.extra).filter(([, n]) => n);
          return (
            <li key={a.id}>
              <span className="bf-atk-name">{a.name}</span>
              <span className="bf-atk-target">→ {t?.name}</span>
              <span className="bf-atk-val">
                <Icon name="swords" />
                {a.reducedBy > 0 && a.value >= 0 ? <s>{a.value}</s> : null}
                <b>{left}</b>
              </span>
              {!a.cancelExtra && extras.length > 0 && (
                <span className="bf-atk-extra">
                  {extras.map(([k, n]) => (
                    <i key={k} className={"s-" + k}>
                      {k in STATUS_ZH ? STATUS_ZH[k as StatusKind] : { curse: "诅咒", slime: "黏液", lost: "失物", discard: "弃牌", drain: "吸血" }[k] ?? k}
                      {typeof n === "number" ? n : ""}
                    </i>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Heroes({ v, mySeat }: { v: BFView; mySeat: number }) {
  return (
    <section className="bf-heroes">
      {v.heroes.map((h) => (
        <HeroCard key={h.seat} h={h} active={v.actor === h.seat} me={h.seat === mySeat} incoming={v.planned.filter((a) => a.target === h.seat && a.value > 0).reduce((t, a) => t + Math.max(0, a.value - a.reducedBy), 0)} />
      ))}
    </section>
  );
}

function HeroCard({ h, active, me, incoming }: { h: ViewHero; active: boolean; me: boolean; incoming: number }) {
  const [open, setOpen] = useState(false);
  const prev = useRef(h.health);
  const [hurt, setHurt] = useState(0);
  const fx = useFx();
  const prevWards = useRef(h.wards.length);
  useEffect(() => {
    if (h.health < prev.current) {
      setHurt((x) => x + 1);
      fx.play("boss-claw");
    } else if (h.health > prev.current) fx.play("heal");
    prev.current = h.health;
  }, [h.health]);
  const prevIn = useRef(incoming);
  useEffect(() => {
    if (incoming < prevIn.current && h.health === prev.current) fx.play("protect");
    prevIn.current = incoming;
  }, [incoming]);
  useEffect(() => {
    if (h.wards.length > prevWards.current) fx.play("protect");
    prevWards.current = h.wards.length;
  }, [h.wards.length]);
  return (
    <div className={`bf-hero${active ? " active" : ""}${me ? " me" : ""}${hurt ? " hurt" : ""}`} key={hurt} onClick={() => setOpen(!open)}>
      <div className="bf-hero-head">
        <span className="bf-hero-art">
          <img src={avatarUrl(h.race, h.cls)} alt="" />
          {STATUSES.filter((k) => h.status[k] > 0).slice(0, 1).map((k) => <StatusLoop key={k} kind={k} />)}
          {fx.layer}
        </span>
        <b>{h.name}</b>
        {active && <em className="bf-turn">行动中</em>}
      </div>
      <Bar hp={h.health} max={h.maxHealth} cls="hero" />
      <div className="bf-hero-meta">
        {incoming > 0 && <span className="bf-chip danger"><Icon name="swords" />{incoming}</span>}
        {STATUSES.filter((k) => h.status[k] > 0).map((k) => (
          <span key={k} className={"bf-chip s-" + k}><Icon name={k} />{h.status[k]}</span>
        ))}
        {h.curses.length > 0 && <span className="bf-chip s-curse"><Icon name="curse" />{h.curses.length}</span>}
        <span className="bf-chip">手 {h.handCount}</span>
        <span className="bf-chip">库 {h.deckCount}</span>
      </div>
      {open && (
        <div className="bf-hero-more">
          <p>{raceName(h.race, h.raceLevel)} · {clsName(h.cls, h.clsLevel)}</p>
          {h.raceLevel >= 2 && <p><b>种族能力：</b>{IDENTITIES[h.race].ability}</p>}
          {h.classAbility && h.clsLevel >= 2 && <p><b>职业能力：</b>{IDENTITIES[h.cls].ability}</p>}
          {h.curses.map((c, i) => (
            <p key={i} className="bf-curse-line"><b>诅咒{c.state === "down" ? "（背面朝上，下个行动阶段翻开）" : ""}：</b>{c.id === "?" ? "？" : CURSE_BY_ID[c.id]?.text}</p>
          ))}
          {h.wards.map((w, i) => (
            <p key={i}><b>{CARDS[w.card]?.name}：</b>{w.against === "trap" ? "可挡一次陷阱" : "可抵消一次生命损失"}</p>
          ))}
          <p>弃牌 {h.discard.length} · 失物 {h.lost.length} · 本战移除 {h.exiled.length}</p>
        </div>
      )}
    </div>
  );
}

function PlaySheet({ card, v, onPlay, onCancel }: { card: string; v: BFView; onPlay: (target?: number) => void; onCancel: () => void }) {
  const needs = cardNeedsTarget(card);
  return (
    <div className="bf-sheet">
      <div className="bf-sheet-row">
        <b>{CARDS[card]?.name}</b>
        <button className="bf-btn bf-mini" onClick={onCancel}>取消</button>
      </div>
      {needs ? (
        <>
          <p className="bf-note">选择目标英雄：</p>
          <div className="bf-seg">
            {v.heroes.map((h) => (
              <button key={h.seat} className="bf-btn bf-primary" data-testid={"bf-target-" + h.seat} onClick={() => onPlay(h.seat)}>
                {h.name} <small>{h.health}♥</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button className="bf-btn bf-primary" data-testid="bf-play" onClick={() => onPlay()}>打出</button>
      )}
    </div>
  );
}

function Items({ me, v, onUse }: { me: ViewHero; v: BFView; onUse: (item: ItemId, target?: number) => void }) {
  const [pick, setPick] = useState<ItemId | null>(null);
  const items = (Object.entries(me.items) as [ItemId, number][]).filter(([, n]) => n > 0);
  if (!items.length) return null;
  return (
    <div className="bf-items">
      {items.map(([it, n]) => (
        <button key={it} className="bf-item" title={ITEM_ZH[it].text} data-testid={"bf-item-" + it}
          onClick={() => (ITEM_ZH[it].target ? setPick(pick === it ? null : it) : onUse(it))}>
          <Icon name={it} />
          <small>{ITEM_ZH[it].name}{Number.isFinite(n) && n > 1 ? `×${n}` : ""}</small>
        </button>
      ))}
      {pick && (
        <div className="bf-seg">
          {v.heroes.map((h) => (
            <button key={h.seat} className="bf-btn" onClick={() => { onUse(pick, h.seat); setPick(null); }}>{h.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function LogSheet({ v, onClose }: { v: BFView; onClose: () => void }) {
  const list = useMemo(() => v.log.slice(-80).reverse(), [v.log]);
  return (
    <div className="bf-overlay" onClick={onClose}>
      <div className="bf-logsheet" onClick={(e) => e.stopPropagation()}>
        <div className="bf-sheet-row">
          <b>战斗记录</b>
          <button className="bf-btn bf-mini" onClick={onClose}>关闭</button>
        </div>
        <ul>
          {list.map((l, i) => (
            <li key={i} className={"k-" + (l.kind ?? "system")}><small>R{l.round}</small> {l.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Verdict({ net, snap, host }: { net: Net; snap: BFRoomSnapshot; host: boolean }) {
  const v = snap.view!;
  const won = v.phase === "won";
  const [msg, setMsg] = useState("");
  return (
    <div className="bf-overlay">
      <div className={"bf-verdict " + (won ? "won" : "lost")}>
        {won ? <img className="bf-verdict-art" src={bossUrl(v.bossId, "defeated")} alt="" /> : <Icon name="skull" cls="bf-verdict-icon" />}
        <h2>{won ? "讨伐成功！" : "讨伐失败"}</h2>
        <p>{won ? `${v.boss.name} 被打倒了（第 ${v.round} 回合）` : `${v.boss.name} 还站着。调整策略再来一次！`}</p>
        {snap.campaign?.pendingLoot && <LootPanel net={net} snap={snap} />}
        {host ? (
          <button className="bf-btn bf-primary" data-testid="bf-back" disabled={!!snap.campaign?.pendingLoot}
            onClick={async () => setMsg((await net.lobby({ type: "BACK_TO_LOBBY" })) ?? "")}>
            {snap.campaign?.pendingLoot ? "等大家选完战利品" : "回到营地"}
          </button>
        ) : (
          <p className="bf-note">等房主回到营地…</p>
        )}
        {msg && <p className="bf-error">{msg}</p>}
      </div>
    </div>
  );
}
