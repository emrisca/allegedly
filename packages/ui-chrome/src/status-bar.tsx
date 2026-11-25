import {
  BOOK_STATE_LABELS,
  BookState,
  PROVENANCE_TIER_LABELS,
  type BootConfig,
} from "@allegedly/ipc-client";

export interface StatusBarProps {
  transportKind: "tauri" | "loopback-ws" | "offline-sim";
  bootConfig: BootConfig;
  bookState: number;
  provenanceTier: number;
  stateRev: number;
  droppedTotal: number;
  showProvenance?: boolean;
}

function bookStateClasses(bookState: number): { text: string; dot: string } {
  if (bookState === BookState.Live) {
    return { text: "text-emerald-400", dot: "bg-emerald-400" };
  }
  if (bookState === BookState.Rebuilding || bookState === BookState.Stale) {
    return { text: "text-amber-400", dot: "bg-amber-400" };
  }
  return { text: "text-rose-400", dot: "bg-rose-400" };
}

export function StatusBar({
  transportKind,
  bootConfig,
  bookState,
  provenanceTier,
  stateRev,
  droppedTotal,
  showProvenance = true,
}: StatusBarProps) {
  const bookLabel = BOOK_STATE_LABELS[bookState] ?? "UNKNOWN";
  const provLabel = PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN";
  const bookColors = bookStateClasses(bookState);

  return (
    <footer
      aria-label="Terminal status bar"
      className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-3 font-mono text-[11px] text-zinc-400"
    >
      <div className="flex items-center gap-3">
        <span
          data-testid="status-book-indicator"
          className={`flex items-center gap-1.5 ${bookColors.text}`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${bookColors.dot}`} />
          BOOK: {bookLabel}
        </span>
        {showProvenance && (
          <>
            <span className="text-zinc-700">|</span>
            <span data-testid="status-provenance-badge" className="text-sky-300">
              PROVENANCE: {provLabel}
            </span>
          </>
        )}
        <span className="text-zinc-700">|</span>
        <span>TRANSPORT: {transportKind.toUpperCase()}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>DROPS: {droppedTotal}</span>
        <span className="text-zinc-700">|</span>
        <span>STATE_REV: {stateRev}</span>
        <span className="text-zinc-700">|</span>
        <span>
          UPDATES_ON_BOOT: {String(bootConfig.updates_check_on_startup)} (SV-01 OFFLINE)
        </span>
      </div>
    </footer>
  );
}
