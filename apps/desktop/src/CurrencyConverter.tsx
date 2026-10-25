import { useState } from "react";
import { convert, formatAmount, type Rates } from "./currency";
import { Input, Select } from "./ui";
import { tickerOf } from "./data";
import { useWorkspace } from "./store";

/**
 * Rate snapshot, quoted as USD per one unit — the same shape `currency.ts`
 * expects, so wiring a live FX provider later is a data change, not a rewrite.
 * There is no FX slot in `FundamentalsSources` today, and inventing a provider
 * call that cannot be honoured would be worse than a labelled snapshot.
 */
const RATES: Rates = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 152.5, CHF: 0.88, AUD: 1.52, CAD: 1.36, CNY: 7.24, INR: 83.3 };

const CURRENCIES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "Pound Sterling",
  JPY: "Japanese Yen",
  CHF: "Swiss Franc",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CNY: "Chinese Yuan",
  INR: "Indian Rupee",
};

const CODES = Object.keys(RATES);

const CURRENCY_OPTIONS = CODES.map((code) => ({ value: code, label: `${code} — ${CURRENCIES[code]}` }));

/** Currency converter over the bundled snapshot, with the active symbol as context. */
export function CurrencyConverter() {
  const symbol = useWorkspace((s) => s.activeLayout().charts[0]?.symbol ?? "");
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");

  const parsed = Number(amount);
  const result = Number.isFinite(parsed) ? convert(RATES, parsed, from, to) : null;
  const oneWay = convert(RATES, 1, from, to);
  const otherWay = convert(RATES, 1, to, from);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-body font-semibold text-ev-strong">Currency converter</h2>
        <span className="text-dense text-ev-faint">snapshot rates</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-dense text-ev-muted">
          Amount
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
            aria-label="Amount to convert"
          />
        </label>
        <div className="flex flex-col gap-1 text-dense text-ev-muted">
          <span aria-hidden>From</span>
          <Select label="Convert from currency" value={from} onChange={setFrom} options={CURRENCY_OPTIONS} className="w-48" />
        </div>
        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          title="Swap the two currencies"
          className="h-7 rounded border border-ev-line px-2 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          swap
        </button>
        <div className="flex flex-col gap-1 text-dense text-ev-muted">
          <span aria-hidden>To</span>
          <Select label="Convert to currency" value={to} onChange={setTo} options={CURRENCY_OPTIONS} className="w-48" />
        </div>
      </div>

      <div className="rounded border border-ev-line p-4">
        {result === null || oneWay === null || otherWay === null ? (
          <p className="text-base text-ev-faint">
            No rate for {from}/{to}.
          </p>
        ) : (
          <>
            <p className="num text-head font-semibold text-ev-strong">
              {formatAmount(result, 2)} <span className="text-title text-ev-muted">{to}</span>
            </p>
            <p className="num mt-1 text-dense text-ev-muted">
              1 {from} = {formatAmount(oneWay, 4)} {to} · 1 {to} = {formatAmount(otherWay, 4)} {from}
            </p>
          </>
        )}
      </div>

      <p className="text-dense text-ev-faint">
        Rates are a bundled snapshot quoted as USD per unit
        {symbol ? `; active chart symbol is ${tickerOf(symbol)}` : ""}.
      </p>
    </div>
  );
}
