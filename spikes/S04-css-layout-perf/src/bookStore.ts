import { create } from 'zustand';

// Fixed-point ES book model: 100 price levels (integer ticks, 0.25 pt/tick)
export const DOM_LEVELS = 100;
export const TAPE_ROWS = 50;
export const BASE_MID_TICK = 23200; // 5800.00
export const TICK_SIZE = 0.25;

export interface TapeEntry {
  seq: number;
  timeStr: string;
  priceTick: number;
  qty: number;
  aggressor: 1 | -1; // 1 = buy, -1 = sell
}

export interface BookSnapshot {
  version: number;
  midIndex: number;
  priceTicks: Int32Array;
  bidSizes: Int32Array;
  askSizes: Int32Array;
  bidVolAtPrice: Int32Array;
  askVolAtPrice: Int32Array;
  dirtyMask: Uint8Array;
  tape: TapeEntry[];
  tapeHead: number;
  totalDeltasApplied: number;
}

export function createInitialBook(): BookSnapshot {
  const priceTicks = new Int32Array(DOM_LEVELS);
  const bidSizes = new Int32Array(DOM_LEVELS);
  const askSizes = new Int32Array(DOM_LEVELS);
  const bidVolAtPrice = new Int32Array(DOM_LEVELS);
  const askVolAtPrice = new Int32Array(DOM_LEVELS);
  const dirtyMask = new Uint8Array(DOM_LEVELS);
  const midIndex = Math.floor(DOM_LEVELS / 2);

  for (let i = 0; i < DOM_LEVELS; i++) {
    // Row 0 = highest price, row 99 = lowest price
    priceTicks[i] = BASE_MID_TICK + (midIndex - i);
    if (i < midIndex) {
      askSizes[i] = 20 + ((i * 37) % 240);
      bidSizes[i] = 0;
    } else {
      bidSizes[i] = 20 + ((i * 53) % 240);
      askSizes[i] = 0;
    }
    bidVolAtPrice[i] = 100 + ((i * 89) % 1200);
    askVolAtPrice[i] = 100 + ((i * 71) % 1200);
    dirtyMask[i] = 1;
  }

  const tape: TapeEntry[] = new Array(TAPE_ROWS);
  for (let i = 0; i < TAPE_ROWS; i++) {
    tape[i] = {
      seq: i,
      timeStr: '14:30:00.000',
      priceTick: BASE_MID_TICK,
      qty: 1 + (i % 15),
      aggressor: i % 2 === 0 ? 1 : -1,
    };
  }

  return {
    version: 0,
    midIndex,
    priceTicks,
    bidSizes,
    askSizes,
    bidVolAtPrice,
    askVolAtPrice,
    dirtyMask,
    tape,
    tapeHead: 0,
    totalDeltasApplied: 0,
  };
}

let prngState = 0x1234abcd;
function nextRand(): number {
  prngState = (Math.imul(prngState, 1664525) + 1013904223) >>> 0;
  return prngState;
}

export function applyBookDeltas(book: BookSnapshot, deltaCount: number, nowMs: number): void {
  book.dirtyMask.fill(0);
  const mid = book.midIndex;

  for (let d = 0; d < deltaCount; d++) {
    const r = nextRand();
    const row = r % DOM_LEVELS;
    const deltaQty = ((r >>> 8) % 41) - 18;

    if (row < mid) {
      book.askSizes[row] = Math.max(0, Math.min(999, book.askSizes[row] + deltaQty));
    } else {
      book.bidSizes[row] = Math.max(0, Math.min(999, book.bidSizes[row] + deltaQty));
    }
    book.dirtyMask[row] = 1;

    // 1 in 6 deltas produces an executed trade print on Time & Sales
    if ((d & 7) === 0) {
      const aggressor: 1 | -1 = (r & 1) === 0 ? 1 : -1;
      const tradeRow = aggressor === 1 ? mid - 1 : mid;
      const qty = 1 + ((r >>> 16) % 45);
      if (aggressor === 1) {
        book.askVolAtPrice[tradeRow] += qty;
      } else {
        book.bidVolAtPrice[tradeRow] += qty;
      }
      book.dirtyMask[tradeRow] = 1;

      book.tapeHead = (book.tapeHead + 1) % TAPE_ROWS;
      const sec = Math.floor(nowMs / 1000) % 60;
      const ms = Math.floor(nowMs % 1000);
      const entry = book.tape[book.tapeHead];
      entry.seq = ++book.totalDeltasApplied;
      entry.timeStr = `14:30:${sec < 10 ? '0' : ''}${sec}.${ms < 100 ? (ms < 10 ? '00' : '0') : ''}${ms}`;
      entry.priceTick = book.priceTicks[tradeRow];
      entry.qty = qty;
      entry.aggressor = aggressor;
    } else {
      book.totalDeltasApplied++;
    }
  }
  book.version++;
}

// Zustand store holding both mutable transient state (for zero-React-render subscribers) and reactive version
interface DomStoreState {
  book: BookSnapshot;
  reactiveVersion: number;
  pushBatch: (deltaCount: number, nowMs: number, triggerReact: boolean) => void;
  resetBook: () => void;
}

type TransientListener = (book: BookSnapshot) => void;
const transientListeners = new Set<TransientListener>();

export function subscribeBookTransient(fn: TransientListener): () => void {
  transientListeners.add(fn);
  return () => transientListeners.delete(fn);
}

export const useDomStore = create<DomStoreState>((set, get) => ({
  book: createInitialBook(),
  reactiveVersion: 0,
  pushBatch: (deltaCount, nowMs, triggerReact) => {
    const book = get().book;
    applyBookDeltas(book, deltaCount, nowMs);
    for (const fn of transientListeners) fn(book);
    if (triggerReact) {
      set({ reactiveVersion: book.version });
    }
  },
  resetBook: () => {
    prngState = 0x1234abcd;
    const fresh = createInitialBook();
    set({ book: fresh, reactiveVersion: 0 });
    for (const fn of transientListeners) fn(fresh);
  },
}));
