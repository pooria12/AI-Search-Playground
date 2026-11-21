import { ChevronsLeft, ChevronsRight, Pause, Play, StepBack, StepForward } from "lucide-react";
import { SPEED_RATES, type Playback } from "../hooks/usePlayback";

export function PlaybackControls({ playback, total }: { playback: Playback; total: number }) {
  const disabled = total === 0;
  const { step, playing, speed } = playback;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost !p-2" aria-label="Back to start" disabled={disabled} onClick={playback.reset}>
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button type="button" className="btn-ghost !p-2" aria-label="Previous event" disabled={disabled} onClick={() => playback.stepBy(-1)}>
          <StepBack className="w-4 h-4" />
        </button>
        <button type="button" className="btn-primary !px-4 gap-2" disabled={disabled} onClick={playback.toggle}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? "Pause" : step >= total && total > 0 ? "Replay" : "Play"}
        </button>
        <button type="button" className="btn-ghost !p-2" aria-label="Next event" disabled={disabled} onClick={() => playback.stepBy(1)}>
          <StepForward className="w-4 h-4" />
        </button>
        <button type="button" className="btn-ghost !p-2" aria-label="Jump to end" disabled={disabled} onClick={playback.toEnd}>
          <ChevronsRight className="w-4 h-4" />
        </button>

        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          Speed
          <input
            type="range"
            min={1}
            max={SPEED_RATES.length}
            value={speed}
            onChange={(e) => playback.setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
          />
          <span className="w-16 tabular-nums text-slate-500">{SPEED_RATES[speed - 1]} ev/s</span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          className="flex-1"
          min={0}
          max={Math.max(total, 1)}
          value={step}
          disabled={disabled}
          onChange={(e) => playback.seek(Number(e.target.value))}
          aria-label="Event timeline"
        />
        <span className="text-xs tabular-nums text-slate-400 w-28 text-right">
          {step.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
