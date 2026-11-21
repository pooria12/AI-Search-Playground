import type { EventDTO } from "../types";

const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : Number.isInteger(v) ? String(v) : v.toFixed(2);

/** Shows the event behind the current animation frame. */
export function EventInspector({ event }: { event?: EventDTO }) {
  if (!event) {
    return (
      <p className="text-xs text-slate-500">
        Press play, or drag the timeline, to inspect each step of the search.
      </p>
    );
  }
  const meta = Object.entries(event.metadata ?? {}).filter(([k]) => k !== "path");
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
          {event.type}
        </span>
        <span className="font-mono text-slate-300">{event.node}</span>
        {event.parent && <span className="text-slate-500">← {event.parent}</span>}
      </div>
      <div className="flex gap-4 font-mono text-slate-400">
        <span>depth {event.depth}</span>
        <span>g {num(event.g)}</span>
        <span>h {num(event.h)}</span>
        <span>f {num(event.f)}</span>
      </div>
      {meta.length > 0 && (
        <div className="font-mono text-slate-500 break-words">
          {meta.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
