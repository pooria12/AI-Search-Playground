import type { GridEnvironmentState, Movement, TerrainType } from "../types";
import { cellKey } from "./cells";

export const STORAGE_KEY = "ai-search-playground:environment:v1";

interface Saved {
  rows: number;
  cols: number;
  start: [number, number];
  goal: [number, number];
  obstacles: string[];
  terrain: Array<[string, TerrainType]>;
  movement: Movement;
  corner_cutting: boolean;
}

export function serializeEnvironment(env: GridEnvironmentState): string {
  const saved: Saved = {
    rows: env.rows,
    cols: env.cols,
    start: [env.start.row, env.start.col],
    goal: [env.goal.row, env.goal.col],
    obstacles: Array.from(env.obstacles),
    terrain: Array.from(env.terrain),
    movement: env.movement,
    corner_cutting: env.corner_cutting,
  };
  return JSON.stringify(saved);
}

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && isInt(v[0]) && isInt(v[1]);

/**
 * Parse a saved environment, returning null unless every field is valid and
 * inside the given limits. Saved data is untrusted: it may be stale, edited by
 * hand, or from a version with larger limits.
 */
export function deserializeEnvironment(
  text: string | null,
  maxRows: number,
  maxCols: number,
): GridEnvironmentState | null {
  if (!text) return null;
  let data: Partial<Saved>;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { rows, cols, start, goal, obstacles, terrain, movement } = data;

  if (!isInt(rows) || !isInt(cols) || rows < 3 || cols < 3) return null;
  if (rows > maxRows || cols > maxCols) return null;
  if (!isPair(start) || !isPair(goal)) return null;
  if (movement !== "four_way" && movement !== "eight_way") return null;
  if (!Array.isArray(obstacles) || !Array.isArray(terrain)) return null;

  const inBounds = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  if (!inBounds(start[0], start[1]) || !inBounds(goal[0], goal[1])) return null;
  if (start[0] === goal[0] && start[1] === goal[1]) return null;

  const parseKey = (key: unknown): [number, number] | null => {
    if (typeof key !== "string") return null;
    const m = /^(\d+),(\d+)$/.exec(key);
    return m && inBounds(Number(m[1]), Number(m[2])) ? [Number(m[1]), Number(m[2])] : null;
  };

  const wallSet = new Set<string>();
  for (const key of obstacles) {
    const cell = parseKey(key);
    if (!cell) return null;
    wallSet.add(cellKey(cell[0], cell[1]));
  }
  wallSet.delete(cellKey(start[0], start[1]));
  wallSet.delete(cellKey(goal[0], goal[1]));

  const terrainMap = new Map<string, TerrainType>();
  for (const entry of terrain) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [key, type] = entry;
    if (!parseKey(key) || (type !== "difficult" && type !== "high_cost")) return null;
    if (!wallSet.has(key as string)) terrainMap.set(key as string, type);
  }

  return {
    rows,
    cols,
    start: { row: start[0], col: start[1] },
    goal: { row: goal[0], col: goal[1] },
    obstacles: wallSet,
    terrain: terrainMap,
    movement,
    corner_cutting: data.corner_cutting === true,
  };
}

/** localStorage can throw (private mode, quota, disabled): never let it crash the app. */
export function loadEnvironment(maxRows: number, maxCols: number): GridEnvironmentState | null {
  try {
    return deserializeEnvironment(window.localStorage.getItem(STORAGE_KEY), maxRows, maxCols);
  } catch {
    return null;
  }
}

export function saveEnvironment(env: GridEnvironmentState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeEnvironment(env));
  } catch {
    /* best-effort persistence */
  }
}
