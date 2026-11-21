import { describe, expect, it } from "vitest";
import { cellKey } from "../lib/cells";
import type { GridEnvironmentState } from "../types";
import { moveMarker, paint, randomWalls, resize, strokeMode } from "./AppContext";

const base = (): GridEnvironmentState => ({
  rows: 6, cols: 8,
  start: { row: 1, col: 1 }, goal: { row: 4, col: 6 },
  obstacles: new Set(), terrain: new Map(),
  movement: "four_way", corner_cutting: false,
});

describe("painting", () => {
  it("never paints over the start or goal", () => {
    // Regression: dragging across S/G used to add obstacles under them.
    const env = base();
    expect(paint(env, env.start, "wall", "add")).toBe(env);
    expect(paint(env, env.goal, "difficult", "add")).toBe(env);
  });

  it("a stroke starting on a wall erases; starting on empty draws", () => {
    let env = paint(base(), { row: 2, col: 2 }, "wall", "add");
    expect(env.obstacles.has(cellKey(2, 2))).toBe(true);
    expect(strokeMode(env, { row: 2, col: 2 }, "wall")).toBe("remove");
    expect(strokeMode(env, { row: 3, col: 3 }, "wall")).toBe("add");
    env = paint(env, { row: 2, col: 2 }, "wall", "remove");
    expect(env.obstacles.size).toBe(0);
  });

  it("walls and terrain are mutually exclusive on a cell", () => {
    let env = paint(base(), { row: 2, col: 2 }, "difficult", "add");
    env = paint(env, { row: 2, col: 2 }, "wall", "add");
    expect(env.terrain.has(cellKey(2, 2))).toBe(false);
    env = paint(env, { row: 2, col: 2 }, "high_cost", "add");
    expect(env.obstacles.has(cellKey(2, 2))).toBe(false);
    expect(env.terrain.get(cellKey(2, 2))).toBe("high_cost");
  });

  it("erase removes both walls and terrain", () => {
    let env = paint(base(), { row: 2, col: 2 }, "high_cost", "add");
    env = paint(env, { row: 2, col: 2 }, "erase", "remove");
    expect(env.terrain.size).toBe(0);
  });

  it("painting the same thing twice is a no-op (same object)", () => {
    const once = paint(base(), { row: 2, col: 2 }, "wall", "add");
    expect(paint(once, { row: 2, col: 2 }, "wall", "add")).toBe(once);
  });
});

describe("markers", () => {
  it("moves start/goal, clearing a wall under them", () => {
    let env = paint(base(), { row: 3, col: 3 }, "wall", "add");
    env = moveMarker(env, "start", { row: 3, col: 3 });
    expect(env.start).toEqual({ row: 3, col: 3 });
    expect(env.obstacles.size).toBe(0);
  });
  it("refuses to stack start and goal or leave the grid", () => {
    const env = base();
    expect(moveMarker(env, "start", env.goal)).toBe(env);
    expect(moveMarker(env, "goal", { row: 99, col: 0 })).toBe(env);
  });
});

describe("resize", () => {
  it("drops obstacles and terrain that fall outside the new grid", () => {
    // Regression: stale out-of-bounds cells were sent to the backend.
    let env = base();
    env = paint(env, { row: 5, col: 7 }, "wall", "add");
    env = paint(env, { row: 5, col: 6 }, "difficult", "add");
    env = paint(env, { row: 0, col: 0 }, "wall", "add");
    const small = resize(env, 4, 4);
    expect(Array.from(small.obstacles)).toEqual([cellKey(0, 0)]);
    expect(small.terrain.size).toBe(0);
  });
  it("keeps start and goal inside and distinct", () => {
    const small = resize(base(), 3, 3);
    for (const m of [small.start, small.goal]) {
      expect(m.row).toBeLessThan(3);
      expect(m.col).toBeLessThan(3);
    }
    expect(small.start).not.toEqual(small.goal);
  });
});

describe("random walls", () => {
  it("never covers the start or goal", () => {
    const env = randomWalls(base(), 1, () => 0); // every other cell a wall
    expect(env.obstacles.has(cellKey(1, 1))).toBe(false);
    expect(env.obstacles.has(cellKey(4, 6))).toBe(false);
    expect(env.obstacles.size).toBe(6 * 8 - 2);
  });
});
