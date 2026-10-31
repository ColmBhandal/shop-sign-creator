// Re-copy the OFL fonts from the @expo-google-fonts dev packages into assets/fonts/.
// Run after a fresh install to reproduce the vendored TTFs + licences.
import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = join(root, "assets", "fonts");
mkdirSync(fontsDir, { recursive: true });

const jobs = [
  {
    ttf: "@expo-google-fonts/oswald/700Bold/Oswald_700Bold.ttf",
    out: "Oswald-Bold.ttf",
    license: "@expo-google-fonts/oswald/LICENSE",
    licenseOut: "LICENSE-Oswald.txt",
  },
  {
    ttf: "@expo-google-fonts/mountains-of-christmas/700Bold/MountainsofChristmas_700Bold.ttf",
    out: "MountainsOfChristmas-Bold.ttf",
    license: "@expo-google-fonts/mountains-of-christmas/LICENSE",
    licenseOut: "LICENSE-MountainsOfChristmas.txt",
  },
];

for (const j of jobs) {
  copyFileSync(join(root, "node_modules", j.ttf), join(fontsDir, j.out));
  copyFileSync(join(root, "node_modules", j.license), join(fontsDir, j.licenseOut));
  console.log(`Vendored ${j.out} (+ licence)`);
}
