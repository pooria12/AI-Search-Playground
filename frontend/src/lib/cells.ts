import type { Cell } from "../types";

/** Key used for the editing state (Sets / Maps): "row,col". */
export const cellKey = (row: number, col: number): string => `${row},${col}`;

export function keyToCell(key: string): Cell {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

/**
 * Parse a cell identifier as the backend emits it: "(row,col)".
 * Also accepts the bare "row,col" form. Returns null for anything else
 * (the original `split(",").map(Number)` produced NaN for "(2,3)", which
 * silently blanked the whole animation).
 */
export function parseCell(text: string): Cell | null {
  const match = /^\s*\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?\s*$/.exec(text);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

export const formatCell = (cell: Cell): string => `(${cell.row},${cell.col})`;
