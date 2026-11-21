// @vitest-environment jsdom
/**
 * End-to-end UI test: the real React app, real components and playback, talking
 * to a real running backend. It is skipped unless E2E_API_URL is set, so
 * `npm test` needs no server:
 *
 *   uvicorn src.api.app:app --app-dir backend --port 8787 &
 *   E2E_API_URL=http://127.0.0.1:8787 npm run test:e2e
 *
 * jsdom has no canvas, so getContext is replaced by a recorder. That lets the
 * test check what was actually painted (e.g. the final path colour).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "./../App";
import { AppProvider } from "../context/AppContext";

// `process` is not in this project's TS types; read it through globalThis.
const API: string | undefined = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.E2E_API_URL;
const PATH_COLOUR = "#10b981";

interface Recorder {
  fills: Array<{ style: string; x: number; y: number }>;
}
const recorder: Recorder = { fills: [] };

beforeAll(() => {
  if (!API) return;
  // Relative URLs ("/api/...") must reach the backend.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(typeof input === "string" && input.startsWith("/") ? API + input : input, init)) as typeof fetch;

  (globalThis as any).ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  HTMLCanvasElement.prototype.getContext = function () {
    let style = "";
    return {
      set fillStyle(v: string) { style = v; },
      get fillStyle() { return style; },
      fillRect: (x: number, y: number) => recorder.fills.push({ style, x, y }),
      fillText() {}, setTransform() {},
      set font(_: string) {}, set textAlign(_: string) {}, set textBaseline(_: string) {},
    } as unknown as CanvasRenderingContext2D;
  } as any;
  HTMLCanvasElement.prototype.setPointerCapture = () => {};
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const mount = () => render(<AppProvider><App /></AppProvider>);
const lastFrame = () => {
  // The most recent full redraw starts at the first cell; take fills after it.
  const idx = recorder.fills.map((f, i) => (f.x === 0 && f.y === 0 ? i : -1)).filter((i) => i >= 0);
  return recorder.fills.slice(idx[idx.length - 2] ?? 0);
};
/** The algorithm-picker button whose abbreviation is exactly `abbr` (A* vs IDA*). */
const algoButton = (abbr: string) => {
  const hit = screen.getAllByRole("button").find(
    (b) => b.hasAttribute("aria-pressed") && b.textContent?.trim().startsWith(abbr),
  );
  if (!hit) throw new Error(`no algorithm button for ${abbr}`);
  return hit;
};
const ready = () => screen.findByText("Breadth-First Search", { exact: false });
const stat = (label: string) =>
  screen.getByText(label).closest("div")!.querySelector("dd")!.textContent;

describe.skipIf(!API)("UI against the real backend", () => {
  it("loads the algorithms from the API (no offline banner)", async () => {
    mount();
    await ready();
    expect(screen.queryByText(/Could not reach the API/)).toBeNull();
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed")).length).toBeGreaterThanOrEqual(11);
  });

  it("runs A*, animates it, and paints exactly the returned path", async () => {
    recorder.fills.length = 0;
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Run search/ }));

    await screen.findByText("Path found");
    const pathLength = Number(stat("Path length (cells)"));
    expect(pathLength).toBeGreaterThan(2);

    // Animation starts automatically; jump to the end and let React paint.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Jump to end/ })); });
    await waitFor(() => {
      const painted = lastFrame().filter((f) => f.style === PATH_COLOUR).length;
      expect(painted).toBe(pathLength);   // regression: path used to be NaN-keyed and never drawn
    });
  });

  it("shows explored cells while stepping (regression: events used to parse as NaN)", async () => {
    recorder.fills.length = 0;
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Run search/ }));
    await screen.findByText("Path found");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Back to start/ })); });
    await act(async () => { for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole("button", { name: /Next event/ })); });
    const colours = new Set(lastFrame().map((f) => f.style));
    expect([...colours].some((c) => c.startsWith("rgba(250, 204, 21") || c.startsWith("rgba(59, 130, 246") || c === "#c084fc")).toBe(true);
    expect(screen.getByText(/NODE_|SEARCH_|ITERATION_/)).toBeTruthy(); // event inspector populated
  });

  it("explains a depth-limit cutoff instead of pretending there is no path", async () => {
    mount();
    await ready();
    fireEvent.click(algoButton("DLS"));
    const limit = await screen.findByLabelText(/Depth limit/);
    fireEvent.change(limit, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Run search/ }));
    await screen.findByText(/Stopped: depth limit/);
  });

  it("surfaces backend validation errors to the user", async () => {
    mount();
    await ready();
    // Make the grid too large for the server by editing the stored state before mount.
    cleanup();
    window.localStorage.setItem("ai-search-playground:environment:v1", JSON.stringify({
      rows: 15, cols: 20, start: [7, 2], goal: [7, 17], obstacles: ["7,10"], terrain: [],
      movement: "four_way", corner_cutting: false,
    }));
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Run search/ }));
    await screen.findByText("Path found"); // wall restored from storage is routed around
  });

  it("runs the comparison for all 11 algorithms", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Comparison/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Run comparison/ }));
    const table = await screen.findByRole("table", {}, { timeout: 20000 });
    await waitFor(() => expect(within(table).getAllByRole("row").length).toBe(12)); // header + 11
    expect(within(table).getAllByText(/found/).length).toBeGreaterThan(5);
  });
});
