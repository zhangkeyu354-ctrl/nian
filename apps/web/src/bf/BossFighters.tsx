import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BOSSES,
  BOSS_ORDER,
  CARDS,
  deckSize,
  ownActionCards,
  CLASSES,
  CURSE_BY_ID,
  IDENTITIES,
  ITEM_ZH,
  RACES,
  STATUS_ZH,
  TAUNTS,
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
import { getStory, type StoryMoment } from "./story.ts";
import { abilityHelp, STATUS_HELP } from "./boss-guide.ts";
import { isMuted, preloadSfx, setMusic, sfx, toggleMute, trackFor, type Sfx } from "./sound.ts";

/** 引擎视觉事件 → 各组件（魔王面板、英雄卡）播放特效 */
const fxBus = new EventTarget();
const emit = (to: string, name: string) => fxBus.dispatchEvent(new CustomEvent(to, { detail: name }));
function useBus(to: string, fn: (name: string) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = (e: Event) => ref.current((e as CustomEvent<string>).detail);
    fxBus.addEventListener(to, h);
    return () => fxBus.removeEventListener(to, h);
  }, [to]);
}
import { HIT_FX, SHIELD_FX, itemUrl, medalUrl, type FxName, StatusLoop, avatarUrl, bgUrl, bossUrl, cardArtUrl, frameUrl, heroUrl, partUrl, useFx } from "./art.tsx";

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

/** 原创剧情面板（只在战役模式出现；可各自收起，不影响规则与存档） */
/** 剧情关卡：第一次到这里时整屏播放剧情，看完才进入营地/结算；之后只留一个“重看剧情”按钮 */
function StoryGate({ mode, bossId, moment }: { mode: string; bossId: string; moment: StoryMoment }) {
  const chapter = getStory(mode, bossId, moment);
  const key = "bf-scene-seen:" + bossId + ":" + moment;
  const [show, setShow] = useState(() => {
    try {
      return !localStorage.getItem(key);
    } catch {
      return true;
    }
  });
  if (!chapter) return null;
  const done = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    setShow(false);
  };
  return show ? (
    <StoryScene bossId={bossId} moment={moment} onDone={done} />
  ) : (
    <button className="bf-btn bf-mini bf-replay" data-testid={"bf-replay-" + moment} onClick={() => setShow(true)}>
      重看剧情 · {chapter.title}
    </button>
  );
}

/** 整屏剧情：插画铺满，文字一句一句出现，点屏幕看下一句；全部看完才能继续 */
function StoryScene({ bossId, moment, onDone }: { bossId: string; moment: StoryMoment; onDone: () => void }) {
  const chapter = getStory("campaign", bossId, moment)!;
  const [n, setN] = useState(1);
  const all = n >= chapter.lines.length;
  const next = () => {
    if (!all) {
      feel("tap", { sound: false });
      setN((x) => x + 1);
    }
  };
  return createPortal(
    <div className={"bf-scene m-" + moment} data-testid={"bf-scene-" + moment} onClick={next}>
      <img
        className="bf-scene-art"
        src={chapter.image}
        alt={chapter.imageAlt}
        onError={(e) => {
          const img = e.currentTarget;
          if (chapter.fallback && !img.src.endsWith(chapter.fallback)) img.src = chapter.fallback;
        }}
      />
      <div className="bf-scene-text">
        <h2>{chapter.title}</h2>
        {chapter.lines.slice(0, n).map((line, i) => (
          <p key={i} className="bf-scene-line">{line}</p>
        ))}
        {all ? (
          <button
            className="bf-btn bf-primary bf-scene-go"
            data-testid="bf-scene-done"
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
          >
            {moment === "before" ? "前往营地" : "继续"}
          </button>
        ) : (
          <span className="bf-scene-hint">点击屏幕继续</span>
        )}
      </div>
    </div>,
    document.querySelector(".bf-world") ?? document.body,
  );
}

/** 营地里的故事书：按章节重看已经打过的剧情 */
function StoryBook({ progress }: { progress: number }) {
  const done = BOSS_ORDER.slice(0, progress + 1);
  return (
    <details className="bf-storybook" data-testid="bf-storybook">
      <summary>
        <b>故事书</b>
        <span>已解锁 {done.length} / {BOSS_ORDER.length} 章</span>
      </summary>
      {done.map((id) => (
        <div key={id} className="bf-storybook-ch">
          <Story mode="campaign" bossId={id} moment="before" open={false} inBook />
          <Story mode="campaign" bossId={id} moment="victory" open={false} inBook />
        </div>
      ))}
    </details>
  );
}

export function Story({ mode, bossId, moment, open = true, inBook = false }: { mode: string; bossId: string; moment: StoryMoment; open?: boolean; inBook?: boolean }) {
  const chapter = getStory(mode, bossId, moment);
  // 战前剧情：这台设备第一次看到时展开，以后默认收起（重打、换房间都不再挡路）
  const [firstTime] = useState(() => {
    if (moment !== 'before' || !chapter || inBook) return true;
    const key = 'bf-story-seen:' + bossId;
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, '1');
    } catch {}
    return true;
  });
  if (!chapter) return null;
  return (
    <details className="bf-story" open={open && firstTime} data-testid={inBook ? undefined : "bf-story-" + moment}>
      <summary>
        <b>{chapter.title}</b>
        <span>展开 / 收起</span>
      </summary>
      <div className="bf-story-body">
        <img
          className="bf-story-art"
          src={chapter.image}
          alt={chapter.imageAlt}
          width="1672"
          height="941"
          loading="lazy"
          onError={(e) => {
            // 正式插画还没放进来时，先用这一关的场景背景
            const img = e.currentTarget;
            if (chapter.fallback && !img.src.endsWith(chapter.fallback)) img.src = chapter.fallback;
          }}
        />
        {chapter.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </details>
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
  const bossNow = snap?.stage === "game" && snap.view ? snap.view.bossId : null;
  useEffect(() => {
    setMusic(trackFor(bossNow));
    return () => setMusic(null);
  }, [bossNow]);
  if (net.error && !snap) return <div className="bf-world bf-center">{net.error}<a className="bf-btn" href="/">回大厅</a></div>;
  if (!snap) return <div className="bf-world bf-center">正在进入房间…</div>;
  const seated = snap.seats.some((s) => s.id === snap.me);
  const known = !!snap.me;
  return (
    <div className="bf-world" data-testid="bf-root" style={{ ["--bf-bgimg" as string]: `url(${bgUrl(snap.stage === "game" && snap.view ? snap.view.bossId : null)})` }}>
      <CardZoom />
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
    feel("tap", { sound: false });
    sfx("tap");
    setMsg((await net.lobby(a)) ?? "");
  };
  const camp = snap.campaign;
  const locked = !!camp;
  const progress = camp?.progress ?? -1;
  const ready = snap.seats.length >= 2 && snap.seats.every((s) => s.race && s.cls);
  const [rules, setRules] = useState(false);
  return (
    <div className="bf-panel bf-lobby">
      <Title />
      <button className="bf-btn bf-mini bf-howto" onClick={() => setRules(true)}>怎么玩？</button>
      {rules && <RulesSheet onClose={() => setRules(false)} />}
      <StoryGate mode={snap.mode} bossId={snap.bossId} moment="before" />
      <section className="bf-card">
        <h2>冒险团</h2>
        <ul className="bf-seats">
          {snap.seats.map((s, i) => (
            <li key={s.id} className={s.id === snap.me ? "me" : ""}>
              <span className="bf-seat-art">
                {s.race && s.cls ? <img src={avatarUrl(s.race, s.cls)} alt="" /> : <Icon name={s.race ?? "skull"} />}
              </span>
              <span className="bf-seat-name">
                <b>{s.name}{s.host && " · 房主"}{s.auto ? " · 托管中" : !s.connected ? " · 离线" : ""}</b>
                <small>{s.race && s.cls ? `${raceName(s.race)} · ${clsName(s.cls)}` : "还没选英雄"}</small>
              </span>
              {locked && seated && s.id !== snap.me && !camp?.pendingLoot && (
                <button className="bf-btn bf-mini" data-testid={"bf-take-" + i} onClick={() => act({ type: "TAKE_HERO", index: i })}>
                  {s.bot ? "我来玩这个" : "和 TA 换"}
                </button>
              )}
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
        {locked && seated && <p className="bf-note">读档后系统会按昵称把你对回上次的英雄；对不上的话，点别人旁边的按钮换过去。</p>}
      </section>

      {seated && me && !camp?.pendingLoot && (
        <section className="bf-card" data-testid="bf-hero-picker">
          <h2>{locked ? "更换英雄 / 职业" : "选择你的英雄"}</h2>
          <p className="bf-note">
            英雄 = 种族 + 职业。同一队种族不能重复。
            {locked && " 两场战斗之间可以随时换；战利品跟着你走，换了之后移除的行动卡要重新选。"}
          </p>
          <div className="bf-picker">
            {RACES.map((r) => {
              const taken = snap.seats.some((s, i) => i !== mySeat && s.race === r);
              const id = IDENTITIES[r];
              return (
                <button key={r} className={"bf-pick" + (me.race === r ? " on" : "")} disabled={taken} data-testid={"bf-race-" + r} onClick={() => act({ type: "PICK", race: r, cls: me.cls })}>
                  <Icon name={r} />
                  <b>{id.name}</b>
                  <small><span className="nb">手牌 {id.levels[0][0]}</span> · <span className="nb">生命 {id.levels[0][1]}</span></small>
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
                  <small><span className="nb">手牌 +{id.levels[0][0]}</span> · <span className="nb">生命 +{id.levels[0][1]}</span></small>
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

      {camp && seated && mySeat >= 0 && !camp.pendingLoot && <DeckPanel net={net} snap={snap} seat={mySeat} />}
      <section className="bf-card">
        <h2>挑战</h2>
        <div className="bf-seg">
          {(["campaign", "single"] as const).map((m) => (
            <button key={m} className={"bf-btn" + (snap.mode === m ? " on" : "")} disabled={!host} aria-pressed={snap.mode === m} data-testid={"bf-mode-" + m} onClick={() => act({ type: "SET_MODE", mode: m })}>
              {m === "campaign" ? "战役（逐关解锁）" : "自由挑战"}
            </button>
          ))}
        </div>
        {snap.mode === "campaign" && snap.campaignCode && (
          <p className="bf-savecode" data-testid="bf-savecode">
            冒险团存档码 <b>{snap.campaignCode}</b>
            <small>记下这 6 个字母，换房间或隔天也能用它继续战役。</small>
          </p>
        )}
        {snap.mode === "campaign" && !camp && host && <LoadCampaign onLoad={(code) => act({ type: "LOAD_CAMPAIGN", code })} />}
        {snap.mode === "campaign" && camp && (
          <p className="bf-note">
            已通关 {progress + 1} 关 · 英雄 {unlocks(progress).raceLevel} 级 · 职业 {unlocks(progress).clsLevel} 级
            {host && (
              <button className="bf-link" onClick={() => confirm("重开冒险团会清空战役进度，确定吗？") && act({ type: "RESET_CAMPAIGN" })}>重开冒险团</button>
            )}
          </p>
        )}
        {snap.mode === "campaign" && camp && progress >= 0 && <StoryBook progress={progress} />}
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
                {best && <img className="bf-node-medal" src={medalUrl(best)} alt={DIFF_ZH[best] + "通关"} />}
                {!!camp?.results[id]?.losses && <u>☠{camp.results[id].losses}</u>}
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

/** 我的牌组：带着的战利品、收纳盒、移除行动卡（官方：每星级 1 张，战斗前可换；每张战利品可移除 1 张行动卡，牌组至少 20 张） */
function DeckPanel({ net, snap, seat }: { net: Net; snap: BFRoomSnapshot; seat: number }) {
  const c = snap.campaign!;
  const h = c.heroes[seat];
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"loot" | "box" | "trim">("loot");
  const send = async (a: Parameters<Net["lobby"]>[0]) => {
    feel("select", { sound: false });
    setMsg((await net.lobby(a)) ?? "");
  };
  const size = deckSize(c, seat);
  const own = ownActionCards(c, seat);
  const st = (x: string) => CARDS[x]?.stars ?? 0;
  const box = [...c.lootStorage].sort((x, y) => st(x) - st(y));
  const mine = [...h.loot].sort((x, y) => st(x) - st(y));
  if (!mine.length && !box.length) return null;
  const toggle = (id: string) => {
    const next = h.removed.includes(id) ? h.removed.filter((x) => x !== id) : [...h.removed, id];
    send({ type: "SET_REMOVED", removed: next });
  };
  return (
    <section className="bf-card bf-deck" data-testid="bf-deck">
      <h2>我的牌组 <small>{size} 张</small></h2>
      <div className="bf-seg bf-deck-tabs">
        <button className={"bf-btn" + (tab === "loot" ? " on" : "")} onClick={() => setTab("loot")}>带着的战利品 {mine.length}</button>
        <button className={"bf-btn" + (tab === "box" ? " on" : "")} data-testid="bf-tab-box" onClick={() => setTab("box")}>收纳盒 {box.length}</button>
        <button className={"bf-btn" + (tab === "trim" ? " on" : "")} onClick={() => setTab("trim")}>精简牌组</button>
      </div>
      {tab === "loot" && (
        <>
          <p className="bf-note">每个星级只能带 1 张。想换的话去「收纳盒」挑一张同星级的。重打低关时，只会带上星级不超过那一关的战利品。</p>
          <div className="bf-hand bf-hand-wrap">{mine.map((id) => <CardFace key={id} id={id} />)}</div>
        </>
      )}
      {tab === "box" && (
        <>
          <p className="bf-note bf-box-intro">
            收纳盒放着全队没选走、或者被换下来的战利品，大家共用。每场开打前都可以来这里换：点一张卡就带上它，你手上同星级的那张会自动放回收纳盒。
          </p>
          {box.length ? (
            <div className="bf-hand bf-hand-wrap">
              {box.map((id) => {
                const old = h.loot.find((x) => st(x) === st(id));
                return <CardFace key={id} id={id} badge={old ? `换下${CARDS[old]?.name ?? ""}` : "带上"} onClick={() => send({ type: "SWAP_LOOT", card: id })} />;
              })}
            </div>
          ) : (
            <p className="bf-note">收纳盒现在是空的。</p>
          )}
        </>
      )}
      {tab === "trim" && (
        <>
          <p className="bf-note">
            每有 1 张战利品，可以从牌组拿掉 1 张自己的行动卡（已拿掉 {h.removed.length} / {h.loot.length}）。牌组至少 20 张。点卡切换，灰掉的是拿掉的。
          </p>
          <div className="bf-hand bf-hand-wrap">
            {own.map((id) => <CardFace key={id} id={id} dim={h.removed.includes(id)} badge={h.removed.includes(id) ? "已拿掉" : undefined} onClick={() => toggle(id)} />)}
          </div>
        </>
      )}
      {msg && <p className="bf-error">{msg}</p>}
    </section>
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
      <p className="bf-note">每人选 1 张加入牌组。同星级只能带 1 张，换下来的和没人选的都会放进「收纳盒」，回营地后在「我的牌组」里随时可以换。</p>
      <div className="bf-hand bf-hand-wrap">
        {p.offer.map((c) => {
          const owner = Object.entries(p.picked).find(([, x]) => x === c)?.[0];
          return (
            <CardFace key={c} id={c} selected={mine === c} dim={owner !== undefined && Number(owner) !== mySeat}
              onClick={async () => {
                if (mySeat < 0) return;
                feel("select", { sound: false });
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

export function CardFace({ id, selected, dim, onClick, badge, big }: { id: string; selected?: boolean; dim?: boolean; onClick?: () => void; badge?: string; big?: boolean }) {
  const c = CARDS[id];
  const kind = cardKind(id);
  const lines = cardText(id);
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const startHold = () => {
    held.current = false;
    if (big) return;
    hold.current = window.setTimeout(() => {
      held.current = true;
      zoomCard(id);
    }, 420);
  };
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  return (
    <button
      className={`bf-cardface k-${kind}${selected ? " sel" : ""}${dim ? " dim" : ""}${big ? " big" : ""}`}
      onClick={() => {
        if (held.current) return; // 长按看大图，不当作点击
        onClick?.();
      }}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!big) zoomCard(id);
      }}
      data-card={id}
    >
      <img className="bf-cf-art" src={cardArtUrl(id)} alt="" loading="lazy" />
      <img className="bf-cf-frame" src={frameUrl(id)} alt="" />
      <b className="bf-cf-name">{c?.name ?? id}</b>
      {c?.stars ? <i className="bf-stars">{"★".repeat(c.stars)}</i> : null}
      <span className="bf-cf-text">
        {c?.source === 'original' && <span>原创补充</span>}
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </span>
      {badge && <em className="bf-cf-badge">{badge}</em>}
    </button>
  );
}

/** 长按卡牌：全屏放大查看 */
const zoomBus = new EventTarget();
const zoomCard = (id: string) => {
  feel("select", { sound: false });
  zoomBus.dispatchEvent(new CustomEvent("zoom", { detail: id }));
};
function CardZoom() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<string>).detail);
    zoomBus.addEventListener("zoom", h);
    return () => zoomBus.removeEventListener("zoom", h);
  }, []);
  if (!id) return null;
  return (
    <div className="bf-overlay bf-zoom" onClick={() => setId(null)} data-testid="bf-zoom">
      <CardFace id={id} big />
      <p className="bf-note">点任意处关闭</p>
    </div>
  );
}

function LoadCampaign({ onLoad }: { onLoad: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="bf-loadcamp">
      <input value={code} maxLength={6} placeholder="已有存档码？" onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="bf-loadcode" />
      <button className="bf-btn bf-mini" disabled={code.length !== 6} onClick={() => onLoad(code)} data-testid="bf-loadcamp">继续冒险</button>
    </div>
  );
}

// ———————————————————— 规则与教学 ————————————————————

const RULES: [string, string][] = [
  ["目标", "大家合作，把魔王的生命打到 0。任何一名英雄生命归零，全队失败。"],
  ["每回合流程", "① 魔王公布这回合要打谁（攻击列表）→ ② 魔王立起护盾 → ③ 英雄们轮流行动（选谁先手）→ ④ 魔王按列表攻击 → ⑤ 中毒等状态结算 → ⑥ 弃牌到手牌上限 → ⑦ 抽牌补满。"],
  ["行动", "每人每回合有 3 次行动机会，每次打 1 张牌或用 1 个道具。卡上有 ⚡ 闪电的，打出后马上再得 1 次行动。"],
  ["护盾", "魔王有近战、远程、魔法三面护盾。你的攻击先打掉同类型的护盾，剩下的才会扣魔王生命。"],
  ["助攻", "助攻牌只有在本回合已经打过同类型攻击时才生效，适合接在攻击后面打。"],
  ["保护", "保护牌可以减少魔王对某位英雄的一次攻击。看清攻击列表，优先保护快要倒下的队友。"],
  ["状态", "中毒：每回合掉血。惊恐：只能随机出牌。麻痹：手牌上限变少。着火：每回合烧掉一张牌或掉 2 血。"],
  ["诅咒", "被诅咒时会拿到一张背面朝上的诅咒牌，下个行动阶段翻开生效。"],
  ["战役", "从教学关打起，每通关一关解锁下一关、升级英雄并挑选战利品。记下冒险团存档码，随时能继续。"],
];

/** 魔王动向：最近发生的魔王能力，错过弹窗也能回看 */
function BossRecap({ v }: { v: BFView }) {
  // 引擎每回合开始会清空事件，这里在界面上攒起来，保留上一回合的能力可以回看
  const [kept, setKept] = useState<BFView["events"]>([]);
  useEffect(() => {
    setKept((old) => {
      const key = (e: BFView["events"][number]) => e.round + "|" + e.title + "|" + e.text;
      const have = new Set(old.map(key));
      const add = v.events.filter((e) => e.kind !== "exileForever" && !have.has(key(e)));
      return add.length ? [...old, ...add].slice(-20) : old;
    });
  }, [v.events.length, v.round]);
  const list = kept.filter((e) => e.round >= v.round - 1).slice(-8).reverse();
  if (!list.length) return null;
  return (
    <details className="bf-recap" data-testid="bf-recap">
      <summary>
        <b>魔王动向</b>
        <span>最近 {list.length} 条</span>
      </summary>
      <ul>
        {list.map((e, i) => (
          <li key={i} className={"k-" + e.kind}>
            <small>第 {e.round} 回合</small>
            <b>{e.title}</b>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RulesSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="bf-overlay" onClick={onClose}>
      <div className="bf-logsheet bf-rules" onClick={(e) => e.stopPropagation()}>
        <div className="bf-sheet-row">
          <b>怎么玩</b>
          <button className="bf-btn bf-mini" onClick={onClose}>关闭</button>
        </div>
        <dl>
          {RULES.map(([k, t]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{t}</dd>
            </div>
          ))}
        </dl>
        <p className="bf-note">长按任意卡牌可以放大看完整效果。</p>
      </div>
    </div>
  );
}

/** 教学关的分步提示：按当前阶段给一句话指引 */
function Coach({ v, mySeat, myTurn }: { v: BFView; mySeat: number; myTurn: boolean }) {
  const [off, setOff] = useState(false);
  if (off || v.bossId !== "puppet" || mySeat < 0 || v.phase === "won" || v.phase === "lost") return null;
  const me = v.heroes.find((h) => h.seat === mySeat);
  const sh = v.boss.shields;
  const shields = sh.melee + sh.ranged + sh.magic;
  let tip = "";
  if (v.phase === "chooseStarter") tip = v.round === 1 ? "先看上方「魔王本回合的攻击」：木偶要打谁、打多少。然后选一个人先行动。" : "新的一回合：再看看攻击列表，决定谁先手。";
  else if (v.phase === "action" && myTurn) {
    if (v.round === 1) tip = "轮到你了！点一张攻击牌打木偶。卡上有 ⚡ 的打完还能再行动一次。";
    else if (shields > 0) tip = "魔王身上的护盾会先挡住同类型的攻击。用对应类型的攻击把护盾打碎，伤害才能落到魔王身上。";
    else if (me && v.planned.some((a) => a.target === mySeat && a.value - a.reducedBy >= me.health)) tip = "危险！这回合的攻击会让你倒下。打一张保护牌给自己挡一下。";
    else tip = "护盾已碎，放心输出！行动用完或不想再出牌，就点「结束行动」。";
  } else if (v.phase === "action") tip = "队友正在行动。可以长按自己的手牌看看效果，想想下一步。";
  else if (v.phase === "discard") tip = "手牌超过上限要弃掉几张。留下攻击和保护，弃掉暂时用不上的。";
  if (!tip) return null;
  return (
    <div className="bf-coach" role="note">
      <b>教学</b>
      <span>{tip}</span>
      <button className="bf-link" onClick={() => setOff(true)}>不再提示</button>
    </div>
  );
}

/** 出牌动画：所选卡牌飞向魔王 */
function flyCard() {
  const card = document.querySelector<HTMLElement>(".bf-hand .bf-cardface.sel");
  const boss = document.querySelector<HTMLElement>(".bf-boss-art");
  if (!card || !boss || !card.animate) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const a = card.getBoundingClientRect();
  const b = boss.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, { position: "fixed", left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px", margin: "0", zIndex: "60", pointerEvents: "none" });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  ghost
    .animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 40}px) scale(.8) rotate(-8deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(6deg)`, opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)" },
    )
    .finished.finally(() => ghost.remove());
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
  // 引擎视觉事件：只处理新增的（进入画面时不重放旧事件）
  const seen = useRef(v.fx?.length ? v.fx[v.fx.length - 1].n : 0);
  useEffect(() => {
    preloadSfx(["hit-melee", "hit-ranged", "hit-magic", "shield-break", "boss-attack", "hurt", "heal", "protect", "play"]);
  }, []);
  useEffect(() => {
    const fresh = (v.fx ?? []).filter((e) => e.n > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].n;
    let roared = false;
    fresh.forEach((e, i) => {
      const at = () => {
        const t = e.type ?? "melee";
        if (e.kind === "hit" || e.kind === "part") {
          emit("boss", HIT_FX[t]);
          sfx(("hit-" + t) as Sfx);
        } else if (e.kind === "shield") {
          emit("boss", SHIELD_FX[t]);
          sfx("shield-break");
        } else if (e.kind === "bossAttack") {
          if (!roared) sfx("boss-attack");
          roared = true;
          emit("hero:" + e.seat, "boss-claw");
          sfx("hurt");
        } else if (e.kind === "blocked" || e.kind === "protect") {
          emit("hero:" + e.seat, "protect");
          sfx("protect");
        } else if (e.kind === "heal") {
          emit("hero:" + e.seat, "heal");
          sfx("heal");
        } else if (e.kind === "curse") {
          emit("hero:" + e.seat, "curse");
          sfx("curse");
        }
        else if (e.kind === "status") sfx("status");
      };
      // 同一批事件依次播放，攻击阶段一下一下打出来
      if (i === 0) at();
      else setTimeout(at, Math.min(i, 8) * 260);
    });
  }, [v.fx?.length ? v.fx[v.fx.length - 1].n : 0]);
  useEffect(() => {
    if (v.phase === "won") sfx("boss-down");
  }, [v.phase]);
  useEffect(() => {
    if (myTurn) sfx("turn");
    if (myTurn) feel("turn", { sound: false });
  }, [myTurn]);
  useEffect(() => {
    if (over) {
      feel(v.phase === "won" ? "win" : "lose", { sound: false });
      setTimeout(() => sfx(v.phase === "won" ? "win" : "lose"), 700);
    }
  }, [over, v.phase]);

  const [showRules, setShowRules] = useState(false);
  const send = async (intent: Parameters<Net["send"]>[0]) => {
    if (busy.current) return;
    busy.current = true;
    feel("submit", { sound: false });
    if (intent.type === "PLAY_CARD") {
      sfx("play");
      flyCard();
    }
    const e = await net.send(intent);
    busy.current = false;
    setMsg(e ?? "");
    if (!e) setSel(null);
  };

  const limit = me ? Math.max(0, me.handLimit - me.status.paralysis - me.curses.filter((c) => c.state === "active").reduce((t, c) => t + (CURSE_BY_ID[c.id]?.handMinus ?? 0), 0)) : 0;
  const mustDiscard = me && v.phase === "discard" && !me.discardDone ? Math.max(0, me.hand.length - limit) : 0;
  const decision = v.phase === "decision" ? v.decisions[0] : null;

  return (
    <div className={"bf-battle" + (myTurn ? " my-turn" : "")}>
      <TopBar snap={snap} onLog={() => setShowLog(true)} onRules={() => setShowRules(true)} />
      <BossPanel v={v} />
      <Taunt v={v} />
      <EventBanner v={v} />
      <Attacks v={v} canRetarget={v.phase === "chooseStarter" && snap.mySeat >= 0} onRetarget={(attack, target) => send({ type: "RETARGET", attack, target })} />
      <Heroes v={v} mySeat={snap.mySeat} autos={snap.seats.map((x) => !!x.auto)} />
      <Coach v={v} mySeat={snap.mySeat} myTurn={myTurn} />

      <div className="bf-dock">
        {v.phase !== "chooseStarter" && <ShieldStrip v={v} />}
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
        {v.pick && (
          <div className="bf-prompt bf-pick-panel">
            <p>{v.pick.seat === snap.mySeat ? v.pick.prompt + (v.pick.kind === "eye" && v.pick.picked.length ? `（已放 ${v.pick.picked.length} 张）` : "") : `等待 ${v.heroes.find((h) => h.seat === v.pick!.seat)?.name} 挑牌…`}</p>
            {v.pick.seat === snap.mySeat && (
              <div className="bf-hand bf-hand-wrap">
                {v.pick.options.map((c, i) => {
                  const used = v.pick!.kind === "eye" && v.pick!.picked.includes(c) && v.pick!.picked.filter((x) => x === c).length >= v.pick!.options.slice(0, i + 1).filter((x) => x === c).length;
                  return <CardFace key={c + i} id={c} dim={used} onClick={() => !used && send({ type: "PICK", card: c })} />;
                })}
              </div>
            )}
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
                    feel("select", { sound: false });
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
      {showRules && <RulesSheet onClose={() => setShowRules(false)} />}
      <Preload v={v} />
      {over && <Verdict net={net} snap={snap} host={host} />}
    </div>
  );
}

function TopBar({ snap, onLog, onRules }: { snap: BFRoomSnapshot; onLog: () => void; onRules: () => void }) {
  const v = snap.view!;
  return (
    <div className="bf-top">
      <span>第 {v.round} 回合</span>
      <span>{DIFF_ZH[v.difficulty]}</span>
      {v.time !== null && (
        <span className="bf-time"><Icon name="hourglass" /> {v.time}</span>
      )}
      <MuteButton />
      <button className="bf-btn bf-mini" onClick={onRules} data-testid="bf-rules">规则</button>
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
  const [hit, setHit] = useState(0);
  const fx = useFx();
  useBus("boss", (name) => {
    fx.play(name as FxName);
    if (name.startsWith("hit-")) setHit((x) => x + 1);
  });
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

/** 魔王能力横幅：同时触发多个时排队依次显示 */
function EventBanner({ v }: { v: BFView }) {
  // 魔王播报：攻击结算、能力发动、形态变化……每个人自己点“知道了”才消失，别人点了不影响你
  const [queue, setQueue] = useState<BFView["events"]>([]);
  const seen = useRef({ round: v.round, n: 0 });
  useEffect(() => {
    const from = seen.current.round === v.round ? seen.current.n : 0;
    const fresh = v.events.slice(from).filter((e) => e.kind !== "exileForever");
    seen.current = { round: v.round, n: v.events.length };
    if (fresh.length) setQueue((q) => [...q, ...fresh].slice(-30));
  }, [v.events.length, v.round]);
  if (!queue.length) return null;
  const isTurn = queue.some((e) => e.kind === "report");
  return createPortal(
    <div className="bf-overlay bf-cast-overlay">
      <div className="bf-cast" role="dialog" aria-label="魔王播报" data-testid="bf-cast">
        <h3>{isTurn ? "魔王行动播报" : "魔王播报"}</h3>
        <ol>
          {queue.map((e, i) => (
            <li key={i} className={"k-" + e.kind}>
              <b>{e.title}</b>
              <span>{e.text}</span>
              {abilityHelp(v.bossId, e.title) && <em>{abilityHelp(v.bossId, e.title)}</em>}
            </li>
          ))}
        </ol>
        <button className="bf-btn bf-primary" data-testid="bf-cast-ok" onClick={() => setQueue([])}>
          知道了
        </button>
        <small>只有你自己点了才会关闭，不影响队友。</small>
      </div>
    </div>,
    document.querySelector(".bf-world") ?? document.body,
  );
}

/** 魔王台词气泡（官方原文） */
function Taunt({ v }: { v: BFView }) {
  const t = v.taunt;
  const [show, setShow] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (!t) return;
    setShow(true);
    const ms = first.current ? 4500 : 3800;
    first.current = false;
    const timer = setTimeout(() => setShow(false), ms);
    return () => clearTimeout(timer);
  }, [t?.n]);
  if (!t || !show || t.key === "Win" || t.key === "Lose") return null;
  return (
    <div className="bf-taunt" role="status" key={t.n} onClick={() => setShow(false)}>
      <b>{v.boss.name}</b>
      <span>「{t.text}」</span>
    </div>
  );
}

function Attacks({ v, canRetarget, onRetarget }: { v: BFView; canRetarget: boolean; onRetarget: (attack: string, target: number) => void }) {
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
              {canRetarget && a.tieOptions && (
                <span className="bf-tie">
                  生命并列，可改给：
                  {a.tieOptions.filter((x) => x !== a.target).map((x) => (
                    <button key={x} className="bf-btn bf-mini" data-testid={`bf-retarget-${a.id}-${x}`} onClick={() => onRetarget(a.id, x)}>
                      {v.heroes.find((h) => h.seat === x)?.name}
                    </button>
                  ))}
                </span>
              )}
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
      {(() => {
        const kinds = [...new Set(v.planned.filter((a) => !a.cancelExtra).flatMap((a) => Object.entries(a.extra).filter(([, n]) => n).map(([k]) => k)))].filter((k) => STATUS_HELP[k]);
        return kinds.length ? (
          <ul className="bf-atk-legend" data-testid="bf-atk-legend">
            {kinds.map((k) => <li key={k}>{STATUS_HELP[k]}</li>)}
          </ul>
        ) : null;
      })()}
      {v.planned.some((a) => a.reducedBy > 0) && <p className="bf-atk-note">划掉的数字是原本的伤害，后面是被保护挡掉后实际会受的伤害。</p>}
      <BossRecap v={v} />
    </section>
  );
}

function Heroes({ v, mySeat, autos }: { v: BFView; mySeat: number; autos: boolean[] }) {
  return (
    <section className="bf-heroes">
      {v.heroes.map((h) => (
        <HeroCard key={h.seat} h={h} auto={autos[h.seat]} active={v.actor === h.seat} me={h.seat === mySeat} incoming={v.planned.filter((a) => a.target === h.seat && a.value > 0).reduce((t, a) => t + Math.max(0, a.value - a.reducedBy), 0)} />
      ))}
    </section>
  );
}

function HeroCard({ h, active, me, incoming, auto }: { h: ViewHero; active: boolean; me: boolean; incoming: number; auto?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hurt, setHurt] = useState(0);
  const fx = useFx();
  useBus("hero:" + h.seat, (name) => {
    fx.play(name as FxName);
    if (name === "boss-claw") setHurt((x) => x + 1);
  });
  return (
    <div className={`bf-hero${active ? " active" : ""}${me ? " me" : ""}${hurt ? " hurt" : ""}`} key={hurt} onClick={() => setOpen(!open)}>
      <div className="bf-hero-head">
        <span className="bf-hero-art">
          <img src={avatarUrl(h.race, h.cls)} alt="" />
          {STATUSES.filter((k) => h.status[k] > 0).slice(0, 1).map((k) => <StatusLoop key={k} kind={k} />)}
          {fx.layer}
        </span>
        <b>{h.name}</b>
        {auto && <em className="bf-auto">托管</em>}
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
          <img className="bf-item-img" src={itemUrl(it)} alt="" />
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

/** 战役通关画面：冒险团合影 + 每关战绩，方便截图分享 */
function Finale({ camp }: { camp: NonNullable<BFRoomSnapshot["campaign"]> }) {
  const losses = Object.values(camp.results).reduce((n, r) => n + (r.losses ?? 0), 0);
  return (
    <section className="bf-finale" data-testid="bf-finale">
      <img
        className="bf-finale-art"
        src="/assets/bf/story/finale.webp"
        alt="冒险团与获救的木偶骑士、青蛙王子在城堡前合影"
        width="1672"
        height="941"
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.endsWith("/assets/bf/bg/castle.webp")) img.src = "/assets/bf/bg/castle.webp";
        }}
      />
      <h3>战役通关！</h3>
      <p className="bf-finale-team">{camp.name ? `「${camp.name}」` : "冒险团"}：{camp.heroes.map((h) => `${h.name}（${raceName(h.race)}${clsName(h.cls)}）`).join("、")}</p>
      <p className="bf-finale-sum">11 关全部通过 · 一共倒下 {losses} 次</p>
      <ol className="bf-finale-list">
        {BOSS_ORDER.map((id) => {
          const r = camp.results[id];
          return (
            <li key={id}>
              <span>{BOSSES[id].name}</span>
              <span>{r?.best ? DIFF_ZH[r.best] : "—"}{r?.losses ? ` · 失败 ${r.losses} 次` : " · 一次过"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** 出牌区上方常驻的战况条：三种护盾 + 本回合已打出的攻击类型（决定谁能接助攻） */
function ShieldStrip({ v }: { v: BFView }) {
  const b = v.boss;
  const parts = b.parts.length > 0;
  return (
    <div className="bf-strip" data-testid="bf-strip">
      <div className="bf-strip-boss">
        <b>{b.name}</b>
        <span>{parts ? `${b.parts.filter((p) => p.alive).length} 个部位` : `${b.hp}/${b.maxHp}`}</span>
      </div>
      {TYPES.map((t) => {
        const n = b.shields[t];
        const immune = b.immune.includes(t);
        const open = v.attackedTypes?.[t];
        return (
          <div key={t} className={`bf-strip-sh t-${t}${n === 0 ? " zero" : ""}${immune ? " immune" : ""}${open ? " open" : ""}${b.spikedShields.includes(t) ? " spiked" : ""}`}>
            <span className="bf-strip-top"><Icon name={t} /><b key={n} className="bf-pop">{immune ? "免疫" : n}</b></span>
            <small>{open ? "已出 · 可助攻" : n === 0 ? "无" + TYPE_ZH[t] + "盾" : TYPE_ZH[t] + "盾"}</small>
          </div>
        );
      })}
    </div>
  );
}

function Verdict({ net, snap, host }: { net: Net; snap: BFRoomSnapshot; host: boolean }) {
  const v = snap.view!;
  const won = v.phase === "won";
  const [msg, setMsg] = useState("");
  const fx = useFx();
  const prog = snap.campaign?.progress ?? -1;
  const before = unlocks(prog - 1), after = unlocks(prog);
  const leveled = won && snap.campaign && (after.raceLevel > before.raceLevel || after.clsLevel > before.clsLevel);
  useEffect(() => {
    fx.play(won ? "victory" : "defeat");
    if (leveled) setTimeout(() => fx.play("levelup"), 900);
  }, []);
  return (
    <div className="bf-overlay">
      <div className={"bf-verdict " + (won ? "won" : "lost")}>
        <div className="bf-verdict-stage">
          {won ? <img className="bf-verdict-art" src={bossUrl(v.bossId, "defeated")} alt="" /> : <Icon name="skull" cls="bf-verdict-icon" />}
          {fx.layer}
        </div>
        <h2>{won ? "讨伐成功！" : "讨伐失败"}</h2>
        {won && <img className="bf-verdict-medal" src={medalUrl(v.difficulty)} alt={DIFF_ZH[v.difficulty] + "星章"} />}
        {v.taunt && (v.taunt.key === "Win" || v.taunt.key === "Lose") && <p className="bf-verdict-taunt">{v.boss.name}：「{v.taunt.text}」</p>}
        <p>{won ? `恭喜，你打败了魔王！${v.boss.name} 被打倒了（第 ${v.round} 回合 · ${DIFF_ZH[v.difficulty]}）` : `${v.boss.name} 还站着。调整策略再来一次！`}</p>
        {leveled && <p className="bf-levelup">英雄升级！种族 {after.raceLevel} 级 · 职业 {after.clsLevel} 级</p>}
        {won && !getStory(snap.mode, v.bossId, "victory") && TAUNTS[v.bossId]?.First && <p className="bf-note">{TAUNTS[v.bossId].First}</p>}
        {snap.campaign?.pendingLoot && <LootPanel net={net} snap={snap} />}
        {/* 还有人没选战利品时剧情先收起，不挡住领奖；选完自动展开 */}
        {won && !snap.campaign?.pendingLoot && <StoryGate mode={snap.mode} bossId={v.bossId} moment="victory" />}
        {won && snap.campaign && !snap.campaign.pendingLoot && v.bossId === BOSS_ORDER[BOSS_ORDER.length - 1] && <Finale camp={snap.campaign} />}
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

function MuteButton() {
  const [m, setM] = useState(isMuted());
  return (
    <button className="bf-btn bf-mini" aria-pressed={m} data-testid="bf-mute" onClick={() => setM(toggleMute())}>
      <span className="bf-mute-ico">{m ? "🔇" : "🔊"}</span><span className="bf-mute-txt">{m ? "静音" : "声音"}</span>
    </button>
  );
}

/** 进入战斗时先把这一关的立绘、背景、特效加载好，再显示画面 */
function Preload({ v }: { v: BFView }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const urls = [
      bgUrl(v.bossId),
      bossUrl(v.bossId, "idle"),
      bossUrl(v.bossId, "hit"),
      bossUrl(v.bossId, "defeated"),
      ...v.heroes.map((h) => avatarUrl(h.race, h.cls)),
      ...["hit-melee", "hit-ranged", "hit-magic", "boss-claw"].map((n) => `/assets/bf/fx/${n}.webp`),
    ];
    let n = urls.length;
    setLeft(n);
    const done = () => setLeft(--n);
    for (const u of urls) {
      const img = new Image();
      img.onload = img.onerror = done;
      img.src = u;
    }
    const t = setTimeout(() => setLeft(0), 6000); // 网太慢也不卡住
    return () => clearTimeout(t);
  }, [v.bossId]);
  if (!left) return null;
  return (
    <div className="bf-overlay bf-loading" role="status">
      <img src={bossUrl(v.bossId, "idle")} alt="" />
      <p>{v.boss.name} 正在登场…</p>
    </div>
  );
}
