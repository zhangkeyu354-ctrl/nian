/** 服务端专用：禁止从浏览器代码导入。题面和释义为本项目原创写作。 */
import { EXTRA_TOPICS } from "./topics-v1.ts";
export interface Topic {
  id: string;
  question: string;
  answer: string;
  difficulty: 1 | 2 | 3;
  source: string;
}
export const TOPICS: Topic[] = [
  [
    "雪花石膏",
    "雪花石膏是什么？",
    "一种细粒、通常半透明的雕刻材料；这个名称可以指石膏，也可以指方解石。",
    1,
    "https://www.ucl.ac.uk/museums-static/digitalegypt/stone/alabaster.html",
  ],
  [
    "重写本",
    "古文献研究中的“重写本”是什么？",
    "把原文字刮除或洗去，再在同一张羊皮纸上书写的新文本；原字迹可能仍可辨认。",
    2,
    "https://www.bl.uk/stories/blogs/posts/palimpsests-the-art-of-medieval-recycling",
  ],
  [
    "五点梅花式",
    "五点梅花式排列是什么？",
    "四点在四角、第五点在中心的排列，如骰子的五点面。",
    1,
    "https://www.merriam-webster.com/dictionary/quincunx",
  ],
  [
    "行星逆行",
    "观测中的行星逆行是什么？",
    "行星相对背景恒星暂时看似朝平常相反方向移动，主要由地球与行星相对运动造成，并非行星真的掉头绕日。",
    2,
    "https://starchild.gsfc.nasa.gov/docs/StarChild/questions/question46.html",
  ],
  [
    "金星长日",
    "为什么说金星的一天比一年还长？",
    "按自转周期算，金星转一圈约243个地球日，绕太阳一圈约225日；这里的一天不是日出到日出的太阳日。",
    1,
    "https://science.nasa.gov/venus/venus-facts/",
  ],
  [
    "月壤",
    "月壤指的是什么？",
    "月表覆盖的松散岩屑、矿物颗粒和尘埃，长期撞击粉碎岩石形成；并不是地球上含腐殖质的土壤。",
    1,
    "https://science.nasa.gov/moon/facts/",
  ],
  [
    "潮汐锁定",
    "潮汐锁定是什么？",
    "天体自转周期与公转周期同步，以致大致同一面始终朝向伴星；月球朝向地球即为例子。",
    2,
    "https://science.nasa.gov/moon/facts/",
  ],
  [
    "中子星",
    "中子星为什么被称为极端致密的星体？",
    "它是某些大质量恒星坍缩后留下的致密残骸，巨大的质量被压进仅有城市尺度的球体中。",
    2,
    "https://science.nasa.gov/universe/stars/types/",
  ],
  [
    "海雪",
    "海洋里的“海雪”是什么？",
    "由生物残骸、排泄物等有机物组成、从上层海水缓慢沉向深海的颗粒，为深海生物带去食物。",
    1,
    "https://oceanservice.noaa.gov/facts/marinesnow.html",
  ],
  [
    "鲸落",
    "鲸落为什么能成为海底生态系统？",
    "鲸尸沉底后提供大量有机物，从食腐动物到利用化学能的微生物，不同生物会陆续利用这份资源。",
    1,
    "https://oceanservice.noaa.gov/facts/whale-fall.html",
  ],
  [
    "深海热泉",
    "没有阳光的深海热泉附近，食物链如何开始？",
    "一些微生物利用热泉带来的化学物质取得能量，制造有机物，支持周围的动物群落。",
    2,
    "https://oceanservice.noaa.gov/facts/vents.html",
  ],
  [
    "海洋酸化",
    "海洋酸化是不是指海水已经成酸性？",
    "不是。海水吸收二氧化碳后pH降低，通常仍偏碱性；酸化描述的是向更酸方向变化。",
    2,
    "https://oceanservice.noaa.gov/facts/acidification.html",
  ],
  [
    "死水现象",
    "航海中的“死水现象”是什么？",
    "船在不同密度分层的水中前进时，会激起内部波并损失推进能量，看起来像被水拖住。",
    3,
    "https://www.cnrs.fr/en/press/behind-dead-water-phenomenon",
  ],
  [
    "省音",
    "语音学中的“省音”或音脱落指什么？",
    "在连续发音中省去本来可能出现的音，例如某些快速口语会把音节中的音略掉。",
    3,
    "https://www.merriam-webster.com/dictionary/elision",
  ],
  [
    "拟态",
    "生物学的拟态与一般保护色有何区别？",
    "拟态指一种生物在外形或信号上像另一种生物或事物，借此影响其他生物的反应，不仅是融入背景。",
    2,
    "https://www.nhm.ac.uk/discover/butterfly-wings-science-behind-the-colour.html",
  ],
  [
    "趋同演化",
    "趋同演化是什么？",
    "亲缘较远的生物因面临相似环境压力，独立演化出相似特征；相似并不一定来自近共同祖先。",
    2,
    "https://doi.org/10.1126/science.aam5979",
  ],
]
  .map(([id, question, answer, difficulty, source], i) => ({
    id: `xb-${i + 1}`,
    question: String(question),
    answer: String(answer),
    difficulty: Number(difficulty) as 1 | 2 | 3,
    source: String(source),
  }))
  .concat(EXTRA_TOPICS);
