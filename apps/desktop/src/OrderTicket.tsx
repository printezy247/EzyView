import { useEffect, useState } from "react";
import type { OrderRequest, OrderSide, OrderType } from "@ezyview/data-adapters";
import { precisionFor, quoteOf, tickerOf } from "./data";
import { useMt5 } from "./mt5";
import { useTrading } from "./trading";

interface Props {
  symbol: string;
}

const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "limit", label: "Limit" },
  { id: "stop", label: "Stop" },
];

const INPUT =
  "w-full rounded bg-[#131722] px-2 py-1 text-xs text-white outline-none placeholder:text-[#434651] focus:ring-1 focus:ring-[#2962ff]";
const LABEL = "block text-[10px] uppercase tracking-wider text-[#787b86]";

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
  const clearError = useTrading((s) => s.clearError);
  const maxLeverage = useTrading((s) => s.account?.leverage ?? 100);

  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [qty, setQty] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [last, setLast] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

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

  const workingPrice = type === "market" ? last : Number(limitPrice);
  const quantity = Number(qty);
  const value = workingPrice !== null && Number.isFinite(workingPrice) ? workingPrice * quantity : null;
  const margin = value !== null ? value / maxLeverage : null;
  const ready = Number.isFinite(quantity) && quantity > 0 && workingPrice !== null && !sending;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    const request: OrderRequest = {
      symbol,
      side,
      type,
      qty: quantity,
      // The engine reads `price` for both limit and stop triggers.
      ...(type === "market" ? {} : { price: Number(limitPrice) }),
      ...(stopLoss.trim() ? { stopLoss: Number(stopLoss) } : {}),
      ...(takeProfit.trim() ? { takeProfit: Number(takeProfit) } : {}),
    };
    await submit(request);
    setSending(false);
  };

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 border-r border-[#1e222d] px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#787b86]">Order</h2>
        <span className="text-[10px] text-[#434651]">{ticker}</span>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={
            side === "buy"
              ? "rounded bg-[#26a69a] py-1.5 text-xs font-semibold text-white"
              : "rounded bg-[#131722] py-1.5 text-xs font-medium text-[#787b86] hover:text-white"
          }
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={
            side === "sell"
              ? "rounded bg-[#ef5350] py-1.5 text-xs font-semibold text-white"
              : "rounded bg-[#131722] py-1.5 text-xs font-medium text-[#787b86] hover:text-white"
          }
        >
          Sell
        </button>
      </div>

      <div>
        <span className={LABEL}>Type</span>
        <div className="mt-1 flex gap-1">
          {ORDER_TYPES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setType(o.id)}
              className={
                type === o.id
                  ? "flex-1 rounded bg-[#1e222d] px-1 py-1 text-xs font-medium text-white"
                  : "flex-1 rounded px-1 py-1 text-xs text-[#787b86] hover:text-white"
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="order-qty">
          Quantity
        </label>
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

      <dl className="space-y-1 border-t border-[#1e222d] pt-2 text-[11px]">
        <Row label="Reference" value={last === null ? "—" : last.toFixed(precision)} />
        <Row label="Value" value={value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        <Row
          label={`Margin @ ${maxLeverage}×`}
          value={margin === null ? "—" : margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
      </dl>

      {error && (
        <p className="rounded border border-[#ef5350]/40 bg-[#ef5350]/10 px-2 py-1.5 text-[11px] leading-snug text-[#ef5350]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          clearError();
          void send();
        }}
        disabled={!ready}
        className={`rounded py-2 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "buy" ? "bg-[#26a69a] hover:bg-[#2bab9d]" : "bg-[#ef5350] hover:bg-[#f06060]"
        }`}
      >
        {side === "buy" ? "Buy" : "Sell"} {type === "market" ? "at market" : type}
      </button>

      <p className="text-[10px] leading-relaxed text-[#434651]">
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
      <dt className="text-[#787b86]">{label}</dt>
      <dd className="tabular-nums text-[#d1d4dc]">{value}</dd>
    </div>
  );
}
