export type AppThemePresetId = "slate" | "obsidian" | "graphite" | "midnight" | "custom";

export interface AppAppearanceSettings {
  preset: AppThemePresetId;
  /** Main shell background (top bar, left rail, right rail, watchlist, status bar) */
  chromeBg: string;
  /** Secondary panels, sidebar nav, nested sections */
  panelBg: string;
  /** Modals, popovers, hover surfaces */
  surfaceBg: string;
  /** Hairline borders & dividers */
  borderColor: string;
  /** Primary active highlight / accent */
  accentColor: string;
}

export interface AppThemePreset {
  id: Exclude<AppThemePresetId, "custom">;
  name: string;
  description: string;
  colors: Omit<AppAppearanceSettings, "preset">;
}

export const APP_THEME_PRESETS: readonly AppThemePreset[] = [
  {
    id: "slate",
    name: "Allegedly Slate",
    description: "Default cool slate-blue chrome",
    colors: {
      chromeBg: "#131722",
      panelBg: "#181c27",
      surfaceBg: "#1e222d",
      borderColor: "#2a2e39",
      accentColor: "#2962ff",
    },
  },
  {
    id: "obsidian",
    name: "Obsidian Black",
    description: "Pure neutral dark chrome (TradingView dark)",
    colors: {
      chromeBg: "#0a0b0e",
      panelBg: "#111216",
      surfaceBg: "#181a20",
      borderColor: "#23252c",
      accentColor: "#2962ff",
    },
  },
  {
    id: "graphite",
    name: "Carbon Graphite",
    description: "Neutral matte charcoal with zero blue cast",
    colors: {
      chromeBg: "#141416",
      panelBg: "#1a1a1e",
      surfaceBg: "#222227",
      borderColor: "#2d2d34",
      accentColor: "#3b82f6",
    },
  },
  {
    id: "midnight",
    name: "Deep Midnight",
    description: "High-contrast midnight indigo shell",
    colors: {
      chromeBg: "#0b0f19",
      panelBg: "#111726",
      surfaceBg: "#182034",
      borderColor: "#24304a",
      accentColor: "#38bdf8",
    },
  },
];

export const DEFAULT_APP_APPEARANCE: AppAppearanceSettings = {
  preset: "slate",
  ...APP_THEME_PRESETS[0].colors,
};

const STORAGE_KEY = "allegedly.app_appearance.v1";

export function cloneAppAppearance(src: AppAppearanceSettings): AppAppearanceSettings {
  return { ...src };
}

export function loadStoredAppAppearance(): AppAppearanceSettings {
  if (typeof window === "undefined") return cloneAppAppearance(DEFAULT_APP_APPEARANCE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneAppAppearance(DEFAULT_APP_APPEARANCE);
    const parsed = JSON.parse(raw) as Partial<AppAppearanceSettings>;
    return {
      preset: parsed.preset ?? DEFAULT_APP_APPEARANCE.preset,
      chromeBg: typeof parsed.chromeBg === "string" ? parsed.chromeBg : DEFAULT_APP_APPEARANCE.chromeBg,
      panelBg: typeof parsed.panelBg === "string" ? parsed.panelBg : DEFAULT_APP_APPEARANCE.panelBg,
      surfaceBg: typeof parsed.surfaceBg === "string" ? parsed.surfaceBg : DEFAULT_APP_APPEARANCE.surfaceBg,
      borderColor: typeof parsed.borderColor === "string" ? parsed.borderColor : DEFAULT_APP_APPEARANCE.borderColor,
      accentColor: typeof parsed.accentColor === "string" ? parsed.accentColor : DEFAULT_APP_APPEARANCE.accentColor,
    };
  } catch {
    return cloneAppAppearance(DEFAULT_APP_APPEARANCE);
  }
}

export function saveStoredAppAppearance(next: AppAppearanceSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

export function applyAppAppearanceToDocument(next: AppAppearanceSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--app-chrome-bg", next.chromeBg);
  root.style.setProperty("--app-panel-bg", next.panelBg);
  root.style.setProperty("--app-surface-bg", next.surfaceBg);
  root.style.setProperty("--app-border", next.borderColor);
  root.style.setProperty("--app-accent", next.accentColor);
}
