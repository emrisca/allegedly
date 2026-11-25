import { useState } from "react";
import type { ChartSettingsTemplate } from "@allegedly/ui-chrome";

export interface ChartContextMenuState {
  x: number;
  y: number;
  price: number;
  formattedPrice: string;
}

export interface ChartContextMenuProps {
  menu: ChartContextMenuState;
  symbol: string;
  studiesCount: number;
  lockCursorByTime: boolean;
  tableViewOpen: boolean;
  templates: readonly ChartSettingsTemplate[];
  onClose: () => void;
  onResetView: () => void;
  onCopyPrice: (priceText: string) => void;
  onPaste: () => void;
  onAddAlert: (price: number) => void;
  onSellLimit: (price: number) => void;
  onBuyStop: (price: number) => void;
  onAddOrder: (price: number) => void;
  onToggleLockCursor: () => void;
  onToggleTableView: () => void;
  onOpenObjectTree: () => void;
  onApplyTemplate: (tpl: ChartSettingsTemplate) => void;
  onApplyDefaults: () => void;
  onRemoveIndicators: () => void;
  onOpenSettings: () => void;
}

const ITEM_CLS =
  "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-[12px] text-[#d6dae6] hover:bg-[#232631] hover:text-white";
const SEP_CLS = "my-1 h-px bg-[#262934]";

export function ChartContextMenu({
  menu,
  symbol,
  studiesCount,
  lockCursorByTime,
  tableViewOpen,
  templates,
  onClose,
  onResetView,
  onCopyPrice,
  onPaste,
  onAddAlert,
  onSellLimit,
  onBuyStop,
  onAddOrder,
  onToggleLockCursor,
  onToggleTableView,
  onOpenObjectTree,
  onApplyTemplate,
  onApplyDefaults,
  onRemoveIndicators,
  onOpenSettings,
}: ChartContextMenuProps) {
  const [tplHover, setTplHover] = useState(false);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        aria-label="Chart context menu"
        style={{ left: menu.x, top: menu.y }}
        className="fixed z-50 w-72 rounded-xl border border-[#2a2d38] bg-[#16181f] py-1.5 shadow-2xl select-none"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onResetView();
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#9aa1b2]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2L3 6.5M3 3.5v3h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Reset chart view</span>
          </span>
          <span className="font-mono text-[10px] text-[#787e8d]">⌥R</span>
        </button>

        <div className={SEP_CLS} />

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCopyPrice(menu.formattedPrice);
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="pl-6">Copy price {menu.formattedPrice}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onPaste();
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="pl-6">Paste</span>
          <span className="font-mono text-[10px] text-[#787e8d]">⌘V</span>
        </button>

        <div className={SEP_CLS} />

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onAddAlert(menu.price);
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5 truncate">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#9aa1b2]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7.5" cy="8.5" r="4.5" />
              <path d="M7.5 6.2v2.3l1.5 1M12.5 10.5v3M11 12h3" strokeLinecap="round" />
            </svg>
            <span className="truncate">
              Add alert on {symbol} at {menu.formattedPrice}...
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[#787e8d]">⌥A</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onSellLimit(menu.price);
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5 truncate">
            <span aria-hidden="true" className="w-3.5 text-center text-[11px] text-rose-400">
              ⌄
            </span>
            <span className="truncate">
              Sell 1 {symbol} @ {menu.formattedPrice} limit
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[#787e8d]">⌥⇧S</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onBuyStop(menu.price);
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5 truncate">
            <span aria-hidden="true" className="w-3.5 text-center text-[11px] text-emerald-400">
              ⌃
            </span>
            <span className="truncate">
              Buy 1 {symbol} @ {menu.formattedPrice} stop
            </span>
          </span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onAddOrder(menu.price);
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5 truncate">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#9aa1b2]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2.5" y="3" width="9" height="8" rx="1.2" />
              <path d="M4.5 8 6.5 6l2 1.8 1.5-1.5M12.5 10v3.5M10.8 11.8h3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">
              Add order on {symbol} at {menu.formattedPrice}...
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[#787e8d]">⇧T</span>
        </button>

        <div className={SEP_CLS} />

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onToggleLockCursor();
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5">
            <span className="w-3.5 text-center text-[11px] text-sky-400">
              {lockCursorByTime ? "✓" : ""}
            </span>
            <span>Lock vertical cursor line by time</span>
          </span>
        </button>

        <div className={SEP_CLS} />

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onToggleTableView();
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5">
            <span className="w-3.5 text-center text-[11px] text-sky-400">
              {tableViewOpen ? "✓" : ""}
            </span>
            <span>Table view</span>
          </span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenObjectTree();
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="pl-6">Object tree</span>
        </button>

        <div
          className="relative"
          onMouseEnter={() => setTplHover(true)}
          onMouseLeave={() => setTplHover(false)}
        >
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={tplHover}
            onClick={() => setTplHover((v) => !v)}
            className={ITEM_CLS}
          >
            <span className="pl-6">Chart template</span>
            <span className="text-[11px] text-[#787e8d]">›</span>
          </button>

          {tplHover && (
            <div
              role="menu"
              aria-label="Chart templates submenu"
              className="absolute left-full top-0 ml-1 w-40 rounded-lg border border-[#2a2d38] bg-[#16181f] py-1 shadow-2xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onApplyDefaults();
                  onClose();
                }}
                className={ITEM_CLS}
              >
                <span>Apply defaults</span>
              </button>
              <div className={SEP_CLS} />
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onApplyTemplate(tpl);
                    onClose();
                  }}
                  className={ITEM_CLS}
                >
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {studiesCount > 0 && (
          <>
            <div className={SEP_CLS} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRemoveIndicators();
                onClose();
              }}
              className={ITEM_CLS}
            >
              <span className="pl-6">
                Remove {studiesCount} indicator{studiesCount === 1 ? "" : "s"}
              </span>
            </button>
          </>
        )}

        <div className={SEP_CLS} />

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
          className={ITEM_CLS}
        >
          <span className="flex items-center gap-2.5">
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-3.5 w-3.5 text-[#9aa1b2]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="9" cy="9" r="2.5" />
              <path
                d="M9 2.2v1.6M9 14.2v1.6M2.2 9h1.6M14.2 9h1.6M4.2 4.2l1.1 1.1M12.7 12.7l1.1 1.1M13.8 4.2l-1.1 1.1M5.3 12.7l-1.1 1.1"
                strokeLinecap="round"
              />
            </svg>
            <span>Settings...</span>
          </span>
        </button>
      </div>
    </>
  );
}
