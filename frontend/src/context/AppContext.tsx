import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cellKey } from "../lib/cells";
import { loadEnvironment, saveEnvironment } from "../lib/storage";
import type {
  Cell,
  GridEnvironmentState,
  Movement,
  Tool,
  TerrainType,
} from "../types";

export const DEFAULT_ROWS = 15;
export const DEFAULT_COLS = 20;

// Default server limits, used to validate a saved grid before /api/config loads.
// The server still re-validates every request.
const SAVED_MAX_ROWS = 40;
const SAVED_MAX_COLS = 60;

function initialEnvironment(): GridEnvironmentState {
  return loadEnvironment(SAVED_MAX_ROWS, SAVED_MAX_COLS) ?? defaultEnvironment();
}

function defaultEnvironment(): GridEnvironmentState {
  return {
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    start: { row: 7, col: 2 },
    goal: { row: 7, col: DEFAULT_COLS - 3 },
    obstacles: new Set(),
    terrain: new Map(),
    movement: "four_way",
    corner_cutting: false,
  };
}

const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;

/** Pure helpers: every edit returns a new state (or the same one if a no-op). */

export function paint(
  env: GridEnvironmentState,
  cell: Cell,
  tool: Tool,
  /** Whether a drag stroke adds or removes (decided by the first cell). */
  mode: "add" | "remove",
): GridEnvironmentState {
  if (sameCell(cell, env.start) || sameCell(cell, env.goal)) return env;
  const key = cellKey(cell.row, cell.col);

  if (tool === "erase" || mode === "remove") {
    if (!env.obstacles.has(key) && !env.terrain.has(key)) return env;
    const obstacles = new Set(env.obstacles);
    const terrain = new Map(env.terrain);
    // A "remove" stroke only removes what its tool paints; erase removes all.
    if (tool === "erase" || tool === "wall") obstacles.delete(key);
    if (tool === "erase" || terrain.get(key) === tool) terrain.delete(key);
    return { ...env, obstacles, terrain };
  }

  if (tool === "wall") {
    if (env.obstacles.has(key)) return env;
    const obstacles = new Set(env.obstacles).add(key);
    const terrain = new Map(env.terrain);
    terrain.delete(key); // a wall has no travel cost
    return { ...env, obstacles, terrain };
  }

  const type: TerrainType = tool;
  if (env.terrain.get(key) === type && !env.obstacles.has(key)) return env;
  const obstacles = new Set(env.obstacles);
  obstacles.delete(key); // painting terrain opens the cell
  return { ...env, obstacles, terrain: new Map(env.terrain).set(key, type) };
}

/** Would a stroke starting on this cell add or remove? */
export function strokeMode(
  env: GridEnvironmentState,
  cell: Cell,
  tool: Tool,
): "add" | "remove" {
  const key = cellKey(cell.row, cell.col);
  if (tool === "wall") return env.obstacles.has(key) ? "remove" : "add";
  if (tool === "erase") return "remove";
  return env.terrain.get(key) === tool ? "remove" : "add";
}

export function moveMarker(
  env: GridEnvironmentState,
  marker: "start" | "goal",
  cell: Cell,
): GridEnvironmentState {
  const other = marker === "start" ? env.goal : env.start;
  if (sameCell(cell, other) || sameCell(cell, env[marker])) return env;
  if (cell.row < 0 || cell.row >= env.rows || cell.col < 0 || cell.col >= env.cols) {
    return env;
  }
  const key = cellKey(cell.row, cell.col);
  const obstacles = new Set(env.obstacles);
  obstacles.delete(key); // markers always sit on open ground
  return { ...env, obstacles, [marker]: cell };
}

export function resize(
  env: GridEnvironmentState,
  rows: number,
  cols: number,
): GridEnvironmentState {
  const clamp = (c: Cell): Cell => ({
    row: Math.min(c.row, rows - 1),
    col: Math.min(c.col, cols - 1),
  });
  let start = clamp(env.start);
  let goal = clamp(env.goal);
  if (sameCell(start, goal)) {
    // Shrinking collapsed them onto one cell: nudge the goal to a free corner.
    goal = sameCell(start, { row: rows - 1, col: cols - 1 })
      ? { row: 0, col: 0 }
      : { row: rows - 1, col: cols - 1 };
  }
  const inside = (key: string) => {
    const [r, c] = key.split(",").map(Number);
    return r < rows && c < cols;
  };
  const obstacles = new Set(Array.from(env.obstacles).filter(inside));
  const terrain = new Map(Array.from(env.terrain).filter(([k]) => inside(k)));
  obstacles.delete(cellKey(start.row, start.col));
  obstacles.delete(cellKey(goal.row, goal.col));
  return { ...env, rows, cols, start, goal, obstacles, terrain };
}

export function randomWalls(
  env: GridEnvironmentState,
  density = 0.25,
  rand: () => number = Math.random,
): GridEnvironmentState {
  const obstacles = new Set<string>();
  for (let r = 0; r < env.rows; r++) {
    for (let c = 0; c < env.cols; c++) {
      const cell = { row: r, col: c };
      if (sameCell(cell, env.start) || sameCell(cell, env.goal)) continue;
      if (rand() < density) obstacles.add(cellKey(r, c));
    }
  }
  const terrain = new Map(
    Array.from(env.terrain).filter(([k]) => !obstacles.has(k)),
  );
  return { ...env, obstacles, terrain };
}

export function randomTerrain(
  env: GridEnvironmentState,
  rand: () => number = Math.random,
): GridEnvironmentState {
  const terrain = new Map<string, TerrainType>();
  for (let r = 0; r < env.rows; r++) {
    for (let c = 0; c < env.cols; c++) {
      const key = cellKey(r, c);
      if (env.obstacles.has(key)) continue;
      const roll = rand();
      if (roll < 0.15) terrain.set(key, "difficult");
      else if (roll < 0.22) terrain.set(key, "high_cost");
    }
  }
  return { ...env, terrain };
}

interface AppContextValue {
  env: GridEnvironmentState;
  tool: Tool;
  setTool: (tool: Tool) => void;
  /** Apply an edit function to the environment. */
  edit: (fn: (env: GridEnvironmentState) => GridEnvironmentState) => void;
  setMovement: (movement: Movement) => void;
  setCornerCutting: (value: boolean) => void;
  resizeGrid: (rows: number, cols: number) => void;
  clearWalls: () => void;
  clearTerrain: () => void;
  clearAll: () => void;
  randomMaze: () => void;
  randomizeTerrain: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [env, setEnv] = useState<GridEnvironmentState>(initialEnvironment);
  const [tool, setTool] = useState<Tool>("wall");

  // Persist the drawn grid (best effort) once edits settle.
  useEffect(() => {
    const id = window.setTimeout(() => saveEnvironment(env), 400);
    return () => window.clearTimeout(id);
  }, [env]);

  const edit = useCallback(
    (fn: (e: GridEnvironmentState) => GridEnvironmentState) => setEnv(fn),
    [],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      env,
      tool,
      setTool,
      edit,
      setMovement: (movement) => setEnv((e) => ({ ...e, movement })),
      setCornerCutting: (corner_cutting) => setEnv((e) => ({ ...e, corner_cutting })),
      resizeGrid: (rows, cols) => setEnv((e) => resize(e, rows, cols)),
      clearWalls: () => setEnv((e) => ({ ...e, obstacles: new Set() })),
      clearTerrain: () => setEnv((e) => ({ ...e, terrain: new Map() })),
      clearAll: () =>
        setEnv((e) => ({ ...e, obstacles: new Set(), terrain: new Map() })),
      randomMaze: () => setEnv((e) => randomWalls(e)),
      randomizeTerrain: () => setEnv((e) => randomTerrain(e)),
    }),
    [env, tool, edit],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
