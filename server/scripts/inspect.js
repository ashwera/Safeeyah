import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";
import { chunkByAyah } from "../utils/chunker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = process.argv[2];

if (!filename) {
  console.error("Usage: node scripts/inspect.js <filename.pdf>");
  process.exit(1);
}

const filePath = path.resolve(__dirname, "../resource", filename);
const buffer = fs.readFileSync(filePath);
const parser = new PDFParse({ data: buffer });
await parser.load();
const { text } = await parser.getText();

console.log("=== RAW TEXT (first 1000 chars, JSON-escaped to show whitespace) ===");
console.log(JSON.stringify(text.slice(0, 1000)));

console.log("\n=== FIRST 5 CHUNKS ===");
const chunks = chunkByAyah(text);
console.log(`Total chunks: ${chunks.length}`);
chunks.slice(0, 5).forEach((c, i) => {
  console.log(`\n--- Chunk ${i} ---`);
  console.log(c);
});
