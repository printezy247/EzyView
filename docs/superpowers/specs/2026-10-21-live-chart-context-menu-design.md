# Live candles, TradingView-style chart menu and bottom bar — design

Date: 2026-10-21 · Owner: printezy247 · Status: awaiting approval

## Why

Jack runs v0.2.0 and wants the chart to behave like TradingView:
- the chart is frozen after load (only panels use live quotes), so MT5/demo prices look dead;
- the chart has no right-click menu (reset view, copy price, alert/order at price, templates...);
- the Events overlay is one blunt on/off button and crowds the chart.

## Goals

1. **Live candles** — the last candle updates every 1 s from `quoteOf` (demo and MT5); a new candle opens when a bar period starts. Paused during replay.
2. **Right-click menu** on the chart, TradingView-style, acting on the price/time under the cursor.
3. **Bottom bar** under the chart, as in TradingView, every control with a hover description:
   - range presets `1D 5D 1M 3M 6M YTD 1Y 5Y All` (set the visible range; loads more history, up to 5000 bars, when the range needs it);
   - Go to date (jump the chart to a typed date);
   - live clock with the chart's timezone;
   - price-scale toggles Auto / Log / %;
   - Events switches: Earnings, Economic events, High/Medium/Low impact. Same options in Settings → Appearance. Default: High impact only, earnings on.

## Non-goals

- No streaming sockets (polling only). No new data providers. No order placement from the menu (it only prefills the ticket).
- Top toolbar redesign, Publish, layout-name save, left toolbar changes (EzyView already has drawing tools, magnet, lock, hide).
- Not a full chart-settings dialog (TradingView's). "Settings…" opens Settings → Appearance.

## Right-click menu contents

| Item | Behaviour |
| --- | --- |
| Reset chart view | fit all bars on screen |
| Copy price *p* | clipboard (falls back like other copies) |
| Paste | pastes the copied drawing with its first anchor at the cursor (disabled when nothing copied) |
| Add alert on *SYM* at *p* | creates a crossing alert at *p* |
| Sell limit / Buy stop / Add order at *p* | **only while the MT5 source is active**; fills the order ticket (type + price), user still presses Buy/Sell; existing safety rails apply |
| Lock / Unlock vertical cursor line | my call: drops a vertical line (named "Cursor lock") at the clicked time; unlock removes it |
| Table view | modal list of the visible bars (time, OHLCV), newest first, capped at 500 rows, CSV button |
| Object tree | toggles the panel |
| Chart template ▸ | Save current as…, apply a saved one, delete; stores indicators + chart type + volume/grid/theme/scale settings |
| Remove *n* indicator(s) ▸ | one entry per indicator |
| Events ▸ | the same switches as the bottom bar |
| Settings… | Settings → Appearance |

Ctrl+C copies the selected drawing; Ctrl+V pastes it at the last cursor position.

## Decisions

- Menu entries are built by one pure function (`buildChartMenu(ctx)`), tested without a DOM; a thin component renders them with the existing `MenuEntry` styling, closes on Esc / outside click, flips to stay on screen.
- Live bars: pure `mergeQuote(bars, quote, stepSeconds)` (update last bar, or append a new one on a new period, ignore stale/zero quotes); `ChartHost` polls once a second and feeds `setData`.
- Events: store option `eventOptions {earnings, economic, impacts{high,medium,low}}` replaces `showEvents` (old saves migrate: on → earnings + economic, high only). `fundamentalOverlays` gains an exact-impact set option next to `minImpact`.
- Order prefill goes through a small `orderDraft` store the ticket reads (ticket state is local today).
- Chart templates and the drawing clipboard live in the persisted workspace store (new optional fields, old saves load).

## Tasks (TDD, one commit each, one branch/PR)

1. `liveBars.ts` + `ChartHost` 1 s polling.
2. Bottom bar: range presets, go to date, clock/timezone, scale toggles, Events switches (store + migration + impact filter) + Settings section + tooltips.
3. Drawing clipboard (copy/paste, Ctrl+C/V) and chart templates in the store.
4. `buildChartMenu` + context menu component + `ChartHost` right-click wiring + order draft + lock line + reset view + copy price + add alert + remove indicator.
5. Table view modal.
6. Gates, browser smoke test, MASTERPLAN note, PR, CI, merge.

## Left to the builder

Exact tooltip wording, menu positioning details, range-to-bar mapping per interval, template naming UI, how the bottom bar looks at narrow widths.

## Known limits (stated up front)

- Bar-count alert conditions still evaluate per poll.
- "Lock cursor line" is a pinned line, not TradingView's moving-cursor lock.
- A 5Y range on a 1-minute chart is clamped to the 5000-bar history cap (TradingView would switch interval).
- Live updates are 1 s polls: MT5 sees one quote call per second per visible symbol.
