import { useState } from "react";
import {
  BOOK_STATE_LABELS,
  formatFixedE9,
  PROVENANCE_TIER_LABELS,
  ProvenanceTier,
  type BuiltinStudyKind,
  type PaperAccountSnapshot,
  type ResolvedSetting,
  type StudyRunResponse,
} from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";

export interface PaperOmsPanelProps {
  symbol: string;
  account: PaperAccountSnapshot;
  bookState: number;
  provenanceTier: number;
  activeStudies?: StudyRunResponse[];
  studyError?: string | null;
  settings?: ResolvedSetting[];
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
  label: string;
  desc: string;
  absorptionAllowed: boolean;
  exactMbo: boolean;
}> = [
  {
    tier: ProvenanceTier.ExactL3Mbo,
    label: "EXACT: L3-MBO",
    desc: "Native order-by-order exchange feed",
    absorptionAllowed: true,
    exactMbo: true,
  },
  {
    tier: ProvenanceTier.ExactTickAggr,
    label: "EXACT: TICK-AGGR",
    desc: "Tick trades with exchange aggressor side",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.EstimatedL1Quote,
    label: "ESTIMATED: L1-QUOTE",
    desc: "Lee-Ready BBO trade side inference",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.EstimatedTickRule,
    label: "ESTIMATED: TICK-RULE",
    desc: "Prior-tick direction inference",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.SyntheticIntrabar,
    label: "SYNTHETIC: INTRABAR",
    desc: "Coarse OHLCV synthesis (SV-10 triggers gated)",
    absorptionAllowed: false,
    exactMbo: false,
  },
];

const DEFAULT_LUAU_SNIPPET =
  "local out = {}; for i = 1, #close do out[i] = i == 1 and close[i] or (close[i] + close[i-1]) / 2 end; return out";

export function PaperOmsPanel({
  symbol,
  account,
  bookState,
  provenanceTier,
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
  const rawPos = account.net_position_e9[symbol] ?? "0";
  const netPos = formatFixedE9(BigInt(rawPos), 3);

  return (
    <section
      aria-label="Paper execution, studies, provenance, and settings"
      className="flex h-full w-full flex-col bg-zinc-950 p-3 text-xs text-zinc-100"
    >
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/40">
            {account.mode}
          </span>
          <span className="text-zinc-400">NET {symbol}:</span>
          <span className="font-semibold text-zinc-100">{netPos}</span>
        </div>
        <Button
          onClick={onKillSwitch}
          className="rounded border border-rose-500/40 bg-rose-950/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-200 hover:bg-rose-900"
        >
          Cancel All
        </Button>
      </div>

      <Tabs defaultValue="ticket" className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="Execution and desk panel tabs" className="mb-2 flex flex-wrap gap-1">
          <TabsTab
            value="ticket"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Paper Ticket
          </TabsTab>
          <TabsTab
            value="orders"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Journal ({account.orders.length})
          </TabsTab>
          <TabsTab
            value="provenance"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Provenance
          </TabsTab>
          <TabsTab
            value="studies"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Studies ({activeStudies.length})
          </TabsTab>
          <TabsTab
            value="settings"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            TOML Cascade
          </TabsTab>
        </TabsList>

        <TabsPanel value="ticket" className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => onSubmitOrder("buy", "market")}
              className="rounded bg-emerald-600 px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-500"
            >
              BUY MKT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("sell", "market")}
              className="rounded bg-rose-600 px-2.5 py-1.5 font-mono text-xs font-semibold text-white hover:bg-rose-500"
            >
              SELL MKT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("buy", "limit")}
              className="rounded border border-emerald-700 bg-emerald-950/60 px-2.5 py-1.5 font-mono text-xs text-emerald-200 hover:bg-emerald-900/60"
            >
              BUY LMT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("sell", "limit")}
              className="rounded border border-rose-700 bg-rose-950/60 px-2.5 py-1.5 font-mono text-xs text-rose-200 hover:bg-rose-900/60"
            >
              SELL LMT 0.50
            </Button>
          </div>
          <p className="font-mono text-[10px] text-zinc-400">
            LIVE_ARMED = false · LocalPaperAdapter only · Zero broker network egress (ADR-0009).
          </p>
        </TabsPanel>

        <TabsPanel value="orders" className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
          {account.orders.length === 0 ? (
            <p className="py-3 text-zinc-400">No paper orders submitted yet.</p>
          ) : (
            <ul className="space-y-1">
              {account.orders.slice(0, 10).map((ord) => (
                <li
                  key={ord.order_id}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1"
                >
                  <span className={ord.side === "buy" ? "text-emerald-300" : "text-rose-300"}>
                    {ord.order_id} · {ord.side.toUpperCase()} {ord.order_type.toUpperCase()}
                  </span>
                  <span className="text-zinc-300">
                    {formatFixedE9(BigInt(ord.qty_e9), 2)} · {ord.status.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsPanel>

        <TabsPanel value="provenance" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto font-mono text-[11px]">
          <div className="flex justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
            <span className="text-zinc-400">Active Tier</span>
            <span className="text-sky-300">{PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN"}</span>
          </div>
          <div className="flex justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
            <span className="text-zinc-400">Book State · PIQ Badge</span>
            <span className="text-emerald-300">
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
                      ? "flex items-center justify-between rounded border border-sky-500/60 bg-sky-950/40 px-2 py-1 text-[10px]"
                      : "flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-400"
                  }
                >
                  <div>
                    <div className={active ? "font-semibold text-sky-200" : "text-zinc-300"}>
                      T{row.tier} · {row.label}
                    </div>
                    <div className="text-[9px] text-zinc-400">{row.desc}</div>
                  </div>
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-300">
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
              className="rounded border border-sky-700/70 bg-sky-950/60 px-2 py-1 text-[10px] text-sky-200 hover:bg-sky-900/60"
            >
              + SMA(20)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("ema", 9)}
              className="rounded border border-amber-700/70 bg-amber-950/60 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-900/60"
            >
              + EMA(9)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("vwap", 1)}
              className="rounded border border-violet-700/70 bg-violet-950/60 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-900/60"
            >
              + VWAP
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("wilder_rsi", 14)}
              className="rounded border border-emerald-700/70 bg-emerald-950/60 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-900/60"
            >
              + RSI(14)
            </Button>
            {activeStudies.length > 0 && (
              <Button
                onClick={() => onClearStudies?.()}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="luau-study-input" className="block text-[10px] text-zinc-400">
              Sandboxed Luau Study (≤ 64 MiB Global Pool · No os/io):
            </label>
            <textarea
              id="luau-study-input"
              value={luauDraft}
              onChange={(e) => setLuauDraft(e.target.value)}
              rows={2}
              className="w-full rounded border border-zinc-800 bg-zinc-900 p-1.5 font-mono text-[10px] text-zinc-200 focus:outline-2 focus:outline-amber-400"
            />
            <Button
              onClick={() => onRunLuauStudy?.(luauDraft)}
              className="rounded bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-zinc-950 hover:bg-amber-400"
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
                    className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1"
                  >
                    <span className="text-zinc-200">{st.label}</span>
                    <span className="text-zinc-400">
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
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">
              5-Level Cascade (Defaults → Global → Workspace → Template → Instance)
            </span>
            <Button
              onClick={() => onExportWorkspaceToml?.()}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-800"
            >
              Export .atworkspace.toml
            </Button>
          </div>

          <ul className="space-y-1">
            {settings.map((s) => (
              <li
                key={s.key}
                className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1"
              >
                <div className="min-w-0 truncate">
                  <span className="text-zinc-200">{s.key}</span>
                  <span className="ml-1.5 rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">
                    {s.source_layer}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-300">{s.value}</span>
                  {s.locked ? (
                    <span className="rounded border border-emerald-800 bg-emerald-950/60 px-1 py-0.5 text-[9px] text-emerald-300">
                      LOCKED
                    </span>
                  ) : s.is_overridden ? (
                    <Button
                      onClick={() => onResetSetting?.(s.key)}
                      className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-300 hover:bg-zinc-800"
                    >
                      Reset
                    </Button>
                  ) : (
                    <Button
                      onClick={() =>
                        onUpdateSetting?.(
                          s.key,
                          s.key === "orderflow.imbalance_ratio_bps"
                            ? "35000"
                            : s.key === "ui.density"
                              ? '"comfortable"'
                              : s.value,
                        )
                      }
                      className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:text-zinc-200"
                    >
                      Override
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {exportedToml && (
            <pre
              data-testid="exported-workspace-toml"
              className="max-h-28 overflow-auto rounded border border-zinc-800 bg-black/70 p-2 text-[9px] text-emerald-300"
            >
              {exportedToml}
            </pre>
          )}
        </TabsPanel>
      </Tabs>
    </section>
  );
}
