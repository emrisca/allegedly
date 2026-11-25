import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = () => [];
}

afterEach(() => {
  cleanup();
});
import axe from "axe-core";
import { BookState, ProvenanceTier } from "@allegedly/ipc-client";
import { ChromeToolbar, StatusBar } from "@allegedly/ui-chrome";
import { ReplayBar } from "./components/replay-bar";
import { ChartOverlayToolbar } from "./panels/chart-panel";
import { PaperOmsPanel } from "./panels/paper-oms-panel";

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

    expect(screen.getByTestId("mode-badge").textContent).toContain("PAPER / SIM");
    expect(screen.getByTestId("live-armed-badge").textContent).toContain("LIVE_ARMED = false");
    expect(screen.getByTestId("renderer-badge").textContent).toContain("WebGL2");
    expect(screen.getByTestId("replay-sha256-badge").textContent).toContain("BIT-EXACT");
    expect(container.textContent).toContain("UPDATES_ON_BOOT: false");

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
    fireEvent.click(screen.getByRole("button", { name: /Command/i }));
    expect(screen.getByPlaceholderText(/Type a symbol or command/i)).toBeTruthy();

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

    // StatusBar colors Disconnected as rose and hides provenance when showProvenance=false
    const bookIndicator = screen.getByTestId("status-book-indicator");
    expect(bookIndicator.className).toContain("text-rose-400");
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
});
