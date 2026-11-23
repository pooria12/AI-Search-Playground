import type { AlgorithmId, AlgorithmOptions } from "../types";

interface Props {
  algorithm: AlgorithmId;
  options: AlgorithmOptions;
  onChange: (options: AlgorithmOptions) => void;
}

function NumberField(props: {
  label: string;
  hint: string;
  value: number | null;
  min: number;
  max?: number;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  const { label, hint, value, min, max, placeholder, onChange } = props;
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <input
        type="number"
        className="input !py-1.5 w-28 text-sm"
        min={min}
        max={max}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "") return onChange(null);
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n) && n >= min && (max === undefined || n <= max)) {
            onChange(n);
          }
        }}
      />
      <span className="text-[10px] text-slate-500 max-w-[16rem]">{hint}</span>
    </label>
  );
}

/** Parameters only some algorithms take. Renders nothing for the rest. */
export function AlgorithmOptionsPanel({ algorithm, options, onChange }: Props) {
  const set = (patch: Partial<AlgorithmOptions>) => onChange({ ...options, ...patch });

  switch (algorithm) {
    case "dls":
      return (
        <NumberField
          label="Depth limit"
          hint="Max steps from the start. Empty = start→goal Manhattan distance."
          value={options.dls_limit}
          min={0}
          placeholder="auto"
          onChange={(v) => set({ dls_limit: v })}
        />
      );
    case "iddfs":
      return (
        <NumberField
          label="Max depth"
          hint="Deepening stops here; larger values cost more events."
          value={options.iddfs_max_depth}
          min={0}
          onChange={(v) => set({ iddfs_max_depth: v ?? 0 })}
        />
      );
    case "beam_search":
      return (
        <NumberField
          label="Beam width k"
          hint="Candidates kept per level. Try 1 or 2 to see good paths get pruned."
          value={options.beam_width}
          min={1}
          max={1000}
          onChange={(v) => set({ beam_width: v ?? 1 })}
        />
      );
    case "hill_climbing":
      return (
        <NumberField
          label="Sideways moves"
          hint="Equal-heuristic moves allowed on a plateau before giving up."
          value={options.hill_climbing_sideways}
          min={0}
          max={1000}
          onChange={(v) => set({ hill_climbing_sideways: v ?? 0 })}
        />
      );
    default:
      return null;
  }
}
