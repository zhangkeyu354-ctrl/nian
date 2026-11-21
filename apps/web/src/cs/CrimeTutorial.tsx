import { useState } from "react";

type Step = { title: string; text: string; art: "role" | "board" | "cards" | "answer" | "quiet" };

const playerSteps: Step[] = [
  { title: "长按身份牌看身份", text: "按住顶部的身份牌才会翻开，松手就盖回，别让旁边的人看到。凶手和帮凶知道彼此；目击者认得两名坏人，但分不清谁是谁。", art: "role" },
  { title: "读鉴证专家的提示", text: "鉴证专家知道真凶组合，但不能说话，只能在每块场景板上放一枚子弹标记。把这些标记和大家面前的证物对起来，看谁的牌最符合。", art: "board" },
  { title: "点两张牌破案", text: "想好了就直接点别人面前的一张线索和一张手段，底部确认后提交。每人只有一次机会，指认的组合全场都看得到，错了会被记下来。", art: "cards" },
];

const forensicSteps: Step[] = [
  { title: "你知道答案", text: "红框标出的就是凶手选的关键证物和行凶手法。只有你、凶手和帮凶知道，其他人要靠你的提示找到它。", art: "answer" },
  { title: "每块板放一枚标记", text: "在每块场景板上选一个最贴近答案的选项放子弹标记，放下就不能挪。点板的标题可以放大来选。第 2、3 轮可以换掉一块橙色板，再放一枚。", art: "board" },
  { title: "全程不能暗示", text: "不能说话、比划、使眼色，只能靠标记。大家讨论时认真听，用下一枚标记把跑偏的人拉回来。", art: "quiet" },
];

function Art({ kind, role }: { kind: Step["art"]; role: string }) {
  if (kind === "role") return <div className="cs-tut-art role" style={{ backgroundImage: `url(/assets/crime-scene/roles/role-${role}.webp)` }}><span className="cs-tut-press">按住</span></div>;
  if (kind === "cards" || kind === "answer") return <div className={`cs-tut-art cards ${kind}`}><span style={{ backgroundImage: "url(/assets/crime-scene/cards/clue-009-512.webp)" }} /><span style={{ backgroundImage: "url(/assets/crime-scene/cards/means-001-512.webp)" }} /></div>;
  if (kind === "quiet") return <div className="cs-tut-art quiet"><svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M14 30c4-10 32-10 36 0" /><path d="M20 40h24" /><path d="M10 10l44 44" /></svg></div>;
  return <div className="cs-tut-art board"><b>死者表情</b>{["安详", "挣扎", "恐惧", "痛苦"].map((label, index) => <i key={label} className={index === 2 ? "marked" : ""}><em />{label}</i>)}</div>;
}

export default function CrimeTutorial({ role, close }: { role: string; close: () => void }) {
  const steps = role === "forensic" ? forensicSteps : playerSteps;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  return <div className="cs-dialog-backdrop"><div className="cs-dialog cs-tutorial" role="dialog" aria-modal="true" aria-label="新手教学">
    <button className="cs-close" onClick={close} aria-label="跳过教学">×</button>
    <small className="cs-tut-kicker">新手教学 · {index + 1}/{steps.length}</small>
    <Art kind={step.art} role={role} />
    <h2>{step.title}</h2>
    <p>{step.text}</p>
    <div className="cs-tut-dots" aria-hidden="true">{steps.map((_, i) => <i key={i} className={i === index ? "on" : ""} />)}</div>
    <div>{index > 0 && <button onClick={() => setIndex(index - 1)}>上一步</button>}<button className="cs-primary" onClick={() => (last ? close() : setIndex(index + 1))}>{last ? "开始" : "下一步"}</button></div>
  </div></div>;
}
