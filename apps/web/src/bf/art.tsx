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
/** 卡面插画：同类效果共用一张 */
export function cardArtUrl(id: string) {
  const c = CARDS[id];
  const eff = c?.effects ?? [];
  const has = (k: string) => eff.some((e) => e.kind === k);
  let art = "items";
  const atk = eff.find((e) => e.kind === "attack" || e.kind === "support") as { type: DamageType; value?: number | string } | undefined;
  if (c?.category === "slime") art = "slime";
  else if (atk?.type === "melee") art = typeof atk.value === "number" && atk.value >= 4 ? "hammer" : "sword";
  else if (atk?.type === "ranged") art = has("lightning") || has("playTop") ? "arrows" : "shot";
  else if (atk?.type === "magic") art = has("bossPoison") ? "poison" : typeof atk.value === "number" && atk.value >= 4 ? "fireball" : "lightning";
  else if (has("protect") || has("redirect") || has("ward")) art = "protect";
  else if (has("heal") || has("removeStatus")) art = "heal";
  else if (has("bossPoison") || has("bossLosePerPoison") || has("shieldReduce")) art = "poison";
  else if (has("draw") || has("peekTop3") || has("allDrawThenTop") || has("replayDiscard")) art = "draw";
  else if (has("lightning") || has("immediateAction")) art = "haste";
  else if (has("discardCurse") || has("preventNextRound")) art = "curse";
  if (c?.stars && art === "items") art = "treasure";
  return `${A}/art/${art}.webp`;
}

/** 特效序列图：5 列 × 2 行，黑底用"滤色"叠加 */
export type FxName =
  | "hit-melee" | "hit-ranged" | "hit-magic"
  | "shield-red" | "shield-green" | "shield-blue"
  | "boss-claw" | "heal" | "protect";
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
    }, 65);
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
