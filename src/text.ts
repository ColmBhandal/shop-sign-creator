// Notice text comes from either --text (with literal or escaped newlines) or
// --file <path.txt>. Normalise both into an array of trimmed, non-empty lines.

import { readFileSync } from "node:fs";

export function linesFromText(text: string): string[] {
  // Allow users to type \n in a shell-quoted --text value as an escape.
  const normalised = text.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  return splitLines(normalised);
}

export function linesFromFile(path: string): string[] {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return splitLines(raw);
}

function splitLines(s: string): string[] {
  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines;
}
