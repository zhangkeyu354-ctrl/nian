import React, { useEffect, useState } from "react";
import "./game-lobby.css";
import { ObjectArt } from "./rr/Objects.tsx";
import { FakeArtistCover, TelephoneCover } from "./drawing/Covers.tsx";

/** 首页：选游戏。每款游戏一个「盒盖」，保持各自的风格 */
export function GameLobby() {
  useEffect(() => {
    document.title = "桌游合集";
  }, []);
  return (
    <main className="hall">
      <header className="hall-head">
        <h1>今晚玩哪个？</h1>
        <p>
          和朋友一起玩的桌游合集。开房后把房间号发给大家，每人用自己的手机加入，同一个
          Wi-Fi 或外网都行。
        </p>
      </header>
      <div className="hall-boxes">
        <GameBox id="tp" title="传情画意" sub="绘画派对 · 画猜传话" meta="3–8人 · 同时画画" blurb="一句话变成一幅画，再变成一句话。最后一起翻开跑偏的传话本。" art={<TelephoneCover logo={false} />} online="/?game=tp" join={code=>"/?game=tp&room="+code} codeLength={6}/>
        <GameBox id="fa" title="纽约伪画家" sub="绘画派对 · 自动主持改编" meta="3–8人 · 卧底画画" blurb="大家轮流在同一张纸上画一笔，只有一人不知道题目。你能找出伪画家吗？" art={<FakeArtistCover logo={false} />} online="/?game=fa" join={code=>"/?game=fa&room="+code} codeLength={6}/>
        <GameBox
          id="rr"
          title="眼疾手快"
          sub="Reflex Race"
          meta="2–6 人 · 拼手速"
          blurb="所有人同时看到一张图，抢先点出正确的物品。点对 +1，点错 −1，先到目标分的人赢。"
          art={
            <span className="box-rr-art">
              <ObjectArt obj={3} color={1} />
              <ObjectArt obj={2} color={0} />
            </span>
          }
          online="/?game=rr"
          join={(code) => "/?game=rr&room=" + code}
        />
        <GameBox
          id="dm"
          title="请留遗言"
          sub="Dying Message"
          meta="4–10人 · 熟人圆桌推理"
          blurb="死者留下一张真实线索，杀手混入假遗言。按座位轮流发言，从图片中找出杀手。"
          art={
            <img
              className="box-dm-art"
              src="/assets/dying-message/DM176.webp"
              alt=""
            />
          }
          online="/?game=dm"
          join={(code) => "/?game=dm&room=" + code}
        />
        <GameBox
          id="dbd"
          title="黎明杀机"
          sub="桌游版"
          meta="3–5 人 · 1 名杀手对 4 名逃生者"
          blurb="逃生者修好发电机逃出大门，杀手要把他们挂上钩子。每个人只看得到自己的秘密移动牌。"
          art={
            <img
              src="/assets/brand_lantern.png"
              alt=""
              width={84}
              height={84}
            />
          }
          online="/?online=1"
          join={(code) => `/?room=${code}`}
          extra={<a href="/?hotseat=1">同一台设备轮流玩</a>}
        />
        <GameBox
          id="ma"
          title="魔法运动员"
          sub="Magical Athlete"
          meta="2–8 人 · 4 场赛跑"
          blurb="选秀怪咖选手，每场派上场比赛。香蕉让人滑倒、巨婴挡住整条跑道，前两个冲线的拿奖牌。"
          art={
            <img
              className="box-cover"
              src="/assets/magical-athlete/lobby/cover.webp"
              alt=""
            />
          }
          online="/?game=ma"
          join={(code) => `/?game=ma&room=${code}`}
        />
        <GameBox
          id="cn"
          title="行动代号"
          sub="Codenames · 中文词库"
          meta="4–16 人 · 红蓝两队"
          blurb="队长只能说一个词加一个数字，队友从 25 个词里找出自己人。猜错送分，踩中刺客直接输。"
          art={<span className="box-cn-art" />}
          online="/?game=cn"
          join={(code) => `/?game=cn&room=${code}`}
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
  codeLength?: number;
}) {
  const len = props.codeLength ?? 4;
  const [code, setCode] = useState("");
  return (
    <section
      className={"hall-box box-" + props.id}
      data-testid={"game-" + props.id}
    >
      <div className="box-art" aria-hidden="true">
        {props.art}
      </div>
      <h2>
        {props.title}
        <small>{props.sub}</small>
      </h2>
      <p className="box-meta">{props.meta}</p>
      <p className="box-blurb">{props.blurb}</p>
      <a
        className="box-open"
        href={props.online}
        data-testid={"open-" + props.id}
      >
        开房间
      </a>
      <form
        className="box-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length === len)
            location.href = props.join(code.trim().toUpperCase());
        }}
      >
        <input
          aria-label={`${props.title}房间号`}
          placeholder="有房间号？"
          maxLength={len}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="submit">加入</button>
      </form>
      {props.extra && <p className="box-extra">{props.extra}</p>}
    </section>
  );
}
