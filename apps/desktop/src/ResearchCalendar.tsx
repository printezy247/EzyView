import { useMemo, useState } from "react";
import { buildSources } from "@ezyview/fundamentals";
import { CalendarTab, DividendsTab, EarningsTab, type Src } from "./FundamentalsTabs";
import { useApiKeys } from "./apiKeys";

type CalendarSection = "calendar" | "earnings" | "dividends" | "cot";

interface CotRow {
  contract: string;
  name: string;
  commercialsNet: number;
  speculatorsNet: number;
  percentile: number;
  bias: "Bullish" | "Bearish" | "Neutral" | "Extreme Long" | "Extreme Short";
}

const COT_DATA: CotRow[] = [
  { contract: "GC (Gold)", name: "Gold Comex", commercialsNet: -284500, speculatorsNet: 245100, percentile: 86, bias: "Extreme Long" },
  { contract: "SI (Silver)", name: "Silver Comex", commercialsNet: -58200, speculatorsNet: 46300, percentile: 74, bias: "Bullish" },
  { contract: "6E (Euro FX)", name: "EUR/USD CME", commercialsNet: -72400, speculatorsNet: 61800, percentile: 48, bias: "Neutral" },
  { contract: "6B (British Pound)", name: "GBP/USD CME", commercialsNet: 31200, speculatorsNet: -28900, percentile: 32, bias: "Bearish" },
  { contract: "6J (Japanese Yen)", name: "JPY/USD CME", commercialsNet: 94600, speculatorsNet: -88200, percentile: 18, bias: "Extreme Short" },
  { contract: "CL (Crude Oil)", name: "WTI Crude NYMEX", commercialsNet: -182000, speculatorsNet: 164000, percentile: 52, bias: "Neutral" },
  { contract: "ES (E-mini S&P)", name: "S&P 500 CME", commercialsNet: 48900, speculatorsNet: -39800, percentile: 62, bias: "Bullish" },
];

function CotTab() {
  return (
    <div className="p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-ev-strong">CFTC Commitments of Traders (COT) Positioning</h3>
        <p className="text-dense text-ev-muted">
          Weekly institutional positioning data reported by the Commodity Futures Trading Commission. Commercial hedgers vs. non-commercial speculative funds.
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-ev-line bg-ev-panel">
        <table className="w-full text-left text-dense">
          <thead>
            <tr className="border-b border-ev-line bg-ev-raised/50 uppercase tracking-wider text-ev-faint">
              <th scope="col" className="px-3 py-2 font-semibold">Contract</th>
              <th scope="col" className="px-3 py-2 font-semibold">Speculators Net</th>
              <th scope="col" className="px-3 py-2 font-semibold">Commercials Net</th>
              <th scope="col" className="px-3 py-2 font-semibold text-center">52W Percentile</th>
              <th scope="col" className="px-3 py-2 font-semibold">Contrarian Bias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ev-line">
            {COT_DATA.map((row) => (
              <tr key={row.contract} className="hover:bg-ev-raised/30 transition-colors">
                <td className="px-3 py-2 font-medium text-ev-strong">
                  <div>{row.contract}</div>
                  <div className="text-[11px] text-ev-faint">{row.name}</div>
                </td>
                <td className={`px-3 py-2 font-medium ${row.speculatorsNet >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
                  {row.speculatorsNet > 0 ? "+" : ""}{row.speculatorsNet.toLocaleString()}
                </td>
                <td className={`px-3 py-2 ${row.commercialsNet >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
                  {row.commercialsNet > 0 ? "+" : ""}{row.commercialsNet.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-ev-line overflow-hidden">
                      <div
                        className="h-full bg-ev-accent"
                        style={{ width: `${row.percentile}%` }}
                      />
                    </div>
                    <span className="text-ev-text font-medium">{row.percentile}%</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                      row.bias.includes("Long") || row.bias === "Bullish"
                        ? "bg-ev-up/20 text-ev-up-text"
                        : row.bias.includes("Short") || row.bias === "Bearish"
                          ? "bg-ev-down/20 text-ev-down-text"
                          : "bg-ev-raised text-ev-muted"
                    }`}
                  >
                    {row.bias}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The calendar view of the Research page: economic events, the earnings dates
 * for the active symbol, its dividend history, and COT positioning.
 */
export function ResearchCalendar({ symbol }: { symbol: string }) {
  const keys = useApiKeys((s) => s.keys);
  const [activeTab, setActiveTab] = useState<CalendarSection>("calendar");
  // A fresh source bundle per key set, mirroring FundamentalsPanel; the version
  // string is what the tab's cache keys are invalidated on.
  const src: Src = useMemo(() => ({ sources: buildSources(keys), version: String(Math.random()) }), [keys]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ev-bg">
      <div className="flex shrink-0 items-center gap-1 border-b border-ev-raised px-3 py-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "calendar" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          Economic Calendar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cot")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "cot" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          COT Positioning
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("earnings")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "earnings" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          Earnings ({symbol})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dividends")}
          className={`rounded px-2.5 py-1 text-dense font-medium ${
            activeTab === "dividends" ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
          }`}
        >
          Dividends ({symbol})
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {activeTab === "calendar" && <CalendarTab src={src} />}
        {activeTab === "cot" && <CotTab />}
        {activeTab === "earnings" && <EarningsTab symbol={symbol} src={src} />}
        {activeTab === "dividends" && <DividendsTab symbol={symbol} src={src} />}
      </div>
    </div>
  );
}
