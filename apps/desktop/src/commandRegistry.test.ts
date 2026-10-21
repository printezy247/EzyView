import { describe, expect, it } from "vitest";

import { buildNavCommands, commandCount, flattenGroups } from "./commandRegistry";
import type { CommandGroup } from "./commandRegistry";

/**
 * The command registry is the one place a feature is declared, so the toolbar
 * menus, the Ctrl+K palette and the nav flyouts can never list different
 * things. These tests pin the flattening rules (headings/disabled rows drop
 * out) and the nav commands.
 */

const group = (title: string, entries: CommandGroup["entries"]): CommandGroup => ({ title, entries });

describe("flattenGroups", () => {
  it("drops labels, separators and disabled actions", () => {
    const groups = [
      group("A", [
        { kind: "label", id: "l", label: "Heading" },
        { kind: "action", id: "ok", label: "Do it", onSelect: () => {} },
        { kind: "action", id: "no", label: "Nope", disabled: true, onSelect: () => {} },
        { kind: "separator", id: "s" },
        { kind: "toggle", id: "t", label: "Toggle", checked: true, onSelect: () => {} },
        { kind: "radio", id: "r", label: "Pick", selected: false, onSelect: () => {} },
      ]),
    ];
    const out = flattenGroups(groups);
    expect(out.map((c) => c.id)).toEqual(["ok", "t", "r"]);
  });

  it("carries the group title and the on/selected state onto each command", () => {
    const groups = [
      group("Interval", [
        { kind: "radio", id: "1h", label: "1 hour", selected: true, onSelect: () => {} },
      ]),
    ];
    const [cmd] = flattenGroups(groups);
    expect(cmd!.group).toBe("Interval");
    expect(cmd!.on).toBe(true);
    expect(cmd!.key).toBe("Interval:1h");
  });

  it("counts what the palette will actually show", () => {
    const groups = [
      group("A", [
        { kind: "label", id: "l", label: "H" },
        { kind: "action", id: "a", label: "A", onSelect: () => {} },
      ]),
    ];
    expect(commandCount(groups)).toBe(1);
  });
});

describe("buildNavCommands", () => {
  it("produces one command per section, each labelled and described", () => {
    const commands = buildNavCommands();
    expect(commands.length).toBe(8);
    for (const c of commands) {
      expect(c.group).toBe("Go to");
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.hint?.length ?? 0).toBeGreaterThan(10);
      expect(typeof c.run).toBe("function");
    }
  });

  it("runs a navigate call with the section's path", () => {
    const seen: string[] = [];
    const commands = buildNavCommands((to) => seen.push(to));
    commands[0]!.run();
    expect(seen[0]).toBe("/chart");
  });
});
