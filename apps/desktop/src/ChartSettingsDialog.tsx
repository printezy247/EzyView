import { useState } from "react";
import { X, ChevronDown, RotateCcw } from "lucide-react";
import { Modal } from "./Modal";
import { useWorkspace } from "./store";
import { DEFAULT_CHART_SETTINGS } from "./layout";
import type { ChartSettings, PriceScaleModeName } from "./layout";

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabId = "symbol" | "status_line" | "scales" | "canvas" | "trading" | "alerts" | "events";

const TABS: { id: TabId; label: string }[] = [
  { id: "symbol", label: "Symbol" },
  { id: "status_line", label: "Status line" },
  { id: "scales", label: "Scales and lines" },
  { id: "canvas", label: "Canvas" },
  { id: "trading", label: "Trading" },
  { id: "alerts", label: "Alerts" },
  { id: "events", label: "Events" },
];

const TIMEZONES = [
  { id: "exchange", label: "Exchange / Local" },
  { id: "UTC", label: "(UTC) Coordinated Universal Time" },
  { id: "America/New_York", label: "(UTC-5) New York / Eastern" },
  { id: "America/Chicago", label: "(UTC-6) Chicago / Central" },
  { id: "America/Los_Angeles", label: "(UTC-8) Los Angeles / Pacific" },
  { id: "Europe/London", label: "(UTC+0) London" },
  { id: "Europe/Berlin", label: "(UTC+1) Frankfurt / Berlin" },
  { id: "Asia/Dubai", label: "(UTC+4) Dubai" },
  { id: "Asia/Singapore", label: "(UTC+8) Singapore / Hong Kong" },
  { id: "Asia/Tokyo", label: "(UTC+9) Tokyo" },
  { id: "Australia/Sydney", label: "(UTC+10) Sydney" },
];

export function ChartSettingsDialog({ open, onClose }: Props) {
  const chart = useWorkspace((s) => s.activeChart());
  const updateActive = useWorkspace((s) => s.updateActive);

  // Active tab selection
  const [activeTab, setActiveTab] = useState<TabId>("symbol");

  // Local draft of settings; initialized from chart state or defaults
  const [draft, setDraft] = useState<ChartSettings>(() => ({
    ...DEFAULT_CHART_SETTINGS,
    ...chart.chartSettings,
    symbol: {
      ...DEFAULT_CHART_SETTINGS.symbol,
      ...chart.chartSettings?.symbol,
      timezone: chart.timezone ?? DEFAULT_CHART_SETTINGS.symbol.timezone,
    },
    scales: {
      ...DEFAULT_CHART_SETTINGS.scales,
      ...chart.chartSettings?.scales,
      priceScaleMode: chart.priceScale ?? DEFAULT_CHART_SETTINGS.scales.priceScaleMode,
      invertScale: chart.invertScale ?? DEFAULT_CHART_SETTINGS.scales.invertScale,
    },
    canvas: {
      ...DEFAULT_CHART_SETTINGS.canvas,
      ...chart.chartSettings?.canvas,
      watermark: chart.watermark ?? DEFAULT_CHART_SETTINGS.canvas.watermark,
      vertGridLines: chart.showGrid,
      horzGridLines: chart.showGrid,
    },
    events: {
      ...DEFAULT_CHART_SETTINGS.events,
      ...chart.chartSettings?.events,
      showSessionBreaks: chart.showSessionBreaks ?? DEFAULT_CHART_SETTINGS.events.showSessionBreaks,
    },
  }));

  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  if (!open) return null;

  const handleApply = () => {
    updateActive({
      chartSettings: draft,
      timezone: draft.symbol.timezone === "exchange" ? undefined : draft.symbol.timezone,
      priceScale: draft.scales.priceScaleMode,
      invertScale: draft.scales.invertScale,
      watermark: draft.canvas.watermark,
      showGrid: draft.canvas.vertGridLines || draft.canvas.horzGridLines,
      showSessionBreaks: draft.events.showSessionBreaks,
    });
    onClose();
  };

  const handleResetDefaults = () => {
    setDraft({ ...DEFAULT_CHART_SETTINGS });
    setTemplateMenuOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="chart-settings-dialog-title"
      className="flex h-[36rem] w-[min(48rem,96vw)] flex-col rounded-lg border border-ev-line bg-ev-panel text-ev-strong shadow-2xl"
    >
      {/* Dialog Header */}
      <div className="flex items-center justify-between border-b border-ev-raised px-5 py-3">
        <h2 id="chart-settings-dialog-title" className="text-body font-semibold text-ev-strong">
          Chart settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          aria-label="Close"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Dialog Main Content (Tabs Sidebar + Tab Panel) */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar Tabs */}
        <div className="w-44 shrink-0 border-r border-ev-raised bg-ev-panel/40 p-2" role="tablist" aria-orientation="vertical">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full rounded px-3 py-2 text-left text-dense font-medium transition-colors ${
                  active
                    ? "bg-ev-raised text-ev-strong font-semibold shadow-xs"
                    : "text-ev-muted hover:bg-ev-raised/50 hover:text-ev-strong"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Panel Body */}
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="flex-1 overflow-y-auto p-5 text-dense"
        >
          {activeTab === "symbol" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">Candles</div>

              <div className="grid grid-cols-[140px_auto] items-center gap-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={true}
                    readOnly
                    className="accent-ev-accent"
                  />
                  <span>Body</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5" title="Body Up Color">
                    <input
                      type="color"
                      value={draft.symbol.bodyUpColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          symbol: { ...d.symbol, bodyUpColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    <span className="text-micro text-ev-muted">Up</span>
                  </label>
                  <label className="flex items-center gap-1.5" title="Body Down Color">
                    <input
                      type="color"
                      value={draft.symbol.bodyDownColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          symbol: { ...d.symbol, bodyDownColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    <span className="text-micro text-ev-muted">Down</span>
                  </label>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={true}
                    readOnly
                    className="accent-ev-accent"
                  />
                  <span>Borders</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5" title="Border Up Color">
                    <input
                      type="color"
                      value={draft.symbol.borderUpColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          symbol: { ...d.symbol, borderUpColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    <span className="text-micro text-ev-muted">Up</span>
                  </label>
                  <label className="flex items-center gap-1.5" title="Border Down Color">
                    <input
                      type="color"
                      value={draft.symbol.borderDownColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          symbol: { ...d.symbol, borderDownColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    <span className="text-micro text-ev-muted">Down</span>
                  </label>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={true}
                    readOnly
                    className="accent-ev-accent"
                  />
                  <span>Wick</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5" title="Wick Up Color">
                    <input
                      type="color"
                      value={draft.symbol.wickUpColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          symbol: { ...d.symbol, wickUpColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    <span className="text-micro text-ev-muted">Up</span>
                  </label>
                  <label className="flex items-center gap-1.5" title="Wick Down Color">
                    <input
                      type="color"
                      value={draft.symbol.wickDownColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          symbol: { ...d.symbol, wickDownColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    <span className="text-micro text-ev-muted">Down</span>
                  </label>
                </div>
              </div>

              <div className="my-3 border-t border-ev-raised" />

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.symbol.colorBarsBasedOnPrevClose}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      symbol: { ...d.symbol, colorBarsBasedOnPrevClose: e.target.checked },
                    }))
                  }
                  className="accent-ev-accent"
                />
                <span>Color bars based on previous close</span>
              </label>

              <div className="my-3 border-t border-ev-raised" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Precision</span>
                  <select
                    value={draft.symbol.precision}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        symbol: { ...d.symbol, precision: e.target.value },
                      }))
                    }
                    className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  >
                    <option value="default">Default</option>
                    <option value="1/10">1/10 (0.1)</option>
                    <option value="1/100">1/100 (0.01)</option>
                    <option value="1/1000">1/1000 (0.001)</option>
                    <option value="1/10000">1/10000 (0.0001)</option>
                    <option value="1/100000">1/100000 (0.00001)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span>Timezone</span>
                  <select
                    value={draft.symbol.timezone}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        symbol: { ...d.symbol, timezone: e.target.value },
                      }))
                    }
                    className="max-w-[280px] rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.id} value={tz.id}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "status_line" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">Instrument</div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.showLogo}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, showLogo: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Logo</span>
                </label>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={true}
                      readOnly
                      className="accent-ev-accent"
                    />
                    <span>Title</span>
                  </label>
                  <select
                    value={draft.statusLine.titleMode}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: {
                          ...d.statusLine,
                          titleMode: e.target.value as "both" | "ticker" | "description",
                        },
                      }))
                    }
                    className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  >
                    <option value="both">Ticker and description</option>
                    <option value="ticker">Ticker only</option>
                    <option value="description">Description only</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.showOpenMarketStatus}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, showOpenMarketStatus: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Open market status</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.showOhlc}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, showOhlc: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>OHLC values</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.showBarChange}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, showBarChange: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Bar change values</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.showVolume}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, showVolume: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Volume</span>
                </label>
              </div>

              <div className="my-3 border-t border-ev-raised" />

              <div className="font-semibold text-ev-strong">Indicators</div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.indicatorTitles}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, indicatorTitles: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Titles</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.indicatorArguments}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, indicatorArguments: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Arguments / Inputs</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.indicatorValues}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, indicatorValues: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Values</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.statusLine.indicatorBackground}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        statusLine: { ...d.statusLine, indicatorBackground: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Background</span>
                </label>
              </div>

              <div className="my-3 border-t border-ev-raised" />

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.statusLine.showBuySellButtons}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      statusLine: { ...d.statusLine, showBuySellButtons: e.target.checked },
                    }))
                  }
                  className="accent-ev-accent"
                />
                <span>Buy / Sell quick buttons</span>
              </label>
            </div>
          )}

          {activeTab === "scales" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">Price Scale Labels</div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.symbolNameLabel}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, symbolNameLabel: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Symbol name label</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.symbolLastPriceLabel}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, symbolLastPriceLabel: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Symbol last value label</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.highLowPriceLabels}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, highLowPriceLabels: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>High and low price labels</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.averageClosePriceLabel}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, averageClosePriceLabel: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Average close price label</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.countdownToBarClose}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, countdownToBarClose: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Countdown to bar close</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.plusButton}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, plusButton: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Plus button on price axis</span>
                </label>
              </div>

              <div className="my-3 border-t border-ev-raised" />

              <div className="font-semibold text-ev-strong">Scale Modes & Lines</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Price scale mode</span>
                  <select
                    value={draft.scales.priceScaleMode}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: {
                          ...d.scales,
                          priceScaleMode: e.target.value as PriceScaleModeName,
                        },
                      }))
                    }
                    className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  >
                    <option value="normal">Normal (Linear)</option>
                    <option value="log">Logarithmic</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.scales.invertScale}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, invertScale: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Invert scale</span>
                </label>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.scales.scalesLines}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          scales: { ...d.scales, scalesLines: e.target.checked },
                        }))
                      }
                      className="accent-ev-accent"
                    />
                    <span>Scales border lines</span>
                  </label>
                  <input
                    type="color"
                    value={draft.scales.scalesLinesColor}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        scales: { ...d.scales, scalesLinesColor: e.target.value },
                      }))
                    }
                    className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "canvas" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">Background & Grids</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Background</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={draft.canvas.backgroundType}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canvas: {
                            ...d.canvas,
                            backgroundType: e.target.value as "solid" | "gradient",
                          },
                        }))
                      }
                      className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                    >
                      <option value="solid">Solid</option>
                      <option value="gradient">Gradient</option>
                    </select>
                    <input
                      type="color"
                      value={draft.canvas.backgroundColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canvas: { ...d.canvas, backgroundColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                    {draft.canvas.backgroundType === "gradient" && (
                      <input
                        type="color"
                        value={draft.canvas.backgroundGradientColor}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            canvas: { ...d.canvas, backgroundGradientColor: e.target.value },
                          }))
                        }
                        className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.canvas.vertGridLines}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canvas: { ...d.canvas, vertGridLines: e.target.checked },
                        }))
                      }
                      className="accent-ev-accent"
                    />
                    <span>Vert grid lines</span>
                  </label>
                  <input
                    type="color"
                    value={draft.canvas.vertGridColor}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, vertGridColor: e.target.value },
                      }))
                    }
                    className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.canvas.horzGridLines}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canvas: { ...d.canvas, horzGridLines: e.target.checked },
                        }))
                      }
                      className="accent-ev-accent"
                    />
                    <span>Horz grid lines</span>
                  </label>
                  <input
                    type="color"
                    value={draft.canvas.horzGridColor}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, horzGridColor: e.target.value },
                      }))
                    }
                    className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span>Crosshair</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={draft.canvas.crosshairStyle}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canvas: {
                            ...d.canvas,
                            crosshairStyle: e.target.value as "dashed" | "dotted" | "solid",
                          },
                        }))
                      }
                      className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                    >
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                      <option value="solid">Solid</option>
                    </select>
                    <input
                      type="color"
                      value={draft.canvas.crosshairColor}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canvas: { ...d.canvas, crosshairColor: e.target.value },
                        }))
                      }
                      className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.canvas.watermark}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, watermark: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Watermark (Symbol & interval)</span>
                </label>

                <div className="flex items-center justify-between">
                  <span>Scales font size</span>
                  <select
                    value={draft.canvas.scalesFontSize}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, scalesFontSize: Number(e.target.value) },
                      }))
                    }
                    className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  >
                    {[10, 11, 12, 14, 16].map((s) => (
                      <option key={s} value={s}>
                        {s} px
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="my-3 border-t border-ev-raised" />

              <div className="font-semibold text-ev-strong">Margins</div>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-micro text-ev-muted">Top (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={draft.canvas.topMarginPct}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, topMarginPct: Number(e.target.value) },
                      }))
                    }
                    className="w-full rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-micro text-ev-muted">Bottom (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={draft.canvas.bottomMarginPct}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, bottomMarginPct: Number(e.target.value) },
                      }))
                    }
                    className="w-full rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-micro text-ev-muted">Right (bars)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.canvas.rightMarginBars}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        canvas: { ...d.canvas, rightMarginBars: Number(e.target.value) },
                      }))
                    }
                    className="w-full rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === "trading" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">General Trading Appearance</div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trading.showPositions}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trading: { ...d.trading, showPositions: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Positions on chart</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trading.showOrders}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trading: { ...d.trading, showOrders: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Orders on chart</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trading.showExecutions}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trading: { ...d.trading, showExecutions: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Executions (historical fill markers)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trading.extendedPriceLine}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trading: { ...d.trading, extendedPriceLine: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Extended price lines for positions & orders</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trading.instantOrders}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trading: { ...d.trading, instantOrders: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Instant order placement (skip confirmation modal)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trading.soundOnExecution}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trading: { ...d.trading, soundOnExecution: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Play sound on order execution</span>
                </label>
              </div>

              <div className="my-3 border-t border-ev-raised" />

              <div className="flex items-center justify-between">
                <span>Profit & Loss display</span>
                <select
                  value={draft.trading.pnlDisplay}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      trading: {
                        ...d.trading,
                        pnlDisplay: e.target.value as "money" | "percent" | "ticks",
                      },
                    }))
                  }
                  className="rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
                >
                  <option value="money">Money (USD)</option>
                  <option value="percent">Percentage (%)</option>
                  <option value="ticks">Ticks / Pips</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === "alerts" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">Chart Alerts</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.alerts.alertLines}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          alerts: { ...d.alerts, alertLines: e.target.checked },
                        }))
                      }
                      className="accent-ev-accent"
                    />
                    <span>Alert lines on chart</span>
                  </label>
                  <input
                    type="color"
                    value={draft.alerts.alertLineColor}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        alerts: { ...d.alerts, alertLineColor: e.target.value },
                      }))
                    }
                    className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.alerts.playSound}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        alerts: { ...d.alerts, playSound: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Play sound on alert trigger</span>
                </label>

                <div className="flex items-center justify-between">
                  <span>Sound volume</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft.alerts.soundVolume}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          alerts: { ...d.alerts, soundVolume: Number(e.target.value) },
                        }))
                      }
                      className="w-28 accent-ev-accent"
                    />
                    <span className="w-8 text-right text-micro text-ev-muted">
                      {draft.alerts.soundVolume}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "events" && (
            <div className="space-y-4">
              <div className="font-semibold text-ev-strong">Market Events & Breaks</div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.events.showSessionBreaks}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        events: { ...d.events, showSessionBreaks: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Session breaks (vertical line separating days)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.events.showEconomicEvents}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        events: { ...d.events, showEconomicEvents: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>Economic events on chart</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.events.showNewsHeadlines}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        events: { ...d.events, showNewsHeadlines: e.target.checked },
                      }))
                    }
                    className="accent-ev-accent"
                  />
                  <span>News headlines & marks</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog Footer */}
      <div className="flex items-center justify-between border-t border-ev-raised px-5 py-3">
        {/* Template Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setTemplateMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded border border-ev-line bg-ev-panel px-3 py-1.5 text-dense font-medium text-ev-text hover:border-ev-dim hover:text-ev-strong"
          >
            <span>Template</span>
            <ChevronDown size={14} aria-hidden />
          </button>

          {templateMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-ev-line bg-ev-panel py-1 shadow-xl z-20"
            >
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-dense text-ev-text hover:bg-ev-raised hover:text-ev-strong"
              >
                <RotateCcw size={13} aria-hidden />
                <span>Apply Defaults</span>
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-1.5 text-dense font-medium text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded bg-ev-accent px-5 py-1.5 text-dense font-medium text-white hover:bg-ev-accent-hover"
          >
            Ok
          </button>
        </div>
      </div>
    </Modal>
  );
}
