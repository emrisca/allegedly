import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = () => [];
}

afterEach(() => {
  cleanup();
});
import axe from "axe-core";
import { BookState, OfflineSimTransportAdapter, ProvenanceTier } from "@allegedly/ipc-client";
import { ChromeToolbar, StatusBar } from "@allegedly/ui-chrome";
import { ReplayBar } from "./components/replay-bar";
import { DEFAULT_FAVORITE_TOOLS } from "./drawings/drawing-engine";
import { LeftDrawingRail } from "./components/left-drawing-rail";
import { SymbolSearchDialog } from "./components/symbol-search-dialog";
import { IndicatorsDialog } from "./components/indicators-dialog";
import {
  DEFAULT_TIMEFRAME_VISIBILITY,
  IndicatorSettingsDialog,
} from "./components/indicator-settings-dialog";
import {
  DrawingQuickStyleBar,
  DrawingSettingsDialog,
} from "./components/drawing-settings-dialog";
import { ActiveIndicatorsLegend, ChartOverlayToolbar } from "./panels/chart-panel";
import { PaperOmsPanel } from "./panels/paper-oms-panel";
import { createDefaultAlertDraft } from "./alerts/alert-engine";
import { AlertDialog } from "./components/alert-dialog";
import { AlertsPanel } from "./components/alerts-panel";
import { ObjectTreePanel } from "./components/object-tree-panel";

const BOOT_CONFIG = {
  updates_check_on_startup: false,
  live_armed: false,
  offline_mode: true,
};

async function expectZeroCriticalOrSeriousAxe(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  const criticalOrSerious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(criticalOrSerious).toEqual([]);
}

describe("UV-01 @ui-sdk/react WCAG AA accessibility, SV-01 boot invariants & RTSD-17 UI behavior", () => {
  it("renders main chrome, overlays, OMS, ReplayBar, and StatusBar with 0 critical/serious axe-core violations", async () => {
    const { container } = render(
      <div>
        <ChromeToolbar
          symbol="BTC/USD"
          timeframe="1m"
          bootConfig={BOOT_CONFIG}
          stateRev={0}
          onSymbolChange={() => {}}
          onTimeframeChange={() => {}}
          onKillSwitch={() => {}}
          onResetLayout={() => {}}
        />
        <main>
          <ChartOverlayToolbar
            visibility={{ footprint: true, vrvp: true, tpo: true }}
            activeTool="trendline"
            magnetEnabled={true}
            canUndo={true}
            canRedo={false}
            drawingCount={2}
            rendererLabel="WebGL2"
            onToggleVisibility={() => {}}
            onSelectTool={() => {}}
            onToggleMagnet={() => {}}
            onUndo={() => {}}
            onRedo={() => {}}
            onClearDrawings={() => {}}
          />
          <PaperOmsPanel
            symbol="BTC/USD"
            account={{
              mode: "PAPER / SIM",
              live_armed: false,
              net_position_e9: { "BTC/USD": "500000000" },
              orders: [],
            }}
            bookState={BookState.Live}
            provenanceTier={ProvenanceTier.ExactTickAggr}
            settings={[
              {
                key: "updates.checkOnStartup",
                value: "false",
                source_layer: "defaults",
                inherited_value: "false",
                is_overridden: false,
                locked: true,
              },
              {
                key: "orderflow.imbalance_ratio_bps",
                value: "30000",
                source_layer: "defaults",
                inherited_value: "30000",
                is_overridden: false,
                locked: false,
              },
            ]}
            onSubmitOrder={() => {}}
            onKillSwitch={() => {}}
          />
        </main>
        <ReplayBar
          status={{
            playing: false,
            speed: "1x",
            cursor: 250,
            total_ticks: 2000,
            bars_sealed: 4,
            final_vwap_e9: "95000000000000",
            sha256_hex: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            determinism_verified: true,
          }}
          onControl={() => {}}
        />
        <StatusBar
          transportKind="offline-sim"
          bootConfig={BOOT_CONFIG}
          bookState={BookState.Live}
          provenanceTier={ProvenanceTier.ExactTickAggr}
          stateRev={0}
          droppedTotal={0}
        />
      </div>,
    );

    expect(screen.getByTestId("market-data-feed-trigger").textContent).toContain("Sim");
    expect(screen.getByTestId("live-armed-badge").textContent).toContain("LIVE_ARMED = false");
    expect(screen.getByTestId("renderer-badge").textContent).toContain("WebGL2");
    expect(screen.getByRole("toolbar", { name: "Bar replay controls" })).toBeTruthy();
    expect(screen.getByRole("contentinfo", { name: "Chart range and scale bar" })).toBeTruthy();

    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("opens Settings Dialog and Command Palette, invokes wired display switches, and passes axe-core", async () => {
    const onCompactChange = vi.fn();
    const onProvChange = vi.fn();

    const { container } = render(
      <ChromeToolbar
        symbol="BTC/USD"
        timeframe="1m"
        bootConfig={BOOT_CONFIG}
        stateRev={3}
        onSymbolChange={() => {}}
        onTimeframeChange={() => {}}
        onKillSwitch={() => {}}
        onResetLayout={() => {}}
        compactDensity={true}
        onCompactDensityChange={onCompactChange}
        showProvenanceOverlay={true}
        onShowProvenanceOverlayChange={onProvChange}
      />,
    );

    // Open Settings Dialog and inspect Display tab switches
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Workspace Display" }));
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    fireEvent.click(switches[0]);
    fireEvent.click(switches[1]);
    expect(onCompactChange).toHaveBeenCalledWith(false);
    expect(onProvChange).toHaveBeenCalledWith(false);

    await expectZeroCriticalOrSeriousAxe(container);

    // Close Settings and open Command Palette
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: /Symbol search/i }));
    expect(screen.getByPlaceholderText(/Type a symbol/i)).toBeTruthy();

    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("renders T1..T5 provenance labels, colors non-Live book states, supports CVD/FP Delta studies and arbitrary setting overrides", async () => {
    const onUpdateSetting = vi.fn();
    const onRunBuiltinStudy = vi.fn();

    const { container } = render(
      <div>
        <PaperOmsPanel
          symbol="BTC/USD"
          account={{
            mode: "PAPER / SIM",
            live_armed: false,
            net_position_e9: { "BTC/USD": "0" },
            orders: [],
          }}
          bookState={BookState.Stale}
          provenanceTier={ProvenanceTier.ExactL3Mbo}
          settings={[
            {
              key: "chart.custom_bar_gap",
              value: "12",
              source_layer: "defaults",
              inherited_value: "12",
              is_overridden: false,
              locked: false,
            },
          ]}
          onSubmitOrder={() => {}}
          onKillSwitch={() => {}}
          onRunBuiltinStudy={onRunBuiltinStudy}
          onUpdateSetting={onUpdateSetting}
        />
        <StatusBar
          transportKind="tauri"
          bootConfig={BOOT_CONFIG}
          bookState={BookState.Disconnected}
          provenanceTier={ProvenanceTier.ExactL3Mbo}
          stateRev={1}
          droppedTotal={2}
          showProvenance={false}
        />
      </div>,
    );

    // Clean TradingView StatusBar keeps engineering provenance/book badges off the bottom chart bar
    expect(screen.getByRole("contentinfo", { name: "Chart range and scale bar" })).toBeTruthy();
    expect(screen.queryByTestId("status-provenance-badge")).toBeNull();

    // Provenance tab shows T1..T5 (never T0) and amber for Stale
    fireEvent.click(screen.getByRole("tab", { name: "Provenance" }));
    expect(screen.getByTestId("oms-book-state-badge").className).toContain("text-amber-300");
    expect(container.textContent).toContain("T1 · EXACT: L3 MBO");
    expect(container.textContent).toContain("T5 · SYNTHETIC: INTRABAR");
    expect(container.textContent).not.toContain("T0 ·");

    // Studies tab includes CVD and FP Delta buttons
    fireEvent.click(screen.getByRole("tab", { name: /Studies/i }));
    fireEvent.click(screen.getByRole("button", { name: "+ CVD" }));
    fireEvent.click(screen.getByRole("button", { name: "+ FP Delta" }));
    expect(onRunBuiltinStudy).toHaveBeenCalledWith("cvd", 1);
    expect(onRunBuiltinStudy).toHaveBeenCalledWith("footprint_delta", 1);

    // TOML Cascade tab allows editing any unlocked setting key
    fireEvent.click(screen.getByRole("tab", { name: "TOML Cascade" }));
    fireEvent.click(screen.getByRole("button", { name: "Override" }));
    const input = screen.getByLabelText("Override value for chart.custom_bar_gap");
    fireEvent.change(input, { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdateSetting).toHaveBeenCalledWith("chart.custom_bar_gap", "24");

    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("renders two-tier obsidian top bar with chart tabs, timeframes, alert, snapshot, and provenance triggers", async () => {
    const onSelectTab = vi.fn();
    const onAddTab = vi.fn();
    const onCloseTab = vi.fn();
    const onTimeframeChange = vi.fn();
    const onAddAlert = vi.fn();
    const onTakeSnapshot = vi.fn();
    const onOpenProvenance = vi.fn();

    const { container } = render(
      <ChromeToolbar
        symbol="NQ1!"
        timeframe="D"
        bootConfig={BOOT_CONFIG}
        stateRev={2}
        workspaceName="DESK"
        alertsCount={3}
        chartTabs={[
          {
            id: "tab-1",
            symbol: "NQ1!",
            timeframe: "D",
            shortLabel: "100",
            badgeColor: "#0284c7",
            badgeText: "#ffffff",
            priceText: "25,756.00",
            changePct: -1.98,
          },
          {
            id: "tab-2",
            symbol: "ES1!",
            timeframe: "4h",
            shortLabel: "500",
            badgeColor: "#dc2626",
            badgeText: "#ffffff",
            priceText: "7,142.50",
            changePct: -0.96,
          },
        ]}
        activeTabId="tab-1"
        onSelectTab={onSelectTab}
        onAddTab={onAddTab}
        onCloseTab={onCloseTab}
        onSymbolChange={() => {}}
        onTimeframeChange={onTimeframeChange}
        onKillSwitch={() => {}}
        onResetLayout={() => {}}
        onAddAlert={onAddAlert}
        onTakeSnapshot={onTakeSnapshot}
        onOpenProvenance={onOpenProvenance}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chart tab ES1!" }));
    expect(onSelectTab).toHaveBeenCalledWith("tab-2");

    fireEvent.click(screen.getByRole("button", { name: "New chart tab" }));
    expect(onAddTab).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close ES1! tab" }));
    expect(onCloseTab).toHaveBeenCalledWith("tab-2");

    fireEvent.click(screen.getByRole("button", { name: "Timeframe 4h" }));
    expect(onTimeframeChange).toHaveBeenCalledWith("4h");

    fireEvent.click(screen.getByRole("button", { name: "Add price alert" }));
    expect(onAddAlert).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Take chart snapshot" }));
    expect(onTakeSnapshot).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Data & System Info" }));
    expect(onOpenProvenance).toHaveBeenCalledTimes(1);

    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("opens LeftDrawingRail category flyouts, toggles favorites/ruler/zoom/lock/hide, and passes axe-core", async () => {
    const onSelectTool = vi.fn();
    const onToggleFavoriteTool = vi.fn();
    const onToggleStayInDrawingMode = vi.fn();
    const onToggleDrawingsLocked = vi.fn();
    const onToggleDrawingsHidden = vi.fn();
    const onToggleFloatingBar = vi.fn();

    const { container } = render(
      <LeftDrawingRail
        activeTool="cursor"
        magnetEnabled={true}
        showFloatingBar={true}
        stayInDrawingMode={false}
        drawingsLocked={false}
        drawingsHidden={false}
        favoriteTools={DEFAULT_FAVORITE_TOOLS}
        drawingCount={2}
        onSelectTool={onSelectTool}
        onToggleMagnet={() => {}}
        onToggleFloatingBar={onToggleFloatingBar}
        onToggleStayInDrawingMode={onToggleStayInDrawingMode}
        onToggleDrawingsLocked={onToggleDrawingsLocked}
        onToggleDrawingsHidden={onToggleDrawingsHidden}
        onToggleFavoriteTool={onToggleFavoriteTool}
        onClearDrawings={() => {}}
      />,
    );

    // Open Forecasting, Volume & Measurers flyout drawer
    fireEvent.click(screen.getByRole("button", { name: "Open Forecasting, Volume & Measurers menu" }));
    expect(screen.getByRole("dialog", { name: "Forecasting, Volume & Measurers" })).toBeTruthy();
    expect(container.textContent).toContain("FORECASTING");
    expect(container.textContent).toContain("VOLUME-BASED");
    expect(container.textContent).toContain("MEASURERS");

    await expectZeroCriticalOrSeriousAxe(container);

    // Toggle favorite on Position forecast
    fireEvent.click(screen.getByRole("button", { name: "Add Position forecast to favorites" }));
    expect(onToggleFavoriteTool).toHaveBeenCalledWith("position_forecast");

    // Pick Fixed range volume profile from drawer
    fireEvent.click(screen.getByRole("button", { name: /^Fixed range volume profile$/i }));
    expect(onSelectTool).toHaveBeenCalledWith("fixed_range_vp");

    // Toggle Ruler, Zoom In, Stay in Drawing Mode, Lock, Hide, and Favorites Star
    fireEvent.click(screen.getByRole("button", { name: "Measure ruler" }));
    expect(onSelectTool).toHaveBeenCalledWith("ruler");

    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    expect(onSelectTool).toHaveBeenCalledWith("zoom_in");

    fireEvent.click(screen.getByRole("button", { name: "Stay in Drawing Mode" }));
    expect(onToggleStayInDrawingMode).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Lock All Drawing Tools" }));
    expect(onToggleDrawingsLocked).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Hide All Drawings" }));
    expect(onToggleDrawingsHidden).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Toggle floating favorites drawing toolbar" }));
    expect(onToggleFloatingBar).toHaveBeenCalledTimes(1);
  });

  it("opens centered IndicatorsDialog (Favorites, My scripts, Technicals, Fundamentals), searches/stars/runs studies, and passes axe-core", async () => {
    const onRunBuiltinStudy = vi.fn();
    const onRemoveStudy = vi.fn();
    const onRunLuauStudy = vi.fn();
    const onToggleLayer = vi.fn();
    const onOpenStudies = vi.fn();

    const { container } = render(
      <div>
        <ChromeToolbar
          symbol="NQ1!"
          timeframe="D"
          bootConfig={BOOT_CONFIG}
          stateRev={0}
          onSymbolChange={() => {}}
          onTimeframeChange={() => {}}
          onKillSwitch={() => {}}
          onResetLayout={() => {}}
          onOpenStudies={onOpenStudies}
        />
        <IndicatorsDialog
          open={true}
          onOpenChange={() => {}}
          activeStudies={[
            {
              id: "vwap-1",
              label: "VWAP",
              overlay: true,
              values: [25700, 25710],
              memory_pool_reserved_bytes: 0,
              memory_pool_peak_bytes: 0,
              memory_pool_cap_bytes: 2 * 1024 * 1024,
            },
          ]}
          layerState={{
            volume: true,
            vrvp: false,
            footprint: false,
            tpo: false,
          }}
          onRunBuiltinStudy={onRunBuiltinStudy}
          onRemoveStudy={onRemoveStudy}
          onRunLuauStudy={onRunLuauStudy}
          onClearStudies={() => {}}
          onToggleLayer={onToggleLayer}
        />
      </div>,
    );

    // Top toolbar Indicators button invokes onOpenStudies
    fireEvent.click(screen.getByRole("button", { name: "Open Indicators" }));
    expect(onOpenStudies).toHaveBeenCalledTimes(1);

    // Modal title, search input, and sidebar categories render
    expect(screen.getByRole("dialog", { name: "Indicators, metrics, and strategies" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Favorites" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "My scripts" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Technicals" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Fundamentals" })).toBeTruthy();

    await expectZeroCriticalOrSeriousAxe(document.body);
    expect(container).toBeTruthy();

    // Activating an indicator from Favorites calls onRunBuiltinStudy
    fireEvent.click(screen.getByRole("button", { name: /^Relative strength index/i }));
    expect(onRunBuiltinStudy).toHaveBeenCalledWith("wilder_rsi", 14);

    // Activating Session volume profile toggles vrvp layer
    fireEvent.click(screen.getByRole("button", { name: /^Session volume profile$/i }));
    expect(onToggleLayer).toHaveBeenCalledWith("vrvp");

    // Searching filters across all categories
    const search = screen.getByLabelText("Search indicators, metrics, and strategies");
    fireEvent.change(search, { target: { value: "Cumulative volume delta" } });
    expect(screen.getByRole("button", { name: /^Cumulative volume delta/i })).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });

    // Switching to My scripts and saving/running Luau script invokes onRunLuauStudy
    fireEvent.click(screen.getByRole("tab", { name: "My scripts" }));
    const nameInput = screen.getByLabelText("Luau script name");
    fireEvent.change(nameInput, { target: { value: "VWAP Deviation Band" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & Add to Chart/i }));
    expect(onRunLuauStudy).toHaveBeenCalledWith(
      expect.stringContaining("close"),
      expect.stringContaining("luau-"),
      "VWAP Deviation Band",
    );

    // Fundamentals reports honest local offline status
    fireEvent.click(screen.getByRole("tab", { name: "Fundamentals" }));
    expect(document.body.textContent).toContain("OFFLINE_MODE");
  });

  it("renders ActiveIndicatorsLegend rows with hide/show eye toggle, remove, collapse chevron, and passes axe-core", async () => {
    const onToggleExpanded = vi.fn();
    const onToggleVolumeHidden = vi.fn();
    const onRemoveVolume = vi.fn();
    const onToggleStudyHidden = vi.fn();
    const onRemoveStudy = vi.fn();
    const onToggleOrderflowHidden = vi.fn();
    const onRemoveOrderflow = vi.fn();

    const { container, rerender } = render(
      <ActiveIndicatorsLegend
        studyOverlays={[
          { id: "vwap-1", label: "VWAP Session", color: "#3b82f6", values: [7369.22] },
          { id: "sma-20", label: "SMA (20)", color: "#34d399", values: [7340.1] },
        ]}
        hiddenStudyIds={new Set(["sma-20"])}
        showVolumeRow={true}
        volumeHidden={false}
        activeOrderflowRows={[
          { key: "vrvp", label: "Session Volume Profile", badge: "VRVP", color: "#38bdf8" },
        ]}
        hiddenOrderflowLayers={new Set()}
        expanded={true}
        indicatorInputs={true}
        indicatorValues={true}
        formatPriceValue={(v) => v.toFixed(2)}
        onToggleExpanded={onToggleExpanded}
        onToggleVolumeHidden={onToggleVolumeHidden}
        onRemoveVolume={onRemoveVolume}
        onToggleStudyHidden={onToggleStudyHidden}
        onRemoveStudy={onRemoveStudy}
        onToggleOrderflowHidden={onToggleOrderflowHidden}
        onRemoveOrderflow={onRemoveOrderflow}
      />,
    );

    expect(container.textContent).toContain("Vol");
    expect(container.textContent).toContain("VWAP Session");
    expect(container.textContent).toContain("7369.22");
    expect(container.textContent).toContain("SMA (20)");
    expect(container.textContent).toContain("Session Volume Profile");

    await expectZeroCriticalOrSeriousAxe(container);

    // Hidden study displays Show button, visible displays Hide
    fireEvent.click(screen.getByRole("button", { name: "Show SMA (20)" }));
    expect(onToggleStudyHidden).toHaveBeenCalledWith("sma-20");

    fireEvent.click(screen.getByRole("button", { name: "Remove VWAP Session" }));
    expect(onRemoveStudy).toHaveBeenCalledWith("vwap-1");

    fireEvent.click(screen.getByRole("button", { name: "Hide Volume" }));
    expect(onToggleVolumeHidden).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove Volume" }));
    expect(onRemoveVolume).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Collapse active indicators" }));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    // Collapsed view hides rows and renders expand toggle with count
    rerender(
      <ActiveIndicatorsLegend
        studyOverlays={[
          { id: "vwap-1", label: "VWAP Session", color: "#3b82f6", values: [7369.22] },
        ]}
        hiddenStudyIds={new Set()}
        showVolumeRow={true}
        volumeHidden={false}
        activeOrderflowRows={[]}
        hiddenOrderflowLayers={new Set()}
        expanded={false}
        indicatorInputs={true}
        indicatorValues={true}
        formatPriceValue={(v) => v.toFixed(2)}
        onToggleExpanded={onToggleExpanded}
        onToggleVolumeHidden={onToggleVolumeHidden}
        onRemoveVolume={onRemoveVolume}
        onToggleStudyHidden={onToggleStudyHidden}
        onRemoveStudy={onRemoveStudy}
        onToggleOrderflowHidden={onToggleOrderflowHidden}
        onRemoveOrderflow={onRemoveOrderflow}
      />,
    );

    expect(screen.getByRole("button", { name: "Expand active indicators" }).textContent).toContain("2");
    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("renders IndicatorSettingsDialog (Inputs/Style/Visibility), saves custom config, and passes axe-core", async () => {
    const onSave = vi.fn();
    const { container } = render(
      <IndicatorSettingsDialog
        open={true}
        config={{
          id: "sma-20",
          label: "SMA (20)",
          builtin: "sma",
          period: 20,
          source: "close",
          color: "#38bdf8",
          lineWidth: 2,
          lineStyle: "solid",
          opacity: 1,
          showPriceLabel: true,
          showPriceLine: false,
          visibility: { ...DEFAULT_TIMEFRAME_VISIBILITY },
        }}
        onOpenChange={() => {}}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("SMA (20)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Length"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("tab", { name: "Style" }));
    fireEvent.click(screen.getByRole("button", { name: "dashed" }));
    fireEvent.click(screen.getByRole("tab", { name: "Visibility" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sma-20",
        period: 50,
        lineStyle: "dashed",
      }),
    );
    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("renders DrawingQuickStyleBar & DrawingSettingsDialog (Style/Text/Coordinates/Visibility) and passes axe-core", async () => {
    const onUpdate = vi.fn();
    const onOpenSettings = vi.fn();
    const onDelete = vi.fn();
    const onSave = vi.fn();
    const drawing = {
      id: "drw-1",
      kind: "trendline" as const,
      symbol: "BTC/USD",
      anchors: [
        { timeSec: 1700000000, priceTick: 190_000n },
        { timeSec: 1700003600, priceTick: 192_000n },
      ],
      color: "#2962ff",
      lineWidth: 2 as const,
      lineStyle: "solid" as const,
    };

    const { container } = render(
      <div>
        <DrawingQuickStyleBar
          drawing={drawing}
          onUpdate={onUpdate}
          onOpenSettings={onOpenSettings}
          onDelete={onDelete}
        />
        <DrawingSettingsDialog
          open={true}
          drawing={drawing}
          tickSizeE9={500_000_000n}
          decimals={2}
          onOpenChange={() => {}}
          onSave={onSave}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Line width 2px" }));
    expect(onUpdate).toHaveBeenCalledWith({ lineWidth: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Open drawing settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Text" }));
    fireEvent.change(screen.getByLabelText("Label / Annotation Text"), {
      target: { value: "Key Support" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Coordinates" }));
    fireEvent.click(screen.getByRole("tab", { name: "Visibility" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onSave).toHaveBeenCalledWith(
      "drw-1",
      expect.objectContaining({
        label: "Key Support",
      }),
    );
    await expectZeroCriticalOrSeriousAxe(container);
  });

  it("enforces SV-01 offline default in OfflineSimTransportAdapter market data status and validates live symbols", async () => {
    const adapter = new OfflineSimTransportAdapter();
    try {
      const status = await adapter.invokeJson<Record<string, never>, { source: string; connected: boolean }>(
        "get_market_data_status",
        {},
      );
      expect(status.source).toBe("paper_sim");
      expect(status.connected).toBe(true);

      await expect(
        adapter.invokeJson("set_market_data_source", {
          source: "kraken_ws_v2",
          symbol: "ES1!",
        }),
      ).rejects.toThrow(/Unsupported live symbol/);
    } finally {
      adapter.dispose();
    }
  });

  it("renders SymbolSearchDialog with multi-provider picker, subscription-required prompt, and Settings Appearance/Data Providers tabs", async () => {
    const onSelect = vi.fn();
    const onToggleWl = vi.fn();
    const onConfigure = vi.fn();
    const { container, unmount } = render(
      <SymbolSearchDialog
        open
        initialQuery="NQ"
        mode="switch"
        watchlistSymbols={["BTC/USD"]}
        providerConfigs={{}}
        onOpenChange={vi.fn()}
        onSelectSymbol={onSelect}
        onToggleWatchlist={onToggleWl}
        onConfigureProvider={onConfigure}
      />,
    );

    // Filter pills & matched Futures ticker with CME + Databento
    expect(screen.getByRole("button", { name: "Futures" })).toBeTruthy();
    expect(screen.getByText("E-mini Nasdaq-100 Futures")).toBeTruthy();

    // Expand multi-provider list for NQ1!
    const expandBtn = screen.getByRole("button", { name: /more providers for NQ1!/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText("Rithmic")).toBeTruthy();
    expect(screen.getByText("Tradovate")).toBeTruthy();
    expect(screen.getByText("ProjectX")).toBeTruthy();

    // Clicking an unconfigured subscription provider shows Subscription Required prompt
    fireEvent.click(screen.getByText("Rithmic"));
    expect(screen.getByRole("alertdialog", { name: "Subscription required" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Configure Rithmic Key/i }));
    expect(onConfigure).toHaveBeenCalledWith("rithmic");

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
    unmount();
  });

  it("renders AlertDialog and AlertsPanel (Alerts/Log) with TradingView alert controls and passes axe-core", async () => {
    const draft = createDefaultAlertDraft({
      symbol: "NQ1!",
      timeframe: "5m",
      price: 27032.25,
      decimals: 2,
      nowMs: Date.parse("2026-11-27T14:43:00Z"),
    });
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    const onTogglePause = vi.fn();

    const { container, unmount } = render(
      <div>
        <AlertsPanel
          activeSymbol="NQ1!"
          alerts={[draft]}
          logs={[
            {
              id: "log-1",
              alertId: draft.id,
              symbol: "NQ1!",
              timeframe: "5m",
              name: "NQ1! Crossing 27,032.25",
              message: "NQ1! Crossing 27,032.25",
              triggeredAt: Date.parse("2026-11-27T14:45:00Z"),
              price: 27032.25,
            },
          ]}
          onCreateAlert={vi.fn()}
          onEditAlert={onEdit}
          onTogglePauseAlert={onTogglePause}
          onDeleteAlert={onDelete}
          onClearLogs={vi.fn()}
          onCollapse={vi.fn()}
        />
        <AlertDialog
          open={true}
          mode="edit"
          initialAlert={draft}
          availableSymbols={["NQ1!", "BTC/USD"]}
          availableSources={["VWAP (Session)"]}
          decimals={2}
          onOpenChange={vi.fn()}
          onSave={onSave}
          onDelete={onDelete}
        />
      </div>,
    );

    expect(screen.getByText(/Edit alert on/i)).toBeTruthy();
    expect(screen.getByText(/App, Toasts, Sound/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Add condition/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: /Log/i }));
    expect(screen.getAllByText(/NQ1! Crossing 27,032\.25/i).length).toBeGreaterThan(0);

    await expectZeroCriticalOrSeriousAxe(container);
    unmount();
  });

  it("renders ObjectTreePanel (Object tree and Data window sub-tabs) and passes axe-core", async () => {
    const onSubTabChange = vi.fn();
    const onCreateGroup = vi.fn();
    const onSelectDrawing = vi.fn();
    const onToggleDrawingHidden = vi.fn();
    const onToggleIndicatorHidden = vi.fn();

    const sharedProps = {
      symbol: "NQ1!",
      providerTag: "CME",
      timeframe: "5",
      indicators: [
        { id: "vwapKeyLevels", label: "VWAP Key Levels", kind: "orderflow" as const, hidden: false, color: "#f59e0b" },
        { id: "volume", label: "Vol", kind: "volume" as const, hidden: false, color: "#26a69a" },
      ],
      drawings: [
        {
          id: "drw-tl-1",
          kind: "trendline" as const,
          symbol: "NQ1!",
          anchors: [
            { timeSec: 1700000000, priceTick: 27000n },
            { timeSec: 1700003600, priceTick: 27050n },
          ],
          color: "#2962ff",
          lineWidth: 2 as const,
          lineStyle: "solid" as const,
          label: "Trendline",
        },
      ],
      groups: [
        { id: "grp-1", name: "Session Levels", hidden: false, locked: false, collapsed: false },
      ],
      selectedDrawingId: "drw-tl-1",
      allDrawingsHidden: false,
      dataWindow: {
        timeSec: 1764283500,
        open: 27010.25,
        high: 27045.5,
        low: 27002.0,
        close: 27032.25,
        change: 22.0,
        changePct: 0.08,
        volume: 1450,
        lastDayChange: 120.5,
        lastDayChangePct: 0.45,
        decimals: 2,
        indicators: [
          { id: "volume", label: "Vol", value: "1.45K", color: "#26a69a" },
          { id: "vwap", label: "VWAP (Session)", value: "27,028.10", color: "#3b82f6" },
        ],
      },
      onSubTabChange,
      onToggleAllDrawingsHidden: vi.fn(),
      onCreateGroup,
      onRenameGroup: vi.fn(),
      onToggleGroupCollapsed: vi.fn(),
      onToggleGroupHidden: vi.fn(),
      onToggleGroupLocked: vi.fn(),
      onDeleteGroup: vi.fn(),
      onToggleIndicatorHidden,
      onOpenIndicatorSettings: vi.fn(),
      onRemoveIndicator: vi.fn(),
      onSelectDrawing,
      onToggleDrawingHidden,
      onToggleDrawingLocked: vi.fn(),
      onOpenDrawingSettings: vi.fn(),
      onRemoveDrawing: vi.fn(),
      onAssignDrawingGroup: vi.fn(),
      onReorderDrawing: vi.fn(),
      onCollapse: vi.fn(),
    };

    const { container, rerender, unmount } = render(
      <ObjectTreePanel {...sharedProps} activeSubTab="tree" />,
    );

    expect(screen.getByText("VWAP Key Levels")).toBeTruthy();
    expect(screen.getByText("Trendline")).toBeTruthy();
    expect(screen.getByText(/Session Levels/)).toBeTruthy();
    await expectZeroCriticalOrSeriousAxe(container);

    fireEvent.click(screen.getByRole("tab", { name: "Data window" }));
    expect(onSubTabChange).toHaveBeenCalledWith("data");

    rerender(<ObjectTreePanel {...sharedProps} activeSubTab="data" />);
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("27,032.25")).toBeTruthy();
    expect(screen.getByText("VWAP (Session)")).toBeTruthy();
    await expectZeroCriticalOrSeriousAxe(container);
    unmount();
  });

});
