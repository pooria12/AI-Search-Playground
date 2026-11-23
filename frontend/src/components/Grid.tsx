import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { moveMarker, paint, strokeMode, useApp } from "../context/AppContext";
import { cellKey } from "../lib/cells";
import { Overlay } from "../lib/timeline";
import type { Cell } from "../types";

const GAP = 1;
const MIN_CELL = 10;
const MAX_CELL = 34;

const COLORS = {
  empty: "#162033",
  gap: "#0b1220",
  wall: "#64748b",
  start: "#22c55e",
  goal: "#ef4444",
  difficult: "rgba(56, 189, 248, 0.30)",
  highCost: "rgba(249, 115, 22, 0.38)",
  frontier: "rgba(250, 204, 21, 0.75)",
  explored: "rgba(59, 130, 246, 0.50)",
  pruned: "rgba(239, 68, 68, 0.38)",
  path: "#10b981",
  expanding: "#c084fc",
  label: "rgba(226, 232, 240, 0.8)",
};

interface GridProps {
  /** Search overlay for the current animation frame (one byte per cell). */
  overlay?: Uint8Array;
  /** Index (row * cols + col) of the cell being expanded, or -1. */
  expanding?: number;
  /** Disable editing (e.g. while a request is running). */
  locked?: boolean;
}

type Drag =
  | { kind: "marker"; marker: "start" | "goal" }
  | { kind: "paint"; mode: "add" | "remove" };

export function Grid({ overlay, expanding = -1, locked = false }: GridProps) {
  const { env, tool, edit } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [cellSize, setCellSize] = useState(28);

  const { rows, cols } = env;

  // Fit cells to the available width.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const available = el.clientWidth;
      const size = Math.floor((available - GAP * (cols - 1)) / cols);
      setCellSize(Math.max(MIN_CELL, Math.min(MAX_CELL, size)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cols]);

  const width = cols * cellSize + (cols - 1) * GAP;
  const height = rows * cellSize + (rows - 1) * GAP;

  // ---- drawing -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.gap;
    ctx.fillRect(0, 0, width, height);

    const fontSize = Math.max(8, Math.floor(cellSize * 0.42));
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (cellSize + GAP);
        const y = r * (cellSize + GAP);
        const key = cellKey(r, c);
        const idx = r * cols + c;

        ctx.fillStyle = COLORS.empty;
        ctx.fillRect(x, y, cellSize, cellSize);

        // Terrain is a base tint with a cost label, so it stays readable
        // underneath the search overlay.
        const terrain = env.terrain.get(key);
        if (terrain) {
          ctx.fillStyle = terrain === "difficult" ? COLORS.difficult : COLORS.highCost;
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        const state = overlay ? overlay[idx] : Overlay.None;
        if (state === Overlay.Frontier) ctx.fillStyle = COLORS.frontier;
        else if (state === Overlay.Explored) ctx.fillStyle = COLORS.explored;
        else if (state === Overlay.Pruned) ctx.fillStyle = COLORS.pruned;
        else if (state === Overlay.Path) ctx.fillStyle = COLORS.path;
        if (state !== Overlay.None) ctx.fillRect(x, y, cellSize, cellSize);

        if (idx === expanding) {
          ctx.fillStyle = COLORS.expanding;
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        if (terrain && cellSize >= 14) {
          ctx.fillStyle = COLORS.label;
          ctx.font = `${fontSize}px ui-monospace, monospace`;
          ctx.fillText(terrain === "difficult" ? "2" : "5", x + cellSize / 2, y + cellSize / 2);
        }

        if (env.obstacles.has(key)) {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    const drawMarker = (cell: Cell, color: string, letter: string) => {
      const x = cell.col * (cellSize + GAP);
      const y = cell.row * (cellSize + GAP);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.fillStyle = "#04130a";
      ctx.font = `bold ${Math.max(9, Math.floor(cellSize * 0.55))}px ui-sans-serif, system-ui`;
      ctx.fillText(letter, x + cellSize / 2, y + cellSize / 2 + 1);
    };
    drawMarker(env.start, COLORS.start, "S");
    drawMarker(env.goal, COLORS.goal, "G");
  }, [env, overlay, expanding, rows, cols, cellSize, width, height]);

  // ---- interaction -------------------------------------------------------
  const cellAt = useCallback(
    (e: React.PointerEvent): Cell | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const col = Math.floor((e.clientX - rect.left) / (cellSize + GAP));
      const row = Math.floor((e.clientY - rect.top) / (cellSize + GAP));
      if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
      return { row, col };
    },
    [cellSize, rows, cols],
  );

  const applyDrag = useCallback(
    (cell: Cell) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "marker") {
        edit((env) => moveMarker(env, drag.marker, cell));
      } else {
        edit((env) => paint(env, cell, tool, drag.mode));
      }
    },
    [edit, tool],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked || e.button > 0) return;
    const cell = cellAt(e);
    if (!cell) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (cell.row === env.start.row && cell.col === env.start.col) {
      dragRef.current = { kind: "marker", marker: "start" };
    } else if (cell.row === env.goal.row && cell.col === env.goal.col) {
      dragRef.current = { kind: "marker", marker: "goal" };
    } else {
      dragRef.current = { kind: "paint", mode: strokeMode(env, cell, tool) };
      applyDrag(cell);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const cell = cellAt(e);
    if (cell) applyDrag(cell);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div ref={wrapRef} className="w-full flex justify-center">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Search grid, ${rows} rows by ${cols} columns. Drag S or G to move them; click or drag to draw.`}
        style={{
          width,
          height,
          touchAction: "none",
          cursor: locked ? "progress" : "crosshair",
        }}
        className="rounded-md select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      />
    </div>
  );
}

export function GridLegend() {
  const items: Array<[string, string]> = [
    ["Start", COLORS.start],
    ["Goal", COLORS.goal],
    ["Wall", COLORS.wall],
    ["Frontier", COLORS.frontier],
    ["Explored", COLORS.explored],
    ["Expanding", COLORS.expanding],
    ["Pruned / cutoff", COLORS.pruned],
    ["Path", COLORS.path],
    ["Difficult (×2)", COLORS.difficult],
    ["High cost (×5)", COLORS.highCost],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm border border-charcoal-600"
            style={{ background: color }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
