export default function CrimeRules({ close }: { close: () => void }) {
  return <div className="cs-dialog-backdrop" onClick={close}>
    <div className="cs-dialog cs-rules" role="dialog" aria-modal="true" aria-label="犯罪现场规则" onClick={(event) => event.stopPropagation()}>
      <button className="cs-close" onClick={close} aria-label="关闭规则">×</button>
      <h2>案件手册</h2>
      <p className="cs-rules-lead">4–12 人推理。调查员从公开的线索与手段牌中找出真相，凶手混入讨论误导大家。</p>
      <section><h3>身份与证物</h3><p>鉴证专家身份公开。4–5 人局有鉴证专家、凶手与调查员；6 人以上增加帮凶和目击者。除专家外，每人面前的线索牌、手段牌与破案徽章公开。</p></section>
      <section><h3>夜晚</h3><p>凶手从自己的牌中选一张关键证物和一张行凶手法。专家与帮凶会知道答案；目击者只知道凶手、帮凶是哪两人，不知道谁是谁。夜晚统一等待 60 秒并附加随机延迟；凶手超时由系统随机选牌。</p></section>
      <section><h3>搜证与简报</h3><p>专家在六块场景板上各放一个标记。第 2、3 轮各换一块橙色板并重新放标记。每轮从专家左边开始顺时针简报，专家不发言。发言计时约 30 秒，可跳过或延长。</p></section>
      <section><h3>破案与胜负</h3><p>调查期间，除专家外的玩家可随时指认另一名玩家面前的一张线索和一张手段。错误会失去破案徽章；翻面排除的线索不能指认。坏人指认真组合会被私下拦截，公开的“错！”只用于实际错误。好人徽章全部用完或三轮结束无人破案，坏人获胜。</p></section>
      <section><h3>目击者反杀</h3><p>有目击者时，正确破案后凶手与帮凶有 60 秒讨论。两人都能建议目标，凶手提交最终指认；若超时，按凶手当前选择、帮凶建议的顺序结算。认中目击者，坏人胜；否则好人胜。</p></section>
      <section><h3>特殊事件</h3><p>房主可开启。六块事件板从第二轮起洗入橙色牌堆：秘密证供、有据可寻、扭转局势、错误信息、证据排除、倒数计时。事件抽到时，页面会显示其具体操作。倒数计时仍允许本轮简报期间破案。</p></section>
    </div>
  </div>;
}
