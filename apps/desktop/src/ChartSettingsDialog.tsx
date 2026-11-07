import { useRef, useState } from "react";
import { RotateCcw, ChevronDown } from "lucide-react";
import { Dialog, Button, IconButton } from "./ui";
import { SymbolSettingsTab } from "./settings-tabs/SymbolSettingsTab";
import { StatusLineSettingsTab } from "./settings-tabs/StatusLineSettingsTab";
import { ScalesSettingsTab } from "./settings-tabs/ScalesSettingsTab";
import { CanvasSettingsTab } from "./settings-tabs/CanvasSettingsTab";
import { TradingSettingsTab } from "./settings-tabs/TradingSettingsTab";
import { AlertsSettingsTab } from "./settings-tabs/AlertsSettingsTab";
import { EventsSettingsTab } from "./settings-tabs/EventsSettingsTab";
import { useWorkspace } from "./store";
import { useActiveChart } from "./store/selectors";
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
  // Only the settings fields the draft is built from. A whole-chart
  // subscription re-rendered the dialog on every drawing drag.
  const {
    chartSettings,
    timezone,
    priceScale,
    invertScale,
    watermark,
    showVertGrid,
    showHorzGrid,
    showGrid,
    showSessionBreaks,
  } = useActiveChart((c) => ({
    chartSettings: c.chartSettings,
    timezone: c.timezone,
    priceScale: c.priceScale,
    invertScale: c.invertScale,
    watermark: c.watermark,
    showVertGrid: c.showVertGrid,
    showHorzGrid: c.showHorzGrid,
    showGrid: c.showGrid,
    showSessionBreaks: c.showSessionBreaks,
  }));
  const updateActive = useWorkspace((s) => s.updateActive);

  // Active tab selection
  const [activeTab, setActiveTab] = useState<TabId>("symbol");
  const tabListRef = useRef<HTMLDivElement>(null);

  // Local draft of settings; initialized from chart state or defaults
  const [draft, setDraft] = useState<ChartSettings>(() => ({
    ...DEFAULT_CHART_SETTINGS,
    ...chartSettings,
    symbol: {
      ...DEFAULT_CHART_SETTINGS.symbol,
      ...chartSettings?.symbol,
      timezone: timezone ?? DEFAULT_CHART_SETTINGS.symbol.timezone,
    },
    scales: {
      ...DEFAULT_CHART_SETTINGS.scales,
      ...chartSettings?.scales,
      priceScaleMode: priceScale ?? DEFAULT_CHART_SETTINGS.scales.priceScaleMode,
      invertScale: invertScale ?? DEFAULT_CHART_SETTINGS.scales.invertScale,
    },
    canvas: {
      ...DEFAULT_CHART_SETTINGS.canvas,
      ...chartSettings?.canvas,
      watermark: watermark ?? DEFAULT_CHART_SETTINGS.canvas.watermark,
      vertGridLines: showVertGrid ?? chartSettings?.canvas.vertGridLines ?? showGrid,
      horzGridLines: showHorzGrid ?? chartSettings?.canvas.horzGridLines ?? showGrid,
    },
    events: {
      ...DEFAULT_CHART_SETTINGS.events,
      ...chartSettings?.events,
      showSessionBreaks: showSessionBreaks ?? DEFAULT_CHART_SETTINGS.events.showSessionBreaks,
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

  const focusTab = (index: number) => {
    tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[index]?.focus();
  };

  const moveTab = (delta: 1 | -1) => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    const next = TABS[(idx + delta + TABS.length) % TABS.length]!;
    setActiveTab(next.id);
    queueMicrotask(() => focusTab(TABS.indexOf(next)));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Chart settings"
      description="Appearance, scales, trading overlays and event markers."
      size="xl"
      className="h-[36rem]"
      actions={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" size="md" onClick={handleApply}>
            Ok
          </Button>
        </>
      }
    >
      {/* Dialog Main Content (Tabs Sidebar + Tab Panel) */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar Tabs — roving tabindex, arrows move selection (WAI-ARIA tabs). */}
        <div
          ref={tabListRef}
          className="w-44 shrink-0 border-r border-ev-raised bg-ev-panel/40 p-2"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Chart settings sections"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
              e.preventDefault();
              moveTab(1);
            } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
              e.preventDefault();
              moveTab(-1);
            } else if (e.key === "Home") {
              e.preventDefault();
              setActiveTab(TABS[0]!.id);
              queueMicrotask(() => focusTab(0));
            } else if (e.key === "End") {
              e.preventDefault();
              setActiveTab(TABS[TABS.length - 1]!.id);
              queueMicrotask(() => focusTab(TABS.length - 1));
            }
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
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

      {/* Dialog Footer template menu */}
      <div className="flex items-center gap-2 border-t border-ev-raised px-5 py-3">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={templateMenuOpen}
            onClick={() => setTemplateMenuOpen((v) => !v)}
          >
            <span>Template</span>
            <ChevronDown size={14} aria-hidden />
          </Button>

          {templateMenuOpen && (
            <div
              role="menu"
              aria-label="Chart template"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-ev-line bg-ev-panel py-1 shadow-xl z-20"
            >
              <Button
                variant="ghost"
                size="sm"
                role="menuitem"
                onClick={handleResetDefaults}
                className="w-full justify-start"
              >
                <RotateCcw size={13} aria-hidden />
                <span>Apply Defaults</span>
              </Button>
            </div>
          )}
        </div>
        <span className="ml-auto text-dense text-ev-faint">Use Cancel/Ok above to discard or apply.</span>
        <IconButton label="Reset to defaults" size="sm" onClick={handleResetDefaults} className="ml-1">
          <RotateCcw size={13} aria-hidden />
        </IconButton>
      </div>
    </Dialog>
  );
}
