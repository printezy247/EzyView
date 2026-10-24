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

/** Actions the drawing-specific section offers; one is wired per entry. */
export interface DrawingMenuActions {
  settings(): void;
  addAlert(): void;
  saveTemplate(): void;
  applyTemplate(id: string): void;
  clone(): void;
  copy(): void;
  toggleLock(): void;
  toggleHide(): void;
  move(to: "front" | "forward" | "backward" | "back"): void;
  remove(): void;
}

/** What the menu needs to know about the drawing under the cursor. */
export interface DrawingMenuContext {
  id: string;
  label: string;
  locked: boolean;
  hidden: boolean;
  hasAlert: boolean;
  /** A level alert can be placed (horizontal line/ray). */
  hasLevel: boolean;
  templates: { id: string; name: string }[];
  actions: DrawingMenuActions;
}

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
  /** Drawing under the cursor, when the menu was opened on one. */
  drawing?: DrawingMenuContext;
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
  const out: MenuEntry[] = [];

  // A right-click on a drawing is about that drawing first; the general chart
  // actions follow, so the menu never feels like it ignored the target.
  if (c.drawing) {
    const d = c.drawing;
    const da = d.actions;
    out.push(
      { kind: "label", id: "drawing-label", label: d.label },
      action("drawing-settings", "Settings…", da.settings, { hint: "Double-click" }),
      action("drawing-alert", d.hasAlert ? "Alert armed on this drawing" : "Add alert on drawing…", da.addAlert, {
        disabled: !d.hasLevel || d.hasAlert,
      }),
      action("drawing-save-template", "Save drawing as template…", da.saveTemplate),
    );
    for (const t of d.templates) {
      out.push(action(`drawing-tpl-${t.id}`, `Apply template “${t.name}”`, () => da.applyTemplate(t.id)));
    }
    out.push(
      action("drawing-clone", "Clone", da.clone, { hint: "Ctrl+D" }),
      action("drawing-copy", "Copy", da.copy, { hint: "Ctrl+C" }),
      action("drawing-lock", d.locked ? "Unlock" : "Lock", da.toggleLock),
      action("drawing-hide", d.hidden ? "Show" : "Hide", da.toggleHide),
      { kind: "label", id: "drawing-order-label", label: "Visual order" },
      action("drawing-front", "Bring to front", () => da.move("front")),
      action("drawing-forward", "Bring forward", () => da.move("forward")),
      action("drawing-backward", "Send backward", () => da.move("backward")),
      action("drawing-back", "Send to back", () => da.move("back")),
      action("drawing-remove", "Remove", da.remove, { hint: "Delete" }),
      sep("drawing-end"),
    );
  }

  out.push(
    action("reset", "Reset chart view", a.resetView),
    sep("s1"),
    action("copy-price", `Copy price ${p}`, a.copyPrice),
    action("paste", "Paste", a.paste, { hint: "Ctrl+V", disabled: !c.hasClipboard }),
    sep("s2"),
    action("add-alert", `Add alert on ${ticker} at ${p}`, a.addAlert),
  );

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
