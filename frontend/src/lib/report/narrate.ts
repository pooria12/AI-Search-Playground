import type { EventDTO } from "../../types";
import { describeLimit } from "../format";
import { heuristicName, num } from "./format";
import type { RunContext } from "./types";

const meta = (e: EventDTO, key: string): unknown => e.metadata?.[key];
const metaNum = (e: EventDTO, key: string): number | undefined => {
  const v = meta(e, key);
  return typeof v === "number" ? v : undefined;
};
const metaStr = (e: EventDTO, key: string): string | undefined => {
  const v = meta(e, key);
  return typeof v === "string" ? v : undefined;
};
const words = (s: string) => s.replace(/_/g, " ");

/** "g = 4, h = 6, f = 10" using only the values the event carries. */
function gh(e: EventDTO): string {
  const parts: string[] = [];
  if (e.g !== null) parts.push(`g = ${num(e.g)}`);
  if (e.h !== null) parts.push(`h = ${num(e.h)}`);
  if (e.f !== null && e.g !== null && e.h !== null) parts.push(`f = ${num(e.f)}`);
  return parts.join(", ");
}

function via(e: EventDTO): string {
  const action = metaStr(e, "action");
  const from = e.parent ? ` from ${e.parent}` : "";
  return action ? `${from} by moving ${words(action)}` : from;
}

function expanded(e: EventDTO, ctx: RunContext): string {
  const at = e.node;
  switch (ctx.algorithm) {
    case "bfs":
      return `Dequeued ${at}, the oldest cell in the queue (${e.depth} ${e.depth === 1 ? "step" : "steps"} from the start). If it is the goal the search ends; otherwise its unseen neighbours join the back of the queue.`;
    case "dfs":
      return `Popped ${at} from the top of the stack (depth ${e.depth}). DFS always continues from the most recently discovered cell, so it keeps diving deeper before it tries alternatives.`;
    case "ucs":
      return `Expanding ${at}: it has the smallest cost so far (g = ${num(e.g)}) of all open cells, so no cheaper route to it can exist.`;
    case "dls":
      return `Visiting ${at} at depth ${e.depth} (limit ${num(metaNum(e, "limit"))}).`;
    case "iddfs":
      return `Visiting ${at} at depth ${e.depth} during the pass with depth limit ${num(metaNum(e, "iteration_limit"))}.`;
    case "astar":
      return `Expanding ${at}: it has the lowest f = g + h = ${num(e.g)} + ${num(e.h)} = ${num(e.f)} of all open cells (g is the cost paid, h the ${heuristicName(ctx)} still to go).`;
    case "greedy":
      return `Expanding ${at}: it looks closest to the goal (h = ${num(e.h)}). Greedy ignores the cost already paid (g = ${num(e.g)}).`;
    case "ida_star":
      return `Inside the threshold f ≤ ${num(metaNum(e, "threshold"))}: expanding ${at} (${gh(e)}).`;
    case "hill_climbing":
      return `Standing on ${at} (h = ${num(e.h)}). It will look at every neighbour and move to the one with the lowest h.`;
    case "beam_search":
      return `Level ${e.depth + 1}: expanding ${at}, one of the cells kept in the beam (h = ${num(e.h)}).`;
    case "rbfs":
      return `Recursing into ${at} (f = ${num(e.f)}) with f_limit = ${num(metaNum(e, "f_limit"))}. It keeps going while this branch is no worse than the best alternative above it.`;
  }
}

function discovered(e: EventDTO, ctx: RunContext): string {
  const base = `Found ${e.node}${via(e)}`;
  switch (ctx.algorithm) {
    case "bfs":
      return `${base} and added it to the back of the queue (${gh(e)}).`;
    case "dfs":
      return `${base}. It goes on top of the stack, so it will be explored next.`;
    case "ucs":
      return `${base} and put it in the priority queue with priority g = ${num(e.g)}.`;
    case "astar":
      return `${base} and put it in the priority queue with priority f = g + h = ${num(e.g)} + ${num(e.h)} = ${num(e.f)}.`;
    case "greedy":
      return `${base} and put it in the priority queue with priority h = ${num(e.h)}.`;
    case "hill_climbing":
      return `Evaluating neighbour ${e.node}: h = ${num(e.h)}.`;
    case "beam_search":
      return `Candidate ${e.node}${via(e)} for level ${(metaNum(e, "level") ?? e.depth)} (h = ${num(e.h)}, g = ${num(e.g)}).`;
    case "rbfs":
      return `Child ${e.node}${via(e)} has backed-up f = ${num(e.f)}.`;
    default:
      return `${base} (${gh(e)}).`;
  }
}

function backtrack(e: EventDTO, ctx: RunContext): string {
  const reason = metaStr(e, "reason");
  if (ctx.algorithm === "rbfs") {
    if (reason === "best_exceeds_f_limit") {
      return `At ${e.node} the best child has f = ${num(metaNum(e, "best_f"))}, above the f_limit ${num(metaNum(e, "f_limit"))}. This branch is no longer the most promising: unwinding and handing that f back to the parent so it can try its best alternative.`;
    }
    return `Returned from ${e.node}. Its backed-up f is now ${num(metaNum(e, "backed_up_f"))}; the parent re-ranks its children with it.`;
  }
  if (ctx.algorithm === "ida_star") {
    return `Finished the subtree below ${e.node} without reaching the goal inside the threshold. Backing up to try the next neighbour.`;
  }
  return `Dead end at ${e.node}: ${reason ? words(reason) : "nothing left to try here"}. Popping back to the previous cell.`;
}

/** One plain-English sentence (or two) describing what the event means. */
export function narrate(e: EventDTO, ctx: RunContext): string {
  switch (e.type) {
    case "SEARCH_STARTED":
      if (metaStr(e, "note") === "start is goal") {
        return "The start cell is already the goal, so there is nothing to search.";
      }
      return `Starting ${ctx.algorithmName} at ${e.node}, looking for the goal at (${ctx.goal.row},${ctx.goal.col}).`;
    case "NODE_DISCOVERED":
      return discovered(e, ctx);
    case "NODE_ADDED_TO_FRONTIER": {
      const note = metaStr(e, "note");
      if (note === "cheaper_route_found") {
        return `Found a cheaper route to ${e.node}${via(e)}: g dropped to ${num(e.g)}, so its place in the queue is updated.`;
      }
      if (ctx.algorithm === "hill_climbing") {
        return note === "sideways_move"
          ? `No neighbour is better, but a sideways move is allowed: stepping to ${e.node} (same h = ${num(e.h)}).`
          : `Moved to ${e.node}, the best neighbour (h fell to ${num(e.h)}).`;
      }
      if (ctx.algorithm === "beam_search") {
        return `${e.node} stays in the beam (h = ${num(e.h)}).`;
      }
      if (ctx.algorithm === "rbfs") {
        return `Best child is ${e.node} (f = ${num(e.f)}); recursing into it with f_limit = ${num(metaNum(e, "f_limit"))}.`;
      }
      return `${e.node} joins the frontier (${gh(e)}).`;
    }
    case "NODE_REMOVED_FROM_FRONTIER":
      return `${e.node} leaves the frontier to be expanded.`;
    case "NODE_EXPANDED":
      return expanded(e, ctx);
    case "NODE_PRUNED": {
      const reason = metaStr(e, "reason");
      if (reason === "beyond_beam_width") {
        return `Pruned ${e.node} (h = ${num(e.h)}): it did not make the best ${num(metaNum(e, "beam_width"))} of this level, and it is discarded for good.`;
      }
      if (reason === "f_exceeds_threshold") {
        return `Pruned ${e.node}: f = ${num(e.f)} is above the threshold ${num(metaNum(e, "threshold"))}. That f is remembered as a candidate for the next threshold.`;
      }
      if (reason === "already_reached_cheaper") {
        return `Skipped ${e.node}: this pass already reached it at cost ${num(metaNum(e, "best_g"))}, which is no worse than g = ${num(e.g)}.`;
      }
      return `Pruned ${e.node}${reason ? `: ${words(reason)}` : ""}.`;
    }
    case "CUTOFF":
      return `Depth limit reached: ${e.node} lies beyond the limit and is not explored. Marking a cutoff.`;
    case "BACKTRACK":
      return backtrack(e, ctx);
    case "ITERATION_STARTED": {
      if (ctx.algorithm === "ida_star") {
        return `Pass ${num(metaNum(e, "iteration"))}: threshold f ≤ ${num(metaNum(e, "threshold"))}. The search restarts from the start cell.`;
      }
      return `Pass ${num(metaNum(e, "iteration"))}: depth limit ${num(metaNum(e, "depth_limit"))}. The search restarts from the start cell.`;
    }
    case "ITERATION_COMPLETED": {
      if (ctx.algorithm === "beam_search") {
        return `Level ${num(metaNum(e, "level"))} done: ${num(metaNum(e, "expanded"))} expanded, ${num(metaNum(e, "retained"))} kept, ${num(metaNum(e, "pruned"))} pruned.`;
      }
      const found = meta(e, "found") === true;
      if (found) return "This pass reached the goal.";
      return meta(e, "cutoff") === true
        ? "The pass ended without the goal, and some cells lay beyond the limit, so the next pass goes deeper."
        : "The pass ended without the goal and nothing was left beyond the limit, so deeper passes cannot help.";
    }
    case "PATH_FOUND": {
      const path = meta(e, "path");
      const cells = Array.isArray(path) ? path.length : undefined;
      return `Goal reached${cells ? `: the path has ${cells} cells` : ""}. ${ALGORITHM_PATH_HINT[ctx.algorithm]}`;
    }
    case "SEARCH_FAILED": {
      const reason = metaStr(e, "reason");
      if (ctx.algorithm === "hill_climbing") {
        if (reason === "local_optimum") {
          return `Stuck at ${e.node}: no neighbour has a lower h than ${num(e.h)}. This is a local optimum, so hill climbing gives up.`;
        }
        if (reason === "plateau") {
          return `Stuck at ${e.node}: every best neighbour has the same h (${num(e.h)}) and no sideways moves are left.`;
        }
        return `Stuck at ${e.node}: there is no neighbour to move to.`;
      }
      if (ctx.algorithm === "beam_search") {
        return "The beam is empty: every candidate was pruned or already visited, so the search ends without the goal.";
      }
      return "Nothing is left to explore and the goal was never reached.";
    }
    case "EXECUTION_LIMIT_REACHED":
      return `Stopped early: ${describeLimit(metaStr(e, "reason")) || "a limit was reached"}.`;
    default:
      return words(e.type.toLowerCase());
  }
}

const ALGORITHM_PATH_HINT: Record<RunContext["algorithm"], string> = {
  bfs: "Following the parent links back from the goal gives the route.",
  dfs: "Following the parent links back from the goal gives the route.",
  ucs: "Following the parent links back from the goal gives the cheapest route.",
  dls: "Following the parent links back from the goal gives the route.",
  iddfs: "The parent links of this pass give the route.",
  astar: "Following the parent links back from the goal gives the route.",
  greedy: "Following the parent links back from the goal gives the route.",
  ida_star: "The recursion stack at this moment is the route.",
  hill_climbing: "The route is the sequence of cells it climbed through.",
  beam_search: "The parent links of the beam cells give the route.",
  rbfs: "The recursion stack at this moment is the route.",
};
