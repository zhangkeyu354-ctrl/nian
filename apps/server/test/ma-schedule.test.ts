import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARoomStore } from "../src/ma-rooms.ts";
import { createMAGame } from "../../../packages/magical-athlete/src/engine.ts";

describe("魔法运动员赛程设置", () => {
  it("房主可在开局前配置四场重复地图；重启和开局都保留", () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-schedule-"));
    const store = new MARoomStore(dir);
    const room = store.create();
    const host = room.claim("甲");
    const guest = room.claim("乙");
    const schedule = ["wild", "wild", "mild", "wild"];
    expect(() => room.lobby(guest, { type: "SET_SCHEDULE", schedule } as any)).toThrow("HOST_ONLY");
    room.lobby(host, { type: "SET_SCHEDULE", schedule } as any);
    expect(room.snapshot(null).schedule).toEqual(schedule);
    store.save(room);
    const restored = new MARoomStore(dir).rooms.get(room.code)!;
    expect(restored.snapshot(null).schedule).toEqual(schedule);
    restored.lobby(host, { type: "START" });
    expect(restored.state!.settings.schedule).toEqual(schedule);
  });

  it("不能提交不完整、未知或未通过验收的新地图", () => {
    const room = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-schedule-"))).create();
    const host = room.claim("甲");
    for (const schedule of [
      ["mild", "wild"],
      ["mild", "wild", "mild", "unknown"],
      ["mild", "wild", "mild", "twisty-twirl"],
      ["mild", "wild", "mild", "whirly-world"],
    ]) expect(() => room.lobby(host, { type: "SET_SCHEDULE", schedule } as any)).toThrow("BAD_SCHEDULE");
  });

  it("随机赛程由服务器生成、开局前公开，并允许同图重复", () => {
    const room = new MARoomStore(mkdtempSync(join(tmpdir(), "ma-schedule-"))).create();
    const host = room.claim("甲");
    room.lobby(host, { type: "SHUFFLE_SCHEDULE" } as any);
    expect(room.snapshot(null).schedule).toHaveLength(4);
    expect(room.snapshot(null).schedule.every(id => id === "mild" || id === "wild")).toBe(true);
  });

  it("引擎自身也拒绝长度与比赛场数不符的赛程", () => {
    expect(() => createMAGame({
      players: [{ id: "p1", name: "甲" }, { id: "p2", name: "乙" }],
      seed: 1,
      settings: { schedule: ["mild", "wild"] },
    })).toThrow(/赛程/);
  });
});
