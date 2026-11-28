import { StrictMode, startTransition, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyAppAppearanceToDocument, loadStoredAppAppearance } from "@allegedly/ui-chrome";
import "./styles.css";
import { App } from "./App";
import { FlipdotLaunchIntro } from "./components/flipdot-launch-intro";

// Apply stored/system theme synchronously before React mounts so both the root backdrop
// and FlipdotLaunchIntro match the active Light/Dark appearance from frame 0.
applyAppAppearanceToDocument(loadStoredAppAppearance());

function invokeTauriWindowCommand(cmd: string, args?: Record<string, unknown>): void {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke === "function") {
    void invoke(cmd, args).catch(() => {});
  }
}

function LaunchShell() {
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [mountApp, setMountApp] = useState(reducedMotion);
  const [appVisible, setAppVisible] = useState(reducedMotion);

  const handleFirstFramePainted = useCallback((light: boolean) => {
    invokeTauriWindowCommand("reveal_launch_window", { light });
    // Mount <App /> invisibly right after the intro's first frame is on screen so the
    // launch intro appears immediately while the chart warms up behind it.
    window.setTimeout(() => {
      startTransition(() => {
        setMountApp(true);
      });
    }, 16);
  }, []);

  const handleStartExit = useCallback(() => {
    setMountApp(true);
    setAppVisible(true);
  }, []);

  const handleIntroComplete = useCallback(() => {
    invokeTauriWindowCommand("set_traffic_lights_visible", { visible: true });
  }, []);

  return (
    <>
      {mountApp && (
        <div
          className={
            appVisible
              ? "h-full w-full opacity-100"
              : "pointer-events-none h-full w-full opacity-0"
          }
        >
          <App />
        </div>
      )}
      <FlipdotLaunchIntro
        onFirstFramePainted={handleFirstFramePainted}
        onStartExit={handleStartExit}
        onComplete={handleIntroComplete}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LaunchShell />
  </StrictMode>,
);
