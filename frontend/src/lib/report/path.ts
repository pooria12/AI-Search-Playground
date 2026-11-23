import { cellKey, parseCell } from "../cells";
import { heuristicBetween } from "./format";
import type { RunContext } from "./types";

export interface RunLength {
  arrow: string;
  count: number;
}

export interface PathStory {
  cells: number;
  steps: number;
  straight: number;
  diagonal: number;
  turns: number;
  runs: RunLength[];
  /** Cells entered on difficult / high-cost terrain. */
  difficultCells: number;
  highCostCells: number;
  /** Cost added by terrain on top of plain step costs. */
  terrainExtra: number;
  /** Cost the same moves would have on flat ground. */
  baseCost: number;
  /** Optimistic straight-line estimate from start to goal. */
  lowerBound: number;
}

const ARROWS: Record<string, string> = {
  "-1,0": "↑", "1,0": "↓", "0,-1": "←", "0,1": "→",
  "-1,-1": "↖", "-1,1": "↗", "1,-1": "↙", "1,1": "↘",
};
const TERRAIN_FACTOR = { difficult: 2, high_cost: 5 } as const;

/** Break a returned path ("(r,c)" strings) into moves, turns and terrain costs. */
export function describePath(path: string[], ctx: RunContext): PathStory | null {
  const cells = path.map(parseCell);
  if (cells.some((c) => c === null) || cells.length === 0) return null;
  const pts = cells as Array<{ row: number; col: number }>;

  let straight = 0, diagonal = 0, turns = 0;
  let difficultCells = 0, highCostCells = 0;
  let baseCost = 0, terrainExtra = 0;
  const runs: RunLength[] = [];
  let prevDir = "";

  for (let i = 1; i < pts.length; i++) {
    const dr = pts[i].row - pts[i - 1].row;
    const dc = pts[i].col - pts[i - 1].col;
    const dir = `${dr},${dc}`;
    const arrow = ARROWS[dir] ?? "?";
    const isDiagonal = dr !== 0 && dc !== 0;
    if (isDiagonal) diagonal++; else straight++;
    if (prevDir && dir !== prevDir) turns++;
    prevDir = dir;

    const last = runs[runs.length - 1];
    if (last && last.arrow === arrow) last.count++;
    else runs.push({ arrow, count: 1 });

    const step = isDiagonal ? Math.SQRT2 : 1;
    const kind = ctx.terrain.get(cellKey(pts[i].row, pts[i].col));
    const factor = kind ? TERRAIN_FACTOR[kind] : 1;
    if (kind === "difficult") difficultCells++;
    if (kind === "high_cost") highCostCells++;
    baseCost += step;
    terrainExtra += step * (factor - 1);
  }

  return {
    cells: pts.length,
    steps: Math.max(0, pts.length - 1),
    straight,
    diagonal,
    turns,
    runs,
    difficultCells,
    highCostCells,
    terrainExtra,
    baseCost,
    lowerBound: heuristicBetween(ctx.start, ctx.goal, ctx.movement),
  };
}

/** "→×5 ↓×2 →×4", or the plain arrows when every run has length 1. */
export function routeText(runs: RunLength[]): string {
  return runs.map((r) => (r.count === 1 ? r.arrow : `${r.arrow}×${r.count}`)).join(" ");
}
