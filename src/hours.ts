// Opening-hours input: one "Day: hours" entry per line. Split at the first colon so the
// hours text may itself contain colons (e.g. "Monday: 09:00-17:30").

import type { HoursRow } from "./types.js";

export function parseHours(lines: string[]): HoursRow[] {
  return lines.map((line) => {
    const i = line.indexOf(":");
    const day = i === -1 ? "" : line.slice(0, i).trim();
    const hours = i === -1 ? "" : line.slice(i + 1).trim();
    if (!day || !hours) {
      throw new Error(`Opening hours line "${line}" should look like "Monday: 9.30-5.30"`);
    }
    return { day, hours };
  });
}
