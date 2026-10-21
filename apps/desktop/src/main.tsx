import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App.js";
import { DetachedChart } from "./DetachedChart.js";
import { installCrashCapture } from "./diagnostics.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { parseShareLink } from "./shareLink.js";
import { checkOnStartup } from "./updateCheck.js";
import { startAlertFeed } from "./alertFeed.js";
import { startSnapshotSync } from "./snapshot.js";
import { useWorkspace } from "./store.js";
import { readDetached } from "./windows.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

// A secondary window opened from View → "Open chart in new window" carries its
// symbol in the URL and skips the workspace (and the router) entirely.
const detached = readDetached(window.location.search);

// A shared chart link (`?share=SYMBOL:interval`) retargets the focused chart
// once, then drops the parameter so a refresh does not re-apply it.
const shared = detached ? null : parseShareLink(window.location.href);
if (shared) {
  useWorkspace.getState().updateActive(shared);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
}

installCrashCapture();

// Keep the MCP workspace snapshot current (main window only; no-op outside Tauri).
if (!detached) {
  startSnapshotSync();
  startAlertFeed();
  void checkOnStartup();
}

// HashRouter survives Tauri's asset-protocol origins, where history routing
// cannot: the path lives in the fragment and never touches the filesystem.
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
    {detached ? (
      <DetachedChart symbol={detached.symbol} resolution={detached.resolution} />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
    </ErrorBoundary>
  </StrictMode>,
);
