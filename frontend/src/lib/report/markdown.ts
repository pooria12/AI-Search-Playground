import type { Report } from "./types";

/** The report as Markdown, for pasting into notes or an assignment. */
export function reportToMarkdown(report: Report, title: string): string {
  const out: string[] = [`# ${title}`, "", `**${report.headline}**`, ""];
  for (const section of report.sections) {
    out.push(`## ${section.title}`, "");
    for (const line of section.lines) out.push(line.startsWith("Route: ") ? `- ${line}` : line, "");
    if (section.table) {
      const { headers, rows } = section.table;
      out.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
      for (const row of rows) out.push(`| ${row.join(" | ")} |`);
      out.push("");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
