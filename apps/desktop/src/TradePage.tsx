import { useState } from "react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { OrderTicket } from "./OrderTicket";
import { TradingPanel } from "./TradingPanel";
import { DepthOfMarket } from "./DepthOfMarket";
import { precisionForSymbol } from "./pricePrecision";
import { useQuote } from "./quotePoller";
import { useTrading } from "./trading";
import { Button, Tabs, rowClass } from "./ui";
import { CurrencyConverter } from "./CurrencyConverter";

type Tab = "ticket" | "blotter" | "depth" | "fx";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "ticket", label: "Order ticket", hint: "Place a market or pending order" },
  { id: "blotter", label: "Blotter", hint: "Positions, working orders and deal history" },
  { id: "depth", label: "Depth", hint: "Depth of market around the current price" },
  { id: "fx", label: "Converter", hint: "Convert an amount between currencies" },
];

/**
 * Trade destination: the order ticket, the position/order blotter and depth of
 * market as one page. These were chart side panels; promoting them makes the
 * trade workflow usable without a chart tab open, and gives each a real
 * full-width layout.
 */
export function TradePage() {
  const navigate = useNavigate();
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const [tab, setTab] = useState<Tab>("ticket");
  // The depth view needs a current price; the shared poller serves it even
  // when no chart is attached.
  const { quote } = useQuote(state.symbol, { intervalMs: 3000 });
  const last = quote?.last ?? null;
  void useTrading;

  return (
    <section aria-label="Trade" className="flex min-h-0 flex-1 flex-col text-base">
      <div className="flex shrink-0 items-center gap-1 border-b border-ev-raised px-3 py-1.5">
        <Tabs
          label="Trade views"
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          items={TABS.map((t) => ({ id: t.id, label: t.label, title: t.hint }))}
        />
        <span className="ml-auto flex items-center gap-2">
          <span className="num text-dense text-ev-faint">
            {state.symbol} {last === null ? "" : last.toFixed(precisionForSymbol(state.symbol, last))}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate("/chart")}>
            Back to chart
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "ticket" && (
          <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4">
            <OrderTicket symbol={state.symbol} />
          </div>
        )}
        {tab === "blotter" && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <TradingPanel symbol={state.symbol} />
          </div>
        )}
        {tab === "depth" && (
          <div className="mx-auto w-full max-w-md overflow-y-auto p-4">
            <DepthOfMarket symbol={state.symbol} precision={precisionForSymbol(state.symbol, last)} />
          </div>
        )}
        {tab === "fx" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CurrencyConverter />
          </div>
        )}
      </div>
    </section>
  );
}

/** Re-export so the page's table styles stay one import away. */
export { rowClass };
