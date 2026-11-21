import { Loader2, Play } from "lucide-react";
import { describeLimit, formatCost } from "../lib/format";
import type { AlgorithmDTO, ComparisonResponse } from "../types";

interface Props {
  algorithms: AlgorithmDTO[];
  comparison: ComparisonResponse | null;
  loading: boolean;
  stale: boolean;
  onRun: () => void;
}

export function ComparisonView({ algorithms, comparison, loading, stale, onRun }: Props) {
  const names = new Map(algorithms.map((a) => [a.id as string, a]));
  const results = comparison?.results ?? [];
  const found = results.filter((r) => r.found && r.path_cost !== null);
  const bestCost = found.length ? Math.min(...found.map((r) => r.path_cost as number)) : null;
  const fewestExpanded = results.length ? Math.min(...results.map((r) => r.nodes_explored)) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Algorithm Comparison</h1>
          <p className="text-slate-400 text-sm">
            Runs every algorithm on the grid you drew in the Playground, with the same options.
          </p>
        </div>
        <button type="button" className="btn-primary gap-2" disabled={loading} onClick={onRun}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {comparison ? "Run again" : "Run comparison"}
        </button>
      </div>

      {stale && comparison && (
        <p className="text-xs text-amber-400" role="status">
          The grid or options changed since this comparison ran — run it again to update.
        </p>
      )}

      {!comparison ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          No comparison yet. Draw a grid in the Playground, then run the comparison.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-charcoal-700">
                <th className="p-3">Algorithm</th>
                <th className="p-3">Result</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3 text-right">Path</th>
                <th className="p-3 text-right">Expanded</th>
                <th className="p-3 text-right">Generated</th>
                <th className="p-3 text-right">Max frontier</th>
                <th className="p-3 text-right">Time (ms)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const meta = names.get(r.algorithm);
                const isBest = r.found && r.path_cost === bestCost;
                const limited = r.termination_reason === "limit_reached";
                return (
                  <tr key={r.algorithm} className="border-b border-charcoal-700/50 last:border-0">
                    <td className="p-3">
                      <span className="font-mono text-blue-400 mr-2">{meta?.abbreviation ?? r.algorithm}</span>
                      <span className="text-slate-300">{meta?.name}</span>
                    </td>
                    <td className="p-3">
                      {r.found ? (
                        <span className="text-emerald-400">found</span>
                      ) : limited ? (
                        <span className="text-amber-400" title={describeLimit(r.limit_reason)}>
                          stopped · {describeLimit(r.limit_reason)}
                        </span>
                      ) : (
                        <span className="text-rose-400">no path</span>
                      )}
                    </td>
                    <td className={`p-3 text-right font-mono tabular-nums ${isBest ? "text-emerald-400 font-semibold" : "text-slate-300"}`}>
                      {formatCost(r.path_cost)}
                      {isBest && <span className="ml-1 text-[10px]">best</span>}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-400">{r.found ? r.path_length : "—"}</td>
                    <td className={`p-3 text-right font-mono tabular-nums ${r.nodes_explored === fewestExpanded ? "text-emerald-400" : "text-slate-300"}`}>
                      {r.nodes_explored.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-400">{r.nodes_generated.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-400">{r.max_frontier_size.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-400">{r.execution_time_ms.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
