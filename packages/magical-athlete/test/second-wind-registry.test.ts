import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RACERS } from "../src/racers.ts";
const root = "docs/magical-athlete/second-wind/";
const read = (name: string) => JSON.parse(readFileSync(root + name, "utf8"));
const db = read("second-wind-candidates.json");
describe("Second Wind 研究登记与发布隔离", () => {
  it("36名候选登记完整且ID、英文名不重复", () => {
    expect(db.characters).toHaveLength(36);
    expect(new Set(db.characters.map((c: any) => c.id)).size).toBe(36);
    expect(new Set(db.characters.map((c: any) => c.en)).size).toBe(36);
    for (const c of db.characters) for (const key of ["en","zh_draft","source_locator","candidate_semantics","candidate_trigger","candidate_optionality","candidate_movement","candidate_targets","candidate_requires_choice","candidate_extra_turn","candidate_changes_controller","candidate_eliminates","candidate_changes_score","interaction_notes","animation_requirements","tests","rule_status"]) expect(c).toHaveProperty(key);
  });
  it("108项角色测试是计划，不允许登记成通过；无未核规则进入生产", () => {
    expect(db.production_enabled).toBe(false);
    for (const c of db.characters) {
      expect(c.rule_status).toBe("CHECK_REQUIRED");
      expect(c.verified_semantics).toBeNull();
      expect(c.release_ready).toBe(false);
      expect(c.tests.passed).toBe(0);
      for (const kind of ["normal","boundary","interaction"]) expect(c.tests[kind].length).toBeGreaterThan(5);
      if (c.development_implementation) {
        expect(c.development_implementation.production_release_approved).toBe(false);
        expect(c.artwork.status).toBe("ORIGINAL_ART_EXISTING_CARD_TEMPLATE");
        expect(c.artwork.public_asset_path).toBe(`/assets/magical-athlete/cards/zh/${c.id}.webp`);
      } else expect(c.artwork.public_asset_path).toBeNull();
    }
    const tracks = read("tracks-research.json");
    expect(tracks.production_enabled).toBe(false);
    expect(tracks.tracks).toHaveLength(2);
    for (const track of tracks.tracks) {
      expect(track.rules_status).toBe("CHECK_REQUIRED");
      expect(track.length).toBeNull();
      expect(track.specials).toBeNull();
      expect(track.release_ready).toBe(false);
    }
  });
  it("32名Extra Mile作者创作角色被明确隔离，不混入候选名单", () => {
    const extra = read("excluded-fan-characters.json");
    expect(extra.characters).toHaveLength(32);
    for (const c of extra.characters) {
      expect(c.classification).toBe("UNOFFICIAL_EXCLUDED");
      expect(db.characters.some((r: any) => r.en === c.en)).toBe(false);
    }
  });
  it("2025基础名单差集为空，候选角色没有覆盖现有ID", () => {
    const reference = read("reference-base-roster.json");
    expect(reference.characters.map((r: any) => r.id).sort()).toEqual(RACERS.map(r => r.id).sort());
    expect(RACERS).toHaveLength(36);
    for (const c of db.characters) expect(RACERS.some(r => r.id === c.id)).toBe(false);
  });
  it("每条来源有独立编号，候选的来源引用真实存在", () => {
    const ids = read("sources.json").map((s: any) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of db.characters) for (const id of c.source_refs) expect(ids).toContain(id);
  });
  it("既有赛道保持冻结；引擎和开局设置兼容性另用旧轨迹与房间测试验证", () => {
    const baseline = read("legacy-implementation.json");
    for (const file of ["packages/magical-athlete/src/tracks.ts"]) expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(baseline.hashes[file]);
  });
});
