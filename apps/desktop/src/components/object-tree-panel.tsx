import { useState } from "react";
import { SettingsCogIcon } from "@allegedly/ui-chrome";
import { getDrawingToolMeta, type DrawingObject } from "../drawings/drawing-engine";
import { DrawingToolIcon } from "./drawing-tool-icons";

export interface ObjectTreeIndicatorItem {
  id: string;
  label: string;
  kind: "volume" | "orderflow" | "study";
  hidden: boolean;
  color?: string;
}

export interface DrawingGroupNode {
  id: string;
  name: string;
  hidden: boolean;
  locked: boolean;
  collapsed: boolean;
}

export interface DataWindowIndicatorValue {
  id: string;
  label: string;
  value: string;
  color?: string;
}

export interface DataWindowSnapshot {
  timeSec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePct: number;
  volume: number;
  lastDayChange: number | null;
  lastDayChangePct: number | null;
  decimals: number;
  indicators: readonly DataWindowIndicatorValue[];
}

export interface ObjectTreePanelProps {
  symbol: string;
  providerTag: string;
  timeframe: string;
  activeSubTab: "tree" | "data";
  onSubTabChange: (tab: "tree" | "data") => void;
  indicators: readonly ObjectTreeIndicatorItem[];
  drawings: readonly DrawingObject[];
  groups: readonly DrawingGroupNode[];
  selectedDrawingId: string | null;
  allDrawingsHidden: boolean;
  dataWindow: DataWindowSnapshot | null;
  onToggleAllDrawingsHidden: () => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onToggleGroupHidden: (groupId: string) => void;
  onToggleGroupLocked: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleIndicatorHidden: (item: ObjectTreeIndicatorItem) => void;
  onOpenIndicatorSettings: (item: ObjectTreeIndicatorItem) => void;
  onRemoveIndicator: (item: ObjectTreeIndicatorItem) => void;
  onSelectDrawing: (id: string) => void;
  onToggleDrawingHidden: (id: string) => void;
  onToggleDrawingLocked: (id: string) => void;
  onOpenDrawingSettings: (id: string) => void;
  onRemoveDrawing: (id: string) => void;
  onAssignDrawingGroup: (drawingId: string, groupId: string | null) => void;
  onReorderDrawing: (drawingId: string, targetId: string) => void;
  onCollapse: () => void;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M2.2 8s2.2-3.5 5.8-3.5S13.8 8 13.8 8s-2.2 3.5-5.8 3.5S2.2 8 2.2 8z" />
        <path d="M3 13 13 3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.2 8s2.2-3.5 5.8-3.5S13.8 8 13.8 8s-2.2 3.5-5.8 3.5S2.2 8 2.2 8z" />
      <circle cx="8" cy="8" r="1.7" />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
      {locked ? (
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      ) : (
        <path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3" />
      )}
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3.5 4.5h9M6 4.5V3.2h4v1.3M5 4.5l.6 8h4.8l.6-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IndicatorWaveIcon({ color }: { color?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth="1.5"
    >
      <path d="M2 10.5c1.6-3.5 3.1-3.5 4.5 0s2.9 3.5 4.5-1.5c.8-2.3 1.8-3 3-3" strokeLinecap="round" />
    </svg>
  );
}

function formatNum(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCompactVol(vol: number): string {
  if (!Number.isFinite(vol)) return "—";
  const abs = Math.abs(vol);
  if (abs >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(vol / 1_000).toFixed(2)}K`;
  return Math.round(vol).toLocaleString("en-US");
}

function formatDataDate(timeSec: number): string {
  const dt = new Date(timeSec * 1000);
  if (Number.isNaN(dt.getTime())) return "—";
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short" });
  const day = dt.getDate();
  const month = dt.toLocaleDateString("en-US", { month: "short" });
  const yr = String(dt.getFullYear()).slice(-2);
  return `${weekday} ${day} ${month} '${yr}`;
}

function formatDataTime(timeSec: number): string {
  const dt = new Date(timeSec * 1000);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDelta(val: number | null, pct: number | null, decimals: number): { text: string; tone: string } {
  if (val === null || pct === null || !Number.isFinite(val) || !Number.isFinite(pct)) {
    return { text: "—", tone: "text-[#868c9b]" };
  }
  const sign = val > 0 ? "+" : val < 0 ? "-" : "";
  const absVal = formatNum(Math.abs(val), decimals);
  const absPct = Math.abs(pct).toFixed(2);
  const tone = val > 0 ? "text-[#26a69a]" : val < 0 ? "text-[#ef5350]" : "text-[#d1d4dc]";
  return { text: `${sign}${absVal} (${sign}${absPct}%)`, tone };
}

export function ObjectTreePanel({
  symbol,
  providerTag,
  timeframe,
  activeSubTab,
  onSubTabChange,
  indicators,
  drawings,
  groups,
  selectedDrawingId,
  allDrawingsHidden,
  dataWindow,
  onToggleAllDrawingsHidden,
  onCreateGroup,
  onRenameGroup,
  onToggleGroupCollapsed,
  onToggleGroupHidden,
  onToggleGroupLocked,
  onDeleteGroup,
  onToggleIndicatorHidden,
  onOpenIndicatorSettings,
  onRemoveIndicator,
  onSelectDrawing,
  onToggleDrawingHidden,
  onToggleDrawingLocked,
  onOpenDrawingSettings,
  onRemoveDrawing,
  onAssignDrawingGroup,
  onReorderDrawing,
  onCollapse,
}: ObjectTreePanelProps) {
  const [paneExpanded, setPaneExpanded] = useState(true);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [draggedDrawingId, setDraggedDrawingId] = useState<string | null>(null);

  const ungroupedDrawings = drawings.filter(
    (d) => !d.groupId || !groups.some((g) => g.id === d.groupId),
  );

  const renderDrawingRow = (d: DrawingObject, indented = false) => {
    const meta = getDrawingToolMeta(d.kind);
    const label = d.label?.trim() || meta.label;
    const isSelected = d.id === selectedDrawingId;
    const isHidden = Boolean(d.hidden) || allDrawingsHidden;

    return (
      <div
        key={d.id}
        draggable
        onDragStart={() => setDraggedDrawingId(d.id)}
        onDragEnd={() => setDraggedDrawingId(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedDrawingId && draggedDrawingId !== d.id) {
            onReorderDrawing(draggedDrawingId, d.id);
          }
          setDraggedDrawingId(null);
        }}
        onClick={() => onSelectDrawing(d.id)}
        onDoubleClick={() => onOpenDrawingSettings(d.id)}
        className={`group flex h-9 cursor-pointer items-center justify-between gap-1.5 rounded-md pr-1.5 text-[12px] transition-colors ${
          indented ? "pl-8" : "pl-4"
        } ${
          isSelected
            ? "bg-[var(--app-surface-bg,#2a2e39)] text-white"
            : "text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <DrawingToolIcon kind={d.kind} className="h-3.5 w-3.5 shrink-0 text-[#9598a1]" />
          <span className={`truncate ${isHidden ? "text-[#787b86]" : ""}`}>
            {label}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {groups.length > 0 && (
            <button
              type="button"
              title={d.groupId ? "Remove from folder" : `Move to ${groups[0].name}`}
              aria-label={d.groupId ? `Ungroup ${label}` : `Move ${label} to folder`}
              onClick={(e) => {
                e.stopPropagation();
                onAssignDrawingGroup(d.id, d.groupId ? null : groups[0].id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] opacity-0 hover:bg-white/[0.06] hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M2.5 4.5h4l1.3 1.4H13.5v6.6h-11V4.5z" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            title={d.locked ? "Unlock drawing" : "Lock drawing"}
            aria-label={d.locked ? `Unlock ${label}` : `Lock ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDrawingLocked(d.id);
            }}
            className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06] hover:text-white ${
              d.locked
                ? "text-amber-300 opacity-100"
                : "text-[#787b86] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <LockIcon locked={Boolean(d.locked)} />
          </button>
          <button
            type="button"
            title={isHidden ? "Show drawing" : "Hide drawing"}
            aria-label={isHidden ? `Show ${label}` : `Hide ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDrawingHidden(d.id);
            }}
            className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06] hover:text-white ${
              isHidden
                ? "text-[#9598a1] opacity-100"
                : "text-[#787b86] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <EyeIcon hidden={isHidden} />
          </button>
          <button
            type="button"
            title="Drawing settings"
            aria-label={`Settings for ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDrawingSettings(d.id);
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] opacity-0 hover:bg-white/[0.06] hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
          >
            <SettingsCogIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Remove drawing"
            aria-label={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveDrawing(d.id);
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] opacity-0 hover:bg-white/[0.06] hover:text-rose-300 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Object tree and data window"
      className="flex h-full flex-col bg-[var(--app-chrome-bg,#131722)] text-[#d1d4dc]"
    >
      {/* Top Tabs: Object tree | Data window */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        <div role="tablist" aria-label="Object tree views" className="flex h-9 min-w-0 flex-1 items-center rounded-lg bg-[var(--app-surface-bg,#1e222d)] p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "tree"}
            onClick={() => onSubTabChange("tree")}
            className={`relative flex h-full flex-1 items-center justify-center rounded-md text-[13px] font-medium transition-colors ${
              activeSubTab === "tree" ? "bg-[var(--app-panel-bg,#363a45)] text-[#f0f3fa] shadow-sm" : "text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            Object tree
            {activeSubTab === "tree" && (
              <span className="sr-only" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "data"}
            onClick={() => onSubTabChange("data")}
            className={`relative flex h-full flex-1 items-center justify-center rounded-md text-[13px] font-medium transition-colors ${
              activeSubTab === "data" ? "bg-[var(--app-panel-bg,#363a45)] text-[#f0f3fa] shadow-sm" : "text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            Data window
            {activeSubTab === "data" && (
              <span className="sr-only" />
            )}
          </button>
        </div>

        <button
          type="button"
          aria-label="Close object tree panel"
          onClick={onCollapse}
          className="flex h-7 w-7 items-center justify-center rounded text-[#787b86] hover:bg-white/[0.06] hover:text-[#f0f3fa]"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {activeSubTab === "tree" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Object Tree Action Bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--app-border,#2a2e39)] px-3 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Create a group of drawings"
                aria-label="Create a group of drawings"
                onClick={onCreateGroup}
                className="flex h-7 w-7 items-center justify-center rounded text-[#9598a1] hover:bg-white/[0.06] hover:text-white"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M2 4.5h4.2l1.3 1.4H14v6.6H2V4.5z" strokeLinejoin="round" />
                  <path d="M8 7.5v3.2M6.4 9.1h3.2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                title={allDrawingsHidden ? "Show all drawings" : "Hide all drawings"}
                aria-label={allDrawingsHidden ? "Show all drawings" : "Hide all drawings"}
                onClick={onToggleAllDrawingsHidden}
                className={`flex h-7 w-7 items-center justify-center rounded hover:bg-white/[0.06] hover:text-white ${
                  allDrawingsHidden ? "text-[#e4e4e7]" : "text-[#9598a1]"
                }`}
              >
                <EyeIcon hidden={allDrawingsHidden} />
              </button>
            </div>
            <span className="font-mono text-[10px] text-[#787b86]">
              {indicators.length + drawings.length} objects
            </span>
          </div>

          {/* Tree Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {/* Root Chart Series Node */}
            <button
              type="button"
              onClick={() => setPaneExpanded((v) => !v)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] font-semibold text-[#f0f3fa] hover:bg-white/[0.06]"
            >
              <span aria-hidden="true" className="w-3 text-[10px] text-[#868c9b]">
                {paneExpanded ? "▾" : "▸"}
              </span>
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#9598a1]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4.5 3v10M11.5 2.5v11" strokeLinecap="round" />
                <rect x="3.2" y="5.5" width="2.6" height="4.5" fill="currentColor" />
                <rect x="10.2" y="4.5" width="2.6" height="5.5" fill="currentColor" />
              </svg>
              <span className="truncate">
                {symbol} · {providerTag}, {timeframe}
              </span>
            </button>

            {paneExpanded && (
              <div className="mt-0.5 space-y-0.5">
                {/* Indicators */}
                {indicators.map((item) => (
                  <div
                    key={item.id}
                    onDoubleClick={() => onOpenIndicatorSettings(item)}
                    className="group flex h-9 items-center justify-between gap-1.5 rounded-md pl-4 pr-1.5 text-[12px] text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <IndicatorWaveIcon color={item.color} />
                      <span className={`truncate ${item.hidden ? "text-[#787b86]" : ""}`}>
                        {item.label}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title={item.hidden ? "Show indicator" : "Hide indicator"}
                        aria-label={item.hidden ? `Show ${item.label}` : `Hide ${item.label}`}
                        onClick={() => onToggleIndicatorHidden(item)}
                        className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06] hover:text-white ${
                          item.hidden
                            ? "text-[#9598a1] opacity-100"
                            : "text-[#787b86] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                      >
                        <EyeIcon hidden={item.hidden} />
                      </button>
                      <button
                        type="button"
                        title="Indicator settings"
                        aria-label={`Settings for ${item.label}`}
                        onClick={() => onOpenIndicatorSettings(item)}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] opacity-0 hover:bg-white/[0.06] hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <SettingsCogIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove indicator"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => onRemoveIndicator(item)}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] opacity-0 hover:bg-white/[0.06] hover:text-rose-300 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Drawing Groups (Folders) */}
                {groups.map((grp) => {
                  const members = drawings.filter((d) => d.groupId === grp.id);
                  return (
                    <div
                      key={grp.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedDrawingId) {
                          onAssignDrawingGroup(draggedDrawingId, grp.id);
                        }
                        setDraggedDrawingId(null);
                      }}
                    >
                      <div className="group flex h-9 items-center justify-between gap-1.5 rounded-md pl-3 pr-1.5 text-[12px] text-[#d1d4dc] hover:bg-white/[0.06]">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={grp.collapsed ? `Expand ${grp.name}` : `Collapse ${grp.name}`}
                            onClick={() => onToggleGroupCollapsed(grp.id)}
                            className="w-3 text-[10px] text-[#868c9b]"
                          >
                            {grp.collapsed ? "▸" : "▾"}
                          </button>
                          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#9598a1]" fill="none" stroke="currentColor" strokeWidth="1.4">
                            <path d="M2 4.5h4.2l1.3 1.4H14v6.6H2V4.5z" strokeLinejoin="round" />
                          </svg>
                          {editingGroupId === grp.id ? (
                            <input
                              aria-label="Folder name"
                              autoFocus
                              value={editingGroupName}
                              onChange={(e) => setEditingGroupName(e.target.value)}
                              onBlur={() => {
                                if (editingGroupName.trim()) onRenameGroup(grp.id, editingGroupName.trim());
                                setEditingGroupId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editingGroupName.trim()) onRenameGroup(grp.id, editingGroupName.trim());
                                  setEditingGroupId(null);
                                } else if (e.key === "Escape") {
                                  setEditingGroupId(null);
                                }
                              }}
                              className="h-6 min-w-0 flex-1 rounded border border-white/30 bg-[#0d0f14] px-1.5 text-[12px] text-white outline-none"
                            />
                          ) : (
                            <span
                              onDoubleClick={() => {
                                setEditingGroupId(grp.id);
                                setEditingGroupName(grp.name);
                              }}
                              className={`truncate font-medium ${grp.hidden ? "text-[#787b86]" : ""}`}
                            >
                              {grp.name} ({members.length})
                            </span>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            aria-label={grp.locked ? `Unlock ${grp.name}` : `Lock ${grp.name}`}
                            onClick={() => onToggleGroupLocked(grp.id)}
                            className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06] hover:text-white ${
                              grp.locked
                                ? "text-amber-300 opacity-100"
                                : "text-[#787b86] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            }`}
                          >
                            <LockIcon locked={grp.locked} />
                          </button>
                          <button
                            type="button"
                            aria-label={grp.hidden ? `Show ${grp.name}` : `Hide ${grp.name}`}
                            onClick={() => onToggleGroupHidden(grp.id)}
                            className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06] hover:text-white ${
                              grp.hidden
                                ? "text-[#9598a1] opacity-100"
                                : "text-[#787b86] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            }`}
                          >
                            <EyeIcon hidden={grp.hidden} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete folder ${grp.name}`}
                            onClick={() => onDeleteGroup(grp.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] opacity-0 hover:bg-white/[0.06] hover:text-rose-300 group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                      {!grp.collapsed && members.map((m) => renderDrawingRow(m, true))}
                    </div>
                  );
                })}

                {/* Ungrouped Drawings (top-to-bottom reverse z-order like TradingView) */}
                {[...ungroupedDrawings].reverse().map((d) => renderDrawingRow(d, false))}

                {indicators.length === 0 && drawings.length === 0 && (
                  <div className="px-4 py-6 text-center text-[11px] text-[#787b86]">
                    No active indicators or drawings on {symbol}.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Data Window Tab */
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[12px]">
          {!dataWindow ? (
            <div className="py-8 text-center text-[#787b86]">
              Hover over the chart to inspect candle and indicator values.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Date & Time */}
              <div className="space-y-2.5 border-b border-[var(--app-border,#2a2e39)] pb-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#868c9b]">Date</span>
                  <span className="font-mono text-[#e6e8ee]">{formatDataDate(dataWindow.timeSec)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#868c9b]">Time</span>
                  <span className="font-mono text-[#e6e8ee]">{formatDataTime(dataWindow.timeSec)}</span>
                </div>
              </div>

              {/* Symbol OHLCV */}
              <div className="space-y-2.5 border-b border-[var(--app-border,#2a2e39)] pb-3">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#f0f3fa]">
                  <span>
                    {symbol} · {timeframe} · {providerTag}
                  </span>
                </div>

                {(
                  [
                    ["Open", formatNum(dataWindow.open, dataWindow.decimals)],
                    ["High", formatNum(dataWindow.high, dataWindow.decimals)],
                    ["Low", formatNum(dataWindow.low, dataWindow.decimals)],
                    ["Close", formatNum(dataWindow.close, dataWindow.decimals)],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[#868c9b]">{label}</span>
                    <span className="font-mono tabular-nums text-[#e6e8ee]">{val}</span>
                  </div>
                ))}

                {(() => {
                  const ch = formatDelta(dataWindow.change, dataWindow.changePct, dataWindow.decimals);
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-[#868c9b]">Change</span>
                      <span className={`font-mono tabular-nums ${ch.tone}`}>{ch.text}</span>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <span className="text-[#868c9b]">Vol</span>
                  <span className="font-mono tabular-nums text-[#e6e8ee]">
                    {formatCompactVol(dataWindow.volume)}
                  </span>
                </div>

                {(() => {
                  const ldc = formatDelta(
                    dataWindow.lastDayChange,
                    dataWindow.lastDayChangePct,
                    dataWindow.decimals,
                  );
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-[#868c9b]">Last day change</span>
                      <span className={`font-mono tabular-nums ${ldc.tone}`}>{ldc.text}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Active Indicator Readouts */}
              {dataWindow.indicators.length > 0 && (
                <div className="space-y-2.5">
                  {dataWindow.indicators.map((ind) => (
                    <div key={ind.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-[#d1d4dc]">
                          <IndicatorWaveIcon color={ind.color} />
                          <span className="truncate">{ind.label}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-[#e6e8ee]">
                          {ind.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
