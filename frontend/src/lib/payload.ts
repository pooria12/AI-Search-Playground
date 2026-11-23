import type {
  AlgorithmOptions,
  EnvironmentPayload,
  GridEnvironmentState,
} from "../types";
import { keyToCell } from "./cells";

/** Convert the editing state into the API's environment fields. */
export function environmentPayload(env: GridEnvironmentState): EnvironmentPayload {
  return {
    start: env.start,
    goal: env.goal,
    rows: env.rows,
    cols: env.cols,
    movement: env.movement,
    corner_cutting: env.corner_cutting,
    obstacles: Array.from(env.obstacles, keyToCell),
    terrain: Array.from(env.terrain, ([key, type]) => ({
      ...keyToCell(key),
      type,
    })),
  };
}

export const DEFAULT_OPTIONS: AlgorithmOptions = {
  beam_width: 3,
  dls_limit: null,
  iddfs_max_depth: 100,
  hill_climbing_sideways: 0,
};
