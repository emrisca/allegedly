import { useEffect, useMemo, useState } from "react";
import type { BuiltinStudyKind, StudyRunResponse } from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";

export interface IndicatorLayerState {
  volume: boolean;
  vrvp: boolean;
  footprint: boolean;
  tpo: boolean;
  marketStructure?: boolean;
}

export interface SavedLuauScript {
  id: string;
  name: string;
  script: string;
  updatedAt: number;
}

export interface IndicatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeStudies: readonly StudyRunResponse[];
  studyError?: string | null;
  layerState: IndicatorLayerState;
  onRunBuiltinStudy: (kind: BuiltinStudyKind, period: number) => void;
  onRemoveStudy: (id: string) => void;
  onRunLuauStudy: (script: string, id?: string, name?: string) => void;
  onClearStudies: () => void;
  onToggleLayer: (layer: keyof IndicatorLayerState) => void;
}

type IndicatorCategory = "favorites" | "my_scripts" | "technicals" | "fundamentals";

interface CatalogEntry {
  id: string;
  name: string;
  keywords: string;
  source: "Built-in" | "Orderflow" | "Chart Layer" | "Luau Script";
  typeLabel: string;
  color: string;
  action:
    | { kind: "builtin"; builtin: BuiltinStudyKind; period: number }
    | { kind: "layer"; layer: keyof IndicatorLayerState }
    | { kind: "luau"; script: string };
}

const INDICATOR_FAVORITES_KEY = "allegedly.indicatorFavorites.v1";
const SAVED_LUAU_SCRIPTS_KEY = "allegedly.luauScripts.v1";

export const DEFAULT_INDICATOR_FAVORITES: readonly string[] = [
  "wilder_rsi-14",
  "layer-vrvp",
  "layer-market-structure",
  "layer-volume",
  "vwap-1",
  "sma-20",
  "ema-9",
];

const DEFAULT_LUAU_SCRIPTS: readonly SavedLuauScript[] = [
  {
    id: "luau-midpoint",
    name: "Midpoint Equilibrium (HL2)",
    script:
      "local out = {}; for i = 1, #close do out[i] = i == 1 and close[i] or (close[i] + close[i-1]) / 2 end; return out",
    updatedAt: 1,
  },
  {
    id: "luau-smooth3",
    name: "Weighted 3-Bar Smooth",
    script:
      "local out = {}; for i = 1, #close do out[i] = i < 3 and close[i] or (close[i] * 0.5 + close[i-1] * 0.3 + close[i-2] * 0.2) end; return out",
    updatedAt: 2,
  },
];

const BUILTIN_CATALOG: readonly CatalogEntry[] = [
  {
    id: "wilder_rsi-14",
    name: "Relative strength index (RSI 14)",
    keywords: "rsi wilder momentum oscillator",
    source: "Built-in",
    typeLabel: "Oscillator",
    color: "#34d399",
    action: { kind: "builtin", builtin: "wilder_rsi", period: 14 },
  },
  {
    id: "layer-vrvp",
    name: "Session volume profile",
    keywords: "vrvp vp profile histogram poc vah val orderflow",
    source: "Orderflow",
    typeLabel: "VRVP",
    color: "#38bdf8",
    action: { kind: "layer", layer: "vrvp" },
  },
  {
    id: "layer-volume",
    name: "Volume",
    keywords: "vol histogram bars",
    source: "Chart Layer",
    typeLabel: "Histogram",
    color: "#94a3b8",
    action: { kind: "layer", layer: "volume" },
  },
  {
    id: "vwap-1",
    name: "Volume-weighted average price",
    keywords: "vwap session anchor",
    source: "Built-in",
    typeLabel: "Overlay",
    color: "#a78bfa",
    action: { kind: "builtin", builtin: "vwap", period: 1 },
  },
  {
    id: "sma-20",
    name: "Simple moving average (20)",
    keywords: "sma ma average trend",
    source: "Built-in",
    typeLabel: "Overlay",
    color: "#38bdf8",
    action: { kind: "builtin", builtin: "sma", period: 20 },
  },
  {
    id: "ema-9",
    name: "Exponential moving average (9)",
    keywords: "ema fast ma trend",
    source: "Built-in",
    typeLabel: "Overlay",
    color: "#f59e0b",
    action: { kind: "builtin", builtin: "ema", period: 9 },
  },
  {
    id: "ema-20",
    name: "Exponential moving average (20)",
    keywords: "ema ma trend",
    source: "Built-in",
    typeLabel: "Overlay",
    color: "#f59e0b",
    action: { kind: "builtin", builtin: "ema", period: 20 },
  },
  {
    id: "ema-50",
    name: "Exponential moving average (50)",
    keywords: "ema slow ma trend",
    source: "Built-in",
    typeLabel: "Overlay",
    color: "#f59e0b",
    action: { kind: "builtin", builtin: "ema", period: 50 },
  },
  {
    id: "cvd-1",
    name: "Cumulative volume delta (CVD)",
    keywords: "cvd delta orderflow volume buy sell",
    source: "Orderflow",
    typeLabel: "Oscillator",
    color: "#22d3ee",
    action: { kind: "builtin", builtin: "cvd", period: 1 },
  },
  {
    id: "footprint_delta-1",
    name: "Footprint delta",
    keywords: "footprint delta imbalance orderflow",
    source: "Orderflow",
    typeLabel: "Oscillator",
    color: "#e879f9",
    action: { kind: "builtin", builtin: "footprint_delta", period: 1 },
  },
  {
    id: "layer-footprint",
    name: "Footprint (Bid × Ask)",
    keywords: "footprint bid ask cluster bars orderflow",
    source: "Orderflow",
    typeLabel: "Overlay",
    color: "#34d399",
    action: { kind: "layer", layer: "footprint" },
  },
  {
    id: "layer-tpo",
    name: "TPO market profile (128-bit)",
    keywords: "tpo market profile letter auction",
    source: "Orderflow",
    typeLabel: "Overlay",
    color: "#f59e0b",
    action: { kind: "layer", layer: "tpo" },
  },
  {
    id: "layer-market-structure",
    name: "Market Structure (HH/HL/LH/LL & BOS)",
    keywords: "market structure hh hl lh ll bos break of structure swing trend icc",
    source: "Chart Layer",
    typeLabel: "Structure",
    color: "#089981",
    action: { kind: "layer", layer: "marketStructure" },
  },
];

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_INDICATOR_FAVORITES];
  try {
    const raw = window.localStorage.getItem(INDICATOR_FAVORITES_KEY);
    if (!raw) return [...DEFAULT_INDICATOR_FAVORITES];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [...DEFAULT_INDICATOR_FAVORITES];
  } catch {
    return [...DEFAULT_INDICATOR_FAVORITES];
  }
}

function loadSavedScripts(): SavedLuauScript[] {
  if (typeof window === "undefined") return [...DEFAULT_LUAU_SCRIPTS];
  try {
    const raw = window.localStorage.getItem(SAVED_LUAU_SCRIPTS_KEY);
    if (!raw) return [...DEFAULT_LUAU_SCRIPTS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_LUAU_SCRIPTS];
    return parsed.filter(
      (s): s is SavedLuauScript =>
        Boolean(s) &&
        typeof s === "object" &&
        typeof (s as SavedLuauScript).id === "string" &&
        typeof (s as SavedLuauScript).name === "string" &&
        typeof (s as SavedLuauScript).script === "string",
    );
  } catch {
    return [...DEFAULT_LUAU_SCRIPTS];
  }
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.35"
    >
      <path
        d="M8 1.6l1.95 3.95 4.35.63-3.15 3.07.74 4.34L8 11.54l-3.89 2.05.74-4.34L1.7 6.18l4.35-.63L8 1.6Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IndicatorsDialog({
  open,
  onOpenChange,
  activeStudies,
  studyError = null,
  layerState,
  onRunBuiltinStudy,
  onRemoveStudy,
  onRunLuauStudy,
  onClearStudies,
  onToggleLayer,
}: IndicatorsDialogProps) {
  const [activeTab, setActiveTab] = useState<IndicatorCategory>("favorites");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [savedScripts, setSavedScripts] = useState<SavedLuauScript[]>(() => loadSavedScripts());

  // Inline Luau editor state under My scripts
  const [editingId, setEditingId] = useState<string>("luau-custom");
  const [draftName, setDraftName] = useState<string>("Custom Luau Study");
  const [draftCode, setDraftCode] = useState<string>(DEFAULT_LUAU_SCRIPTS[0].script);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(INDICATOR_FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore storage failure in private browsing
    }
  }, [favorites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SAVED_LUAU_SCRIPTS_KEY, JSON.stringify(savedScripts));
    } catch {
      // ignore storage failure
    }
  }, [savedScripts]);

  const activeStudyIds = useMemo(() => new Set(activeStudies.map((s) => s.id)), [activeStudies]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const isEntryActive = (entry: CatalogEntry): boolean => {
    if (entry.action.kind === "layer") return Boolean(layerState[entry.action.layer]);
    return activeStudyIds.has(entry.id);
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleActivateEntry = (entry: CatalogEntry) => {
    if (entry.action.kind === "layer") {
      onToggleLayer(entry.action.layer);
      return;
    }
    if (activeStudyIds.has(entry.id)) {
      onRemoveStudy(entry.id);
      return;
    }
    if (entry.action.kind === "builtin") {
      onRunBuiltinStudy(entry.action.builtin, entry.action.period);
    } else {
      onRunLuauStudy(entry.action.script, entry.id, entry.name);
    }
  };

  const scriptCatalogEntries = useMemo<CatalogEntry[]>(
    () =>
      savedScripts.map((s) => ({
        id: s.id,
        name: s.name,
        keywords: `luau custom script ${s.name}`,
        source: "Luau Script",
        typeLabel: "Luau",
        color: "#fb7185",
        action: { kind: "luau", script: s.script },
      })),
    [savedScripts],
  );

  const allEntries = useMemo<CatalogEntry[]>(
    () => [...BUILTIN_CATALOG, ...scriptCatalogEntries],
    [scriptCatalogEntries],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const displayedEntries = useMemo(() => {
    if (normalizedQuery.length > 0) {
      return allEntries
        .filter(
          (e) =>
            e.name.toLowerCase().includes(normalizedQuery) ||
            e.keywords.toLowerCase().includes(normalizedQuery) ||
            e.source.toLowerCase().includes(normalizedQuery),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (activeTab === "favorites") {
      return allEntries
        .filter((e) => favoriteSet.has(e.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return BUILTIN_CATALOG;
  }, [activeTab, allEntries, favoriteSet, normalizedQuery]);

  const activeLayerCount =
    Number(layerState.volume) +
    Number(layerState.vrvp) +
    Number(layerState.footprint) +
    Number(layerState.tpo) +
    Number(Boolean(layerState.marketStructure));
  const totalActiveCount = activeStudies.length + activeLayerCount;

  const handleSaveLuauScript = (runAfterSave: boolean) => {
    const cleanName = draftName.trim() || "Custom Luau Study";
    const id =
      editingId && editingId !== "luau-custom"
        ? editingId
        : `luau-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || Date.now()}`;
    const nextItem: SavedLuauScript = {
      id,
      name: cleanName,
      script: draftCode,
      updatedAt: Date.now(),
    };
    setSavedScripts((prev) => {
      const exists = prev.some((x) => x.id === id);
      return exists ? prev.map((x) => (x.id === id ? nextItem : x)) : [nextItem, ...prev];
    });
    setEditingId(id);
    if (runAfterSave) {
      onRunLuauStudy(draftCode, id, cleanName);
    }
  };

  const handleDeleteSavedScript = (id: string) => {
    setSavedScripts((prev) => prev.filter((s) => s.id !== id));
    setFavorites((prev) => prev.filter((fid) => fid !== id));
    if (activeStudyIds.has(id)) onRemoveStudy(id);
  };

  const sidebarTabCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#b8becd] transition-colors hover:bg-[#1e222d] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff] data-selected:bg-[#2b2f3a] data-selected:font-medium data-selected:text-[#f4f6fa]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />

      <DialogContent className="fixed left-1/2 top-1/2 z-50 flex h-[min(580px,84vh)] w-[min(860px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#2c3140] bg-[#16181f] text-[#e6e8ee] shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#23262f] px-5">
          <div>
            <DialogTitle className="text-[17px] font-semibold tracking-tight text-[#f1f3f8]">
              Indicators, metrics, and strategies
            </DialogTitle>
            <DialogDescription className="sr-only">
              Browse favorite indicators, saved sandboxed Luau scripts, built-in technicals, and
              session microstructure metrics.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close indicators dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa1b2] hover:bg-[#23262f] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" strokeLinecap="round" />
            </svg>
          </DialogClose>
        </div>

        {/* Full-width Search Bar */}
        <div className="shrink-0 border-b border-[#23262f] px-5 py-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-[#2c3140] bg-[#131722] px-3 py-1.5 focus-within:border-[#4b556b]">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-4 w-4 shrink-0 text-[#7d8496]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3.2 3.2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                setQuery(next);
                if (next.trim().length > 0 && activeTab === "fundamentals") {
                  setActiveTab("technicals");
                }
              }}
              placeholder="Search"
              aria-label="Search indicators, metrics, and strategies"
              autoFocus
              className="w-full bg-transparent text-[13px] text-[#e6e8ee] placeholder-[#6f7687] outline-none"
            />
            {query.length > 0 && (
              <button
                type="button"
                aria-label="Clear indicator search"
                onClick={() => setQuery("")}
                className="rounded px-1 text-xs text-[#7d8496] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Two-column Body */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as IndicatorCategory)}
          className="flex min-h-0 flex-1"
        >
          {/* Left Category Rail */}
          <TabsList
            aria-label="Indicator categories"
            className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[#23262f] p-2.5"
          >
            <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#787e8d]">
              Personal
            </div>
            <TabsTab value="favorites" className={sidebarTabCls}>
              <StarIcon filled={false} />
              <span>Favorites</span>
            </TabsTab>
            <TabsTab value="my_scripts" className={sidebarTabCls}>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.35"
              >
                <circle cx="8" cy="5.2" r="2.5" />
                <path d="M3.2 13.4c.7-2.2 2.4-3.4 4.8-3.4s4.1 1.2 4.8 3.4" strokeLinecap="round" />
              </svg>
              <span>My scripts</span>
            </TabsTab>

            <div className="px-2.5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-[#787e8d]">
              Built-in
            </div>
            <TabsTab value="technicals" className={sidebarTabCls}>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.35"
              >
                <path d="M2 10.5 5.4 7.2l2.8 2.4 5-4.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13.5v-1M6.3 13.5v-2.4M9.7 13.5v-1.8M13 13.5v-3.8" strokeLinecap="round" />
              </svg>
              <span>Technicals</span>
            </TabsTab>
            <TabsTab value="fundamentals" className={sidebarTabCls}>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.35"
              >
                <rect x="2.5" y="7.5" width="2.4" height="5.5" rx="0.5" />
                <rect x="6.8" y="4.5" width="2.4" height="8.5" rx="0.5" />
                <rect x="11.1" y="2.8" width="2.4" height="10.2" rx="0.5" />
              </svg>
              <span>Fundamentals</span>
            </TabsTab>
          </TabsList>

          {/* Right Table / Content Panel */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {studyError && (
              <div
                role="alert"
                className="mx-5 mt-3 rounded-lg border border-rose-500/45 bg-rose-950/60 px-3 py-2 font-mono text-[11px] text-rose-200"
              >
                {studyError}
              </div>
            )}

            {(["favorites", "technicals"] as const).map((tabKey) => (
              <TabsPanel key={tabKey} value={tabKey} className="flex min-h-0 flex-1 flex-col">
                <div className="grid grid-cols-[1fr_110px_100px] items-center border-b border-[#23262f] px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#787e8d]">
                  <span>
                    Name{" "}
                    {normalizedQuery.length > 0 && (
                      <span className="ml-1.5 font-normal lowercase text-[#9aa1b2]">
                        (all categories)
                      </span>
                    )}
                  </span>
                  <span>Source</span>
                  <span className="text-right">Type</span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {displayedEntries.length === 0 ? (
                    <div className="px-5 py-10 text-center text-[13px] text-[#7d8496]">
                      {normalizedQuery.length > 0
                        ? `No indicators matching "${query.trim()}".`
                        : "No favorite indicators yet. Star items under Technicals or My scripts to pin them here."}
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#1d2029]/60">
                      {displayedEntries.map((entry) => {
                        const isFav = favoriteSet.has(entry.id);
                        const active = isEntryActive(entry);
                        return (
                          <li
                            key={entry.id}
                            className="group grid grid-cols-[1fr_110px_100px] items-center px-5 py-2 text-[13px] transition-colors hover:bg-[#1e222d]"
                          >
                            <div className="flex min-w-0 items-center gap-2.5 pr-2">
                              <button
                                type="button"
                                aria-label={
                                  isFav
                                    ? `Remove ${entry.name} from favorites`
                                    : `Add ${entry.name} to favorites`
                                }
                                aria-pressed={isFav}
                                onClick={() => toggleFavorite(entry.id)}
                                className={
                                  isFav
                                    ? "shrink-0 rounded p-0.5 text-[#f1f3f8] hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                                    : "shrink-0 rounded p-0.5 text-[#5c6374] opacity-75 hover:text-[#e6e8ee] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                                }
                              >
                                <StarIcon filled={isFav} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleActivateEntry(entry)}
                                className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                              >
                                <span
                                  aria-hidden="true"
                                  style={{ backgroundColor: entry.color }}
                                  className="h-2 w-2 shrink-0 rounded-full"
                                />
                                <span
                                  className={
                                    active
                                      ? "truncate font-medium text-white"
                                      : "truncate text-[#d4d8e2] group-hover:text-white"
                                  }
                                >
                                  {entry.name}
                                </span>
                              </button>
                            </div>

                            <span className="truncate text-[12px] text-[#8b92a3]">
                              {entry.source}
                            </span>

                            <div className="flex justify-end">
                              {active ? (
                                <button
                                  type="button"
                                  onClick={() => handleActivateEntry(entry)}
                                  className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300 ring-1 ring-sky-500/40 hover:bg-rose-500/20 hover:text-rose-200 hover:ring-rose-500/40 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                                >
                                  Active
                                </button>
                              ) : (
                                <span className="font-mono text-[11px] text-[#787e8d]">
                                  {entry.typeLabel}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </TabsPanel>
            ))}

            {/* My Scripts (Sandboxed Luau Study Library & Editor) */}
            <TabsPanel value="my_scripts" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="grid grid-cols-[1fr_110px_130px] items-center border-b border-[#23262f] px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#787e8d]">
                <span>Saved Luau Scripts</span>
                <span>Runtime</span>
                <span className="text-right">Actions</span>
              </div>

              <ul className="divide-y divide-[#1d2029]/60 border-b border-[#23262f]">
                {savedScripts
                  .filter(
                    (s) =>
                      normalizedQuery.length === 0 ||
                      s.name.toLowerCase().includes(normalizedQuery),
                  )
                  .map((s) => {
                    const isFav = favoriteSet.has(s.id);
                    const active = activeStudyIds.has(s.id);
                    return (
                      <li
                        key={s.id}
                        className="grid grid-cols-[1fr_110px_130px] items-center px-5 py-2 text-[13px] hover:bg-[#1e222d]"
                      >
                        <div className="flex min-w-0 items-center gap-2.5 pr-2">
                          <button
                            type="button"
                            aria-label={
                              isFav
                                ? `Remove ${s.name} from favorites`
                                : `Add ${s.name} to favorites`
                            }
                            aria-pressed={isFav}
                            onClick={() => toggleFavorite(s.id)}
                            className={
                              isFav
                                ? "shrink-0 rounded p-0.5 text-[#f1f3f8] hover:text-amber-300"
                                : "shrink-0 rounded p-0.5 text-[#5c6374] hover:text-[#e6e8ee]"
                            }
                          >
                            <StarIcon filled={isFav} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              active
                                ? onRemoveStudy(s.id)
                                : onRunLuauStudy(s.script, s.id, s.name)
                            }
                            className="truncate text-left text-[#d4d8e2] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                          >
                            {s.name}
                          </button>
                        </div>

                        <span className="font-mono text-[11px] text-[#8b92a3]">Luau (2 MiB)</span>

                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(s.id);
                              setDraftName(s.name);
                              setDraftCode(s.script);
                            }}
                            className="rounded border border-[#2c3140] px-2 py-0.5 text-[11px] text-[#b8becd] hover:bg-[#232733] hover:text-white"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              active
                                ? onRemoveStudy(s.id)
                                : onRunLuauStudy(s.script, s.id, s.name)
                            }
                            className={
                              active
                                ? "rounded bg-sky-500/20 px-2 py-0.5 font-mono text-[11px] text-sky-300 ring-1 ring-sky-500/40 hover:bg-rose-500/20 hover:text-rose-200"
                                : "rounded bg-[#2b2f3a] px-2 py-0.5 text-[11px] text-[#e6e8ee] hover:bg-[#363b49]"
                            }
                          >
                            {active ? "Active" : "Apply"}
                          </button>
                          {savedScripts.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Delete ${s.name}`}
                              onClick={() => handleDeleteSavedScript(s.id)}
                              className="rounded px-1 text-xs text-[#6f7687] hover:text-rose-300"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>

              {/* Custom Script Editor */}
              <div className="space-y-2.5 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8c93a4]">
                    Sandboxed Luau Editor (No os/io · Deterministic)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId("luau-custom");
                      setDraftName("New Luau Study");
                      setDraftCode(DEFAULT_LUAU_SCRIPTS[0].script);
                    }}
                    className="text-[11px] text-sky-300 hover:text-sky-200"
                  >
                    + New blank draft
                  </button>
                </div>

                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  aria-label="Luau script name"
                  placeholder="Script name"
                  className="h-8 w-full rounded-md border border-[#2c3140] bg-[#131722] px-3 text-xs text-[#e6e8ee] outline-none focus:border-sky-500"
                />

                <textarea
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  aria-label="Luau study code"
                  rows={4}
                  className="w-full rounded-md border border-[#2c3140] bg-[#131722] p-2.5 font-mono text-[11px] text-[#e6e8ee] outline-none focus:border-sky-500"
                />

                <div className="flex items-center justify-end gap-2">
                  <Button
                    onClick={() => handleSaveLuauScript(false)}
                    className="rounded-md border border-[#2c3140] bg-[#1a1d26] px-3 py-1.5 text-xs font-medium text-[#d4d8e2] hover:bg-[#232733] hover:text-white"
                  >
                    Save Script
                  </Button>
                  <Button
                    onClick={() => handleSaveLuauScript(true)}
                    className="rounded-md bg-[#f1f3f8] px-3 py-1.5 text-xs font-semibold text-[#0c0d11] hover:bg-white"
                  >
                    Save &amp; Add to Chart
                  </Button>
                </div>
              </div>
            </TabsPanel>

            {/* Fundamentals (Honest Local / Microstructure Notice) */}
            <TabsPanel value="fundamentals" className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="rounded-lg border border-[#262a36] bg-[#111319] p-4">
                <div className="text-[13px] font-semibold text-[#f1f3f8]">
                  Local Paper-Sim Microstructure &amp; Session Metrics
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#9aa1b2]">
                  Corporate balance-sheet feeds and quarterly EPS filings are unavailable while
                  running in local <span className="font-mono text-[#d4d8e2]">OFFLINE_MODE</span>{" "}
                  paper simulation. Allegedly never fabricates financial ratios. Available on-device
                  session metrics can be added below:
                </p>

                <div className="mt-4 divide-y divide-[#1f232e] rounded-md border border-[#23262f] bg-[#16181f]">
                  {BUILTIN_CATALOG.filter((e) => e.source === "Orderflow" || e.id === "vwap-1").map(
                    (entry) => {
                      const active = isEntryActive(entry);
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between px-3.5 py-2.5 text-[12px]"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              style={{ backgroundColor: entry.color }}
                              className="h-2 w-2 rounded-full"
                            />
                            <span className="text-[#e6e8ee]">{entry.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleActivateEntry(entry)}
                            className={
                              active
                                ? "rounded bg-sky-500/20 px-2.5 py-1 font-mono text-[10px] font-medium text-sky-300 ring-1 ring-sky-500/40"
                                : "rounded border border-[#2c3140] bg-[#1d202a] px-2.5 py-1 text-[11px] text-[#d4d8e2] hover:bg-[#272b38] hover:text-white"
                            }
                          >
                            {active ? "Active" : "Add"}
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </TabsPanel>
          </div>
        </Tabs>

        {/* Bottom Status Footer */}
        <div className="flex h-11 shrink-0 items-center justify-between border-t border-[#23262f] bg-[#12141b] px-5 text-[12px]">
          <div className="flex items-center gap-3 text-[#8b92a3]">
            <span>
              <span className="font-mono text-[#e6e8ee]">{totalActiveCount}</span> active on chart
            </span>
            {activeStudies.length > 0 && (
              <button
                type="button"
                onClick={onClearStudies}
                className="text-[11px] text-rose-300 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
              >
                Clear studies ({activeStudies.length})
              </button>
            )}
          </div>
          <Button
            onClick={() => onOpenChange(false)}
            className="h-7 rounded-md bg-[#2b2f3a] px-3.5 text-xs font-medium text-[#f1f3f8] hover:bg-[#383d4b] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
