import type { AlgorithmId } from "../../types";
import { heuristicName } from "./format";
import type { RunContext } from "./types";

export interface AlgorithmNotes {
  /** How the algorithm works in this implementation. */
  strategy: (ctx: RunContext) => string;
  /** How the final path is obtained once the goal is reached. */
  pathRecovery: string;
  /** What it does and does not guarantee. */
  guarantee: (ctx: RunContext) => string;
}

const PARENT_LINKS =
  "Every cell remembers the cell it was reached from. When the goal is reached, the path is rebuilt by following those parent links from the goal back to the start.";

export const ALGORITHM_NOTES: Record<AlgorithmId, AlgorithmNotes> = {
  bfs: {
    strategy: () =>
      "Keeps a first-in, first-out queue and always expands the oldest waiting cell, so the search spreads outward in rings: every cell 1 step away, then 2 steps away, and so on. A cell is queued only once.",
    pathRecovery: PARENT_LINKS,
    guarantee: () =>
      "Finds a path with the fewest steps. It ignores terrain cost, so with weighted terrain or diagonal moves the fewest-steps path is not always the cheapest.",
  },
  dfs: {
    strategy: () =>
      "Keeps a last-in, first-out stack and always continues from the most recently discovered cell, so it dives as deep as it can before trying alternatives. A visited set stops it from walking in circles, and neighbours are tried in a fixed order (row by row).",
    pathRecovery:
      "The path is the chain of parent links from the goal back to the start, which is simply whatever route the dive happened to take.",
    guarantee: () =>
      "Always finishes on a finite grid and finds a path if one exists, but the path is usually long and winding, not the shortest.",
  },
  ucs: {
    strategy: () =>
      "Keeps a priority queue ordered by g, the exact cost paid so far, and always expands the cheapest open cell. If a cheaper route to a queued cell appears, that cell is re-priced.",
    pathRecovery:
      "Parent links record the cheapest route found to each cell. Following them from the goal gives the path.",
    guarantee: () =>
      "Optimal. The goal is only accepted when it is expanded, and by then no cheaper route can still be waiting in the queue.",
  },
  dls: {
    strategy: () =>
      "A depth-first search that refuses to go deeper than the depth limit. A cell is revisited only when it is reached by a strictly shorter route, so the limit never hides a goal that is within reach.",
    pathRecovery:
      "The path is the chain of parent links from the goal back to the start.",
    guarantee: () =>
      "Finds a path only if the goal lies within the depth limit, and the path is not necessarily the shortest. When cells were skipped because of the limit it reports a cutoff, which is different from 'no path'.",
  },
  iddfs: {
    strategy: () =>
      "Runs a depth-limited search again and again with limits 0, 1, 2, … Each pass starts from scratch, and the first limit that reaches the goal yields the path with the fewest steps.",
    pathRecovery:
      "On the successful pass, the parent links of that pass give the path.",
    guarantee: () =>
      "Finds the fewest-steps path like BFS while holding only one pass in memory at a time. The price is repeating the earlier passes.",
  },
  astar: {
    strategy: (ctx) =>
      `Keeps a priority queue ordered by f = g + h: the cost paid so far plus an optimistic estimate of the cost still to go. Here h is the ${heuristicName(ctx)} to the goal. Ties on f go to the cell that looks closer to the goal.`,
    pathRecovery: PARENT_LINKS,
    guarantee: () =>
      "Optimal here. The heuristic never overestimates and is consistent, so each cell is expanded at most once and no cell with f above the optimal cost is ever expanded.",
  },
  greedy: {
    strategy: (ctx) =>
      `Keeps a priority queue ordered by h only (the ${heuristicName(ctx)} to the goal) and ignores the cost already paid. It rushes toward the goal and never reopens a cell it has already expanded.`,
    pathRecovery: PARENT_LINKS,
    guarantee: () =>
      "Very fast and it finishes on a finite grid, but it is not optimal: it can be lured into long detours.",
  },
  ida_star: {
    strategy: (ctx) =>
      `A depth-first search bounded by a threshold on f = g + h (h is the ${heuristicName(ctx)}). If the goal is not reached, the threshold rises to the smallest f that exceeded it and the search restarts. A per-pass table of the cheapest g seen for each cell avoids re-walking equal-cost routes.`,
    pathRecovery:
      "The path is the recursion stack at the moment the goal is reached.",
    guarantee: () =>
      "Optimal with an admissible heuristic: the threshold rises in the smallest possible steps, so the first pass that reaches the goal does so at the optimal cost.",
  },
  hill_climbing: {
    strategy: (ctx) =>
      `Looks at all neighbours of the current cell and moves to the one with the lowest h (the ${heuristicName(ctx)} to the goal; ties go to the first cell in row order). It never looks back and stops when no neighbour is better. Sideways moves across a plateau are optional.`,
    pathRecovery: "The path is simply the cells it climbed through, in order.",
    guarantee: () =>
      "Neither complete nor optimal: it can stop at a local optimum (for example a pocket facing the goal behind a wall) even though a route exists.",
  },
  beam_search: {
    strategy: (ctx) =>
      `Expands one level at a time and keeps only the k best candidates, ranked by h (the ${heuristicName(ctx)} to the goal; ties go to lower g). Everything else is pruned for good, and a cell never joins the beam twice.`,
    pathRecovery:
      "Parent links of the cells that stayed in the beam give the path.",
    guarantee: () =>
      "Memory stays small, but it is neither complete nor optimal: pruning can throw away the only route.",
  },
  rbfs: {
    strategy: (ctx) =>
      `Best-first search in linear space (h is the ${heuristicName(ctx)}). Each recursive call receives an f_limit, the best alternative on the path above. When the best child exceeds it, the call unwinds and backs up that child's f so the parent can compare it with its alternatives.`,
    pathRecovery:
      "The path is the recursion stack at the moment the goal is reached.",
    guarantee: () =>
      "Optimal with an admissible heuristic, but it keeps no table of visited cells, so it can re-explore tied routes many times.",
  },
};
