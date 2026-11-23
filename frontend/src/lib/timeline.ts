import type { EventDTO } from "../types";
import { parseCell } from "./cells";

/** Per-cell search overlay states (stored one byte per cell). */
export const Overlay = {
  None: 0,
  Frontier: 1,
  Explored: 2,
  Pruned: 3,
  Path: 4,
} as const;
export type OverlayCode = (typeof Overlay)[keyof typeof Overlay];

const CHECKPOINT_EVERY = 128;

/**
 * Turns a search's event list into random-access animation frames.
 *
 * A frame is the state after applying the first `step` events (step 0 is the
 * empty frame). Frames are rebuilt from periodic checkpoints, so memory is
 * O(events / 128 × cells) rather than one full grid per event, and scrubbing
 * backwards needs no inverse events.
 */
export class Timeline {
  readonly steps: number;
  private readonly cellIndex: Int32Array; // event → cell index or -1
  private readonly highlight: Int32Array; // step → cell being expanded or -1
  private readonly checkpoints: Uint8Array[] = [];
  private cache: { step: number; frame: Uint8Array } | null = null;

  constructor(
    private readonly events: EventDTO[],
    readonly rows: number,
    readonly cols: number,
  ) {
    this.steps = events.length;
    this.cellIndex = new Int32Array(events.length);
    this.highlight = new Int32Array(events.length + 1).fill(-1);

    for (let i = 0; i < events.length; i++) {
      this.cellIndex[i] = this.toIndex(events[i].node);
    }

    const frame = new Uint8Array(rows * cols);
    this.checkpoints.push(frame.slice());
    let current = -1;
    for (let i = 0; i < events.length; i++) {
      this.apply(frame, i);
      switch (events[i].type) {
        case "NODE_EXPANDED":
          current = this.cellIndex[i];
          break;
        case "ITERATION_STARTED":
        case "PATH_FOUND":
        case "SEARCH_FAILED":
        case "EXECUTION_LIMIT_REACHED":
          current = -1;
          break;
      }
      this.highlight[i + 1] = current;
      if ((i + 1) % CHECKPOINT_EVERY === 0) this.checkpoints.push(frame.slice());
    }
  }

  private toIndex(node: string): number {
    const cell = parseCell(node);
    return this.indexOf(cell?.row, cell?.col);
  }

  private indexOf(row?: number, col?: number): number {
    if (row === undefined || col === undefined) return -1;
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return -1;
    return row * this.cols + col;
  }

  private apply(frame: Uint8Array, i: number): void {
    const ev = this.events[i];
    const idx = this.cellIndex[i];
    switch (ev.type) {
      case "NODE_DISCOVERED":
      case "NODE_ADDED_TO_FRONTIER":
        if (idx >= 0) frame[idx] = Overlay.Frontier;
        break;
      case "NODE_REMOVED_FROM_FRONTIER":
      case "NODE_EXPANDED":
        if (idx >= 0) frame[idx] = Overlay.Explored;
        break;
      case "NODE_PRUNED":
      case "CUTOFF":
        if (idx >= 0) frame[idx] = Overlay.Pruned;
        break;
      case "ITERATION_STARTED":
        // Iterative algorithms restart from scratch each pass.
        frame.fill(Overlay.None);
        break;
      case "PATH_FOUND": {
        const path = ev.metadata?.path;
        if (Array.isArray(path)) {
          for (const node of path) {
            const p = typeof node === "string" ? this.toIndex(node) : -1;
            if (p >= 0) frame[p] = Overlay.Path;
          }
        }
        break;
      }
    }
  }

  /** The overlay after `step` events (a fresh copy; safe to keep). */
  frame(step: number): Uint8Array {
    const target = Math.max(0, Math.min(step, this.steps));
    const cp = Math.floor(target / CHECKPOINT_EVERY);
    const cpStep = cp * CHECKPOINT_EVERY;

    let from: number;
    let frame: Uint8Array;
    if (this.cache && this.cache.step <= target && this.cache.step >= cpStep) {
      from = this.cache.step;
      frame = this.cache.frame; // advance in place: sequential playback
    } else {
      from = cpStep;
      frame = this.checkpoints[cp].slice();
    }
    for (let i = from; i < target; i++) this.apply(frame, i);
    this.cache = { step: target, frame };
    return frame.slice(); // fresh reference per step so React re-renders
  }

  /** Cell index (row * cols + col) being expanded after `step` events, or -1. */
  expanding(step: number): number {
    return this.highlight[Math.max(0, Math.min(step, this.steps))];
  }

  /** The event that produced the frame at `step` (undefined at step 0). */
  eventAt(step: number): EventDTO | undefined {
    return step > 0 ? this.events[Math.min(step, this.steps) - 1] : undefined;
  }
}
