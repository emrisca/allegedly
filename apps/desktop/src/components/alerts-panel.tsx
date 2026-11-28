import { useState } from "react";
import { SettingsCogIcon, UiButton } from "@allegedly/ui-chrome";
import {
  ALERT_TRIGGER_LABELS,
  formatAlertConditionSummary,
  formatAlertPrice,
  type AlertLogEntry,
  type ChartAlert,
} from "../alerts/alert-engine";

export interface AlertsPanelProps {
  activeSymbol: string;
  alerts: readonly ChartAlert[];
  logs: readonly AlertLogEntry[];
  onCreateAlert: () => void;
  onEditAlert: (alert: ChartAlert) => void;
  onTogglePauseAlert: (alertId: string) => void;
  onDeleteAlert: (alertId: string) => void;
  onClearLogs: () => void;
  onSelectSymbol?: (symbol: string) => void;
  onCollapse: () => void;
}

function formatLogTime(ts: number): string {
  const dt = new Date(ts);
  return dt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function AlertsPanel({
  activeSymbol,
  alerts,
  logs,
  onCreateAlert,
  onEditAlert,
  onTogglePauseAlert,
  onDeleteAlert,
  onClearLogs,
  onSelectSymbol,
  onCollapse,
}: AlertsPanelProps) {
  const [subTab, setSubTab] = useState<"alerts" | "log">("alerts");
  const [filterMode, setFilterMode] = useState<"all" | "active" | "symbol">("all");

  const filteredAlerts = alerts.filter((al) => {
    if (filterMode === "active") return al.status === "active";
    if (filterMode === "symbol") return al.symbol === activeSymbol;
    return true;
  });

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <section aria-label="Alerts manager" className="flex h-full flex-col bg-[var(--app-chrome-bg,#131722)] text-[#d1d4dc]">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--app-border,#2a2e39)] px-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#f0f3fa]">Alerts</span>
          {activeCount > 0 && (
            <span className="rounded bg-white/[0.10] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#e4e4e7]">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Create alert"
            aria-label="Create alert"
            onClick={onCreateAlert}
            className="flex h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Close alerts panel"
            onClick={onCollapse}
            className="flex h-7 w-7 items-center justify-center rounded text-[#787b86] hover:bg-white/[0.06] hover:text-[#f0f3fa]"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div role="tablist" aria-label="Alerts views" className="flex shrink-0 items-center border-b border-[var(--app-border,#2a2e39)] px-3">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "alerts"}
          onClick={() => setSubTab("alerts")}
          className={`relative mr-4 py-2 text-[12px] font-medium transition-colors ${
            subTab === "alerts" ? "text-[#f0f3fa]" : "text-[#787b86] hover:text-[#d1d4dc]"
          }`}
        >
          Alerts
          {subTab === "alerts" && (
            <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-t bg-[#f0f3fa]" />
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "log"}
          onClick={() => setSubTab("log")}
          className={`relative flex items-center gap-1.5 py-2 text-[12px] font-medium transition-colors ${
            subTab === "log" ? "text-[#f0f3fa]" : "text-[#787b86] hover:text-[#d1d4dc]"
          }`}
        >
          <span>Log</span>
          {logs.length > 0 && (
            <span className="rounded bg-white/[0.06] px-1 font-mono text-[10px] text-[#9598a1]">
              {logs.length}
            </span>
          )}
          {subTab === "log" && (
            <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-t bg-[#f0f3fa]" />
          )}
        </button>
      </div>

      {subTab === "alerts" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Filters */}
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--app-border,#2a2e39)] px-3 py-2">
            {(
              [
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "symbol", label: activeSymbol },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  filterMode === f.id
                    ? "bg-white/[0.06] text-[#f0f3fa]"
                    : "text-[#787b86] hover:bg-white/[0.06] hover:text-[#d1d4dc]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Alerts list */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <div className="text-[12px] text-[#787b86]">
                  {alerts.length === 0
                    ? "No alerts yet. Add one from the toolbar, right-click chart menu, or below."
                    : "No alerts match this filter."}
                </div>
                <UiButton type="button" variant="secondary" size="sm" onClick={onCreateAlert}>
                  + Create alert
                </UiButton>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredAlerts.map((al) => {
                  const statusDot =
                    al.status === "active"
                      ? "bg-emerald-400"
                      : al.status === "triggered"
                        ? "bg-amber-400"
                        : "bg-[#6b7280]";
                  const summary = al.message || formatAlertConditionSummary(al.symbol, al.conditions);
                  return (
                    <div
                      key={al.id}
                      onDoubleClick={() => onEditAlert(al)}
                      className="group rounded-md border border-transparent px-3 py-3 transition-colors hover:border-[var(--app-border,#2a2e39)] hover:bg-[var(--app-panel-bg,#181c27)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectSymbol?.(al.symbol)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-[12px] font-medium text-[#f0f3fa]">
                            {summary}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[#868c9b]">
                            <span className="inline-flex items-center gap-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                              <span className="capitalize">{al.status}</span>
                            </span>
                            <span>·</span>
                            <span className="font-mono">{al.symbol}</span>
                            <span>·</span>
                            <span>{al.timeframe}</span>
                            <span>·</span>
                            <span>{ALERT_TRIGGER_LABELS[al.trigger]}</span>
                          </div>
                        </button>

                        <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100">
                          <button
                            type="button"
                            title={al.status === "active" ? "Pause alert" : "Resume alert"}
                            aria-label={al.status === "active" ? `Pause ${al.name}` : `Resume ${al.name}`}
                            onClick={() => onTogglePauseAlert(al.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-[#9598a1] hover:bg-white/[0.06] hover:text-white"
                          >
                            {al.status === "active" ? (
                              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                                <rect x="4" y="3.5" width="2.5" height="9" rx="0.5" />
                                <rect x="9.5" y="3.5" width="2.5" height="9" rx="0.5" />
                              </svg>
                            ) : (
                              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                                <path d="M5 3.5v9l7.5-4.5L5 3.5z" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            title="Edit alert"
                            aria-label={`Edit ${al.name}`}
                            onClick={() => onEditAlert(al)}
                            className="flex h-6 w-6 items-center justify-center rounded text-[#9598a1] hover:bg-white/[0.06] hover:text-white"
                          >
                            <SettingsCogIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete alert"
                            aria-label={`Delete ${al.name}`}
                            onClick={() => onDeleteAlert(al.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-[#9598a1] hover:bg-white/[0.06] hover:text-rose-300"
                          >
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                              <path d="M3.5 4.5h9M6 4.5V3.2h4v1.3M5 4.5l.6 8h4.8l.6-8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {logs.length > 0 && (
            <div className="flex shrink-0 items-center justify-end border-b border-[var(--app-border,#2a2e39)] px-3 py-1.5">
              <button
                type="button"
                onClick={onClearLogs}
                className="text-[11px] text-[#868c9b] hover:text-[#f0f3fa]"
              >
                Clear log
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {logs.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[#787b86]">
                No triggered alerts recorded yet.
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#181c27)] px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-amber-300">{entry.symbol}</span>
                      <span className="font-mono text-[10px] text-[#787b86]">
                        {formatLogTime(entry.triggeredAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#e6e8ee]">{entry.message}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#868c9b]">
                      Price: {formatAlertPrice(entry.price)} · {entry.timeframe}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
