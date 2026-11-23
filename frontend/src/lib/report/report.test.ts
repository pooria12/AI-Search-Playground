import { describe, expect, it } from "vitest";
import fixtures from "../__fixtures__/runs.json";
import { cellKey } from "../cells";
import type { AlgorithmId, SearchResultDTO, TerrainType } from "../../types";
import {
  IDLE_NARRATION, buildLiveIndex, buildReport, describePath, liveAt, narrate,
  reportToMarkdown, routeText,
} from "./index";
import type { RunContext } from "./types";

interface Fixture {
  request: {
    algorithm: AlgorithmId; rows: number; cols: number;
    start: { row: number; col: number }; goal: { row: number; col: number };
    movement: "four_way" | "eight_way"; corner_cutting: boolean;
    obstacles: Array<{ row: number; col: number }>;
    terrain: Array<{ row: number; col: number; type: TerrainType }>;
  };
  result: SearchResultDTO;
}
const runs = fixtures.runs as unknown as Record<string, Fixture>;
const names = Object.keys(runs);

function contextOf(name: string): RunContext {
  const { request: r } = runs[name];
  return {
    algorithm: r.algorithm,
    algorithmName: r.algorithm.toUpperCase(),
    rows: r.rows, cols: r.cols, start: r.start, goal: r.goal,
    movement: r.movement, cornerCutting: r.corner_cutting,
    obstacles: new Set(r.obstacles.map((o) => cellKey(o.row, o.col))),
    terrain: new Map(r.terrain.map((t) => [cellKey(t.row, t.col), t.type])),
  };
}
const report = (name: string) => buildReport(runs[name].result, contextOf(name));
const text = (name: string) =>
  report(name).sections.flatMap((s) => [...s.lines, ...(s.table?.rows.flat() ?? [])]).join("\n");

describe("fixtures are real API responses", () => {
  it("cover every algorithm and the non-success outcomes", () => {
    const algos = new Set(names.map((n) => runs[n].request.algorithm));
    expect(algos.size).toBe(11);
    expect(names).toEqual(expect.arrayContaining(["bfs_no_path", "dls_cutoff", "astar_limit", "rbfs_truncated"]));
  });
});

describe("narration", () => {
  it.each(names)("%s: every event gets a clean, non-empty sentence", (name) => {
    const ctx = contextOf(name);
    for (const e of runs[name].result.events) {
      const line = narrate(e, ctx);
      expect(line.length).toBeGreaterThan(8);
      expect(line).not.toMatch(/undefined|NaN|\[object|null/);
    }
  });

  it("names the quantities that define each algorithm", () => {
    const first = (name: string, type: string) =>
      narrate(runs[name].result.events.find((e) => e.type === type)!, contextOf(name));
    expect(first("astar", "NODE_EXPANDED")).toMatch(/f = g \+ h/);
    expect(first("ucs", "NODE_EXPANDED")).toMatch(/smallest cost/);
    expect(first("greedy", "NODE_EXPANDED")).toMatch(/ignores the cost/);
    expect(first("bfs", "NODE_EXPANDED")).toMatch(/oldest cell in the queue/);
    expect(first("dfs", "NODE_EXPANDED")).toMatch(/top of the stack/);
    expect(first("rbfs", "NODE_EXPANDED")).toMatch(/f_limit/);
    expect(first("iddfs", "ITERATION_STARTED")).toMatch(/depth limit/);
    expect(first("ida_star", "ITERATION_STARTED")).toMatch(/threshold/);
    expect(first("beam_search", "NODE_PRUNED")).toMatch(/best 3 of this level/);
  });
});

describe("path story", () => {
  const found = names.filter((n) => runs[n].result.found);

  it.each(found)("%s: the breakdown rebuilds the server's cost exactly", (name) => {
    // Cross-checks the frontend's arithmetic against the backend's.
    const story = describePath(runs[name].result.path, contextOf(name))!;
    expect(story.baseCost + story.terrainExtra).toBeCloseTo(runs[name].result.path_cost, 9);
    expect(story.runs.reduce((n, r) => n + r.count, 0)).toBe(story.steps);
    expect(story.straight + story.diagonal).toBe(story.steps);
    expect(story.lowerBound).toBeLessThanOrEqual(runs[name].result.path_cost + 1e-9);
  });

  it("counts terrain cells and diagonals", () => {
    const eight = describePath(runs.astar_8way.result.path, contextOf("astar_8way"))!;
    expect(eight.diagonal).toBeGreaterThan(0);
    expect(routeText(eight.runs)).toMatch(/[↖↗↙↘]/);
  });

  it("returns null for an unparseable path", () => {
    expect(describePath(["nonsense"], contextOf("bfs"))).toBeNull();
  });
});

describe("summary report", () => {
  it.each(names)("%s: has an outcome, how-it-works, effort and guarantee", (name) => {
    const r = report(name);
    const ids = r.sections.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["outcome", "how", "effort", "guarantee"]));
    expect(r.headline.length).toBeGreaterThan(10);
    for (const s of r.sections) expect(s.lines.length + (s.table ? 1 : 0)).toBeGreaterThan(0);
    expect(text(name)).not.toMatch(/undefined|NaN|\[object/);
  });

  it("successful runs explain how the path was found, with a route", () => {
    for (const name of ["bfs", "astar", "ucs", "dfs", "greedy"]) {
      const r = report(name);
      expect(r.tone).toBe("success");
      expect(r.sections.map((s) => s.id)).toContain("path");
      expect(text(name)).toMatch(/Route: /);
    }
  });

  it("states the real search effort from the server's counters", () => {
    const rows = report("astar").sections.find((s) => s.id === "effort")!.table!.rows;
    const value = (label: string) => rows.find((r) => r[0] === label)![1];
    expect(value("Cells expanded")).toBe(String(runs.astar.result.nodes_explored));
    expect(value("Cells generated")).toBe(String(runs.astar.result.nodes_generated));
  });

  it("A* reports the f bound it observed", () => {
    expect(text("astar")).toMatch(/largest f among expanded cells was 17/i);
  });

  it("DFS says its path is not the shortest; BFS says it is", () => {
    expect(text("dfs")).toMatch(/not the shortest/);
    expect(text("bfs")).toMatch(/fewest steps/);
  });

  it("explains a failure instead of just saying 'no path'", () => {
    const none = report("bfs_no_path");
    expect(none.tone).toBe("failure");
    expect(none.sections[0].title).toBe("Why it ended this way");
    expect(text("bfs_no_path")).toMatch(/cannot be reached/);

    const hc = report("hill_climbing");
    expect(hc.tone).toBe("failure");
    expect(text("hill_climbing")).toMatch(/local optimum/);
    expect(text("hill_climbing")).toMatch(/does not prove the goal is unreachable/);
  });

  it("distinguishes a depth cutoff and a budget stop from 'no path'", () => {
    const cut = report("dls_cutoff");
    expect(cut.tone).toBe("warning");
    expect(text("dls_cutoff")).toMatch(/cutoff, not proof that no path exists/);
    expect(text("dls_cutoff")).toMatch(/depth limit of 4/);

    const budget = report("astar_limit");
    expect(budget.tone).toBe("warning");
    expect(text("astar_limit")).toMatch(/expanded-node budget/);
    expect(text("astar_limit")).toMatch(/says nothing about whether a path exists/);
  });

  it("lists every IDDFS pass and every beam level it recorded", () => {
    const pass = report("iddfs").sections.find((s) => s.id === "phases")!.table!;
    const started = runs.iddfs.result.events.filter((e) => e.type === "ITERATION_STARTED").length;
    expect(pass.rows).toHaveLength(started);
    expect(pass.rows[pass.rows.length - 1][3]).toBe("reached the goal");

    const levels = report("beam_search").sections.find((s) => s.id === "phases")!.table!;
    expect(levels.headers).toEqual(["Level", "Expanded", "Kept", "Pruned"]);
    expect(levels.rows.length).toBeGreaterThan(3);

    const ida = report("ida_star").sections.find((s) => s.id === "phases")!;
    expect(ida.title).toBe("Threshold passes");
  });

  it("warns when the trace was truncated but keeps the real totals", () => {
    const r = report("rbfs_truncated");
    expect(r.tone).toBe("success");
    expect(text("rbfs_truncated")).toMatch(/trace was cut at 401 events/);
    const rows = r.sections.find((s) => s.id === "effort")!.table!.rows;
    expect(rows.find((x) => x[0] === "Cells expanded")![1]).toBe(
      runs.rbfs_truncated.result.nodes_explored.toLocaleString(),
    );
  });

  it("uses octile wording for 8-way movement and Manhattan for 4-way", () => {
    expect(text("astar_8way")).toMatch(/octile/);
    expect(text("astar")).toMatch(/Manhattan/);
  });
});

describe("live panel", () => {
  it("is idle at step 0 and narrates the event at later steps", () => {
    const ctx = contextOf("astar");
    const { events } = runs.astar.result;
    const index = buildLiveIndex(events, ctx);
    expect(liveAt(index, events, ctx, 0, 0).narration).toBe(IDLE_NARRATION);
    const mid = liveAt(index, events, ctx, 40, 7);
    expect(mid.event).toBe(events[39]);
    expect(mid.narration).toBe(narrate(events[39], ctx));
    expect(mid.frontierNow).toBe(7);
  });

  it("cumulative counters match the trace and never decrease", () => {
    for (const name of names) {
      const ctx = contextOf(name);
      const { events } = runs[name].result;
      const index = buildLiveIndex(events, ctx);
      const last = liveAt(index, events, ctx, events.length, 0);
      expect(last.expanded).toBe(events.filter((e) => e.type === "NODE_EXPANDED").length);
      for (let i = 1; i <= events.length; i++) {
        expect(index.expanded[i]).toBeGreaterThanOrEqual(index.expanded[i - 1]);
      }
    }
    // without truncation the counter equals the search's own total
    const a = runs.astar.result;
    const ai = buildLiveIndex(a.events, contextOf("astar"));
    expect(ai.expanded[a.events.length]).toBe(a.nodes_explored);
  });

  it("tracks the pass / level label for iterative algorithms", () => {
    const ctx = contextOf("iddfs");
    const { events } = runs.iddfs.result;
    const index = buildLiveIndex(events, ctx);
    const secondPass = events.findIndex((e, i) => e.type === "ITERATION_STARTED" && i > 0 &&
      (e.metadata.iteration as number) === 2);
    expect(index.pass[secondPass + 1]).toBe("Pass 2 · depth limit 2");
    expect(index.pass[events.length]).toBeNull(); // concluded
  });

  it("clamps out-of-range steps", () => {
    const ctx = contextOf("bfs");
    const { events } = runs.bfs.result;
    const index = buildLiveIndex(events, ctx);
    expect(liveAt(index, events, ctx, 99999, 0).step).toBe(events.length);
    expect(liveAt(index, events, ctx, -3, 0).step).toBe(0);
  });
});

describe("markdown export", () => {
  it("contains the headline, sections and tables", () => {
    const md = reportToMarkdown(report("astar"), "A* report");
    expect(md).toMatch(/^# A\* report/);
    expect(md).toContain(report("astar").headline);
    expect(md).toMatch(/\| Measure \| Value \|/);
    expect(md).toMatch(/## How the path was found/);
  });
});
