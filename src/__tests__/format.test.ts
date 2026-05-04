import { describe, it, expect } from "vitest";
import { fmtNum, fmtTokensShort } from "../shared/format.js";

describe("fmtNum", () => {
  it("천 단위 콤마를 찍는다", () => {
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(999)).toBe("999");
    expect(fmtNum(1234)).toBe("1,234");
    expect(fmtNum(1234567)).toBe("1,234,567");
  });
});

describe("fmtTokensShort", () => {
  it("1000 미만은 그대로 표시한다", () => {
    expect(fmtTokensShort(0)).toBe("0");
    expect(fmtTokensShort(999)).toBe("999");
  });

  it("K 단위로 축약한다", () => {
    expect(fmtTokensShort(1000)).toBe("1.0K");
    expect(fmtTokensShort(5600)).toBe("5.6K");
    expect(fmtTokensShort(999999)).toBe("1000.0K");
  });

  it("M 단위로 축약한다", () => {
    expect(fmtTokensShort(1000000)).toBe("1.0M");
    expect(fmtTokensShort(1234567)).toBe("1.2M");
  });

  it("B 단위로 축약한다", () => {
    expect(fmtTokensShort(1000000000)).toBe("1.0B");
    expect(fmtTokensShort(2500000000)).toBe("2.5B");
  });
});
