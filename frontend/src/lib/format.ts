/** Human-readable text for the backend's `limit_reason` values. */
const LIMIT_TEXT: Record<string, string> = {
  max_expanded_nodes: "expanded-node budget exhausted",
  max_generated_nodes: "generated-node budget exhausted",
  timeout: "time budget exhausted",
  depth_limit: "depth limit reached (cutoff)",
  max_depth: "maximum iterative-deepening depth reached",
  max_recursion_depth: "recursion depth exhausted",
};

export const describeLimit = (reason: string | null | undefined): string =>
  reason ? (LIMIT_TEXT[reason] ?? reason.replace(/_/g, " ")) : "";

export const humanize = (text: string): string => text.replace(/_/g, " ");

export const formatCost = (cost: number | null | undefined): string =>
  cost === null || cost === undefined ? "—" : cost.toFixed(2);

export function describeTermination(
  found: boolean,
  termination: string,
  limit: string | null,
): string {
  if (found) return "Path found";
  if (termination === "limit_reached") {
    return `Stopped: ${describeLimit(limit) || "limit reached"}`;
  }
  if (termination === "no_path") return "No path found";
  return humanize(termination);
}
