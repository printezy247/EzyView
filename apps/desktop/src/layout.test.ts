import { describe, expect, it } from "vitest";
import type { IndicatorDef } from "@ezyview/indicators";
import { activeChartOf, cellCount, restoreLayout, restoreWorkspace, setActiveChart, setGrid, updateChart } from "./layout";
import type { ChartState, Layout, PersistedWorkspace } from "./layout";

const chart = (symbol: string, extra: Partial<ChartState> = {}): ChartState => ({
  symbol,
  resolution: "1D",
  chartType: "candles",
  showVolume: true,
  showGrid: true,
  theme: "dark",
  indicators: [],
  drawings: [],
  ...extra,
});

const layout = (charts: ChartState[], extra: Partial<Layout> = {}): Layout => ({
  id: "L1",
  name: "Layout 1",
  color: "#2962ff",
  grid: "1",
  charts,
  activeChart: 0,
  ...extra,
});

const SMA = { id: "sma", name: "SMA", compute: () => ({}) } as unknown as IndicatorDef;
const resolveDef = (id: string) => (id === "sma" ? SMA : undefined);

describe("cellCount", () => {
  it("maps each grid to its cells", () => {
    expect(cellCount("1")).toBe(1);
    expect(cellCount("2h")).toBe(2);
    expect(cellCount("2v")).toBe(2);
    expect(cellCount("4")).toBe(4);
    expect(cellCount("6")).toBe(6);
    expect(cellCount("8")).toBe(8);
    expect(cellCount("9")).toBe(9);
  });
});

describe("setGrid", () => {
  it("adds blank cells that copy the active chart's symbol and interval", () => {
    const drawing = { id: "d", tool: "trend_line" as const, points: [], style: { color: "#fff", width: 1, lineStyle: "solid" as const } };
    const base = layout([chart("AAPL", { resolution: "1h", drawings: [drawing] })]);
    const next = setGrid(base, "4");
    expect(next.grid).toBe("4");
    expect(next.charts).toHaveLength(4);
    expect(next.charts[3]).toMatchObject({ symbol: "AAPL", resolution: "1h", drawings: [], indicators: [] });
    // The original cell keeps its drawings.
    expect(next.charts[0]!.drawings).toHaveLength(1);
    expect(base.charts).toHaveLength(1); // not mutated
  });

  it("keeps hidden cells when shrinking so growing back restores them", () => {
    const four = layout([chart("A"), chart("B"), chart("C"), chart("D")], { grid: "4", activeChart: 3 });
    const one = setGrid(four, "1");
    expect(one.charts.map((c) => c.symbol)).toEqual(["A", "B", "C", "D"]);
    expect(one.activeChart).toBe(0); // clamped onto the only visible cell
    expect(setGrid(one, "4").charts[3]!.symbol).toBe("D");
  });

  it("clamps the active cell when going from 4 to 2", () => {
    const four = layout([chart("A"), chart("B"), chart("C"), chart("D")], { grid: "4", activeChart: 2 });
    expect(setGrid(four, "2v").activeChart).toBe(1);
  });
});

describe("setActiveChart", () => {
  const two = layout([chart("A"), chart("B")], { grid: "2h" });

  it("focuses a visible cell", () => {
    const next = setActiveChart(two, 1);
    expect(next.activeChart).toBe(1);
    expect(activeChartOf(next).symbol).toBe("B");
  });

  it("ignores cells that are not on screen", () => {
    expect(setActiveChart(two, 2)).toBe(two);
    expect(setActiveChart(two, -1)).toBe(two);
    expect(setActiveChart(two, 0)).toBe(two);
  });
});

describe("updateChart", () => {
  it("changes only the targeted cell", () => {
    const two = layout([chart("A"), chart("B")], { grid: "2h" });
    const next = updateChart(two, 1, (c) => ({ ...c, symbol: "MSFT", resolution: "5m" }));
    expect(next.charts[0]).toBe(two.charts[0]);
    expect(next.charts[1]).toMatchObject({ symbol: "MSFT", resolution: "5m" });
  });

  it("ignores out-of-range indices", () => {
    const one = layout([chart("A")]);
    expect(updateChart(one, 5, (c) => c)).toBe(one);
  });
});

describe("restoreLayout", () => {
  it("re-resolves indicator definitions and drops unknown ones", () => {
    const saved = JSON.parse(
      JSON.stringify(
        layout([
          chart("A", {
            indicators: [
              { uid: "1", def: SMA, params: { length: 20 }, colorIndex: 0, hidden: true, name: "Fast" },
              { uid: "2", def: { ...SMA, id: "gone" }, params: {}, colorIndex: 1 },
            ],
          }),
        ]),
      ),
    );
    const restored = restoreLayout(saved, chart("DEFAULT"), resolveDef)!;
    const indicators = restored.charts[0]!.indicators;
    expect(indicators).toHaveLength(1);
    expect(indicators[0]!.def).toBe(SMA); // compute function is back
    expect(indicators[0]).toMatchObject({ hidden: true, name: "Fast", params: { length: 20 } });
  });

  it("fills missing cells for the saved grid and clamps a bad active index", () => {
    const restored = restoreLayout({ id: "x", grid: "4", charts: [chart("A")], activeChart: 9 }, chart("DEF"), resolveDef)!;
    expect(restored.charts).toHaveLength(4);
    expect(restored.activeChart).toBe(0);
  });

  it("rejects garbage", () => {
    expect(restoreLayout(null, chart("D"), resolveDef)).toBeNull();
    expect(restoreLayout({ id: "x", charts: [] }, chart("D"), resolveDef)).toBeNull();
    expect(restoreLayout({ id: "x", grid: "3", charts: [{}] }, chart("D"), resolveDef)!.grid).toBe("1");
  });
});

describe("restoreWorkspace", () => {
  const current: PersistedWorkspace = {
    layouts: [layout([chart("CUR")])],
    activeLayoutId: "L1",
    magnet: "off",
    crosshairSync: false,
    replaySpeed: 1,
  };

  it("round-trips a saved workspace through JSON", () => {
    const saved: PersistedWorkspace = {
      layouts: [
        layout([chart("A"), chart("B")], { id: "one", grid: "2v", activeChart: 1 }),
        layout([chart("C")], { id: "two" }),
      ],
      activeLayoutId: "two",
      magnet: "strong",
      crosshairSync: true,
      replaySpeed: 2,
    };
    const restored = restoreWorkspace(JSON.parse(JSON.stringify(saved)), current, chart("D"), resolveDef);
    expect(restored).toEqual(saved);
  });

  it("keeps defaults for workspace fields saved before they existed", () => {
    const old = { layouts: [layout([chart("A")])], activeLayoutId: "L1", magnet: "weak" };
    const restored = restoreWorkspace(old, current, chart("D"), resolveDef);
    expect(restored.crosshairSync).toBe(false);
    expect(restored.replaySpeed).toBe(1);
  });

  it("rejects an unknown replay speed", () => {
    const restored = restoreWorkspace(
      { layouts: [layout([chart("A")])], activeLayoutId: "L1", magnet: "off", replaySpeed: 99 },
      current,
      chart("D"),
      resolveDef,
    );
    expect(restored.replaySpeed).toBe(1);
  });

  it("falls back to the current workspace when storage is empty or corrupt", () => {
    expect(restoreWorkspace(undefined, current, chart("D"), resolveDef)).toBe(current);
    expect(restoreWorkspace({ layouts: "nope" }, current, chart("D"), resolveDef)).toEqual(current);
  });

  it("points at the first layout when the saved active id is missing", () => {
    const restored = restoreWorkspace(
      { layouts: [layout([chart("A")], { id: "a" })], activeLayoutId: "zzz", magnet: "bogus" },
      current,
      chart("D"),
      resolveDef,
    );
    expect(restored.activeLayoutId).toBe("a");
    expect(restored.magnet).toBe("off");
  });
});
