/** 增量注册表：一代tracks.ts保持字节冻结，新地图未验收不进入正式池。 */
import {
  TRACKS as LEGACY_TRACKS,
  PLAYABLE_TRACKS as LEGACY_PLAYABLE_TRACKS,
  type Track as LegacyTrack,
  type TrackId as LegacyTrackId,
} from "./tracks.ts";
import { SECOND_WIND_MAPS, type SecondWindMapId } from "./second-wind-maps.ts";
export type TrackId = LegacyTrackId | SecondWindMapId;
export type Track = Omit<LegacyTrack, "id"> & { id: TrackId };
export const PLAYABLE_TRACKS: TrackId[] = [...LEGACY_PLAYABLE_TRACKS];
export const TRACKS: Record<TrackId, Track> = {
  ...LEGACY_TRACKS,
  "twisty-twirl": {
    id: "twisty-twirl",
    zh: "扭扭赛道",
    en: "Twisty Twirl",
    length: 30,
    secondCorner: 15,
    specials: {},
    status: "CHECK_REQUIRED",
    missing: "13张事件尚未全部通过验收",
    source_ref: SECOND_WIND_MAPS["twisty-twirl"].source,
  },
  "whirly-world": {
    id: "whirly-world",
    zh: "螺旋世界",
    en: "Whirly World",
    length: 30,
    secondCorner: 15,
    specials: {},
    status: "CHECK_REQUIRED",
    missing: "仅预发布，尚待全角色及联机验收",
    source_ref: SECOND_WIND_MAPS["whirly-world"].source,
  },
};
