import type { DeckLike, MatrixCell } from "@/lib/analytics";

export type MatchupSort = "count" | "win-desc" | "win-asc";
export type AnalysisMatrix = { myDeck: DeckLike; cells: MatrixCell[] }[];

/** Presentation only: retain the existing matrix values and ID boundaries. */
export function selectAnalysisMatchups(matrix: AnalysisMatrix, sort: MatchupSort, minimum: number, selectedDeckId = "") {
  return matrix.filter(row => !selectedDeckId || row.myDeck.id === selectedDeckId).map(row => ({
    myDeck: row.myDeck,
    total: row.cells.reduce((sum, cell) => sum + cell.total, 0),
    cells: row.cells.filter(cell => cell.total > 0 && cell.total >= minimum).sort((a, b) => {
      if (sort !== "count") {
        if (a.winRate === null) return b.winRate === null ? b.total - a.total : 1;
        if (b.winRate === null) return -1;
        const difference = sort === "win-desc" ? b.winRate - a.winRate : a.winRate - b.winRate;
        if (difference) return difference;
      }
      return b.total - a.total;
    })
  })).filter(row => row.total > 0).sort((a, b) => b.total - a.total);
}
