// Generate PWA icon PNGs from the Tusk brand mark (public/icons/tusk-mark.png).
// Run: node scripts/generate-pwa-icons.mjs
// To rebrand: drop a new square master at public/icons/tusk-mark.png and re-run.
//
// The mark sits on a flat light-gray field (#E0E0E0). "any"/apple icons are
// full-bleed; maskable icons scale the art to the central 80% safe zone (padded
// with the same gray, which is therefore invisible) so circular/squircle masks
// never clip the elephant.

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const src = join(iconsDir, "tusk-mark.png");
const BG = { r: 224, g: 224, b: 224 }; // #E0E0E0 — the mark's native background

const fullBleed = [
  { name: "icon-512.png", size: 512 },
  { name: "icon-192.png", size: 192 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-32.png", size: 32 },
];

const maskable = [
  { name: "maskable-512.png", size: 512 },
  { name: "maskable-192.png", size: 192 },
];

const SAFE = 0.8; // maskable safe-zone fraction

const run = async () => {
  for (const t of fullBleed) {
    await sharp(src)
      .resize(t.size, t.size, { fit: "cover" })
      .flatten({ background: BG })
      .png()
      .toFile(join(iconsDir, t.name));
    console.log("wrote", t.name);
  }
  for (const t of maskable) {
    const inner = Math.round(t.size * SAFE);
    const art = await sharp(src)
      .resize(inner, inner, { fit: "cover" })
      .flatten({ background: BG })
      .png()
      .toBuffer();
    await sharp({
      create: { width: t.size, height: t.size, channels: 3, background: BG },
    })
      .composite([{ input: art, gravity: "center" }])
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
