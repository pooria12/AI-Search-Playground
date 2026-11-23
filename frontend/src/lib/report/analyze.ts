import type { EventDTO } from "../../types";
import { parseCell } from "../cells";
import type { RunContext } from "./types";

export interface IterationRow {
  index: number;
  label: string;
  expanded: number | null;
  outcome: string;
}

export interface LevelRow {
  level: number;
  expanded: number;
  retained: number;
  pruned: number;
}

/** Facts read off the event trace. Counts cover only the recorded events. */
export interface TraceFacts {
  byType: Record<string, number>;
  /** NODE_PRUNED events by their `reason` metadata. */
  pruneReasons: Record<string, number>;
  /** Distinct cells that were expanded at least once. */
  distinctExpanded: number;
  /** Expansions beyond the first for the same cell (iterative / recursive algorithms). */
  reExpansions: number;
  /** Frontier insertions that replaced a worse route to a queued cell. */
  cheaperRoutes: number;
  /** Event index (1-based step) when the goal first appeared / was expanded. */
  goalSeenAtStep: number | null;
  goalExpandedAtStep: number | null;
  /** Largest f (or g for UCS) among expanded cells. */
  maxExpandedF: number | null;
  maxExpandedG: number | null;
  iterations: IterationRow[];
  levels: LevelRow[];
  /** Reason carried by SEARCH_FAILED / EXECUTION_LIMIT_REACHED. */
  endReason: string | null;
  endNode: string | null;
  endH: number | null;
  limitValue: number | null;
  /** Cells visited before a failure, when the algorithm reports them (hill climbing). */
  endPath: string[] | null;
  /** Options the run started with (from SEARCH_STARTED metadata). */
  settings: { beamWidth: number | null; depthLimit: number | null; maxDepth: number | null; sideways: number | null };
}

const metaNum = (e: EventDTO, k: string): number | null => {
  const v = e.metadata?.[k];
  return typeof v === "number" ? v : null;
};

export function analyzeTrace(events: EventDTO[], ctx: RunContext): TraceFacts {
  const byType: Record<string, number> = {};
  const pruneReasons: Record<string, number> = {};
  const expandedCount = new Map<string, number>();
  let cheaperRoutes = 0;
  let goalSeenAtStep: number | null = null;
  let goalExpandedAtStep: number | null = null;
  let maxF: number | null = null;
  let maxG: number | null = null;
  const iterations: IterationRow[] = [];
  const levels: LevelRow[] = [];
  let endReason: string | null = null;
  let endNode: string | null = null;
  let endH: number | null = null;
  let limitValue: number | null = null;
  let endPath: string[] | null = null;
  const settings: TraceFacts["settings"] = { beamWidth: null, depthLimit: null, maxDepth: null, sideways: null };

  const isGoal = (node: string) => {
    const c = parseCell(node);
    return !!c && c.row === ctx.goal.row && c.col === ctx.goal.col;
  };

  events.forEach((e, i) => {
    const step = i + 1;
    byType[e.type] = (byType[e.type] ?? 0) + 1;

    if (e.type === "SEARCH_STARTED") {
      settings.beamWidth = metaNum(e, "beam_width");
      settings.depthLimit = metaNum(e, "limit");
      settings.maxDepth = metaNum(e, "max_depth");
      settings.sideways = metaNum(e, "sideways_moves");
    }
    if (e.type === "NODE_PRUNED") {
      const reason = typeof e.metadata?.reason === "string" ? e.metadata.reason : "other";
      pruneReasons[reason] = (pruneReasons[reason] ?? 0) + 1;
    }
    if (e.type === "NODE_EXPANDED") {
      expandedCount.set(e.node, (expandedCount.get(e.node) ?? 0) + 1);
      if (e.f !== null) maxF = maxF === null ? e.f : Math.max(maxF, e.f);
      if (e.g !== null) maxG = maxG === null ? e.g : Math.max(maxG, e.g);
      if (goalExpandedAtStep === null && isGoal(e.node)) goalExpandedAtStep = step;
    }
    if (
      (e.type === "NODE_DISCOVERED" || e.type === "NODE_ADDED_TO_FRONTIER") &&
      goalSeenAtStep === null && isGoal(e.node)
    ) {
      goalSeenAtStep = step;
    }
    if (e.type === "NODE_ADDED_TO_FRONTIER" && e.metadata?.note === "cheaper_route_found") {
      cheaperRoutes++;
    }

    if (e.type === "ITERATION_STARTED") {
      const limit = metaNum(e, "depth_limit");
      const threshold = metaNum(e, "threshold");
      iterations.push({
        index: metaNum(e, "iteration") ?? iterations.length + 1,
        label: limit !== null ? `depth limit ${limit}` : `f ≤ ${Number(threshold).toFixed(2).replace(/\.00$/, "")}`,
        expanded: null,
        outcome: "recorded without an end marker",
      });
    }
    if (e.type === "ITERATION_COMPLETED") {
      if (ctx.algorithm === "beam_search") {
        levels.push({
          level: metaNum(e, "level") ?? levels.length + 1,
          expanded: metaNum(e, "expanded") ?? 0,
          retained: metaNum(e, "retained") ?? 0,
          pruned: metaNum(e, "pruned") ?? 0,
        });
      } else {
        const row = iterations[iterations.length - 1];
        if (row) {
          row.expanded = metaNum(e, "nodes_expanded");
          row.outcome =
            e.metadata?.found === true ? "reached the goal"
            : e.metadata?.cutoff === true ? "cells left beyond the limit"
            : "space exhausted";
        }
      }
    }
    if (e.type === "SEARCH_FAILED" || e.type === "EXECUTION_LIMIT_REACHED") {
      const reason = e.metadata?.reason;
      endReason = typeof reason === "string" ? reason : null;
      endNode = e.node;
      endH = e.h;
      limitValue = metaNum(e, "limit") ?? metaNum(e, "max_depth");
      const path = e.metadata?.path;
      if (Array.isArray(path) && path.every((p) => typeof p === "string")) {
        endPath = path as string[];
      }
    }
  });

  let reExpansions = 0;
  expandedCount.forEach((n) => { reExpansions += n - 1; });

  return {
    byType,
    pruneReasons,
    distinctExpanded: expandedCount.size,
    reExpansions,
    cheaperRoutes,
    goalSeenAtStep,
    goalExpandedAtStep,
    maxExpandedF: maxF,
    maxExpandedG: maxG,
    iterations,
    levels,
    endReason,
    endNode,
    endH,
    limitValue,
    endPath,
    settings,
  };
}
