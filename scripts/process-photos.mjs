import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const INPUT_DIR = path.join(ROOT, "photos", "originals");
const THUMB_DIR = path.join(ROOT, "photos", "thumbs");
const FULL_DIR = path.join(ROOT, "photos", "full");

const THUMB_SIZE = 1000;
const FULL_SIZE = 2000;
const QUALITY = 82;
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

async function processImage(file) {
  const source = path.join(INPUT_DIR, file);
  const baseName = `${path.parse(file).name}.jpg`;
  const thumbOut = path.join(THUMB_DIR, baseName);
  const fullOut = path.join(FULL_DIR, baseName);

  const image = sharp(source).rotate();

  await Promise.all([
    image
      .clone()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(thumbOut),
    image
      .clone()
      .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(fullOut),
  ]);

  const thumbMeta = await sharp(thumbOut).metadata();
  console.log(`  ${file} → ${baseName} (${thumbMeta.width}×${thumbMeta.height} thumb)`);

  return {
    file: baseName,
    aspect: `${thumbMeta.width} / ${thumbMeta.height}`,
  };
}

const files = (await readdir(INPUT_DIR)).filter((file) =>
  EXTENSIONS.has(path.extname(file).toLowerCase())
);

if (files.length === 0) {
  console.log(`No images found in ${INPUT_DIR}`);
  console.log("Drop camera JPEGs in that folder, then run: npm run photos");
  process.exit(0);
}

await mkdir(THUMB_DIR, { recursive: true });
await mkdir(FULL_DIR, { recursive: true });

console.log(`Processing ${files.length} image(s)…`);
const results = [];

for (const file of files) {
  results.push(await processImage(file));
}

console.log("\nDone. Point script.js entries at:");
for (const result of results) {
  console.log(`    image: "photos/thumbs/${result.file}",`);
  console.log(`    imageHiRes: "photos/full/${result.file}",`);
  console.log(`    aspect: "${result.aspect}",`);
  console.log("");
}
