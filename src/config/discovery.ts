// Build the available set of templates and themes by merging:
//   1. built-in defaults (bundled / embedded)
//   2. any external config dirs (so new signs can be dropped in without a rebuild)
//
// Later sources override earlier ones by name, enabling customisation.

import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ConfigSet, Template, Theme } from "../types.js";
import {
  loadDefaultRawConfigs,
  readConfigsFromDir,
  executableDir,
  type RawConfigSet,
} from "../assets.js";
import { parseTemplate, parseTheme } from "./schema.js";

export interface DiscoveryOptions {
  /** Extra directory to scan (from --config-dir). */
  explicitDir?: string;
}

/** Candidate external config directories, in increasing priority. */
export function externalConfigDirs(opts: DiscoveryOptions = {}): string[] {
  const dirs: string[] = [];
  const beside = join(executableDir(), "configs");
  if (existsSync(beside)) dirs.push(beside);

  const cwdDir = join(process.cwd(), "configs");
  if (existsSync(cwdDir) && !dirs.includes(cwdDir)) dirs.push(cwdDir);

  const env = process.env.SIGN_CONFIG_DIR;
  if (env && existsSync(env)) dirs.push(env);

  if (opts.explicitDir && existsSync(opts.explicitDir)) dirs.push(opts.explicitDir);
  return dirs;
}

export function loadConfigSet(opts: DiscoveryOptions = {}): ConfigSet {
  const templates = new Map<string, Template>();
  const themes = new Map<string, Theme>();

  const sources: RawConfigSet[] = [loadDefaultRawConfigs()];
  for (const dir of externalConfigDirs(opts)) {
    sources.push(readConfigsFromDir(dir));
  }

  for (const src of sources) {
    for (const raw of src.templates) {
      const t = parseTemplate(raw);
      templates.set(t.name, t);
    }
    for (const raw of src.themes) {
      const th = parseTheme(raw);
      themes.set(th.name, th);
    }
  }

  return { templates, themes };
}
