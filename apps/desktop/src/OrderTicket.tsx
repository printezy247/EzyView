import { useEffect, useRef, useState } from "react";
import type { OrderRequest, OrderSide, OrderType } from "@ezyview/data-adapters";
import { tickerOf } from "./data";
import { precisionForSymbol } from "./pricePrecision";
import { useQuote } from "./quotePoller";
import { activeChartOf } from "./layout";
import { useMt5 } from "./mt5";
import { SourceWarning } from "./SourceWarning";
import { useWorkspace } from "./store";
import { useOrderDraft } from "./orderDraft";
import { useTrading } from "./trading";
import { calculateRiskReward, getContractMultiplier, riskQty } from "./tradeMath";
import { Button, NumberInput, SegmentedControl } from "./ui";

interface Props {
  symbol: string;
}

const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "limit", label: "Limit" },
  { id: "stop", label: "Stop" },
];

/**
 * Order ticket for the active symbol.
 *
 * Everything submits through the same `TradingAdapter.placeOrder` the live
 * brokers in P5 will use, so switching the source does not change this form.
 */
export function OrderTicket({ symbol }: Props) {
  const submit = useTrading((s) => s.submit);
  const source = useMt5((s) => s.source);
  const chartSource = useWorkspace((s) => activeChartOf(s.activeLayout()).dataSource);
  const tradeMode = useTrading((s) => s.account?.tradeMode);
  const error = useTrading((s) => s.error);
  const note = useTrading((s) => s.note);
  const clearError = useTrading((s) => s.clearError);
  const account = useTrading((s) => s.account);
  const maxLeverage = useTrading((s) => s.account?.leverage ?? 100);

  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [qty, setQty] = useState<number | null>(1);
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  const [last, setLast] = useState<number | null>(null);

  /** Screen-reader confirmation of the last order sent. */
  const [notice, setNotice] = useState("");
  // A different symbol is a different instrument: stale prices and levels
  // from the old one must not carry into an order for the new one.
  useEffect(() => {
    setLimitPrice(null);
    setStopLoss(null);
    setTakeProfit(null);
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
    setLimitPrice(draft.price.trim() === "" ? null : Number(draft.price));
    if (draft.stopLoss !== undefined) setStopLoss(draft.stopLoss.trim() === "" ? null : Number(draft.stopLoss));
    if (draft.takeProfit !== undefined) setTakeProfit(draft.takeProfit.trim() === "" ? null : Number(draft.takeProfit));
    // Consume it, so reopening the panel later does not replay an old draft.
    useOrderDraft.setState({ draft: null });
    // Keyed on the sequence so a repeated identical draft still applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.seq]);
  const [sending, setSending] = useState(false);
  /** Synchronous in-flight guard: state alone lets a fast double click send twice. */
  const inFlight = useRef(false);

  // The shared per-symbol poller supplies the reference price. Market orders
  // fill at the engine's own last tick, so this is display and sizing only.
  const { quote } = useQuote(symbol, { intervalMs: 2000 });
  useEffect(() => {
    if (!quote) return;
    setLast(quote.last);
    setLimitPrice((current) => (current === null ? quote.last : current));
  }, [quote, symbol]);

  const precision = precisionForSymbol(symbol, last);
  const ticker = tickerOf(symbol);

  // An empty field is not a price: null stays disabled instead of sending a
  // live order at zero and filling a sell limit against any quote.
  const limitValue = limitPrice;
  const workingPrice = type === "market" ? last : limitValue;
  const quantity = qty ?? NaN;
  const value = workingPrice !== null && Number.isFinite(workingPrice) ? workingPrice * quantity : null;
  const margin = value !== null ? value / maxLeverage : null;
  const stopValue = stopLoss ?? undefined;
  const targetValue = takeProfit ?? undefined;
  const levelsValid =
    (stopValue === undefined || (Number.isFinite(stopValue) && stopValue > 0)) &&
    (targetValue === undefined || (Number.isFinite(targetValue) && targetValue > 0));
  const ready =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    workingPrice !== null &&
    Number.isFinite(workingPrice) &&
    (workingPrice as number) > 0 &&
    levelsValid &&
    !sending;

  const multiplier = getContractMultiplier(symbol);
  const rr = calculateRiskReward({
    side,
    entry: workingPrice ?? last ?? 0,
    stop: stopValue,
    target: targetValue,
  });

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
      maxQty: entry > 0 ? (equity * maxLeverage) / (entry * multiplier) : 0,
      contractMultiplier: multiplier,
    });
    if (qtyOut === null) {
      setNotice("Enter a valid stop loss on the correct side of the entry price to size by risk.");
      return;
    }
    setQty(qtyOut >= 10 ? Math.round(qtyOut) : Number(qtyOut.toFixed(2)));
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
        <Button
          variant={side === "buy" ? "solid" : "ghost"}
          onClick={() => setSide("buy")}
          aria-pressed={side === "buy"}
          className={side === "buy" ? "bg-ev-up-solid hover:bg-ev-up" : undefined}
        >
          Buy
        </Button>
        <Button
          variant={side === "sell" ? "solid" : "ghost"}
          onClick={() => setSide("sell")}
          aria-pressed={side === "sell"}
          className={side === "sell" ? "bg-ev-down-solid hover:bg-ev-down" : undefined}
        >
          Sell
        </Button>
      </div>

      <SegmentedControl
        label="Order type"
        value={type}
        onChange={(v) => setType(v as OrderType)}
        options={ORDER_TYPES.map((o) => ({ value: o.id, label: o.label }))}
      />

      <div>
        <div className="flex items-center justify-between">
          <span className="block text-dense uppercase tracking-wider text-ev-muted">Quantity</span>
          <div className="flex items-center gap-1 text-[11px] text-ev-muted">
            <span>Risk:</span>
            {[1, 2, 5].map((pct) => (
              <Button key={pct} variant="outline" size="sm" onClick={() => calcRiskQty(pct)} aria-label={`Size by ${pct} percent risk`}>
                {pct}%
              </Button>
            ))}
          </div>
        </div>
        <NumberInput label="Quantity" value={qty} min={0} onValueChange={setQty} className="mt-1" />
      </div>

      {type !== "market" && (
        <NumberInput
          label={type === "limit" ? "Limit price" : "Stop price"}
          value={limitPrice}
          min={0}
          onValueChange={setLimitPrice}
          placeholder={last === null ? "—" : last.toFixed(precision)}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Stop loss" value={stopLoss} min={0} onValueChange={setStopLoss} placeholder="off" />
        <NumberInput label="Take profit" value={takeProfit} min={0} onValueChange={setTakeProfit} placeholder="off" />
      </div>

      <dl className="space-y-1 border-t border-ev-raised pt-2 text-dense">
        <Row label="Reference" value={last === null ? "—" : last.toFixed(precision)} />
        {multiplier > 1 && (
          <Row
            label="Contract size"
            value={`${multiplier.toLocaleString()} / lot`}
          />
        )}
        <Row
          label="Value"
          value={value === null ? "—" : (value * multiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
        <Row
          label={`Margin @ ${maxLeverage}×`}
          value={margin === null ? "—" : (margin * multiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
        {rr.ratio !== null && (
          <div className="flex items-center justify-between pt-1">
            <dt className="text-ev-muted">Risk : Reward</dt>
            <dd className="flex items-center gap-1 font-medium">
              <span className="text-ev-strong">1 : {rr.ratio.toFixed(2)}</span>
              {rr.ratio < 1.5 ? (
                <span className="rounded bg-ev-down/20 px-1 py-0.5 text-[10px] text-ev-down-text font-semibold">
                  &lt; 1:1.5
                </span>
              ) : (
                <span className="rounded bg-ev-up/20 px-1 py-0.5 text-[10px] text-ev-up-text font-semibold">
                  Good
                </span>
              )}
            </dd>
          </div>
        )}
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

      <Button
        onClick={() => {
          clearError();
          void send();
        }}
        disabled={!ready}
        aria-label={`${side === "buy" ? "Buy" : "Sell"} ${type === "market" ? "at market" : type}`}
        className={side === "buy" ? "bg-ev-up-solid hover:bg-ev-up" : "bg-ev-down-solid hover:bg-ev-down"}
      >
        {side === "buy" ? "Buy" : "Sell"} {type === "market" ? "at market" : type}
      </Button>

      <SourceWarning source={chartSource} />

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
