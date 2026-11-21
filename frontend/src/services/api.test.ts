import { describe, expect, it } from "vitest";
import { environmentPayload } from "../lib/payload";
import { describeTermination } from "../lib/format";
import { messageFromBody } from "./api";

describe("messageFromBody", () => {
  it("extracts the backend's documented error message", () => {
    expect(messageFromBody('{"error":{"code":"invalid_request","message":"start cell is an obstacle"}}', 400))
      .toBe("start cell is an obstacle");
  });
  it("falls back to FastAPI detail, then to a generic message", () => {
    expect(messageFromBody('{"detail":"boom"}', 500)).toBe("boom");
    expect(messageFromBody("<html>", 502)).toBe("Request failed (HTTP 502)");
  });
});

describe("environmentPayload", () => {
  it("converts the editing state to API fields", () => {
    const payload = environmentPayload({
      rows: 5, cols: 6,
      start: { row: 0, col: 0 }, goal: { row: 4, col: 5 },
      obstacles: new Set(["1,2", "3,3"]),
      terrain: new Map([["2,2", "high_cost" as const]]),
      movement: "eight_way", corner_cutting: true,
    });
    expect(payload.obstacles).toEqual([{ row: 1, col: 2 }, { row: 3, col: 3 }]);
    expect(payload.terrain).toEqual([{ row: 2, col: 2, type: "high_cost" }]);
    expect(payload.movement).toBe("eight_way");
  });
});

describe("describeTermination", () => {
  it("explains why a search stopped", () => {
    expect(describeTermination(true, "success", null)).toBe("Path found");
    expect(describeTermination(false, "no_path", null)).toBe("No path found");
    expect(describeTermination(false, "limit_reached", "depth_limit")).toContain("depth limit");
  });
});
