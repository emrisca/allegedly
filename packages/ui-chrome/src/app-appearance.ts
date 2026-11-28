export type AppThemeMode = "dark" | "light";
export type AppThemePresetId = AppThemeMode;

export interface AppAppearanceSettings {
  mode: AppThemeMode;
  /** Back-compat alias kept equal to `mode` */
  preset: AppThemeMode;
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
  /** Default foreground text */
  textColor: string;
  /** Strong foreground text */
  textStrongColor: string;
  /** Muted secondary text */
  mutedColor: string;
}

export interface AppThemePreset {
  id: AppThemeMode;
  name: string;
  description: string;
  colors: Omit<AppAppearanceSettings, "mode" | "preset">;
}

export const APP_THEME_PRESETS: readonly AppThemePreset[] = [
  {
    id: "dark",
    name: "Dark",
    description: "Neutral dark workspace",
    colors: {
      chromeBg: "#0e1014",
      panelBg: "#12141a",
      surfaceBg: "#16181f",
      borderColor: "#252830",
      accentColor: "#ededed",
      textColor: "#d4d4d8",
      textStrongColor: "#f4f4f5",
      mutedColor: "#71717a",
    },
  },
  {
    id: "light",
    name: "Light",
    description: "Clean neutral light workspace",
    colors: {
      chromeBg: "#f8f9fb",
      panelBg: "#ffffff",
      surfaceBg: "#f1f3f7",
      borderColor: "#e2e5ec",
      accentColor: "#111318",
      textColor: "#27272a",
      textStrongColor: "#09090b",
      mutedColor: "#71717a",
    },
  },
];

export function getAppAppearanceForMode(mode: AppThemeMode): AppAppearanceSettings {
  const match = APP_THEME_PRESETS.find((p) => p.id === mode) ?? APP_THEME_PRESETS[0];
  return {
    mode: match.id,
    preset: match.id,
    ...match.colors,
  };
}

export const DEFAULT_APP_APPEARANCE: AppAppearanceSettings = getAppAppearanceForMode("dark");

const STORAGE_KEY = "allegedly.app_appearance.v2";

export function cloneAppAppearance(src: AppAppearanceSettings): AppAppearanceSettings {
  return { ...src };
}

export function getSystemAppAppearance(): AppAppearanceSettings {
  const light = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  return getAppAppearanceForMode(light ? "light" : "dark");
}

export function hasStoredAppAppearance(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<AppAppearanceSettings>;
    return parsed.mode === "light" || parsed.mode === "dark" || parsed.preset === "light" || parsed.preset === "dark";
  } catch {
    return false;
  }
}

export function loadStoredAppAppearance(): AppAppearanceSettings {
  if (typeof window === "undefined") return cloneAppAppearance(DEFAULT_APP_APPEARANCE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getSystemAppAppearance();
    const parsed = JSON.parse(raw) as Partial<AppAppearanceSettings>;
    if (parsed.mode !== "light" && parsed.mode !== "dark" && parsed.preset !== "light" && parsed.preset !== "dark") return getSystemAppAppearance();
    const mode: AppThemeMode = parsed.mode === "light" || parsed.preset === "light" ? "light" : "dark";
    return getAppAppearanceForMode(mode);
  } catch {
    return getSystemAppAppearance();
  }
}

export function saveStoredAppAppearance(next: AppAppearanceSettings): void {
  if (typeof window === "undefined") return;
  try {
    const mode: AppThemeMode = next.mode === "light" || next.preset === "light" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
  } catch {
    // ignore quota errors
  }
}

export function applyAppAppearanceToDocument(next: AppAppearanceSettings): void {
  if (typeof document === "undefined") return;
  const resolved = getAppAppearanceForMode(next.mode === "light" || next.preset === "light" ? "light" : "dark");
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved.mode);
  root.style.colorScheme = resolved.mode;
  root.style.setProperty("--app-chrome-bg", resolved.chromeBg);
  root.style.setProperty("--app-panel-bg", resolved.panelBg);
  root.style.setProperty("--app-surface-bg", resolved.surfaceBg);
  root.style.setProperty("--app-border", resolved.borderColor);
  root.style.setProperty("--app-accent", resolved.accentColor);
  root.style.setProperty("--app-text", resolved.textColor);
  root.style.setProperty("--app-text-strong", resolved.textStrongColor);
  root.style.setProperty("--app-muted", resolved.mutedColor);
}
