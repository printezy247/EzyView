import { describe, expect, it, vi } from "vitest";
import { ProviderError, getJson } from "./http.js";
import type { FetchLike } from "./http.js";

const ok = (body: unknown): Awaited<ReturnType<FetchLike>> => ({
  ok: true,
  status: 200,
  json: async () => body,
});
const fail = (status: number): Awaited<ReturnType<FetchLike>> => ({
  ok: false,
  status,
  json: async () => ({}),
});

describe("getJson retries", () => {
  it("retries a network error and succeeds on the next attempt", async () => {
    const fetchFn = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok({ value: 42 }));
    const body = await getJson(fetchFn, "Finnhub", "https://example.test/x", { sleep: async () => {} });
    expect(body).toEqual({ value: 42 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 and succeeds", async () => {
    const fetchFn = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(ok({ ok: 1 }));
    await getJson(fetchFn, "Alpha Vantage", "https://example.test/x", { sleep: async () => {} });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx", async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok({ ok: 1 }));
    await getJson(fetchFn, "Finnhub", "https://example.test/x", { sleep: async () => {} });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected key", async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValue(fail(401));
    await expect(getJson(fetchFn, "Finnhub", "https://example.test/x", { sleep: async () => {} })).rejects.toThrow(/API key rejected/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404", async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValue(fail(404));
    await expect(getJson(fetchFn, "Finnhub", "https://example.test/x", { sleep: async () => {} })).rejects.toThrow(/HTTP 404/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempts are used up and reports the last failure", async () => {
    const fetchFn = vi.fn<FetchLike>().mockRejectedValue(new Error("network down"));
    await expect(
      getJson(fetchFn, "Finnhub", "https://example.test/x", { attempts: 3, sleep: async () => {} }),
    ).rejects.toThrow(/network down/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("keeps the rate-limit hint on the final failure", async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValue(fail(429));
    await expect(
      getJson(fetchFn, "Alpha Vantage", "https://example.test/x", { attempts: 2, sleep: async () => {} }),
    ).rejects.toThrow(/rate limit/);
  });

  it("reports a rate limit as a ProviderError with its status", async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValue(fail(429));
    await expect(
      getJson(fetchFn, "Alpha Vantage", "https://example.test/x", { attempts: 1 }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
