import { useState } from "react";
import { Button } from "@ui-sdk/react/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import {
  BOOK_STATE_LABELS,
  BookState,
  formatFixedE9,
  PROVENANCE_TIER_LABELS,
  ProvenanceTier,
  type BuiltinStudyKind,
  type PaperAccountSnapshot,
  type ResolvedSetting,
  type StudyRunResponse,
} from "@allegedly/ipc-client";

export type PaperOmsTabValue = "ticket" | "orders" | "provenance" | "studies" | "settings";

export interface PaperOmsPanelProps {
  symbol: string;
  account: PaperAccountSnapshot;
  bookState: number;
  provenanceTier: number;
  defaultTab?: PaperOmsTabValue;
  activeStudies?: readonly StudyRunResponse[];
  studyError?: string | null;
  settings?: readonly ResolvedSetting[];
  exportedToml?: string | null;
  onSubmitOrder: (side: "buy" | "sell", orderType: "market" | "limit") => void;
  onKillSwitch: () => void;
  onRunBuiltinStudy?: (kind: BuiltinStudyKind, period: number) => void;
  onRunLuauStudy?: (script: string) => void;
  onClearStudies?: () => void;
  onUpdateSetting?: (key: string, value: string) => void;
  onResetSetting?: (key: string) => void;
  onExportWorkspaceToml?: () => void;
}

const PROVENANCE_LADDER: ReadonlyArray<{
  tier: number;
  displayTier: number;
  label: string;
  desc: string;
  absorptionAllowed: boolean;
  exactMbo: boolean;
}> = [
  {
    tier: ProvenanceTier.ExactL3Mbo,
    displayTier: 1,
    label: "EXACT: L3 MBO",
    desc: "Native per-order queue position (Exact PIQ)",
    absorptionAllowed: true,
    exactMbo: true,
  },
  {
    tier: ProvenanceTier.ExactTickAggr,
    displayTier: 2,
    label: "EXACT: TICK AGGR",
    desc: "Exchange-tagged aggressor side (SV-10 OK)",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.EstimatedL1Quote,
    displayTier: 3,
    label: "INFERRED: QUOTE RULE",
    desc: "Lee-Ready BBO side classification",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.EstimatedTickRule,
    displayTier: 4,
    label: "INFERRED: TICK RULE",
    desc: "Prior-tick direction inference",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.SyntheticIntrabar,
    displayTier: 5,
    label: "SYNTHETIC: INTRABAR",
    desc: "Coarse OHLCV synthesis (SV-10 triggers gated)",
    absorptionAllowed: false,
    exactMbo: false,
  },
];

const DEFAULT_LUAU_SNIPPET =
  "local out = {}; for i = 1, #close do out[i] = i == 1 and close[i] or (close[i] + close[i-1]) / 2 end; return out";

function bookStateTextClass(bookState: number): string {
  if (bookState === BookState.Live) return "text-emerald-300";
  if (bookState === BookState.Rebuilding || bookState === BookState.Stale) return "text-amber-300";
  return "text-rose-300";
}

export function PaperOmsPanel({
  symbol,
  account,
  bookState,
  provenanceTier,
  defaultTab = "ticket",
  activeStudies = [],
  studyError = null,
  settings = [],
  exportedToml = null,
  onSubmitOrder,
  onKillSwitch,
  onRunBuiltinStudy,
  onRunLuauStudy,
  onClearStudies,
  onUpdateSetting,
  onResetSetting,
  onExportWorkspaceToml,
}: PaperOmsPanelProps) {
  const [luauDraft, setLuauDraft] = useState<string>(DEFAULT_LUAU_SNIPPET);
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [editingSettingValue, setEditingSettingValue] = useState<string>("");

  const rawPos = account.net_position_e9[symbol] ?? "0";
  const netPos = formatFixedE9(BigInt(rawPos), 3);

  const latestLuauPeakBytes = activeStudies.reduce(
    (max, st) => Math.max(max, st.memory_pool_peak_bytes ?? st.memory_pool_reserved_bytes ?? 0),
    0,
  );
  const poolCapBytes = activeStudies[0]?.memory_pool_cap_bytes ?? 64 * 1024 * 1024;

  const beginEditSetting = (s: ResolvedSetting) => {
    setEditingSettingKey(s.key);
    setEditingSettingValue(s.value);
  };

  const commitEditSetting = (key: string) => {
    onUpdateSetting?.(key, editingSettingValue);
    setEditingSettingKey(null);
  };

  return (
    <section
      aria-label="Paper execution, studies, provenance, and settings"
      className="flex h-full w-full flex-col bg-[#101217] p-2.5 text-xs text-[#e6e8ee]"
    >
      <div className="mb-2 flex items-center justify-between border-b border-[#232733] pb-2">
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
          <span className="rounded border border-amber-500/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            {account.mode}
          </span>
          <span className="truncate text-[#868c9b]">NET {symbol}:</span>
          <span className="font-semibold tabular-nums text-[#f1f3f8]">{netPos}</span>
        </div>
        <Button
          onClick={onKillSwitch}
          className="shrink-0 rounded border border-rose-500/40 bg-rose-950/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-200 hover:bg-rose-900/80"
        >
          Cancel All
        </Button>
      </div>

      <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="Execution and desk panel tabs" className="mb-2 flex flex-wrap gap-1">
          <TabsTab
            value="ticket"
            className="rounded px-2 py-1 text-[11px] font-medium text-[#8c93a4] hover:text-[#e6e8ee] data-selected:bg-[#1e2330] data-selected:text-[#f1f3f8]"
          >
            Paper Ticket
          </TabsTab>
          <TabsTab
            value="orders"
            className="rounded px-2 py-1 text-[11px] font-medium text-[#8c93a4] hover:text-[#e6e8ee] data-selected:bg-[#1e2330] data-selected:text-[#f1f3f8]"
          >
            Journal ({account.orders.length})
          </TabsTab>
          <TabsTab
            value="provenance"
            className="rounded px-2 py-1 text-[11px] font-medium text-[#8c93a4] hover:text-[#e6e8ee] data-selected:bg-[#1e2330] data-selected:text-[#f1f3f8]"
          >
            Provenance
          </TabsTab>
          <TabsTab
            value="studies"
            className="rounded px-2 py-1 text-[11px] font-medium text-[#8c93a4] hover:text-[#e6e8ee] data-selected:bg-[#1e2330] data-selected:text-[#f1f3f8]"
          >
            Studies ({activeStudies.length})
          </TabsTab>
          <TabsTab
            value="settings"
            className="rounded px-2 py-1 text-[11px] font-medium text-[#8c93a4] hover:text-[#e6e8ee] data-selected:bg-[#1e2330] data-selected:text-[#f1f3f8]"
          >
            TOML Cascade
          </TabsTab>
        </TabsList>

        <TabsPanel value="ticket" className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              onClick={() => onSubmitOrder("buy", "market")}
              className="rounded bg-emerald-600 px-2.5 py-2 font-mono text-[11px] font-semibold text-[#0c0d11] hover:bg-emerald-500"
            >
              BUY MKT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("sell", "market")}
              className="rounded bg-rose-600 px-2.5 py-2 font-mono text-[11px] font-semibold text-white hover:bg-rose-500"
            >
              SELL MKT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("buy", "limit")}
              className="rounded border border-emerald-700/70 bg-emerald-950/50 px-2.5 py-1.5 font-mono text-[11px] text-emerald-200 hover:bg-emerald-900/60"
            >
              BUY LMT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("sell", "limit")}
              className="rounded border border-rose-700/70 bg-rose-950/50 px-2.5 py-1.5 font-mono text-[11px] text-rose-200 hover:bg-rose-900/60"
            >
              SELL LMT 0.50
            </Button>
          </div>
          <p className="rounded border border-[#232733] bg-[#161922] px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[#868c9b]">
            LIVE_ARMED = false · LocalPaperAdapter + SQLite WAL · Zero broker network egress (ADR-0009).
          </p>
        </TabsPanel>

        <TabsPanel value="orders" className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
          {account.orders.length === 0 ? (
            <p className="py-3 text-[#868c9b]">No paper orders submitted yet.</p>
          ) : (
            <ul className="space-y-1">
              {account.orders.slice(0, 10).map((ord) => (
                <li
                  key={ord.order_id}
                  className="flex items-center justify-between rounded border border-[#232733] bg-[#161922] px-2 py-1.5"
                >
                  <span className={ord.side === "buy" ? "text-emerald-300" : "text-rose-300"}>
                    {ord.order_id} · {ord.side.toUpperCase()} {ord.order_type.toUpperCase()}
                  </span>
                  <span className="tabular-nums text-[#cfd4e0]">
                    {formatFixedE9(BigInt(ord.qty_e9), 2)} · {ord.status.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsPanel>

        <TabsPanel value="provenance" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto font-mono text-[11px]">
          <div className="flex justify-between rounded border border-[#232733] bg-[#161922] px-2 py-1.5">
            <span className="text-[#868c9b]">Active Tier</span>
            <span className="text-sky-300">{PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN"}</span>
          </div>
          <div className="flex justify-between rounded border border-[#232733] bg-[#161922] px-2 py-1.5">
            <span className="text-[#868c9b]">Book State · PIQ Badge</span>
            <span
              data-testid="oms-book-state-badge"
              className={bookStateTextClass(bookState)}
            >
              {BOOK_STATE_LABELS[bookState] ?? "UNKNOWN"} ·{" "}
              {provenanceTier === ProvenanceTier.ExactL3Mbo ? "[EXACT MBO]" : "[Est / Max]"}
            </span>
          </div>
          <ul className="space-y-1 pt-0.5" aria-label="5-tier provenance ledger">
            {PROVENANCE_LADDER.map((row) => {
              const active = row.tier === provenanceTier;
              return (
                <li
                  key={row.tier}
                  className={
                    active
                      ? "flex items-center justify-between rounded border border-sky-500/60 bg-sky-950/35 px-2 py-1.5 text-[10px]"
                      : "flex items-center justify-between rounded border border-[#232733] bg-[#161922]/70 px-2 py-1.5 text-[10px] text-[#868c9b]"
                  }
                >
                  <div>
                    <div className={active ? "font-semibold text-sky-200" : "text-[#cfd4e0]"}>
                      T{row.displayTier} · {row.label}
                    </div>
                    <div className="text-[9px] text-[#868c9b]">{row.desc}</div>
                  </div>
                  <span className="rounded bg-[#101217] px-1.5 py-0.5 text-[9px] text-[#cfd4e0]">
                    {active ? "ACTIVE" : row.absorptionAllowed ? "SV-10 OK" : "GATED"}
                  </span>
                </li>
              );
            })}
          </ul>
        </TabsPanel>

        <TabsPanel value="studies" className="min-h-0 flex-1 space-y-2 overflow-y-auto font-mono text-[10px]">
          <div className="flex flex-wrap gap-1">
            <Button
              onClick={() => onRunBuiltinStudy?.("sma", 20)}
              className="rounded border border-sky-500/40 bg-sky-950/40 px-2 py-1 text-[10px] text-sky-200 hover:bg-sky-900/50"
            >
              + SMA(20)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("ema", 9)}
              className="rounded border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-900/50"
            >
              + EMA(9)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("vwap", 1)}
              className="rounded border border-violet-500/40 bg-violet-950/40 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-900/50"
            >
              + VWAP
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("wilder_rsi", 14)}
              className="rounded border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-900/50"
            >
              + RSI(14)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("cvd", 1)}
              className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-900/50"
            >
              + CVD
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("footprint_delta", 1)}
              className="rounded border border-fuchsia-500/40 bg-fuchsia-950/40 px-2 py-1 text-[10px] text-fuchsia-200 hover:bg-fuchsia-900/50"
            >
              + FP Delta
            </Button>
            {activeStudies.length > 0 && (
              <Button
                onClick={() => onClearStudies?.()}
                className="rounded border border-[#2a2f3d] bg-[#161922] px-2 py-1 text-[10px] text-[#cfd4e0] hover:bg-[#1e2330]"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#8c93a4]">
              <label htmlFor="luau-study-input">
                Sandboxed Luau Study (≤ {(poolCapBytes / (1024 * 1024)).toFixed(0)} MiB · No os/io):
              </label>
              <span className="tabular-nums text-[#868c9b]">
                Peak: {(latestLuauPeakBytes / (1024 * 1024)).toFixed(1)} MiB
              </span>
            </div>
            <textarea
              id="luau-study-input"
              value={luauDraft}
              onChange={(e) => setLuauDraft(e.target.value)}
              rows={3}
              className="w-full rounded border border-[#232733] bg-[#161922] p-1.5 font-mono text-[10px] text-[#e6e8ee] focus:outline-2 focus:outline-sky-400"
            />
            <Button
              onClick={() => onRunLuauStudy?.(luauDraft)}
              className="rounded bg-[#e6e8ee] px-2.5 py-1 text-[10px] font-semibold text-[#0c0d11] hover:bg-white"
            >
              Run Luau Study
            </Button>
          </div>

          {studyError && (
            <div className="rounded border border-rose-500/50 bg-rose-950/60 px-2 py-1 text-rose-200">
              {studyError}
            </div>
          )}

          {activeStudies.length > 0 && (
            <ul className="space-y-1">
              {activeStudies.map((st) => {
                const latest = [...st.values].reverse().find((v) => v !== null);
                return (
                  <li
                    key={st.id}
                    className="flex items-center justify-between rounded border border-[#232733] bg-[#161922] px-2 py-1"
                  >
                    <span className="text-[#e6e8ee]">{st.label}</span>
                    <span className="tabular-nums text-[#868c9b]">
                      {latest !== undefined && latest !== null ? latest.toFixed(2) : "—"} ·{" "}
                      {st.overlay ? "OVERLAY" : "OSC"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsPanel>

        <TabsPanel value="settings" className="min-h-0 flex-1 space-y-2 overflow-y-auto font-mono text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#868c9b]">
              5-Level Cascade (Defaults → Global → Workspace → Template → Instance)
            </span>
            <Button
              onClick={() => onExportWorkspaceToml?.()}
              className="shrink-0 rounded border border-[#2a2f3d] bg-[#161922] px-2 py-0.5 text-[10px] text-[#e6e8ee] hover:bg-[#1e2330]"
            >
              Export .atworkspace.toml
            </Button>
          </div>

          <ul className="space-y-1">
            {settings.map((s) => {
              const isEditing = editingSettingKey === s.key;
              return (
                <li
                  key={s.key}
                  className="flex items-center justify-between gap-2 rounded border border-[#232733] bg-[#161922] px-2 py-1"
                >
                  <div className="min-w-0 truncate">
                    <span className="text-[#e6e8ee]">{s.key}</span>
                    <span className="ml-1.5 rounded bg-[#1e2330] px-1 py-0.5 text-[9px] uppercase text-[#868c9b]">
                      {s.source_layer}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <input
                          aria-label={`Override value for ${s.key}`}
                          value={editingSettingValue}
                          onChange={(e) => setEditingSettingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditSetting(s.key);
                            if (e.key === "Escape") setEditingSettingKey(null);
                          }}
                          className="w-20 rounded border border-sky-400/60 bg-[#0c0d11] px-1.5 py-0.5 font-mono text-[10px] text-sky-200 focus:outline-none"
                        />
                        <Button
                          onClick={() => commitEditSetting(s.key)}
                          className="rounded border border-sky-500/60 bg-sky-950/60 px-1.5 py-0.5 text-[9px] text-sky-200 hover:bg-sky-900/60"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => setEditingSettingKey(null)}
                          className="rounded border border-[#2a2f3d] bg-[#161922] px-1.5 py-0.5 text-[9px] text-[#868c9b] hover:text-[#e6e8ee]"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-amber-300">{s.value}</span>
                        {s.locked ? (
                          <span className="rounded border border-emerald-800 bg-emerald-950/60 px-1 py-0.5 text-[9px] text-emerald-300">
                            LOCKED
                          </span>
                        ) : (
                          <>
                            <Button
                              onClick={() => beginEditSetting(s)}
                              className="rounded border border-[#2a2f3d] bg-[#101217] px-1.5 py-0.5 text-[9px] text-[#9aa0ae] hover:text-[#e6e8ee]"
                            >
                              Override
                            </Button>
                            {s.is_overridden && (
                              <Button
                                onClick={() => onResetSetting?.(s.key)}
                                className="rounded border border-[#2a2f3d] bg-[#161922] px-1.5 py-0.5 text-[9px] text-[#cfd4e0] hover:bg-[#1e2330]"
                              >
                                Reset
                              </Button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {exportedToml && (
            <pre
              data-testid="exported-workspace-toml"
              className="max-h-28 overflow-auto rounded border border-[#232733] bg-[#0c0d11] p-2 text-[9px] text-emerald-300"
            >
              {exportedToml}
            </pre>
          )}
        </TabsPanel>
      </Tabs>
    </section>
  );
}
