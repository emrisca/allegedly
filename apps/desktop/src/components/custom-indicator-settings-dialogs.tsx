import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { ColorPickerButton } from "@allegedly/ui-chrome";
import {
  cloneVwapKeyLevelsConfig,
  DEFAULT_VWAP_KEY_LEVELS_CONFIG,
  type VwapKeyLevelsConfig,
  type VwapSourceKind,
} from "../indicators/vwap-key-levels";
import {
  cloneTradingSessionsConfig,
  DEFAULT_TRADING_SESSIONS_CONFIG,
  type SessionTimezone,
  type TradingSessionsConfig,
} from "../indicators/trading-sessions";

const SECTION_HDR =
  "mb-2 mt-4 first:mt-0 text-[10px] font-semibold uppercase tracking-wider text-[#787e8d]";
const CHECKBOX_CLS =
  "h-4 w-4 cursor-pointer rounded border border-[#3c414f] bg-[#181a20] accent-[#2962ff]";
const INPUT_CLS =
  "h-8 rounded-md border border-[#323642] bg-[#111318] px-2.5 font-mono text-[12px] text-[#f0f3fa] focus:border-[#2962ff] focus:outline-none";

// ── 1. VWAP KEY LEVELS SETTINGS DIALOG ───────────────────────────────────────

export interface VwapKeyLevelsSettingsDialogProps {
  open: boolean;
  config: VwapKeyLevelsConfig;
  onOpenChange: (open: boolean) => void;
  onChange: (next: VwapKeyLevelsConfig) => void;
}

export function VwapKeyLevelsSettingsDialog({
  open,
  config,
  onOpenChange,
  onChange,
}: VwapKeyLevelsSettingsDialogProps) {
  const [snapshot, setSnapshot] = useState<VwapKeyLevelsConfig>(() =>
    cloneVwapKeyLevelsConfig(config),
  );

  useEffect(() => {
    if (open) {
      setSnapshot(cloneVwapKeyLevelsConfig(config));
    }
  }, [open]);

  const patch = (partial: Partial<VwapKeyLevelsConfig>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
      <DialogContent className="fixed left-1/2 top-1/2 z-50 flex max-h-[84vh] w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-[0_24px_64px_rgba(0,0,0,0.72)]">
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-[var(--app-border,#262a34)] px-5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-[#f0f3fa]">
              VWAP Key Levels
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure Monthly, Weekly, Previous Week, and Yearly VWAP and VAH/VAL levels, placement, and colors.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close VWAP Key Levels settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#2a2e39] hover:text-white"
          >
            ×
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[12.5px]">
          <div className={SECTION_HDR}>VWAP • General</div>
          <div className="flex items-center justify-between gap-3 py-1">
            <label htmlFor="vwap-kl-source" className="text-[#d4d8e2]">
              VWAP source
            </label>
            <select
              id="vwap-kl-source"
              value={config.source}
              onChange={(e) => patch({ source: e.target.value as VwapSourceKind })}
              className={`${INPUT_CLS} w-36 font-sans`}
            >
              <option value="hlc3">hlc3</option>
              <option value="close">close</option>
              <option value="open">open</option>
              <option value="high">high</option>
              <option value="low">low</option>
              <option value="hl2">hl2</option>
              <option value="ohlc4">ohlc4</option>
            </select>
          </div>

          <div className={SECTION_HDR}>VWAP • Right-Side Key Levels</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showMonthly}
                onChange={(e) => patch({ showMonthly: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Monthly levels (mVAH / mVWAP / mVAL)</span>
            </label>
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showPreviousWeek}
                onChange={(e) => patch({ showPreviousWeek: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Previous week levels (pwVAH / pwVWAP / pwVAL)</span>
            </label>
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showWeekly}
                onChange={(e) => patch({ showWeekly: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Current week levels (wVAH / wVWAP / wVAL)</span>
            </label>
          </div>

          <div className={SECTION_HDR}>VWAP • Placement</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="block text-[11px] text-[#9aa1b2]">Level line length (bars)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={config.lineBars}
                onChange={(e) =>
                  patch({
                    lineBars: Math.min(200, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className={`${INPUT_CLS} w-full`}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] text-[#9aa1b2]">Right offset (bars)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={config.rightOffset}
                onChange={(e) =>
                  patch({
                    rightOffset: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className={`${INPUT_CLS} w-full`}
              />
            </label>
          </div>

          <div className={SECTION_HDR}>Traditional Continuous VWAPs</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showTraditionalMonthly}
                onChange={(e) => patch({ showTraditionalMonthly: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Traditional Monthly VWAP + VAH/VAL</span>
            </label>
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showTraditionalYearly}
                onChange={(e) => patch({ showTraditionalYearly: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Traditional Yearly VWAP + VAH/VAL</span>
            </label>
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showTraditionalWeekly}
                onChange={(e) => patch({ showTraditionalWeekly: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Traditional Weekly VWAP + VAH/VAL</span>
            </label>
          </div>

          <div className={SECTION_HDR}>VWAP • Colors</div>
          <div className="space-y-2 rounded-lg border border-[#2a2e39] bg-[#161922] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[#d4d8e2]">Monthly VWAP / Bands</span>
              <div className="flex items-center gap-2">
                <ColorPickerButton
                  ariaLabel="Monthly VWAP color"
                  value={config.monthVwapColor}
                  onChange={(monthVwapColor) => patch({ monthVwapColor })}
                />
                <ColorPickerButton
                  ariaLabel="Monthly VAH and VAL color"
                  value={config.monthBandColor}
                  onChange={(monthBandColor) => patch({ monthBandColor })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#d4d8e2]">Prev Week &amp; Yearly / Bands</span>
              <div className="flex items-center gap-2">
                <ColorPickerButton
                  ariaLabel="Previous week and yearly VWAP color"
                  value={config.prevVwapColor}
                  onChange={(prevVwapColor) => patch({ prevVwapColor })}
                />
                <ColorPickerButton
                  ariaLabel="Previous week and yearly VAH VAL color"
                  value={config.prevBandColor}
                  onChange={(prevBandColor) => patch({ prevBandColor })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#d4d8e2]">Weekly VWAP / Bands</span>
              <div className="flex items-center gap-2">
                <ColorPickerButton
                  ariaLabel="Weekly VWAP color"
                  value={config.weekVwapColor}
                  onChange={(weekVwapColor) => patch({ weekVwapColor })}
                />
                <ColorPickerButton
                  ariaLabel="Weekly VAH and VAL color"
                  value={config.weekBandColor}
                  onChange={(weekBandColor) => patch({ weekBandColor })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-13 shrink-0 items-center justify-between border-t border-[var(--app-border,#262a34)] px-5">
          <button
            type="button"
            onClick={() => onChange(cloneVwapKeyLevelsConfig(DEFAULT_VWAP_KEY_LEVELS_CONFIG))}
            className="h-8 rounded-md border border-[#323642] bg-[#181a20] px-3 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#23262f] hover:text-white"
          >
            Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(cloneVwapKeyLevelsConfig(snapshot));
                onOpenChange(false);
              }}
              className="h-8 rounded-md border border-[#323642] bg-[#181a20] px-3.5 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#23262f]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-md bg-[#2962ff] px-4 text-[12px] font-semibold text-white hover:bg-[#1e53e5]"
            >
              Ok
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 2. TRADING SESSIONS SETTINGS DIALOG ──────────────────────────────────────

export interface TradingSessionsSettingsDialogProps {
  open: boolean;
  config: TradingSessionsConfig;
  onOpenChange: (open: boolean) => void;
  onChange: (next: TradingSessionsConfig) => void;
}

export function TradingSessionsSettingsDialog({
  open,
  config,
  onOpenChange,
  onChange,
}: TradingSessionsSettingsDialogProps) {
  const [snapshot, setSnapshot] = useState<TradingSessionsConfig>(() =>
    cloneTradingSessionsConfig(config),
  );

  useEffect(() => {
    if (open) {
      setSnapshot(cloneTradingSessionsConfig(config));
    }
  }, [open]);

  const patch = (partial: Partial<TradingSessionsConfig>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
      <DialogContent className="fixed left-1/2 top-1/2 z-50 flex max-h-[84vh] w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-[0_24px_64px_rgba(0,0,0,0.72)]">
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-[var(--app-border,#262a34)] px-5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-[#f0f3fa]">
              Trading Sessions
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure Tokyo, London, and New York trading session highlight boxes, timezone, hours, transparency, and labels.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close Trading Sessions settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#2a2e39] hover:text-white"
          >
            ×
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[12.5px]">
          <div className={SECTION_HDR}>Timezone</div>
          <div className="flex items-center justify-between gap-3 py-1">
            <label htmlFor="sessions-tz" className="text-[#d4d8e2]">
              Session hours timezone
            </label>
            <select
              id="sessions-tz"
              value={config.timezone}
              onChange={(e) => patch({ timezone: e.target.value as SessionTimezone })}
              className={`${INPUT_CLS} w-48 font-sans`}
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="Etc/UTC">Etc/UTC</option>
            </select>
          </div>

          <div className={SECTION_HDR}>Sessions (HHMM-HHMM)</div>
          <div className="space-y-2.5 rounded-lg border border-[#2a2e39] bg-[#161922] p-3">
            {/* Tokyo */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-w-[100px] items-center gap-2 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={config.showTokyo}
                  onChange={(e) => patch({ showTokyo: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Tokyo</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="Tokyo session hours"
                  value={config.tokyoHours}
                  onChange={(e) => patch({ tokyoHours: e.target.value })}
                  className={`${INPUT_CLS} w-28`}
                />
                <ColorPickerButton
                  ariaLabel="Tokyo session color"
                  value={config.tokyoColor}
                  onChange={(tokyoColor) => patch({ tokyoColor })}
                />
              </div>
            </div>

            {/* London */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-w-[100px] items-center gap-2 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={config.showLondon}
                  onChange={(e) => patch({ showLondon: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>London</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="London session hours"
                  value={config.londonHours}
                  onChange={(e) => patch({ londonHours: e.target.value })}
                  className={`${INPUT_CLS} w-28`}
                />
                <ColorPickerButton
                  ariaLabel="London session color"
                  value={config.londonColor}
                  onChange={(londonColor) => patch({ londonColor })}
                />
              </div>
            </div>

            {/* New York */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-w-[100px] items-center gap-2 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={config.showNewYork}
                  onChange={(e) => patch({ showNewYork: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>New York</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="New York session hours"
                  value={config.newYorkHours}
                  onChange={(e) => patch({ newYorkHours: e.target.value })}
                  className={`${INPUT_CLS} w-28`}
                />
                <ColorPickerButton
                  ariaLabel="New York session color"
                  value={config.newYorkColor}
                  onChange={(newYorkColor) => patch({ newYorkColor })}
                />
              </div>
            </div>
          </div>

          <div className={SECTION_HDR}>Style</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="sessions-transparency" className="text-[#d4d8e2]">
                Background transparency
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  id="sessions-transparency"
                  type="range"
                  min={0}
                  max={100}
                  value={config.transparency}
                  onChange={(e) => patch({ transparency: Number(e.target.value) })}
                  className="w-32 accent-[#2962ff]"
                />
                <span className="w-9 text-right font-mono text-[11px] tabular-nums text-[#b2b5be]">
                  {config.transparency}%
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showSessionNames}
                onChange={(e) => patch({ showSessionNames: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Show session names (Tokyo / London / New York)</span>
            </label>
          </div>
        </div>

        <div className="flex h-13 shrink-0 items-center justify-between border-t border-[var(--app-border,#262a34)] px-5">
          <button
            type="button"
            onClick={() => onChange(cloneTradingSessionsConfig(DEFAULT_TRADING_SESSIONS_CONFIG))}
            className="h-8 rounded-md border border-[#323642] bg-[#181a20] px-3 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#23262f] hover:text-white"
          >
            Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(cloneTradingSessionsConfig(snapshot));
                onOpenChange(false);
              }}
              className="h-8 rounded-md border border-[#323642] bg-[#181a20] px-3.5 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#23262f]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-md bg-[#2962ff] px-4 text-[12px] font-semibold text-white hover:bg-[#1e53e5]"
            >
              Ok
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
