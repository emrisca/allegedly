import { useEffect, useRef, useState } from "react";
import {
  DRAWING_SLOTS,
  DRAWING_TOOL_META,
  ICON_STAMP_CHOICES,
  getDrawingToolMeta,
  type DrawingToolKind,
  type PlacedDrawingKind,
  type ToolSlotId,
} from "../drawings/drawing-engine";
import { DrawingToolIcon } from "./drawing-tool-icons";

export interface LeftDrawingRailProps {
  activeTool: DrawingToolKind;
  magnetEnabled: boolean;
  showFloatingBar: boolean;
  stayInDrawingMode?: boolean;
  drawingsLocked?: boolean;
  drawingsHidden?: boolean;
  favoriteTools?: readonly PlacedDrawingKind[];
  activeIconStamp?: string;
  drawingCount: number;
  onSelectTool: (tool: DrawingToolKind) => void;
  onToggleMagnet: () => void;
  onToggleFloatingBar: () => void;
  onToggleStayInDrawingMode?: () => void;
  onToggleDrawingsLocked?: () => void;
  onToggleDrawingsHidden?: () => void;
  onToggleFavoriteTool?: (tool: PlacedDrawingKind) => void;
  onSelectIconStamp?: (glyph: string) => void;
  onResetZoom?: () => void;
  onClearDrawings: () => void;
}

export function LeftDrawingRail({
  activeTool,
  magnetEnabled,
  showFloatingBar,
  stayInDrawingMode = false,
  drawingsLocked = false,
  drawingsHidden = false,
  favoriteTools = [],
  activeIconStamp = "★",
  drawingCount,
  onSelectTool,
  onToggleMagnet,
  onToggleFloatingBar,
  onToggleStayInDrawingMode,
  onToggleDrawingsLocked,
  onToggleDrawingsHidden,
  onToggleFavoriteTool,
  onSelectIconStamp,
  onResetZoom,
  onClearDrawings,
}: LeftDrawingRailProps) {
  const railRef = useRef<HTMLElement | null>(null);
  const [openSlot, setOpenSlot] = useState<ToolSlotId | null>(null);
  const [slotTools, setSlotTools] = useState<Record<ToolSlotId, PlacedDrawingKind>>(() => ({
    lines: "trendline",
    fibs: "fib_retracement",
    patterns: "xabcd_pattern",
    forecast: "long_position",
    shapes: "brush",
    text: "text",
    icons: "icon_stamp",
  }));

  // Keep slot icon synchronized when activeTool is chosen via floating bar or shortcut
  useEffect(() => {
    if (activeTool === "cursor" || activeTool === "ruler" || activeTool === "zoom_in") return;
    const meta = getDrawingToolMeta(activeTool);
    if (meta.slot) {
      setSlotTools((prev) =>
        prev[meta.slot!] === activeTool ? prev : { ...prev, [meta.slot!]: activeTool },
      );
    }
  }, [activeTool]);

  // Close flyout drawer on outside click or Escape
  useEffect(() => {
    if (!openSlot) return;
    const onPointerDown = (e: PointerEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setOpenSlot(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenSlot(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openSlot]);

  const favSet = new Set<PlacedDrawingKind>(favoriteTools);
  const openSlotDef = openSlot ? DRAWING_SLOTS.find((s) => s.id === openSlot) ?? null : null;

  const handleSelectFromDrawer = (kind: PlacedDrawingKind, slotId: ToolSlotId) => {
    setSlotTools((prev) => ({ ...prev, [slotId]: kind }));
    onSelectTool(kind);
    setOpenSlot(null);
  };

  return (
    <aside
      ref={railRef}
      aria-label="Chart drawing tools"
      className="relative z-30 flex w-11 shrink-0 flex-col items-center justify-between border-r border-[#2a2e39] bg-[#131722] py-1.5 select-none"
    >
      <div className="flex w-full flex-col items-center gap-0.5">
        {/* Top Crosshair / Cursor */}
        <button
          type="button"
          title="Crosshair (Esc)"
          aria-label="Crosshair"
          aria-pressed={activeTool === "cursor"}
          onClick={() => {
            onSelectTool("cursor");
            setOpenSlot(null);
          }}
          className={
            activeTool === "cursor"
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <DrawingToolIcon kind="cursor" />
        </button>

        {/* 7 Categorized Tool Slots with Flyout Drawers */}
        {DRAWING_SLOTS.map((slot) => {
          const currentToolKind = slotTools[slot.id];
          const currentMeta = getDrawingToolMeta(currentToolKind);
          const isGroupActive =
            activeTool !== "cursor" &&
            activeTool !== "ruler" &&
            activeTool !== "zoom_in" &&
            getDrawingToolMeta(activeTool).slot === slot.id;
          const isDrawerOpen = openSlot === slot.id;

          return (
            <div key={slot.id} className="group relative flex w-full items-center justify-center">
              <button
                type="button"
                title={`${currentMeta.label} (${slot.label})`}
                aria-label={currentMeta.label}
                aria-pressed={isGroupActive}
                onClick={() => {
                  if (isGroupActive) {
                    setOpenSlot((curr) => (curr === slot.id ? null : slot.id));
                  } else {
                    onSelectTool(currentToolKind);
                    setOpenSlot(null);
                  }
                }}
                className={
                  isGroupActive || isDrawerOpen
                    ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                    : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                }
              >
                <DrawingToolIcon kind={currentToolKind} />
              </button>

              {/* Subtle right-edge chevron button to open category drawer */}
              <button
                type="button"
                aria-label={`Open ${slot.label} menu`}
                aria-expanded={isDrawerOpen}
                aria-haspopup="menu"
                title={`More ${slot.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenSlot((curr) => (curr === slot.id ? null : slot.id));
                }}
                className={
                  isDrawerOpen
                    ? "absolute right-0 top-1/2 flex h-5 w-2.5 -translate-y-1/2 items-center justify-center rounded-r bg-[#2e3444] text-[8px] text-white opacity-100 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                    : "absolute right-0 top-1/2 flex h-5 w-2.5 -translate-y-1/2 items-center justify-center rounded-r text-[8px] text-[#7a8294] opacity-40 hover:bg-[#222736] hover:text-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                }
              >
                {isDrawerOpen ? "‹" : "›"}
              </button>
            </div>
          );
        })}

        <div className="my-1 h-px w-6 bg-[#232733]" aria-hidden="true" />

        {/* Ruler / Measure */}
        <button
          type="button"
          title="Measure (Ruler — price, %, ticks, bars, duration, volume)"
          aria-label="Measure ruler"
          aria-pressed={activeTool === "ruler"}
          onClick={() => {
            onSelectTool(activeTool === "ruler" ? "cursor" : "ruler");
            setOpenSlot(null);
          }}
          className={
            activeTool === "ruler"
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <DrawingToolIcon kind="ruler" className="h-[17px] w-[17px]" />
        </button>

        {/* Zoom In */}
        <button
          type="button"
          title="Zoom In (drag box on chart · double-click to reset zoom)"
          aria-label="Zoom In"
          aria-pressed={activeTool === "zoom_in"}
          onClick={() => {
            onSelectTool(activeTool === "zoom_in" ? "cursor" : "zoom_in");
            setOpenSlot(null);
          }}
          onDoubleClick={() => {
            onResetZoom?.();
            onSelectTool("cursor");
          }}
          className={
            activeTool === "zoom_in"
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <DrawingToolIcon kind="zoom_in" className="h-[17px] w-[17px]" />
        </button>

        <div className="my-1 h-px w-6 bg-[#232733]" aria-hidden="true" />

        {/* Magnet Snap Toggle (white filled pill when active) */}
        <button
          type="button"
          title={magnetEnabled ? "Magnet Snap ON (OHLC / TPO)" : "Magnet Snap OFF"}
          aria-label="Toggle OHLC and TPO magnet snap"
          aria-pressed={magnetEnabled}
          onClick={onToggleMagnet}
          className={
            magnetEnabled
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#e6e8ee] text-[#0c0d11] shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M6 4.5v6a4 4 0 0 0 8 0v-6" strokeLinecap="round" />
            <path d="M4.8 4.5h2.4M12.8 4.5h2.4M4.8 7.5h2.4M12.8 7.5h2.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* Stay in Drawing Mode */}
        <button
          type="button"
          title={stayInDrawingMode ? "Stay in Drawing Mode ON" : "Stay in Drawing Mode OFF"}
          aria-label="Stay in Drawing Mode"
          aria-pressed={stayInDrawingMode}
          onClick={onToggleStayInDrawingMode}
          className={
            stayInDrawingMode
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 13.5 6.8-6.8 2 2-6.8 6.8H4v-2Z" />
            <rect x="11.5" y="11" width="4.8" height="4.2" rx="0.8" />
            <path d="M12.7 11V9.7a1.2 1.2 0 1 1 2.4 0V11" />
          </svg>
        </button>

        {/* Lock All Drawing Tools */}
        <button
          type="button"
          title={drawingsLocked ? "Unlock All Drawing Tools" : "Lock All Drawing Tools"}
          aria-label="Lock All Drawing Tools"
          aria-pressed={drawingsLocked}
          onClick={onToggleDrawingsLocked}
          className={
            drawingsLocked
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-amber-300 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="9" width="10" height="7" rx="1.3" />
            {drawingsLocked ? (
              <path d="M7.2 9V6.8a2.8 2.8 0 0 1 5.6 0V9" />
            ) : (
              <path d="M7.2 9V6.8a2.8 2.8 0 0 1 5.3-1.2" />
            )}
            <circle cx="10" cy="12.5" r="0.9" fill="currentColor" />
          </svg>
        </button>

        {/* Hide All Drawings */}
        <button
          type="button"
          title={drawingsHidden ? "Show All Drawings" : "Hide All Drawings"}
          aria-label="Hide All Drawings"
          aria-pressed={drawingsHidden}
          onClick={onToggleDrawingsHidden}
          className={
            drawingsHidden
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#2962ff]/15 text-sky-300 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.8 10s2.7-4.5 7.2-4.5S17.2 10 17.2 10s-2.7 4.5-7.2 4.5S2.8 10 2.8 10Z" />
            <circle cx="10" cy="10" r="2" />
            {drawingsHidden && <path d="M4 16 16 4" />}
          </svg>
        </button>

        <div className="my-1 h-px w-6 bg-[#232733]" aria-hidden="true" />

        {/* Clear Drawings */}
        <button
          type="button"
          title={drawingCount > 0 ? `Remove ${drawingCount} drawing(s)` : "No drawings on symbol"}
          aria-label={`Remove drawings (${drawingCount})`}
          disabled={drawingCount === 0 || drawingsLocked}
          onClick={onClearDrawings}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-rose-300 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path
              d="M4.5 6h11M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6.5 6l.7 9.5a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9L13.5 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {drawingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#2962ff]/15 px-1 font-mono text-[9px] text-[#e6e8ee]">
              {drawingCount}
            </span>
          )}
        </button>
      </div>

      {/* Bottom Star: Toggle Floating Favorites Drawing Toolbar */}
      <button
        type="button"
        title={showFloatingBar ? "Hide Favorite Drawing Tools Toolbar" : "Show Favorite Drawing Tools Toolbar"}
        aria-label="Toggle floating favorites drawing toolbar"
        aria-pressed={showFloatingBar}
        onClick={onToggleFloatingBar}
        className={
          showFloatingBar
            ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#e6e8ee] text-[#0c0d11] shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            : "flex h-8 w-8 items-center justify-center rounded-md text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        }
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-[16px] w-[16px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            d="m10 3.2 2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14l-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L10 3.2Z"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Right-side Category Flyout Drawer */}
      {openSlotDef && (
        <div
          role="dialog"
          aria-label={openSlotDef.label}
          className="absolute left-full top-1.5 z-50 ml-1 w-[272px] max-h-[calc(100vh-112px)] overflow-y-auto rounded-lg border border-[#2c3140] bg-[#14161d]/98 py-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.72)] backdrop-blur-md"
        >
          {openSlotDef.id === "icons" ? (
            <div className="px-2.5 py-1.5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#858c9d]">
                ICONS &amp; STAMPS
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {ICON_STAMP_CHOICES.map((glyph) => {
                  const selected = activeTool === "icon_stamp" && activeIconStamp === glyph;
                  return (
                    <button
                      key={glyph}
                      type="button"
                      aria-label={`Select stamp ${glyph}`}
                      aria-pressed={selected}
                      onClick={() => {
                        onSelectIconStamp?.(glyph);
                        handleSelectFromDrawer("icon_stamp", "icons");
                      }}
                      className={
                        selected
                          ? "flex h-10 items-center justify-center rounded-md bg-[#2962ff]/15 text-lg text-white ring-1 ring-sky-400/50 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                          : "flex h-10 items-center justify-center rounded-md bg-[#1a1d26] text-lg text-[#d6dae6] hover:bg-[#252a38] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                      }
                    >
                      {glyph}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            openSlotDef.sections.map((sectionName, sIdx) => {
              const toolsInSection = DRAWING_TOOL_META.filter(
                (t) => t.slot === openSlotDef.id && t.section === sectionName,
              );
              if (toolsInSection.length === 0) return null;
              return (
                <div key={sectionName}>
                  {sIdx > 0 && <div className="my-1.5 h-px bg-[#232733]" />}
                  <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#858c9d]">
                    {sectionName}
                  </div>
                  <div className="flex flex-col">
                    {toolsInSection.map((tool) => {
                      const toolKind = tool.kind as PlacedDrawingKind;
                      const isSelected = activeTool === toolKind;
                      const isFav = favSet.has(toolKind);
                      return (
                        <div
                          key={toolKind}
                          className={
                            isSelected
                              ? "group flex items-center bg-[#232836] pr-1.5"
                              : "group flex items-center pr-1.5 hover:bg-[#1e222e]"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectFromDrawer(toolKind, openSlotDef.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className="shrink-0 text-[#c9ceda]">
                                <DrawingToolIcon kind={toolKind} className="h-[17px] w-[17px]" />
                              </span>
                              <span className="truncate">{tool.label}</span>
                            </span>
                            {tool.shortcut && (
                              <span className="shrink-0 font-mono text-[11px] text-[#858c9d]">
                                {tool.shortcut}
                              </span>
                            )}
                          </button>
                          {onToggleFavoriteTool && (
                            <button
                              type="button"
                              aria-label={
                                isFav
                                  ? `Remove ${tool.label} from favorites`
                                  : `Add ${tool.label} to favorites`
                              }
                              aria-pressed={isFav}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavoriteTool(toolKind);
                              }}
                              className={
                                isFav
                                  ? "flex h-6 w-6 shrink-0 items-center justify-center rounded text-white hover:bg-[#2e3446] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                                  : "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#666d80] opacity-0 hover:bg-[#2a3040] hover:text-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                              }
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className="h-3.5 w-3.5"
                                fill={isFav ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="1.4"
                              >
                                <path
                                  d="m10 3.2 2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14l-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L10 3.2Z"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
}
