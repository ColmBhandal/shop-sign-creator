import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfigSet } from "../src/config/discovery.js";
import { parseTemplate, parseTheme, ConfigError } from "../src/config/schema.js";
import { resolvePaper, PAPER_SIZES } from "../src/paper.js";
import { linesFromText } from "../src/text.js";
import { renderSign, renderHoursSign } from "../src/render/renderer.js";
import { parseHours } from "../src/hours.js";
import { imageExists } from "../src/assets.js";

test("default config set has the expected templates and themes", () => {
  const { templates, themes } = loadConfigSet();
  assert.ok(templates.has("centered"));
  assert.ok(templates.has("header-body"));
  for (const name of ["plain", "festive", "winter", "jolly", "trimmings", "sketch", "frosty"]) {
    assert.ok(themes.has(name), `theme ${name} should exist`);
  }
  const seasonal = [...themes.values()].filter((t) => t.seasonal);
  assert.ok(seasonal.length >= 6, "at least six Christmas themes");
});

test("themes cover all ink levels with at least two each", () => {
  const { themes } = loadConfigSet();
  for (const ink of ["high", "medium", "low"] as const) {
    const n = [...themes.values()].filter((t) => (t.ink ?? "medium") === ink).length;
    assert.ok(n >= 2, `expected >= 2 themes with ${ink} ink, got ${n}`);
  }
});

test("themes split into black & white (mono) and colour; plain is mono", () => {
  const { themes } = loadConfigSet();
  assert.equal(themes.get("plain")!.palette, "mono");
  const mono = [...themes.values()].filter((t) => t.palette === "mono");
  assert.ok(mono.length >= 1, "at least one black & white theme");
  assert.equal(themes.get("festive")!.palette, "colour");
});

test("parseTemplate rejects out-of-range coordinates", () => {
  assert.throws(
    () => parseTemplate({ name: "bad", regions: [{ id: "r", x: 2, y: 0, width: 1, height: 1 }] }),
    ConfigError,
  );
});

test("parseTheme rejects a non-hex colour", () => {
  assert.throws(
    () => parseTheme({ name: "bad", font: "oswald", colors: { background: "green", text: "#000" } }),
    ConfigError,
  );
});

test("paper sizes resolve case-insensitively and A4 is taller than wide", () => {
  const a4 = resolvePaper("a4");
  assert.equal(a4.name, "A4");
  assert.ok(a4.heightPt > a4.widthPt);
  assert.throws(() => resolvePaper("A1"));
});

test("linesFromText splits on literal and escaped newlines, trimming blanks", () => {
  assert.deepEqual(linesFromText("CLOSED\\nBACK SOON"), ["CLOSED", "BACK SOON"]);
  assert.deepEqual(linesFromText("  ONE \n\n TWO "), ["ONE", "TWO"]);
});

test("renderSign produces a valid PDF for every template x theme", async () => {
  const { templates, themes } = loadConfigSet();
  for (const template of templates.values()) {
    for (const theme of themes.values()) {
      // Skip photo themes whose image file isn't present in this checkout.
      if (theme.image && !imageExists(theme.image.file)) continue;
      const pdf = await renderSign({
        template,
        theme,
        paper: PAPER_SIZES.A4,
        lines: ["CLOSED", "BACK JANUARY 2ND"],
      });
      const head = Buffer.from(pdf.slice(0, 5)).toString("latin1");
      assert.equal(head, "%PDF-", `${template.name}/${theme.name} should be a PDF`);
      assert.ok(pdf.length > 1000, "PDF should have real content");
    }
  }
});

test("image theme parses with a background image + scrim", () => {
  const { themes } = loadConfigSet();
  const snow = themes.get("snowscape");
  assert.ok(snow, "snowscape theme should exist");
  assert.equal(snow!.image?.placement, "background");
  assert.equal(snow!.image?.file, "snowscape.png");
  assert.equal(snow!.ink, "high");
});

test("renderSign works on a non-A4 paper size (A3)", async () => {
  const { templates, themes } = loadConfigSet();
  const pdf = await renderSign({
    template: templates.get("centered")!,
    theme: themes.get("plain")!,
    paper: PAPER_SIZES.A3,
    lines: ["SALE"],
  });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString("latin1"), "%PDF-");
});

test("parseHours splits day and hours at the first colon", () => {
  assert.deepEqual(parseHours(["Monday: 09:00-17:30", "Sunday: CLOSED"]), [
    { day: "Monday", hours: "09:00-17:30" },
    { day: "Sunday", hours: "CLOSED" },
  ]);
  assert.throws(() => parseHours(["Monday 9-5"]));
});

test("renderHoursSign produces a PDF for every theme", async () => {
  const { themes } = loadConfigSet();
  for (const theme of themes.values()) {
    if (theme.image && !imageExists(theme.image.file)) continue;
    const pdf = await renderHoursSign({
      theme,
      paper: PAPER_SIZES.A4,
      business: "Test Shop",
      subheading: "Opening Hours",
      rows: parseHours(["Monday: 9-5", "Tuesday: CLOSED (open bank holidays)"]),
    });
    assert.equal(Buffer.from(pdf.slice(0, 5)).toString("latin1"), "%PDF-", `${theme.name} should be a PDF`);
  }
});
