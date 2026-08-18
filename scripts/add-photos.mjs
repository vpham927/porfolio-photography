import { createServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import exifr from "exifr";
import { RECIPES, DEFAULT_CAMERA, DEFAULT_LENS } from "./recipes.mjs";
import {
  GALLERY_DATA,
  INPUT_DIR,
  processImageFile,
  readGallery,
  slugify,
  uniqueBaseName,
  writeGallery,
} from "./lib/process-image.mjs";

const HOST = "127.0.0.1";
const PORT = 3847;
const HTML_PATH = path.resolve(import.meta.dirname, "add-photos.html");
const MAX_BYTES = 80 * 1024 * 1024;
const logClients = new Set();
const logHistory = [];

function emitLog(message, level = "info") {
  const line = String(message);
  const entry = {
    time: new Date().toISOString().slice(11, 23),
    level,
    message: line,
  };
  if (level === "error") console.error(line);
  else console.log(line);

  logHistory.push(entry);
  if (logHistory.length > 300) logHistory.shift();

  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of logClients) {
    client.write(payload);
  }
  return entry;
}

function send(res, status, body, type = "application/json") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function formatShutter(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  const number = Number(value);
  if (number >= 1) return `${Number(number.toFixed(1))}s`;
  return `1/${Math.max(1, Math.round(1 / number))}s`;
}

function formatAperture(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  const number = Number(value);
  const pretty = Number.isInteger(number) ? String(number) : String(number);
  return `f/${pretty}`;
}

async function parseExif(buffer) {
  try {
    const exif = await exifr.parse(buffer, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: false,
    });
    if (!exif) return {};

    const model = exif.Model || "";
    const make = exif.Make || "";
    let camera = model;
    if (model && make && !model.toLowerCase().includes(make.split(" ")[0].toLowerCase())) {
      camera = `${make} ${model}`.trim();
    }

    return {
      camera: camera || "",
      lens: exif.LensModel || exif.Lens || "",
      iso: exif.ISO != null ? String(exif.ISO) : "",
      shutter: formatShutter(exif.ExposureTime),
      aperture: formatAperture(exif.FNumber),
    };
  } catch {
    return {};
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      throw new Error("File is too large (max 80MB).");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, await readFile(HTML_PATH, "utf8"), "text/html");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/logs") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      for (const entry of logHistory) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
      logClients.add(res);
      req.on("close", () => logClients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/recipes") {
      send(res, 200, {
        defaults: { camera: DEFAULT_CAMERA, lens: DEFAULT_LENS },
        recipes: Object.keys(RECIPES),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/preview") {
      emitLog(`POST /api/preview (${(Number(req.headers["content-length"]) || 0) / 1024 | 0} KB)`);
      const buffer = await readBody(req);
      const exif = await parseExif(buffer);
      emitLog(
        `exif camera="${exif.camera || DEFAULT_CAMERA}" lens="${exif.lens || DEFAULT_LENS}" iso=${exif.iso || "—"} ${exif.shutter || "—"} ${exif.aperture || "—"}`
      );
      send(res, 200, {
        camera: exif.camera || DEFAULT_CAMERA,
        lens: exif.lens || DEFAULT_LENS,
        iso: exif.iso,
        shutter: exif.shutter,
        aperture: exif.aperture,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/photo") {
      const payload = JSON.parse((await readBody(req)).toString("utf8"));
      const title = String(payload.title || "").trim();
      const recipeTitle = String(payload.recipeTitle || "None");
      emitLog(`POST /api/photo title="${title}" recipe="${recipeTitle}"`);

      if (!title) {
        emitLog("error: Title is required.", "error");
        send(res, 400, { error: "Title is required." });
        return;
      }
      if (!(recipeTitle in RECIPES)) {
        emitLog(`error: Unknown recipe "${recipeTitle}".`, "error");
        send(res, 400, { error: "Unknown recipe." });
        return;
      }
      if (!payload.data) {
        emitLog("error: Image data is missing.", "error");
        send(res, 400, { error: "Image data is missing." });
        return;
      }

      const buffer = Buffer.from(payload.data, "base64");
      await mkdir(INPUT_DIR, { recursive: true });

      const baseName = await uniqueBaseName(slugify(title));
      const originalPath = path.join(INPUT_DIR, baseName);
      emitLog(`write photos/originals/${baseName} (${Math.round(buffer.length / 1024)} KB)`);
      await writeFile(originalPath, buffer);

      const processed = await processImageFile(originalPath, baseName, (line) => emitLog(line));
      emitLog(`read ${GALLERY_DATA}`);
      const photos = await readGallery();
      const entry = {
        title,
        image: `photos/thumbs/${processed.file}`,
        imageHiRes: `photos/full/${processed.file}`,
        alt: String(payload.alt || title).trim(),
        aspect: processed.aspect,
        camera: String(payload.camera || DEFAULT_CAMERA).trim(),
        lens: String(payload.lens || DEFAULT_LENS).trim(),
        iso: String(payload.iso || "").trim(),
        shutter: String(payload.shutter || "").trim(),
        aperture: String(payload.aperture || "").trim(),
        recipeTitle,
        recipe: { ...RECIPES[recipeTitle] },
      };

      const description = String(payload.description || "").trim();
      if (description) entry.description = description;

      photos.push(entry);
      emitLog(`append gallery entry "${title}" → photos/gallery-data.js (${photos.length} photos)`);
      await writeGallery(photos);
      emitLog(`done ${processed.file}`);

      send(res, 200, { ok: true, file: processed.file, aspect: processed.aspect });
      return;
    }

    send(res, 404, { error: "Not found." });
  } catch (error) {
    emitLog(error.stack || error.message || "Server error.", "error");
    send(res, 500, { error: error.message || "Server error." });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  emitLog(`Add photos: ${url}`);
  emitLog("Drop images, pick a recipe, then add them to the gallery.");
  emitLog(`Gallery data: ${GALLERY_DATA}`);
  exec(`open "${url}"`);
});
