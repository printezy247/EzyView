import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { DetachedChart } from "./DetachedChart.js";
import { readDetached } from "./windows.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

// A secondary window opened from View → "Open chart in new window" carries its
// symbol in the URL and skips the workspace entirely.
const detached = readDetached(window.location.search);

createRoot(container).render(
  <StrictMode>{detached ? <DetachedChart symbol={detached.symbol} resolution={detached.resolution} /> : <App />}</StrictMode>,
);
