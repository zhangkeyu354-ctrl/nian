import React, { useEffect, useState } from "react";
import "./game-lobby.css";

/** 首页：选游戏。每款游戏一个「盒盖」，保持各自的风格 */
export function GameLobby() {
  useEffect(() => {
    document.title = "桌游合集";
  }, []);
  return (
    <main className="hall">
      <header className="hall-head">
        <h1>今晚玩哪个？</h1>
        <p>和朋友一起玩的桌游合集。开房后把房间号发给大家，每人用自己的手机加入，同一个 Wi-Fi 或外网都行。</p>
      </header>
      <div className="hall-boxes">
        <GameBox
          id="dbd"
          title="黎明杀机"
          sub="桌游版"
          meta="3–5 人 · 1 名杀手对 4 名逃生者"
          blurb="逃生者修好发电机逃出大门，杀手要把他们挂上钩子。每个人只看得到自己的秘密移动牌。"
          art={<img src="/assets/brand_lantern.png" alt="" width={84} height={84} />}
          online="/?online=1"
          join={(code) => `/?room=${code}`}
          extra={<a href="/?hotseat=1">同一台设备轮流玩</a>}
        />
        <GameBox
          id="ma"
          title="魔法运动员"
          sub="Magical Athlete"
          meta="3–6 人 · 4 场赛跑"
          blurb="选秀 4 名怪咖选手，每场派一名上场。香蕉让人滑倒、巨婴挡住整条跑道，前两个冲线的拿奖牌。"
          art={<MiniTrack />}
          online="/?game=ma"
          join={(code) => `/?game=ma&room=${code}`}
        />
      </div>
    </main>
  );
}

function GameBox(props: {
  id: string;
  title: string;
  sub: string;
  meta: string;
  blurb: string;
  art: React.ReactNode;
  online: string;
  join: (code: string) => string;
  extra?: React.ReactNode;
}) {
  const [code, setCode] = useState("");
  return (
    <section className={"hall-box box-" + props.id} data-testid={"game-" + props.id}>
      <div className="box-art" aria-hidden="true">
        {props.art}
      </div>
      <h2>
        {props.title}
        <small>{props.sub}</small>
      </h2>
      <p className="box-meta">{props.meta}</p>
      <p className="box-blurb">{props.blurb}</p>
      <a className="box-open" href={props.online} data-testid={"open-" + props.id}>
        开房间
      </a>
      <form
        className="box-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length === 4) location.href = props.join(code.trim().toUpperCase());
        }}
      >
        <input
          aria-label={`${props.title}房间号`}
          placeholder="有房间号？"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="submit">加入</button>
      </form>
      {props.extra && <p className="box-extra">{props.extra}</p>}
    </section>
  );
}

/** 魔法运动员的盒盖小图：一圈红色跑道 */
function MiniTrack() {
  return (
    <svg viewBox="0 0 120 84" width={120} height={84}>
      <rect x="6" y="6" width="108" height="72" rx="36" fill="#3f8f4b" />
      <rect x="14" y="14" width="92" height="56" rx="28" fill="none" stroke="#c4452c" strokeWidth="12" />
      <rect x="14" y="14" width="92" height="56" rx="28" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="5 6" />
      <circle cx="40" cy="20" r="6" fill="#ffcd2e" stroke="#1c2340" strokeWidth="2" />
      <circle cx="78" cy="64" r="6" fill="#2f7fd8" stroke="#1c2340" strokeWidth="2" />
    </svg>
  );
}
