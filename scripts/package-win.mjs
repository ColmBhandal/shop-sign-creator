// Produce a standalone Windows sign.exe using Node's Single Executable App (SEA).
// Output goes to dist-win/ (gitignored). The target PC needs nothing installed.
//
// Run on Windows (or a Windows CI runner) with a Node >= 22 that supports SEA.
//   npm run package:win
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = join(root, "dist-win");

function sh(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
}

if (process.platform !== "win32") {
  console.warn("Warning: building a Windows .exe is only reliable on Windows. Continuing anyway.");
}

// 1. Bundle + generate defaults.json
sh(process.execPath, [join(root, "scripts", "build.mjs")]);

// 2. Generate the SEA blob (uses the generated config that also embeds theme images)
sh(process.execPath, ["--experimental-sea-config", join(root, "dist", "sea-config.generated.json")]);

// 3. Fresh output dir with the Node binary renamed to sign.exe
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const exePath = join(outDir, "sign.exe");
copyFileSync(process.execPath, exePath);

// 4. Inject the blob with postject
sh("npx", [
  "-y",
  "postject",
  exePath,
  "NODE_SEA_BLOB",
  join(dist, "sea-prep.blob"),
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
]);

// 5. Ship a sample external configs dir beside the exe so users can add their own
//    templates/themes without rebuilding (defaults are already embedded).
cpSync(join(root, "configs"), join(outDir, "configs"), { recursive: true });
for (const f of ["README.md"]) {
  if (existsSync(join(root, f))) copyFileSync(join(root, f), join(outDir, f));
}

console.log(`\nDone. Standalone build at: ${outDir}\\sign.exe`);
console.log("Zip dist-win/ and hand it over — the target PC needs nothing installed.");
