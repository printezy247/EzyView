import { describe, expect, it } from "vitest";
import { matchCommands, toCommands } from "./CommandPalette";

const noop = () => {};

const groups = [
  {
    title: "View",
    entries: [
      { kind: "label" as const, id: "l", label: "Panels" },
      { kind: "toggle" as const, id: "watchlist", label: "Watchlist", checked: true, onSelect: noop },
      { kind: "separator" as const, id: "s" },
      { kind: "radio" as const, id: "dark", label: "Dark theme", selected: false, onSelect: noop },
    ],
  },
  {
    title: "Analysis",
    entries: [
      { kind: "action" as const, id: "opt", label: "Options chain", onSelect: noop },
      { kind: "action" as const, id: "off", label: "Disabled thing", disabled: true, onSelect: noop },
    ],
  },
];

describe("command palette", () => {
  it("flattens runnable entries and drops headings, dividers and disabled items", () => {
    const commands = toCommands(groups);
    expect(commands.map((c) => c.label)).toEqual(["Watchlist", "Dark theme", "Options chain"]);
    expect(commands[0]!.on).toBe(true);
  });

  it("matches every query word against group and label, in any order", () => {
    const commands = toCommands(groups);
    expect(matchCommands(commands, "").length).toBe(3);
    expect(matchCommands(commands, "theme dark").map((c) => c.label)).toEqual(["Dark theme"]);
    expect(matchCommands(commands, "analysis").map((c) => c.label)).toEqual(["Options chain"]);
    expect(matchCommands(commands, "zzz")).toEqual([]);
  });
});
