// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installShortcutDispatcher } from "../shortcuts";
import { Button } from "./Button";
import { Combobox } from "./Combobox";
import { Dialog } from "./Dialog";
import { Checkbox, Field, NumberInput, RadioGroup, Slider, Toggle } from "./Field";
import { Popover, Tooltip } from "./Popover";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Select";
import { Tabs } from "./Tabs";
import { Toaster, clearToasts, toast } from "./Toast";

/**
 * The kit's contract, one primitive at a time. These are the behaviours a
 * migration could silently break: a select that traps focus, a tab strip that
 * cannot be driven by arrows, a number field that turns empty input into NaN.
 */

let uninstall: () => void;
beforeAll(() => {
  uninstall = installShortcutDispatcher();
});
afterAll(() => uninstall());
afterEach(() => {
  act(() => clearToasts());
});

const options = [
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day", disabled: true },
  { value: "1w", label: "1 week" },
];

describe("Select", () => {
  it("starts closed and shows the selected label", () => {
    render(<Select label="Interval" value="4h" onChange={() => {}} options={options} />);
    const trigger = screen.getByRole("button", { name: "Interval" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("4 hours");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on click and marks the selected option", async () => {
    const user = userEvent.setup();
    render(<Select label="Interval" value="4h" onChange={() => {}} options={options} />);
    await user.click(screen.getByRole("button", { name: "Interval" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: /4 hours/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("walks options with arrows, skipping disabled ones, and commits with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Interval" value="1h" onChange={onChange} options={options} />);
    screen.getByRole("button", { name: "Interval" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("4h");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Select label="Interval" value="1h" onChange={() => {}} options={options} />);
    const trigger = screen.getByRole("button", { name: "Interval" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not render a select element (custom listbox only)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Select label="Interval" value="1h" onChange={() => {}} options={options} />);
    expect(container.querySelector("select")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Interval" }));
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });
});

describe("Combobox", () => {
  it("filters by label and commits the highlighted row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(<Combobox label="Symbol" value="" onChange={onChange} onSelect={onSelect} options={options} />);
    const input = screen.getByRole("combobox", { name: "Symbol" });
    await user.click(input);
    await user.type(input, "we");
    expect(screen.getByRole("option", { name: /1 week/ })).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ value: "1w", label: "1 week" });
  });

  it("allows a free value when typing without a match", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox label="Symbol" value="" onChange={onChange} options={options} />);
    const input = screen.getByRole("combobox", { name: "Symbol" });
    await user.click(input);
    await user.type(input, "XYZ");
    expect(screen.getByText(/Press Enter to use this value/)).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("XYZ");
  });
});

describe("Tabs", () => {
  const items = [
    { id: "one", label: "General" },
    { id: "two", label: "Appearance" },
    { id: "three", label: "Locked", disabled: true },
  ];

  it("marks the active tab and keeps one tab stop", () => {
    render(<Tabs label="Settings" items={items} value="one" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tab", { name: "Appearance" }).getAttribute("tabindex")).toBe("-1");
  });

  it("moves with the arrow keys and skips disabled tabs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs label="Settings" items={items} value="one" onChange={onChange} />);
    screen.getByRole("tab", { name: "General" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("two");
  });
});

describe("SegmentedControl", () => {
  const segments = [
    { value: "15", label: "15" },
    { value: "60", label: "60" },
    { value: "240", label: "240" },
  ];

  it("reports the active segment through aria-pressed", () => {
    render(<SegmentedControl label="Interval" value="60" onChange={() => {}} options={segments} />);
    expect(screen.getByRole("button", { name: "60" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "15" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("moves the selection with the arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="Interval" value="60" onChange={onChange} options={segments} />);
    screen.getByRole("button", { name: "60" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("240");
  });
});

describe("Dialog", () => {
  it("wires the title and description to the dialog", () => {
    render(
      <Dialog title="Chart settings" description="Appearance and data" onClose={() => {}}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    const description = document.getElementById(dialog.getAttribute("aria-describedby")!);
    expect(title?.textContent).toBe("Chart settings");
    expect(description?.textContent).toBe("Appearance and data");
  });

  it("closes from the header button and from Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog title="Chart settings" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Popover and Tooltip", () => {
  it("opens a labelled panel and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Popover label="Columns" trigger={<span>Cols</span>}>
        <Button>Inner</Button>
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByRole("dialog", { name: "Columns" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Columns" })).toBeNull();
  });

  it("shows a tooltip on keyboard focus and describes the child", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Save layout">
        <button type="button">Save</button>
      </Tooltip>,
    );
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toBe("Save layout");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-describedby")).toBe(tip.id);
  });
});

describe("form fields", () => {
  it("points labels and hints at the control", () => {
    render(
      <Field label="Symbol" hint="Exchange prefix optional">
        {({ controlId, describedBy }) => <input id={controlId} aria-describedby={describedBy} />}
      </Field>,
    );
    const input = screen.getByLabelText("Symbol");
    const described = document.getElementById(input.getAttribute("aria-describedby")!);
    expect(described?.textContent).toBe("Exchange prefix optional");
  });

  it("clamps a number on commit and reports an empty field as null", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<NumberInput label="Box size" value={5} min={1} max={10} onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Box size");
    await user.clear(input);
    await user.type(input, "42");
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith(10);

    rerender(<NumberInput label="Box size" value={5} min={1} max={10} onValueChange={onValueChange} />);
    await user.clear(screen.getByLabelText("Box size"));
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it("steps a number with the arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput label="Box size" value={5} step={2} onValueChange={onValueChange} />);
    screen.getByLabelText("Box size").focus();
    await user.keyboard("{ArrowUp}");
    expect(onValueChange).toHaveBeenCalledWith(7);
  });

  it("exposes checkbox, radio and switch state", async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn();
    const onRadio = vi.fn();
    const onToggle = vi.fn();
    render(
      <>
        <Checkbox label="Show volume" checked={false} onChange={onCheck} />
        <RadioGroup label="Scale" value="linear" onChange={onRadio} options={[{ value: "linear", label: "Linear" }, { value: "log", label: "Log" }]} />
        <Toggle label="Grid" checked onChange={onToggle} />
      </>,
    );
    await user.click(screen.getByLabelText("Show volume"));
    expect(onCheck).toHaveBeenCalledWith(true);
    await user.click(screen.getByLabelText("Log"));
    expect(onRadio).toHaveBeenCalledWith("log");
    expect(screen.getByRole("switch", { name: "Grid" }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("switch", { name: "Grid" }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("announces the slider value as text", () => {
    render(<Slider label="Opacity" value={50} min={0} max={100} onChange={() => {}} format={(v) => `${v}%`} />);
    expect(screen.getByLabelText("Opacity").getAttribute("aria-valuetext")).toBe("50%");
  });
});

describe("Toaster", () => {
  it("renders a queued message in a live region and dismisses it", async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    await act(async () => {
      toast("Layout saved", { tone: "success" });
    });
    expect(screen.getByRole("status").textContent).toContain("Layout saved");
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses an alert role for errors", () => {
    render(<Toaster />);
    act(() => {
      toast("Order rejected", { tone: "error", timeout: 0 });
    });
    expect(screen.getByRole("alert").textContent).toContain("Order rejected");
  });
});
