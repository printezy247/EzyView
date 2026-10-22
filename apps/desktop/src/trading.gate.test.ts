import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { OrderRequest } from "@ezyview/data-adapters";

/** Bridge double shared with the mocked adapter module. */
const h = vi.hoisted(() => {
  const transport: Record<string, Mock> = {
    ping: vi.fn(async () => true),
    account: vi.fn(async () => ({ login: 4123, trade_mode: 0, balance: 1000, equity: 1000, margin: 0, margin_free: 1000 })),
    openPositions: vi.fn(async () => ({ positions: [], orders: [] })),
    deals: vi.fn(async () => ({ deals: [] })),
    marketWatch: vi.fn(async () => ({ symbols: [] })),
    history: vi.fn(async () => ({ rates: [] })),
    placeOrder: vi.fn(async () => ({ ticket: 42 })),
    close: vi.fn(async () => ({ ok: true })),
    cancel: vi.fn(async () => ({ ok: true })),
    modify: vi.fn(async () => ({ ok: true })),
    connect: vi.fn(async () => ({ ok: true, session: "sess", login: 4123, demo: true })),
    disconnect: vi.fn(async () => ({ ok: true })),
    audit: vi.fn(async () => []),
  };
  return { transport };
});

vi.mock("@ezyview/mt5-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ezyview/mt5-adapter")>();
  const adapter = {
    id: "mt5",
    data: new actual.Mt5MarketData(h.transport as never),
    trading: new actual.Mt5Trading(h.transport as never),
    transport: h.transport as never,
  };
  return { ...actual, createMt5: () => adapter };
});

import { paperEngine, useTrading } from "./trading";
import { useMt5Accounts } from "./mt5Accounts";
import { useMt5 } from "./mt5";

const marketReq = (qty: number): OrderRequest => ({ symbol: "XAUUSD", side: "buy", type: "market", qty });

function demoSession(): void {
  useMt5Accounts.setState({ session: { server: "S", login: "4123", demo: true, summary: {} } });
}

beforeEach(() => {
  for (const fn of Object.values(h.transport)) fn.mockClear();
  useMt5.setState({ source: "mt5", status: "online", error: null });
  useMt5Accounts.setState({ session: null, error: null, safety: { maxOrderVolume: 1, symbolAllowList: [], dryRun: false } });
  useTrading.setState({ pending: null, error: null, note: null });
});

describe("MT5 actions pass the safety gate", () => {
  it("blocks an over-cap order before any dialog or network call", async () => {
    demoSession();
    useMt5Accounts.getState().saveSafety({ maxOrderVolume: 0.5 });
    const ok = await useTrading.getState().submit(marketReq(1));
    expect(ok).toBe(false);
    expect(useTrading.getState().pending).toBeNull();
    expect(useTrading.getState().error).toMatch(/exceeds the max order size/);
    expect(h.transport.placeOrder).not.toHaveBeenCalled();
  });

  it("parks a valid order until the user approves, then sends once", async () => {
    demoSession();
    const parked = await useTrading.getState().submit(marketReq(0.1));
    expect(parked).toBe(false);
    expect(useTrading.getState().pending?.kind).toBe("place");
    expect(h.transport.placeOrder).not.toHaveBeenCalled();

    const sent = await useTrading.getState().approve();
    expect(sent).toBe(true);
    expect(h.transport.placeOrder).toHaveBeenCalledTimes(1);
    expect(useTrading.getState().pending).toBeNull();

    // The token died with the send: a second approve has nothing to consume.
    expect(await useTrading.getState().approve()).toBe(false);
  });

  it("decline drops the parked action and its token", async () => {
    demoSession();
    await useTrading.getState().submit(marketReq(0.1));
    useTrading.getState().decline();
    expect(useTrading.getState().pending).toBeNull();
    expect(await useTrading.getState().approve()).toBe(false);
    expect(h.transport.placeOrder).not.toHaveBeenCalled();
  });

  it("replay of a consumed token cannot send twice", async () => {
    demoSession();
    await useTrading.getState().submit(marketReq(0.1));
    const pending = useTrading.getState().pending;
    expect(pending).not.toBeNull();
    const sent = await useTrading.getState().approve();
    expect(sent).toBe(true);
    // A stale dialog holding the same token re-submits it: refused.
    useTrading.setState({ pending: pending ?? null });
    expect(await useTrading.getState().approve()).toBe(false);
    expect(h.transport.placeOrder).toHaveBeenCalledTimes(1);
  });

  it("dry-run rides the flag and reports it as not sent", async () => {
    demoSession();
    useMt5Accounts.getState().saveSafety({ dryRun: true });
    await useTrading.getState().submit(marketReq(0.1));
    expect(await useTrading.getState().approve()).toBe(true);
    expect(h.transport.placeOrder).toHaveBeenCalledWith(expect.anything(), { dryRun: true });
    expect(useTrading.getState().note).toMatch(/dry-run, nothing was sent/);
  });

  it("flags a real account for the second confirmation", async () => {
    useMt5Accounts.setState({ session: { server: "S", login: "999", demo: false, summary: {} } });
    await useTrading.getState().submit(marketReq(0.1));
    const pending = useTrading.getState().pending;
    expect(pending?.gate.secondConfirm).toBe(true);
    expect(pending?.gate.reasons.join(" ")).toMatch(/REAL account/);
  });

  it("enforces the symbol allow-list", async () => {
    demoSession();
    useMt5Accounts.getState().saveSafety({ symbolAllowList: ["EURUSD"] });
    await useTrading.getState().submit(marketReq(0.1));
    expect(useTrading.getState().pending).toBeNull();
    expect(useTrading.getState().error).toMatch(/allow-list/);
  });

  it("close and cancel park too, and the session stamp rides the write", async () => {
    demoSession();
    await useTrading.getState().close("XAUUSD", 0.2);
    expect(useTrading.getState().pending?.kind).toBe("close");
    expect(await useTrading.getState().approve()).toBe(true);
    expect(h.transport.close).toHaveBeenCalledWith("XAUUSD", 0.2, { dryRun: false });

    await useTrading.getState().cancel("42");
    expect(await useTrading.getState().approve()).toBe(true);
    expect(h.transport.cancel).toHaveBeenCalledWith("42", { dryRun: false });
  });

  it("amends a position by broker ticket, not by symbol", async () => {
    demoSession();
    useTrading.setState({
      positions: [
        {
          id: "77",
          symbol: "XAUUSD",
          side: "long",
          qty: 0.1,
          entryPrice: 4000,
          markPrice: 4010,
          unrealizedPnl: 1,
          time: 1,
          stopLoss: 4000,
          takeProfit: 4100,
        },
      ],
    });
    expect(await useTrading.getState().amend("XAUUSD", { stopLoss: 3990 })).toBe(false);
    expect(useTrading.getState().pending?.kind).toBe("amend");
    expect(await useTrading.getState().approve()).toBe(true);
    expect(h.transport.modify).toHaveBeenCalledWith("77", 3990, undefined, { dryRun: false });
  });

  it("passes null through as 0 so a bracket can be cleared", async () => {
    demoSession();
    useTrading.setState({
      positions: [
        { id: "77", symbol: "XAUUSD", side: "long", qty: 0.1, entryPrice: 4000, markPrice: 4010, unrealizedPnl: 1, time: 1, stopLoss: 4000, takeProfit: 4100 },
      ],
    });
    await useTrading.getState().amend("XAUUSD", { takeProfit: null });
    expect(await useTrading.getState().approve()).toBe(true);
    expect(h.transport.modify).toHaveBeenCalledWith("77", undefined, 0, { dryRun: false });
  });

  it("refuses to amend a position with no broker ticket", async () => {
    demoSession();
    useTrading.setState({
      positions: [
        { symbol: "XAUUSD", side: "long", qty: 0.1, entryPrice: 4000, markPrice: 4010, unrealizedPnl: 1, time: 1, stopLoss: 4000 },
      ],
    });
    expect(await useTrading.getState().amend("XAUUSD", { stopLoss: 3990 })).toBe(false);
    expect(useTrading.getState().pending).toBeNull();
    expect(useTrading.getState().error).toMatch(/ticket/);
  });

  it("close-all snapshots the open rows at request time", async () => {
    demoSession();
    h.transport.openPositions = vi.fn(async () => ({
      positions: [
        { symbol: "XAUUSD", type: 0, volume: 0.1, price_open: 4000, price_current: 4010, profit: 10, sl: 0, tp: 0, time: 1 },
        { symbol: "EURUSD", type: 1, volume: 0.2, price_open: 1.1, price_current: 1.09, profit: 5, sl: 0, tp: 0, time: 2 },
      ],
      orders: [],
    }));
    await useTrading.getState().closeAll();
    const pending = useTrading.getState().pending;
    expect(pending?.kind).toBe("close-all");
    if (pending?.kind === "close-all") {
      expect(pending.rows).toEqual([
        { symbol: "XAUUSD", qty: 0.1 },
        { symbol: "EURUSD", qty: 0.2 },
      ]);
    }
    expect(await useTrading.getState().approve()).toBe(true);
    expect(h.transport.close).toHaveBeenCalledTimes(2);
  });

  it("surfaces a bridge rejection on approve", async () => {
    demoSession();
    h.transport.placeOrder = vi.fn(async () => {
      throw new Error("rejected (10013): no money");
    });
    await useTrading.getState().submit(marketReq(0.1));
    expect(await useTrading.getState().approve()).toBe(false);
    expect(useTrading.getState().error).toMatch(/no money/);
    expect(useTrading.getState().pending).toBeNull();
  });
});

describe("paper venue skips the gate", () => {
  it("submits and cancels without parking", async () => {
    useMt5.setState({ source: "ezyview" });
    const request: OrderRequest = { symbol: "XAUUSD", side: "buy", type: "limit", qty: 0.1, price: 4000 };
    expect(await useTrading.getState().submit(request)).toBe(true);
    expect(useTrading.getState().pending).toBeNull();
    const orders = useTrading.getState().orders;
    expect(orders).toHaveLength(1);
    const first = orders[0];
    expect(await useTrading.getState().cancel(first?.id ?? "")).toBe(true);
    expect(useTrading.getState().orders).toHaveLength(0);
    await paperEngine.reset();
  });
});
