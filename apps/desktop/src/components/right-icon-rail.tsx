import type { ReactNode } from "react";

export type RightPanelTab =
  | "watchlist"
  | "alerts"
  | "object_tree"
  | "dom"
  | "trade"
  | "studies"
  | "provenance"
  | null;
export type RightDrawerTab = RightPanelTab;

export interface RightIconRailProps {
  activeTab: RightPanelTab;
  onSelectTab: (tab: Exclude<RightPanelTab, null>) => void;
  studiesCount: number;
  openOrdersCount: number;
  alertsCount?: number;
}

export function RightIconRail({
  activeTab,
  onSelectTab,
  openOrdersCount,
  alertsCount = 0,
}: RightIconRailProps) {
  const items: ReadonlyArray<{
    id: Exclude<RightPanelTab, null>;
    label: string;
    badge?: number;
    icon: ReactNode;
  }> = [
    {
      id: "watchlist",
      label: "Watchlist",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 5.5h12M4 10h12M4 14.5h12" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "alerts",
      label: "Alerts",
      badge: alertsCount > 0 ? alertsCount : undefined,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10.8" r="5.5" />
          <path d="M10 8v3l2 1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 4.5 3.3 6.2M15 4.5l1.7 1.7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "object_tree",
      label: "Object Tree and Data Window",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 3.8 16.2 7.2 10 10.6 3.8 7.2 10 3.8Z" strokeLinejoin="round" />
          <path d="m3.8 10.6 6.2 3.4 6.2-3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m3.8 13.8 6.2 3.4 6.2-3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "dom",
      label: "Order Book",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3.5" y="4" width="13" height="3.5" rx="0.8" />
          <rect x="3.5" y="8.5" width="9.5" height="3" rx="0.8" />
          <rect x="3.5" y="12.5" width="11.5" height="3.5" rx="0.8" />
        </svg>
      ),
    },
    {
      id: "trade",
      label: "Paper Trade",
      badge: openOrdersCount > 0 ? openOrdersCount : undefined,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 13.5 8.5 9l3 3L16 6.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 6.5h3v3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "provenance",
      label: "Data & System",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="10" cy="5.5" rx="5.5" ry="2.2" />
          <path d="M4.5 5.5v4.5c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V5.5" />
          <path d="M4.5 10v4.5c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V10" />
        </svg>
      ),
    },
  ];

  return (
    <aside
      aria-label="Right panel switcher"
      className="flex w-10 shrink-0 flex-col items-center border-l border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] py-2 select-none"
    >
      <div className="flex flex-col items-center gap-1">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={active ? `Hide ${item.label}` : item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onSelectTab(item.id)}
              className={
                active
                  ? "relative flex h-8 w-8 items-center justify-center rounded bg-[#ededed]/15 text-[#f4f4f5] focus-visible:outline-2 focus-visible:outline-white/50"
                  : "relative flex h-8 w-8 items-center justify-center rounded text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"
              }
            >
              {item.icon}
              {item.badge !== undefined && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#ededed] px-1 text-[9px] font-semibold text-[#0d0f12]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
