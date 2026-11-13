// 规则引擎：纯函数 reduce(state, command) → 新状态（服务器权威，前端只发命令）
import { BOSSES } from '../bosses/index.ts';
import type { BossModule, CardInfo } from '../bosses/module.ts';
import { DIFFICULTY, ITEMS } from '../defs/balance.ts';
import { CARDS } from '../defs/cards.ts';
import { CURSES, CURSE_BY_ID } from '../defs/curses.ts';
import { IDENTITIES } from '../defs/heroes.ts';
import type { CardDef, Command, DamageType, Effect, GameState, Hero, ItemId, SetupOptions } from '../types.ts';
import {
  addStatus, curseHero, damageHero, fx, taunt, damagePart, drawCards, drawOne, giveSlime, handLimit, healHero, hero, isOver, log,
  loseBossHp, loseCards, lowestHealth, removeStatuses, TYPE_NAME,
} from './core.ts';
import { int, shuffle } from './rng.ts';

export class RuleError extends Error {}

const ACTIONS_PER_ROUND = 3; // 官方
const bossOf = (s: GameState): BossModule => BOSSES[s.bossId];

export function createGame(opt: SetupOptions): GameState {
  const boss = BOSSES[opt.bossId];
  if (!boss) throw new RuleError(`未知魔王 ${opt.bossId}`);
  if (opt.heroes.length < 2 || opt.heroes.length > 4) throw new RuleError('人数需为 2–4 人');
  if (new Set(opt.heroes.map((h) => h.race)).size !== opt.heroes.length) throw new RuleError('同一场战斗种族不能重复');

  const s: GameState = {
    version: 0, seed: opt.seed, rngState: opt.seed, bossId: boss.id, difficulty: opt.difficulty,
    round: 0, phase: 'chooseStarter', heroes: [],
    boss: { id: boss.id, name: boss.name, maxHp: 0, hp: 0, shields: { melee: 0, ranged: 0, magic: 0 }, spikedShields: [], poison: 0, flags: {}, counters: {}, attackBonus: 0, shieldBonus: 0, parts: [], immune: [], phase2: false },
    planned: [], attackedTypes: { melee: false, ranged: false, magic: false },
    starter: null, current: null, interrupts: [], pendingLightning: 0,
    curseDeck: [], curseDiscard: [], slimePile: 20, preventNextRound: false, lastAttackCard: null, bossAttackMinus: 0,
    decisions: [], pick: null, fx: [], fxSeq: 0, time: null, log: [], events: [],
  };
  const items = new Set<ItemId>(['backpack', 'potion', ...(opt.items ?? [])]);
  s.heroes = opt.heroes.map((p, seat) => {
    const r = IDENTITIES[p.race];
    const c = IDENTITIES[p.cls];
    if (!r || r.kind !== 'race' || !c || c.kind !== 'class') throw new RuleError('种族或职业无效');
    const rl = Math.min(3, Math.max(1, p.raceLevel ?? 1));
    const cl = Math.min(3, Math.max(1, p.clsLevel ?? 1));
    const [rh, rhp] = r.levels[rl - 1];
    const [ch, chp] = c.levels[cl - 1];
    let cards = [...r.cards, ...c.cards, ...(p.extraCards ?? [])];
    for (const x of p.removed ?? []) {
      const i = cards.indexOf(x);
      if (i >= 0) cards.splice(i, 1);
    }
    cards = cards.filter((x) => CARDS[x]);
    const its: Hero['items'] = {};
    for (const it of items) {
      if (it === 'glassEye' && r.id !== 'troll') continue;
      its[it] = it === 'potion' ? ITEMS.potionsPerHero : Infinity;
    }
    const h: Hero = {
      seat, name: p.name, race: r.id, cls: c.id, raceLevel: rl, clsLevel: cl, classAbility: cl >= 2,
      maxHealth: rhp + chp, health: rhp + chp, handLimit: rh + ch,
      deck: shuffle(s, cards), hand: [], discard: [], play: [], lost: [], exiled: [], curses: [], wards: [],
      status: { poison: 0, panic: 0, paralysis: 0, fire: 0 },
      actionsLeft: ACTIONS_PER_ROUND, items: its, discardDone: false,
      turn: { attackedTypes: [], firstHitDone: false, firstShieldHit: false, firstProtect: false }, nextBuffs: [],
    };
    return h;
  });
  // 默认带上该关卡已解锁的诅咒（1★ 第 1 关后、2★ 第 2 关后、3★ 第 3 关后）
  const batches = opt.curseBatches ?? [1, 2, 3].filter((b) => b <= Math.max(1, boss.order));
  s.curseDeck = shuffle(s, CURSES.filter((c) => batches.includes(c.batch)).map((c) => c.id));
  for (const h of s.heroes) drawCards(s, h, handLimit(h));
  boss.setup(s);
  log(s, `讨伐开始：${boss.name}（${DIFFICULTY[s.difficulty].name}），生命 ${s.boss.hp}。`);
  taunt(s, 'Intro');
  startRound(s);
  return s;
}

export function startRound(s: GameState) {
  s.round += 1;
  s.events = [];
  const boss = bossOf(s);
  for (const h of s.heroes) {
    h.actionsLeft = boss.timeMode ? 1 : boss.actionsFor?.(s, h) ?? ACTIONS_PER_ROUND;
    h.discardDone = false;
    h.turn = { attackedTypes: [], firstHitDone: false, firstShieldHit: false, firstProtect: false };
  }
  s.attackedTypes = { melee: false, ranged: false, magic: false };
  s.ties = [];
  taunt(s, `Rd${s.round}`);
  s.planned = boss.plan(s); // ① 计划
  for (const t of s.ties) {
    const a = s.planned.find((x) => x.target === t.chosen && !x.tieOptions);
    if (a) a.tieOptions = t.seats;
  }
  s.ties = undefined;
  if (s.bossAttackMinus) {
    for (const a of s.planned) a.value = Math.max(0, a.value - s.bossAttackMinus);
    log(s, `魔法喷发：本回合魔王所有攻击 -${s.bossAttackMinus}`, 'hero');
    s.bossAttackMinus = 0;
  }
  const sh = boss.shields(s); // ② 护盾（每回合重置）
  s.boss.shields = sh ?? { melee: 0, ranged: 0, magic: 0 };
  s.interrupts = [];
  s.pendingLightning = 0;
  s.starter = null;
  s.current = null;
  s.phase = 'chooseStarter';
  log(s, `—— 第 ${s.round} 回合 ——${sh ? `护盾 近战 ${sh.melee} / 远程 ${sh.ranged} / 魔法 ${sh.magic}` : '（本回合魔王没有护盾）'}`);
}

/** 当前应该行动的座位：闪电额外行动 > 插队行动 > 正常轮转 */
export function actor(s: GameState): number | null {
  if (s.phase !== 'action') return null;
  if (s.pick) return s.pick.seat;
  if (s.pendingLightning > 0) return s.current;
  if (s.interrupts.length) return s.interrupts[s.interrupts.length - 1];
  return s.current;
}

export function reduce(prev: GameState, cmd: Command): GameState {
  if (isOver(prev)) throw new RuleError('战斗已经结束');
  const s: GameState = structuredClone(prev);
  s.events = s.events.filter((e) => e.round === s.round);
  s.fx ??= [];
  s.pick ??= null;
  if (s.pick && cmd.type !== 'PICK' && cmd.type !== 'GIVE_UP') throw new RuleError('请先完成挑牌');
  switch (cmd.type) {
    case 'CHOOSE_STARTER': {
      if (s.phase !== 'chooseStarter') throw new RuleError('现在不是选择起始玩家的时候');
      hero(s, cmd.seat);
      s.starter = s.current = cmd.seat;
      s.phase = 'action';
      log(s, `本回合由 ${hero(s, cmd.seat).name} 先开始。`);
      revealCurses(s);
      if (!isOver(s)) bossOf(s).actionPhaseStart?.(s);
      if (!isOver(s) && hero(s, s.current!).actionsLeft <= 0) afterAction(s);
      break;
    }
    case 'PLAY_CARD':
      playCard(s, cmd.seat, cmd.card, cmd.target);
      break;
    case 'USE_ITEM':
      useItem(s, cmd.seat, cmd.item, cmd.target);
      break;
    case 'END_ACTIONS': {
      requireActor(s, cmd.seat);
      if (s.pendingLightning > 0) s.pendingLightning = 0;
      else if (s.interrupts.length && s.interrupts[s.interrupts.length - 1] === cmd.seat) s.interrupts.pop();
      else hero(s, cmd.seat).actionsLeft = 0;
      log(s, `${hero(s, cmd.seat).name} 结束行动。`);
      if (bossOf(s).timeMode) bossOf(s).afterAnyAction?.(s, hero(s, cmd.seat), 'normal');
      afterAction(s, true);
      break;
    }
    case 'DECIDE':
      decide(s, cmd.seat, cmd.choice);
      break;
    case 'DISCARD':
      discard(s, cmd.seat, cmd.cards);
      break;
    case 'PICK':
      resolvePick(s, cmd.seat, cmd.card);
      break;
    case 'RETARGET': {
      if (s.phase !== 'chooseStarter') throw new RuleError('只能在回合开始、选起始玩家前改目标');
      hero(s, cmd.seat);
      const a = s.planned.find((x) => x.id === cmd.attack);
      if (!a?.tieOptions?.includes(cmd.target)) throw new RuleError('这次攻击不能改到这名英雄');
      a.target = cmd.target;
      log(s, `【${a.name}】的目标并列，改由 ${hero(s, cmd.target).name} 承受`);
      break;
    }
    case 'GIVE_UP':
      s.phase = 'lost';
      s.current = null;
      log(s, '队伍放弃了这场讨伐。');
      break;
  }
  // 台词：胜负、按剩余生命（炸弹克精）
  if (isOver(s) && !isOver(prev)) taunt(s, s.phase === 'won' ? 'Win' : 'Lose');
  else if (s.boss.maxHp > 0) {
    const was = (prev.boss.hp / prev.boss.maxHp) * 100;
    const now = (s.boss.hp / s.boss.maxHp) * 100;
    for (const k of [80, 60, 40, 20]) if (was > k && now <= k) taunt(s, `${k}_Health`);
  }
  s.version += 1;
  return s;
}

function requireActor(s: GameState, seat: number) {
  if (s.phase !== 'action') throw new RuleError('现在不是行动阶段');
  if (actor(s) !== seat) throw new RuleError('还没轮到你行动');
}

type Consumed = 'lightning' | 'interrupt' | 'normal';
function consumeAction(s: GameState, seat: number): Consumed {
  if (s.pendingLightning > 0) {
    s.pendingLightning -= 1;
    return 'lightning';
  }
  if (s.interrupts.length && s.interrupts[s.interrupts.length - 1] === seat) {
    s.interrupts.pop();
    return 'interrupt';
  }
  hero(s, seat).actionsLeft -= 1;
  return 'normal';
}

/** 给某英雄一个立即的额外行动 */
function grantNow(s: GameState, h: Hero, actingSeat: number) {
  if (h.seat === actingSeat && actor(s) === actingSeat) s.pendingLightning += 1;
  else s.interrupts.push(h.seat);
}

// ———————————————————— 诅咒 ————————————————————
function revealCurses(s: GameState) {
  for (const h of s.heroes) {
    for (const c of h.curses.filter((x) => x.state === 'down')) {
      const d = CURSE_BY_ID[c.id];
      c.state = 'active';
      log(s, `${h.name} 翻开诅咒：${d.text}`, 'boss');
      if (d.duration === 'instant') {
        if (d.status) addStatus(s, h, d.status.kind, d.status.n, '诅咒');
        if (d.loseHp) damageHero(s, h, d.loseHp, '诅咒');
        h.curses = h.curses.filter((x) => x !== c);
        s.curseDiscard.push(c.id);
      }
      if (isOver(s)) return;
    }
  }
}

function activeCurses(h: Hero) {
  return h.curses.filter((c) => c.state === 'active').map((c) => CURSE_BY_ID[c.id]);
}

function endPhaseCurses(s: GameState) {
  for (const h of s.heroes) {
    const keep = [];
    for (const c of h.curses) {
      if (c.state === 'active' && CURSE_BY_ID[c.id].duration === 'phase') s.curseDiscard.push(c.id);
      else keep.push(c);
    }
    h.curses = keep;
  }
}

// ———————————————————— 出牌 ————————————————————
function playCard(s: GameState, seat: number, cardId: string, target?: number) {
  requireActor(s, seat);
  const h = hero(s, seat);
  if (!h.hand.includes(cardId)) throw new RuleError('手牌里没有这张牌');
  // 惊恐 / 随机出牌诅咒：洗手牌随机抽 1 张打出（官方）
  const randomCurse = activeCurses(h).some((c) => c.randomPlay);
  if (h.status.panic > 0 || randomCurse) {
    cardId = h.hand[int(s, h.hand.length)];
    if (h.status.panic > 0) {
      h.status.panic -= 1;
      log(s, `${h.name} 处于惊恐，只能随机打出手牌，弃掉 1 个惊恐`, 'boss');
    } else log(s, `${h.name} 受诅咒影响，随机打出手牌`, 'boss');
  }
  const card = CARDS[cardId];
  const kind = consumeAction(s, seat);
  h.hand.splice(h.hand.indexOf(cardId), 1);

  if (card.category === 'slime') {
    s.slimePile += 1;
    const back = h.lost.splice(0, 2);
    h.discard.push(...back);
    log(s, `${h.name} 打出黏液牌，放回黏液牌堆${back.length ? `，取回 ${back.length} 张失物` : ''}`, 'hero');
    afterAction(s);
    return;
  }

  h.play.push(cardId);
  log(s, `${h.name} 打出【${card.name}】`, 'hero');
  for (const c of activeCurses(h)) {
    if (c.trigger === 'playAny' && c.discardExtra && h.hand.length) {
      const d = h.hand.splice(int(s, h.hand.length), 1)[0];
      h.discard.push(d);
      log(s, `诅咒：${h.name} 另弃 1 张手牌`, 'boss');
    }
  }
  const t = target === undefined ? h : hero(s, target);
  const info = resolveCard(s, h, card, t, kind);
  if (isOver(s)) return;
  // 诅咒触发
  for (const c of activeCurses(h)) {
    const hit = c.trigger === 'playAny' || (c.trigger === 'playAttack' && info.attack) || (c.trigger === 'playSupport' && info.support) || (c.trigger === 'playProtect' && info.protect);
    if (!hit) continue;
    if (c.status) addStatus(s, h, c.status.kind, c.status.n, '诅咒');
    if (c.loseHp) damageHero(s, h, c.loseHp, '诅咒');
    if (isOver(s)) return;
  }
  bossOf(s).onCardResolved?.(s, h, info);
  afterAction(s, false, h, kind);
}

/** 结算一张卡的全部效果（出牌、牌库顶打出、重复都走这里） */
function resolveCard(s: GameState, h: Hero, card: CardDef, t: Hero, kind: Consumed, depth = 0): CardInfo {
  const info: CardInfo = { card, maxValue: 0, attack: false, support: false, protect: false, lightning: false, types: [], damagedBoss: false };
  if (depth > 3) return info;
  // 下一张牌加成（隐身之冕、连环闪电、星空镜…）
  const buffs = h.nextBuffs;
  h.nextBuffs = [];
  const hasAtk = (tp?: DamageType) => card.effects.some((e) => e.kind === 'attack' && (!tp || e.type === tp));
  const hasProt = card.effects.some((e) => e.kind === 'protect');
  const buff = buffs.find((b) => (b.match === 'attack' && hasAtk()) || (b.match === 'magic' && hasAtk('magic')) || (b.match === 'ranged' && hasAtk('ranged')) || (b.match === 'protect' && hasProt));
  const times = buff?.mode === 'repeat' ? 2 : 1;
  let plus = buff?.mode === 'plus' ? buff.n ?? 0 : 0;
  let lightning = buff?.mode === 'lightning' ? 1 : 0;
  let chosen = t;
  let lastAtk = 0;

  const run = (effects: Effect[]) => {
    for (const e of effects) {
      if (isOver(s)) return;
      switch (e.kind) {
        case 'attack': {
          let v = e.value === 'round' ? s.round : e.value === 'vengeance' ? vengeanceValue(s, h) : e.value;
          if (plus && (buff!.match === 'attack' || buff!.match === e.type)) { v += plus; plus = 0; }
          v = bossOf(s).modifyValue?.(s, h, e.type, 'attack', v) ?? v;
          s.attackedTypes[e.type] = true;
          h.turn.attackedTypes.push(e.type);
          info.attack = true;
          info.types.push(e.type);
          info.maxValue = Math.max(info.maxValue, v);
          lastAtk = v;
          if (applyDamage(s, h, e.type, v, 'attack', !!e.noShieldEffect) > 0) info.damagedBoss = true;
          s.lastAttackCard = card.id;
          if (e.value === 'vengeance' && v >= 9) damageHero(s, h, 4, '复仇符文');
          break;
        }
        case 'support': {
          let v = e.value;
          if (h.race === 'elf' && h.raceLevel >= 2 && h.turn.attackedTypes.includes(e.type)) v += 2;
          v = bossOf(s).modifyValue?.(s, h, e.type, 'support', v) ?? v;
          info.support = true;
          info.types.push(e.type);
          const rogue = h.cls === 'rogue' && h.clsLevel >= 2;
          if (s.attackedTypes[e.type] || rogue) {
            info.maxValue = Math.max(info.maxValue, v);
            if (applyDamage(s, h, e.type, v, 'support', false) > 0) info.damagedBoss = true;
          } else log(s, `本回合还没人打出${TYPE_NAME[e.type]}攻击，助攻无效。`, 'hero');
          break;
        }
        case 'protect': {
          let v = e.value === 'round' ? s.round : e.value;
          if (plus && buff!.match === 'protect') { v += plus; plus = 0; }
          info.protect = true;
          protect(s, h, t, v, !!e.cancelEffects);
          if (h.cls === 'druid' && h.clsLevel >= 2 && !h.turn.firstProtect) {
            h.turn.firstProtect = true;
            lightning += 1;
            log(s, `${h.name}（德鲁伊能力）第一张保护获得闪电`, 'hero');
          }
          h.turn.firstProtect = true;
          break;
        }
        case 'heal':
          if (e.target === 'all') s.heroes.forEach((x) => healHero(s, x, e.value));
          else if (e.target === 'two') {
            healHero(s, t, e.value);
            const other = s.heroes.filter((x) => x !== t).sort((a, b) => a.health - b.health)[0];
            if (other) healHero(s, other, e.value);
          } else {
            chosen = e.target === 'self' ? h : t;
            healHero(s, chosen, e.value);
          }
          break;
        case 'draw': {
          const who = e.target === 'self' ? [h] : e.target === 'all' ? s.heroes : [e.target === 'chosen' ? chosen : t];
          if (e.target === 'choose') chosen = t;
          who.forEach((x) => drawCards(s, x, e.n));
          log(s, `${who.map((x) => x.name).join('、')} 抽 ${e.n} 张牌`, 'hero');
          break;
        }
        case 'lightning':
          lightning += e.n ?? 1;
          break;
        case 'immediateAction':
          if (chosen.seat === h.seat) lightning += 1;
          else s.interrupts.push(chosen.seat);
          log(s, `${chosen.name} 立即进行 1 个行动`, 'hero');
          break;
        case 'bossPoison':
          poisonBoss(s, e.n);
          break;
        case 'selfDamage':
          damageHero(s, h, e.value, card.name);
          break;
        case 'removeStatus':
          if (e.target === 'all') s.heroes.forEach((x) => removeStatuses(x, e.n));
          else removeStatuses(e.target === 'self' ? h : t, e.n);
          log(s, `移除状态标记`, 'hero');
          break;
        case 'takeStatus':
          addStatus(s, h, 'poison', e.n, card.name);
          break;
        case 'ifHealthAtLeast':
          if (h.health >= e.n) run(e.then);
          break;
        case 'nextBuff':
          h.nextBuffs.push(e);
          log(s, `${card.name}：下一张牌获得加成`, 'hero');
          break;
        case 'shieldReduce': {
          const tp = (['melee', 'ranged', 'magic'] as DamageType[]).sort((a, b) => s.boss.shields[b] - s.boss.shields[a])[0];
          const before = s.boss.shields[tp];
          s.boss.shields[tp] = Math.max(0, before - e.n);
          log(s, `${card.name}：魔王${TYPE_NAME[tp]}护盾 -${before - s.boss.shields[tp]}`, 'hero');
          if (before > 0 && !e.noShieldEffect) bossOf(s).onShieldHit?.(s, h, tp);
          if (before > 0 && s.boss.shields[tp] === 0) {
            shieldBroken(s, h, tp);
            if (e.poisonIfBroken) poisonBoss(s, e.poisonIfBroken);
          }
          break;
        }
        case 'bossLoseHp':
          loseBossHp(s, e.n, card.name);
          info.damagedBoss = true;
          bossChanged(s, h);
          break;
        case 'bossLosePerPoison':
          loseBossHp(s, s.boss.poison * e.per, card.name);
          if (e.clear) s.boss.poison = 0;
          bossChanged(s, h);
          break;
        case 'exileSelf':
        case 'exileForever': {
          const i = h.play.lastIndexOf(card.id);
          if (i >= 0) h.play.splice(i, 1);
          h.exiled.push(card.id);
          if (e.kind === 'exileForever') s.events.push({ round: s.round, kind: 'exileForever', title: card.name, text: `${h.seat}` });
          break;
        }
        case 'playTop':
          for (let i = 0; i < e.n; i++) playFromTop(s, t, depth);
          break;
        case 'replayDiscard': {
          // 自动选弃牌堆里数值最高的牌；没有就打牌库顶（官方）。打出后本战移除（卡面翻译）
          const opts = [...new Set(h.discard.filter((c) => c !== 'slime'))];
          if (opts.length > 1) s.pick = { seat: h.seat, kind: 'replay', prompt: '既视感：从弃牌堆选一张打出（打出后本战移除）', options: opts, picked: [], target: t.seat, depth, after: null };
          else if (opts.length === 1) replayFromDiscard(s, h, opts[0], t, kind, depth);
          else playFromTop(s, h, depth);
          break;
        }
        case 'peekTop3': {
          const top: string[] = [];
          for (let i = 0; i < 3; i++) {
            const c = drawOne(s, h);
            if (c) top.push(c);
          }
          if (top.length > 1) s.pick = { seat: h.seat, kind: 'mask', prompt: '透视面具：选一张打出，其余放到牌库底', options: top, picked: [], target: t.seat, depth, after: null };
          else if (top.length === 1) maskPlay(s, h, top[0], [], t, kind, depth);
          break;
        }
        case 'redirect': {
          if (t.seat === h.seat) break;
          s.planned = s.planned.filter((a) => a.target !== h.seat);
          for (const a of s.planned) if (a.target === t.seat) a.target = h.seat;
          log(s, `义气相挺：${h.name} 原本受到的攻击取消，替 ${t.name} 承受攻击`, 'hero');
          break;
        }
        case 'preventNextRound':
          s.preventNextRound = true;
          log(s, `要你命3000：将阻止下一个周期能力`, 'hero');
          break;
        case 'ward': {
          const i = h.play.lastIndexOf(card.id);
          if (i >= 0) h.play.splice(i, 1);
          h.wards.push({ card: card.id, against: e.against });
          log(s, `${card.name} 放在 ${h.name} 旁边`, 'hero');
          break;
        }
        case 'repeatLastAttack':
          if (s.lastAttackCard) {
            log(s, `时间护符：重复【${CARDS[s.lastAttackCard].name}】`, 'hero');
            resolveCard(s, h, CARDS[s.lastAttackCard], t, kind, depth + 1);
          }
          break;
        case 'bossAttackMinusNext':
          s.bossAttackMinus += e.n;
          break;
        case 'allDrawThenTop':
          for (const x of s.heroes) {
            drawCards(s, x, e.n);
            if (x.hand.length) {
              const worst = x.hand.slice().sort((a, b) => scoreCard(a) - scoreCard(b))[0];
              x.hand.splice(x.hand.indexOf(worst), 1);
              x.deck.push(worst);
            }
          }
          break;
        case 'putHandOnTop':
          if (h.hand.length) {
            const worst = h.hand.slice().sort((a, b) => scoreCard(a) - scoreCard(b))[0];
            h.hand.splice(h.hand.indexOf(worst), 1);
            h.deck.push(worst);
          }
          break;
        case 'discardCurse': {
          const c = t.curses.findIndex((x) => x.state === 'active');
          if (c >= 0) {
            s.curseDiscard.push(t.curses[c].id);
            t.curses.splice(c, 1);
            log(s, `破咒吊坠：${t.name} 弃掉 1 张生效诅咒`, 'hero');
          }
          break;
        }
        case 'meteor':
          for (const tp of ['melee', 'ranged', 'magic'] as DamageType[]) {
            const v = 1 + int(s, 3);
            s.attackedTypes[tp] = true;
            h.turn.attackedTypes.push(tp);
            info.attack = true;
            info.maxValue = Math.max(info.maxValue, v);
            if (applyDamage(s, h, tp, v, 'attack', false) > 0) info.damagedBoss = true;
          }
          break;
        case 'slime':
          break;
      }
    }
  };
  for (let i = 0; i < times; i++) run(card.effects);
  if (buff?.mode === 'healEqual' && lastAtk > 0) healHero(s, t, lastAtk);
  if (lightning > 0 && !isOver(s)) {
    info.lightning = true;
    if (depth === 0 && kind === 'interrupt') for (let i = 0; i < lightning; i++) s.interrupts.push(h.seat);
    else if (actor(s) === h.seat || depth === 0) s.pendingLightning += lightning;
    log(s, `闪电：${h.name} 获得 ${lightning} 个额外行动`, 'hero');
  }
  return info;
}

/** 从某英雄牌库顶打出 1 张（随机应变、神灯、巨魔能力、幸运护符） */
function playFromTop(s: GameState, h: Hero, depth: number, ignoreLightning = false) {
  const c = drawOne(s, h);
  if (!c) return;
  if (c === 'slime') {
    h.hand.push(c);
    return;
  }
  h.play.push(c);
  log(s, `${h.name} 打出牌库顶的【${CARDS[c].name}】`, 'hero');
  const card = ignoreLightning ? { ...CARDS[c], effects: CARDS[c].effects.filter((e) => e.kind !== 'lightning') } : CARDS[c];
  resolveCard(s, h, card, h, 'normal', depth + 1);
}

function vengeanceValue(s: GameState, h: Hero) {
  return s.planned.filter((a) => a.target === h.seat).reduce((m, a) => Math.max(m, a.value - a.reducedBy), 0);
}

export function scoreCard(id: string): number {
  const c = CARDS[id];
  if (!c) return 0;
  let v = 0;
  for (const e of c.effects) {
    if ('value' in e && typeof e.value === 'number') v += e.value;
    else v += 1;
  }
  return v;
}

function poisonBoss(s: GameState, n: number) {
  const blocked = bossOf(s).poisonMult?.(s) === 0;
  if (blocked) {
    log(s, '魔王现在不会中毒', 'boss');
    return;
  }
  s.boss.poison += n;
  log(s, `魔王获得 ${n} 个中毒（共 ${s.boss.poison}）`, 'hero');
}

// ———————————————————— 伤害管线 ————————————————————
/** 对魔王造成属性伤害。返回打到魔王本体生命的伤害。 */
export function applyDamage(s: GameState, h: Hero, type: DamageType, value: number, kind: 'attack' | 'support', noShieldEffect: boolean): number {
  if (value <= 0 || isOver(s)) return 0;
  const boss = bossOf(s);
  if (s.boss.immune.includes(type)) {
    log(s, `魔王对${TYPE_NAME[type]}免疫，伤害无效`, 'boss');
    return 0;
  }
  const route = boss.routeDamage?.(s, h, type, kind) ?? {};
  if (route.blocked) {
    log(s, route.blocked, 'boss');
    return 0;
  }
  if (route.part) {
    const p = route.part;
    const dealt = damagePart(s, p, Math.max(1, Math.floor(value * (route.partMult ?? 1))), h.name);
    fx(s, { kind: 'part', type, value: dealt });
    boss.onPartHit?.(s, h, p, dealt, type);
    if (!p.alive) boss.onPartDefeated?.(s, h, p);
    bossChanged(s, h);
    if (route.bodyShare) {
      loseBossHp(s, route.bodyShare, '本体');
      bossChanged(s, h);
    }
    return 0;
  }
  const b = s.boss;
  const before = b.shields[type];
  const absorbed = Math.min(before, value);
  b.shields[type] -= absorbed;
  if (before > 0) {
    const warrior = h.cls === 'warrior' && h.clsLevel >= 2 && !h.turn.firstShieldHit;
    h.turn.firstShieldHit = true;
    if (noShieldEffect || warrior) {
      if (warrior && !noShieldEffect) log(s, `${h.name}（战士能力）这次攻击不触发护盾效果`, 'hero');
    } else boss.onShieldHit?.(s, h, type);
    log(s, `${TYPE_NAME[type]}护盾 -${absorbed}${b.shields[type] === 0 ? '（破碎）' : ''}`, 'hero');
    if (b.shields[type] === 0) {
      fx(s, { kind: 'shield', type });
      shieldBroken(s, h, type);
    }
  }
  if (isOver(s)) return 0;
  const rest = Math.floor((value - absorbed) * (route.mult ?? 1));
  if (rest > 0 || absorbed > 0) fx(s, { kind: 'hit', type, value: rest });
  if (rest > 0) {
    loseBossHp(s, rest, `${h.name} 的${TYPE_NAME[type]}${kind === 'attack' ? '攻击' : '助攻'}`);
    if (h.race === 'troll' && h.raceLevel >= 2 && kind === 'attack' && !h.turn.firstHitDone && actor(s) === h.seat) {
      h.turn.firstHitDone = true;
      log(s, `${h.name}（巨魔能力）首次伤到魔王，打出牌库顶牌`, 'hero');
      playFromTop(s, h, 1);
    }
    bossChanged(s, h);
  }
  return rest;
}

function shieldBroken(s: GameState, h: Hero, type: DamageType) {
  if (h.race === 'halfling' && h.raceLevel >= 2) {
    loseBossHp(s, 4, `${h.name}（半身人能力）破盾`);
    bossChanged(s, h);
  }
  bossOf(s).onShieldBroken?.(s, h, type);
}

/** 魔王生命变化后：healthloss 能力、阶段转换、胜负 */
export function bossChanged(s: GameState, h: Hero | null) {
  if (isOver(s)) return;
  const boss = bossOf(s);
  boss.onBossDamaged?.(s, h);
  if (s.boss.hp <= 0 && !isOver(s)) {
    if (boss.onDefeated?.(s)) return;
    s.phase = 'won';
    s.current = null;
    s.decisions = [];
    log(s, `${s.boss.name} 被打倒了！讨伐成功！`);
  }
}

function protect(s: GameState, h: Hero, t: Hero, v: number, cancelEffects: boolean) {
  const atk = s.planned
    .filter((a) => a.target === t.seat && a.value - a.reducedBy > 0)
    .sort((a, b) => b.value - b.reducedBy - (a.value - a.reducedBy))[0];
  if (!atk) {
    log(s, `${t.name} 本回合没有要挡的攻击。`, 'hero');
    return;
  }
  atk.reducedBy = Math.min(atk.value, atk.reducedBy + v);
  fx(s, { kind: 'protect', seat: t.seat, value: v });
  if (cancelEffects) atk.cancelExtra = true;
  log(s, `保护 ${v}：${t.name} 将受到的【${atk.name}】降为 ${atk.value - atk.reducedBy}${cancelEffects ? '，附加效果取消' : ''}`, 'hero');
  if (atk.value - atk.reducedBy === 0 && h.race === 'dwarf' && h.raceLevel >= 2) {
    log(s, `${h.name}（矮人能力）挡到 0，立即再行动 1 次`, 'hero');
    grantNow(s, h, h.seat);
  }
  bossOf(s).onProtect?.(s, h);
}

// ———————————————————— 道具 ————————————————————
function useItem(s: GameState, seat: number, item: ItemId, target?: number) {
  requireActor(s, seat);
  const h = hero(s, seat);
  const left = h.items[item];
  if (!left) throw new RuleError('你没有这个道具，或已经用完');
  const kind = consumeAction(s, seat);
  if (left !== Infinity) h.items[item] = left - 1;
  const t = target === undefined ? h : hero(s, target);
  switch (item) {
    case 'backpack':
      drawCards(s, h, ITEMS.backpackDraw);
      log(s, `${h.name} 使用背包，抽 ${ITEMS.backpackDraw} 张牌`, 'hero');
      break;
    case 'potion':
      log(s, `${h.name} 使用治疗药水`, 'hero');
      healHero(s, t, ITEMS.potionHeal);
      break;
    case 'medkit':
      removeStatuses(h, 2);
      log(s, `${h.name} 使用医药袋，移除 2 个状态标记`, 'hero');
      break;
    case 'waterskin':
      healHero(s, h, 3);
      break;
    case 'glassEye': {
      const top: string[] = [];
      for (let i = 0; i < 3; i++) {
        const c = drawOne(s, h);
        if (c) top.push(c);
      }
      if (top.length > 1) s.pick = { seat: h.seat, kind: 'eye', prompt: '祖传玻璃眼：依次选出放在牌库最上面的牌', options: top, picked: [], target: h.seat, depth: 0, after: null };
      else h.deck.push(...top);
      log(s, `${h.name} 使用祖传玻璃眼，查看牌库顶 ${top.length} 张`, 'hero');
      break;
    }
    case 'luckyCharm':
      log(s, `${h.name} 使用幸运护符`, 'hero');
      playFromTop(s, h, 0, true);
      break;
  }
  bossOf(s).onItemUsed?.(s, h);
  afterAction(s, false, h, kind);
}

// ———————————————————— 轮转与回合结束 ————————————————————
function afterAction(s: GameState, ended = false, h?: Hero, kind?: Consumed) {
  if (isOver(s)) return;
  if (s.pick) {
    s.pick.after ??= { ended, seat: h?.seat ?? null, kind: kind ?? null };
    return;
  }
  const boss = bossOf(s);
  if (boss.timeMode && h && kind && !ended) boss.afterAnyAction?.(s, h, kind);
  if (isOver(s) || s.phase !== 'action') return;
  if (s.pendingLightning > 0 || s.interrupts.length) return;
  const n = s.heroes.length;
  const from = s.current ?? 0;
  for (let i = 1; i <= n; i++) {
    const seat = s.heroes[(from + i) % n].seat;
    if (hero(s, seat).actionsLeft > 0) {
      s.current = seat;
      return;
    }
  }
  if (boss.timeMode) {
    // 时间制：行动数量无限，轮完一圈再来一圈（官方·炸弹克精）
    for (const x of s.heroes) x.actionsLeft = 1;
    s.current = s.heroes[(from + 1) % n].seat;
    return;
  }
  endActionPhase(s);
}

export function endActionPhase(s: GameState) {
  const boss = bossOf(s);
  s.current = null;
  boss.actionPhaseEnd?.(s);
  if (isOver(s)) return;
  endPhaseCurses(s);
  // ④ 攻击阶段：附加效果只在攻击未被减到 0 时生效（官方）
  for (const a of s.planned) {
    if (isOver(s)) return;
    const h = hero(s, a.target);
    const dmg = a.value - a.reducedBy;
    if (dmg <= 0) {
      log(s, `【${a.name}】被完全挡下（${h.name}）`, 'hero');
      fx(s, { kind: 'blocked', seat: h.seat });
      continue;
    }
    fx(s, { kind: 'bossAttack', seat: h.seat, value: dmg });
    const dealt = damageHero(s, h, dmg, a.name);
    if (isOver(s)) return;
    if (dealt > 0) {
      boss.onHeroHit?.(s, h, dealt, a);
      for (const c of activeCurses(h)) if (c.trigger === 'bossHit' && c.status) addStatus(s, h, c.status.kind, c.status.n, '持续诅咒');
    }
    if (!a.cancelExtra) applyExtra(s, h, a.extra, a.name);
  }
  if (isOver(s)) return;
  boss.afterAttack?.(s);
  if (isOver(s)) return;
  // ⑤ 状态阶段
  for (const h of s.heroes) {
    // 三头食人妖"强化剧毒喷发"：本战每个中毒标记额外 +1 伤害
    if (h.status.poison > 0) damageHero(s, h, h.status.poison * (1 + (s.boss.counters.poisonPlus ?? 0)), '中毒');
    if (isOver(s)) return;
  }
  if (s.boss.poison > 0) {
    const mult = boss.poisonMult?.(s) ?? 1;
    loseBossHp(s, Math.floor(s.boss.poison * mult), '中毒');
    bossChanged(s, null);
    if (isOver(s)) return;
  }
  boss.statusPhase?.(s);
  if (isOver(s)) return;
  // 着火：每个标记抽 1 张，玩家选择本战移除或弃掉并失去 2 生命（官方）
  for (const h of s.heroes) {
    for (let i = 0; i < h.status.fire; i++) {
      const c = drawOne(s, h);
      if (!c) {
        // 两堆都空：跳过（官方）
        continue;
      }
      s.decisions.push({ seat: h.seat, kind: 'fire', card: c, prompt: `着火：【${CARDS[c]?.name ?? c}】本战移除，或弃掉并失去 2 生命？` });
    }
  }
  if (s.decisions.length) s.phase = 'decision';
  else startDiscard(s);
}

export function applyExtra(s: GameState, h: Hero, x: GameState['planned'][number]['extra'], why: string) {
  if (x.poison) addStatus(s, h, 'poison', x.poison, why);
  if (x.panic) addStatus(s, h, 'panic', x.panic, why);
  if (x.paralysis) addStatus(s, h, 'paralysis', x.paralysis, why);
  if (x.fire) addStatus(s, h, 'fire', x.fire, why);
  if (x.curse) curseHero(s, h, x.curse, why);
  if (x.slime) giveSlime(s, h, x.slime);
  if (x.lost) loseCards(s, h, x.lost, why);
  if (x.discard) {
    for (let i = 0; i < x.discard && h.hand.length; i++) h.discard.push(h.hand.splice(int(s, h.hand.length), 1)[0]);
    log(s, `${h.name} 弃 ${x.discard} 张手牌（${why}）`, 'boss');
  }
}

function decide(s: GameState, seat: number, choice: 'exile' | 'burn') {
  if (s.phase !== 'decision') throw new RuleError('现在没有需要你决定的事');
  const i = s.decisions.findIndex((d) => d.seat === seat);
  if (i < 0) throw new RuleError('现在没有需要你决定的事');
  const [d] = s.decisions.splice(i, 1);
  const h = hero(s, seat);
  if (choice === 'exile') {
    h.exiled.push(d.card!);
    log(s, `${h.name} 着火：【${CARDS[d.card!]?.name}】本战移除`, 'hero');
  } else {
    h.discard.push(d.card!);
    damageHero(s, h, 2, '着火');
  }
  if (!isOver(s) && s.decisions.length === 0) {
    if (s.resumeAction) {
      s.resumeAction = false;
      s.phase = 'action';
      afterAction(s, true);
    } else startDiscard(s);
  }
}

function replayFromDiscard(s: GameState, h: Hero, card: string, t: Hero, kind: Consumed, depth: number) {
  h.discard.splice(h.discard.indexOf(card), 1);
  h.exiled.push(card);
  log(s, `既视感：重打【${CARDS[card].name}】`, 'hero');
  resolveCard(s, h, CARDS[card], t, kind, depth + 1);
}

function maskPlay(s: GameState, h: Hero, card: string, rest: string[], t: Hero, kind: Consumed, depth: number) {
  h.deck.unshift(...rest);
  h.play.push(card);
  log(s, `透视面具：打出【${CARDS[card].name}】${rest.length ? '，其余放牌库底' : ''}`, 'hero');
  resolveCard(s, h, CARDS[card], t, kind, depth + 1);
}

/** 玩家挑完牌：结算被挑中的牌，然后补做被挂起的收尾 */
function resolvePick(s: GameState, seat: number, card: string) {
  const p = s.pick;
  if (!p || p.seat !== seat) throw new RuleError('现在没有需要你挑的牌');
  if (!p.options.includes(card) || (p.kind === 'eye' && p.picked.length >= p.options.length)) throw new RuleError('不能选这张牌');
  const h = hero(s, seat);
  const t = hero(s, p.target);
  const kind = (p.after?.kind ?? 'normal') as Consumed;
  if (p.kind === 'eye') {
    const left = p.options.slice();
    for (const x of [...p.picked, card]) left.splice(left.indexOf(x), 1);
    p.picked.push(card);
    if (left.length > 1) return; // 继续挑下一张
    // 第一张挑的放最上面（牌库从末尾抽）
    h.deck.push(...left, ...p.picked.slice().reverse());
    log(s, `${h.name} 用祖传玻璃眼排好了牌库顶`, 'hero');
    s.pick = null;
  } else {
    s.pick = null;
    if (p.kind === 'replay') replayFromDiscard(s, h, card, t, kind, p.depth);
    else {
      const rest = p.options.slice();
      rest.splice(rest.indexOf(card), 1);
      maskPlay(s, h, card, rest, t, kind, p.depth);
    }
  }
  const again = s.pick as GameState['pick'];
  if (isOver(s) || again) {
    // 挑出的牌又需要挑牌：把收尾转交给新的挑牌
    if (again && p.after) again.after = p.after;
    return;
  }
  bossChanged(s, h);
  if (isOver(s)) return;
  const a = p.after;
  if (a) afterAction(s, a.ended, a.seat === null ? undefined : hero(s, a.seat), (a.kind ?? undefined) as Consumed | undefined);
}

function startDiscard(s: GameState) {
  for (const h of s.heroes) {
    h.discard.push(...h.play);
    h.play = [];
    h.discardDone = false;
  }
  s.phase = 'discard';
}

/** ⑥ 每名英雄提交弃牌（可为空，黏液牌不能弃）。全员提交后 ⑦ 抽牌并开始下一回合。 */
function discard(s: GameState, seat: number, cards: string[]) {
  if (s.phase !== 'discard') throw new RuleError('现在不是弃牌阶段');
  const h = hero(s, seat);
  if (h.discardDone) throw new RuleError('你已经确认过弃牌');
  const hand = h.hand.slice();
  for (const c of cards) {
    if (c === 'slime') throw new RuleError('弃牌阶段不能弃掉黏液牌');
    const i = hand.indexOf(c);
    if (i < 0) throw new RuleError('要弃的牌不在手里');
    hand.splice(i, 1);
  }
  const nonSlime = hand.filter((c) => c !== 'slime').length;
  const need = hand.length - handLimit(h);
  if (need > 0 && nonSlime > 0) throw new RuleError(`手牌上限 ${handLimit(h)}，还需要再弃 ${Math.min(need, nonSlime)} 张`);
  h.discard.push(...cards);
  h.hand = hand;
  h.discardDone = true;
  if (s.heroes.every((x) => x.discardDone)) {
    for (const x of s.heroes) drawCards(s, x, Math.max(0, handLimit(x) - x.hand.length));
    startRound(s);
  }
}

/** 隐私视图：别人的手牌、牌库、未翻开的诅咒只给数量 */
export function viewFor(s: GameState, seat: number | null) {
  return {
    ...s,
    rngState: 0,
    curseDeck: [],
    heroes: s.heroes.map((h) => ({
      ...h,
      hand: h.seat === seat ? h.hand : [],
      handCount: h.hand.length,
      deck: [],
      deckCount: h.deck.length,
      curses: h.curses.map((c) => (c.state === 'down' && h.seat !== seat ? { id: '?', state: c.state } : c)),
    })),
    planned: s.planned.map((a) => (a.hidden ? { ...a, value: -1 } : a)),
    actor: actor(s),
  };
}

export const ALL_TYPES: DamageType[] = ['melee', 'ranged', 'magic'];
export { lowestHealth };
