import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { ColorPickerButton, UiButton, UiInput, UiSelect } from "@allegedly/ui-chrome";
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
  "mb-2.5 mt-5 first:mt-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#787b86]";
const CHECKBOX_CLS =
  "h-4 w-4 cursor-pointer rounded border border-[#4a4f5e] bg-transparent accent-[#f0f3fa]";

function splitHours(spec: string): [string, string] {
  const m = /^\s*(\d{2}):?(\d{2})\s*-\s*(\d{2}):?(\d{2})\s*$/.exec(spec);
  if (!m) return ["09:30", "16:00"];
  return [`${m[1]}:${m[2]}`, `${m[3]}:${m[4]}`];
}

function joinHours(startHHMM: string, endHHMM: string): string {
  const s = startHHMM.replace(":", "").padEnd(4, "0").slice(0, 4);
  const e = endHHMM.replace(":", "").padEnd(4, "0").slice(0, 4);
  return `${s}-${e}`;
}

function SessionTimeRangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [start, end] = splitHours(value);
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12.5px] text-[#d4d8e2]">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="relative flex items-center">
          <input
            type="time"
            aria-label={`${label} start`}
            value={start}
            onChange={(e) => onChange(joinHours(e.target.value, end))}
            className="h-8 w-[104px] rounded-md border border-[var(--app-border,#323642)] bg-[#111318] px-2.5 font-mono text-[12px] text-[#f0f3fa] focus:border-[var(--app-accent,#2962ff)] focus:outline-none"
          />
        </div>
        <span className="text-[#787b86]">—</span>
        <div className="relative flex items-center">
          <input
            type="time"
            aria-label={`${label} end`}
            value={end}
            onChange={(e) => onChange(joinHours(start, e.target.value))}
            className="h-8 w-[104px] rounded-md border border-[var(--app-border,#323642)] bg-[#111318] px-2.5 font-mono text-[12px] text-[#f0f3fa] focus:border-[var(--app-accent,#2962ff)] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

// ── 1. VWAP KEY LEVELS SETTINGS DIALOG (Matches TradingView Screenshots 2 & 3) ──

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
  const [tab, setTab] = useState<"inputs" | "style" | "visibility">("inputs");

  useEffect(() => {
    if (open) {
      setSnapshot(cloneVwapKeyLevelsConfig(config));
      setTab("inputs");
    }
  }, [open]);

  const patch = (partial: Partial<VwapKeyLevelsConfig>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
      <DialogContent className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(430px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#16181f)] text-[#d1d4dc] shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between px-5 pt-1">
          <DialogTitle className="text-[16px] font-semibold tracking-tight text-[#f0f3fa]">
            VWAP Key Levels
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure Monthly, Previous Week, Current Week, and Traditional VWAP levels, placement, and colors.
          </DialogDescription>
          <DialogClose
            aria-label="Close VWAP Key Levels settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#2a2e39] hover:text-white"
          >
            ×
          </DialogClose>
        </div>

        {/* Inputs / Style / Visibility Tab Bar */}
        <div className="flex shrink-0 items-center gap-5 border-b border-[var(--app-border,#262a34)] px-5 text-[13px]">
          {(
            [
              { id: "inputs", label: "Inputs" },
              { id: "style", label: "Style" },
              { id: "visibility", label: "Visibility" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "border-b-2 border-[#f0f3fa] pb-2 pt-1 font-medium text-[#f0f3fa]"
                  : "border-b-2 border-transparent pb-2 pt-1 font-medium text-[#868993] hover:text-[#d1d4dc]"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[12.5px]">
          {tab === "inputs" && (
            <div>
              <div className={SECTION_HDR}>VWAP • GENERAL</div>
              <div className="flex items-center justify-between gap-3 py-1">
                <label htmlFor="vwap-kl-source" className="text-[#d4d8e2]">
                  VWAP source
                </label>
                <UiSelect
                  id="vwap-kl-source"
                  value={config.source}
                  onChange={(e) => patch({ source: e.target.value as VwapSourceKind })}
                  className="w-40"
                >
                  <option value="hlc3">(H + L + C) / 3</option>
                  <option value="close">Close</option>
                  <option value="open">Open</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="hl2">(H + L) / 2</option>
                  <option value="ohlc4">(O + H + L + C) / 4</option>
                </UiSelect>
              </div>

              <div className={SECTION_HDR}>VWAP • VISIBILITY</div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={config.showMonthly}
                    onChange={(e) => patch({ showMonthly: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Monthly levels</span>
                </label>
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={config.showPreviousWeek}
                    onChange={(e) => patch({ showPreviousWeek: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Previous week levels</span>
                </label>
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={config.showWeekly}
                    onChange={(e) => patch({ showWeekly: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Current week levels</span>
                </label>
              </div>

              <div className={SECTION_HDR}>VWAP • PLACEMENT</div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="vwap-kl-linebars" className="text-[#d4d8e2]">
                    Level line length (bars)
                  </label>
                  <UiInput
                    id="vwap-kl-linebars"
                    type="number"
                    min={1}
                    max={200}
                    value={config.lineBars}
                    onChange={(e) =>
                      patch({
                        lineBars: Math.min(200, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                    className="!w-32 font-mono"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="vwap-kl-offset" className="text-[#d4d8e2]">
                    Right offset from latest bar (bars)
                  </label>
                  <UiInput
                    id="vwap-kl-offset"
                    type="number"
                    min={0}
                    max={100}
                    value={config.rightOffset}
                    onChange={(e) =>
                      patch({
                        rightOffset: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                    className="!w-32 font-mono"
                  />
                </div>
              </div>

              <div className={SECTION_HDR}>VWAP • COLORS</div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#d4d8e2]">Monthly VWAP</span>
                  <ColorPickerButton
                    ariaLabel="Monthly VWAP color"
                    value={config.monthVwapColor}
                    onChange={(monthVwapColor) => patch({ monthVwapColor })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#d4d8e2]">Monthly VAH / VAL</span>
                  <ColorPickerButton
                    ariaLabel="Monthly VAH and VAL color"
                    value={config.monthBandColor}
                    onChange={(monthBandColor) => patch({ monthBandColor })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#d4d8e2]">Previous week VWAP</span>
                  <ColorPickerButton
                    ariaLabel="Previous week VWAP color"
                    value={config.prevVwapColor}
                    onChange={(prevVwapColor) => patch({ prevVwapColor })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#d4d8e2]">Previous week VAH / VAL</span>
                  <ColorPickerButton
                    ariaLabel="Previous week VAH and VAL color"
                    value={config.prevBandColor}
                    onChange={(prevBandColor) => patch({ prevBandColor })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#d4d8e2]">Weekly VWAP</span>
                  <ColorPickerButton
                    ariaLabel="Weekly VWAP color"
                    value={config.weekVwapColor}
                    onChange={(weekVwapColor) => patch({ weekVwapColor })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#d4d8e2]">Weekly VAH / VAL</span>
                  <ColorPickerButton
                    ariaLabel="Weekly VAH and VAL color"
                    value={config.weekBandColor}
                    onChange={(weekBandColor) => patch({ weekBandColor })}
                  />
                </div>
              </div>

              <div className={SECTION_HDR}>TRADITIONAL VWAPS</div>
              <div className="space-y-2.5">
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
            </div>
          )}

          {tab === "style" && (
            <div className="space-y-3 text-[12px] text-[#9aa1b2]">
              <p>
                Right-side key level tags (<code>mVAH/mVWAP/mVAL</code>, <code>pwVAH/pwVWAP/pwVAL</code>, <code>wVAH/wVWAP/wVAL</code>) stay anchored strictly to the latest candle + right offset bars.
              </p>
              <p>Customize each VWAP &amp; VAH/VAL color under the Inputs tab.</p>
            </div>
          )}

          {tab === "visibility" && (
            <div className="space-y-2 text-[12px] text-[#9aa1b2]">
              <p>Visible across all chart timeframes (Ticks, Seconds, Minutes, Hours, Days, Weeks, Months).</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-13 shrink-0 items-center justify-between border-t border-[var(--app-border,#262a34)] px-5">
          <UiButton
            variant="outline"
            size="sm"
            onClick={() => onChange(cloneVwapKeyLevelsConfig(DEFAULT_VWAP_KEY_LEVELS_CONFIG))}
          >
            Defaults
          </UiButton>
          <div className="flex items-center gap-2">
            <UiButton
              variant="outline"
              size="sm"
              onClick={() => {
                onChange(cloneVwapKeyLevelsConfig(snapshot));
                onOpenChange(false);
              }}
            >
              Cancel
            </UiButton>
            <UiButton
              variant="default"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="!bg-[#f0f3fa] !text-[#111318] hover:!bg-white"
            >
              Ok
            </UiButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 2. TRADING SESSIONS SETTINGS DIALOG (Matches TradingView Screenshot 4) ────

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
      <DialogContent className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(450px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#16181f)] text-[#d1d4dc] shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--app-border,#262a34)] px-5">
          <div>
            <DialogTitle className="text-[16px] font-semibold tracking-tight text-[#f0f3fa]">
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
          <div className={SECTION_HDR}>TRADING SESSIONS</div>
          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showSessions}
                onChange={(e) => patch({ showSessions: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Show trading sessions</span>
            </label>
            <div className="flex items-center justify-between gap-3 py-0.5">
              <label htmlFor="sessions-tz" className="text-[#d4d8e2]">
                Timezone for session hours
              </label>
              <UiSelect
                id="sessions-tz"
                value={config.timezone}
                onChange={(e) => patch({ timezone: e.target.value as SessionTimezone })}
                className="w-44"
              >
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="Etc/UTC">Etc/UTC</option>
              </UiSelect>
            </div>
          </div>

          <div className={SECTION_HDR}>TRADING SESSIONS • VISIBILITY</div>
          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showTokyo}
                onChange={(e) => patch({ showTokyo: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Tokyo</span>
            </label>
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showLondon}
                onChange={(e) => patch({ showLondon: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>London</span>
            </label>
            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showNewYork}
                onChange={(e) => patch({ showNewYork: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>New York</span>
            </label>
          </div>

          <div className={SECTION_HDR}>TRADING SESSIONS • TOKYO</div>
          <div className="space-y-2">
            <SessionTimeRangeInput
              label="Tokyo hours"
              value={config.tokyoHours}
              onChange={(tokyoHours) => patch({ tokyoHours })}
            />
            <div className="flex items-center justify-between">
              <span className="text-[#d4d8e2]">Tokyo color</span>
              <ColorPickerButton
                ariaLabel="Tokyo session color"
                value={config.tokyoColor}
                onChange={(tokyoColor) => patch({ tokyoColor })}
              />
            </div>
          </div>

          <div className={SECTION_HDR}>TRADING SESSIONS • LONDON</div>
          <div className="space-y-2">
            <SessionTimeRangeInput
              label="London hours"
              value={config.londonHours}
              onChange={(londonHours) => patch({ londonHours })}
            />
            <div className="flex items-center justify-between">
              <span className="text-[#d4d8e2]">London color</span>
              <ColorPickerButton
                ariaLabel="London session color"
                value={config.londonColor}
                onChange={(londonColor) => patch({ londonColor })}
              />
            </div>
          </div>

          <div className={SECTION_HDR}>TRADING SESSIONS • NEW YORK</div>
          <div className="space-y-2">
            <SessionTimeRangeInput
              label="New York hours"
              value={config.newYorkHours}
              onChange={(newYorkHours) => patch({ newYorkHours })}
            />
            <div className="flex items-center justify-between">
              <span className="text-[#d4d8e2]">New York color</span>
              <ColorPickerButton
                ariaLabel="New York session color"
                value={config.newYorkColor}
                onChange={(newYorkColor) => patch({ newYorkColor })}
              />
            </div>
          </div>

          <div className={SECTION_HDR}>TRADING SESSIONS • STYLE</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="sessions-transparency" className="text-[#d4d8e2]">
                Background transparency
              </label>
              <UiInput
                id="sessions-transparency"
                type="number"
                min={0}
                max={100}
                value={config.transparency}
                onChange={(e) =>
                  patch({
                    transparency: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="!w-32 font-mono"
              />
            </div>

            <label className="flex items-center gap-2.5 text-[#d4d8e2]">
              <input
                type="checkbox"
                checked={config.showSessionNames}
                onChange={(e) => patch({ showSessionNames: e.target.checked })}
                className={CHECKBOX_CLS}
              />
              <span>Show session names</span>
            </label>
          </div>
        </div>

        <div className="flex h-13 shrink-0 items-center justify-between border-t border-[var(--app-border,#262a34)] px-5">
          <UiButton
            variant="outline"
            size="sm"
            onClick={() => onChange(cloneTradingSessionsConfig(DEFAULT_TRADING_SESSIONS_CONFIG))}
          >
            Defaults
          </UiButton>
          <div className="flex items-center gap-2">
            <UiButton
              variant="outline"
              size="sm"
              onClick={() => {
                onChange(cloneTradingSessionsConfig(snapshot));
                onOpenChange(false);
              }}
            >
              Cancel
            </UiButton>
            <UiButton
              variant="default"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="!bg-[#f0f3fa] !text-[#111318] hover:!bg-white"
            >
              Ok
            </UiButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
