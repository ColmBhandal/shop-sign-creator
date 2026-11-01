// Asset loading, aware of two runtimes:
//  - dev / bundled-with-Node: read fonts + default configs from the filesystem
//  - Node SEA standalone exe: read them from assets embedded in the executable
//
// External (user-added) template/theme configs are always read from the
// filesystem so new signs can be added without rebuilding — see discovery.ts.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// Works in both ESM (dev via tsx) and the CJS bundle (import.meta.url is empty there).
const req = createRequire(import.meta.url || process.execPath);

/** Font key -> vendored TTF filename (all OFL / open source). */
export const FONT_REGISTRY: Record<string, string> = {
  oswald: "Oswald-Bold.ttf",
  "mountains-of-christmas": "MountainsOfChristmas-Bold.ttf",
  // Stand-in approximating Vapourpal's Nunito for the frame themes; point at a Nunito TTF to swap.
  "cool-blue": "Oswald-Bold.ttf",
};

interface SeaApi {
  isSea(): boolean;
  getAsset(key: string): ArrayBuffer;
  getRawAsset?: (key: string) => ArrayBuffer;
}

function sea(): SeaApi | null {
  try {
    // node:sea only exists on supported Node versions; guard the require.
    return req("node:sea") as SeaApi;
  } catch {
    return null;
  }
}

export function isSeaRuntime(): boolean {
  const api = sea();
  try {
    return !!api && api.isSea();
  } catch {
    return false;
  }
}

/** Directory of this module, resolved for both ESM (dev) and the CJS bundle. */
function moduleDir(): string {
  try {
    if (import.meta.url) return dirname(fileURLToPath(import.meta.url));
  } catch {
    // import.meta not available in the CJS bundle; fall through.
  }
  // esbuild provides __dirname in the CJS bundle; typeof is safe when undeclared.
  if (typeof __dirname !== "undefined") return __dirname;
  return dirname(process.argv[1] ?? process.cwd());
}

/** Repo root when running from source (dev) or from the bundled dist. */
function packageRoot(): string {
  // Walk up until we find package.json.
  let dir = moduleDir();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return join(moduleDir(), "..");
}

/** Raw bytes of a vendored font file, by registry key. */
export function getFontBytes(fontKey: string): Uint8Array {
  const file = FONT_REGISTRY[fontKey];
  if (!file) {
    throw new Error(
      `Unknown font "${fontKey}". Known fonts: ${Object.keys(FONT_REGISTRY).join(", ")}`,
    );
  }
  if (isSeaRuntime()) {
    const buf = sea()!.getAsset(file);
    return new Uint8Array(buf);
  }
  return new Uint8Array(readFileSync(join(packageRoot(), "assets", "fonts", file)));
}

/** True if a SEA asset with this key is embedded. */
function seaHasAsset(key: string): boolean {
  if (!isSeaRuntime()) return false;
  try {
    sea()!.getAsset(key);
    return true;
  } catch {
    return false;
  }
}

/** Directories searched for theme images (user-supplied PNG/JPG). */
export function imageSearchDirs(): string[] {
  const dirs = [join(packageRoot(), "assets", "images")];
  const exe = executableDir();
  dirs.push(join(exe, "assets", "images"));
  dirs.push(join(exe, "images"));
  const cwd = join(process.cwd(), "assets", "images");
  if (!dirs.includes(cwd)) dirs.push(cwd);
  return dirs;
}

function findImagePath(file: string): string | null {
  for (const dir of imageSearchDirs()) {
    const p = join(dir, file);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Whether a theme image is available (embedded in the exe or on disk). */
export function imageExists(file: string): boolean {
  return seaHasAsset(file) || findImagePath(file) !== null;
}

/** Raw bytes of a theme image. Throws if it cannot be found. */
export function getImageBytes(file: string): Uint8Array {
  if (seaHasAsset(file)) return new Uint8Array(sea()!.getAsset(file));
  const p = findImagePath(file);
  if (!p) {
    throw new Error(
      `Image "${file}" not found. Add it to one of: ${imageSearchDirs().join(", ")}`,
    );
  }
  return new Uint8Array(readFileSync(p));
}

/** The combined default template + theme definitions shipped with the tool. */
export interface RawConfigSet {
  templates: unknown[];
  themes: unknown[];
}

/**
 * Load the built-in default configs.
 * SEA: from the embedded `defaults.json` asset (generated at build time).
 * Dev: assembled on the fly from `configs/` so edits are picked up live.
 */
export function loadDefaultRawConfigs(): RawConfigSet {
  if (isSeaRuntime()) {
    const text = Buffer.from(sea()!.getAsset("defaults.json")).toString("utf8");
    return JSON.parse(text) as RawConfigSet;
  }
  return readConfigsFromDir(join(packageRoot(), "configs"));
}

/** The directory that sits next to the running executable (SEA) or cwd. */
export function executableDir(): string {
  if (isSeaRuntime()) return dirname(process.execPath);
  return process.cwd();
}

export function packageConfigsDir(): string {
  return join(packageRoot(), "configs");
}

// --- shared filesystem config reader (used by dev defaults and external dirs) ---

import { readdirSync } from "node:fs";

export function readConfigsFromDir(baseDir: string): RawConfigSet {
  const templates: unknown[] = [];
  const themes: unknown[] = [];
  const templatesDir = join(baseDir, "templates");
  const themesDir = join(baseDir, "themes");

  for (const f of listJson(templatesDir, ".template.json")) {
    templates.push(JSON.parse(readFileSync(f, "utf8")));
  }
  for (const f of listJson(themesDir, ".theme.json")) {
    themes.push(JSON.parse(readFileSync(f, "utf8")));
  }
  return { templates, themes };
}

/** Recursively collect files ending with `suffix` under `dir` (themes are grouped by ink). */
function listJson(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJson(full, suffix));
    else if (entry.name.toLowerCase().endsWith(suffix)) out.push(full);
  }
  return out.sort();
}
