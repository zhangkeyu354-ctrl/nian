import { describe, expect, it } from "vitest";
import { assignRoles, roleCounts } from "../src/roles.ts";

describe("犯罪现场身份分配", () => {
  for (let count = 4; count <= 12; count++) {
    it(`${count} 人配置准确且指定鉴证专家公开`, () => {
      const roles = assignRoles(count, 2, () => 0.5);
      expect(roles).toHaveLength(count);
      expect(roles[2]).toBe("forensic");
      const actual = Object.fromEntries(
        Object.entries(roleCounts(count)).map(([role]) => [role, roles.filter((value) => value === role).length]),
      );
      expect(actual).toEqual(roleCounts(count));
    });
  }

  it("拒绝超出人数和非法专家座位", () => {
    expect(() => assignRoles(3, 0)).toThrow();
    expect(() => assignRoles(13, 0)).toThrow();
    expect(() => assignRoles(4, 4)).toThrow();
  });
});
