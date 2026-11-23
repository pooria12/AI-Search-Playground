import { describe, expect, it } from "vitest";
import type { GridEnvironmentState } from "../types";
import { deserializeEnvironment, serializeEnvironment } from "./storage";

const env = (): GridEnvironmentState => ({
  rows: 8, cols: 10,
  start: { row: 1, col: 1 }, goal: { row: 6, col: 8 },
  obstacles: new Set(["2,2", "3,3"]),
  terrain: new Map([["4,4", "difficult" as const]]),
  movement: "eight_way", corner_cutting: true,
});

describe("environment persistence", () => {
  it("round-trips a valid environment", () => {
    const back = deserializeEnvironment(serializeEnvironment(env()), 40, 60)!;
    expect(back.rows).toBe(8);
    expect(back.start).toEqual({ row: 1, col: 1 });
    expect(Array.from(back.obstacles).sort()).toEqual(["2,2", "3,3"]);
    expect(back.terrain.get("4,4")).toBe("difficult");
    expect(back.movement).toBe("eight_way");
    expect(back.corner_cutting).toBe(true);
  });

  it("rejects missing, corrupt, or structurally wrong data", () => {
    for (const bad of [null, "", "{", "[]", "null", '{"rows":"8"}']) {
      expect(deserializeEnvironment(bad, 40, 60)).toBeNull();
    }
  });

  it("rejects grids larger than the server allows", () => {
    expect(deserializeEnvironment(serializeEnvironment(env()), 5, 60)).toBeNull();
  });

  it("rejects out-of-bounds cells and stacked start/goal", () => {
    const base = JSON.parse(serializeEnvironment(env()));
    expect(deserializeEnvironment(JSON.stringify({ ...base, start: [99, 0] }), 40, 60)).toBeNull();
    expect(deserializeEnvironment(JSON.stringify({ ...base, goal: base.start }), 40, 60)).toBeNull();
    expect(deserializeEnvironment(JSON.stringify({ ...base, obstacles: ["50,50"] }), 40, 60)).toBeNull();
    expect(deserializeEnvironment(JSON.stringify({ ...base, terrain: [["1,1", "lava"]] }), 40, 60)).toBeNull();
  });

  it("never loads a wall under the start or goal", () => {
    const base = JSON.parse(serializeEnvironment(env()));
    const back = deserializeEnvironment(JSON.stringify({ ...base, obstacles: ["1,1", "6,8", "0,0"] }), 40, 60)!;
    expect(Array.from(back.obstacles)).toEqual(["0,0"]);
  });
});
