import { Suspense, lazy } from "react";
import { useNavigate } from "react-router";

const JournalPanel = lazy(() => import("./JournalPanel").then((m) => ({ default: m.JournalPanel })));

/** Trading journal as a full-page destination; Close returns to the chart. */
export function JournalPage() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<div role="status" className="p-6 text-base text-ev-muted">Loading…</div>}>
      <JournalPanel onClose={() => navigate("/chart")} />
    </Suspense>
  );
}
