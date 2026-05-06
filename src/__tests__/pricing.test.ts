import { describe, it, expect } from "vitest";
import { estimateCost, getPricing, hasPricing } from "../shared/pricing.js";

describe("hasPricing", () => {
  it("등록된 모델은 true를 반환한다", () => {
    expect(hasPricing("claude-opus-4-6")).toBe(true);
    expect(hasPricing("claude-sonnet-4-6")).toBe(true);
  });

  it("미등록 모델은 false를 반환한다", () => {
    expect(hasPricing("gpt-5.4")).toBe(false);
    expect(hasPricing("unknown")).toBe(false);
  });
});

describe("getPricing", () => {
  it("등록된 모델의 가격 정보를 반환한다", () => {
    const pricing = getPricing("claude-opus-4-6");
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBeGreaterThan(0);
    expect(pricing!.output).toBeGreaterThan(pricing!.input);
  });

  it("미등록 모델은 null을 반환한다", () => {
    expect(getPricing("gpt-5.4")).toBeNull();
  });
});

describe("estimateCost", () => {
  it("Claude 모델의 비용을 계산한다", () => {
    const cost = estimateCost("claude-sonnet-4-6", 1000000, 100000, 500000, 50000);
    expect(cost).not.toBeNull();
    expect(cost).toBeGreaterThan(0);
  });

  it("input/output 가격이 올바르게 적용된다", () => {
    const inputOnly = estimateCost("claude-sonnet-4-6", 1000000, 0, 0, 0);
    const outputOnly = estimateCost("claude-sonnet-4-6", 0, 1000000, 0, 0);
    expect(inputOnly).not.toBeNull();
    expect(outputOnly).not.toBeNull();
    expect(outputOnly!).toBeGreaterThan(inputOnly!);
  });

  it("미등록 모델은 null을 반환한다", () => {
    expect(estimateCost("gpt-5.4", 1000, 500, 0, 0)).toBeNull();
  });

  it("모든 토큰이 0이면 비용도 0이다", () => {
    expect(estimateCost("claude-opus-4-6", 0, 0, 0, 0)).toBe(0);
  });
});
