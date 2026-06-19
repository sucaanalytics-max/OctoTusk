// Generate PWA icon PNGs from public/icons/icon.svg.
// Run: node scripts/generate-pwa-icons.mjs
// Replace icon.svg with the real brand art and re-run to regenerate all sizes.

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const src = readFileSync(join(iconsDir, "icon.svg"));
const BG = "#0F1117"; // dark theme background — apple-touch + maskable must be opaque

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "maskable-192.png", size: 192 },
  { name: "maskable-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

const run = async () => {
  for (const t of targets) {
    await sharp(src)
      .resize(t.size, t.size)
      .flatten({ background: BG })
      .png()
      .toFile(join(iconsDir, t.name));
    console.log("wrote", t.name);
  }
  console.log("done");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
