import type { RunContext } from "./types";

/** 3 -> "3", 2.5 -> "2.50", null -> "–". */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function heuristicName(ctx: Pick<RunContext, "movement">): string {
  return ctx.movement === "eight_way"
    ? "octile distance (a diagonal step counts √2)"
    : "Manhattan distance";
}

const OCTILE_DIAGONAL = Math.SQRT2;

/** The heuristic value between two cells, as the backend defines it. */
export function heuristicBetween(
  a: { row: number; col: number },
  b: { row: number; col: number },
  movement: RunContext["movement"],
): number {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  if (movement === "eight_way") {
    return dr + dc + (OCTILE_DIAGONAL - 2) * Math.min(dr, dc);
  }
  return dr + dc;
}
