import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import {
  EXTENSIONS,
  INPUT_DIR,
  processImageFile,
} from "./lib/process-image.mjs";

const files = (await readdir(INPUT_DIR)).filter((file) =>
  EXTENSIONS.has(path.extname(file).toLowerCase())
);

if (files.length === 0) {
  console.log(`No images found in ${INPUT_DIR}`);
  console.log("For drag-and-drop ingest, run: npm run add-photos");
  process.exit(0);
}

await mkdir(INPUT_DIR, { recursive: true });

console.log(`Processing ${files.length} image(s)…`);

for (const file of files) {
  const baseName = `${path.parse(file).name}.jpg`;
  const result = await processImageFile(path.join(INPUT_DIR, file), baseName, console.log);
  console.log(`  ${file} → ${result.file} (${result.aspect.replace(" / ", "×")} thumb)`);
  console.log(`    image: "photos/thumbs/${result.file}",`);
  console.log(`    imageHiRes: "photos/full/${result.file}",`);
  console.log(`    aspect: "${result.aspect}",`);
  console.log("");
}
