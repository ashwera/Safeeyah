import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";
import { initPinecone } from "../utils/pinecone.js";
import { getEmbedding } from "../utils/embeddings.js";
import { chunkByAyah, extractEmbedText } from "../utils/chunker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCE_DIR = path.resolve(__dirname, "../resource");
const FORCE = process.argv.includes("--force");

async function seedFile(index, filePath) {
  const filename = path.basename(filePath);

  if (!FORCE) {
    const check = await index.fetch([`${filename}-0`]);
    if (check.records[`${filename}-0`]) {
      console.log(`[${filename}] Already seeded, skipping.`);
      return;
    }
  }

  console.log(`\n[${filename}] Reading PDF...`);
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const { text } = await parser.getText();
  const chunks = chunkByAyah(text);
  console.log(`[${filename}] ${chunks.length} chunks found`);

  const vectors = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];

    // Extract surah and ayah from the "surah:ayah" reference at the start of the chunk
    const refMatch = chunk.match(/^(\d+):(\d+)/);
    const surahNumber = refMatch ? parseInt(refMatch[1], 10) : null;
    const ayahNumber = refMatch ? parseInt(refMatch[2], 10) : null;

    process.stdout.write(`\r[${filename}] Embedding chunk ${idx + 1}/${chunks.length}...`);
    vectors.push({
      id: `${filename}-${idx}`,
      values: await getEmbedding(extractEmbedText(chunk)),
      metadata: {
        text: chunk,
        source: filename,
        chunkIndex: idx,
        ...(surahNumber !== null && { surahNumber }),
        ...(ayahNumber !== null && { ayahNumber }),
      },
    });
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

  const files = fs
    .readdirSync(RESOURCE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(RESOURCE_DIR, f))
    .sort();

  if (files.length === 0) {
    console.log("No PDF files found in server/resource/");
    process.exit(0);
  }

  console.log(`Found ${files.length} PDF(s) to seed: ${files.map(f => path.basename(f)).join(", ")}`);
  if (FORCE) console.log("--force enabled: re-seeding all files");

  for (const filePath of files) {
    await seedFile(index, filePath);
  }

  console.log("\nAll files seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
