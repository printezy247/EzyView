import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App.js";
import { DetachedChart } from "./DetachedChart.js";
import { readDetached } from "./windows.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

// A secondary window opened from View → "Open chart in new window" carries its
// symbol in the URL and skips the workspace (and the router) entirely.
const detached = readDetached(window.location.search);

// HashRouter survives Tauri's asset-protocol origins, where history routing
// cannot: the path lives in the fragment and never touches the filesystem.
createRoot(container).render(
  <StrictMode>
    {detached ? (
      <DetachedChart symbol={detached.symbol} resolution={detached.resolution} />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
  </StrictMode>,
);
