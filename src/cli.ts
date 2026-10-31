// Shop sign creator CLI.
//   sign <filename> --template <t> --theme <y> (--text "..." | --file notice.txt)
//                   [--out <dir>] [--paper A4] [--overwrite] [--config-dir <dir>]
//   sign list
//   sign --help

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { loadConfigSet } from "./config/discovery.js";
import { imageExists } from "./assets.js";
import { resolvePaper, DEFAULT_PAPER, PAPER_SIZES } from "./paper.js";
import { linesFromText, linesFromFile } from "./text.js";
import { renderSign } from "./render/renderer.js";
import type { Theme } from "./types.js";

class UserError extends Error {}

interface Args {
  positional: string[];
  flags: Record<string, string>;
  bools: Set<string>;
}

const VALUE_FLAGS = new Set(["template", "theme", "text", "file", "out", "paper", "config-dir", "ink"]);
const INK_LEVELS = new Set(["high", "medium", "low"]);
const BOOL_FLAGS = new Set(["overwrite", "help", "version"]);

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const bools = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") {
      bools.add("help");
      continue;
    }
    if (a.startsWith("--")) {
      const [name, inline] = splitFlag(a.slice(2));
      if (BOOL_FLAGS.has(name)) {
        bools.add(name);
      } else if (VALUE_FLAGS.has(name)) {
        if (inline !== undefined) flags[name] = inline;
        else {
          const next = argv[++i];
          if (next === undefined) throw new UserError(`Flag --${name} needs a value`);
          flags[name] = next;
        }
      } else {
        throw new UserError(`Unknown flag: --${name}`);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags, bools };
}

function splitFlag(s: string): [string, string | undefined] {
  const eq = s.indexOf("=");
  if (eq === -1) return [s, undefined];
  return [s.slice(0, eq), s.slice(eq + 1)];
}

const HELP = `shop sign creator — make a printable PDF notice sign

Usage:
  sign <filename> --template <name> --theme <name> (--text "MESSAGE" | --file notice.txt) [options]
  sign list
  sign --help

Options:
  --template <name>   Layout to use (see: sign list)
  --theme <name>      Look to use (see: sign list)
  --text "MESSAGE"    Notice text; use \\n for multiple lines
  --file <path.txt>   Read notice text from a plain-text file (one notice, any lines)
  --out <dir>         Output directory (default: ./output)
  --paper <size>      Paper size: ${Object.keys(PAPER_SIZES).join(", ")} (default: ${DEFAULT_PAPER})
  --ink <level>       high | medium | low. Filters 'sign list'; on a sign, asserts the
                      chosen theme uses that ink level (handy to keep printing cheap)
  --overwrite         Overwrite the output file if it already exists
  --config-dir <dir>  Extra directory of custom templates/themes
  -h, --help          Show this help

Examples:
  sign closed --template centered --theme festive --text "CLOSED\\nBACK JANUARY 2ND"
  sign notice --template header-body --theme plain --file message.txt --paper A4
`;

function runList(configDir?: string, inkFilter?: string): void {
  const { templates, themes } = loadConfigSet({ explicitDir: configDir });
  console.log("Templates:");
  for (const t of templates.values()) {
    console.log(`  ${t.name}${t.description ? ` — ${t.description}` : ""}`);
  }
  const printTheme = (t: Theme) => {
    const tag = t.seasonal ? " [christmas]" : "";
    console.log(`    ${t.name}${tag}${t.description ? ` — ${t.description}` : ""}`);
  };
  const all = [...themes.values()].filter((t) => !inkFilter || (t.ink ?? "medium") === inkFilter);
  const inkOrder: Array<Theme["ink"]> = ["high", "medium", "low"];
  const heading = inkFilter ? ` (${inkFilter} ink only)` : "";
  const printPalette = (label: string, isMono: boolean) => {
    const group = all.filter((t) => (t.palette === "mono") === isMono);
    if (group.length === 0) return;
    console.log(`\nThemes — ${label}${heading}:`);
    for (const ink of inkOrder) {
      const byInk = group.filter((t) => (t.ink ?? "medium") === ink);
      if (byInk.length === 0) continue;
      console.log(`  ${ink} ink:`);
      for (const t of byInk) printTheme(t);
    }
  };
  printPalette("black & white", true);
  printPalette("colour", false);
}

async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.bools.has("help") || (args.positional.length === 0 && Object.keys(args.flags).length === 0 && args.bools.size === 0)) {
    console.log(HELP);
    return 0;
  }

  const ink = args.flags.ink;
  if (ink !== undefined && !INK_LEVELS.has(ink)) {
    throw new UserError(`--ink must be one of ${[...INK_LEVELS].join(", ")}`);
  }

  if (args.positional[0] === "list") {
    runList(args.flags["config-dir"], ink);
    return 0;
  }

  const filenameArg = args.positional[0];
  if (!filenameArg) throw new UserError("An output filename is required. See: sign --help");

  const templateName = required(args.flags, "template");
  const themeName = required(args.flags, "theme");

  if (!args.flags.text && !args.flags.file) {
    throw new UserError("Provide the notice text with --text or --file");
  }
  if (args.flags.text && args.flags.file) {
    throw new UserError("Use only one of --text or --file, not both");
  }

  const { templates, themes } = loadConfigSet({ explicitDir: args.flags["config-dir"] });
  const template = templates.get(templateName);
  if (!template) {
    throw new UserError(`Unknown template "${templateName}". Available: ${[...templates.keys()].join(", ")}`);
  }
  const theme = themes.get(themeName);
  if (!theme) {
    throw new UserError(`Unknown theme "${themeName}". Available: ${[...themes.keys()].join(", ")}`);
  }
  if (ink !== undefined && (theme.ink ?? "medium") !== ink) {
    throw new UserError(
      `Theme "${theme.name}" is ${theme.ink ?? "medium"} ink, but --ink ${ink} was requested. ` +
        `See low-ink options with: sign list --ink ${ink}`,
    );
  }

  if (theme.image && !imageExists(theme.image.file)) {
    throw new UserError(
      `Theme "${theme.name}" needs the image "${theme.image.file}". ` +
        `Add it under assets/images/ (or beside the executable) and try again.`,
    );
  }

  const paper = resolvePaper(args.flags.paper ?? DEFAULT_PAPER);

  let lines: string[];
  if (args.flags.file) {
    if (!existsSync(args.flags.file)) throw new UserError(`Text file not found: ${args.flags.file}`);
    lines = linesFromFile(args.flags.file);
  } else {
    lines = linesFromText(args.flags.text!);
  }
  if (lines.length === 0) throw new UserError("The notice text is empty");

  // Resolve output path.
  const outDir = args.flags.out ?? join(process.cwd(), "output");
  const fileName = extname(filenameArg) ? filenameArg : `${filenameArg}.pdf`;
  const outPath = resolve(outDir, fileName);

  if (existsSync(outPath) && !args.bools.has("overwrite")) {
    console.error(`Warning: ${outPath} already exists. Re-run with --overwrite to replace it.`);
    return 1;
  }

  const pdf = await renderSign({ template, theme, paper, lines });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, pdf);
  console.log(`Created ${outPath}  (${template.name} / ${theme.name}, ${paper.name}, ${lines.length} line${lines.length === 1 ? "" : "s"})`);
  return 0;
}

function required(flags: Record<string, string>, name: string): string {
  const v = flags[name];
  if (!v) throw new UserError(`Flag --${name} is required. See: sign --help`);
  return v;
}

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof UserError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    console.error("Unexpected error:", err instanceof Error ? err.message : err);
    process.exit(2);
  });
