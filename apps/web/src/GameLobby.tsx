import React, { useEffect, useRef, useState } from "react";
import "./game-lobby.css";
import { ObjectArt } from "./rr/Objects.tsx";
import { FakeArtistCover, TelephoneCover } from "./drawing/Covers.tsx";
import { UPDATE_NOTICES } from "./update-notices.ts";

/** 首页：选游戏。每款游戏一个「盒盖」，保持各自的风格 */
export function GameLobby() {
  const updatesDialog = useRef<HTMLDialogElement>(null);
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
      <button className="hall-updates-button" onClick={() => updatesDialog.current?.showModal()}>更新公告</button>
      <dialog className="hall-updates" ref={updatesDialog} aria-labelledby="hall-updates-title">
        <header className="hall-updates-head">
          <h2 id="hall-updates-title">更新公告</h2>
          <button autoFocus onClick={() => updatesDialog.current?.close()} aria-label="关闭更新公告">关闭 ✕</button>
        </header>
        <div className="hall-updates-list">
          {UPDATE_NOTICES.map((notice) => (
            <article key={notice.id}>
              <p className="hall-updates-meta"><time dateTime={notice.date}>{notice.date}</time> · {notice.game}</p>
              <h3>{notice.title}</h3>
              <p>{notice.text}</p>
            </article>
          ))}
        </div>
      </dialog>
      <div className="hall-boxes">
        <GameBox id="rk" title="拉密 Rummikub" sub="The Original · Classic" meta="2–4 人 · 数字组合" blurb="同色连成顺子，同数凑成一组。拆开桌面的可能，把手中的牌全部打出去。" art={<span style={{display:'flex',height:'100%',gap:12,alignItems:'center',background:'#1f4d3a',borderRadius:8,padding:8}}><img src="/assets/rummikub/box-classic.webp" alt="官方 Classic 包装" style={{height:76,width:105,objectFit:'contain'}}/><img src="/assets/rummikub/logo.webp" alt="Rummikub" style={{width:150,maxWidth:'45%'}}/></span>} online="/?game=rk" join={code=>'/?game=rk&room='+code.toUpperCase()}/>
        <GameBox id="xb" title="瞎掰王" sub="冷知识 · 身份推理" meta="3–10人 · 自由讨论" blurb="谁知道真正答案，谁又在一本正经地瞎掰？配合朋友的语音，一起找出老实人。" art={<img className="box-xb-art" src="/assets/xiabaiwang-v4/host-1.webp" alt="" />} online="/?game=xb" join={code=>'/?game=xb&room='+code.toUpperCase()} codeLength={6}/>
        <GameBox id="wt" title="女巫镇" sub="Salem 1692" meta="4–12人 · 隐藏身份" blurb="白天互相指控，夜里女巫袭击。身份会在阴谋中悄悄转移——揭开所有女巫牌，小镇才能得救。" art={<WitchCover/>} online="/?game=wt" join={code=>"/?game=wt&room="+code.toUpperCase()} codeLength={8}/>
        <GameBox id="tp" title="传情画意" sub="绘画派对 · 画猜传话" meta="3–10人 · 同时画画" blurb="一句话变成一幅画，再变成一句话。最后一起翻开跑偏的传话本。" art={<TelephoneCover logo={false} />} online="/?game=tp" join={code=>"/?game=tp&room="+code} codeLength={6}/>
        <GameBox id="fa" title="纽约伪画家" sub="绘画派对 · 自动主持改编" meta="3–10人 · 卧底画画" blurb="大家轮流在同一张纸上画一笔，只有一人不知道题目。你能找出伪画家吗？" art={<FakeArtistCover logo={false} />} online="/?game=fa" join={code=>"/?game=fa&room="+code} codeLength={6}/>
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

/** 女巫镇原创封面：月夜、尖顶屋与烛光 */
function WitchCover() {
  return <svg className="box-wt-art" viewBox="0 0 160 110" aria-hidden="true">
    <defs><radialGradient id="wtMoon" cx="50%" cy="50%"><stop offset="0" stopColor="#f6efd8"/><stop offset="1" stopColor="#a9c5dc"/></radialGradient><radialGradient id="wtGlow" cx="50%" cy="50%"><stop offset="0" stopColor="#ffd59a" stopOpacity=".8"/><stop offset="1" stopColor="#ffd59a" stopOpacity="0"/></radialGradient></defs>
    <circle cx="118" cy="28" r="17" fill="url(#wtMoon)"/><circle cx="111" cy="24" r="16" fill="#192935"/>
    <path d="M10 98V62l18-16 18 16v36zM52 98V52l22-24 22 24v46zM100 98V68l14-12 14 12v30z" fill="#0b131d" stroke="#3a4b5a"/>
    <path d="M74 28V12" stroke="#3a4b5a" strokeWidth="2"/><rect x="68" y="62" width="12" height="16" rx="2" fill="#e3bd79"/><rect x="22" y="70" width="8" height="10" fill="#a77c3e"/>
    <circle cx="74" cy="70" r="22" fill="url(#wtGlow)"/><path d="M0 98h160v12H0z" fill="#241e1c"/>
    <path d="M131 44l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z" fill="#ad8fd5" opacity=".8"/>
  </svg>;
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
