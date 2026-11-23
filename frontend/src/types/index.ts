export type AlgorithmId =
  | "bfs" | "dfs" | "ucs" | "dls" | "iddfs" | "astar"
  | "greedy" | "ida_star" | "hill_climbing" | "beam_search" | "rbfs";

export type Movement = "four_way" | "eight_way";
export type TerrainType = "difficult" | "high_cost";

export interface Cell {
  row: number;
  col: number;
}

export interface Terrain extends Cell {
  type: "normal" | TerrainType;
}

export interface EventDTO {
  seq: number;
  type: string;
  node: string;
  parent: string | null;
  depth: number;
  g: number | null;
  h: number | null;
  f: number | null;
  metadata: Record<string, unknown>;
}

export interface SearchResultDTO {
  found: boolean;
  path: string[];
  path_cost: number;
  nodes_explored: number;
  nodes_generated: number;
  execution_time_ms: number;
  max_frontier_size: number;
  search_depth: number;
  events: EventDTO[];
  termination_reason: string;
  algorithm: string;
  limit_reason: string | null;
  /** The trace hit the server's event cap; the search itself was not cut. */
  trace_truncated: boolean;
}

export interface AlgorithmDTO {
  id: AlgorithmId;
  name: string;
  abbreviation: string;
  description: string;
  data_structure: string;
  optimal: string;
  complete: string;
}

/** Environment fields shared by execute / comparison / validate requests. */
export interface EnvironmentPayload {
  start: Cell;
  goal: Cell;
  rows: number;
  cols: number;
  movement: Movement;
  corner_cutting: boolean;
  obstacles: Cell[];
  terrain: Terrain[];
}

export interface AlgorithmOptions {
  beam_width: number;
  /** null = automatic (start→goal Manhattan distance). */
  dls_limit: number | null;
  iddfs_max_depth: number;
  hill_climbing_sideways: number;
}

export type SearchExecuteRequest = EnvironmentPayload &
  AlgorithmOptions & { algorithm: AlgorithmId };

export interface SearchExecuteResponse {
  result: SearchResultDTO;
}

export type ComparisonRunRequest = EnvironmentPayload &
  AlgorithmOptions & { algorithms: AlgorithmId[] };

export interface ComparisonAlgorithmResult {
  algorithm: string;
  found: boolean;
  path_cost: number | null;
  path_length: number;
  nodes_explored: number;
  nodes_generated: number;
  execution_time_ms: number;
  max_frontier_size: number;
  search_depth: number;
  termination_reason: string;
  limit_reason: string | null;
}

export interface ComparisonResponse {
  environment: Record<string, unknown>;
  results: ComparisonAlgorithmResult[];
}

export interface ServerConfig {
  max_grid_rows: number;
  max_grid_cols: number;
  default_grid_rows: number;
  default_grid_cols: number;
  max_events: number;
}

/** Editing state of the grid (what the user has drawn). */
export interface GridEnvironmentState {
  rows: number;
  cols: number;
  start: Cell;
  goal: Cell;
  obstacles: Set<string>;
  terrain: Map<string, TerrainType>;
  movement: Movement;
  corner_cutting: boolean;
}

export type Tool = "wall" | "difficult" | "high_cost" | "erase";
