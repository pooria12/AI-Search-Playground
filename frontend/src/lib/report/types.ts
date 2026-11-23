import type { AlgorithmId, Cell, Movement, TerrainType } from "../../types";

/** Everything about the finished run that a report needs besides the result. */
export interface RunContext {
  algorithm: AlgorithmId;
  algorithmName: string;
  rows: number;
  cols: number;
  start: Cell;
  goal: Cell;
  movement: Movement;
  cornerCutting: boolean;
  /** "row,col" keys. */
  obstacles: Set<string>;
  terrain: Map<string, TerrainType>;
}

export type Tone = "success" | "warning" | "failure";

export interface ReportTable {
  headers: string[];
  rows: string[][];
}

export interface ReportSection {
  id: string;
  title: string;
  lines: string[];
  table?: ReportTable;
}

export interface Report {
  algorithm: AlgorithmId;
  tone: Tone;
  headline: string;
  sections: ReportSection[];
}
