import type { ReplayControlAction, ReplaySpeed, ReplayStatusSnapshot } from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import { Toolbar } from "@ui-sdk/react/toolbar";

export interface ReplayBarProps {
  status: ReplayStatusSnapshot;
  onControl: (action: ReplayControlAction) => void;
}

const SPEEDS: ReadonlyArray<{ value: ReplaySpeed; label: string }> = [
  { value: "1x", label: "1x" },
  { value: "5x", label: "5x" },
  { value: "50x", label: "50x" },
  { value: "max", label: "Max" },
];

export function ReplayBar({ status, onControl }: ReplayBarProps) {
  return (
    <Toolbar
      aria-label="Deterministic tick replay controls"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-mono text-zinc-200"
    >
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-sky-500/40 bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
          REPLAY
        </span>
        <Button
          onClick={() => onControl({ action: status.playing ? "pause" : "play" })}
          aria-label={status.playing ? "Pause replay" : "Play replay"}
          className="h-6 rounded border border-zinc-700 bg-zinc-900 px-2 text-[10px] text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {status.playing ? "Pause" : "Play"}
        </Button>
        <Button
          onClick={() => onControl({ action: "step" })}
          aria-label="Step replay forward"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 text-[10px] text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Step
        </Button>
        <Button
          onClick={() => onControl({ action: "reset" })}
          aria-label="Reset replay cursor"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 text-[10px] text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Reset
        </Button>

        <span className="mx-1 h-4 w-px bg-zinc-800" aria-hidden="true" />
        <div className="flex items-center gap-1" role="group" aria-label="Replay speed">
          {SPEEDS.map((sp) => (
            <Toggle
              key={sp.value}
              pressed={status.speed === sp.value}
              onPressedChange={() => onControl({ action: "set_speed", speed: sp.value })}
              aria-label={`Set replay speed ${sp.label}`}
              className="h-6 rounded border border-zinc-800 bg-zinc-900 px-1.5 text-[10px] text-zinc-400 data-pressed:border-amber-500/70 data-pressed:bg-amber-950/70 data-pressed:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {sp.label}
            </Toggle>
          ))}
        </div>
      </div>

      <div className="flex min-w-[200px] flex-1 items-center gap-2 px-2">
        <input
          type="range"
          min={0}
          max={Math.max(1, status.total_ticks)}
          value={status.cursor}
          aria-label="Replay tick scrubber"
          onChange={(e) =>
            onControl({ action: "seek", cursor: Number.parseInt(e.target.value, 10) || 0 })
          }
          className="h-1.5 flex-1 cursor-pointer accent-amber-400"
        />
        <span className="text-[10px] text-zinc-400">
          {status.cursor}/{status.total_ticks} ticks · {status.bars_sealed} bars
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          onClick={() => onControl({ action: "verify_determinism" })}
          aria-label="Verify cross-speed SV-09 SHA-256 determinism"
          className="h-6 rounded border border-emerald-700/70 bg-emerald-950/60 px-2 text-[10px] text-emerald-200 hover:bg-emerald-900/60 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Verify SV-09
        </Button>
        <span
          data-testid="replay-sha256-badge"
          className={
            status.determinism_verified
              ? "rounded border border-emerald-500/50 bg-emerald-950/80 px-1.5 py-0.5 text-[10px] text-emerald-300"
              : "rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
          }
        >
          SHA-256:{status.sha256_hex.slice(0, 10)}
          {status.determinism_verified ? " ✓ BIT-EXACT" : ""}
        </span>
      </div>
    </Toolbar>
  );
}
