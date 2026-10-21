/**
 * The chart's right-click menu, as data. One pure builder turns "what is under
 * the cursor and what state the app is in" into `MenuEntry` rows; the
 * component only renders them. Submenus are flattened into labelled sections
 * (the shared menu has no nesting) and empty sections are left out.
 */
import { tickerOf } from "./data";
import type { EventOptions } from "./eventOptions";
import type { MenuEntry } from "./Menu";

export type EventSwitchKey = "earnings" | "economic" | "high" | "medium" | "low";

export interface ChartMenuActions {
  resetView(): void;
  copyPrice(): void;
  paste(): void;
  addAlert(): void;
  sellLimit(): void;
  buyStop(): void;
  addOrder(): void;
  toggleCursorLock(): void;
  openTable(): void;
  toggleObjectTree(): void;
  saveTemplate(): void;
  applyTemplate(id: string): void;
  deleteTemplate(id: string): void;
  removeIndicator(uid: string): void;
  toggleEvent(key: EventSwitchKey): void;
  openSettings(): void;
  openLinkGroup(): void;
}

export interface ChartMenuContext {
  symbol: string;
  /** Price under the cursor when the menu opened. */
  price: number;
  /** Decimals to show for prices. */
  precision: number;
  /** Order items appear only while the MT5 source is active. */
  mt5: boolean;
  hasClipboard: boolean;
  cursorLocked: boolean;
  objectTreeOpen: boolean;
  indicators: { uid: string; name: string }[];
  templates: { id: string; name: string }[];
  eventOptions: EventOptions;
  /** The focused cell's link group, or null when it is on its own. */
  linkGroup: string | null;
  actions: ChartMenuActions;
}

const EVENT_ROWS: { key: EventSwitchKey; label: string }[] = [
  { key: "earnings", label: "Earnings" },
  { key: "economic", label: "Economic events" },
  { key: "high", label: "High impact" },
  { key: "medium", label: "Medium impact" },
  { key: "low", label: "Low impact" },
];

const eventOn = (o: EventOptions, key: EventSwitchKey): boolean =>
  key === "earnings" ? o.earnings : key === "economic" ? o.economic : o.impacts[key];

const sep = (id: string): MenuEntry => ({ kind: "separator", id });
const action = (id: string, label: string, onSelect: () => void, extra: { hint?: string; disabled?: boolean } = {}): MenuEntry => ({
  kind: "action",
  id,
  label,
  onSelect,
  ...extra,
});

export function buildChartMenu(c: ChartMenuContext): MenuEntry[] {
  const a = c.actions;
  const ticker = tickerOf(c.symbol);
  const p = c.price.toLocaleString("en-US", { minimumFractionDigits: c.precision, maximumFractionDigits: c.precision });
  const out: MenuEntry[] = [
    action("reset", "Reset chart view", a.resetView),
    sep("s1"),
    action("copy-price", `Copy price ${p}`, a.copyPrice),
    action("paste", "Paste", a.paste, { hint: "Ctrl+V", disabled: !c.hasClipboard }),
    sep("s2"),
    action("add-alert", `Add alert on ${ticker} at ${p}`, a.addAlert),
  ];

  if (c.mt5) {
    out.push(
      action("sell-limit", `Sell ${ticker} @ ${p} limit`, a.sellLimit),
      action("buy-stop", `Buy ${ticker} @ ${p} stop`, a.buyStop),
      action("add-order", `Add order on ${ticker} at ${p}…`, a.addOrder),
    );
  }

  out.push(
    sep("s3"),
    action("cursor-lock", c.cursorLocked ? "Unlock vertical cursor line" : "Lock vertical cursor line by time", a.toggleCursorLock),
    sep("s4"),
    action("table", "Table view", a.openTable),
    { kind: "toggle", id: "object-tree", label: "Object tree", checked: c.objectTreeOpen, onSelect: a.toggleObjectTree },
    action("link-group", c.linkGroup ? `Link group “${c.linkGroup}”…` : "Link to a group…", a.openLinkGroup),
    sep("s5"),
    { kind: "label", id: "templates-label", label: "Chart template" },
    action("save-template", "Save current chart as template…", a.saveTemplate),
  );
  for (const t of c.templates) {
    out.push(
      action(`template-${t.id}`, `Apply “${t.name}”`, () => a.applyTemplate(t.id)),
      action(`template-del-${t.id}`, `Delete “${t.name}”`, () => a.deleteTemplate(t.id)),
    );
  }

  if (c.indicators.length > 0) {
    out.push(sep("s6"), { kind: "label", id: "indicators-label", label: "Indicators" });
    for (const i of c.indicators) out.push(action(`remove-ind-${i.uid}`, `Remove ${i.name}`, () => a.removeIndicator(i.uid)));
  }

  out.push(sep("s7"), { kind: "label", id: "events-label", label: "Events" });
  for (const row of EVENT_ROWS) {
    out.push({ kind: "toggle", id: `event-${row.key}`, label: row.label, checked: eventOn(c.eventOptions, row.key), onSelect: () => a.toggleEvent(row.key) });
  }

  out.push(sep("s8"), action("settings", "Settings…", a.openSettings));
  return out;
}
