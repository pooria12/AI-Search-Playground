"""Generate the README images from REAL algorithm runs (nothing is mocked).

    python scripts/make_readme_art.py

Writes docs/assets/hero.svg (animated A* trace), compare.svg (four algorithms
on the same map), social-preview.svg/.png (upload it in the GitHub repo
settings), and stats.json (the numbers quoted in the README).
"""

import json
from pathlib import Path

from art_common import MAZE, ROOT, build, parse, replay, run

OUT = ROOT / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

BG, PANEL = "#0b1220", "#111a2e"
BASE, WALL = "#162033", "#64748b"
START, GOAL, PATH = "#22c55e", "#ef4444", "#10b981"
FRONTIER, EXPLORED, TERRAIN = "#facc15", "#3b82f6", "#38bdf8"
TEXT, MUTED = "#e2e8f0", "#94a3b8"
FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace"


def blend(hex_a, hex_b, t):
    a = [int(hex_a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


TERRAIN_BASE = blend(BASE, TERRAIN, 0.3)
FRONTIER_FILL = blend(BASE, FRONTIER, 0.8)
EXPLORED_FILL = blend(BASE, EXPLORED, 0.55)
FRONTIER_ON_TERRAIN = blend(TERRAIN_BASE, FRONTIER, 0.8)
EXPLORED_ON_TERRAIN = blend(TERRAIN_BASE, EXPLORED, 0.55)


def base_fill(ch):
    return {"#": WALL, "~": TERRAIN_BASE}.get(ch, BASE)


def grid_cells(x0, y0, cell, gap, state_of, rx):
    """Static grid; state_of(r,c) -> fill override or None."""
    out = []
    for r, line in enumerate(MAZE):
        for c, ch in enumerate(line):
            fill = state_of(r, c, ch) or base_fill(ch)
            if ch == "S":
                fill = START
            elif ch == "G":
                fill = GOAL
            x, y = x0 + c * (cell + gap), y0 + r * (cell + gap)
            out.append(f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" rx="{rx}" fill="{fill}"/>')
    return "".join(out)


def final_state(result):
    seen, expanded, path, _ = replay(result)
    on_path = set(path)

    def state(r, c, ch):
        if (r, c) in on_path:
            return PATH
        terrain = ch == "~"
        if (r, c) in expanded:
            return EXPLORED_ON_TERRAIN if terrain else EXPLORED_FILL
        if (r, c) in seen:
            return FRONTIER_ON_TERRAIN if terrain else FRONTIER_FILL
        return None

    return state


def markers(x0, y0, cell, gap, font):
    out = []
    for r, line in enumerate(MAZE):
        for c, ch in enumerate(line):
            if ch in "SG":
                x = x0 + c * (cell + gap) + cell / 2
                y = y0 + r * (cell + gap) + cell / 2
                out.append(f'<text x="{x}" y="{y}" fill="#06130a" font-family="{FONT}" font-weight="700" '
                           f'font-size="{font}" text-anchor="middle" dominant-baseline="central">{ch}</text>')
    return "".join(out)


def svg_open(w, h, title, desc):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-labelledby="t d"><title id="t">{title}</title><desc id="d">{desc}</desc>')


cfg, problem = build()
ROWS, COLS = len(MAZE), len(MAZE[0])
results = {
    "bfs": run("bfs", problem),
    "greedy": run("greedy", problem),
    "astar": run("astar", problem),
    "hill_climbing": run("hill_climbing", problem),
}
for name, r in results.items():
    print(f"{name:14s} found={r.found!s:5} expanded={r.nodes_explored:4d} cost={r.path_cost:.0f}")

# ---------------------------------------------------------------- hero (animated)
CELL, GAP, PAD, HEAD, FOOT = 22, 2, 28, 58, 44
gw, gh = COLS * (CELL + GAP) - GAP, ROWS * (CELL + GAP) - GAP
W, H = gw + 2 * PAD, gh + HEAD + FOOT + PAD
astar = results["astar"]
seen, expanded, path, n = replay(astar)
T_EXPLORE, T_PATH, T_HOLD = 8.0, 1.6, 3.2
T = T_EXPLORE + T_PATH + T_HOLD
path_set = {cell: i for i, cell in enumerate(path)}

parts = [svg_open(W, H, "A* search animation",
                  f"A* replaying its real trace on a {ROWS} by {COLS} map: {astar.nodes_explored} cells expanded, "
                  f"path cost {astar.path_cost:.0f}."),
         f'<rect width="{W}" height="{H}" rx="18" fill="{BG}"/>',
         f'<text x="{PAD}" y="36" fill="{TEXT}" font-family="{FONT}" font-size="20" font-weight="700">'
         f'AI Search Playground</text>',
         f'<text x="{W - PAD}" y="36" fill="{MUTED}" font-family="{FONT}" font-size="13" text-anchor="end">'
         f'A* · real trace, replayed</text>',
         f'<rect x="{PAD - 8}" y="{HEAD - 8}" width="{gw + 16}" height="{gh + 16}" rx="12" fill="{PANEL}"/>']

x0, y0 = PAD, HEAD
for r, line in enumerate(MAZE):
    for c, ch in enumerate(line):
        x, y = x0 + c * (CELL + GAP), y0 + r * (CELL + GAP)
        base = base_fill(ch)
        if ch == "S":
            base = START
        elif ch == "G":
            base = GOAL
        cell_xml = f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="5" fill="{base}"'
        key = (r, c)
        if ch in "#SG" or key not in seen:
            parts.append(cell_xml + "/>")
            continue
        terrain = ch == "~"
        values, times = [base], [0.0]
        t_seen = seen[key] / n * T_EXPLORE
        values.append(FRONTIER_ON_TERRAIN if terrain else FRONTIER_FILL)
        times.append(t_seen)
        if key in expanded:
            values.append(EXPLORED_ON_TERRAIN if terrain else EXPLORED_FILL)
            times.append(max(expanded[key] / n * T_EXPLORE, t_seen))
        if key in path_set:
            values.append(PATH)
            times.append(T_EXPLORE + 0.25 + path_set[key] / max(1, len(path)) * T_PATH)
        kt = ";".join(f"{t / T:.4f}" for t in times)
        vs = ";".join(values)
        parts.append(f'{cell_xml}><animate attributeName="fill" dur="{T}s" repeatCount="indefinite" '
                     f'calcMode="discrete" keyTimes="{kt}" values="{vs}"/></rect>')
parts.append(markers(x0, y0, CELL, GAP, 13))
legend = [("frontier", FRONTIER_FILL), ("explored", EXPLORED_FILL), ("path", PATH), ("difficult ×2", TERRAIN_BASE)]
lx = PAD
for label, color in legend:
    parts.append(f'<rect x="{lx}" y="{H - 30}" width="12" height="12" rx="3" fill="{color}"/>'
                 f'<text x="{lx + 18}" y="{H - 20}" fill="{MUTED}" font-family="{FONT}" font-size="12">{label}</text>')
    lx += 28 + 8 * len(label)
parts.append(f'<text x="{W - PAD}" y="{H - 20}" fill="{TEXT}" font-family="{MONO}" font-size="12" text-anchor="end">'
             f'{astar.nodes_explored} expanded · cost {astar.path_cost:.0f}</text></svg>')
(OUT / "hero.svg").write_text("".join(parts))

# ---------------------------------------------------------------- comparison (static)
PC, PG, PP, PW = 6, 1, 16, 4
pw = COLS * (PC + PG) - PG
ph = ROWS * (PC + PG) - PG
CW = 4 * (pw + 2 * PP) + 3 * PW + 2 * PW
CH = ph + 2 * PP + 74
cmp_parts = [svg_open(CW, CH, "Four algorithms on the same map",
                      "BFS, greedy best-first, A* and hill climbing on the same map, final state of each real run."),
             f'<rect width="{CW}" height="{CH}" rx="16" fill="{BG}"/>']
labels = {
    "bfs": ("BFS", lambda r: f"{r.nodes_explored} expanded · cost {r.path_cost:.0f}"),
    "greedy": ("Greedy", lambda r: f"{r.nodes_explored} expanded · cost {r.path_cost:.0f}"),
    "astar": ("A*", lambda r: f"{r.nodes_explored} expanded · cost {r.path_cost:.0f}"),
    "hill_climbing": ("Hill climbing", lambda r: f"stuck after {r.nodes_explored} expansions"),
}
for i, (name, r) in enumerate(results.items()):
    px = PW + i * (pw + 2 * PP + PW)
    cmp_parts.append(f'<rect x="{px}" y="{PW}" width="{pw + 2 * PP}" height="{CH - 2 * PW}" rx="12" fill="{PANEL}"/>')
    cmp_parts.append(grid_cells(px + PP, PP + 8, PC, PG, final_state(r), 1.5))
    title, describe = labels[name]
    sub = describe(r)
    ty = PP + 8 + ph + 22
    cmp_parts.append(f'<text x="{px + PP}" y="{ty}" fill="{TEXT}" font-family="{FONT}" font-size="15" font-weight="700">{title}</text>')
    cmp_parts.append(f'<text x="{px + PP}" y="{ty + 20}" fill="{MUTED}" font-family="{FONT}" font-size="12">{sub}</text>')
cmp_parts.append("</svg>")
(OUT / "compare.svg").write_text("".join(cmp_parts))

# ---------------------------------------------------------------- social preview 1280x640
SW, SH = 1280, 640
sc, sg = 16, 2
sgw, sgh = COLS * (sc + sg) - sg, ROWS * (sc + sg) - sg
gx, gy = SW - sgw - 70, 250
chips = ["11 algorithms", "live step-by-step report", "Python + React", "Cloudflare Workers"]
soc = [svg_open(SW, SH, "AI Search Playground", "Watch 11 classic AI search algorithms think, step by step."),
       f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/>'
       f'<stop offset="1" stop-color="#101c36"/></linearGradient></defs>',
       f'<rect width="{SW}" height="{SH}" fill="url(#g)"/>',
       f'<text x="70" y="170" fill="{TEXT}" font-family="{FONT}" font-size="76" font-weight="800">AI Search</text>',
       f'<text x="70" y="252" fill="{blend(EXPLORED, "#ffffff", .25)}" font-family="{FONT}" font-size="76" font-weight="800">Playground</text>',
       f'<text x="70" y="318" fill="{MUTED}" font-family="{FONT}" font-size="29">Watch 11 classic AI search algorithms</text>',
       f'<text x="70" y="358" fill="{MUTED}" font-family="{FONT}" font-size="29">think, one step at a time.</text>']
# two rows, so the chips never run underneath the grid panel
rows_of_chips = [chips[:2], chips[2:]]
for row_index, row in enumerate(rows_of_chips):
    cx = 70
    for chip in row:
        wchip = 17 * len(chip) * 0.58 + 40
        cy = 450 + row_index * 54
        soc.append(f'<rect x="{cx}" y="{cy}" width="{wchip}" height="40" rx="20" fill="{PANEL}" stroke="#1e2d4d"/>'
                   f'<text x="{cx + wchip / 2}" y="{cy + 26}" fill="{TEXT}" font-family="{FONT}" font-size="17" '
                   f'text-anchor="middle">{chip}</text>')
        cx += wchip + 12
soc.append(f'<rect x="{gx - 14}" y="{gy - 14}" width="{sgw + 28}" height="{sgh + 28}" rx="16" fill="{PANEL}"/>')
soc.append(grid_cells(gx, gy, sc, sg, final_state(astar), 4))
soc.append(markers(gx, gy, sc, sg, 11))
soc.append(f'<text x="{gx}" y="{gy + sgh + 50}" fill="{MUTED}" font-family="{MONO}" font-size="16">'
           f'A* · {astar.nodes_explored} expanded · cost {astar.path_cost:.0f}</text></svg>')
(OUT / "social-preview.svg").write_text("".join(soc))
import cairosvg  # noqa: E402

cairosvg.svg2png(url=str(OUT / "social-preview.svg"), write_to=str(OUT / "social-preview.png"))

stats = {name: {"expanded": r.nodes_explored, "cost": r.path_cost, "found": r.found} for name, r in results.items()}
stats["map"] = {"rows": ROWS, "cols": COLS}
(OUT / "stats.json").write_text(json.dumps(stats, indent=2))
for f in sorted(OUT.iterdir()):
    print(f"  {f.name:28s} {f.stat().st_size // 1024:4d} KiB")
