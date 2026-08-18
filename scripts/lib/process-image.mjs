import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const INPUT_DIR = path.join(ROOT, "photos", "originals");
export const THUMB_DIR = path.join(ROOT, "photos", "thumbs");
export const FULL_DIR = path.join(ROOT, "photos", "full");
export const GALLERY_DATA = path.join(ROOT, "photos", "gallery-data.js");

export const THUMB_SIZE = 1000;
export const FULL_SIZE = 2000;
export const QUALITY = 82;
export const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "photo"
  );
}

export async function uniqueBaseName(slug) {
  let index = 1;
  let baseName = `${slug}.jpg`;

  while (
    (await exists(path.join(THUMB_DIR, baseName))) ||
    (await exists(path.join(FULL_DIR, baseName))) ||
    (await exists(path.join(INPUT_DIR, baseName)))
  ) {
    index += 1;
    baseName = `${slug}-${index}.jpg`;
  }

  return baseName;
}

export async function processImageFile(sourcePath, baseName, onLog = () => {}) {
  await mkdir(THUMB_DIR, { recursive: true });
  await mkdir(FULL_DIR, { recursive: true });

  const thumbOut = path.join(THUMB_DIR, baseName);
  const fullOut = path.join(FULL_DIR, baseName);

  onLog(`sharp rotate "${sourcePath}"`);
  const image = sharp(sourcePath).rotate();

  onLog(
    `sharp resize ${THUMB_SIZE}px inside, jpeg q${QUALITY} mozjpeg → photos/thumbs/${baseName}`
  );
  onLog(
    `sharp resize ${FULL_SIZE}px inside, jpeg q${QUALITY} mozjpeg → photos/full/${baseName}`
  );

  await Promise.all([
    image
      .clone()
      .resize({
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(thumbOut),
    image
      .clone()
      .resize({
        width: FULL_SIZE,
        height: FULL_SIZE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(fullOut),
  ]);

  const thumbMeta = await sharp(thumbOut).metadata();
  onLog(`ok ${baseName} thumb ${thumbMeta.width}×${thumbMeta.height}`);

  return {
    file: baseName,
    aspect: `${thumbMeta.width} / ${thumbMeta.height}`,
  };
}

export async function readGallery() {
  const source = await readFile(GALLERY_DATA, "utf8");
  const match = source.match(/const PHOTOGRAPHS\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) {
    throw new Error("Could not parse photos/gallery-data.js");
  }
  return new Function(`return (${match[1]})`)();
}

export async function writeGallery(photos) {
  const body = `const PHOTOGRAPHS = ${JSON.stringify(photos, null, 2)};\n`;
  await writeFile(GALLERY_DATA, body);
}
