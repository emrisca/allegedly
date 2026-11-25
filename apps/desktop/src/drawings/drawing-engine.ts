export type DrawingToolKind =
  | "cursor"
  | "trendline"
  | "horizontal_ray"
  | "fib_retracement"
  | "box_zone"
  | "price_range"
  | "anchored_vwap";

export type PlacedDrawingKind = Exclude<DrawingToolKind, "cursor">;

export interface AnchorPoint {
  timeSec: number;
  /** Exact integer price in instrument ticks (SV-08 / SV-17 — zero float drift). */
  priceTick: bigint;
}

export interface DrawingObject {
  id: string;
  kind: PlacedDrawingKind;
  symbol: string;
  anchors: AnchorPoint[];
  color: string;
  label?: string;
}

export interface MagnetTarget {
  priceTick: bigint;
  source: "ohlc" | "tpo_poc" | "tpo_vah" | "tpo_val";
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const DRAWING_TOOL_META: ReadonlyArray<{
  kind: DrawingToolKind;
  label: string;
  requiredAnchors: number;
  defaultColor: string;
}> = [
  { kind: "cursor", label: "Cursor", requiredAnchors: 0, defaultColor: "#e4e4e7" },
  { kind: "trendline", label: "Trendline", requiredAnchors: 2, defaultColor: "#38bdf8" },
  { kind: "horizontal_ray", label: "H-Ray", requiredAnchors: 1, defaultColor: "#f59e0b" },
  { kind: "fib_retracement", label: "Fib", requiredAnchors: 2, defaultColor: "#a78bfa" },
  { kind: "box_zone", label: "Box", requiredAnchors: 2, defaultColor: "#34d399" },
  { kind: "price_range", label: "Range", requiredAnchors: 2, defaultColor: "#fb7185" },
  { kind: "anchored_vwap", label: "A-VWAP", requiredAnchors: 1, defaultColor: "#fbbf24" },
];

/**
 * Exact integer SV-17 magnet snap (0 sub-tick float error).
 */
export function snapTickToMagnet(
  cursorTick: bigint,
  targets: readonly MagnetTarget[],
  maxDistanceTicks: bigint,
): { snappedTick: bigint; target: MagnetTarget | null } {
  let bestTarget: MagnetTarget | null = null;
  let bestDist = maxDistanceTicks + 1n;

  for (const t of targets) {
    const diff = t.priceTick >= cursorTick ? t.priceTick - cursorTick : cursorTick - t.priceTick;
    if (diff <= maxDistanceTicks && diff < bestDist) {
      bestDist = diff;
      bestTarget = t;
    }
  }

  return bestTarget
    ? { snappedTick: bestTarget.priceTick, target: bestTarget }
    : { snappedTick: cursorTick, target: null };
}

type HistoryAction =
  | { type: "add"; drawing: DrawingObject }
  | { type: "delete"; drawing: DrawingObject; index: number }
  | { type: "move"; id: string; before: AnchorPoint[]; after: AnchorPoint[] }
  | { type: "clear"; previous: DrawingObject[] };

/**
 * Deterministic clean-room Drawing Engine with full Undo/Redo command stack
 * and .atanalysis.toml persistence (E06 / SV-17).
 */
export class DrawingEngine {
  private drawings: DrawingObject[] = [];
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private idCounter = 0;

  public list(symbol?: string): readonly DrawingObject[] {
    return symbol ? this.drawings.filter((d) => d.symbol === symbol) : this.drawings;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public add(
    kind: PlacedDrawingKind,
    symbol: string,
    anchors: AnchorPoint[],
    color?: string,
    label?: string,
  ): DrawingObject {
    const meta = DRAWING_TOOL_META.find((m) => m.kind === kind);
    const drawing: DrawingObject = {
      id: `drw-${++this.idCounter}`,
      kind,
      symbol,
      anchors: anchors.map((a) => ({ ...a })),
      color: color ?? meta?.defaultColor ?? "#38bdf8",
      label,
    };
    this.drawings.push(drawing);
    this.undoStack.push({ type: "add", drawing });
    this.redoStack.length = 0;
    return drawing;
  }

  public move(id: string, nextAnchors: AnchorPoint[]): boolean {
    const target = this.drawings.find((d) => d.id === id);
    if (!target) return false;
    const before = target.anchors.map((a) => ({ ...a }));
    const after = nextAnchors.map((a) => ({ ...a }));
    target.anchors = after;
    this.undoStack.push({ type: "move", id, before, after });
    this.redoStack.length = 0;
    return true;
  }

  public remove(id: string): boolean {
    const index = this.drawings.findIndex((d) => d.id === id);
    if (index === -1) return false;
    const [removed] = this.drawings.splice(index, 1);
    this.undoStack.push({ type: "delete", drawing: removed, index });
    this.redoStack.length = 0;
    return true;
  }

  public clear(symbol?: string): void {
    const prev = this.drawings.map((d) => ({ ...d, anchors: d.anchors.map((a) => ({ ...a })) }));
    if (symbol) {
      this.drawings = this.drawings.filter((d) => d.symbol !== symbol);
    } else {
      this.drawings = [];
    }
    this.undoStack.push({ type: "clear", previous: prev });
    this.redoStack.length = 0;
  }

  public undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;
    switch (action.type) {
      case "add":
        this.drawings = this.drawings.filter((d) => d.id !== action.drawing.id);
        break;
      case "delete":
        this.drawings.splice(action.index, 0, action.drawing);
        break;
      case "move": {
        const d = this.drawings.find((x) => x.id === action.id);
        if (d) d.anchors = action.before.map((a) => ({ ...a }));
        break;
      }
      case "clear":
        this.drawings = action.previous.map((d) => ({
          ...d,
          anchors: d.anchors.map((a) => ({ ...a })),
        }));
        break;
    }
    this.redoStack.push(action);
    return true;
  }

  public redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;
    switch (action.type) {
      case "add":
        this.drawings.push(action.drawing);
        break;
      case "delete":
        this.drawings.splice(action.index, 1);
        break;
      case "move": {
        const d = this.drawings.find((x) => x.id === action.id);
        if (d) d.anchors = action.after.map((a) => ({ ...a }));
        break;
      }
      case "clear":
        this.drawings = [];
        break;
    }
    this.undoStack.push(action);
    return true;
  }

  /**
   * Canonical `.atanalysis.toml` deterministic serializer (ADR-0001 / SV-07).
   */
  public toAtAnalysisToml(): string {
    const lines: string[] = [
      'schema_version = "allegedly.analysis.v1"',
      "",
    ];
    for (const d of this.drawings) {
      lines.push("[[drawings]]");
      lines.push(`id = "${escapeToml(d.id)}"`);
      lines.push(`kind = "${d.kind}"`);
      lines.push(`symbol = "${escapeToml(d.symbol)}"`);
      lines.push(`color = "${escapeToml(d.color)}"`);
      if (d.label) {
        lines.push(`label = "${escapeToml(d.label)}"`);
      }
      const anchorStrs = d.anchors.map(
        (a) => `{ time_sec = ${a.timeSec}, price_tick = "${a.priceTick.toString()}" }`,
      );
      lines.push(`anchors = [${anchorStrs.join(", ")}]`);
      lines.push("");
    }
    return lines.join("\n");
  }

  /**
   * Loads drawings from canonical `.atanalysis.toml`.
   */
  public loadFromAtAnalysisToml(toml: string): number {
    const parsed: DrawingObject[] = [];
    const blocks = toml.split("[[drawings]]").slice(1);
    for (const block of blocks) {
      const id = matchTomlStr(block, "id");
      const kind = matchTomlStr(block, "kind") as PlacedDrawingKind | null;
      const symbol = matchTomlStr(block, "symbol");
      const color = matchTomlStr(block, "color") ?? "#38bdf8";
      const label = matchTomlStr(block, "label") ?? undefined;
      if (!id || !kind || !symbol) continue;

      const anchors: AnchorPoint[] = [];
      const anchorRegex = /\{\s*time_sec\s*=\s*(-?\d+)\s*,\s*price_tick\s*=\s*"(-?\d+)"\s*\}/g;
      for (const m of block.matchAll(anchorRegex)) {
        anchors.push({
          timeSec: Number.parseInt(m[1], 10),
          priceTick: BigInt(m[2]),
        });
      }
      parsed.push({ id, kind, symbol, color, label, anchors });
    }
    this.drawings = parsed;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.idCounter = parsed.length;
    return parsed.length;
  }
}

function escapeToml(s: string): string {
  return s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function matchTomlStr(block: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m");
  const m = block.match(re);
  return m ? m[1] : null;
}
