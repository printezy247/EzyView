import { describe, expect, it, vi } from "vitest";
import { buildChartMenu } from "./chartMenu";
import type { ChartMenuContext } from "./chartMenu";
import { DEFAULT_EVENT_OPTIONS } from "./eventOptions";
import type { MenuEntry } from "./Menu";

const actions = () => ({
  resetView: vi.fn(),
  copyPrice: vi.fn(),
  paste: vi.fn(),
  addAlert: vi.fn(),
  sellLimit: vi.fn(),
  buyStop: vi.fn(),
  addOrder: vi.fn(),
  toggleCursorLock: vi.fn(),
  openTable: vi.fn(),
  toggleObjectTree: vi.fn(),
  saveTemplate: vi.fn(),
  applyTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  removeIndicator: vi.fn(),
  toggleEvent: vi.fn(),
  openSettings: vi.fn(),
});

const ctx = (over: Partial<ChartMenuContext> = {}): ChartMenuContext => ({
  symbol: "OANDA:XAUUSD",
  price: 4165.89,
  precision: 2,
  mt5: false,
  hasClipboard: false,
  cursorLocked: false,
  objectTreeOpen: false,
  indicators: [],
  templates: [],
  eventOptions: DEFAULT_EVENT_OPTIONS,
  actions: actions(),
  ...over,
});

const labels = (entries: MenuEntry[]) => entries.filter((e) => "label" in e).map((e) => (e as { label: string }).label);
const find = (entries: MenuEntry[], id: string) => entries.find((e) => e.id === id);

describe("buildChartMenu", () => {
  it("formats the cursor price into the labels", () => {
    const l = labels(buildChartMenu(ctx()));
    expect(l).toContain("Copy price 4,165.89");
    expect(l).toContain("Add alert on XAUUSD at 4,165.89");
  });

  it("hides the order items unless MT5 is the active source", () => {
    const off = buildChartMenu(ctx());
    expect(find(off, "sell-limit")).toBeUndefined();
    const on = buildChartMenu(ctx({ mt5: true }));
    expect(labels(on)).toEqual(
      expect.arrayContaining(["Sell XAUUSD @ 4,165.89 limit", "Buy XAUUSD @ 4,165.89 stop", "Add order on XAUUSD at 4,165.89…"]),
    );
  });

  it("disables Paste until something is copied", () => {
    expect((find(buildChartMenu(ctx()), "paste") as { disabled?: boolean }).disabled).toBe(true);
    expect((find(buildChartMenu(ctx({ hasClipboard: true })), "paste") as { disabled?: boolean }).disabled).toBe(false);
  });

  it("flips the cursor-lock label and the object-tree state", () => {
    expect(labels(buildChartMenu(ctx()))).toContain("Lock vertical cursor line by time");
    expect(labels(buildChartMenu(ctx({ cursorLocked: true })))).toContain("Unlock vertical cursor line");
    expect((find(buildChartMenu(ctx({ objectTreeOpen: true })), "object-tree") as { checked?: boolean }).checked).toBe(true);
  });

  it("lists one removal per indicator and omits the section when there are none", () => {
    expect(find(buildChartMenu(ctx()), "indicators-label")).toBeUndefined();
    const menu = buildChartMenu(ctx({ indicators: [{ uid: "u1", name: "RSI" }, { uid: "u2", name: "EMA" }] }));
    expect(labels(menu)).toEqual(expect.arrayContaining(["Remove RSI", "Remove EMA"]));
    (find(menu, "remove-ind-u2") as { onSelect: () => void }).onSelect();
    expect(menu.length).toBeGreaterThan(5);
  });

  it("wires every action to its entry", () => {
    const a = actions();
    const menu = buildChartMenu(
      ctx({ mt5: true, hasClipboard: true, templates: [{ id: "t1", name: "Clean" }], indicators: [{ uid: "u1", name: "RSI" }], actions: a }),
    );
    const run = (id: string) => (find(menu, id) as { onSelect: () => void }).onSelect();
    for (const id of ["reset", "copy-price", "paste", "add-alert", "sell-limit", "buy-stop", "add-order", "cursor-lock", "table", "object-tree", "save-template", "settings"]) run(id);
    run("template-t1");
    run("template-del-t1");
    run("remove-ind-u1");
    run("event-earnings");
    expect(a.resetView).toHaveBeenCalledOnce();
    expect(a.copyPrice).toHaveBeenCalledOnce();
    expect(a.paste).toHaveBeenCalledOnce();
    expect(a.addAlert).toHaveBeenCalledOnce();
    expect(a.sellLimit).toHaveBeenCalledOnce();
    expect(a.buyStop).toHaveBeenCalledOnce();
    expect(a.addOrder).toHaveBeenCalledOnce();
    expect(a.toggleCursorLock).toHaveBeenCalledOnce();
    expect(a.openTable).toHaveBeenCalledOnce();
    expect(a.toggleObjectTree).toHaveBeenCalledOnce();
    expect(a.saveTemplate).toHaveBeenCalledOnce();
    expect(a.applyTemplate).toHaveBeenCalledWith("t1");
    expect(a.deleteTemplate).toHaveBeenCalledWith("t1");
    expect(a.removeIndicator).toHaveBeenCalledWith("u1");
    expect(a.toggleEvent).toHaveBeenCalledWith("earnings");
    expect(a.openSettings).toHaveBeenCalledOnce();
  });

  it("shows the event switches with their on/off state", () => {
    const menu = buildChartMenu(ctx());
    expect((find(menu, "event-high") as { checked: boolean }).checked).toBe(true);
    expect((find(menu, "event-medium") as { checked: boolean }).checked).toBe(false);
  });

  it("keeps entry ids unique", () => {
    const menu = buildChartMenu(ctx({ mt5: true, templates: [{ id: "t", name: "T" }], indicators: [{ uid: "u", name: "I" }] }));
    const ids = menu.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
