import type { EventDTO } from "../../types";
import { narrate } from "./narrate";
import type { RunContext } from "./types";

/** Cumulative counters per step, so the live panel is O(1) per frame. */
export interface LiveIndex {
  expanded: Int32Array;
  discovered: Int32Array;
  backtracks: Int32Array;
  pruned: Int32Array;
  /** Label of the pass / level in progress after each step, or null. */
  pass: Array<string | null>;
}

const metaNum = (e: EventDTO, k: string): number | null => {
  const v = e.metadata?.[k];
  return typeof v === "number" ? v : null;
};
const trim = (n: number) => Number(n.toFixed(2)).toString();

export function buildLiveIndex(events: EventDTO[], ctx: RunContext): LiveIndex {
  const n = events.length;
  const index: LiveIndex = {
    expanded: new Int32Array(n + 1),
    discovered: new Int32Array(n + 1),
    backtracks: new Int32Array(n + 1),
    pruned: new Int32Array(n + 1),
    pass: new Array<string | null>(n + 1).fill(null),
  };
  let label: string | null = null;
  for (let i = 0; i < n; i++) {
    const e = events[i];
    index.expanded[i + 1] = index.expanded[i] + (e.type === "NODE_EXPANDED" ? 1 : 0);
    index.discovered[i + 1] =
      index.discovered[i] + (e.type === "NODE_DISCOVERED" ? 1 : 0);
    index.backtracks[i + 1] = index.backtracks[i] + (e.type === "BACKTRACK" ? 1 : 0);
    index.pruned[i + 1] =
      index.pruned[i] + (e.type === "NODE_PRUNED" || e.type === "CUTOFF" ? 1 : 0);

    if (e.type === "ITERATION_STARTED") {
      const it = metaNum(e, "iteration");
      const limit = metaNum(e, "depth_limit");
      const threshold = metaNum(e, "threshold");
      label =
        limit !== null
          ? `Pass ${it ?? "?"} · depth limit ${limit}`
          : `Pass ${it ?? "?"} · threshold f ≤ ${threshold === null ? "?" : trim(threshold)}`;
    } else if (ctx.algorithm === "beam_search" && e.type === "NODE_EXPANDED") {
      label = `Level ${e.depth + 1}`;
    } else if (e.type === "PATH_FOUND" || e.type === "SEARCH_FAILED" ||
               e.type === "EXECUTION_LIMIT_REACHED") {
      label = null;
    }
    index.pass[i + 1] = label;
  }
  return index;
}

export interface LiveSnapshot {
  step: number;
  total: number;
  /** The event behind this frame, or null at step 0. */
  event: EventDTO | null;
  narration: string;
  pass: string | null;
  expanded: number;
  discovered: number;
  backtracks: number;
  pruned: number;
  /** Cells currently shown on the frontier in the grid. */
  frontierNow: number;
}

export const IDLE_NARRATION =
  "Press Play, or step forward, and this panel explains what the algorithm is doing at every step.";

export function liveAt(
  index: LiveIndex,
  events: EventDTO[],
  ctx: RunContext,
  step: number,
  frontierNow: number,
): LiveSnapshot {
  const s = Math.max(0, Math.min(step, events.length));
  const event = s > 0 ? events[s - 1] : null;
  return {
    step: s,
    total: events.length,
    event,
    narration: event ? narrate(event, ctx) : IDLE_NARRATION,
    pass: index.pass[s],
    expanded: index.expanded[s],
    discovered: index.discovered[s],
    backtracks: index.backtracks[s],
    pruned: index.pruned[s],
    frontierNow,
  };
}
