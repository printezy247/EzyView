import { useState } from "react";
import { X, ChevronDown, RotateCcw } from "lucide-react";
import { Modal } from "./Modal";
import { SymbolSettingsTab } from "./settings-tabs/SymbolSettingsTab";
import { StatusLineSettingsTab } from "./settings-tabs/StatusLineSettingsTab";
import { ScalesSettingsTab } from "./settings-tabs/ScalesSettingsTab";
import { CanvasSettingsTab } from "./settings-tabs/CanvasSettingsTab";
import { TradingSettingsTab } from "./settings-tabs/TradingSettingsTab";
import { AlertsSettingsTab } from "./settings-tabs/AlertsSettingsTab";
import { EventsSettingsTab } from "./settings-tabs/EventsSettingsTab";
import { useWorkspace } from "./store";
import { DEFAULT_CHART_SETTINGS } from "./layout";
import type { ChartSettings } from "./layout";

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
      vertGridLines: chart.showVertGrid ?? chart.chartSettings?.canvas.vertGridLines ?? chart.showGrid,
      horzGridLines: chart.showHorzGrid ?? chart.chartSettings?.canvas.horzGridLines ?? chart.showGrid,
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
      showVertGrid: draft.canvas.vertGridLines,
      showHorzGrid: draft.canvas.horzGridLines,
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
          {activeTab === "symbol" && <SymbolSettingsTab draft={draft} setDraft={setDraft} />}

          {activeTab === "status_line" && <StatusLineSettingsTab draft={draft} setDraft={setDraft} />}

          {activeTab === "scales" && <ScalesSettingsTab draft={draft} setDraft={setDraft} />}

          {activeTab === "canvas" && <CanvasSettingsTab draft={draft} setDraft={setDraft} />}

          {activeTab === "trading" && <TradingSettingsTab draft={draft} setDraft={setDraft} />}

          {activeTab === "alerts" && <AlertsSettingsTab draft={draft} setDraft={setDraft} />}

          {activeTab === "events" && <EventsSettingsTab draft={draft} setDraft={setDraft} />}
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
