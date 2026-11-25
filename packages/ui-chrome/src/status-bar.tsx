import { useEffect, useState } from "react";
import {
  BOOK_STATE_LABELS,
  BookState,
  PROVENANCE_TIER_LABELS,
  type BootConfig,
} from "@allegedly/ipc-client";

export type QuickRangePreset = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";

export interface StatusBarProps {
  transportKind: "tauri" | "loopback-ws" | "offline-sim";
  bootConfig: BootConfig;
  bookState: number;
  provenanceTier: number;
  stateRev: number;
  droppedTotal: number;
  showProvenance?: boolean;
  activeRange?: QuickRangePreset;
  onSelectRange?: (range: QuickRangePreset) => void;
  autoScale?: boolean;
  onToggleAutoScale?: () => void;
  logScale?: boolean;
  onToggleLogScale?: () => void;
}

const RANGES: readonly QuickRangePreset[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "All"];

function bookStateClasses(bookState: number): { text: string; dot: string } {
  if (bookState === BookState.Live) {
    return { text: "text-emerald-400", dot: "bg-emerald-400" };
  }
  if (bookState === BookState.Rebuilding || bookState === BookState.Stale) {
    return { text: "text-amber-400", dot: "bg-amber-400" };
  }
  return { text: "text-rose-400", dot: "bg-rose-400" };
}

function formatClock(): string {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offsetMin) / 60);
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${timeStr} UTC${sign}${hours}`;
}

export function StatusBar({
  transportKind,
  bootConfig,
  bookState,
  provenanceTier,
  stateRev,
  droppedTotal,
  showProvenance = true,
  activeRange = "All",
  onSelectRange,
  autoScale = true,
  onToggleAutoScale,
  logScale = false,
  onToggleLogScale,
}: StatusBarProps) {
  const [clock, setClock] = useState<string>(() => formatClock());

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const bookLabel = BOOK_STATE_LABELS[bookState] ?? "UNKNOWN";
  const provLabel = PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN";
  const bookColors = bookStateClasses(bookState);

  return (
    <footer
      aria-label="Terminal status bar"
      className="flex h-7 shrink-0 items-center justify-between border-t border-[#232733] bg-[#101217] px-2.5 text-[11px] text-[#868c9b] select-none"
    >
      {/* Left: Quick Date Ranges (1D 5D 1M 3M 6M YTD 1Y All — matches screenshot!) */}
      <div className="flex items-center gap-0.5">
        {RANGES.map((rng) => {
          const selected = activeRange === rng;
          return (
            <button
              key={rng}
              type="button"
              onClick={() => onSelectRange?.(rng)}
              className={
                selected
                  ? "rounded px-1.5 py-0.5 font-medium text-[#f1f3f8] bg-[#232733]"
                  : "rounded px-1.5 py-0.5 font-medium text-[#8c93a4] hover:bg-[#1a1d26] hover:text-[#e6e8ee]"
              }
            >
              {rng}
            </button>
          );
        })}

        <span className="mx-2 h-3.5 w-px bg-[#232733]" aria-hidden="true" />

        <span
          data-testid="status-book-indicator"
          className={`flex items-center gap-1.5 font-mono text-[10px] ${bookColors.text}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${bookColors.dot}`} />
          BOOK: {bookLabel}
        </span>

        {showProvenance && (
          <>
            <span className="mx-1.5 text-[#2c3140]" aria-hidden="true">|</span>
            <span
              data-testid="status-provenance-badge"
              className="hidden font-mono text-[10px] text-[#9aa1b2] md:inline"
            >
              {provLabel}
            </span>
          </>
        )}
      </div>

      {/* Right: Clock, Transport/Offline status, LOG / AUTO scale quick buttons */}
      <div className="flex items-center gap-2.5 font-mono text-[10px] tabular-nums">
        <span className="hidden text-[#868c9b] lg:inline">
          {transportKind.toUpperCase()} · rev {stateRev} · drops {droppedTotal}
        </span>
        <span className="hidden text-[#2c3140] lg:inline" aria-hidden="true">|</span>
        <span className="text-[#b8becd]">{clock}</span>
        <span className="text-[#2c3140]" aria-hidden="true">|</span>
        <span
          title={`updates.checkOnStartup = ${String(bootConfig.updates_check_on_startup)} (SV-01 offline boot)`}
          className="text-[#868c9b]"
        >
          UPDATES_ON_BOOT: {String(bootConfig.updates_check_on_startup)}
        </span>
        {onToggleLogScale && (
          <button
            type="button"
            onClick={onToggleLogScale}
            aria-pressed={logScale}
            className={
              logScale
                ? "rounded bg-[#292e3b] px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
                : "rounded px-1.5 py-0.5 text-[10px] text-[#8c93a4] hover:bg-[#1c202b] hover:text-white"
            }
          >
            log
          </button>
        )}
        {onToggleAutoScale && (
          <button
            type="button"
            onClick={onToggleAutoScale}
            aria-pressed={autoScale}
            className={
              autoScale
                ? "rounded bg-[#292e3b] px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
                : "rounded px-1.5 py-0.5 text-[10px] text-[#8c93a4] hover:bg-[#1c202b] hover:text-white"
            }
          >
            auto
          </button>
        )}
      </div>
    </footer>
  );
}
