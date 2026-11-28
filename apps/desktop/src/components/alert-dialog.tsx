import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { UiButton, UiInput, UiSelect, UiSwitch } from "@allegedly/ui-chrome";
import {
  ALERT_OPERATOR_LABELS,
  ALERT_TRIGGER_LABELS,
  createDefaultAlertDraft,
  defaultExpirationIso,
  formatAlertConditionSummary,
  formatExpirationLabel,
  formatNotificationSummary,
  type AlertCondition,
  type AlertConditionOperator,
  type AlertTriggerMode,
  type ChartAlert,
} from "../alerts/alert-engine";

export interface AlertDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialAlert: ChartAlert | null;
  availableSymbols: readonly string[];
  availableSources?: readonly string[];
  decimals?: number;
  onOpenChange: (open: boolean) => void;
  onSave: (alert: ChartAlert) => void;
  onDelete?: (alertId: string) => void;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function AlertDialog({
  open,
  mode,
  initialAlert,
  availableSymbols,
  availableSources = [],
  decimals = 2,
  onOpenChange,
  onSave,
  onDelete,
}: AlertDialogProps) {
  const [draft, setDraft] = useState<ChartAlert | null>(initialAlert);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [notificationsExpanded, setNotificationsExpanded] = useState(false);
  const [expirationExpanded, setExpirationExpanded] = useState(false);
  const [customMessageEdited, setCustomMessageEdited] = useState(false);

  useEffect(() => {
    if (open && initialAlert) {
      setDraft({
        ...initialAlert,
        conditions: initialAlert.conditions.map((c) => ({ ...c })),
        notifications: { ...initialAlert.notifications },
      });
      setMessageExpanded(false);
      setNotificationsExpanded(false);
      setExpirationExpanded(false);
      setCustomMessageEdited(mode === "edit");
    }
  }, [open, initialAlert, mode]);

  if (!open || !draft) return null;

  const symbols = Array.from(new Set([draft.symbol, ...availableSymbols]));
  const sources = ["price", ...availableSources.filter((s) => s !== "price")];

  const syncSummary = (nextSymbol: string, nextConditions: AlertCondition[], prev: ChartAlert): ChartAlert => {
    const summary = formatAlertConditionSummary(nextSymbol, nextConditions, decimals);
    return {
      ...prev,
      symbol: nextSymbol,
      conditions: nextConditions,
      name: summary,
      message: customMessageEdited ? prev.message : summary,
    };
  };

  const handleUpdateCondition = (index: number, patch: Partial<AlertCondition>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextConditions = prev.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
      return syncSummary(prev.symbol, nextConditions, prev);
    });
  };

  const handleAddCondition = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const baseVal = prev.conditions[0]?.value ?? 0;
      const added: AlertCondition = {
        id: `cond-${Date.now()}-${prev.conditions.length + 1}`,
        source: "price",
        operator: "crossing",
        valueType: "value",
        value: baseVal,
      };
      return syncSummary(prev.symbol, [...prev.conditions, added], prev);
    });
  };

  const handleRemoveCondition = (index: number) => {
    setDraft((prev) => {
      if (!prev || prev.conditions.length <= 1) return prev;
      const nextConditions = prev.conditions.filter((_, i) => i !== index);
      return syncSummary(prev.symbol, nextConditions, prev);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const summary = formatAlertConditionSummary(draft.symbol, draft.conditions, decimals);
    onSave({
      ...draft,
      name: draft.name.trim() || summary,
      message: draft.message.trim() || summary,
      status: draft.status === "expired" ? "active" : draft.status,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <DialogContent
        aria-label={mode === "edit" ? `Edit alert on ${draft.symbol}` : `Create alert on ${draft.symbol}`}
        className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[10px] border border-white/[0.10] bg-[var(--app-surface-bg,#1e222d)] text-[var(--app-text,#e6e8ee)] shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--app-border,#2a2e39)] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-[15px] font-semibold tracking-tight text-[#f0f3fa]">
                {mode === "edit" ? "Edit alert on" : "Create alert on"}
              </DialogTitle>
              <UiSelect
                aria-label="Alert symbol"
                value={draft.symbol}
                onChange={(e) => {
                  const nextSym = e.target.value;
                  setDraft((prev) => (prev ? syncSummary(nextSym, prev.conditions, prev) : prev));
                }}
                className="h-7 w-auto min-w-[96px] rounded-md border-[var(--app-border,#323848)] bg-[var(--app-panel-bg,#181c27)] px-2 text-[12px] font-semibold text-[#f0f3fa]"
              >
                {symbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </UiSelect>
            </div>
            <DialogClose
              aria-label="Close alert dialog"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#868c9b] hover:bg-white/[0.06] hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            Configure price or indicator alert conditions, trigger frequency, expiration, message, and notifications.
          </DialogDescription>

          {/* Body */}
          <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 py-5 text-[12px]">
            {/* Condition Rows */}
            <div className="grid grid-cols-[100px_1fr] items-start gap-x-3 gap-y-2">
              <span className="pt-1.5 text-[12px] font-medium text-[#9598a1]">Condition</span>
              <div className="space-y-2.5">
                {draft.conditions.map((cond, idx) => (
                  <div
                    key={cond.id}
                    className={
                      idx > 0
                        ? "space-y-2 rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#181c27)]/60 p-2.5"
                        : "space-y-2"
                    }
                  >
                    <div className="flex items-center gap-2">
                      <UiSelect
                        aria-label={`Condition ${idx + 1} source`}
                        value={cond.source}
                        onChange={(e) => handleUpdateCondition(idx, { source: e.target.value })}
                        className="flex-1"
                      >
                        {sources.map((src) => (
                          <option key={src} value={src}>
                            {src === "price" ? "Price" : src}
                          </option>
                        ))}
                      </UiSelect>
                      {draft.conditions.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove condition ${idx + 1}`}
                          onClick={() => handleRemoveCondition(idx)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#868c9b] hover:bg-white/[0.06] hover:text-rose-300"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <UiSelect
                      aria-label={`Condition ${idx + 1} operator`}
                      value={cond.operator}
                      onChange={(e) =>
                        handleUpdateCondition(idx, {
                          operator: e.target.value as AlertConditionOperator,
                        })
                      }
                      className="w-full"
                    >
                      {(Object.keys(ALERT_OPERATOR_LABELS) as AlertConditionOperator[]).map((op) => (
                        <option key={op} value={op}>
                          {ALERT_OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </UiSelect>

                    <div className="grid grid-cols-[96px_1fr] gap-2">
                      <UiSelect
                        aria-label={`Condition ${idx + 1} value type`}
                        value={cond.valueType}
                        onChange={(e) =>
                          handleUpdateCondition(idx, {
                            valueType: e.target.value as "value" | "indicator",
                          })
                        }
                      >
                        <option value="value">Value</option>
                        {availableSources.length > 0 && <option value="indicator">Indicator</option>}
                      </UiSelect>

                      {cond.valueType === "indicator" && availableSources.length > 0 ? (
                        <UiSelect
                          aria-label={`Condition ${idx + 1} target indicator`}
                          value={cond.targetSource ?? availableSources[0]}
                          onChange={(e) => handleUpdateCondition(idx, { targetSource: e.target.value })}
                        >
                          {availableSources.map((src) => (
                            <option key={src} value={src}>
                              {src}
                            </option>
                          ))}
                        </UiSelect>
                      ) : (
                        <UiInput
                          aria-label={`Condition ${idx + 1} price value`}
                          type="number"
                          step="any"
                          value={Number.isFinite(cond.value) ? cond.value : ""}
                          onChange={(e) => {
                            const parsed = Number.parseFloat(e.target.value);
                            handleUpdateCondition(idx, {
                              value: Number.isFinite(parsed) ? parsed : 0,
                            });
                          }}
                          className="font-mono tabular-nums"
                        />
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddCondition}
                  className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-[12px] font-medium text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
                >
                  <span aria-hidden="true" className="text-[14px] leading-none">
                    +
                  </span>
                  <span>Add condition</span>
                </button>
              </div>
            </div>

            <div className="h-px bg-[var(--app-border,#2a2e39)]" />

            {/* Trigger */}
            <div className="grid grid-cols-[100px_1fr] items-center gap-x-3">
              <label htmlFor="alert-trigger-select" className="text-[12px] font-medium text-[#9598a1]">
                Trigger
              </label>
              <UiSelect
                id="alert-trigger-select"
                value={draft.trigger}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, trigger: e.target.value as AlertTriggerMode } : prev,
                  )
                }
                className="w-full"
              >
                {(Object.keys(ALERT_TRIGGER_LABELS) as AlertTriggerMode[]).map((modeKey) => (
                  <option key={modeKey} value={modeKey}>
                    {ALERT_TRIGGER_LABELS[modeKey]}
                  </option>
                ))}
              </UiSelect>
            </div>

            {/* Expiration */}
            <div className="grid grid-cols-[100px_1fr] items-start gap-x-3">
              <span className="pt-1.5 text-[12px] font-medium text-[#9598a1]">Expiration</span>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setExpirationExpanded((v) => !v)}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[12px] text-[#e6e8ee] hover:bg-white/[0.06]"
                >
                  <span className="truncate">{formatExpirationLabel(draft.expirationIso)}</span>
                  <span aria-hidden="true" className="text-[#868c9b]">
                    {expirationExpanded ? "▴" : "▾"}
                  </span>
                </button>
                {expirationExpanded && (
                  <div className="space-y-2 rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#181c27)] p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#9598a1]">Open-ended</span>
                      <UiSwitch
                        size="sm"
                        aria-label="Open-ended expiration"
                        checked={draft.expirationIso === null}
                        onCheckedChange={(checked) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  expirationIso: checked ? null : defaultExpirationIso(),
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    {draft.expirationIso !== null && (
                      <UiInput
                        aria-label="Expiration date and time"
                        type="datetime-local"
                        value={toDatetimeLocalValue(draft.expirationIso)}
                        onChange={(e) => {
                          const dt = new Date(e.target.value);
                          if (!Number.isNaN(dt.getTime())) {
                            setDraft((prev) =>
                              prev ? { ...prev, expirationIso: dt.toISOString() } : prev,
                            );
                          }
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Message */}
            <div className="grid grid-cols-[100px_1fr] items-start gap-x-3">
              <span className="pt-1.5 text-[12px] font-medium text-[#9598a1]">Message</span>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMessageExpanded((v) => !v)}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[12px] text-[#e6e8ee] hover:bg-white/[0.06]"
                >
                  <span className="truncate">{draft.message || draft.name}</span>
                  <span aria-hidden="true" className="text-[#868c9b]">
                    {messageExpanded ? "▾" : "›"}
                  </span>
                </button>
                {messageExpanded && (
                  <div className="space-y-2 rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#181c27)] p-2.5">
                    <UiInput
                      aria-label="Alert name"
                      placeholder="Alert name"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                      }
                    />
                    <textarea
                      aria-label="Alert message"
                      rows={2}
                      value={draft.message}
                      onChange={(e) => {
                        setCustomMessageEdited(true);
                        setDraft((prev) => (prev ? { ...prev, message: e.target.value } : prev));
                      }}
                      className="w-full rounded-md border border-[var(--app-border,#2a2e39)] bg-[#111318] px-2.5 py-1.5 text-[12px] text-[#e6e8ee] outline-none focus:border-[var(--app-accent,#2962ff)]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Notifications */}
            <div className="grid grid-cols-[100px_1fr] items-start gap-x-3">
              <span className="pt-1.5 text-[12px] font-medium text-[#9598a1]">Notifications</span>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setNotificationsExpanded((v) => !v)}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[12px] text-[#e6e8ee] hover:bg-white/[0.06]"
                >
                  <span className="truncate">{formatNotificationSummary(draft.notifications)}</span>
                  <span aria-hidden="true" className="text-[#868c9b]">
                    {notificationsExpanded ? "▾" : "›"}
                  </span>
                </button>
                {notificationsExpanded && (
                  <div className="space-y-2 rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#181c27)] p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#d1d4dc]">Notify in app</span>
                      <UiSwitch
                        size="sm"
                        aria-label="Notify in app"
                        checked={draft.notifications.app}
                        onCheckedChange={(checked) =>
                          setDraft((prev) =>
                            prev
                              ? { ...prev, notifications: { ...prev.notifications, app: checked } }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#d1d4dc]">Show toast popup</span>
                      <UiSwitch
                        size="sm"
                        aria-label="Show toast popup"
                        checked={draft.notifications.toasts}
                        onCheckedChange={(checked) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  notifications: { ...prev.notifications, toasts: checked },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#d1d4dc]">Play sound</span>
                      <UiSwitch
                        size="sm"
                        aria-label="Play alert sound"
                        checked={draft.notifications.sound}
                        onCheckedChange={(checked) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  notifications: { ...prev.notifications, sound: checked },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <UiInput
                      aria-label="Webhook URL"
                      placeholder="Webhook URL (optional)"
                      value={draft.notifications.webhookUrl}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                notifications: { ...prev.notifications, webhookUrl: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--app-border,#2a2e39)] px-6 py-4">
            <div>
              {mode === "edit" && onDelete && (
                <UiButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onDelete(draft.id);
                    onOpenChange(false);
                  }}
                  className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  Delete
                </UiButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UiButton type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </UiButton>
              <UiButton type="submit" variant="default" size="sm">
                {mode === "edit" ? "Save" : "Create"}
              </UiButton>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { createDefaultAlertDraft };
