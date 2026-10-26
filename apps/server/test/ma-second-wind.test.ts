import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARoomStore } from "../src/ma-rooms.ts";
describe("魔法运动员开局可选新角色", () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "ma-sw-room-"));
    const store = new MARoomStore(dir);
    const room = store.create();
    const host = room.claim("房主"),
      guest = room.claim("客人");
    return { dir, store, room, host, guest };
  };
  it("默认关闭；只有房主可切换，只接受布尔值", () => {
    const { room, host, guest } = setup();
    expect(room.snapshot(null).secondWind).toBe(false);
    expect(() => room.lobby(guest, { type: "SET_SECOND_WIND", enabled: true })).toThrow("HOST_ONLY");
    expect(() => room.lobby(host, { type: "SET_SECOND_WIND", enabled: "true" } as any)).toThrow("BAD_ACTION");
    room.lobby(host, { type: "SET_SECOND_WIND", enabled: true });
    expect(room.snapshot(null).secondWind).toBe(true);
    room.lobby(host, { type: "SET_SECOND_WIND", enabled: false });
    room.lobby(host, { type: "START" });
    expect(room.state!.settings.secondWindPreview).toBeUndefined();
    expect([...room.state!.deck, ...room.state!.draft!.pool].some((id) => id.startsWith("sw_"))).toBe(false);
  });
  it("开启后混入72名，重启恢复相同；开局后不能切换", () => {
    const { dir, store, room, host } = setup();
    room.lobby(host, { type: "SET_SECOND_WIND", enabled: true });
    room.lobby(host, { type: "START" });
    store.save(room);
    expect([...room.state!.deck, ...room.state!.draft!.pool]).toHaveLength(72);
    const restored = new MARoomStore(dir).rooms.get(room.code)!;
    expect(restored.state).toEqual(room.state);
    expect(restored.snapshot(null).secondWind).toBe(true);
    expect(() => restored.lobby(host, { type: "SET_SECOND_WIND", enabled: false })).toThrow("ALREADY_STARTED");
  });
});
