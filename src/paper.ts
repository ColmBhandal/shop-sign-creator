// Paper sizes in PDF points (1pt = 1/72"). Portrait by default.
// Adding a new size here is all it takes to support it — render logic is size-agnostic.

import type { PaperSize } from "./types.js";

const MM_PER_PT = 25.4 / 72;
function mm(widthMm: number, heightMm: number): { widthPt: number; heightPt: number } {
  return { widthPt: widthMm / MM_PER_PT, heightPt: heightMm / MM_PER_PT };
}

export const PAPER_SIZES: Record<string, PaperSize> = {
  A4: { name: "A4", ...mm(210, 297) },
  A3: { name: "A3", ...mm(297, 420) },
  A5: { name: "A5", ...mm(148, 210) },
  Letter: { name: "Letter", widthPt: 612, heightPt: 792 },
};

export const DEFAULT_PAPER = "A4";

export function resolvePaper(name: string): PaperSize {
  const key = Object.keys(PAPER_SIZES).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) {
    throw new Error(
      `Unknown paper size "${name}". Available: ${Object.keys(PAPER_SIZES).join(", ")}`,
    );
  }
  return PAPER_SIZES[key];
}
