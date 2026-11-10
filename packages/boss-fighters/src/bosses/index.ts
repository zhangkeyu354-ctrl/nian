import type { BossModule } from './module.ts';
import { puppet, prince } from './b00_01.ts';
import { soulHuntress, aetherDragon, stoneGolem, ogre } from './b02_05.ts';
import { tentacolossus, magmaros, bombossa, jelly, madameVoodoo } from './b06_10.ts';

const LIST: BossModule[] = [puppet, prince, soulHuntress, aetherDragon, stoneGolem, ogre, tentacolossus, magmaros, bombossa, jelly, madameVoodoo];
export const BOSSES: Record<string, BossModule> = Object.fromEntries(LIST.map((b) => [b.id, b]));
export const BOSS_ORDER = LIST.slice().sort((a, b) => a.order - b.order).map((b) => b.id);
