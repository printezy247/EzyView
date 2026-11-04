import { evaluateAlert, pushHistory } from "@ezyview/data-adapters";
import { priceAt } from "@ezyview/drawing-tools";
import { uid } from "./helpers";
import { historySame } from "./restore";
import type { WorkspaceStore } from "./types";

type SliceSet = (
  partial: Partial<WorkspaceStore> | ((s: WorkspaceStore) => Partial<WorkspaceStore> | WorkspaceStore),
) => void;

/** Price-alert slice: user-defined alerts and the feed's rolling close history. */
type AlertSliceKeys = "alerts" | "alertHistory" | "addAlert" | "removeAlert" | "snoozeAlert" | "setAlertExpiry" | "applyCandle";

export function createAlertsSlice(set: SliceSet, get: () => WorkspaceStore): Pick<WorkspaceStore, AlertSliceKeys> {
  return {
    alerts: [],
    alertHistory: {},

      addAlert: (symbol, condition, frequency, message, drawingId, levelKey) =>
        set((s) => ({
          alerts: [
            ...s.alerts,
            {
              id: uid(),
              symbol,
              message,
              condition,
              frequency,
              state: "armed",
              createdAt: Date.now(),
              ...(drawingId ? { drawingId } : {}),
              ...(levelKey ? { levelKey } : {}),
            },
          ],
        })),

      removeAlert: (id) =>
        set((s) => {
          const { [id]: _dropped, ...rest } = s.alertHistory;
          return { alerts: s.alerts.filter((a) => a.id !== id), alertHistory: rest };
        }),

      snoozeAlert: (id, until) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, snoozedUntil: until } : a)),
        })),

      setAlertExpiry: (id, at) =>
        set((s) => ({
          alerts: s.alerts.map((a) => {
            if (a.id !== id) return a;
            if (at === undefined) {
              const { expiresAt: _dropped, ...rest } = a;
              return rest;
            }
            return { ...a, expiresAt: at };
          }),
        })),

      applyCandle: (symbol, candle, barClosed) => {
        const fired: string[] = [];
        let alerts = get().alerts;
        let history = get().alertHistory;
        alerts = alerts.map((alert) => {
          if (alert.symbol !== symbol) return alert;
          let currentAlert = alert;
          if (alert.drawingId && "value" in alert.condition) {
            const chart = get().activeChart();
            const drawing = chart.drawings.find((d) => d.id === alert.drawingId);
            if (drawing) {
              const dynamicPrice = priceAt(drawing, candle.time, alert.levelKey);
              if (dynamicPrice !== null && Number.isFinite(dynamicPrice) && dynamicPrice !== alert.condition.value) {
                currentAlert = { ...alert, condition: { ...alert.condition, value: dynamicPrice } };
              }
            }
          }
          const closes = history[alert.id] ?? [];
          const next = evaluateAlert(currentAlert, closes, candle, barClosed);
          if (barClosed || closes.length === 0) {
            history = pushHistory(history, alert.id, candle.close);
          } else {
            history = { ...history, [alert.id]: [...closes.slice(0, -1), candle.close] };
          }
          if (!next) return alert;
          if (next.state === "triggered" && (alert.state !== "triggered" || next.triggeredAt !== alert.triggeredAt)) {
            fired.push(next.id);
          }
          return next;
        });
        // Keep the array identity when nothing fired or changed, so subscribers
        // (the MCP snapshot sync) are not woken by every quote poll.
        const prev = get().alerts;
        const alertsSame = alerts.every((a, i) => a === prev[i]);
        const historyChanged = !historySame(get().alertHistory, history);
        if (!alertsSame || historyChanged) {
          set({ alerts: alertsSame ? prev : alerts, alertHistory: history });
        }
        return fired;
      },
  };
}
