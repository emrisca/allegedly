import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type PickerLineStyle = "solid" | "dashed" | "dotted";

/**
 * TradingView-style 10-column swatch palette:
 * Row 0: White -> Black grayscale
 * Row 1: Vivid primaries
 * Rows 2..7: Light tints -> deep shades
 */
export const TV_COLOR_PALETTE_ROWS: readonly (readonly string[])[] = [
  ["#ffffff", "#e0e3eb", "#c1c4cd", "#a3a6af", "#868993", "#6a6d78", "#50535e", "#363a45", "#131722", "#000000"],
  ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"],
  ["#fccbcd", "#ffe0b2", "#fff9c4", "#c8e6c9", "#ace5dc", "#b2ebf2", "#bbd9fb", "#d1c4e9", "#e1bee7", "#f8bbd0"],
  ["#faa1a4", "#ffcc80", "#fff59d", "#a5d6a7", "#70ccbd", "#80deea", "#90bff9", "#b39ddb", "#ce93d8", "#f48fb1"],
  ["#f77c80", "#ffb74d", "#fff176", "#81c784", "#42bda8", "#4dd0e1", "#5b9cf6", "#9575cd", "#ba68c8", "#f06292"],
  ["#f7525f", "#ffa726", "#ffee58", "#66bb6a", "#22ab94", "#26c6da", "#3179f5", "#7e57c2", "#ab47bc", "#ec407a"],
  ["#b22833", "#f57c00", "#fbc02d", "#388e3c", "#056656", "#0097a7", "#1848cc", "#512da8", "#7b1fa2", "#c2185b"],
  ["#801922", "#e65100", "#f57f17", "#1b5e20", "#00332a", "#006064", "#0c3299", "#311b92", "#4a148c", "#880e4f"],
];

const RECENT_COLORS_STORAGE_KEY = "allegedly.recent-colors.v1";
const MAX_RECENT_COLORS = 19;
const DEFAULT_RECENT_COLORS = [
  "#2962ff",
  "#089981",
  "#f23645",
  "#ff9800",
  "#a855f7",
  "#ffffff",
  "#38bdf8",
  "#eab308",
  "#787b86",
  "#131722",
];

type RecentListener = () => void;
const recentListeners = new Set<RecentListener>();
let cachedRecentColors: string[] | null = null;

export function normalizeHexColor(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    const expanded = raw
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return null;
}

export function getRecentColors(): string[] {
  if (cachedRecentColors) return cachedRecentColors;
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(RECENT_COLORS_STORAGE_KEY)
        : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed
          .map((c) => (typeof c === "string" ? normalizeHexColor(c) : null))
          .filter((c): c is string => Boolean(c));
        if (clean.length > 0) {
          cachedRecentColors = clean.slice(0, MAX_RECENT_COLORS);
          return cachedRecentColors;
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  cachedRecentColors = [...DEFAULT_RECENT_COLORS];
  return cachedRecentColors;
}

export function addRecentColor(hex: string): string[] {
  const norm = normalizeHexColor(hex);
  if (!norm) return getRecentColors();
  const prev = getRecentColors();
  const next = [norm, ...prev.filter((c) => c.toLowerCase() !== norm)].slice(0, MAX_RECENT_COLORS);
  cachedRecentColors = next;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage write errors
  }
  for (const fn of recentListeners) fn();
  return next;
}

function useRecentColors(): string[] {
  const [colors, setColors] = useState<string[]>(() => getRecentColors());
  useEffect(() => {
    const onChange = () => setColors([...getRecentColors()]);
    recentListeners.add(onChange);
    return () => {
      recentListeners.delete(onChange);
    };
  }, []);
  return colors;
}

interface HsvColor {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHexColor(hex) ?? "#2962ff";
  const num = Number.parseInt(norm.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const vn = Math.max(0, Math.min(100, v)) / 100;
  const hn = ((h % 360) + 360) % 360;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hn < 60) {
    rp = c;
    gp = x;
  } else if (hn < 120) {
    rp = x;
    gp = c;
  } else if (hn < 180) {
    gp = c;
    bp = x;
  } else if (hn < 240) {
    gp = x;
    bp = c;
  } else if (hn < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

function hsvToHex(hsv: HsvColor): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(r, g, b);
}

const CHECKER_STYLE = {
  backgroundImage:
    "linear-gradient(45deg, #2a2e39 25%, transparent 25%), linear-gradient(-45deg, #2a2e39 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2e39 75%), linear-gradient(-45deg, transparent 75%, #2a2e39 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
} as const;

export interface ColorPickerButtonProps {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  lineWidth?: 1 | 2 | 3 | 4;
  onLineWidthChange?: (w: 1 | 2 | 3 | 4) => void;
  lineStyle?: PickerLineStyle;
  onLineStyleChange?: (s: PickerLineStyle) => void;
  disabled?: boolean;
  triggerClassName?: string;
  renderTriggerContent?: (currentHex: string, currentOpacity: number) => ReactNode;
}

/**
 * TradingView-style swatch popover with recent colors row + `+` button
 * that opens a shadcn.io-style custom color picker (2D Saturation/Brightness area,
 * Hue & Opacity sliders, and Hex input).
 */
export function ColorPickerButton({
  value,
  onChange,
  ariaLabel,
  opacity,
  onOpacityChange,
  lineWidth,
  onLineWidthChange,
  lineStyle,
  onLineStyleChange,
  disabled = false,
  triggerClassName,
  renderTriggerContent,
}: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(() => normalizeHexColor(value) ?? "#2962ff");
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const recentColors = useRecentColors();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const alphaRef = useRef<HTMLDivElement | null>(null);

  const normalizedValue = normalizeHexColor(value) ?? "#2962ff";
  const effectiveOpacity = typeof opacity === "number" ? Math.max(0, Math.min(1, opacity)) : 1;
  const showOpacity = typeof opacity === "number" && typeof onOpacityChange === "function";

  // Sync internal HSV/hex when opening or external value changes
  useEffect(() => {
    const norm = normalizeHexColor(value);
    if (norm && norm !== hexDraft.toLowerCase()) {
      setHexDraft(norm);
      setHsv(hexToHsv(norm));
    }
  }, [value]);

  const computePosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popW = 264;
    const popH = customMode ? 332 : 340 + (showOpacity ? 44 : 0) + (onLineWidthChange ? 48 : 0);
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    let left = rect.left;
    if (left + popW > vw - 12) {
      left = Math.max(12, rect.right - popW);
    }
    let top = rect.bottom + 6;
    if (top + popH > vh - 12) {
      top = Math.max(12, rect.top - popH - 6);
    }
    setCoords({ left: Math.round(left), top: Math.round(top) });
  }, [customMode, showOpacity, onLineWidthChange]);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const popEl = popoverRef.current as (HTMLDivElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
    }) | null;
    if (popEl && typeof popEl.showPopover === "function") {
      try {
        popEl.showPopover();
      } catch {
        // Ignore if already open or unsupported
      }
    }
    return () => {
      if (popEl && typeof popEl.hidePopover === "function") {
        try {
          popEl.hidePopover();
        } catch {
          // Ignore
        }
      }
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDownDoc = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setCustomMode(false);
    };
    const onKeyDownDoc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (customMode) {
          setCustomMode(false);
        } else {
          setOpen(false);
        }
      }
    };
    const onScrollOrResize = () => computePosition();
    document.addEventListener("pointerdown", onPointerDownDoc, true);
    document.addEventListener("keydown", onKeyDownDoc, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownDoc, true);
      document.removeEventListener("keydown", onKeyDownDoc, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, customMode, computePosition]);

  const commitColor = (hex: string, recordRecent = true) => {
    const norm = normalizeHexColor(hex);
    if (!norm) return;
    setHexDraft(norm);
    setHsv(hexToHsv(norm));
    onChange(norm);
    if (recordRecent) {
      addRecentColor(norm);
    }
  };

  const applyHsvLive = (next: HsvColor) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex);
    onChange(hex);
  };

  const updateAreaFromClient = (clientX: number, clientY: number) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const v = Math.max(0, Math.min(100, (1 - (clientY - rect.top) / Math.max(1, rect.height)) * 100));
    applyHsvLive({ h: hsv.h, s, v });
  };

  const updateHueFromClient = (clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = Math.max(0, Math.min(359.9, ((clientX - rect.left) / Math.max(1, rect.width)) * 360));
    applyHsvLive({ h, s: hsv.s, v: hsv.v });
  };

  const updateAlphaFromClient = (clientX: number) => {
    if (!onOpacityChange) return;
    const el = alphaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    onOpacityChange(Math.round(ratio * 100) / 100);
  };

  const { r, g, b } = hexToRgb(normalizedValue);
  const pureHueHex = hsvToHex({ h: hsv.h, s: 100, v: 100 });

  const popoverNode = open ? (
    <div
      ref={popoverRef}
      popover="manual"
      role="dialog"
      aria-label={`${ariaLabel} picker`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: coords.left,
        top: coords.top,
        margin: 0,
      }}
      className="z-[9999] w-[264px] rounded-xl border border-[#2a2e39] bg-[#16181f] p-3 text-[#d1d4dc] shadow-2xl"
    >
      {!customMode ? (
        <div>
          {/* 10x8 TradingView Color Swatch Grid */}
          <div className="space-y-2">
            <div className="grid grid-cols-10 gap-1.5">
              {TV_COLOR_PALETTE_ROWS[0].map((hex) => {
                const selected = normalizedValue === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Color ${hex}`}
                    aria-pressed={selected}
                    onClick={() => commitColor(hex, true)}
                    style={{ backgroundColor: hex }}
                    className={`h-5 w-5 rounded-[4px] border transition-transform hover:scale-110 ${
                      selected
                        ? "border-white ring-2 ring-white/90 ring-offset-2 ring-offset-[#16181f]"
                        : "border-white/10"
                    }`}
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-10 gap-1.5">
              {TV_COLOR_PALETTE_ROWS[1].map((hex) => {
                const selected = normalizedValue === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Color ${hex}`}
                    aria-pressed={selected}
                    onClick={() => commitColor(hex, true)}
                    style={{ backgroundColor: hex }}
                    className={`h-5 w-5 rounded-[4px] border transition-transform hover:scale-110 ${
                      selected
                        ? "border-white ring-2 ring-white/90 ring-offset-2 ring-offset-[#16181f]"
                        : "border-white/10"
                    }`}
                  />
                );
              })}
            </div>

            <div className="space-y-1.5 pt-0.5">
              {TV_COLOR_PALETTE_ROWS.slice(2).map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-10 gap-1.5">
                  {row.map((hex) => {
                    const selected = normalizedValue === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Color ${hex}`}
                        aria-pressed={selected}
                        onClick={() => commitColor(hex, true)}
                        style={{ backgroundColor: hex }}
                        className={`h-5 w-5 rounded-[4px] border transition-transform hover:scale-110 ${
                          selected
                            ? "border-white ring-2 ring-white/90 ring-offset-2 ring-offset-[#16181f]"
                            : "border-white/10"
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Divider + Recent Colors Row + '+' Custom Picker Trigger */}
          <div className="my-2.5 h-px bg-[#2a2e39]" />
          <div className="grid grid-cols-10 gap-1.5" aria-label="Recent colors">
            {recentColors.map((hex) => {
              const selected = normalizedValue === hex.toLowerCase();
              return (
                <button
                  key={`recent-${hex}`}
                  type="button"
                  title={`Recent ${hex}`}
                  aria-label={`Recent color ${hex}`}
                  aria-pressed={selected}
                  onClick={() => commitColor(hex, true)}
                  style={{ backgroundColor: hex }}
                  className={`h-5 w-5 rounded-[4px] border transition-transform hover:scale-110 ${
                    selected
                      ? "border-white ring-2 ring-white/90 ring-offset-2 ring-offset-[#16181f]"
                      : "border-white/10"
                  }`}
                />
              );
            })}
            <button
              type="button"
              title="Add custom color"
              aria-label="Add custom color"
              onClick={() => {
                setHsv(hexToHsv(normalizedValue));
                setHexDraft(normalizedValue);
                setCustomMode(true);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-[4px] border border-transparent text-[#d1d4dc] transition-colors hover:bg-[#2a2e39] hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M7 2v10M2 7h10" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Optional Opacity Slider */}
          {showOpacity && (
            <div className="mt-3 space-y-1.5 border-t border-[#2a2e39] pt-2.5">
              <div className="flex items-center justify-between text-[11px] text-[#868993]">
                <span>Opacity</span>
                <span className="font-mono text-[#d1d4dc]">
                  {Math.round(effectiveOpacity * 100)}%
                </span>
              </div>
              <div
                ref={alphaRef}
                role="slider"
                aria-label="Opacity"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(effectiveOpacity * 100)}
                tabIndex={0}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  updateAlphaFromClient(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) updateAlphaFromClient(e.clientX);
                }}
                style={CHECKER_STYLE}
                className="relative h-3 w-full cursor-pointer overflow-hidden rounded-full border border-[#363a45]"
              >
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))`,
                  }}
                />
                <span
                  style={{ left: `${effectiveOpacity * 100}%` }}
                  className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#16181f] shadow"
                />
              </div>
            </div>
          )}

          {/* Optional Line Thickness & Style Controls */}
          {(onLineWidthChange || onLineStyleChange) && (
            <div className="mt-3 space-y-2 border-t border-[#2a2e39] pt-2.5">
              {onLineWidthChange && typeof lineWidth === "number" && (
                <div className="flex items-center gap-1.5">
                  {([1, 2, 3, 4] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onLineWidthChange(w)}
                      className={`flex h-7 flex-1 items-center justify-center rounded-md border font-mono text-[11px] transition-colors ${
                        lineWidth === w
                          ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                          : "border-[#2a2e39] bg-[#1e222d] text-[#868993] hover:text-white"
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              )}
              {onLineStyleChange && lineStyle && (
                <div className="flex items-center gap-1.5">
                  {(["solid", "dashed", "dotted"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onLineStyleChange(s)}
                      className={`h-7 flex-1 rounded-md border text-[11px] capitalize transition-colors ${
                        lineStyle === s
                          ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                          : "border-[#2a2e39] bg-[#1e222d] text-[#868993] hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* shadcn.io-style Custom Color Picker (2D Area + Hue + Opacity + Hex) */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Back to color palette"
              onClick={() => setCustomMode(false)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-[#b2b5be] transition-colors hover:bg-[#2a2e39] hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M8.5 3L4.5 7l4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Custom color</span>
            </button>
            <button
              type="button"
              onClick={() => {
                commitColor(hexDraft, true);
                setCustomMode(false);
              }}
              className="rounded-md bg-[#2962ff] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#1e53e5]"
            >
              Add
            </button>
          </div>

          {/* 2D Saturation x Value Color Area */}
          <div
            ref={areaRef}
            role="application"
            aria-label="Color saturation and brightness area"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              updateAreaFromClient(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) updateAreaFromClient(e.clientX, e.clientY);
            }}
            style={{ backgroundColor: pureHueHex }}
            className="relative h-36 w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-[#363a45]"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "linear-gradient(to right, #ffffff, rgba(255,255,255,0))",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "linear-gradient(to top, #000000, rgba(0,0,0,0))",
              }}
            />
            <span
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: normalizedValue,
              }}
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
            />
          </div>

          {/* Hue Spectrum Slider */}
          <div className="space-y-2">
            <div
              ref={hueRef}
              role="slider"
              aria-label="Hue"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(hsv.h)}
              tabIndex={0}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                updateHueFromClient(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) updateHueFromClient(e.clientX);
              }}
              style={{
                background:
                  "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
              }}
              className="relative h-3 w-full cursor-pointer rounded-full border border-[#363a45]"
            >
              <span
                style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pureHueHex }}
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              />
            </div>

            {/* Opacity Slider */}
            {showOpacity && (
              <div
                ref={alphaRef}
                role="slider"
                aria-label="Opacity"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(effectiveOpacity * 100)}
                tabIndex={0}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  updateAlphaFromClient(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) updateAlphaFromClient(e.clientX);
                }}
                style={CHECKER_STYLE}
                className="relative h-3 w-full cursor-pointer overflow-hidden rounded-full border border-[#363a45]"
              >
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))`,
                  }}
                />
                <span
                  style={{ left: `${effectiveOpacity * 100}%` }}
                  className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#16181f] shadow"
                />
              </div>
            )}
          </div>

          {/* Hex Input + Swatch Preview */}
          <div className="flex items-center gap-2">
            <span
              className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[#363a45]"
              style={CHECKER_STYLE}
            >
              <span
                className="absolute inset-0"
                style={{ backgroundColor: normalizedValue, opacity: effectiveOpacity }}
              />
            </span>
            <input
              aria-label="Hex color value"
              type="text"
              value={hexDraft}
              onChange={(e) => {
                const raw = e.target.value;
                setHexDraft(raw);
                const norm = normalizeHexColor(raw);
                if (norm) {
                  setHsv(hexToHsv(norm));
                  onChange(norm);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitColor(hexDraft, true);
                  setCustomMode(false);
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-[#363a45] bg-[#131722] px-2.5 font-mono text-[12px] uppercase text-[#f0f3fa] outline-none focus:border-[#2962ff]"
            />
            {showOpacity && (
              <span className="w-10 text-right font-mono text-[11px] text-[#868993]">
                {Math.round(effectiveOpacity * 100)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => {
            if (v) setCustomMode(false);
            return !v;
          });
        }}
        className={
          triggerClassName ??
          `inline-flex h-7 w-7 items-center justify-center rounded-md border bg-[#181c27] p-1 transition-colors ${
            open ? "border-[#2962ff]" : "border-[#363a45] hover:border-[#4c5265]"
          } disabled:cursor-not-allowed disabled:opacity-40`
        }
      >
        {renderTriggerContent ? (
          renderTriggerContent(normalizedValue, effectiveOpacity)
        ) : (
          <span
            className="relative h-full w-full overflow-hidden rounded-[3px] border border-white/10"
            style={CHECKER_STYLE}
          >
            <span
              className="absolute inset-0"
              style={{ backgroundColor: normalizedValue, opacity: effectiveOpacity }}
            />
          </span>
        )}
      </button>
      {popoverNode && typeof document !== "undefined"
        ? createPortal(popoverNode, document.body)
        : null}
    </>
  );
}
