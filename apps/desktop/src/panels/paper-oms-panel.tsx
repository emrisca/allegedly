import {
  BOOK_STATE_LABELS,
  formatFixedE9,
  PROVENANCE_TIER_LABELS,
  type PaperAccountSnapshot,
} from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";

export interface PaperOmsPanelProps {
  symbol: string;
  account: PaperAccountSnapshot;
  bookState: number;
  provenanceTier: number;
  onSubmitOrder: (side: "buy" | "sell", orderType: "market" | "limit") => void;
  onKillSwitch: () => void;
}

export function PaperOmsPanel({
  symbol,
  account,
  bookState,
  provenanceTier,
  onSubmitOrder,
  onKillSwitch,
}: PaperOmsPanelProps) {
  const rawPos = account.net_position_e9[symbol] ?? "0";
  const netPos = formatFixedE9(BigInt(rawPos), 3);

  return (
    <section
      aria-label="Paper execution and provenance"
      className="flex h-full w-full flex-col bg-zinc-950 p-3 text-xs text-zinc-100"
    >
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/40">
            {account.mode}
          </span>
          <span className="text-zinc-400">NET {symbol}:</span>
          <span className="font-semibold text-zinc-100">{netPos}</span>
        </div>
        <Button
          onClick={onKillSwitch}
          className="rounded border border-rose-500/40 bg-rose-950/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-200 hover:bg-rose-900"
        >
          Cancel All
        </Button>
      </div>

      <Tabs defaultValue="ticket" className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="Execution panel tabs" className="mb-2 flex gap-1">
          <TabsTab
            value="ticket"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Paper Ticket
          </TabsTab>
          <TabsTab
            value="orders"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Journal ({account.orders.length})
          </TabsTab>
          <TabsTab
            value="provenance"
            className="rounded px-2 py-1 text-[11px] text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
          >
            Provenance
          </TabsTab>
        </TabsList>

        <TabsPanel value="ticket" className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => onSubmitOrder("buy", "market")}
              className="rounded bg-emerald-600 px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-500"
            >
              BUY MKT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("sell", "market")}
              className="rounded bg-rose-600 px-2.5 py-1.5 font-mono text-xs font-semibold text-white hover:bg-rose-500"
            >
              SELL MKT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("buy", "limit")}
              className="rounded border border-emerald-700 bg-emerald-950/60 px-2.5 py-1.5 font-mono text-xs text-emerald-200 hover:bg-emerald-900/60"
            >
              BUY LMT 0.50
            </Button>
            <Button
              onClick={() => onSubmitOrder("sell", "limit")}
              className="rounded border border-rose-700 bg-rose-950/60 px-2.5 py-1.5 font-mono text-xs text-rose-200 hover:bg-rose-900/60"
            >
              SELL LMT 0.50
            </Button>
          </div>
          <p className="font-mono text-[10px] text-zinc-400">
            LIVE_ARMED = false · LocalPaperAdapter only · Zero broker network egress (ADR-0009).
          </p>
        </TabsPanel>

        <TabsPanel value="orders" className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
          {account.orders.length === 0 ? (
            <p className="py-3 text-zinc-400">No paper orders submitted yet.</p>
          ) : (
            <ul className="space-y-1">
              {account.orders.slice(0, 10).map((ord) => (
                <li
                  key={ord.order_id}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1"
                >
                  <span className={ord.side === "buy" ? "text-emerald-300" : "text-rose-300"}>
                    {ord.order_id} · {ord.side.toUpperCase()} {ord.order_type.toUpperCase()}
                  </span>
                  <span className="text-zinc-300">
                    {formatFixedE9(BigInt(ord.qty_e9), 2)} · {ord.status.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsPanel>

        <TabsPanel value="provenance" className="space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
            <span className="text-zinc-400">Active Tier</span>
            <span className="text-sky-300">{PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN"}</span>
          </div>
          <div className="flex justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
            <span className="text-zinc-400">Order Book State</span>
            <span className="text-emerald-300">{BOOK_STATE_LABELS[bookState] ?? "UNKNOWN"}</span>
          </div>
          <div className="flex justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
            <span className="text-zinc-400">Financial Math</span>
            <span className="text-zinc-200">i64 Fixed-Point (10^9) · SV-08</span>
          </div>
        </TabsPanel>
      </Tabs>
    </section>
  );
}
