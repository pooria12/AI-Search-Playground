import { CheckCircle2, XCircle } from "lucide-react";
import { describeTermination, formatCost } from "../lib/format";
import type { SearchResultDTO } from "../types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-charcoal-700/60 last:border-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-mono text-slate-200 tabular-nums">{value}</dd>
    </div>
  );
}

export function StatsPanel({ result }: { result: SearchResultDTO }) {
  const limited = result.termination_reason === "limit_reached";
  return (
    <div className="card p-4 space-y-3">
      <div
        className={`flex items-center gap-2 text-sm font-medium ${
          result.found ? "text-emerald-400" : limited ? "text-amber-400" : "text-rose-400"
        }`}
        role="status"
      >
        {result.found ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {describeTermination(result.found, result.termination_reason, result.limit_reason)}
      </div>
      <dl>
        <Row label="Path cost" value={result.found ? formatCost(result.path_cost) : "—"} />
        <Row label="Path length (cells)" value={result.found ? result.path.length : "—"} />
        <Row label="Nodes expanded" value={result.nodes_explored.toLocaleString()} />
        <Row label="Nodes generated" value={result.nodes_generated.toLocaleString()} />
        <Row label="Max frontier" value={result.max_frontier_size.toLocaleString()} />
        <Row label="Search depth" value={result.search_depth} />
        <Row label="Events" value={result.events.length.toLocaleString()} />
        <Row label="Run time" value={`${result.execution_time_ms.toFixed(1)} ms`} />
      </dl>
    </div>
  );
}
