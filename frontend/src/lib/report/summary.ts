import type { SearchResultDTO } from "../../types";
import { describeLimit } from "../format";
import { ALGORITHM_NOTES } from "./algorithms";
import { analyzeTrace, type TraceFacts } from "./analyze";
import { heuristicName, num, plural } from "./format";
import { describePath, routeText, type PathStory } from "./path";
import type { Report, ReportSection, RunContext, Tone } from "./types";

const FRONTIER_LABEL: Record<RunContext["algorithm"], string> = {
  bfs: "Peak queue size",
  dfs: "Peak stack depth",
  dls: "Peak stack depth",
  iddfs: "Peak stack depth",
  ucs: "Peak priority-queue size",
  astar: "Peak priority-queue size",
  greedy: "Peak priority-queue size",
  ida_star: "Peak path length (recursion stack)",
  rbfs: "Peak stored nodes (path + child lists)",
  hill_climbing: "Neighbours examined at once",
  beam_search: "Peak beam size",
};

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((100 * part) / whole)}%` : "–";

function headline(result: SearchResultDTO, story: PathStory | null): { tone: Tone; text: string } {
  if (result.found && story) {
    return {
      tone: "success",
      text: `Found a path of ${plural(story.cells, "cell")} costing ${num(result.path_cost)}, after expanding ${plural(result.nodes_explored, "cell")}.`,
    };
  }
  if (result.termination_reason === "limit_reached") {
    return { tone: "warning", text: `Stopped early: ${describeLimit(result.limit_reason) || "a limit was reached"}.` };
  }
  return { tone: "failure", text: "No path found." };
}

function failureLines(result: SearchResultDTO, ctx: RunContext, facts: TraceFacts): string[] {
  const n = plural(result.nodes_explored, "cell");

  if (result.termination_reason === "limit_reached") {
    const lines: string[] = [];
    switch (result.limit_reason) {
      case "depth_limit":
        lines.push(
          `The depth limit${facts.limitValue !== null ? ` of ${facts.limitValue}` : ""} was reached while cells beyond it were still unexplored (${plural(facts.byType.CUTOFF ?? 0, "cutoff marker")}).`,
          "This is a cutoff, not proof that no path exists. Raise the depth limit and run again.",
        );
        break;
      case "max_depth":
        lines.push(
          `Every pass up to the maximum depth${facts.limitValue !== null ? ` (${facts.limitValue})` : ""} still left cells beyond its limit, and then the maximum was reached.`,
          "Raise the maximum depth to let the search go on.",
        );
        break;
      default:
        lines.push(
          `The ${describeLimit(result.limit_reason)} before the search could finish, after ${n} expanded.`,
          "This says nothing about whether a path exists. It only means this search needed more than the server allows.",
        );
    }
    return lines;
  }

  switch (ctx.algorithm) {
    case "hill_climbing": {
      const at = facts.endNode ?? "the last cell";
      const climbed = facts.endPath ? describePath(facts.endPath, ctx) : null;
      const trail = climbed && climbed.steps > 0
        ? [`Before stopping it climbed ${plural(climbed.steps, "move")}: ${routeText(climbed.runs)}.`]
        : [];
      if (facts.endReason === "local_optimum") {
        return [
          `It stopped at ${at}: none of its neighbours has a lower h than ${num(facts.endH)}, while the goal has h = 0.`,
          ...trail,
          "That is a local optimum. Hill climbing is incomplete, so this does not prove the goal is unreachable. A wall between here and the goal is the usual cause.",
        ];
      }
      if (facts.endReason === "plateau") {
        return [`It stopped on a plateau at ${at}: the best neighbours all have the same h (${num(facts.endH)}) and no sideways moves were left.`,
          ...trail,
          "Allowing more sideways moves can sometimes cross a plateau."];
      }
      return [`It stopped at ${at}: there was no neighbour to move to.`, ...trail];
    }
    case "beam_search":
      return [
        "The beam emptied: every candidate was pruned or had already been visited, so nothing was left to expand.",
        "Beam search is incomplete: pruning may have discarded the only route. A wider beam may find one.",
      ];
    case "iddfs":
      return [
        `A full pass finished with nothing left beyond its depth limit, so deeper limits cannot reveal any new cell. ${n} were expanded in total, and none was the goal.`,
        "With these walls the goal cannot be reached from the start.",
      ];
    default:
      return [
        `The search ran out of cells to explore: ${n} expanded, none of them the goal.`,
        "With these walls the goal cannot be reached from the start.",
      ];
  }
}

function successLines(result: SearchResultDTO, ctx: RunContext, story: PathStory): string[] {
  const lines = [
    `The route runs from (${ctx.start.row},${ctx.start.col}) to (${ctx.goal.row},${ctx.goal.col}) through ${plural(story.cells, "cell")} (${plural(story.steps, "move")}) and costs ${num(result.path_cost)}.`,
  ];
  const lb = story.lowerBound;
  if (lb > 0) {
    const ratio = result.path_cost / lb;
    lines.push(
      Math.abs(ratio - 1) < 1e-9
        ? `That equals the straight-line lower bound (${num(lb)}, ${heuristicName(ctx)}), so no route can be cheaper.`
        : `The straight-line lower bound (${heuristicName(ctx)}) is ${num(lb)}, so this route costs ${ratio.toFixed(2)}× that. The extra comes from walls, terrain and detours.`,
    );
  }
  if (result.nodes_explored > 0) {
    lines.push(
      `${plural(story.cells, "cell")} of the final route make up ${pct(story.cells, result.nodes_explored)} of the ${plural(result.nodes_explored, "expansion")}. The rest was exploration that did not end up on the route.`,
    );
  }
  return lines;
}

function pathLines(ctx: RunContext, story: PathStory, result: SearchResultDTO): string[] {
  const lines = [ALGORITHM_NOTES[ctx.algorithm].pathRecovery];
  lines.push(
    `Route: ${routeText(story.runs)}`,
    `${plural(story.straight, "straight move")}${story.diagonal ? `, ${plural(story.diagonal, "diagonal move")}` : ""}, ${plural(story.turns, "turn")}.`,
  );
  const terrainCells = story.difficultCells + story.highCostCells;
  if (terrainCells > 0) {
    const parts = [
      story.difficultCells > 0 ? `${plural(story.difficultCells, "difficult cell")} (×2)` : "",
      story.highCostCells > 0 ? `${plural(story.highCostCells, "high-cost cell")} (×5)` : "",
    ].filter(Boolean);
    lines.push(
      `Terrain: the route enters ${parts.join(" and ")}, adding ${num(story.terrainExtra)} to the cost. On flat ground the same moves would cost ${num(story.baseCost)}.`,
    );
  } else {
    lines.push(`The route crosses no costly terrain, so its cost is simply the sum of its moves (${num(story.baseCost)}).`);
  }
  if (Math.abs(story.baseCost + story.terrainExtra - result.path_cost) > 1e-6) {
    lines.push(`(The reported cost ${num(result.path_cost)} differs from this breakdown; the server's value is authoritative.)`);
  }
  return lines;
}

export function buildReport(result: SearchResultDTO, ctx: RunContext): Report {
  const notes = ALGORITHM_NOTES[ctx.algorithm];
  const facts = analyzeTrace(result.events, ctx);
  const story = result.found ? describePath(result.path, ctx) : null;
  const truncated = result.trace_truncated;
  const free = ctx.rows * ctx.cols - ctx.obstacles.size;
  const head = headline(result, story);
  const sections: ReportSection[] = [];

  // 1. outcome
  const outcome: string[] = story ? successLines(result, ctx, story) : failureLines(result, ctx, facts);
  if (truncated) {
    outcome.push(
      `Note: the trace was cut at ${result.events.length.toLocaleString()} events, so the animation and the event-based figures below cover only the first part. Totals such as expanded and generated cells come from the search itself and are complete.`,
    );
  }
  sections.push({ id: "outcome", title: story ? "Outcome" : "Why it ended this way", lines: outcome });

  // 2. how it works
  const how = [notes.strategy(ctx)];
  const st = facts.settings;
  const options: string[] = [];
  if (ctx.algorithm === "beam_search" && st.beamWidth !== null) options.push(`beam width k = ${st.beamWidth}`);
  if (ctx.algorithm === "dls" && st.depthLimit !== null) options.push(`depth limit = ${st.depthLimit}`);
  if (ctx.algorithm === "iddfs" && st.maxDepth !== null) options.push(`maximum depth = ${st.maxDepth}`);
  if (ctx.algorithm === "hill_climbing" && st.sideways !== null) options.push(`sideways moves allowed = ${st.sideways}`);
  if (options.length > 0) how.push(`Settings for this run: ${options.join(", ")}.`);
  if (ctx.movement === "eight_way") {
    how.push(`Movement: 8-way, diagonals cost √2, corner cutting ${ctx.cornerCutting ? "on (a diagonal may graze one wall corner, never squeeze between two)" : "off (a diagonal needs both side cells free)"}.`);
  }
  sections.push({ id: "how", title: `How ${ctx.algorithmName} works`, lines: how });

  // 3. how the path was found
  if (story) {
    sections.push({ id: "path", title: "How the path was found", lines: pathLines(ctx, story, result) });
  }

  // 4. effort
  const rows: string[][] = [
    ["Cells expanded", result.nodes_explored.toLocaleString()],
    ["Cells generated", result.nodes_generated.toLocaleString()],
    [FRONTIER_LABEL[ctx.algorithm], result.max_frontier_size.toLocaleString()],
    ["Deepest level reached", String(result.search_depth)],
  ];
  if (!truncated && free > 0) {
    rows.push(
      ["Distinct cells expanded", `${facts.distinctExpanded.toLocaleString()} of ${free.toLocaleString()} open (${pct(facts.distinctExpanded, free)})`],
    );
  }
  if (!truncated && facts.reExpansions > 0) {
    rows.push(["Repeated expansions", facts.reExpansions.toLocaleString()]);
  }
  if (facts.cheaperRoutes > 0) rows.push(["Cheaper routes found", facts.cheaperRoutes.toLocaleString()]);
  rows.push(
    ["Run time", `${result.execution_time_ms.toFixed(1)} ms`],
    ["Events recorded", result.events.length.toLocaleString() + (truncated ? " (truncated)" : "")],
  );
  sections.push({ id: "effort", title: "Search effort", lines: [], table: { headers: ["Measure", "Value"], rows } });

  // 5. phases
  if (facts.iterations.length > 0) {
    sections.push({
      id: "phases",
      title: ctx.algorithm === "ida_star" ? "Threshold passes" : "Deepening passes",
      lines: truncated ? ["Only the passes recorded before the trace was cut are listed."] : [],
      table: {
        headers: ["Pass", "Setting", "Cells expanded", "Result"],
        rows: facts.iterations.map((it) => [
          String(it.index), it.label, it.expanded === null ? "–" : String(it.expanded), it.outcome,
        ]),
      },
    });
  } else if (facts.levels.length > 0) {
    sections.push({
      id: "phases",
      title: "Beam levels",
      lines: truncated ? ["Only the levels recorded before the trace was cut are listed."] : [],
      table: {
        headers: ["Level", "Expanded", "Kept", "Pruned"],
        rows: facts.levels.map((l) => [String(l.level), String(l.expanded), String(l.retained), String(l.pruned)]),
      },
    });
  }

  // 6. notable moments
  const moments: string[] = [];
  const total = result.events.length;
  if (facts.goalSeenAtStep !== null && total > 0) {
    moments.push(`The goal first appeared on the frontier at event ${facts.goalSeenAtStep.toLocaleString()} of ${total.toLocaleString()} (${pct(facts.goalSeenAtStep, total)} of the way through the recorded trace).`);
  }
  if (facts.goalExpandedAtStep !== null && result.found) {
    moments.push(`It was expanded, and so accepted as the goal, at event ${facts.goalExpandedAtStep.toLocaleString()}.`);
  }
  if (ctx.algorithm === "astar" && facts.maxExpandedF !== null && !truncated) {
    moments.push(
      `The largest f among expanded cells was ${num(facts.maxExpandedF)}${result.found ? `, against a final cost of ${num(result.path_cost)}` : ""}. With a consistent heuristic A* never expands a cell whose f exceeds the optimal cost.`,
    );
  }
  if (ctx.algorithm === "ucs" && facts.maxExpandedG !== null && !truncated) {
    moments.push(`UCS expands in order of g. The last expanded cell had g = ${num(facts.maxExpandedG)}.`);
  }
  if (facts.cheaperRoutes > 0) {
    moments.push(`${plural(facts.cheaperRoutes, "time")} a cheaper route to an already-queued cell was found and its priority updated.`);
  }
  const backtracks = facts.byType.BACKTRACK ?? 0;
  if (backtracks > 0) moments.push(`${plural(backtracks, "backtrack")}: the search came back out of a dead end or an exhausted branch.`);
  const beamPruned = facts.pruneReasons.beyond_beam_width ?? 0;
  if (beamPruned > 0) moments.push(`${plural(beamPruned, "candidate")} pruned for falling outside the beam width.`);
  const thresholdPruned = facts.pruneReasons.f_exceeds_threshold ?? 0;
  if (thresholdPruned > 0) moments.push(`${plural(thresholdPruned, "cell")} pruned for exceeding the f threshold.`);
  const tableSkips = facts.pruneReasons.already_reached_cheaper ?? 0;
  if (tableSkips > 0) moments.push(`${plural(tableSkips, "repeat visit")} skipped because the cell was already reached at no greater cost in the same pass.`);
  const cutoffs = facts.byType.CUTOFF ?? 0;
  if (cutoffs > 0) moments.push(`${plural(cutoffs, "cell")} lay beyond the depth limit and were marked as cutoffs.`);
  if (moments.length > 0) sections.push({ id: "moments", title: "Notable moments", lines: moments });

  // 7. guarantee
  sections.push({ id: "guarantee", title: "What this algorithm guarantees", lines: [notes.guarantee(ctx)] });

  return { algorithm: ctx.algorithm, tone: head.tone, headline: head.text, sections };
}
