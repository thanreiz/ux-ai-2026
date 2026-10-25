import type { Bill } from "./types";

// PRD FR01.03: re-read once with the stronger model when 3+ fields are unreadable
// or the lines do not add up to the stated total (within 1%).
export function isShaky(b: Bill): boolean {
  const calc = b.lines.filter((l) => l.category !== "deduction").reduce((s, l) => s + l.amount, 0);
  return b.lines.filter((l) => l.lowConfidence).length >= 3 || (b.total > 0 && Math.abs(calc - b.total) > b.total * 0.01);
}

export const lowCount = (b: Bill) => b.lines.filter((l) => l.lowConfidence).length;
