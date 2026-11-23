import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import type { AlgorithmId } from "../types";

interface DocAlgo {
  id: string; name: string; abbreviation: string; description: string;
  data_structure: string; optimal: string; complete: string;
  pseudocode: string; python_source: string; complexity: {
    time: string; space: string;
  };
  completeness: string; optimality: string; advantages: string[];
  disadvantages: string[]; examples: string[];
}

const ALGORITHM_DOCS: Record<AlgorithmId, DocAlgo> = {
  bfs: {
    id: "bfs", name: "Breadth-First Search", abbreviation: "BFS",
    description: "Explores the graph level by level using a FIFO queue. All nodes at depth d are explored before any node at depth d+1.",
    data_structure: "FIFO queue",
    optimal: "Yes (equal step costs only)",
    complete: "Yes (finite branching factor)",
    pseudocode: `BFS(start, goal):
  queue ← [start]
  discovered ← {start}
  parent ← {start: null}
  while queue not empty:
    current ← queue.pop_front()
    if current == goal: return reconstruct(parent, goal)
    for neighbor in successors(current):
      if neighbor not in discovered:
        discovered.add(neighbor)
        parent[neighbor] ← current
        queue.push_back(neighbor)
  return failure`,
    python_source: `# BFS uses collections.deque as a FIFO queue\nfrom collections import deque\n\ndef bfs(start, goal, successors):\n    queue = deque([start])\n    discovered = {start}\n    parent = {start: None}\n    while queue:\n        current = queue.popleft()\n        if current == goal:\n            return reconstruct(parent, goal)\n        for neighbor, _ in successors(current):\n            if neighbor not in discovered:\n                discovered.add(neighbor)\n                parent[neighbor] = current\n                queue.append(neighbor)\n    return None`,
    complexity: { time: "O(V + E)", space: "O(V)" },
    completeness: "Complete for finite branching — will find a solution if one exists.",
    optimality: "Optimal only when all step costs are equal. On weighted grids it is not guaranteed optimal.",
    advantages: ["Simple to implement", "Finds shortest path in unweighted grids", "Guaranteed complete"],
    disadvantages: ["Explores many nodes (high memory)", "Not optimal on weighted terrain", "No heuristic guidance"],
    examples: ["Unweighted grid pathfinding", "Social-network friend-of-friend", "Web crawler page discovery"],
  },
  dfs: {
    id: "dfs", name: "Depth-First Search", abbreviation: "DFS",
    description: "Explores as deep as possible along each branch before backtracking. Uses an explicit LIFO stack (graph-search variant with a visited set).",
    data_structure: "LIFO stack",
    optimal: "No",
    complete: "No (not on infinite-depth spaces)",
    pseudocode: `DFS(start, goal):
  stack ← [(start, [start])]
  visited ← {start}
  while stack not empty:
    (current, path) ← stack.pop()
    if current == goal: return path
    for neighbor in successors(current):
      if neighbor not in visited:
        visited.add(neighbor)
        stack.push((neighbor, path + [neighbor]))
  return failure`,
    python_source: `def dfs(start, goal, successors):\n    stack = [(start, [start])]\n    visited = {start}\n    while stack:\n        current, path = stack.pop()\n        if current == goal:\n            return path\n        for neighbor, _ in successors(current):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                stack.append((neighbor, path + [neighbor]))\n    return None`,
    complexity: { time: "O(V + E)", space: "O(V)" },
    completeness: "Not complete on infinite-depth or circular graphs without a visited set.",
    optimality: "Not optimal — returns the first path found, not necessarily the shortest.",
    advantages: ["Low memory (O(depth))", "Good for deep/narrow spaces", "Simple iterative or recursive form"],
    disadvantages: ["Can get lost in deep branches", "Not optimal", "May not terminate on infinite graphs"],
    examples: ["Maze solving", "Cycle detection", "Topological sorting"],
  },
  ucs: {
    id: "ucs", name: "Uniform Cost Search", abbreviation: "UCS",
    description: "Expands the node with the lowest cumulative path cost g(n). Uses a min-priority queue. Supports relaxation when a cheaper route is found.",
    data_structure: "min-priority queue (by g)",
    optimal: "Yes (nonnegative costs)",
    complete: "Yes (finite branching)",
    pseudocode: `UCS(start, goal):
  pq ← [(0, start)]
  g[start] ← 0
  parent ← {start: null}
  while pq not empty:
    (g_cost, current) ← pq.pop_min()
    if current == goal: return reconstruct(parent, goal)
    for neighbor, cost in successors(current):
      tentative ← g_cost + cost
      if tentative < g.get(neighbor, ∞):
        g[neighbor] ← tentative
        parent[neighbor] ← current
        pq.push((tentative, neighbor))
  return failure`,
    python_source: `import heapq\n\ndef ucs(start, goal, successors):\n    pq = [(0, start)]\n    g = {start: 0}\n    parent = {start: None}\n    while pq:\n        cost, current = heapq.heappop(pq)\n        if current == goal:\n            return reconstruct(parent, goal)\n        for neighbor, edge_cost in successors(current):\n            tentative = cost + edge_cost\n            if tentative < g.get(neighbor, inf):\n                g[neighbor] = tentative\n                parent[neighbor] = current\n                heapq.heappush(pq, (tentative, neighbor))\n    return None`,
    complexity: { time: "O(E log V)", space: "O(V)" },
    completeness: "Complete with nonnegative edge costs and finite branching.",
    optimality: "Optimal with nonnegative edge costs (like Dijkstra's).",
    advantages: ["Guaranteed optimal (nonnegative costs)", "Handles weighted terrain correctly", "Complete"],
    disadvantages: ["Explores in all directions equally (no heuristic)", "Can be slow on large grids", "Higher memory than BFS"],
    examples: ["Weighted grid pathfinding", "Network routing (Dijkstra)", "Cost-based planning"],
  },
  dls: {
    id: "dls", name: "Depth-Limited Search", abbreviation: "DLS",
    description: "DFS with a hard depth limit (root at depth 0). Distinguishes 'cutoff' (an unexplored state lies beyond the limit) from 'failure' (the space inside the limit is exhausted). A state is re-expanded when reached at a shallower depth, so a goal within the limit is never missed.",
    data_structure: "LIFO stack",
    optimal: "No",
    complete: "Within the depth limit",
    pseudocode: `DLS(start, goal, limit):
  stack ← [(start, 0, [start])]
  best_depth ← {start: 0}          // shallowest depth each state was reached
  cutoff ← false
  while stack not empty:
    (current, depth, path) ← stack.pop()
    if depth > best_depth[current]: continue   // a shallower route superseded it
    if current == goal: return path
    for neighbor in successors(current):
      if depth + 1 > limit:
        if neighbor not in best_depth: cutoff ← true
        continue
      if neighbor not in best_depth or depth + 1 < best_depth[neighbor]:
        best_depth[neighbor] ← depth + 1
        stack.push((neighbor, depth + 1, path + [neighbor]))
  return cutoff if cutoff else failure`,
    python_source: `def dls(start, goal, successors, limit):
    stack = [(start, 0, [start])]
    best_depth = {start: 0}
    cutoff = False
    while stack:
        current, depth, path = stack.pop()
        if depth > best_depth[current]:
            continue  # reached again at a shallower depth
        if current == goal:
            return path
        for neighbor, _ in successors(current):
            if depth + 1 > limit:
                if neighbor not in best_depth:
                    cutoff = True
                continue
            if neighbor not in best_depth or depth + 1 < best_depth[neighbor]:
                best_depth[neighbor] = depth + 1
                stack.append((neighbor, depth + 1, path + [neighbor]))
    return "cutoff" if cutoff else None`,
    complexity: { time: "O(b^l)", space: "O(l)" },
    completeness: "Complete only if a solution exists at depth ≤ limit.",
    optimality: "Not optimal — finds the first solution within the limit.",
    advantages: ["Bounds memory and time", "Avoids infinite depth", "Basis for IDDFS"],
    disadvantages: ["May miss deeper solutions", "Not optimal", "Requires choosing a limit"],
    examples: ["Game-tree search with depth cap", "Bounded puzzle solving"],
  },
  iddfs: {
    id: "iddfs", name: "Iterative Deepening DFS", abbreviation: "IDDFS",
    description: "Runs DLS repeatedly with increasing depth limits (0, 1, 2, ...). Combines BFS's completeness with DFS's low memory. Each iteration uses its own depth-aware visited map, and the search stops early once an iteration finishes without any cutoff.",
    data_structure: "LIFO stack (per iteration)",
    optimal: "Yes (equal step costs)",
    complete: "Yes (finite branching)",
    pseudocode: `IDDFS(start, goal, max_depth):
  for limit ← 0 to max_depth:
    result ← DLS(start, goal, limit)   // fresh best_depth map each pass
    if result is a path: return result
    if result == failure: return failure   // nothing cut off: deeper limits add nothing
  return failure (max_depth reached)`,
    python_source: `def iddfs(start, goal, successors, max_depth=100):\n    for limit in range(max_depth + 1):\n        result = dls(start, goal, successors, limit)\n        if result != "cutoff":\n            return result\n    return None`,
    complexity: { time: "O(b^d)", space: "O(d)" },
    completeness: "Complete for finite branching factor.",
    optimality: "Optimal when all step costs are equal.",
    advantages: ["Complete and optimal (equal costs)", "Linear memory O(d)", "No need to guess a depth limit"],
    disadvantages: ["Repeats earlier levels (some redundant work)", "Not optimal on weighted grids"],
    examples: ["Unknown-depth goal search", "Puzzle solving with shallow solutions"],
  },
  astar: {
    id: "astar", name: "A* Search", abbreviation: "A*",
    description: "Expands the node with the lowest f(n) = g(n) + h(n). Heuristic-guided. With an admissible heuristic it returns the optimal path.",
    data_structure: "min-priority queue (by f)",
    optimal: "Yes (admissible heuristic)",
    complete: "Yes (finite branching)",
    pseudocode: `A*(start, goal):
  pq ← [(h(start), start)]
  g[start] ← 0
  parent ← {start: null}
  while pq not empty:
    (f, current) ← pq.pop_min()
    if current == goal: return reconstruct(parent, goal)
    for neighbor, cost in successors(current):
      tentative_g ← g[current] + cost
      if tentative_g < g.get(neighbor, ∞):
        g[neighbor] ← tentative_g
        f ← tentative_g + h(neighbor)
        parent[neighbor] ← current
        pq.push((f, neighbor))
  return failure`,
    python_source: `import heapq\n\ndef astar(start, goal, successors, heuristic):\n    pq = [(heuristic(start), start)]\n    g = {start: 0}\n    parent = {start: None}\n    while pq:\n        f, current = heapq.heappop(pq)\n        if current == goal:\n            return reconstruct(parent, goal)\n        for neighbor, cost in successors(current):\n            tentative = g[current] + cost\n            if tentative < g.get(neighbor, inf):\n                g[neighbor] = tentative\n                heapq.heappush(pq, (tentative + heuristic(neighbor), neighbor))\n                parent[neighbor] = current\n    return None`,
    complexity: { time: "O(E log V)", space: "O(V)" },
    completeness: "Complete for finite branching with admissible heuristic.",
    optimality: "Optimal with an admissible (and consistent) heuristic.",
    advantages: ["Optimal with admissible heuristic", "Faster than Dijkstra (directed by heuristic)", "Handles weighted terrain"],
    disadvantages: ["Memory O(V)", "Only as good as the heuristic", "Not optimal if heuristic overestimates"],
    examples: ["Map navigation (Google Maps)", "Game pathfinding", "Robotics motion planning"],
  },
  greedy: {
    id: "greedy", name: "Greedy Best-First Search", abbreviation: "GBFS",
    description: "Expands the node with the lowest heuristic h(n) only — ignores path cost. Fast but not optimal. The textbook tree-search version can loop forever on graphs with cycles; this playground uses the graph-search version (an expanded set), which is complete on a finite grid.",
    data_structure: "min-priority queue (by h)",
    optimal: "No",
    complete: "No",
    pseudocode: `Greedy(start, goal):
  pq ← [(h(start), start)]
  visited ← {start}
  parent ← {start: null}
  while pq not empty:
    (_, current) ← pq.pop_min()
    if current == goal: return reconstruct(parent, goal)
    for neighbor in successors(current):
      if neighbor not in visited:
        visited.add(neighbor)
        parent[neighbor] ← current
        pq.push((h(neighbor), neighbor))
  return failure`,
    python_source: `import heapq\n\ndef greedy(start, goal, successors, heuristic):\n    pq = [(heuristic(start), start)]\n    visited = {start}\n    parent = {start: None}\n    while pq:\n        _, current = heapq.heappop(pq)\n        if current == goal:\n            return reconstruct(parent, goal)\n        for neighbor, _ in successors(current):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                parent[neighbor] = current\n                heapq.heappush(pq, (heuristic(neighbor), neighbor))\n    return None`,
    complexity: { time: "O(E log V)", space: "O(V)" },
    completeness: "Tree search: not complete (can loop). Graph search with a closed set, as used here: complete on finite graphs.",
    optimality: "Not optimal — greedily follows the heuristic, ignoring cost.",
    advantages: ["Often finds a path quickly", "Good heuristic-directed exploration", "Simple"],
    disadvantages: ["Not optimal", "Tree-search form can loop on cycles", "Can be misled by local heuristic"],
    examples: ["Quick path approximation", "Heuristic-guided exploration"],
  },
  ida_star: {
    id: "ida_star", name: "Iterative Deepening A*", abbreviation: "IDA*",
    description: "Depth-first iterations bounded by an f = g + h threshold. After each iteration the next threshold is the minimum exceeded f-value (not an arbitrary increment). Textbook IDA* needs only linear memory; this playground also keeps a per-iteration table of the cheapest g seen per cell, because on open grids the many equal-cost routes otherwise make it re-walk the same cells combinatorially often.",
    data_structure: "recursion stack",
    optimal: "Yes (admissible heuristic)",
    complete: "Yes (finite branching)",
    pseudocode: `IDA*(start, goal):
  threshold ← h(start)
  loop:
    result, threshold ← DFS_contour(start, g=0, threshold)
    if result found: return result
    if threshold == ∞: return failure`,
    python_source: `def ida_star(start, goal, successors, heuristic):\n    threshold = heuristic(start)\n    while True:\n        found, threshold = search(start, 0, threshold)\n        if found:\n            return found\n        if threshold == inf:\n            return None\n\ndef search(node, g, threshold):\n    f = g + heuristic(node)\n    if f > threshold: return None, f\n    if node == goal:\n        return path, None\n    min_exceeded = inf\n    for neighbor, cost in successors(node):\n        found, new_t = search(neighbor, g + cost, threshold)\n        if found: return found, None\n        min_exceeded = min(min_exceeded, new_t)\n    return None, min_exceeded`,
    complexity: { time: "O(b^d)", space: "O(d)" },
    completeness: "Complete for finite branching.",
    optimality: "Optimal with an admissible heuristic.",
    advantages: ["Optimal like A*", "Textbook memory is O(d) (this grid version adds a per-iteration table)", "No large priority queue"],
    disadvantages: ["Repeated re-exploration across iterations", "Threshold computation overhead", "Recursion depth limits"],
    examples: ["Sliding-tile puzzles", "Memory-constrained optimal pathfinding"],
  },
  hill_climbing: {
    id: "hill_climbing", abbreviation: "HC",
    name: "Hill Climbing",
    description: "Starts at a node and repeatedly moves to the neighbor with the best (lowest) heuristic. Stops at a local optimum or plateau. Sideways moves are optional.",
    data_structure: "current state + neighbor list",
    optimal: "No",
    complete: "No",
    pseudocode: `HillClimbing(start, goal):
  current ← start
  loop:
    if current == goal: return path
    neighbor ← best successor by h(n)
    if h(neighbor) >= h(current): return local_optimum(current)
    current ← neighbor
    sideways moves optional`,
    python_source: `def hill_climbing(start, goal, successors, heuristic, sideways=0):\n    current = start\n    sideways_used = 0\n    while current != goal:\n        neighbors = successors(current)\n        best = min(neighbors, key=lambda n: heuristic(n[0]))\n        if heuristic(best[0]) >= heuristic(current):\n            break  # local optimum\n        current = best[0]\n    return current == goal ? path : None`,
    complexity: { time: "O(d × b)", space: "O(d)" },
    completeness: "Not complete — stops at local optima.",
    optimality: "Not optimal — no guarantee of best path.",
    advantages: ["Very low memory", "Fast per step", "Simple"],
    disadvantages: ["Local optima", "Plateaus", "Not complete or optimal"],
    examples: ["Local optimization", "Quick approximate path", "Configuration tuning"],
  },
  beam_search: {
    id: "beam_search", name: "Beam Search", abbreviation: "BS",
    description: "Like BFS but keeps only the best k candidates (the beam) at each level. Pruning can discard the only solution — not complete or optimal.",
    data_structure: "beam of k candidates",
    optimal: "No",
    complete: "No",
    pseudocode: `BeamSearch(start, goal, k):
  beam ← [start]
  while beam not empty:
    candidates ← all successors of beam nodes
    if goal in candidates: return path to goal
    beam ← top k candidates by h(n)
  return failure`,
    python_source: `def beam_search(start, goal, successors, heuristic, k=3):\n    beam = [start]\n    while beam:\n        candidates = []\n        for node in beam:\n            for neighbor, _ in successors(node):\n                candidates.append(neighbor)\n        if goal in candidates:\n            return reconstruct_path(goal)\n        candidates.sort(key=heuristic)\n        beam = candidates[:k]\n    return None`,
    complexity: { time: "O(b × k × d)", space: "O(k × d)" },
    completeness: "Not complete — pruning can discard the only solution.",
    optimality: "Not optimal — greedy per-level retention.",
    advantages: ["Bounded memory (beam width k)", "Faster than BFS", "Tunable via k"],
    disadvantages: ["Not complete", "Not optimal", "Solution may be pruned"],
    examples: ["Machine translation decoding", "Speech recognition", "Large-search-space approximation"],
  },
  rbfs: {
    id: "rbfs", name: "Recursive Best-First Search", abbreviation: "RBFS",
    description: "Recursive best-first search with an explicit f-limit. Tracks the best alternative and backs up f-values on return. Linear space like A* but recursive.",
    data_structure: "recursion stack",
    optimal: "Yes (admissible heuristic)",
    complete: "Yes (finite branching)",
    pseudocode: `RBFS(node, f_limit):
  if node == goal: return path
  successors ← sorted by f = g + h
  if best.f > f_limit: return failure, best.f
  alternative ← second-best f (or ∞)
  result, new_f ← RBFS(best, min(f_limit, alternative))
  best.f ← new_f   # back up value
  repeat while best.f ≤ f_limit`,
    python_source: `def rbfs(start, goal, successors, heuristic):\n    def recurse(node, g, f_limit):\n        if node == goal:\n            return [node], None\n        children = sorted(successors(node),\n                          key=lambda n: g + edge_cost + heuristic(n[0]))\n        if not children:\n            return None, inf\n        best = children[0]\n        if best_f > f_limit:\n            return None, best_f\n        alternative = children[1].f if len(children) > 1 else inf\n        path, new_f = recurse(best.node, g + cost, min(f_limit, alternative))\n        if path: return path, None\n        best.f = new_f\n    return recurse(start, 0, inf)[0]`,
    complexity: { time: "O(b^d)", space: "O(d)" },
    completeness: "Complete for finite branching.",
    optimality: "Optimal with an admissible heuristic.",
    advantages: ["Optimal like A*", "Linear memory O(d)", "Uses best alternative to guide re-search"],
    disadvantages: ["Complex backtracking / backup logic", "Can re-explore nodes", "Recursion depth limits"],
    examples: ["Memory-constrained optimal search", "Puzzle solving with limited RAM"],
  },
};

export default function EducationPage() {
  const [selected, setSelected] = useState<AlgorithmId>("astar");
  const doc = ALGORITHM_DOCS[selected];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Algorithm Education</h1>
          <p className="text-slate-400">Concepts, pseudocode, and Python source for each search algorithm.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider">select algorithm</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as AlgorithmId)}
            className="bg-charcoal-900 border border-charcoal-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {Object.keys(ALGORITHM_DOCS).map((id) => {
              const d = ALGORITHM_DOCS[id as AlgorithmId];
              return (
                <option key={id} value={id}>
                  {d.abbreviation} — {d.name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="p-4 border-b border-charcoal-700">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold text-slate-100">
                  {doc.name} <span className="text-blue-400 text-sm font-mono">{doc.abbreviation}</span>
                </h2>
              </div>
              <p className="text-sm text-slate-400 mt-2">{doc.description}</p>
            </div>
            <div className="p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pseudocode</h3>
              <div className="bg-[#0d1117] rounded-lg p-4 overflow-x-auto font-mono text-xs text-slate-300">
                <pre className="whitespace-pre-wrap">{doc.pseudocode}</pre>
              </div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-2">Python source</h3>
              <div className="bg-[#0d1117] rounded-lg p-4 overflow-x-auto font-mono text-xs text-slate-300">
                <pre className="whitespace-pre-wrap">{doc.python_source}</pre>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="p-4 border-b border-charcoal-700">
              <h2 className="text-lg font-bold text-slate-100">Analysis</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-charcoal-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase">Time complexity</div>
                  <div className="text-sm text-slate-200 font-mono">{doc.complexity.time}</div>
                </div>
                <div className="bg-charcoal-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase">Space complexity</div>
                  <div className="text-sm text-slate-200 font-mono">{doc.complexity.space}</div>
                </div>
                <div className="bg-charcoal-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase">Data structure</div>
                  <div className="text-sm text-slate-200">{doc.data_structure}</div>
                </div>
                <div className="bg-charcoal-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase">Complete</div>
                  <div className="text-sm text-slate-200">{doc.complete}</div>
                </div>
                <div className="bg-charcoal-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase">Optimal</div>
                  <div className="text-sm text-slate-200">{doc.optimal}</div>
                </div>
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase">Completeness</h4>
                <p className="text-sm text-slate-300">{doc.completeness}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase">Optimality</h4>
                <p className="text-sm text-slate-300">{doc.optimality}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <div className="card">
            <div className="p-4 border-b border-charcoal-700">
              <h2 className="text-sm font-semibold text-slate-300">Advantages</h2>
            </div>
            <div className="p-4 space-y-2">
              {doc.advantages.map((a: string, i: number) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-green-400">✓</span>
                  <span className="text-slate-300">{a}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="p-4 border-b border-charcoal-700">
              <h2 className="text-sm font-semibold text-slate-300">Disadvantages</h2>
            </div>
            <div className="p-4 space-y-2">
              {doc.disadvantages.map((a: string, i: number) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-red-400">✗</span>
                  <span className="text-slate-300">{a}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="p-4 border-b border-charcoal-700">
              <h2 className="text-sm font-semibold text-slate-300">Examples</h2>
            </div>
            <div className="p-4 space-y-2">
              {doc.examples.map((a: string, i: number) => (
                <div key={i} className="flex gap-2 text-sm">
                  <BookOpen className="w-3 h-3 text-slate-500 mt-0.5" />
                  <span className="text-slate-300">{a}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
