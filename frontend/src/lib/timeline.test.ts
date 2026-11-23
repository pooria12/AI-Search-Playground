import { describe, expect, it } from "vitest";
import type { EventDTO } from "../types";
import { Overlay, Timeline } from "./timeline";

let seq = 0;
const ev = (type: string, node: string, metadata: Record<string, unknown> = {}): EventDTO => ({
  seq: ++seq, type, node, parent: null, depth: 0, g: 0, h: 0, f: 0, metadata,
});

const ROWS = 3;
const COLS = 4;
const at = (frame: Uint8Array, r: number, c: number) => frame[r * COLS + c];

describe("Timeline", () => {
  it("applies events in the backend's (row,col) format", () => {
    const t = new Timeline(
      [ev("NODE_DISCOVERED", "(1,2)"), ev("NODE_EXPANDED", "(1,2)")],
      ROWS, COLS,
    );
    expect(at(t.frame(0), 1, 2)).toBe(Overlay.None);
    expect(at(t.frame(1), 1, 2)).toBe(Overlay.Frontier);
    expect(at(t.frame(2), 1, 2)).toBe(Overlay.Explored);
  });

  it("highlights the expanding node only until the next event clears it", () => {
    const t = new Timeline(
      [ev("NODE_EXPANDED", "(0,1)"), ev("NODE_EXPANDED", "(0,2)"), ev("PATH_FOUND", "(0,2)", { path: ["(0,0)", "(0,1)", "(0,2)"] })],
      ROWS, COLS,
    );
    expect(t.expanding(1)).toBe(1);
    expect(t.expanding(2)).toBe(2);
    expect(t.expanding(3)).toBe(-1);
    // Regression: expanded cells used to stay "expanding" (purple) forever.
    expect(at(t.frame(2), 0, 1)).toBe(Overlay.Explored);
  });

  it("marks the final path from PATH_FOUND metadata", () => {
    const t = new Timeline(
      [ev("NODE_EXPANDED", "(0,0)"), ev("PATH_FOUND", "(0,1)", { path: ["(0,0)", "(0,1)"] })],
      ROWS, COLS,
    );
    const f = t.frame(2);
    expect(at(f, 0, 0)).toBe(Overlay.Path);
    expect(at(f, 0, 1)).toBe(Overlay.Path);
  });

  it("marks pruned and cutoff nodes", () => {
    const t = new Timeline([ev("NODE_PRUNED", "(2,3)"), ev("CUTOFF", "(2,2)")], ROWS, COLS);
    expect(at(t.frame(2), 2, 3)).toBe(Overlay.Pruned);
    expect(at(t.frame(2), 2, 2)).toBe(Overlay.Pruned);
  });

  it("clears the board when an iteration restarts", () => {
    const t = new Timeline(
      [ev("NODE_EXPANDED", "(0,0)"), ev("ITERATION_STARTED", "(0,0)"), ev("NODE_DISCOVERED", "(1,1)")],
      ROWS, COLS,
    );
    expect(at(t.frame(1), 0, 0)).toBe(Overlay.Explored);
    expect(at(t.frame(2), 0, 0)).toBe(Overlay.None);
    expect(at(t.frame(3), 1, 1)).toBe(Overlay.Frontier);
  });

  it("ignores out-of-range or malformed nodes without throwing", () => {
    const t = new Timeline([ev("NODE_EXPANDED", "(99,99)"), ev("NODE_EXPANDED", "junk")], ROWS, COLS);
    expect(t.frame(2).every((v) => v === Overlay.None)).toBe(true);
  });

  it("gives identical frames whether stepping forward, jumping, or going back", () => {
    const events: EventDTO[] = [];
    for (let i = 0; i < 700; i++) {
      const r = i % ROWS, c = (i * 7) % COLS;
      events.push(ev(i % 3 === 0 ? "NODE_EXPANDED" : i % 3 === 1 ? "NODE_DISCOVERED" : "NODE_PRUNED", `(${r},${c})`));
      if (i === 400) events.push(ev("ITERATION_STARTED", "(0,0)"));
    }
    const sequential = new Timeline(events, ROWS, COLS);
    const fresh = () => new Timeline(events, ROWS, COLS);
    const steps = [0, 1, 127, 128, 129, 256, 401, 402, 500, events.length];
    for (const s of steps) sequential.frame(s); // walk forward
    for (const s of [...steps].reverse()) {
      expect(Array.from(sequential.frame(s))).toEqual(Array.from(fresh().frame(s)));
    }
  });

  it("returns an independent copy per call so React sees a change", () => {
    const t = new Timeline([ev("NODE_EXPANDED", "(0,0)"), ev("NODE_EXPANDED", "(0,1)")], ROWS, COLS);
    const a = t.frame(1);
    const b = t.frame(2);
    expect(a).not.toBe(b);
    expect(at(a, 0, 1)).toBe(Overlay.None); // earlier frame is not mutated later
  });

  it("clamps out-of-range steps and reports the producing event", () => {
    const events = [ev("NODE_EXPANDED", "(0,0)")];
    const t = new Timeline(events, ROWS, COLS);
    expect(t.eventAt(0)).toBeUndefined();
    expect(t.eventAt(1)).toBe(events[0]);
    expect(t.frame(999)).toEqual(t.frame(1));
    expect(t.frame(-5)).toEqual(t.frame(0));
  });
});
