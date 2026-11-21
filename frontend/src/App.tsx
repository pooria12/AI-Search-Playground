import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, BookOpen, Loader2, Play, Search } from "lucide-react";
import { AlgorithmOptionsPanel } from "./components/AlgorithmOptionsPanel";
import { AlgorithmSelector } from "./components/AlgorithmSelector";
import { ComparisonView } from "./components/ComparisonView";
import { EventInspector } from "./components/EventInspector";
import { Grid, GridLegend } from "./components/Grid";
import { PlaybackControls } from "./components/PlaybackControls";
import { StatsPanel } from "./components/StatsPanel";
import { Toolbar } from "./components/Toolbar";
import { DEFAULT_ALGORITHM, FALLBACK_ALGORITHMS } from "./constants/algorithms";
import { DEFAULT_COLS, DEFAULT_ROWS, useApp } from "./context/AppContext";
import { usePlayback } from "./hooks/usePlayback";
import { DEFAULT_OPTIONS, environmentPayload } from "./lib/payload";
import { Timeline } from "./lib/timeline";
import EducationPage from "./pages/EducationPage";
import { searchApi } from "./services/api";
import type {
  AlgorithmDTO,
  AlgorithmId,
  AlgorithmOptions,
  ComparisonResponse,
  SearchResultDTO,
  ServerConfig,
} from "./types";

type View = "playground" | "comparison" | "education";

const FALLBACK_CONFIG: ServerConfig = {
  max_grid_rows: 40,
  max_grid_cols: 60,
  default_grid_rows: DEFAULT_ROWS,
  default_grid_cols: DEFAULT_COLS,
  max_events: 20000,
};

const NAV: Array<{ id: View; label: string; icon: React.ElementType }> = [
  { id: "playground", label: "Playground", icon: Search },
  { id: "comparison", label: "Comparison", icon: BarChart3 },
  { id: "education", label: "Education", icon: BookOpen },
];

interface Run {
  result: SearchResultDTO;
  rows: number;
  cols: number;
}

export default function App() {
  const { env } = useApp();

  const [view, setView] = useState<View>("playground");
  const [algorithms, setAlgorithms] = useState<AlgorithmDTO[]>(FALLBACK_ALGORITHMS);
  const [config, setConfig] = useState<ServerConfig>(FALLBACK_CONFIG);
  const [offline, setOffline] = useState(false);
  const [algorithm, setAlgorithm] = useState<AlgorithmId>(DEFAULT_ALGORITHM);
  const [options, setOptions] = useState<AlgorithmOptions>(DEFAULT_OPTIONS);

  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comparison, setComparison] = useState<{
    data: ComparisonResponse;
    signature: string;
  } | null>(null);
  const [comparing, setComparing] = useState(false);

  /** Bumped whenever the inputs change so late responses are discarded. */
  const requestToken = useRef(0);

  // ---- bootstrap ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.all([searchApi.algorithms(), searchApi.config()])
      .then(([algos, cfg]) => {
        if (cancelled) return;
        setAlgorithms(algos);
        setConfig(cfg);
      })
      .catch(() => !cancelled && setOffline(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- invalidate results when anything they depend on changes ------------
  const inputSignature = useMemo(
    () => JSON.stringify([environmentPayload(env), options]),
    [env, options],
  );
  useEffect(() => {
    requestToken.current += 1;
    setRun(null);
    setError(null);
    setLoading(false);
  }, [inputSignature, algorithm]);

  // ---- animation ---------------------------------------------------------
  const timeline = useMemo(
    () => (run ? new Timeline(run.result.events, run.rows, run.cols) : null),
    [run],
  );
  const playback = usePlayback(timeline?.steps ?? 0);
  const { play: startPlayback } = playback;

  // Start animating as soon as a new result arrives.
  useEffect(() => {
    if (run) startPlayback();
  }, [run, startPlayback]);

  const overlay = useMemo(
    () => timeline?.frame(playback.step),
    [timeline, playback.step],
  );
  const expanding = timeline?.expanding(playback.step) ?? -1;
  const currentEvent = timeline?.eventAt(playback.step);

  // Keyboard: space = play/pause, arrows = step.
  useEffect(() => {
    if (view !== "playground") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        playback.toggle();
      } else if (e.key === "ArrowRight") playback.stepBy(e.shiftKey ? 25 : 1);
      else if (e.key === "ArrowLeft") playback.stepBy(e.shiftKey ? -25 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- actions -----------------------------------------------------------
  const handleRun = useCallback(async () => {
    const token = ++requestToken.current;
    setLoading(true);
    setError(null);
    try {
      const { result } = await searchApi.execute({
        algorithm,
        ...environmentPayload(env),
        ...options,
      });
      if (token !== requestToken.current) return; // inputs changed meanwhile
      setRun({ result, rows: env.rows, cols: env.cols });
    } catch (err) {
      if (token !== requestToken.current) return;
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (token === requestToken.current) setLoading(false);
    }
  }, [algorithm, env, options]);

  const handleCompare = useCallback(async () => {
    setComparing(true);
    setError(null);
    const signature = inputSignature;
    try {
      const data = await searchApi.comparisons({
        algorithms: algorithms.map((a) => a.id),
        ...environmentPayload(env),
        ...options,
      });
      setComparison({ data, signature });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setComparing(false);
    }
  }, [algorithms, env, options, inputSignature]);

  const selected = algorithms.find((a) => a.id === algorithm);
  const limitNote = run?.result.trace_truncated
    ? `The search finished, but its trace was longer than ${run.result.events.length.toLocaleString()} events, so the animation shows only the first part and then the result.`
    : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-charcoal-700 bg-navy-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-white">
            <Search className="w-5 h-5 text-blue-400" />
            AI Search Playground
          </div>
          <nav className="flex gap-1" aria-label="Main">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
                className={`btn !px-3 !py-1.5 gap-1.5 ${
                  view === id ? "bg-blue-500/20 text-blue-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {offline && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm px-4 py-2" role="alert">
            Could not reach the API, so the built-in algorithm list is shown. Searches will fail until the backend is running.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm px-4 py-2" role="alert">
            {error}
          </div>
        )}

        {view === "education" && <EducationPage />}

        {view === "comparison" && (
          <ComparisonView
            algorithms={algorithms}
            comparison={comparison?.data ?? null}
            loading={comparing}
            stale={!!comparison && comparison.signature !== inputSignature}
            onRun={handleCompare}
          />
        )}

        {view === "playground" && (
          <>
            <AlgorithmSelector algorithms={algorithms} selected={algorithm} onSelect={setAlgorithm} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <div className="card p-4 space-y-4">
                  <Toolbar config={config} disabled={loading} />
                  <Grid overlay={overlay} expanding={expanding} locked={loading} />
                  <GridLegend />
                  <p className="text-xs text-slate-500">
                    Drag <b className="text-emerald-400">S</b> and <b className="text-rose-400">G</b> to move them. Click or drag to draw with the selected tool.
                  </p>
                </div>

                <div className="card p-4 space-y-4">
                  <PlaybackControls playback={playback} total={timeline?.steps ?? 0} />
                  <EventInspector event={currentEvent} />
                  {limitNote && <p className="text-xs text-amber-400">{limitNote}</p>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="card p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-300">{selected?.name}</h2>
                    {selected && (
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-slate-500">Data structure</dt>
                        <dd className="text-slate-300">{selected.data_structure}</dd>
                        <dt className="text-slate-500">Optimal</dt>
                        <dd className="text-slate-300">{selected.optimal}</dd>
                        <dt className="text-slate-500">Complete</dt>
                        <dd className="text-slate-300">{selected.complete}</dd>
                      </dl>
                    )}
                  </div>
                  <AlgorithmOptionsPanel algorithm={algorithm} options={options} onChange={setOptions} />
                  <button type="button" className="btn-primary w-full gap-2" disabled={loading} onClick={handleRun}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {loading ? "Running…" : "Run search"}
                  </button>
                </div>

                {run && <StatsPanel result={run.result} />}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
