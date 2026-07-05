import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTaskType(text) {
  return text.startsWith("Quran ") ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY";
}

function isRateLimitError(error) {
  return error?.status === 429 || error?.message?.includes('"code":429');
}

async function embedWithRetry(requestFn) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const delayMs = Math.min(30000 * 2 ** attempt, 120000);
      console.warn(
        `Embedding rate limited. Retrying in ${Math.round(delayMs / 1000)}s...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function getEmbedding(text) {
  const response = await embedWithRetry(() =>
    ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
      config: {
        taskType: getTaskType(text),
        outputDimensionality: 1536,
      },
    }),
  );

  console.log(response.embeddings[0].values.length);

  return Array.from(response.embeddings[0].values);
}

export async function getEmbeddings(texts) {
  const response = await embedWithRetry(() =>
  ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: texts,
    config: {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 1536,
    },
  }),
);

console.log("Embedding length:", response.embeddings[0].values.length);

  return response.embeddings.map((embedding) => Array.from(embedding.values));
}
