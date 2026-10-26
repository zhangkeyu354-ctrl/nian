import type { RacerInfo } from "./racers.ts";

/** User-accepted reference text, development only. Never appended to DRAFTABLE. */
export const SECOND_WIND_PREVIEW: RacerInfo[] = [
  { id:"sw_icarus",en:"Icarus",zh:"伊卡洛斯",powerEn:"Flight Risk",powerZh:"飞行风险",text:"主移动 +3；主移动最终骰为 6 时淘汰出本场。",status:"CONFIRMED",source_level:"D",source_ref:"SW-F01；用户2026-10-26确认采用；仅开发预览",translation_status:"DRAFT",notes:"开启新角色后可参与招募。" },
  { id:"sw_overtaker",en:"Overtaker",zh:"超车手",powerEn:"Skulldiggery",powerZh:"赶超计谋",text:"每有一名在场选手位于我前方，主移动 +1。",status:"CONFIRMED",source_level:"D",source_ref:"SW-F01；用户2026-10-26确认采用；仅开发预览",translation_status:"DRAFT",notes:"同格、冲线与淘汰选手不计入前方人数。" },
  { id:"sw_kingtripper",en:"Kingtripper",zh:"绊王",powerEn:"Regislide",powerZh:"王者一绊",text:"回合开始时，可以绊倒一名领先选手。",status:"CONFIRMED",source_level:"D",source_ref:"SW-F01；用户2026-10-26确认采用；仅开发预览",translation_status:"DRAFT",notes:"并列领先时选一名，也可以放弃。" },
];
export const SECOND_WIND_PREVIEW_IDS = SECOND_WIND_PREVIEW.map(r=>r.id);

