import type { ReplayControlAction, ReplaySpeed, ReplayStatusSnapshot } from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import { Toolbar } from "@ui-sdk/react/toolbar";

export interface ReplayBarProps {
  status: ReplayStatusSnapshot;
  onControl: (action: ReplayControlAction) => void;
  onClose?: () => void;
}

const SPEEDS: ReadonlyArray<{ value: ReplaySpeed; label: string }> = [
  { value: "1x", label: "1x" },
  { value: "5x", label: "5x" },
  { value: "50x", label: "50x" },
  { value: "max", label: "Max" },
];

export function ReplayBar({ status, onControl, onClose }: ReplayBarProps) {
  return (
    <Toolbar
      aria-label="Bar replay controls"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2a2e39] bg-[#131722] px-3 py-1.5 text-xs text-[#d1d4dc]"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-[#2962ff]">
          Replay
        </span>
        <span className="mx-1 h-4 w-px bg-[#2a2e39]" aria-hidden="true" />
        <Button
          onClick={() => onControl({ action: status.playing ? "pause" : "play" })}
          aria-label={status.playing ? "Pause replay" : "Play replay"}
          className="h-7 rounded bg-[#2962ff] px-2.5 text-[11px] font-medium text-white hover:bg-[#1e53e5] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        >
          {status.playing ? "Pause" : "Play"}
        </Button>
        <Button
          onClick={() => onControl({ action: "step" })}
          aria-label="Step replay forward"
          className="h-7 rounded px-2 text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        >
          Step
        </Button>
        <Button
          onClick={() => onControl({ action: "reset" })}
          aria-label="Reset replay cursor"
          className="h-7 rounded px-2 text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        >
          Reset
        </Button>

        <span className="mx-1 h-4 w-px bg-[#2a2e39]" aria-hidden="true" />
        <div className="flex items-center gap-0.5" role="group" aria-label="Replay speed">
          {SPEEDS.map((sp) => (
            <Toggle
              key={sp.value}
              pressed={status.speed === sp.value}
              onPressedChange={() => onControl({ action: "set_speed", speed: sp.value })}
              aria-label={`Set replay speed ${sp.label}`}
              className="h-7 rounded px-2 text-[11px] text-[#787b86] hover:bg-[#2a2e39] hover:text-white data-pressed:bg-[#2962ff]/15 data-pressed:text-[#2962ff] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              {sp.label}
            </Toggle>
          ))}
        </div>
      </div>

      <div className="flex min-w-[200px] flex-1 items-center gap-2.5 px-2">
        <input
          type="range"
          min={0}
          max={Math.max(1, status.total_ticks)}
          value={status.cursor}
          aria-label="Replay tick scrubber"
          onChange={(e) =>
            onControl({ action: "seek", cursor: Number.parseInt(e.target.value, 10) || 0 })
          }
          className="h-1 flex-1 cursor-pointer accent-[#2962ff]"
        />
        <span className="text-[11px] tabular-nums text-[#787b86]">
          {status.bars_sealed} bars
        </span>
      </div>

      {onClose && (
        <Button
          onClick={onClose}
          aria-label="Close replay bar"
          className="flex h-7 w-7 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        >
          ✕
        </Button>
      )}
    </Toolbar>
  );
}
