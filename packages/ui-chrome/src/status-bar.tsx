import {
  BOOK_STATE_LABELS,
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
}

export function StatusBar({
  transportKind,
  bootConfig,
  bookState,
  provenanceTier,
  stateRev,
  droppedTotal,
}: StatusBarProps) {
  const bookLabel = BOOK_STATE_LABELS[bookState] ?? "UNKNOWN";
  const provLabel = PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN";

  return (
    <footer
      aria-label="Terminal status bar"
      className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-3 font-mono text-[11px] text-zinc-400"
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
          BOOK: {bookLabel}
        </span>
        <span className="text-zinc-700">|</span>
        <span className="text-sky-300">PROVENANCE: {provLabel}</span>
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
