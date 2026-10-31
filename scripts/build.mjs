// Build step:
//   1. Bundle the TS CLI into a single CommonJS file (dist/sign.cjs) with esbuild.
//   2. Generate dist/defaults.json (all built-in templates + themes combined),
//      which the standalone exe embeds as a SEA asset.
import { build } from "esbuild";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

// 1. Bundle
await build({
  entryPoints: [join(root, "src", "cli.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: join(dist, "sign.cjs"),
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

// 2. Combine default configs for embedding
function readDir(dir, suffix) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, suffix));
    else if (entry.name.toLowerCase().endsWith(suffix)) files.push(full);
  }
  return files.sort().map((f) => JSON.parse(readFileSync(f, "utf8")));
}
function collect(dir, suffix) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full, suffix));
    else if (entry.name.toLowerCase().endsWith(suffix)) out.push(full);
  }
  return out;
}
const defaults = {
  templates: readDir(join(root, "configs", "templates"), ".template.json"),
  themes: readDir(join(root, "configs", "themes"), ".theme.json"),
};
writeFileSync(join(dist, "defaults.json"), JSON.stringify(defaults));
console.log(
  `Wrote dist/defaults.json (${defaults.templates.length} templates, ${defaults.themes.length} themes)`,
);

// 3. Generate a SEA config that also embeds any theme images present at build time.
const seaConfig = JSON.parse(readFileSync(join(root, "sea-config.json"), "utf8"));
const imagesDir = join(root, "assets", "images");
let imageCount = 0;
if (existsSync(imagesDir)) {
  for (const f of readdirSync(imagesDir)) {
    if (/\.(png|jpe?g)$/i.test(f)) {
      seaConfig.assets[f] = `assets/images/${f}`;
      imageCount++;
    }
  }
}
writeFileSync(join(dist, "sea-config.generated.json"), JSON.stringify(seaConfig, null, 2));
console.log(`Wrote dist/sea-config.generated.json (${imageCount} theme image(s) embedded)`);
