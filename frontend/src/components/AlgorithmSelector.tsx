import { useCallback } from "react";
import { Play, Code, Layers, Search, GitBranch, Gauge } from "lucide-react";
import type { AlgorithmDTO, AlgorithmId } from "../types";

const ICONS: Record<AlgorithmId, React.ElementType> = {
  bfs: Search,
  dfs: GitBranch,
  ucs: Layers,
  dls: Gauge,
  iddfs: Gauge,
  astar: Search,
  greedy: Play,
  ida_star: Search,
  hill_climbing: Gauge,
  beam_search: Layers,
  rbfs: Code,
};

interface AlgorithmSelectorProps {
  algorithms: AlgorithmDTO[];
  selected: AlgorithmId;
  onSelect: (id: AlgorithmId) => void;
}

export function AlgorithmSelector({
  algorithms,
  selected,
  onSelect,
}: AlgorithmSelectorProps) {
  const handleSelect = useCallback(
    (id: AlgorithmId) => onSelect(id),
    [onSelect],
  );

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-charcoal-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          Algorithm
        </h2>
        <span className="text-xs text-slate-500">
          {algorithms.length} algorithms
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2">
        {algorithms.map((algo) => {
          const Icon = ICONS[algo.id as AlgorithmId] ?? Search;
          const active = selected === algo.id;
          return (
            <button
              key={algo.id}
              type="button"
              aria-pressed={active}
              onClick={() => handleSelect(algo.id as AlgorithmId)}
              className={`rounded-lg p-3 transition-all ${
                active
                  ? "bg-blue-500/20 border border-blue-500 text-blue-300"
                  : "bg-charcoal-900/50 border border-transparent hover:bg-charcoal-800/50 hover:border-charcoal-600 text-slate-400 hover:text-slate-300"
              }`}
              title={algo.description}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${active ? "text-blue-400" : "text-slate-500"}`} />
                <span className={`text-xs font-mono font-semibold ${active ? "text-blue-400" : "text-slate-600"}`}>
                  {algo.abbreviation}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-200 truncate">
                {algo.name}
              </div>
              <div className="text-[10px] text-slate-500 truncate leading-normal">
                {algo.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
