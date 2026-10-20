import { Suspense, lazy } from "react";
import { useNavigate } from "react-router";

const JournalPanel = lazy(() => import("./JournalPanel").then((m) => ({ default: m.JournalPanel })));

/** Trading journal as a full-page destination; Close returns to the chart. */
export function JournalPage() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={null}>
      <JournalPanel onClose={() => navigate("/chart")} />
    </Suspense>
  );
}
