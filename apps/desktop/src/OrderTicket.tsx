import { useEffect, useRef, useState } from "react";
import type { OrderRequest, OrderSide, OrderType } from "@ezyview/data-adapters";
import { precisionFor, quoteOf, tickerOf } from "./data";
import { useMt5 } from "./mt5";
import { useOrderDraft } from "./orderDraft";
import { useTrading } from "./trading";
import { riskQty } from "./tradeMath";

interface Props {
  symbol: string;
}

const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "limit", label: "Limit" },
  { id: "stop", label: "Stop" },
];

const INPUT =
  "w-full rounded bg-ev-panel px-2 py-1 text-base text-ev-strong outline-none placeholder:text-ev-faint focus:ring-1 focus:ring-ev-accent";
const LABEL = "block text-dense uppercase tracking-wider text-ev-muted";

/**
 * Order ticket for the active symbol.
 *
 * Everything submits through the same `TradingAdapter.placeOrder` the live
 * brokers in P5 will use, so switching the source does not change this form.
 */
export function OrderTicket({ symbol }: Props) {
  const submit = useTrading((s) => s.submit);
  const source = useMt5((s) => s.source);
  const tradeMode = useTrading((s) => s.account?.tradeMode);
  const error = useTrading((s) => s.error);
  const note = useTrading((s) => s.note);
  const clearError = useTrading((s) => s.clearError);
  const account = useTrading((s) => s.account);
  const maxLeverage = useTrading((s) => s.account?.leverage ?? 100);

  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [qty, setQty] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [last, setLast] = useState<number | null>(null);

  /** Screen-reader confirmation of the last order sent. */
  const [notice, setNotice] = useState("");
  // A different symbol is a different instrument: stale prices and levels
  // from the old one must not carry into an order for the new one.
  useEffect(() => {
    setLimitPrice("");
    setStopLoss("");
    setTakeProfit("");
    setNotice("");
    setLast(null);
  }, [symbol]);

  // A prefilled order from the chart's right-click menu. The form is the
  // user's: this only loads side/type/price, it never sends anything.
  const draft = useOrderDraft((d) => d.draft);
  useEffect(() => {
    if (!draft || draft.symbol !== symbol) return;
    setSide(draft.side);
    setType(draft.type);
    setLimitPrice(draft.price);
    // Consume it, so reopening the panel later does not replay an old draft.
    useOrderDraft.setState({ draft: null });
    // Keyed on the sequence so a repeated identical draft still applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.seq]);
  const [sending, setSending] = useState(false);
  /** Synchronous in-flight guard: state alone lets a fast double click send twice. */
  const inFlight = useRef(false);

  // Poll for the reference price. Market orders fill at the engine's own last
  // tick, so this is display and sizing only — never the fill price itself.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void quoteOf(symbol).then((quote) => {
        if (cancelled || !quote) return;
        setLast(quote.last);
        setLimitPrice((current) => (current === "" ? quote.last.toFixed(precisionFor(quote.last)) : current));
      });
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  const precision = precisionFor(last);
  const ticker = tickerOf(symbol);

  // An empty field is not a price: `Number("")` is 0, which would send a live
  // order at zero and fill a sell limit against any quote.
  const limitValue = limitPrice.trim() === "" ? null : Number(limitPrice);
  const workingPrice = type === "market" ? last : limitValue;
  const quantity = Number(qty);
  const value = workingPrice !== null && Number.isFinite(workingPrice) ? workingPrice * quantity : null;
  const margin = value !== null ? value / maxLeverage : null;
  const stopValue = stopLoss.trim() === "" ? undefined : Number(stopLoss);
  const targetValue = takeProfit.trim() === "" ? undefined : Number(takeProfit);
  const levelsValid =
    (stopValue === undefined || (Number.isFinite(stopValue) && stopValue > 0)) &&
    (targetValue === undefined || (Number.isFinite(targetValue) && targetValue > 0));
  const ready =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    workingPrice !== null &&
    Number.isFinite(workingPrice) &&
    workingPrice > 0 &&
    levelsValid &&
    !sending;

  const calcRiskQty = (riskPct: number) => {
    const equity = account?.equity ?? account?.balance ?? 10_000;
    const entry = workingPrice ?? last ?? 0;
    const qtyOut = riskQty({
      equity,
      entry,
      stop: stopValue,
      side,
      riskPct,
      // Never size beyond what the account's leverage could carry.
      maxQty: entry > 0 ? (equity * maxLeverage) / entry : 0,
    });
    if (qtyOut === null) {
      setNotice("Enter a valid stop loss on the correct side of the entry price to size by risk.");
      return;
    }
    setQty(qtyOut >= 10 ? Math.round(qtyOut).toString() : qtyOut.toFixed(2));
  };

  const send = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const request: OrderRequest = {
      symbol,
      side,
      type,
      qty: quantity,
      // The engine reads `price` for both limit and stop triggers.
      ...(type === "market" ? {} : { price: limitValue ?? undefined }),
      ...(stopValue !== undefined ? { stopLoss: stopValue } : {}),
      ...(targetValue !== undefined ? { takeProfit: targetValue } : {}),
    };
    let ok = false;
    try {
      ok = await submit(request);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
    if (ok) setNotice(`${side === "buy" ? "Buy" : "Sell"} ${type} order for ${quantity} ${ticker} sent.`);
    else if (useTrading.getState().pending)
      setNotice(`${side === "buy" ? "Buy" : "Sell"} ${type} order for ${quantity} ${ticker} — awaiting confirmation.`);
  };

  return (
    <div className="flex min-h-0 w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-ev-raised px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold uppercase tracking-wider text-ev-muted">Order</h2>
        <span className="text-dense text-ev-faint">{ticker}</span>
      </div>

      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Order side">
        <button
          type="button"
          onClick={() => setSide("buy")}
          aria-pressed={side === "buy"}
          className={
            side === "buy"
              ? "rounded bg-ev-up-solid py-1.5 text-base font-semibold text-white"
              : "rounded bg-ev-panel py-1.5 text-base font-medium text-ev-muted hover:text-ev-strong"
          }
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          aria-pressed={side === "sell"}
          className={
            side === "sell"
              ? "rounded bg-ev-down-solid py-1.5 text-base font-semibold text-white"
              : "rounded bg-ev-panel py-1.5 text-base font-medium text-ev-muted hover:text-ev-strong"
          }
        >
          Sell
        </button>
      </div>

      <div>
        <span className={LABEL}>Type</span>
        <div className="mt-1 flex gap-1" role="group" aria-label="Order type">
          {ORDER_TYPES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setType(o.id)}
              aria-pressed={type === o.id}
              className={
                type === o.id
                  ? "flex-1 rounded bg-ev-raised px-1 py-1 text-base font-medium text-ev-strong"
                  : "flex-1 rounded px-1 py-1 text-base text-ev-muted hover:text-ev-strong"
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className={LABEL} htmlFor="order-qty">
            Quantity
          </label>
          <div className="flex items-center gap-1 text-[11px] text-ev-muted">
            <span>Risk:</span>
            {[1, 2, 5].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => calcRiskQty(pct)}
                className="rounded border border-ev-line bg-ev-panel px-1 py-px hover:border-ev-dim hover:text-ev-strong cursor-pointer"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
        <input
          id="order-qty"
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={`${INPUT} mt-1`}
        />
      </div>

      {type !== "market" && (
        <div>
          <label className={LABEL} htmlFor="order-price">
            {type === "limit" ? "Limit price" : "Stop price"}
          </label>
          <input
            id="order-price"
            inputMode="decimal"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={last === null ? "—" : last.toFixed(precision)}
            className={`${INPUT} mt-1`}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL} htmlFor="order-sl">
            Stop loss
          </label>
          <input
            id="order-sl"
            inputMode="decimal"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="off"
            className={`${INPUT} mt-1`}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="order-tp">
            Take profit
          </label>
          <input
            id="order-tp"
            inputMode="decimal"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder="off"
            className={`${INPUT} mt-1`}
          />
        </div>
      </div>

      <dl className="space-y-1 border-t border-ev-raised pt-2 text-dense">
        <Row label="Reference" value={last === null ? "—" : last.toFixed(precision)} />
        <Row label="Value" value={value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        <Row
          label={`Margin @ ${maxLeverage}×`}
          value={margin === null ? "—" : margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
      </dl>

      {!levelsValid && (
        <p role="alert" className="rounded border border-ev-down/40 bg-ev-down/10 px-2 py-1.5 text-dense text-ev-down-text">
          Stop loss and take profit must be positive numbers.
        </p>
      )}
      {type !== "market" && !ready && limitValue === null && (
        <p role="alert" className="rounded border border-ev-down/40 bg-ev-down/10 px-2 py-1.5 text-dense text-ev-down-text">
          Enter a {type === "limit" ? "limit" : "stop"} price above zero.
        </p>
      )}

      <p role="status" className="sr-only">
        {notice}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded border border-ev-down/40 bg-ev-down/10 px-2 py-1.5 text-dense leading-snug text-ev-down-text"
        >
          {error}
        </p>
      )}
      {note && !error && (
        <p role="status" className="rounded border border-ev-line bg-ev-raised/40 px-2 py-1.5 text-dense leading-snug text-ev-muted">
          {note}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          clearError();
          void send();
        }}
        disabled={!ready}
        className={`rounded py-2 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "buy" ? "bg-ev-up-solid hover:bg-ev-up" : "bg-ev-down-solid hover:bg-ev-down"
        }`}
      >
        {side === "buy" ? "Buy" : "Sell"} {type === "market" ? "at market" : type}
      </button>

      <p className="text-dense leading-relaxed text-ev-faint">
        {source === "mt5"
          ? `Broker order — sent straight to MT5 (${tradeMode === "real" ? "REAL money" : "demo account"}).`
          : "Paper account — virtual funds, no real order reaches a venue."}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ev-muted">{label}</dt>
      <dd className="num text-ev-text">{value}</dd>
    </div>
  );
}
