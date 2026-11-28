export const DEFAULT_TPO_SETTINGS = {
  valueArea: 70,
  blockMinutes: 30,
  letters: true,
  pocLine: true,
  valueAreaLines: true,
  intradayOnly: false,
  outsideColor: "#363348",
  valueAreaColor: "#575175",
  pocColor: "#82485b",
  letterColor: "#f1edf8",
  pocLineColor: "#da829b",
  valueAreaLineColor: "#a099ba",
};

export type TpoSettings = typeof DEFAULT_TPO_SETTINGS;
export const TPO_COLOR_FIELDS = [
  ["outsideColor", "Outside value area"],
  ["valueAreaColor", "Inside value area"],
  ["pocColor", "Point of control blocks"],
  ["letterColor", "Letters"],
  ["pocLineColor", "Point of control line"],
  ["valueAreaLineColor", "Value area lines"],
] as const;

export function loadTpoSettings(): TpoSettings {
  const settings = { ...DEFAULT_TPO_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem("allegedly.tpo.settings") ?? "{}");
    if (!saved || typeof saved !== "object") return settings;
    for (const [key] of TPO_COLOR_FIELDS) {
      if (typeof saved[key] === "string" && CSS.supports("color", saved[key])) settings[key] = saved[key];
    }
    for (const key of ["letters", "pocLine", "valueAreaLines", "intradayOnly"] as const) {
      if (typeof saved[key] === "boolean") settings[key] = saved[key];
    }
    if ([30, 60, 120, 240].includes(saved.blockMinutes)) settings.blockMinutes = saved.blockMinutes;
    if (Number.isInteger(saved.valueArea) && saved.valueArea >= 1 && saved.valueArea <= 100) {
      settings.valueArea = saved.valueArea;
    }
  } catch {
    // Settings remain usable when storage is unavailable.
  }
  return settings;
}

export function loadTpoMerges(symbol: string): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(`allegedly.tpo.merges.${symbol}`) ?? "[]");
    if (Array.isArray(saved)) return saved.filter((day): day is number => Number.isSafeInteger(day));
  } catch {
    // Settings remain usable when storage is unavailable.
  }
  return [];
}

export function saveTpoPreference(key: string, value: TpoSettings | number[]): void {
  try {
    localStorage.setItem(`allegedly.tpo.${key}`, JSON.stringify(value));
  } catch {
    // The current chart still uses the updated setting.
  }
}
