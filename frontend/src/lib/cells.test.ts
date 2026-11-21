import { describe, expect, it } from "vitest";
import { cellKey, formatCell, keyToCell, parseCell } from "./cells";

describe("parseCell", () => {
  it("parses the backend's (row,col) format", () => {
    // Regression: split(",").map(Number) turned this into {NaN, NaN}.
    expect(parseCell("(2,3)")).toEqual({ row: 2, col: 3 });
    expect(parseCell("(14,19)")).toEqual({ row: 14, col: 19 });
  });
  it("also accepts bare and spaced forms", () => {
    expect(parseCell("2,3")).toEqual({ row: 2, col: 3 });
    expect(parseCell(" ( 2 , 3 ) ")).toEqual({ row: 2, col: 3 });
  });
  it("rejects garbage instead of returning NaN", () => {
    for (const bad of ["", "(a,b)", "(1)", "(1,2,3)", "cell"]) {
      expect(parseCell(bad)).toBeNull();
    }
  });
  it("round-trips with formatCell and cellKey", () => {
    expect(parseCell(formatCell({ row: 5, col: 7 }))).toEqual({ row: 5, col: 7 });
    expect(keyToCell(cellKey(5, 7))).toEqual({ row: 5, col: 7 });
  });
});
