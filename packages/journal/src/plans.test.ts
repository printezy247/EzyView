import { describe, expect, it } from "vitest";
import { planRewardRisk } from "./model";

describe("planRewardRisk", () => {
  it("computes reward and risk for a long plan", () => {
    expect(planRewardRisk({ entry: 100, stop: 95, target: 115 })).toEqual({ risk: 5, reward: 15, ratio: 3 });
  });

  it("uses absolute distances for a short plan", () => {
    expect(planRewardRisk({ entry: 100, stop: 105, target: 90 })).toEqual({ risk: 5, reward: 10, ratio: 2 });
  });

  it("refuses plans without all three levels", () => {
    expect(planRewardRisk({ entry: 100, stop: 95 })).toBeNull();
    expect(planRewardRisk({ entry: 100, target: 110 })).toBeNull();
    expect(planRewardRisk({})).toBeNull();
  });

  it("refuses zero or negative risk and rewards", () => {
    expect(planRewardRisk({ entry: 100, stop: 100, target: 110 })).toBeNull();
    expect(planRewardRisk({ entry: 100, stop: 95, target: 100 })).toBeNull();
    expect(planRewardRisk({ entry: Number.NaN, stop: 95, target: 110 })).toBeNull();
  });
});
