// 美术资源映射与特效播放（素材在 public/assets/bf）
import { useEffect, useRef, useState } from "react";
import { CARDS, cardKind, type DamageType, type StatusKind } from "../../../../packages/boss-fighters/src/index.ts";

const A = "/assets/bf";

export const BOSS_BG: Record<string, string> = {
  puppet: "castle", prince: "castle", ogre: "castle",
  soulHuntress: "graveyard",
  aetherDragon: "crystal", stoneGolem: "crystal",
  tentacolossus: "seacave", jelly: "seacave",
  magmaros: "volcano", bombossa: "volcano",
  madameVoodoo: "jungle",
};
export const bgUrl = (bossId: string | null) => `${A}/bg/${bossId ? BOSS_BG[bossId] ?? "castle" : "menu"}.webp`;

export type BossPose = "idle" | "hit" | "defeated";
export function bossUrl(bossId: string, pose: BossPose, alt?: "phase2" | "rage") {
  if (pose === "idle" && alt === "phase2" && bossId === "soulHuntress") return `${A}/bosses/soulHuntress-phase2.webp`;
  if (pose === "idle" && alt === "rage" && bossId === "aetherDragon") return `${A}/bosses/aetherDragon-rage.webp`;
  return `${A}/bosses/${bossId}${pose === "idle" ? "" : "-" + pose}.webp`;
}

const OGRE_HEAD: Record<string, string> = { hairy: "ogre-head-angry", horn: "ogre-head-sly", spit: "ogre-head-king" };
const PART_ART: Record<string, string> = {
  tentacolossus: "tentacolossus-tentacle", magmaros: "magmaros-minion", jelly: "jelly-minion", madameVoodoo: "madameVoodoo-doll",
};
export function partUrl(bossId: string, partId: string): string | null {
  if (bossId === "ogre") return OGRE_HEAD[partId] ? `${A}/bosses/${OGRE_HEAD[partId]}.webp` : null;
  return PART_ART[bossId] ? `${A}/bosses/${PART_ART[bossId]}.webp` : null;
}

export const heroUrl = (race: string, cls: string) => `${A}/heroes/${race}-${cls}.webp`;
export const avatarUrl = (race: string, cls: string) => `${A}/heroes/${race}-${cls}-avatar.webp`;

/** 卡框：按卡牌主属性 */
export function frameUrl(id: string) {
  const k = cardKind(id);
  const f = k === "melee" || k === "ranged" || k === "magic" || k === "slime" ? k : "item";
  return `${A}/cards/frame-${f}.webp`;
}
/** 卡名关键词 → 插画（先匹配名字，更贴切） */
const NAME_ART: [RegExp, string | string[]][] = [
  [/毒|蛇|蝎|瘟疫/, "poison"], [/流星雨|陨/, "fireball"], [/水晶/, "frost"], [/爆弹|炸|烟火/, "fireball"],
  [/符文|先祖石|石碑/, "runestone"], [/战槌|战锤|锤|槌/, "hammer"], [/雷|电|闪/, "lightning"],
  [/飞斧|投斧/, "throwaxe"], [/飞刀|苦无|飞镖|黄蜂/, "knives"], [/弹弓|石弹|卵石|投石|碎石|弹丸/, "sling"],
  [/弩/, "shot"], [/弓|箭|矢|射|齐射|群鸦/, ["arrows", "shot"]],
  [/骨杖|锤|槌|棒|锏|猛敲/, "hammer"], [/杖/, ["beam", "missile"]], [/斧/, "axe"],
  [/匕首|短刃|小刀|暗影刀|陷阱/, "dagger"], [/剑|刃|刀/, "sword"], [/盾击|肩|指虎|佯攻/, "shieldbash"],
  [/冰|霜|雪/, "frost"], [/盾|壁垒/, "protect"], [/光|星|射线/, "beam"], [/飞弹|魔弹|魔蛾|旋风/, "missile"], [/火|炎|焰|熔岩/, "fireball"],
  [/甲|盔|腕|胸|腰带/, "armor"], [/护罩|结界|斗篷|护身|披|皮肤/, "barrier"], [/盾/, "protect"],
  [/药|草|解|粉|茧|灵药|饮料|龙涎/, "herbs"], [/号角|战鼓|旌旗|激励/, "horn"], [/卷轴|面具|眼|镜|书/, "scroll"],
  [/时间|沙漏|既视感|复仇|重复/, "hourglass"], [/诅咒|咒/, "curse"],
];
const pickOf = (id: string, list: string[]) => list[[...id].reduce((t, ch) => t + ch.charCodeAt(0), 0) % list.length];

/** 卡面插画：先按卡名，再按效果类型；同类卡在几张图里轮换，避免全都一样 */
export function cardArtUrl(id: string) {
  const c = CARDS[id];
  const eff = c?.effects ?? [];
  const has = (k: string) => eff.some((e) => e.kind === k);
  const atk = eff.find((e) => e.kind === "attack" || e.kind === "support") as { kind: string; type: DamageType; value?: number | string } | undefined;
  const big = typeof atk?.value === "number" ? atk.value >= 4 : atk?.value !== undefined;
  let art = "";
  if (c?.category === "slime") art = "slime";
  else {
    const hit = NAME_ART.find(([re]) => re.test(c?.name ?? ""))?.[1];
    art = Array.isArray(hit) ? pickOf(id, hit) : hit ?? "";
  }
  if (!art) {
    if (atk?.type === "melee") art = atk.kind === "support" ? "shieldbash" : pickOf(id, big ? ["hammer", "axe"] : ["sword", "dagger"]);
    else if (atk?.type === "ranged") art = atk.kind === "support" ? "sling" : pickOf(id, ["shot", "arrows", "knives", "throwaxe"]);
    else if (atk?.type === "magic") art = atk.kind === "support" ? "beam" : pickOf(id, big ? ["fireball", "frost"] : ["missile", "lightning"]);
    else if (has("protect") || has("redirect") || has("ward")) art = pickOf(id, ["protect", "armor", "barrier"]);
    else if (has("removeStatus")) art = "herbs";
    else if (has("heal")) art = pickOf(id, ["heal", "herbs"]);
    else if (has("bossPoison") || has("bossLosePerPoison") || has("shieldReduce")) art = "poison";
    else if (has("peekTop3") || has("replayDiscard") || has("putHandOnTop")) art = "scroll";
    else if (has("repeatLastAttack")) art = "hourglass";
    else if (has("draw") || has("allDrawThenTop")) art = pickOf(id, ["draw", "horn"]);
    else if (has("lightning") || has("immediateAction")) art = pickOf(id, ["haste", "horn"]);
    else if (has("discardCurse") || has("preventNextRound")) art = "curse";
    else art = c?.stars ? "treasure" : "items";
  }
  return `${A}/art/${art}.webp`;
}

export const itemUrl = (item: string) => `${A}/items/${item}.webp`;
export const medalUrl = (d: string) => `${A}/ui/medal-${d}.webp`;

/** 特效序列图：5 列 × 2 行，黑底用"滤色"叠加 */
export type FxName =
  | "hit-melee" | "hit-ranged" | "hit-magic"
  | "shield-red" | "shield-green" | "shield-blue"
  | "boss-claw" | "heal" | "protect" | "curse" | "victory" | "defeat" | "levelup";
export const SHIELD_FX: Record<DamageType, FxName> = { melee: "shield-red", ranged: "shield-green", magic: "shield-blue" };
export const HIT_FX: Record<DamageType, FxName> = { melee: "hit-melee", ranged: "hit-ranged", magic: "hit-magic" };

/** 特效队列：push 一个就播一次 */
export function useFx() {
  const [list, setList] = useState<{ id: number; name: FxName }[]>([]);
  const seq = useRef(0);
  const play = (name: FxName) => setList((l) => [...l.slice(-2), { id: ++seq.current, name }]);
  const done = (id: number) => setList((l) => l.filter((x) => x.id !== id));
  const layer = (
    <span className="bf-fx-layer" aria-hidden="true">
      {list.map((f) => (
        <FxSprite key={f.id} name={f.name} onDone={() => done(f.id)} />
      ))}
    </span>
  );
  return { play, layer };
}

const SLOW = new Set<FxName>(["victory", "defeat", "levelup", "curse"]);
function FxSprite({ name, onDone }: { name: FxName; onDone: () => void }) {
  const [f, setF] = useState(0);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      if (i >= 10) {
        clearInterval(t);
        onDone();
      } else setF(i);
    }, SLOW.has(name) ? 130 : 65);
    return () => clearInterval(t);
  }, []);
  const col = f % 5;
  const row = Math.floor(f / 5);
  return (
    <span
      className="bf-fx"
      style={{ backgroundImage: `url(${A}/fx/${name}.webp)`, backgroundPosition: `${col * 25}% ${row * 100}%` }}
    />
  );
}

/** 状态循环小动画：6 帧横排 */
export function StatusLoop({ kind }: { kind: StatusKind }) {
  return <span className={"bf-status-loop"} style={{ backgroundImage: `url(${A}/fx/status-${kind}.webp)` }} aria-hidden="true" />;
}
