import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";
import { initPinecone } from "../utils/pinecone.js";
import { getEmbeddings } from "../utils/embeddings.js";
import { chunkByAyah, extractEmbedText } from "../utils/chunker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCE_DIR = path.resolve(__dirname, "../resource");
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
}

const FORCE = process.argv.includes("--force");
const fileArgIndex = process.argv.indexOf("--file");
const TARGET_FILE = fileArgIndex >= 0 ? process.argv[fileArgIndex + 1] : null;
const EMBED_BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 3000;
const FILE_PAUSE_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadSourceText(filePath) {
  if (path.extname(filePath).toLowerCase() === ".txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const { text } = await parser.getText();
  return text;
}

async function seedFile(index, filePath) {
  const filename = path.basename(filePath);

  if (!FORCE) {
    const check = await index.fetch([`${filename}-0`]);
    if (check.records[`${filename}-0`]) {
      console.log(`[${filename}] Already seeded, skipping.`);
      return;
    }
  }

  console.log(`\n[${filename}] Reading source...`);
  const text = await loadSourceText(filePath);
  const chunks = chunkByAyah(text);
  console.log(`[${filename}] ${chunks.length} chunks found`);

  const vectors = [];
  for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
    const embeddings = await getEmbeddings(
      batch.map((chunk) => extractEmbedText(chunk)),
    );

    for (let offset = 0; offset < batch.length; offset++) {
      const idx = start + offset;
      const chunk = batch[offset];

      // Extract surah and ayah from the "surah:ayah" reference at the start of the chunk
      const refMatch = chunk.match(/^(\d+):(\d+)/);
      const surahNumber = refMatch ? parseInt(refMatch[1], 10) : null;
      const ayahNumber = refMatch ? parseInt(refMatch[2], 10) : null;

      process.stdout.write(
        `\r[${filename}] Embedding chunk ${idx + 1}/${chunks.length}...`,
      );
      vectors.push({
        id: `${filename}-${idx}`,
        values: embeddings[offset],
        metadata: {
          text: chunk,
          source: filename,
          chunkIndex: idx,
          ...(surahNumber !== null && { surahNumber }),
          ...(ayahNumber !== null && { ayahNumber }),
        },
      });
    }

    if (start + EMBED_BATCH_SIZE < chunks.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  // Pinecone recommends batches of ≤100 vectors
  const BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await index.upsert(vectors.slice(i, i + BATCH_SIZE));
  }
  console.log(`\n[${filename}] Upserted ${vectors.length} vectors`);
}

async function main() {
  const pc = await initPinecone();
  const index = pc.index(process.env.PINECONE_INDEX_NAME);

  const files = TARGET_FILE
    ? [path.resolve(RESOURCE_DIR, TARGET_FILE)]
    : fs
        .readdirSync(RESOURCE_DIR)
        .filter((f) => [".pdf", ".txt"].includes(path.extname(f).toLowerCase()))
        .map((f) => path.join(RESOURCE_DIR, f))
        .sort();

  if (files.length === 0) {
    console.log("No source files found in server/resource/");
    process.exit(0);
  }

  if (TARGET_FILE && !fs.existsSync(files[0])) {
    console.error(`Target file not found: ${files[0]}`);
    process.exit(1);
  }

  console.log(
    `Found ${files.length} source file(s) to seed: ${files.map((f) => path.basename(f)).join(", ")}`,
  );
  if (FORCE) console.log("--force enabled: re-seeding all files");

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    await seedFile(index, filePath);

    if (i + 1 < files.length) {
      await sleep(FILE_PAUSE_MS);
    }
  }

  console.log("\nAll files seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
