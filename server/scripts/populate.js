import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { initPinecone } from "../utils/pinecone.js";
import { getEmbedding } from "../utils/embeddings.js";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCE_DIR = path.resolve(__dirname, "../resource");

function chunkByAyah(rawText) {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const versePattern = /(?:^|\n)(?:\(\d+\)|\d+[.)]) /g;
  const verseMatches = [...text.matchAll(versePattern)];
  if (verseMatches.length > 1) {
    const chunks = [];
    for (let i = 0; i < verseMatches.length; i++) {
      const start = verseMatches[i].index;
      const end = verseMatches[i + 1]?.index ?? text.length;
      const chunk = text.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 1) return lines;

  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if (current.length + s.length > 300 && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function processFile(filePath, index) {
  const filename = path.basename(filePath);
  const surahNumber = parseInt(path.basename(filename, ".pdf"), 10);

  console.log(`\nProcessing ${filename} (surah ${surahNumber})...`);

  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const chunks = chunkByAyah(data.text);

  console.log(`  ${chunks.length} chunks found`);

  const vectors = await Promise.all(
    chunks.map(async (chunk, idx) => {
      const verseMatch = chunk.match(/^(?:\((\d+)\)|(\d+)[.)])\s/);
      const ayahNumber = verseMatch
        ? parseInt(verseMatch[1] ?? verseMatch[2], 10)
        : idx + 1;

      return {
        id: `${filename}-${idx}`,
        values: await getEmbedding(chunk),
        metadata: {
          text: chunk,
          source: filename,
          chunkIndex: idx,
          surahNumber,
          ayahNumber,
        },
      };
    })
  );

  await index.upsert(vectors);
  console.log(`  Upserted ${vectors.length} vectors`);
}

async function main() {
  const pc = await initPinecone();
  const index = pc.index(process.env.PINECONE_INDEX_NAME);

  const files = fs
    .readdirSync(RESOURCE_DIR)
    .filter((f) => f.endsWith(".pdf"))
    .sort()
    .map((f) => path.join(RESOURCE_DIR, f));

  if (files.length === 0) {
    console.error("No PDF files found in", RESOURCE_DIR);
    process.exit(1);
  }

  console.log(`Found ${files.length} PDF files. Starting population...`);

  for (const file of files) {
    await processFile(file, index);
  }

  console.log("\nDone. All PDFs uploaded to Pinecone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
