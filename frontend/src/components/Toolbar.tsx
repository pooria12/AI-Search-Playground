import { Eraser, Mountain, Shuffle, Square, Trash2, Waves } from "lucide-react";
import { useApp } from "../context/AppContext";
import type { Movement, ServerConfig, Tool } from "../types";

const TOOLS: Array<{ id: Tool; label: string; icon: React.ElementType; hint: string }> = [
  { id: "wall", label: "Wall", icon: Square, hint: "Blocks movement" },
  { id: "difficult", label: "Difficult ×2", icon: Waves, hint: "Entering costs 2" },
  { id: "high_cost", label: "High cost ×5", icon: Mountain, hint: "Entering costs 5" },
  { id: "erase", label: "Erase", icon: Eraser, hint: "Remove walls and terrain" },
];

interface ToolbarProps {
  config: ServerConfig;
  disabled?: boolean;
}

export function Toolbar({ config, disabled }: ToolbarProps) {
  const {
    env, tool, setTool, setMovement, setCornerCutting, resizeGrid,
    randomMaze, randomizeTerrain, clearWalls, clearTerrain,
  } = useApp();

  const onSize = (dim: "rows" | "cols", raw: string) => {
    const value = Math.round(Number(raw));
    const max = dim === "rows" ? config.max_grid_rows : config.max_grid_cols;
    if (!Number.isFinite(value) || value < 3 || value > max) return;
    resizeGrid(dim === "rows" ? value : env.rows, dim === "cols" ? value : env.cols);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Drawing tool">
        {TOOLS.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id}
            title={hint}
            disabled={disabled}
            onClick={() => setTool(id)}
            className={`btn !px-3 !py-1.5 gap-1.5 border ${
              tool === id
                ? "bg-blue-500/20 border-blue-500 text-blue-300"
                : "bg-charcoal-900/50 border-charcoal-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-xs text-slate-400">
        <label className="flex flex-col gap-1">
          Movement
          <select
            className="input !py-1.5 text-sm"
            value={env.movement}
            disabled={disabled}
            onChange={(e) => setMovement(e.target.value as Movement)}
          >
            <option value="four_way">4-way</option>
            <option value="eight_way">8-way (diagonals √2)</option>
          </select>
        </label>

        <label
          className={`flex items-center gap-2 pb-2 ${
            env.movement === "eight_way" ? "" : "opacity-40"
          }`}
          title="Allow a diagonal move to graze the corner of one wall. It still cannot squeeze between two walls."
        >
          <input
            type="checkbox"
            checked={env.corner_cutting}
            disabled={disabled || env.movement !== "eight_way"}
            onChange={(e) => setCornerCutting(e.target.checked)}
          />
          Corner cutting
        </label>

        <label className="flex flex-col gap-1">
          Rows
          <input
            type="number"
            className="input !py-1.5 w-20 text-sm"
            min={3}
            max={config.max_grid_rows}
            value={env.rows}
            disabled={disabled}
            onChange={(e) => onSize("rows", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Columns
          <input
            type="number"
            className="input !py-1.5 w-20 text-sm"
            min={3}
            max={config.max_grid_cols}
            value={env.cols}
            disabled={disabled}
            onChange={(e) => onSize("cols", e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !px-3 !py-1.5 gap-1.5" disabled={disabled} onClick={randomMaze}>
          <Shuffle className="w-3.5 h-3.5" /> Random walls
        </button>
        <button type="button" className="btn-secondary !px-3 !py-1.5 gap-1.5" disabled={disabled} onClick={randomizeTerrain}>
          <Shuffle className="w-3.5 h-3.5" /> Random terrain
        </button>
        <button type="button" className="btn-ghost !px-3 !py-1.5 gap-1.5" disabled={disabled} onClick={clearWalls}>
          <Trash2 className="w-3.5 h-3.5" /> Clear walls
        </button>
        <button type="button" className="btn-ghost !px-3 !py-1.5 gap-1.5" disabled={disabled} onClick={clearTerrain}>
          <Trash2 className="w-3.5 h-3.5" /> Clear terrain
        </button>
      </div>
    </div>
  );
}
