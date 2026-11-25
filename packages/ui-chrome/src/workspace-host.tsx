import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  createDockview,
  themeAbyss,
  type DockviewApi,
  type IContentRenderer,
} from "dockview";

export interface WorkspacePanelSpec {
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface WorkspaceHostProps {
  chartPanel: WorkspacePanelSpec;
  domPanel: WorkspacePanelSpec;
  executionPanel: WorkspacePanelSpec;
  onReady?: (api: DockviewApi) => void;
}

interface MountedPortal {
  id: string;
  element: HTMLElement;
}

/**
 * MIT dockview 8.9.1 WorkspaceHost (ADR-0010 / T08).
 * Uses framework-free `createDockview` with React 19 `createPortal` so docking,
 * resizing, and tab dragging run outside React reconciliation.
 */
export function WorkspaceHost({
  chartPanel,
  domPanel,
  executionPanel,
  onReady,
}: WorkspaceHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [portals, setPortals] = useState<MountedPortal[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const api = createDockview(container, {
      theme: themeAbyss,
      createComponent: (options): IContentRenderer => {
        const element = document.createElement("div");
        element.className = "h-full w-full overflow-hidden bg-zinc-950 text-zinc-100";
        element.dataset.panelId = options.id;
        return {
          element,
          init: () => {
            setPortals((prev) => {
              if (prev.some((p) => p.id === options.id)) return prev;
              return [...prev, { id: options.id, element }];
            });
          },
          dispose: () => {
            setPortals((prev) => prev.filter((p) => p.id !== options.id));
          },
        };
      },
    });

    // Canonical v0.1 3-panel trading terminal layout (T08):
    // Left-center: Chart (70%) | Right-top: DOM Ladder & Tape | Right-bottom: Paper OMS & Provenance
    api.addPanel({
      id: chartPanel.id,
      component: chartPanel.id,
      title: chartPanel.title,
    });

    api.addPanel({
      id: domPanel.id,
      component: domPanel.id,
      title: domPanel.title,
      position: { referencePanel: chartPanel.id, direction: "right" },
      initialWidth: 360,
    });

    api.addPanel({
      id: executionPanel.id,
      component: executionPanel.id,
      title: executionPanel.title,
      position: { referencePanel: domPanel.id, direction: "below" },
      initialHeight: 280,
    });

    onReady?.(api);

    return () => {
      api.dispose();
      setPortals([]);
    };
  }, [chartPanel.id, chartPanel.title, domPanel.id, domPanel.title, executionPanel.id, executionPanel.title, onReady]);

  const panelLookup: Record<string, WorkspacePanelSpec> = {
    [chartPanel.id]: chartPanel,
    [domPanel.id]: domPanel,
    [executionPanel.id]: executionPanel,
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full min-h-0 overflow-hidden"
      role="region"
      aria-label="Trading Workspace"
    >
      {portals.map((portal) => {
        const spec = panelLookup[portal.id];
        return spec ? createPortal(spec.render(), portal.element, portal.id) : null;
      })}
    </div>
  );
}
