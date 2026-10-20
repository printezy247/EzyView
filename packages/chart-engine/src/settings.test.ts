import { describe, expect, it } from "vitest";
import { CrosshairMode, PriceScaleMode, TickMarkType, type UTCTimestamp } from "lightweight-charts";
import { crosshairModeOf, priceScaleModeOf, timezoneFormatters } from "./settings.js";

describe("crosshairModeOf", () => {
  it("maps names to LWC enums", () => {
    expect(crosshairModeOf("normal")).toBe(CrosshairMode.Normal);
    expect(crosshairModeOf("magnet")).toBe(CrosshairMode.Magnet);
    expect(crosshairModeOf("hidden")).toBe(CrosshairMode.Hidden);
  });

  it("falls back to normal for unknown input", () => {
    expect(crosshairModeOf(undefined)).toBe(CrosshairMode.Normal);
    expect(crosshairModeOf("nope" as never)).toBe(CrosshairMode.Normal);
  });
});

describe("priceScaleModeOf", () => {
  it("maps names to LWC enums", () => {
    expect(priceScaleModeOf("normal")).toBe(PriceScaleMode.Normal);
    expect(priceScaleModeOf("log")).toBe(PriceScaleMode.Logarithmic);
    expect(priceScaleModeOf("percentage")).toBe(PriceScaleMode.Percentage);
  });

  it("falls back to normal for unknown input", () => {
    expect(priceScaleModeOf(undefined)).toBe(PriceScaleMode.Normal);
  });
});

describe("timezoneFormatters", () => {
  // 2026-01-15 12:00:00 UTC.
  const noon = 1768478400 as UTCTimestamp;

  it("falls back to LWC-default-equivalent formatters for a null, empty or rejected zone", () => {
    for (const tz of [null, undefined, "", "not/a/zone"]) {
      const f = timezoneFormatters(tz);
      // null tick strings hand control back to LWC's own formatter.
      expect(f.tickMarkFormatter(noon, TickMarkType.Time, "en-US")).toBeNull();
      // Crosshair label keeps the default shape: `dd MMM 'yy   HH:mm` in UTC.
      expect(f.timeFormatter!(noon)).toBe("15 Jan '26   12:00");
    }
  });

  it("formats the crosshair label in the requested zone", () => {
    const { timeFormatter } = timezoneFormatters("Asia/Tokyo");
    expect(timeFormatter).toBeDefined();
    // 12:00 UTC = 21:00 JST the same day.
    expect(timeFormatter!(noon)).toBe("Jan 15, 2026, 21:00");
  });

  it("varies tick marks by tick-mark type", () => {
    const { tickMarkFormatter } = timezoneFormatters("UTC");
    expect(tickMarkFormatter).toBeDefined();
    expect(tickMarkFormatter!(noon, TickMarkType.Year, "en-US")).toBe("2026");
    expect(tickMarkFormatter!(noon, TickMarkType.Month, "en-US")).toBe("Jan 2026");
    expect(tickMarkFormatter!(noon, TickMarkType.DayOfMonth, "en-US")).toBe("Jan 15");
    expect(tickMarkFormatter!(noon, TickMarkType.Time, "en-US")).toBe("12:00");
    expect(tickMarkFormatter!(noon, TickMarkType.TimeWithSeconds, "en-US")).toBe("12:00:00");
  });

  it("shifts the date when the zone crosses midnight", () => {
    const { tickMarkFormatter } = timezoneFormatters("Asia/Tokyo");
    // 2026-01-15 20:00 UTC = 2026-01-16 05:00 JST.
    const evening = 1768507200 as UTCTimestamp;
    expect(tickMarkFormatter!(evening, TickMarkType.DayOfMonth, "en-US")).toBe("Jan 16");
  });
});
