import React, { useEffect, useMemo, useRef, useState } from "react";
import "./game-lobby.css";
import "./game-hall.css";
import { ObjectArt } from "./rr/Objects.tsx";
import { FakeArtistCover, TelephoneCover } from "./drawing/Covers.tsx";
import { UPDATE_NOTICES } from "./update-notices.ts";

/** 新大厅（方案 A：游戏机桌面）。每个游戏一张「卡带」，点开从底部升起详情。 */

interface Game {
  id: string;
  title: string;
  en?: string;
  min: number;
  max: number;
  tag: string;
  blurb: string;
  art: React.ReactNode;
  /** 卡带封面底色 */
  bg: string;
  /** 封面图是否铺满 */
  fill?: boolean;
  online: string;
  join: (code: string) => string;
  extra?: React.ReactNode;
  isNew?: boolean;
  time?: string;
}

const img = (src: string, fit: "cover" | "contain" = "cover") => <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: fit }} />;

export const GAMES: Game[] = [
  { id: "sk", title: "骷髅王", en: "Skull King", min: 2, max: 8, tag: "猜墩 · 卡牌", time: "30 分钟", isNew: true, blurb: "每轮先猜自己能赢几墩，正好猜中才得分。海盗压数字、骷髅王压海盗、美人鱼诱捕骷髅王。", art: img("/assets/skullking/board/cover.webp"), bg: "#2a1a10", fill: true, online: "/?game=sk", join: (c) => "/?game=sk&room=" + c.toUpperCase() },
  { id: "du", title: "反转王牌", en: "Dnup", min: 2, max: 6, tag: "爬梯出牌", time: "15 分钟", isNew: true, blurb: "每张牌上下两个数字，牌一回到手里就反转。压过别人、塞牌、拿牌或整手翻转——最先出完的人得分。", art: img("/assets/dnup/cover.webp"), bg: "#111713", fill: true, online: "/?game=du", join: (c) => "/?game=du&room=" + c.toUpperCase() },
  { id: "bf", title: "魔王试炼", en: "Boss Fighters QR", min: 2, max: 4, tag: "合作 · 卡牌", blurb: "组队讨伐魔王！先看清魔王要打谁，再出牌打破护盾、保护队友。可加机器人队友。", art: img("/assets/bf/bg/menu.webp"), bg: "#2b2140", fill: true, online: "/?game=bf", join: (c) => "/?game=bf&room=" + c.toUpperCase() },
  { id: "ta", title: "我们之中的威胁", en: "The Menace Among Us", min: 4, max: 8, tag: "隐藏身份", blurb: "飞船失去动力，氧气一格格流失。大家暗中出牌修船，内鬼却在其中破坏。", art: img("/assets/menace/box.webp"), bg: "#1d1410", fill: true, online: "/?game=ta", join: (c) => "/?game=ta&room=" + c.toUpperCase() },
  { id: "kb", title: "卡里巴湖", en: "Kariba", min: 2, max: 8, tag: "卡牌 · 可组队", blurb: "凑满三只同种动物，就能把水塘边较小的动物赶跑收走。只有老鼠吓得跑大象。", art: img("/assets/kariba/box.webp", "contain"), bg: "#1b5b63", online: "/?game=kb", join: (c) => "/?game=kb&room=" + c.toUpperCase() },
  { id: "nd", title: "脑洞量表", en: "Top Ten", min: 4, max: 9, tag: "合作 · 派对", blurb: "一个数字，一张答题卡。队长看卡把大家从小到大排好，一起闯过五轮。", art: img("/assets/naodong-scale/box.webp", "contain"), bg: "#1d6a73", online: "/?game=nd", join: (c) => "/?game=nd&room=" + c.toUpperCase() },
  { id: "ss", title: "汽水走私犯", en: "Soda Smugglers", min: 3, max: 8, tag: "吹牛 · 推理", blurb: "秘密装好手提箱，和缉私警长斗智，带着汽水顺利过关。", art: img("/assets/soda-smugglers/box-logo.webp", "contain"), bg: "#3d2b4a", online: "/?game=ss", join: (c) => "/?game=ss&room=" + c.toUpperCase() },
  { id: "rk", title: "拉密", en: "Rummikub", min: 2, max: 6, tag: "数字组合", blurb: "同色连成顺子，同数凑成一组。拆开桌面的可能，把手中的牌全部打出去。", art: img("/assets/rummikub/box-classic.webp", "contain"), bg: "#1f4d3a", online: "/?game=rk", join: (c) => "/?game=rk&room=" + c.toUpperCase() },
  { id: "xb", title: "瞎掰王", min: 3, max: 10, tag: "冷知识 · 语音推理", blurb: "谁知道真正答案，谁又在一本正经地瞎掰？配合语音，一起找出老实人。", art: img("/assets/xiabaiwang-v4/host-1.webp"), bg: "#1b1d2b", fill: true, online: "/?game=xb", join: (c) => "/?game=xb&room=" + c.toUpperCase() },
  { id: "wt", title: "女巫镇", en: "Salem 1692", min: 4, max: 12, tag: "隐藏身份", blurb: "白天互相指控，夜里女巫袭击。揭开所有女巫牌，小镇才能得救。", art: <WitchArt />, bg: "#14202b", online: "/?game=wt", join: (c) => "/?game=wt&room=" + c.toUpperCase() },
  { id: "tp", title: "传情画意", min: 3, max: 10, tag: "画画 · 派对", blurb: "一句话变成一幅画，再变成一句话。最后一起翻开跑偏的传话本。", art: <TelephoneCover logo={false} />, bg: "#3a2a7a", fill: true, online: "/?game=tp", join: (c) => "/?game=tp&room=" + c },
  { id: "fa", title: "纽约伪画家", min: 3, max: 10, tag: "画画 · 卧底", blurb: "大家轮流在同一张纸上画一笔，只有一人不知道题目。你能找出伪画家吗？", art: <FakeArtistCover logo={false} />, bg: "#b8325e", fill: true, online: "/?game=fa", join: (c) => "/?game=fa&room=" + c },
  { id: "rr", title: "眼疾手快", en: "Reflex Race", min: 2, max: 6, tag: "拼手速", blurb: "所有人同时看到一张图，抢先点出正确的物品。点对 +1，点错 −1。", art: <span className="box-rr-art"><ObjectArt obj={3} color={1} /><ObjectArt obj={2} color={0} /></span>, bg: "#2d5aa8", online: "/?game=rr", join: (c) => "/?game=rr&room=" + c },
  { id: "dm", title: "请留遗言", en: "Dying Message", min: 4, max: 10, tag: "圆桌推理", blurb: "死者留下一张真实线索，杀手混入假遗言。按座位轮流发言，从图片中找出杀手。", art: <img className="box-dm-art" src="/assets/dying-message/DM176.webp" alt="" />, bg: "#efe2c8", online: "/?game=dm", join: (c) => "/?game=dm&room=" + c },
  { id: "dbd", title: "黎明杀机", en: "桌游版", min: 3, max: 5, tag: "非对称对抗", blurb: "逃生者修好发电机逃出大门，杀手要把他们挂上钩子。每个人只看得到自己的秘密移动牌。", art: <img src="/assets/brand_lantern.png" alt="" style={{ width: 84, height: 84 }} />, bg: "#2a2420", online: "/?online=1", join: (c) => `/?room=${c}`, extra: <a href="/?hotseat=1">同一台设备轮流玩</a> },
  { id: "ma", title: "魔法运动员", en: "Magical Athlete", min: 2, max: 8, tag: "赛跑 · 选秀", blurb: "选秀怪咖选手，每场派上场比赛。香蕉让人滑倒、巨婴挡住整条跑道。", art: img("/assets/magical-athlete/lobby/cover.webp"), bg: "#2c6a3a", fill: true, online: "/?game=ma", join: (c) => `/?game=ma&room=${c}` },
  { id: "cn", title: "行动代号", en: "Codenames", min: 4, max: 16, tag: "组队 · 词语", blurb: "队长只能说一个词加一个数字，队友从 25 个词里找出自己人。踩中刺客直接输。", art: <span className="box-cn-art" style={{ width: "100%", height: "100%", display: "block" }} />, bg: "#26324f", fill: true, online: "/?game=cn", join: (c) => `/?game=cn&room=${c}` },
];

function WitchArt() {
  return (
    <svg className="box-wt-art" viewBox="0 0 160 110" aria-hidden="true">
      <circle cx="118" cy="28" r="17" fill="#e9e3cc" />
      <circle cx="111" cy="24" r="16" fill="#14202b" />
      <path d="M10 98V62l18-16 18 16v36zM52 98V52l22-24 22 24v46zM100 98V68l14-12 14 12v30z" fill="#0b131d" stroke="#3a4b5a" />
      <rect x="68" y="62" width="12" height="16" rx="2" fill="#e3bd79" />
      <path d="M0 98h160v12H0z" fill="#241e1c" />
    </svg>
  );
}

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const recentIds = (): string[] => {
  try {
    return JSON.parse(store.get("hall:recent") ?? "[]");
  } catch {
    return [];
  }
};
const remember = (id: string) => store.set("hall:recent", JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 4)));

function Cart({ g, onOpen, small }: { g: Game; onOpen: () => void; small?: boolean }) {
  return (
    <button type="button" className={`cart${small ? " small" : ""}`} onClick={onOpen} data-testid={"cart-" + g.id}>
      <span className={`cart-art${g.fill ? " fill" : ""}`} style={{ background: g.bg }}>
        {g.art}
        {g.isNew && <span className="cart-new">新</span>}
      </span>
      <span className="cart-label">
        <b>{g.title}</b>
        {!small && (
          <small>
            {g.min}–{g.max} 人 · {g.tag}
          </small>
        )}
      </span>
    </button>
  );
}

function Detail({ g, onClose }: { g: Game; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };
  return (
    <div className={`hall-sheet-bg${closing ? " out" : ""}`} onClick={close}>
      <div className="hall-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={g.title} data-testid="hall-detail">
        <span className="hall-grab" />
        <div className={`hall-sheet-art${g.fill ? " fill" : ""}`} style={{ background: g.bg }}>
          {g.art}
        </div>
        <h2>
          {g.title}
          {g.en && <small>{g.en}</small>}
        </h2>
        <div className="hall-chips">
          <span>👥 {g.min}–{g.max} 人</span>
          <span>{g.tag}</span>
          {g.time && <span>⏱ {g.time}</span>}
        </div>
        <p className="hall-blurb">{g.blurb}</p>
        <a className="hall-primary" href={g.online} onClick={() => remember(g.id)} data-testid={"open-" + g.id}>
          开房间
        </a>
        {g.extra && <p className="hall-extra">{g.extra}</p>}
        <p className="hall-note">房间里随时可以看规则和教学</p>
      </div>
    </div>
  );
}

export function GameHall() {
  const [open, setOpen] = useState<Game | null>(null);
  const [code, setCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [choices, setChoices] = useState<Game[]>([]);
  const [busy, setBusy] = useState(false);
  const notices = useRef<HTMLDialogElement>(null);
  const latest = UPDATE_NOTICES[0]?.id ?? "";
  const [unread, setUnread] = useState(() => store.get("hall:seen") !== latest);
  const recent = useMemo(() => recentIds().map((id) => GAMES.find((g) => g.id === id)).filter(Boolean) as Game[], []);
  useEffect(() => {
    document.title = "桌游合集";
  }, []);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setJoinMsg("");
    setChoices([]);
    try {
      const r = await fetch("/api/find-room?code=" + encodeURIComponent(c)).then((x) => x.json());
      const found = (r.games as string[]).map((id) => GAMES.find((g) => g.id === id)).filter(Boolean) as Game[];
      if (found.length === 1) {
        remember(found[0].id);
        location.href = found[0].join(c);
      } else if (found.length > 1) setChoices(found);
      else setJoinMsg("没有找到这个房间，检查一下房间号？");
    } catch {
      setJoinMsg("网络有点问题，再试一次");
    }
    setBusy(false);
  };

  return (
    <main className="hall2" data-testid="hall2">
      <header className="hall2-top">
        <span className="hall2-brand">
          <span className="hall2-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          桌游合集
        </span>
        <button
          className="hall2-bell"
          onClick={() => {
            notices.current?.showModal();
            store.set("hall:seen", latest);
            setUnread(false);
          }}
          aria-label="更新公告"
          data-testid="hall-notices"
        >
          公告
          {unread && <span className="hall2-dot" />}
        </button>
      </header>

      <form className="hall2-join" onSubmit={join}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="有房间号？输入直接加入" maxLength={10} aria-label="房间号" data-testid="hall-code" />
        <button type="submit" disabled={busy || !code.trim()} data-testid="hall-join">
          {busy ? "…" : "加入"}
        </button>
      </form>
      {joinMsg && <p className="hall2-msg">{joinMsg}</p>}
      {choices.length > 0 && (
        <div className="hall2-choices">
          <span>这个房间号在几个游戏里都有，选一个：</span>
          {choices.map((g) => (
            <a key={g.id} href={g.join(code.trim())} onClick={() => remember(g.id)}>
              {g.title}
            </a>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="hall2-sec">
          <h3>最近玩过</h3>
          <div className="hall2-recent">
            {recent.map((g) => (
              <Cart key={g.id} g={g} small onOpen={() => setOpen(g)} />
            ))}
          </div>
        </section>
      )}

      <section className="hall2-sec">
        <h3>
          全部游戏 <span>{GAMES.length}</span>
        </h3>
        <div className="hall2-grid">
          {GAMES.map((g) => (
            <Cart key={g.id} g={g} onOpen={() => setOpen(g)} />
          ))}
        </div>
      </section>

      {open && <Detail g={open} onClose={() => setOpen(null)} />}

      <dialog className="hall-updates" ref={notices} aria-labelledby="hall2-updates-title">
        <header className="hall-updates-head">
          <h2 id="hall2-updates-title">更新公告</h2>
          <button onClick={() => notices.current?.close()} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="hall-updates-list">
          {UPDATE_NOTICES.map((n) => (
            <article key={n.id}>
              <p className="hall-updates-meta">
                <time dateTime={n.date}>{n.date}</time> · {n.game}
              </p>
              <h3>{n.title}</h3>
              <p>{n.text}</p>
            </article>
          ))}
        </div>
      </dialog>
    </main>
  );
}
