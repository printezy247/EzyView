import { useState } from "react";
import type { ReactNode } from "react";
import { precisionFor } from "./data";
import { OrderTicket } from "./OrderTicket";
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

const pnlClass = (value: number): string => (value >= 0 ? "text-[#26a69a]" : "text-[#ef5350]");

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
  const account = useTrading((s) => s.account);
  const positions = useTrading((s) => s.positions);
  const orders = useTrading((s) => s.orders);
  const deals = useTrading((s) => s.deals);
  const close = useTrading((s) => s.close);
  const closeAll = useTrading((s) => s.closeAll);
  const cancel = useTrading((s) => s.cancel);
  const reset = useTrading((s) => s.reset);

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

  return (
    <section className="flex h-56 shrink-0 flex-col border-t border-[#1e222d] bg-[#0e1117]">
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-[#1e222d] px-3 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[#787b86]">Trading</span>

        <dl className="flex items-center gap-3 tabular-nums">
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
          <span className="text-[#434651]">{openPositions} open</span>
          <button
            type="button"
            onClick={() => void closeAll()}
            disabled={openPositions === 0}
            className="rounded px-2 py-0.5 text-[11px] text-[#787b86] hover:bg-[#1e222d] hover:text-white disabled:opacity-40"
          >
            Close all
          </button>
          <button
            type="button"
            title="Reset the paper account to its starting balance"
            onClick={() => void reset()}
            className="rounded px-2 py-0.5 text-[11px] text-[#787b86] hover:bg-[#1e222d] hover:text-white"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <OrderTicket symbol={symbol} />

        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="flex h-7 shrink-0 items-center gap-1 border-b border-[#1e222d] px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? "border-b-2 border-[#2962ff] px-2 py-1 text-[11px] font-medium text-white"
                    : "border-b-2 border-transparent px-2 py-1 text-[11px] text-[#787b86] hover:text-white"
                }
              >
                {t.label}
                {t.id === "positions" && openPositions > 0 && (
                  <span className="ml-1 rounded bg-[#2962ff] px-1 text-[10px] text-white">{openPositions}</span>
                )}
                {t.id === "orders" && orders.length > 0 && (
                  <span className="ml-1 rounded bg-[#434651] px-1 text-[10px] text-white">{orders.length}</span>
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
                  key: p.symbol,
                  cells: [
                    <span className="font-medium text-white">{p.symbol}</span>,
                    <span className={p.side === "long" ? "text-[#26a69a]" : "text-[#ef5350]"}>
                      {p.side.toUpperCase()}
                    </span>,
                    <span className="tabular-nums">{fmtQty(p.qty)}</span>,
                    <span className="tabular-nums">{p.entryPrice.toFixed(precision)}</span>,
                    <span className="tabular-nums">{p.markPrice.toFixed(precision)}</span>,
                    <span className={`tabular-nums ${pnlClass(p.unrealizedPnl)}`}>{signed(p.unrealizedPnl)}</span>,
                    <span className="tabular-nums text-[#787b86]">{money(p.margin)}</span>,
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void close(p.symbol)}
                        className="rounded border border-[#2a2e39] px-1.5 py-0.5 text-[10px] text-[#787b86] hover:border-[#ef5350] hover:text-[#ef5350]"
                      >
                        Close
                      </button>
                      {p.stopLoss !== undefined && (
                        <span className="rounded border border-[#ef5350]/40 px-1.5 py-0.5 text-[10px] text-[#ef5350]">
                          SL {p.stopLoss.toFixed(precision)}
                        </span>
                      )}
                      {p.takeProfit !== undefined && (
                        <span className="rounded border border-[#26a69a]/40 px-1.5 py-0.5 text-[10px] text-[#26a69a]">
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
                    <span className="font-medium text-white">{o.symbol}</span>,
                    <span className={o.side === "buy" ? "text-[#26a69a]" : "text-[#ef5350]"}>
                      {o.side.toUpperCase()}
                    </span>,
                    <span className="uppercase text-[#d1d4dc]">{o.type}</span>,
                    <span className="tabular-nums">{fmtQty(o.qty)}</span>,
                    <span className="tabular-nums">{o.price?.toFixed(precision) ?? "market"}</span>,
                    <span className="tabular-nums text-[#787b86]">{clock(o.time)}</span>,
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void cancel(o.id)}
                        className="rounded border border-[#2a2e39] px-1.5 py-0.5 text-[10px] text-[#787b86] hover:border-[#ef5350] hover:text-[#ef5350]"
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
                rows={deals
                  .toSorted((a, b) => b.time - a.time)
                  .map((d) => ({
                    key: d.id,
                    cells: [
                      <span className="tabular-nums text-[#787b86]">{clock(d.time)}</span>,
                      <span className="font-medium text-white">{d.symbol}</span>,
                      <span className={d.side === "buy" ? "text-[#26a69a]" : "text-[#ef5350]"}>
                        {d.side.toUpperCase()}
                      </span>,
                      <span className="tabular-nums">{fmtQty(d.qty)}</span>,
                      <span className="tabular-nums">{d.price.toFixed(precision)}</span>,
                      <span className={`tabular-nums ${pnlClass(d.pnl)}`}>{signed(d.pnl)}</span>,
                    ],
                  }))}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-[#434651]">{label}</dt>
      <dd className={tone ?? "text-[#d1d4dc]"}>{value}</dd>
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
    return <p className="px-4 py-6 text-xs text-[#434651]">{empty}</p>;
  }
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead className="sticky top-0 bg-[#0e1117]">
        <tr className="text-[10px] uppercase tracking-wider text-[#434651]">
          {head.map((label) => (
            <th key={label} className="border-b border-[#1e222d] px-3 py-1.5 text-left font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-[#131722] hover:bg-[#131722]/60">
            {row.cells.map((cell, i) => (
              <td key={i} className="px-3 py-1.5 text-[#d1d4dc]">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
