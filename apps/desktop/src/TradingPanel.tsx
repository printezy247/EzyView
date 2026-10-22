import { useState } from "react";
import type { ReactNode } from "react";
import { precisionFor } from "./data";
import { OrderTicket } from "./OrderTicket";
import { useMt5 } from "./mt5";
import { useTrading } from "./trading";

interface Props {
  symbol: string;
}

type Tab = "positions" | "orders" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "history", label: "Trade history" },
];

const money = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pnlClass = (value: number): string => (value >= 0 ? "text-ev-up" : "text-ev-down");

const signed = (value: number): string => `${value >= 0 ? "+" : ""}${money(value)}`;

const clock = (epoch: number): string => new Date(epoch * 1000).toLocaleTimeString();

/**
 * Bottom trading panel: order ticket on the left, account exposure on the right.
 *
 * Account, positions, orders and deals all come from one store refresh, so the
 * rows always agree with each other even while a fill is in flight.
 */
export function TradingPanel({ symbol }: Props) {
  const [tab, setTab] = useState<Tab>("positions");
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const account = useTrading((s) => s.account);
  const positions = useTrading((s) => s.positions);
  const orders = useTrading((s) => s.orders);
  const deals = useTrading((s) => s.deals);
  const close = useTrading((s) => s.close);
  const closeAll = useTrading((s) => s.closeAll);
  const submit = useTrading((s) => s.submit);
  const cancel = useTrading((s) => s.cancel);
  const reset = useTrading((s) => s.reset);
  const source = useMt5((s) => s.source);

  const realized = deals.reduce((sum, d) => sum + d.pnl, 0);
  const openPositions = positions.length;
  // Format off the position on this chart, falling back to any other price the
  // panel happens to know about before settling on two decimals.
  const sample =
    positions.find((p) => p.symbol === symbol)?.markPrice ??
    positions[0]?.markPrice ??
    deals[0]?.price ??
    null;
  const precision = precisionFor(sample);

  const heightClass = minimized ? "h-8" : expanded ? "h-80" : "h-56";

  return (
    <section aria-label="Trading" className={`flex ${heightClass} shrink-0 flex-col border-t border-ev-raised bg-ev-bg transition-[height] duration-150`}>
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-ev-raised bg-ev-chrome px-3 text-dense">
        <button
          type="button"
          title={minimized ? "Expand trading panel" : "Minimize trading panel to summary strip"}
          onClick={() => setMinimized((v) => !v)}
          className="flex items-center gap-1 font-semibold uppercase tracking-wider text-ev-muted hover:text-ev-strong"
        >
          <span>{minimized ? "▴" : "▾"}</span>
          <span>Trading</span>
        </button>

        <dl className="flex items-center gap-3 num">
          <Fact label="Balance" value={account ? money(account.balance) : "—"} />
          <Fact label="Equity" value={account ? money(account.equity) : "—"} />
          <Fact label="Margin" value={account ? money(account.margin) : "—"} />
          <Fact label="Free" value={account ? money(account.freeMargin) : "—"} />
          <Fact
            label="Realized"
            value={account ? signed(realized) : "—"}
            tone={realized === 0 ? undefined : pnlClass(realized)}
          />
        </dl>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-ev-faint">{openPositions} open</span>
          <button
            type="button"
            onClick={() => void closeAll()}
            disabled={openPositions === 0}
            className="rounded px-2 py-0.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong disabled:opacity-40"
          >
            Close all
          </button>
          {source === "ezyview" && (
            <button
              type="button"
              title="Reset the paper account to its starting balance"
              onClick={() => void reset()}
              className="rounded px-2 py-0.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            >
              Reset
            </button>
          )}
          {source === "mt5" && (
            <span className="rounded bg-ev-accent/15 px-1.5 py-0.5 text-dense text-ev-accent-text">broker</span>
          )}
          <button
            type="button"
            title={expanded ? "Restore standard panel height" : "Maximize trading panel height"}
            onClick={() => {
              setMinimized(false);
              setExpanded((v) => !v);
            }}
            className="rounded px-1.5 py-0.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            {expanded ? "⤡" : "⤢"}
          </button>
          <button
            type="button"
            title={minimized ? "Expand trading panel" : "Minimize trading panel"}
            onClick={() => setMinimized((v) => !v)}
            className="rounded px-1.5 py-0.5 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            {minimized ? "Expand" : "Minimize"}
          </button>
        </div>
      </header>

      {!minimized && (
      <div className="flex min-h-0 flex-1">
        <OrderTicket symbol={symbol} />

        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="flex h-7 shrink-0 items-center gap-1 border-b border-ev-raised px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? "border-b-2 border-ev-accent px-2 py-1 text-dense font-medium text-ev-strong"
                    : "border-b-2 border-transparent px-2 py-1 text-dense text-ev-muted hover:text-ev-strong"
                }
              >
                {t.label}
                {t.id === "positions" && openPositions > 0 && (
                  <span className="ml-1 rounded bg-ev-accent px-1 text-dense text-white">{openPositions}</span>
                )}
                {t.id === "orders" && orders.length > 0 && (
                  <span className="ml-1 rounded bg-ev-dim px-1 text-dense text-ev-strong">{orders.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto">
            {tab === "positions" && (
              <Table
                head={["Symbol", "Side", "Qty", "Entry", "Mark", "P&L", "Margin", ""]}
                empty="No open positions. Send an order from the ticket."
                rows={positions.map((p) => ({
                  key: `${p.symbol}:${p.side}`,
                  cells: [
                    <span className="font-medium text-ev-strong">{p.symbol}</span>,
                    <span className={p.side === "long" ? "text-ev-up" : "text-ev-down"}>
                      {p.side.toUpperCase()}
                    </span>,
                    <span className="num">{fmtQty(p.qty)}</span>,
                    <span className="num">{p.entryPrice.toFixed(precision)}</span>,
                    <span className="num">{p.markPrice.toFixed(precision)}</span>,
                    <span className={`num ${pnlClass(p.unrealizedPnl)}`}>{signed(p.unrealizedPnl)}</span>,
                    <span className="num text-ev-muted">
                      {p.margin === undefined ? "—" : money(p.margin)}
                    </span>,
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Close 50% of position"
                        onClick={() => void close(p.symbol, Number((p.qty / 2).toFixed(4)) || p.qty)}
                        className="rounded border border-ev-line px-1.5 py-0.5 text-dense text-ev-muted hover:border-ev-accent hover:text-ev-strong"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        title="Reverse position direction"
                        onClick={() => {
                          void (async () => {
                            await close(p.symbol);
                            // On MT5 the close parks at the confirmation gate, so
                            // the reverse has to wait for the trader to confirm
                            // that close first - otherwise the two orders race
                            // and the position is doubled instead of reversed.
                            if (useTrading.getState().pending) return;
                            await submit({
                              symbol: p.symbol,
                              side: p.side === "long" ? "sell" : "buy",
                              type: "market",
                              qty: p.qty,
                            });
                          })();
                        }}
                        className="rounded border border-ev-line px-1.5 py-0.5 text-dense text-ev-muted hover:border-ev-accent hover:text-ev-strong"
                      >
                        Rev
                      </button>
                      <button
                        type="button"
                        onClick={() => void close(p.symbol)}
                        className="rounded border border-ev-line px-1.5 py-0.5 text-dense text-ev-muted hover:border-ev-down hover:text-ev-down"
                      >
                        Close
                      </button>
                      {p.stopLoss !== undefined && (
                        <span className="rounded border border-ev-down/40 px-1.5 py-0.5 text-dense text-ev-down">
                          SL {p.stopLoss.toFixed(precision)}
                        </span>
                      )}
                      {p.takeProfit !== undefined && (
                        <span className="rounded border border-ev-up/40 px-1.5 py-0.5 text-dense text-ev-up">
                          TP {p.takeProfit.toFixed(precision)}
                        </span>
                      )}
                    </div>,
                  ],
                }))}
              />
            )}

            {tab === "orders" && (
              <Table
                head={["Symbol", "Side", "Type", "Qty", "Price", "Placed", ""]}
                empty="No working orders."
                rows={orders.map((o) => ({
                  key: o.id,
                  cells: [
                    <span className="font-medium text-ev-strong">{o.symbol}</span>,
                    <span className={o.side === "buy" ? "text-ev-up" : "text-ev-down"}>
                      {o.side.toUpperCase()}
                    </span>,
                    <span className="uppercase text-ev-text">{o.type}</span>,
                    <span className="num">{fmtQty(o.qty)}</span>,
                    <span className="num">{o.price?.toFixed(precision) ?? "market"}</span>,
                    <span className="num text-ev-muted">{clock(o.time)}</span>,
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void cancel(o.id)}
                        className="rounded border border-ev-line px-1.5 py-0.5 text-dense text-ev-muted hover:border-ev-down hover:text-ev-down"
                      >
                        Cancel
                      </button>
                    </div>,
                  ],
                }))}
              />
            )}

            {tab === "history" && (
              <Table
                head={["Time", "Symbol", "Side", "Qty", "Price", "Realized P&L"]}
                empty="Nothing traded yet."
                rows={[...deals]
                  .sort((a, b) => b.time - a.time)
                  .map((d) => ({
                    key: d.id,
                    cells: [
                      <span className="num text-ev-muted">{clock(d.time)}</span>,
                      <span className="font-medium text-ev-strong">{d.symbol}</span>,
                      <span className={d.side === "buy" ? "text-ev-up" : "text-ev-down"}>
                        {d.side.toUpperCase()}
                      </span>,
                      <span className="num">{fmtQty(d.qty)}</span>,
                      <span className="num">{d.price.toFixed(precision)}</span>,
                      <span className={`num ${pnlClass(d.pnl)}`}>{signed(d.pnl)}</span>,
                    ],
                  }))}
              />
            )}
          </div>
        </div>
      </div>
      )}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-ev-faint">{label}</dt>
      <dd className={tone ?? "text-ev-text"}>{value}</dd>
    </div>
  );
}

/** Avoid `1.0000000000000002` rows for whole-unit quantities. */
function fmtQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

interface Row {
  key: string;
  cells: ReactNode[];
}

function Table({ head, rows, empty }: { head: string[]; rows: Row[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-base text-ev-faint">{empty}</p>;
  }
  return (
    <table className="w-full border-collapse text-dense">
      <thead className="sticky top-0 bg-ev-bg">
        <tr className="text-dense uppercase tracking-wider text-ev-faint">
          {head.map((label) => (
            <th scope="col" key={label} className="border-b border-ev-raised px-3 py-1.5 text-left font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-ev-panel hover:bg-ev-panel/60">
            {row.cells.map((cell, i) => (
              <td key={i} className="px-3 py-1.5 text-ev-text">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
