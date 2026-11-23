import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, ClipboardCopy, Download, FileText, Radio } from "lucide-react";
import { reportToMarkdown, type LiveSnapshot, type Report } from "../lib/report";

interface Props {
  report: Report | null;
  live: LiveSnapshot | null;
  algorithmName: string;
  /** True while the animation is running (keeps screen readers quiet). */
  playing: boolean;
}

type Tab = "live" | "summary";

const TONE_STYLES = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  failure: "border-rose-500/40 bg-rose-500/10 text-rose-300",
} as const;

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-charcoal-900/60 border border-charcoal-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-lg tabular-nums text-slate-100">{value.toLocaleString()}</div>
    </div>
  );
}

function LiveTab({ live, playing }: { live: LiveSnapshot; playing: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-blue-500/15 text-blue-300 px-2 py-0.5 font-mono">
          step {live.step.toLocaleString()} / {live.total.toLocaleString()}
        </span>
        {live.pass && (
          <span className="rounded bg-violet-500/15 text-violet-300 px-2 py-0.5 font-mono">{live.pass}</span>
        )}
      </div>

      {/* min-height keeps the layout still while the text changes every step */}
      <p
        className="text-slate-100 leading-relaxed min-h-[5rem]"
        aria-live={playing ? "off" : "polite"}
        data-testid="live-narration"
      >
        {live.narration}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Counter label="Expanded so far" value={live.expanded} />
        <Counter label="Discovered" value={live.discovered} />
        <Counter label="On frontier now" value={live.frontierNow} />
        <Counter label="Backtracks" value={live.backtracks} />
        <Counter label="Pruned / cutoff" value={live.pruned} />
      </div>
    </div>
  );
}

function SummaryTab({ report, algorithmName }: { report: Report; algorithmName: string }) {
  const [copied, setCopied] = useState(false);
  const markdown = () => reportToMarkdown(report, `${algorithmName} report`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked; the download button still works */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.algorithm}-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5" data-testid="report-summary">
      <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${TONE_STYLES[report.tone]}`} role="status">
        {report.headline}
      </div>

      {report.sections.map((section) => (
        <section key={section.id} aria-labelledby={`report-${section.id}`} className="space-y-2">
          <h3 id={`report-${section.id}`} className="text-sm font-semibold text-slate-200">
            {section.title}
          </h3>
          {section.lines.map((line, i) =>
            line.startsWith("Route: ") ? (
              <p key={i} className="font-mono text-sm text-emerald-300 bg-charcoal-900/60 rounded px-3 py-2 break-words">
                {line}
              </p>
            ) : (
              <p key={i} className="text-sm text-slate-400 leading-relaxed">{line}</p>
            ),
          )}
          {section.table && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-charcoal-700">
                    {section.table.headers.map((h) => (
                      <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row, i) => (
                    <tr key={i} className="border-b border-charcoal-700/50 last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className={`py-1.5 pr-4 ${j === 0 ? "text-slate-400" : "font-mono text-slate-200"}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="btn-secondary !px-3 !py-1.5 gap-1.5" onClick={copy}>
          {copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
        <button type="button" className="btn-ghost !px-3 !py-1.5 gap-1.5" onClick={download}>
          <Download className="w-3.5 h-3.5" /> Download .md
        </button>
      </div>
    </div>
  );
}

export function ReportPanel({ report, live, algorithmName, playing }: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const switchedFor = useRef<Report | null>(null);

  // A new run starts on the live view...
  useEffect(() => {
    setTab("live");
    switchedFor.current = null;
  }, [report]);

  // ...and moves to the summary once, when the animation reaches the end.
  useEffect(() => {
    if (!report || !live || live.total === 0) return;
    if (live.step === live.total && switchedFor.current !== report) {
      switchedFor.current = report;
      setTab("summary");
    }
  }, [report, live]);

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: "live", label: "Live", icon: Radio },
    { id: "summary", label: "Summary", icon: FileText },
  ];

  return (
    <div className="card p-4 space-y-4" aria-label="Run report">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Report</h2>
        {report && (
          <div role="tablist" aria-label="Report view" className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`btn !px-3 !py-1 gap-1.5 text-xs ${
                  tab === id ? "bg-blue-500/20 text-blue-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!report || !live ? (
        <p className="text-sm text-slate-500">
          Run a search to get its report: a live explanation of what the algorithm does at every
          step, and a summary of how it found (or failed to find) the path.
        </p>
      ) : tab === "live" ? (
        <LiveTab live={live} playing={playing} />
      ) : (
        <SummaryTab report={report} algorithmName={algorithmName} />
      )}
    </div>
  );
}
