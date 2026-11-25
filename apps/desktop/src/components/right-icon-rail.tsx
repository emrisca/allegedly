import type { ReactNode } from "react";

export type RightDrawerTab = "watchlist" | "dom" | "trade" | "studies" | "provenance" | null;

export interface RightIconRailProps {
  activeTab: RightDrawerTab;
  onSelectTab: (tab: Exclude<RightDrawerTab, null>) => void;
  studiesCount: number;
  openOrdersCount: number;
}

interface RailButtonSpec {
  id: Exclude<RightDrawerTab, null>;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export function RightIconRail({
  activeTab,
  onSelectTab,
  studiesCount,
  openOrdersCount,
}: RightIconRailProps) {
  const items: RailButtonSpec[] = [
    {
      id: "watchlist",
      label: "Watchlist",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
          <path d="M6.5 7.5h7M6.5 10.5h7M6.5 13.5h4.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "dom",
      label: "DOM Ladder & Tape",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3.5 5.5h5M11.5 5.5h5M3.5 10h7M12.5 10h4M3.5 14.5h4M9.5 14.5h7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "trade",
      label: "Paper OMS & Trade",
      badge: openOrdersCount > 0 ? openOrdersCount : undefined,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M4 13.5 8 9.5l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 6.5h3v3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "studies",
      label: "Indicators & Luau Studies",
      badge: studiesCount > 0 ? studiesCount : undefined,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3.5 15.5 7.5 8l4 4.5 5-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "provenance",
      label: "Provenance & TOML Config",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M10 3.5 16 6.8 10 10 4 6.8 10 3.5Z" strokeLinejoin="round" />
          <path d="M4 10.3 10 13.5l6-3.2M4 13.5 10 16.7l6-3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <aside
      aria-label="Right utility panel switcher"
      className="flex w-10 shrink-0 flex-col items-center justify-between border-l border-[#232733] bg-[#101217] py-2 select-none"
    >
      <div className="flex flex-col items-center gap-1.5">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={active ? `Collapse ${item.label}` : `Open ${item.label}`}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onSelectTab(item.id)}
              className={
                active
                  ? "relative flex h-8 w-8 items-center justify-center rounded-md bg-[#252a37] text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                  : "relative flex h-8 w-8 items-center justify-center rounded-md text-[#8c93a4] hover:bg-[#1c202b] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-sky-400"
              }
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -left-[4px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-sky-400"
                />
              )}
              {item.icon}
              {item.badge !== undefined && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-sky-500 px-1 font-mono text-[9px] font-semibold text-[#0c0d11]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span
          title="Allegedly v0.1 Local-First Engine"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2a2f3d] bg-[#161922] font-mono text-[10px] font-bold text-[#b8becd]"
        >
          A
        </span>
      </div>
    </aside>
  );
}
