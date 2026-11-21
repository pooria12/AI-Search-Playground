import type { AlgorithmDTO } from "../types";

/** Used only when the API cannot be reached, so the UI still renders. */
export const FALLBACK_ALGORITHMS: AlgorithmDTO[] = [
  { id: "bfs", name: "Breadth-First Search", abbreviation: "BFS", description: "FIFO queue, level-by-level", data_structure: "FIFO queue", optimal: "equal-cost only", complete: "finite branching" },
  { id: "dfs", name: "Depth-First Search", abbreviation: "DFS", description: "LIFO stack, depth-first expansion", data_structure: "LIFO stack", optimal: "no", complete: "finite graphs (visited set)" },
  { id: "ucs", name: "Uniform Cost Search", abbreviation: "UCS", description: "Priority queue by cumulative cost g(n)", data_structure: "min-priority queue (by g)", optimal: "yes (nonnegative costs)", complete: "yes (finite branching)" },
  { id: "dls", name: "Depth-Limited Search", abbreviation: "DLS", description: "DFS bounded by a depth limit", data_structure: "LIFO stack", optimal: "no", complete: "within limit" },
  { id: "iddfs", name: "Iterative Deepening DFS", abbreviation: "IDDFS", description: "Repeated DLS with increasing depth limits", data_structure: "LIFO stack (per iteration)", optimal: "equal-cost only", complete: "finite branching" },
  { id: "astar", name: "A* Search", abbreviation: "A*", description: "Priority queue by f(n) = g(n) + h(n)", data_structure: "min-priority queue (by f)", optimal: "yes (admissible heuristic)", complete: "yes (finite branching)" },
  { id: "greedy", name: "Greedy Best-First Search", abbreviation: "GBFS", description: "Prioritizes by h(n) only", data_structure: "min-priority queue (by h)", optimal: "no", complete: "finite graphs (closed set)" },
  { id: "ida_star", name: "Iterative Deepening A*", abbreviation: "IDA*", description: "Depth-first bounded by f = g + h threshold", data_structure: "recursion stack", optimal: "yes (admissible heuristic)", complete: "yes (finite branching)" },
  { id: "hill_climbing", name: "Hill Climbing", abbreviation: "HC", description: "Moves to best neighbor by heuristic", data_structure: "current state + neighbors", optimal: "no", complete: "no" },
  { id: "beam_search", name: "Beam Search", abbreviation: "BS", description: "Retains best k candidates per level", data_structure: "beam of k candidates", optimal: "no", complete: "no" },
  { id: "rbfs", name: "Recursive Best-First Search", abbreviation: "RBFS", description: "Recursive best-first with f-limit", data_structure: "recursion stack", optimal: "yes (admissible heuristic)", complete: "yes (finite branching)" },
];

export const DEFAULT_ALGORITHM = "astar" as const;
