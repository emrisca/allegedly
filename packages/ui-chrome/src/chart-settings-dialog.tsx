import { useEffect, useRef, useState } from "react";
import type { BootConfig } from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { ColorPickerButton } from "./color-picker";
import {
  APP_THEME_PRESETS,
  cloneAppAppearance,
  DEFAULT_APP_APPEARANCE,
  type AppAppearanceSettings,
} from "./app-appearance";
import {
  isProviderConfigured,
  MARKET_DATA_PROVIDERS,
  type MarketProviderConfigMap,
  type MarketProviderId,
  type StoredProviderConfig,
} from "./market-providers";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import {
  cloneChartSettings,
  DEFAULT_CHART_SETTINGS,
  DEFAULT_CHART_TEMPLATES,
  TIMEZONE_OPTIONS,
  type BidAskMode,
  type ChartSettings,
  type ChartSettingsTemplate,
  type DateFormatMode,
  type PnlDisplayMode,
  type PrecisionMode,
  type PriceLabelMode,
  type ScalesPlacementMode,
  type SymbolPriceScaleMode,
  type TitleDisplayMode,
  type VisibilityMode,
  type WatermarkMode,
} from "./chart-settings";

export interface ChartSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ChartSettings;
  onSettingsChange: (next: ChartSettings) => void;
  templates?: readonly ChartSettingsTemplate[];
  onApplyTemplate?: (template: ChartSettingsTemplate) => void;
  onSaveTemplate?: (name: string, settings: ChartSettings) => void;
  onApplyDefaults?: () => void;
  bootConfig: BootConfig;
  compactDensity: boolean;
  onCompactDensityChange: (next: boolean) => void;
  showProvenanceOverlay: boolean;
  onShowProvenanceOverlayChange: (next: boolean) => void;
  /** App-wide appearance (shell/chrome outside the chart canvas) */
  appAppearance?: AppAppearanceSettings;
  onAppAppearanceChange?: (next: AppAppearanceSettings) => void;
  /** Market data provider credentials / subscriptions */
  providerConfigs?: MarketProviderConfigMap;
  onProviderConfigsChange?: (next: MarketProviderConfigMap) => void;
  /** Optional tab to focus when opening (e.g. "appearance" or "providers") */
  initialTab?: string;
  /** Optional provider ID to auto-expand on the Data Providers tab */
  highlightProviderId?: MarketProviderId | null;
}

const SELECT_CLS =
  "h-8 rounded-md border border-[#2c303a] bg-[#181a20] px-2.5 text-xs text-[#e6e8ee] outline-none focus:border-sky-500";
const INPUT_NUM_CLS =
  "h-8 w-24 rounded-md border border-[#2c303a] bg-[#181a20] px-2.5 font-mono text-xs tabular-nums text-[#e6e8ee] outline-none focus:border-sky-500";
const CHECKBOX_CLS =
  "h-4 w-4 cursor-pointer rounded border border-[#3c414f] bg-[#181a20] accent-[#f1f3f8]";
const SECTION_HDR_CLS =
  "mb-2.5 mt-4 first:mt-0 text-[10px] font-semibold uppercase tracking-wider text-[#787e8d]";

function ColorSwatch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  return (
    <ColorPickerButton
      value={value}
      onChange={onChange}
      ariaLabel={label}
    />
  );
}

function VisibilitySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: VisibilityMode;
  onChange: (next: VisibilityMode) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as VisibilityMode)}
      className={`${SELECT_CLS} w-48`}
    >
      <option value="hover">Visible on mouse over</option>
      <option value="always">Always visible</option>
      <option value="never">Always invisible</option>
    </select>
  );
}

export function ChartSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  templates = DEFAULT_CHART_TEMPLATES,
  onApplyTemplate,
  onSaveTemplate,
  onApplyDefaults,
  bootConfig,
  compactDensity,
  onCompactDensityChange,
  showProvenanceOverlay,
  onShowProvenanceOverlayChange,
  appAppearance = DEFAULT_APP_APPEARANCE,
  onAppAppearanceChange,
  providerConfigs = {},
  onProviderConfigsChange,
  initialTab = "symbol",
  highlightProviderId = null,
}: ChartSettingsDialogProps) {
  const snapshotRef = useRef<ChartSettings>(cloneChartSettings(settings));
  const appearanceSnapshotRef = useRef<AppAppearanceSettings>(cloneAppAppearance(appAppearance));
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [expandedProvider, setExpandedProvider] = useState<MarketProviderId | null>(
    highlightProviderId,
  );
  const [draftProviderFields, setDraftProviderFields] = useState<
    Partial<Record<MarketProviderId, StoredProviderConfig>>
  >({});
  const [savedNoticeId, setSavedNoticeId] = useState<MarketProviderId | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  useEffect(() => {
    if (open) {
      snapshotRef.current = cloneChartSettings(settings);
      appearanceSnapshotRef.current = cloneAppAppearance(appAppearance);
      setActiveTab(initialTab || "symbol");
      if (highlightProviderId) {
        setExpandedProvider(highlightProviderId);
      }
      setTemplateMenuOpen(false);
      setSaveAsOpen(false);
      setSaveAsName("");
      setSavedNoticeId(null);
    }
  }, [open, initialTab, highlightProviderId]);

  const update = <K extends keyof ChartSettings>(
    section: K,
    patch: Partial<ChartSettings[K]>,
  ) => {
    const next: ChartSettings = {
      ...settings,
      [section]: {
        ...settings[section],
        ...patch,
      },
    };
    // Keep Buy/sell buttons synchronized between Status line and Trading tabs
    if (section === "statusLine" && "buySellButtons" in patch) {
      next.trading = { ...next.trading, buySellButtons: Boolean(patch.buySellButtons) };
    }
    if (section === "trading" && "buySellButtons" in patch) {
      next.statusLine = { ...next.statusLine, buySellButtons: Boolean(patch.buySellButtons) };
    }
    onSettingsChange(next);
  };

  const handleCancel = () => {
    onSettingsChange(cloneChartSettings(snapshotRef.current));
    onAppAppearanceChange?.(cloneAppAppearance(appearanceSnapshotRef.current));
    onOpenChange(false);
  };

  const updateAppearance = (patch: Partial<AppAppearanceSettings>) => {
    if (!onAppAppearanceChange) return;
    onAppAppearanceChange({
      ...appAppearance,
      ...patch,
      preset: patch.preset ?? "custom",
    });
  };

  const getDraftForProvider = (id: MarketProviderId): StoredProviderConfig => {
    return (
      draftProviderFields[id] ??
      providerConfigs[id] ?? {
        enabled: false,
      }
    );
  };

  const setDraftField = (
    id: MarketProviderId,
    field: keyof StoredProviderConfig,
    val: string,
  ) => {
    const cur = getDraftForProvider(id);
    setDraftProviderFields((prev) => ({
      ...prev,
      [id]: {
        ...cur,
        [field]: val,
      },
    }));
  };

  const handleSaveProvider = (id: MarketProviderId) => {
    if (!onProviderConfigsChange) return;
    const draft = getDraftForProvider(id);
    const next: MarketProviderConfigMap = {
      ...providerConfigs,
      [id]: {
        ...draft,
        enabled: true,
        savedAt: Date.now(),
      },
    };
    onProviderConfigsChange(next);
    setSavedNoticeId(id);
    window.setTimeout(() => {
      setSavedNoticeId((curr) => (curr === id ? null : curr));
    }, 2200);
  };

  const handleDisconnectProvider = (id: MarketProviderId) => {
    if (!onProviderConfigsChange) return;
    const next: MarketProviderConfigMap = { ...providerConfigs };
    delete next[id];
    onProviderConfigsChange(next);
    setDraftProviderFields((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleSaveTemplateSubmit = () => {
    const trimmed = saveAsName.trim();
    if (!trimmed) return;
    onSaveTemplate?.(trimmed, cloneChartSettings(settings));
    setSaveAsOpen(false);
    setSaveAsName("");
    setTemplateMenuOpen(false);
  };

  const tabCls =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] text-[#9598a1] hover:bg-[#2a2e39]/60 hover:text-[#f0f3fa] data-selected:bg-[#2962ff]/18 data-selected:font-medium data-selected:text-[#ffffff] focus-visible:outline-2 focus-visible:outline-[#2962ff]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        aria-label="Settings"
        title="Chart & Terminal Settings"
        className="flex h-7 w-7 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 18 18"
          className="h-[17px] w-[17px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        >
          <path d="M9 2.3 14.6 5.55v6.9L9 15.7 3.4 12.45v-6.9L9 2.3Z" />
          <circle cx="9" cy="9" r="2.25" />
        </svg>
      </DialogTrigger>

      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />

      <DialogContent className="fixed left-1/2 top-1/2 z-50 flex h-[min(620px,86vh)] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-[0_24px_64px_rgba(0,0,0,0.72)]">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#23262f] px-5">
          <div>
            <DialogTitle className="text-[17px] font-semibold tracking-tight text-[#f1f3f8]">
              Settings
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure chart symbol, status line, scales and lines, canvas, trading, alerts, events, and offline safety settings.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Done"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa1b2] hover:bg-[#23262f] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" strokeLinecap="round" />
            </svg>
          </DialogClose>
        </div>

        {/* Two-column body: vertical sidebar + scrollable form panel */}
        <Tabs orientation="vertical" value={activeTab} onValueChange={(v) => { if (v) setActiveTab(v); }} className="flex min-h-0 flex-1 flex-row">
          <TabsList
            aria-label="Chart settings categories"
            className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#181c27)] p-2.5"
          >
            <TabsTab value="symbol" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M5.5 2.5v2.5M5.5 12v3.5M12.5 3.5v3M12.5 13v2.5" strokeLinecap="round" />
                <rect x="4" y="5" width="3" height="7" rx="0.6" />
                <rect x="11" y="6.5" width="3" height="6.5" rx="0.6" />
              </svg>
              <span>Symbol</span>
            </TabsTab>
            <TabsTab value="status" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M3 4.5h12M3 8h9M3 11.5h11M3 15h6" strokeLinecap="round" />
              </svg>
              <span>Status line</span>
            </TabsTab>
            <TabsTab value="scales" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4.5 3v10.5H15M3 4.5 4.5 3 6 4.5M13.5 12 15 13.5 13.5 15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Scales and lines</span>
            </TabsTab>
            <TabsTab value="canvas" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M12.2 3.3 14.7 5.8 6.8 13.7 3.5 14.5 4.3 11.2 12.2 3.3Z" strokeLinejoin="round" />
              </svg>
              <span>Canvas</span>
            </TabsTab>
            <TabsTab value="trading" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M2.5 12.5 6.5 8.5 9.5 11.5 15.5 5.5M12 5.5h3.5V9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Trading</span>
            </TabsTab>
            <TabsTab value="alerts" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="9" cy="10" r="5" />
                <path d="M9 7.5V10l1.8 1.2M4.5 3.8 2.8 5.4M13.5 3.8l1.7 1.6" strokeLinecap="round" />
              </svg>
              <span>Alerts</span>
            </TabsTab>
            <TabsTab value="events" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="3" y="4" width="12" height="11" rx="1.5" />
                <path d="M3 7.5h12M6.2 2.5v2.5M11.8 2.5v2.5" strokeLinecap="round" />
              </svg>
              <span>Events</span>
            </TabsTab>

            <div className="my-1.5 h-px bg-[var(--app-border,#23262f)]" aria-hidden="true" />

            <TabsTab value="appearance" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="9" cy="9" r="6" />
                <circle cx="6.8" cy="7.5" r="1" fill="currentColor" stroke="none" />
                <circle cx="10.2" cy="6.4" r="1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="9.2" r="1" fill="currentColor" stroke="none" />
                <path d="M9 15a2.5 2.5 0 0 0 2.5-2.5c0-.8-.5-1.3-.5-1.9 0-.5.4-.8 1-.8h1.5" strokeLinecap="round" />
              </svg>
              <span>Appearance</span>
            </TabsTab>
            <TabsTab value="providers" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <ellipse cx="9" cy="4.8" rx="5.5" ry="2.2" />
                <path d="M3.5 4.8v4.2c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4.8" />
                <path d="M3.5 9v4.2c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V9" />
              </svg>
              <span>Data Providers</span>
            </TabsTab>
            <TabsTab value="display" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="2.5" y="3.5" width="13" height="11" rx="1.5" />
                <path d="M8 3.5v11" />
              </svg>
              <span>Workspace Display</span>
            </TabsTab>
            <TabsTab value="safety" className={tabCls}>
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M9 2.5 14.5 4.8v4c0 3.3-2.3 5.7-5.5 6.8-3.2-1.1-5.5-3.5-5.5-6.8v-4L9 2.5Z" strokeLinejoin="round" />
              </svg>
              <span>Safety &amp; Offline Boot</span>
            </TabsTab>
          </TabsList>

          {/* Right Form Container */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[13px]">
            {/* 1. SYMBOL */}
            <TabsPanel value="symbol" className="space-y-3">
              <div className={SECTION_HDR_CLS}>Candles</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.symbol.colorBarsOnPrevClose}
                  onChange={(e) => update("symbol", { colorBarsOnPrevClose: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Color bars based on previous close</span>
              </label>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.symbol.bodyEnabled}
                    onChange={(e) => update("symbol", { bodyEnabled: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Body</span>
                </label>
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    label="Up candle body color"
                    value={settings.symbol.bodyUpColor}
                    onChange={(bodyUpColor) => update("symbol", { bodyUpColor })}
                  />
                  <ColorSwatch
                    label="Down candle body color"
                    value={settings.symbol.bodyDownColor}
                    onChange={(bodyDownColor) => update("symbol", { bodyDownColor })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.symbol.borderEnabled}
                    onChange={(e) => update("symbol", { borderEnabled: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Borders</span>
                </label>
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    label="Up candle border color"
                    value={settings.symbol.borderUpColor}
                    onChange={(borderUpColor) => update("symbol", { borderUpColor })}
                  />
                  <ColorSwatch
                    label="Down candle border color"
                    value={settings.symbol.borderDownColor}
                    onChange={(borderDownColor) => update("symbol", { borderDownColor })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.symbol.wickEnabled}
                    onChange={(e) => update("symbol", { wickEnabled: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Wick</span>
                </label>
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    label="Up candle wick color"
                    value={settings.symbol.wickUpColor}
                    onChange={(wickUpColor) => update("symbol", { wickUpColor })}
                  />
                  <ColorSwatch
                    label="Down candle wick color"
                    value={settings.symbol.wickDownColor}
                    onChange={(wickDownColor) => update("symbol", { wickDownColor })}
                  />
                </div>
              </div>

              <div className={SECTION_HDR_CLS}>Data Modification</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.symbol.useSettlementAsCloseOnDaily}
                  onChange={(e) =>
                    update("symbol", { useSettlementAsCloseOnDaily: e.target.checked })
                  }
                  className={CHECKBOX_CLS}
                />
                <span>Use settlement as close on daily interval</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.symbol.adjustForContractChanges}
                  onChange={(e) =>
                    update("symbol", { adjustForContractChanges: e.target.checked })
                  }
                  className={CHECKBOX_CLS}
                />
                <span>Adjust for contract changes</span>
              </label>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2 pt-1">
                <label htmlFor="cfg-precision" className="text-[#c8cdd9]">
                  Precision
                </label>
                <select
                  id="cfg-precision"
                  value={settings.symbol.precision}
                  onChange={(e) =>
                    update("symbol", { precision: e.target.value as PrecisionMode })
                  }
                  className={`${SELECT_CLS} w-44`}
                >
                  <option value="Default">Default</option>
                  <option value="1/100">1/100</option>
                  <option value="1/1000">1/1000</option>
                  <option value="1/10000">1/10000</option>
                </select>
              </div>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label htmlFor="cfg-timezone" className="text-[#c8cdd9]">
                  Timezone
                </label>
                <select
                  id="cfg-timezone"
                  value={settings.symbol.timezone}
                  onChange={(e) => update("symbol", { timezone: e.target.value })}
                  className={`${SELECT_CLS} w-44`}
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </TabsPanel>

            {/* 2. STATUS LINE */}
            <TabsPanel value="status" className="space-y-3">
              <div className={SECTION_HDR_CLS}>Instrument</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.logo}
                  onChange={(e) => update("statusLine", { logo: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Logo</span>
              </label>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.statusLine.title}
                    onChange={(e) => update("statusLine", { title: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Title</span>
                </label>
                <select
                  aria-label="Status line title format"
                  value={settings.statusLine.titleMode}
                  onChange={(e) =>
                    update("statusLine", { titleMode: e.target.value as TitleDisplayMode })
                  }
                  className={`${SELECT_CLS} w-44`}
                >
                  <option value="symbol_and_name">Symbol and name</option>
                  <option value="symbol">Ticker only</option>
                  <option value="description">Description only</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.openMarketStatus}
                  onChange={(e) => update("statusLine", { openMarketStatus: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Open market status</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.chartValues}
                  onChange={(e) => update("statusLine", { chartValues: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Chart values</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.barChangeValues}
                  onChange={(e) => update("statusLine", { barChangeValues: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Bar change values</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.volume}
                  onChange={(e) => update("statusLine", { volume: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Volume</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.lastDayChangeValues}
                  onChange={(e) =>
                    update("statusLine", { lastDayChangeValues: e.target.checked })
                  }
                  className={CHECKBOX_CLS}
                />
                <span>Last day change values</span>
              </label>

              <div>
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.statusLine.buySellButtons}
                    onChange={(e) => update("statusLine", { buySellButtons: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Buy/sell buttons</span>
                </label>
                <p className="mt-0.5 pl-6 text-[11px] text-[#787e8d]">
                  Displays buy and sell buttons directly on the chart
                </p>
              </div>

              <div className={SECTION_HDR_CLS}>Indicators</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.indicatorTitles}
                  onChange={(e) => update("statusLine", { indicatorTitles: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Titles</span>
              </label>

              <label className="flex items-center gap-2.5 pl-6 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.indicatorInputs}
                  onChange={(e) => update("statusLine", { indicatorInputs: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Inputs</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.statusLine.indicatorValues}
                  onChange={(e) => update("statusLine", { indicatorValues: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Values</span>
              </label>

              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.statusLine.background}
                    onChange={(e) => update("statusLine", { background: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Background</span>
                </label>
                <input
                  type="range"
                  aria-label="Status line background opacity"
                  min={0}
                  max={100}
                  value={settings.statusLine.backgroundOpacity}
                  onChange={(e) =>
                    update("statusLine", {
                      backgroundOpacity: Number.parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="h-1.5 w-44 cursor-pointer accent-sky-400"
                />
              </div>
            </TabsPanel>

            {/* 3. SCALES AND LINES */}
            <TabsPanel value="scales" className="space-y-3">
              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Currency and Unit</span>
                <VisibilitySelect
                  label="Currency and Unit visibility"
                  value={settings.scales.currencyAndUnit}
                  onChange={(currencyAndUnit) => update("scales", { currencyAndUnit })}
                />
              </div>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Scale modes (A and L)</span>
                <VisibilitySelect
                  label="Scale modes A and L visibility"
                  value={settings.scales.scaleModesButtons}
                  onChange={(scaleModesButtons) => update("scales", { scaleModesButtons })}
                />
              </div>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.scales.lockPriceToBarRatio}
                    onChange={(e) =>
                      update("scales", { lockPriceToBarRatio: e.target.checked })
                    }
                    className={CHECKBOX_CLS}
                  />
                  <span>Lock price to bar ratio</span>
                </label>
                <input
                  type="number"
                  aria-label="Price to bar ratio value"
                  step="0.1"
                  value={settings.scales.priceToBarRatio}
                  disabled={!settings.scales.lockPriceToBarRatio}
                  onChange={(e) =>
                    update("scales", {
                      priceToBarRatio: Number.parseFloat(e.target.value) || 63.3106585,
                    })
                  }
                  className={`${INPUT_NUM_CLS} w-48 disabled:opacity-45`}
                />
              </div>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <label htmlFor="cfg-scales-placement" className="text-[#c8cdd9]">
                  Scales placement
                </label>
                <select
                  id="cfg-scales-placement"
                  value={settings.scales.scalesPlacement}
                  onChange={(e) =>
                    update("scales", {
                      scalesPlacement: e.target.value as ScalesPlacementMode,
                    })
                  }
                  className={`${SELECT_CLS} w-48`}
                >
                  <option value="auto">Auto</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div className={SECTION_HDR_CLS}>Price Labels &amp; Lines</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.scales.noOverlappingLabels}
                  onChange={(e) => update("scales", { noOverlappingLabels: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>No overlapping labels</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.scales.plusButton}
                  onChange={(e) => update("scales", { plusButton: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Plus button</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.scales.countdownToBarClose}
                  onChange={(e) => update("scales", { countdownToBarClose: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Countdown to bar close</span>
              </label>

              <div className="grid grid-cols-[190px_1fr] items-start gap-2">
                <span className="pt-1.5 text-[#c8cdd9]">Symbol</span>
                <div className="space-y-1.5">
                  <select
                    aria-label="Symbol price label mode"
                    value={settings.scales.symbolPriceLabel}
                    onChange={(e) =>
                      update("scales", {
                        symbolPriceLabel: e.target.value as PriceLabelMode,
                      })
                    }
                    className={`${SELECT_CLS} w-48`}
                  >
                    <option value="value_line">Value, line</option>
                    <option value="value">Value</option>
                    <option value="hidden">Hidden</option>
                  </select>
                  <select
                    aria-label="Symbol price value mode"
                    value={settings.scales.symbolPriceMode}
                    onChange={(e) =>
                      update("scales", {
                        symbolPriceMode: e.target.value as SymbolPriceScaleMode,
                      })
                    }
                    className={`${SELECT_CLS} block w-48`}
                  >
                    <option value="according_to_scale">Value according to scale</option>
                    <option value="last_value">Last value</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Indicators and financials</span>
                <select
                  aria-label="Indicators and financials price label"
                  value={settings.scales.indicatorsLabel}
                  onChange={(e) =>
                    update("scales", {
                      indicatorsLabel: e.target.value as "value" | "hidden",
                    })
                  }
                  className={`${SELECT_CLS} w-48`}
                >
                  <option value="value">Value</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">High and low</span>
                <select
                  aria-label="High and low price labels"
                  value={settings.scales.highAndLow}
                  onChange={(e) =>
                    update("scales", { highAndLow: e.target.value as PriceLabelMode })
                  }
                  className={`${SELECT_CLS} w-48`}
                >
                  <option value="hidden">Hidden</option>
                  <option value="value_line">Value, line</option>
                  <option value="value">Value</option>
                </select>
              </div>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Bid and ask</span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Bid and ask lines"
                    value={settings.scales.bidAndAsk}
                    onChange={(e) =>
                      update("scales", { bidAndAsk: e.target.value as BidAskMode })
                    }
                    className={`${SELECT_CLS} w-36`}
                  >
                    <option value="hidden">Hidden</option>
                    <option value="lines_and_labels">Lines &amp; labels</option>
                  </select>
                  <ColorSwatch
                    label="Bid line color"
                    value={settings.scales.bidColor}
                    onChange={(bidColor) => update("scales", { bidColor })}
                  />
                  <ColorSwatch
                    label="Ask line color"
                    value={settings.scales.askColor}
                    onChange={(askColor) => update("scales", { askColor })}
                  />
                </div>
              </div>

              <div className={SECTION_HDR_CLS}>Time Scale</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.scales.dayOfWeekOnLabels}
                  onChange={(e) => update("scales", { dayOfWeekOnLabels: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Day of week on labels</span>
              </label>

              <div className="grid grid-cols-[190px_1fr] items-center gap-2">
                <label htmlFor="cfg-date-format" className="text-[#c8cdd9]">
                  Date format
                </label>
                <select
                  id="cfg-date-format"
                  value={settings.scales.dateFormat}
                  onChange={(e) =>
                    update("scales", { dateFormat: e.target.value as DateFormatMode })
                  }
                  className={`${SELECT_CLS} w-48`}
                >
                  <option value="ddd dd MMM 'yy">Mon 29 Sep '97</option>
                  <option value="yyyy-MM-dd">1997-09-29</option>
                  <option value="MM/dd/yyyy">09/29/1997</option>
                  <option value="dd MMM 'yy">29 Sep '97</option>
                </select>
              </div>
            </TabsPanel>

            {/* 4. CANVAS */}
            <TabsPanel value="canvas" className="space-y-3">
              <div className={SECTION_HDR_CLS}>Chart Basic Styles</div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Background</span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Canvas background type"
                    value={settings.canvas.backgroundType}
                    onChange={(e) =>
                      update("canvas", {
                        backgroundType: e.target.value as "solid" | "gradient",
                      })
                    }
                    className={`${SELECT_CLS} w-36`}
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradient</option>
                  </select>
                  <ColorSwatch
                    label="Canvas background color"
                    value={settings.canvas.backgroundColor}
                    onChange={(backgroundColor) => update("canvas", { backgroundColor })}
                  />
                  {settings.canvas.backgroundType === "gradient" && (
                    <ColorSwatch
                      label="Canvas bottom gradient color"
                      value={settings.canvas.backgroundColorBottom}
                      onChange={(backgroundColorBottom) =>
                        update("canvas", { backgroundColorBottom })
                      }
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.canvas.vertGridLines}
                    onChange={(e) => update("canvas", { vertGridLines: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Vertical grid lines</span>
                </label>
                <ColorSwatch
                  label="Vertical grid lines color"
                  value={settings.canvas.vertGridColor}
                  onChange={(vertGridColor) => update("canvas", { vertGridColor })}
                />
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.canvas.horzGridLines}
                    onChange={(e) => update("canvas", { horzGridLines: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Horizontal grid lines</span>
                </label>
                <ColorSwatch
                  label="Horizontal grid lines color"
                  value={settings.canvas.horzGridColor}
                  onChange={(horzGridColor) => update("canvas", { horzGridColor })}
                />
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Crosshair</span>
                <ColorSwatch
                  label="Crosshair color"
                  value={settings.canvas.crosshairColor}
                  onChange={(crosshairColor) => update("canvas", { crosshairColor })}
                />
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label htmlFor="cfg-watermark" className="text-[#c8cdd9]">
                  Watermark
                </label>
                <select
                  id="cfg-watermark"
                  value={settings.canvas.watermark}
                  onChange={(e) =>
                    update("canvas", { watermark: e.target.value as WatermarkMode })
                  }
                  className={`${SELECT_CLS} w-44`}
                >
                  <option value="replay">Replay mode</option>
                  <option value="always">Always</option>
                  <option value="none">None</option>
                </select>
              </div>

              <div className={SECTION_HDR_CLS}>Scales</div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Text</span>
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    label="Scales text color"
                    value={settings.canvas.scalesTextColor}
                    onChange={(scalesTextColor) => update("canvas", { scalesTextColor })}
                  />
                  <select
                    aria-label="Scales font size"
                    value={settings.canvas.scalesFontSize}
                    onChange={(e) =>
                      update("canvas", {
                        scalesFontSize: Number.parseInt(e.target.value, 10) || 12,
                      })
                    }
                    className={`${SELECT_CLS} w-24`}
                  >
                    {[10, 11, 12, 13, 14].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.canvas.scalesLinesVisible}
                    onChange={(e) => update("canvas", { scalesLinesVisible: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Lines</span>
                </label>
                <ColorSwatch
                  label="Scales border line color"
                  value={settings.canvas.scalesLineColor}
                  onChange={(scalesLineColor) => update("canvas", { scalesLineColor })}
                />
              </div>

              <div className={SECTION_HDR_CLS}>Buttons</div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Navigation</span>
                <VisibilitySelect
                  label="Navigation buttons visibility"
                  value={settings.canvas.navigationButtons}
                  onChange={(navigationButtons) => update("canvas", { navigationButtons })}
                />
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <span className="text-[#c8cdd9]">Pane</span>
                <VisibilitySelect
                  label="Pane buttons visibility"
                  value={settings.canvas.paneButtons}
                  onChange={(paneButtons) => update("canvas", { paneButtons })}
                />
              </div>

              <div className={SECTION_HDR_CLS}>Margins</div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label htmlFor="cfg-margin-top" className="text-[#c8cdd9]">
                  Top
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="cfg-margin-top"
                    type="number"
                    min={0}
                    max={40}
                    value={settings.canvas.marginTopPct}
                    onChange={(e) =>
                      update("canvas", {
                        marginTopPct: Math.max(0, Math.min(40, Number.parseInt(e.target.value, 10) || 0)),
                      })
                    }
                    className={INPUT_NUM_CLS}
                  />
                  <span className="text-[#787e8d]">%</span>
                </div>
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label htmlFor="cfg-margin-bottom" className="text-[#c8cdd9]">
                  Bottom
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="cfg-margin-bottom"
                    type="number"
                    min={0}
                    max={40}
                    value={settings.canvas.marginBottomPct}
                    onChange={(e) =>
                      update("canvas", {
                        marginBottomPct: Math.max(
                          0,
                          Math.min(40, Number.parseInt(e.target.value, 10) || 0),
                        ),
                      })
                    }
                    className={INPUT_NUM_CLS}
                  />
                  <span className="text-[#787e8d]">%</span>
                </div>
              </div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label htmlFor="cfg-margin-right" className="text-[#c8cdd9]">
                  Right
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="cfg-margin-right"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.canvas.marginRightBars}
                    onChange={(e) =>
                      update("canvas", {
                        marginRightBars: Math.max(
                          0,
                          Math.min(100, Number.parseInt(e.target.value, 10) || 0),
                        ),
                      })
                    }
                    className={INPUT_NUM_CLS}
                  />
                  <span className="text-[#787e8d]">bars</span>
                </div>
              </div>
            </TabsPanel>

            {/* 5. TRADING */}
            <TabsPanel value="trading" className="space-y-3">
              <div className={SECTION_HDR_CLS}>General</div>

              <div>
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.trading.buySellButtons}
                    onChange={(e) => update("trading", { buySellButtons: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Buy/sell buttons</span>
                </label>
                <p className="mt-0.5 pl-6 text-[11px] text-[#787e8d]">
                  Displays buy and sell buttons directly on the chart
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.trading.oneClickTrading}
                    onChange={(e) => update("trading", { oneClickTrading: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>One-click trading</span>
                </label>
                <p className="mt-0.5 pl-6 text-[11px] text-[#787e8d]">
                  Instantly place, edit, cancel paper orders, or close positions without confirmation
                </p>
              </div>

              <div className="grid grid-cols-[175px_1fr] items-start gap-2">
                <label className="flex items-center gap-2.5 pt-1 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.trading.executionSound}
                    onChange={(e) => update("trading", { executionSound: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Execution sound</span>
                </label>
                <div className="space-y-1.5">
                  <input
                    type="range"
                    aria-label="Execution sound volume"
                    min={0}
                    max={100}
                    disabled={!settings.trading.executionSound}
                    value={settings.trading.executionSoundVolume}
                    onChange={(e) =>
                      update("trading", {
                        executionSoundVolume: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-1.5 w-48 cursor-pointer accent-sky-400 disabled:opacity-40"
                  />
                  <select
                    aria-label="Execution sound tone"
                    disabled={!settings.trading.executionSound}
                    value={settings.trading.executionSoundName}
                    onChange={(e) => update("trading", { executionSoundName: e.target.value })}
                    className={`${SELECT_CLS} block w-48 disabled:opacity-45`}
                  >
                    <option value="Hand Bell">Hand Bell</option>
                    <option value="Soft Chime">Soft Chime</option>
                    <option value="Tick Click">Tick Click</option>
                    <option value="Desk Ping">Desk Ping</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.trading.showOnlyRejectionNotifications}
                  onChange={(e) =>
                    update("trading", { showOnlyRejectionNotifications: e.target.checked })
                  }
                  className={CHECKBOX_CLS}
                />
                <span>Show only rejection notifications</span>
              </label>

              <div className={SECTION_HDR_CLS}>Appearance</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.trading.positionsAndOrders}
                  onChange={(e) => update("trading", { positionsAndOrders: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Positions and orders</span>
              </label>

              <div className="pl-6 space-y-2.5">
                <div>
                  <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                    <input
                      type="checkbox"
                      checked={settings.trading.reversePositionButton}
                      onChange={(e) =>
                        update("trading", { reversePositionButton: e.target.checked })
                      }
                      className={CHECKBOX_CLS}
                    />
                    <span>Reverse position button</span>
                  </label>
                  <p className="mt-0.5 pl-6 text-[11px] text-[#787e8d]">
                    Adds the reverse button next to the open position on the chart
                  </p>
                </div>

                <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                  <span className="text-[#c8cdd9]">Trading controls</span>
                  <select
                    aria-label="Trading controls visibility"
                    value={settings.trading.tradingControls}
                    onChange={(e) =>
                      update("trading", {
                        tradingControls: e.target.value as "hover" | "always",
                      })
                    }
                    className={`${SELECT_CLS} w-44`}
                  >
                    <option value="hover">Visible on mouse over</option>
                    <option value="always">Always visible</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.trading.projectOrderForMarketOrders}
                    onChange={(e) =>
                      update("trading", { projectOrderForMarketOrders: e.target.checked })
                    }
                    className={CHECKBOX_CLS}
                  />
                  <span>Project order for market orders</span>
                </label>
                <p className="mt-0.5 pl-6 text-[11px] text-[#787e8d]">
                  Shows a projected order line on the chart before sending a market order
                </p>
              </div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.trading.profitAndLossValue}
                  onChange={(e) => update("trading", { profitAndLossValue: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Profit and loss value</span>
              </label>

              <div className="pl-6 space-y-2">
                <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                  <span className="text-[#c8cdd9]">Positions</span>
                  <select
                    aria-label="Positions P&L unit"
                    value={settings.trading.pnlPositionsMode}
                    onChange={(e) =>
                      update("trading", {
                        pnlPositionsMode: e.target.value as PnlDisplayMode,
                      })
                    }
                    className={`${SELECT_CLS} w-32`}
                  >
                    <option value="money">Money</option>
                    <option value="ticks">Ticks</option>
                    <option value="percent">Percent</option>
                  </select>
                </div>
                <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                  <span className="text-[#c8cdd9]">Brackets</span>
                  <select
                    aria-label="Brackets P&L unit"
                    value={settings.trading.pnlBracketsMode}
                    onChange={(e) =>
                      update("trading", {
                        pnlBracketsMode: e.target.value as PnlDisplayMode,
                      })
                    }
                    className={`${SELECT_CLS} w-32`}
                  >
                    <option value="money">Money</option>
                    <option value="ticks">Ticks</option>
                    <option value="percent">Percent</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.trading.executionMarks}
                  onChange={(e) => update("trading", { executionMarks: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Execution marks</span>
              </label>
            </TabsPanel>

            {/* 6. ALERTS */}
            <TabsPanel value="alerts" className="space-y-3">
              <div className={SECTION_HDR_CLS}>Chart Line Visibility</div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.alerts.alertLines}
                    onChange={(e) => update("alerts", { alertLines: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Alert lines</span>
                </label>
                <ColorSwatch
                  label="Alert line color"
                  value={settings.alerts.alertLineColor}
                  onChange={(alertLineColor) => update("alerts", { alertLineColor })}
                />
              </div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.alerts.onlyActiveAlerts}
                  onChange={(e) => update("alerts", { onlyActiveAlerts: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Only active alerts</span>
              </label>

              <div className={SECTION_HDR_CLS}>Notifications</div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.alerts.autoHideToasts}
                  onChange={(e) => update("alerts", { autoHideToasts: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Automatically hide toasts</span>
              </label>
            </TabsPanel>

            {/* 7. EVENTS */}
            <TabsPanel value="events" className="space-y-3">
              <div className={SECTION_HDR_CLS}>Events</div>

              <div className="grid grid-cols-[175px_1fr] items-center gap-2">
                <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                  <input
                    type="checkbox"
                    checked={settings.events.ideas}
                    onChange={(e) => update("events", { ideas: e.target.checked })}
                    className={CHECKBOX_CLS}
                  />
                  <span>Ideas</span>
                </label>
                <select
                  aria-label="Ideas filter"
                  disabled={!settings.events.ideas}
                  value={settings.events.ideasFilter}
                  onChange={(e) =>
                    update("events", {
                      ideasFilter: e.target.value as "all" | "following" | "mine",
                    })
                  }
                  className={`${SELECT_CLS} w-36 disabled:opacity-45`}
                >
                  <option value="all">All ideas</option>
                  <option value="following">Following</option>
                  <option value="mine">Mine</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.events.continuousContractSwitch}
                  onChange={(e) =>
                    update("events", { continuousContractSwitch: e.target.checked })
                  }
                  className={CHECKBOX_CLS}
                />
                <span>Continuous contract switch</span>
              </label>

              <label className="flex items-center gap-2.5 pl-6 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.events.contractSwitchBreaks}
                  onChange={(e) => update("events", { contractSwitchBreaks: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Contract switch breaks</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.events.latestNews}
                  onChange={(e) => update("events", { latestNews: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>Latest news</span>
              </label>

              <label className="flex items-center gap-2.5 text-[#d4d8e2]">
                <input
                  type="checkbox"
                  checked={settings.events.newsNotification}
                  onChange={(e) => update("events", { newsNotification: e.target.checked })}
                  className={CHECKBOX_CLS}
                />
                <span>News notification</span>
              </label>
            </TabsPanel>

            {/* 7b. APPEARANCE (App shell/chrome outside the chart canvas) */}
            <TabsPanel value="appearance" className="space-y-4">
              <div>
                <div className={SECTION_HDR_CLS}>App Chrome Theme (Outside Chart)</div>
                <p className="mb-3 text-[12px] leading-relaxed text-[#9598a1]">
                  Customize the top bar, sidebars, watchlist, modals, and panels independently from the chart canvas.
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {APP_THEME_PRESETS.map((preset) => {
                    const active = appAppearance.preset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onAppAppearanceChange?.({
                            preset: preset.id,
                            ...preset.colors,
                          })
                        }
                        className={
                          active
                            ? "flex flex-col gap-2 rounded-lg border border-[#2962ff] bg-[#2962ff]/12 p-3 text-left transition-colors"
                            : "flex flex-col gap-2 rounded-lg border border-[#2a2e39] bg-[#181a20] p-3 text-left transition-colors hover:border-[#3e4556]"
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-[#f0f3fa]">
                            {preset.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-white/15"
                              style={{ backgroundColor: preset.colors.chromeBg }}
                            />
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-white/15"
                              style={{ backgroundColor: preset.colors.panelBg }}
                            />
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-white/15"
                              style={{ backgroundColor: preset.colors.accentColor }}
                            />
                          </div>
                        </div>
                        <span className="text-[11px] text-[#868993]">{preset.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className={SECTION_HDR_CLS}>Custom Shell Colors</div>
                <div className="space-y-2.5 rounded-lg border border-[#2a2e39] bg-[#181a20] p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-[#e6e8ee]">App Shell Background</div>
                      <div className="text-[11px] text-[#787e8d]">Top bar, left rail, watchlist &amp; bottom bar</div>
                    </div>
                    <ColorSwatch
                      label="App shell background color"
                      value={appAppearance.chromeBg}
                      onChange={(chromeBg) => updateAppearance({ chromeBg })}
                    />
                  </div>
                  <div className="h-px bg-[#262a34]" />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-[#e6e8ee]">Secondary Panels &amp; Sidebars</div>
                      <div className="text-[11px] text-[#787e8d]">Settings sidebar, inspector drawers &amp; cards</div>
                    </div>
                    <ColorSwatch
                      label="Secondary panel background color"
                      value={appAppearance.panelBg}
                      onChange={(panelBg) => updateAppearance({ panelBg })}
                    />
                  </div>
                  <div className="h-px bg-[#262a34]" />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-[#e6e8ee]">Modals &amp; Popovers</div>
                      <div className="text-[11px] text-[#787e8d]">Symbol search, menus &amp; settings dialogs</div>
                    </div>
                    <ColorSwatch
                      label="Modal and popover surface color"
                      value={appAppearance.surfaceBg}
                      onChange={(surfaceBg) => updateAppearance({ surfaceBg })}
                    />
                  </div>
                  <div className="h-px bg-[#262a34]" />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-[#e6e8ee]">Borders &amp; Dividers</div>
                      <div className="text-[11px] text-[#787e8d]">Hairline panel edges across the chrome</div>
                    </div>
                    <ColorSwatch
                      label="App chrome border color"
                      value={appAppearance.borderColor}
                      onChange={(borderColor) => updateAppearance({ borderColor })}
                    />
                  </div>
                  <div className="h-px bg-[#262a34]" />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-[#e6e8ee]">Accent Color</div>
                      <div className="text-[11px] text-[#787e8d]">Active highlights, badges &amp; primary actions</div>
                    </div>
                    <ColorSwatch
                      label="App accent color"
                      value={appAppearance.accentColor}
                      onChange={(accentColor) => updateAppearance({ accentColor })}
                    />
                  </div>
                </div>
                <div className="mt-2.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onAppAppearanceChange?.(cloneAppAppearance(DEFAULT_APP_APPEARANCE))}
                    className="rounded-md border border-[#323642] bg-[#181a20] px-3 py-1.5 text-[11px] font-medium text-[#d1d4dc] hover:bg-[#23262f] hover:text-white"
                  >
                    Reset App Appearance
                  </button>
                </div>
              </div>
            </TabsPanel>

            {/* 7c. MARKET DATA PROVIDERS */}
            <TabsPanel value="providers" className="space-y-4">
              <div>
                <div className={SECTION_HDR_CLS}>Built-in Free Feeds</div>
                <div className="space-y-2">
                  {MARKET_DATA_PROVIDERS.filter((p) => p.category === "builtin").map((prov) => (
                    <div
                      key={prov.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#2a2e39] bg-[#181a20] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: prov.badgeColor }}
                          />
                          <span className="text-[13px] font-medium text-[#f0f3fa]">{prov.name}</span>
                          <span className="rounded bg-[#252a36] px-1.5 py-0.5 font-mono text-[10px] text-[#9aa1b2]">
                            {prov.shortTag}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#868993]">{prov.subscriptionNote}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                        Free · Ready
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className={SECTION_HDR_CLS}>Subscription &amp; API Key Providers</div>
                <p className="mb-2.5 text-[11px] text-[#868993]">
                  Enter your own broker or market data credentials below. Keys are stored locally on this device and never sent to Allegedly servers.
                </p>
                <div className="space-y-2">
                  {MARKET_DATA_PROVIDERS.filter((p) => p.category === "subscription").map((prov) => {
                    const configured = isProviderConfigured(prov.id, providerConfigs);
                    const isOpen = expandedProvider === prov.id;
                    const draft = getDraftForProvider(prov.id);

                    return (
                      <div
                        key={prov.id}
                        className={
                          isOpen
                            ? "rounded-lg border border-[#2962ff]/70 bg-[#181a20]"
                            : "rounded-lg border border-[#2a2e39] bg-[#181a20]"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedProvider(isOpen ? null : prov.id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: prov.badgeColor }}
                              />
                              <span className="text-[13px] font-medium text-[#f0f3fa]">{prov.name}</span>
                              <span className="rounded bg-[#252a36] px-1.5 py-0.5 font-mono text-[10px] text-[#9aa1b2]">
                                {prov.shortTag}
                              </span>
                              <span className="text-[10px] text-[#787e8d]">
                                {prov.assetClasses.slice(0, 3).join(" · ")}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {configured ? (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                Configured
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                Subscription required
                              </span>
                            )}
                            <span className="text-[11px] text-[#868993]">{isOpen ? "▴" : "▾"}</span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="space-y-2.5 border-t border-[#262a34] px-3 pb-3 pt-2.5">
                            <p className="text-[11px] leading-relaxed text-[#9598a1]">
                              {prov.subscriptionNote}
                            </p>
                            <div className="space-y-2">
                              {prov.fields.map((field) => (
                                <label key={field.key} className="block space-y-1">
                                  <span className="text-[11px] font-medium text-[#b2b5be]">
                                    {field.label}
                                    {field.required ? " *" : ""}
                                  </span>
                                  <input
                                    type={field.secret ? "password" : "text"}
                                    aria-label={`${prov.name} ${field.label}`}
                                    placeholder={field.placeholder}
                                    value={String(draft[field.key] ?? "")}
                                    onChange={(e) => setDraftField(prov.id, field.key, e.target.value)}
                                    className="h-8 w-full rounded-md border border-[#323642] bg-[#111318] px-2.5 font-mono text-[12px] text-[#f0f3fa] placeholder:text-[#5c6270] focus:border-[#2962ff] focus:outline-none"
                                  />
                                </label>
                              ))}
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <div className="text-[11px] text-emerald-400">
                                {savedNoticeId === prov.id ? "Credentials saved locally" : ""}
                              </div>
                              <div className="flex items-center gap-2">
                                {configured && (
                                  <button
                                    type="button"
                                    onClick={() => handleDisconnectProvider(prov.id)}
                                    className="h-7 rounded-md border border-[#3a262c] bg-[#24161a] px-2.5 text-[11px] font-medium text-[#f27983] hover:bg-[#331b21]"
                                  >
                                    Remove
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleSaveProvider(prov.id)}
                                  className="h-7 rounded-md bg-[#2962ff] px-3 text-[11px] font-semibold text-white hover:bg-[#1e53e5]"
                                >
                                  Save {prov.shortTag}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsPanel>

            {/* 8. WORKSPACE DISPLAY (preserves @ui-sdk/react Switch a11y test contract) */}
            <TabsPanel value="display" className="space-y-3">
              <div className={SECTION_HDR_CLS}>Workspace Display</div>
              <div className="flex items-center justify-between rounded-lg border border-[#23262f] bg-[#181a20] px-3 py-2.5">
                <span id="compact-density-label" className="text-xs text-[#d4d8e2]">
                  Compact Orderflow Table Density
                </span>
                <Switch
                  checked={compactDensity}
                  onCheckedChange={onCompactDensityChange}
                  aria-labelledby="compact-density-label"
                  className="inline-flex h-5 w-9 items-center rounded-full bg-[#2c303a] p-0.5 transition-colors data-checked:bg-sky-500"
                >
                  <SwitchThumb className="h-4 w-4 rounded-full bg-white transition-transform data-checked:translate-x-4" />
                </Switch>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#23262f] bg-[#181a20] px-3 py-2.5">
                <span id="prov-overlay-label" className="text-xs text-[#d4d8e2]">
                  Show Active 5-Tier Provenance Badge
                </span>
                <Switch
                  checked={showProvenanceOverlay}
                  onCheckedChange={onShowProvenanceOverlayChange}
                  aria-labelledby="prov-overlay-label"
                  className="inline-flex h-5 w-9 items-center rounded-full bg-[#2c303a] p-0.5 transition-colors data-checked:bg-sky-500"
                >
                  <SwitchThumb className="h-4 w-4 rounded-full bg-white transition-transform data-checked:translate-x-4" />
                </Switch>
              </div>
            </TabsPanel>

            {/* 9. SAFETY & OFFLINE BOOT */}
            <TabsPanel value="safety" className="space-y-2.5 font-mono text-xs">
              <div className={SECTION_HDR_CLS}>Local-First Safety Invariants (SV-01)</div>
              <div className="flex items-center justify-between rounded-lg border border-[#23262f] bg-[#181a20] px-3 py-2">
                <span className="text-[#9aa1b2]">updates.checkOnStartup</span>
                <span className="text-emerald-400">
                  {String(bootConfig.updates_check_on_startup)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#23262f] bg-[#181a20] px-3 py-2">
                <span className="text-[#9aa1b2]">execution.liveArmed</span>
                <span className="text-amber-300">{String(bootConfig.live_armed)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#23262f] bg-[#181a20] px-3 py-2">
                <span className="text-[#9aa1b2]">network.offlineMode</span>
                <span className="text-emerald-400">{String(bootConfig.offline_mode)}</span>
              </div>
            </TabsPanel>
          </div>
        </Tabs>

        {/* Footer: Template ▾ on left, Cancel + Ok on right (matches screenshot!) */}
        <div className="relative flex h-14 shrink-0 items-center justify-between border-t border-[#23262f] px-5">
          <div className="relative">
            <Button
              type="button"
              onClick={() => {
                setTemplateMenuOpen((v) => !v);
                setSaveAsOpen(false);
              }}
              aria-expanded={templateMenuOpen}
              className="flex h-8 items-center gap-2 rounded-lg border border-[#323642] bg-[#181a20] px-3 text-xs font-medium text-[#e6e8ee] hover:bg-[#23262f] focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <span>Template</span>
              <span className="text-[10px] text-[#9aa1b2]">{templateMenuOpen ? "▴" : "▾"}</span>
            </Button>

            {templateMenuOpen && (
              <div
                role="menu"
                aria-label="Chart settings templates"
                className="absolute bottom-10 left-0 z-50 w-44 rounded-lg border border-[#2b2f3b] bg-[#181a20] py-1.5 text-xs text-[#d4d8e2] shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (onApplyDefaults) {
                      onApplyDefaults();
                    } else {
                      onSettingsChange(cloneChartSettings(DEFAULT_CHART_SETTINGS));
                    }
                    setTemplateMenuOpen(false);
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left hover:bg-[#252936]"
                >
                  Apply defaults
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setSaveAsOpen(true)}
                  className="flex w-full items-center px-3 py-1.5 text-left hover:bg-[#252936]"
                >
                  Save as...
                </button>

                {saveAsOpen && (
                  <div className="border-t border-[#272b36] px-2.5 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        aria-label="New template name"
                        placeholder="Template name"
                        value={saveAsName}
                        onChange={(e) => setSaveAsName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveTemplateSubmit();
                        }}
                        className="h-7 min-w-0 flex-1 rounded border border-[#343846] bg-[#111318] px-2 text-xs text-white outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTemplateSubmit}
                        className="h-7 rounded bg-[#2962ff] px-2 text-[11px] font-semibold text-white hover:bg-[#1e53e5]"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                <div className="my-1 h-px bg-[#272b36]" aria-hidden="true" />

                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (onApplyTemplate) {
                        onApplyTemplate(tpl);
                      } else {
                        onSettingsChange(cloneChartSettings(tpl.settings));
                      }
                      setTemplateMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#252936]"
                  >
                    <span>{tpl.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              onClick={handleCancel}
              className="flex h-8 items-center justify-center rounded-md border border-[#363a45] bg-transparent px-4 text-xs font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              Cancel
            </Button>
            <DialogClose className="flex h-8 items-center justify-center rounded-md bg-[#2962ff] px-5 text-xs font-semibold text-white hover:bg-[#1e53e5] focus-visible:outline-2 focus-visible:outline-[#2962ff]">
              Ok
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
