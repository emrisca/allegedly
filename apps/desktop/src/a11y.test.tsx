import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { BookState, ProvenanceTier } from "@allegedly/ipc-client";
import { ChromeToolbar, StatusBar } from "@allegedly/ui-chrome";
import { ReplayBar } from "./components/replay-bar";
import { ChartOverlayToolbar } from "./panels/chart-panel";
import { PaperOmsPanel } from "./panels/paper-oms-panel";

describe("UV-01 @ui-sdk/react WCAG AA accessibility & SV-01 boot invariants", () => {
  it("renders ChromeToolbar, ChartOverlayToolbar, PaperOmsPanel, ReplayBar, and StatusBar with 0 critical/serious axe-core violations", async () => {
    const bootConfig = {
      updates_check_on_startup: false,
      live_armed: false,
      offline_mode: true,
    };

    const { container } = render(
      <div>
        <ChromeToolbar
          symbol="BTC/USD"
          timeframe="1m"
          bootConfig={bootConfig}
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
          bootConfig={bootConfig}
          bookState={BookState.Live}
          provenanceTier={ProvenanceTier.ExactTickAggr}
          stateRev={0}
          droppedTotal={0}
        />
      </div>,
    );

    // Safety & SV-01 UI invariants
    expect(screen.getByTestId("mode-badge").textContent).toContain("PAPER / SIM");
    expect(screen.getByTestId("live-armed-badge").textContent).toContain("LIVE_ARMED = false");
    expect(screen.getByTestId("renderer-badge").textContent).toContain("WebGL2");
    expect(screen.getByTestId("replay-sha256-badge").textContent).toContain("BIT-EXACT");
    expect(container.textContent).toContain("UPDATES_ON_BOOT: false");

    // axe-core WCAG AA verification (color-contrast disabled in jsdom since computed styles lack layout engine)
    const results = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    const criticalOrSerious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(criticalOrSerious).toEqual([]);
  });
});
