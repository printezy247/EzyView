import { beforeEach, describe, expect, it } from "vitest";
import { feedHealth, recordFeedFailure, recordFeedSuccess } from "./feedHealth";

beforeEach(() => {
  feedHealth.reset();
});

describe("feedHealth", () => {
  it("starts healthy", () => {
    expect(feedHealth.statusOf("binance")).toBe("ok");
    expect(feedHealth.messageOf("binance")).toBeNull();
  });

  it("records a failure and keeps the reason", () => {
    recordFeedFailure("binance", "connection reset");
    expect(feedHealth.statusOf("binance")).toBe("failed");
    expect(feedHealth.messageOf("binance")).toBe("connection reset");
  });

  it("clears the failure when the source answers again", () => {
    recordFeedFailure("binance", "timeout");
    recordFeedSuccess("binance");
    expect(feedHealth.statusOf("binance")).toBe("ok");
    expect(feedHealth.messageOf("binance")).toBeNull();
  });

  it("keeps sources apart", () => {
    recordFeedFailure("binance", "down");
    expect(feedHealth.statusOf("kraken")).toBe("ok");
    expect(feedHealth.statusOf("binance")).toBe("failed");
  });

  it("counts the failures so a panel can show how long it has been broken", () => {
    recordFeedFailure("binance", "down");
    recordFeedFailure("binance", "down again");
    expect(feedHealth.failuresOf("binance")).toBe(2);
  });

  it("resets every source", () => {
    recordFeedFailure("binance", "down");
    feedHealth.reset();
    expect(feedHealth.statusOf("binance")).toBe("ok");
    expect(feedHealth.failuresOf("binance")).toBe(0);
  });

  it("ignores an empty source name", () => {
    recordFeedFailure("", "down");
    expect(feedHealth.statusOf("")).toBe("ok");
  });
});
