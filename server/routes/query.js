import express from "express";
import axios from "axios";
import { initPinecone } from "../utils/pinecone.js";
import { getEmbedding } from "../utils/embeddings.js";

const router = express.Router();
const SIMILARITY_THRESHOLD = 0.4;
const CONTEXT_WINDOW = 2; // ayahs to fetch before and after each match

router.post("/", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    // 1. Embed the question
    const embedding = await getEmbedding(question);

    // 2. Query Pinecone for top relevant chunks
    const pc = await initPinecone();
    const index = pc.index(process.env.PINECONE_INDEX_NAME);
    const results = await index.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    });

    const relevantMatches = results.matches.filter((m) => m.score >= SIMILARITY_THRESHOLD);

    if (relevantMatches.length === 0) {
      return res.json({
        answer: "I could not find an answer to this question in the provided Quran verses.",
        sources: [],
      });
    }

    // 3. Collect surrounding chunk IDs to fetch
    const surroundingIdSet = new Set();
    for (const match of relevantMatches) {
      const { source, chunkIndex } = match.metadata;
      for (let d = -CONTEXT_WINDOW; d <= CONTEXT_WINDOW; d++) {
        if (d === 0) continue;
        const i = chunkIndex + d;
        if (i >= 0) surroundingIdSet.add(`${source}-${i}`);
      }
    }

    // Fetch surrounding chunks in one batch
    const fetched = surroundingIdSet.size > 0
      ? (await index.fetch([...surroundingIdSet])).records
      : {};

    // Build a unified chunk map: id -> { metadata, isMatch }
    const chunkMap = new Map();
    for (const match of relevantMatches) {
      chunkMap.set(match.id, { metadata: match.metadata, isMatch: true });
    }
    for (const [id, record] of Object.entries(fetched)) {
      if (record?.metadata && !chunkMap.has(id)) {
        chunkMap.set(id, { metadata: record.metadata, isMatch: false });
      }
    }

    // 4. For each match build a sorted context window, skip already-seen chunks
    const seen = new Set();
    const contextParts = [];

    for (const match of relevantMatches) {
      const { source, chunkIndex } = match.metadata;
      const window = [];

      for (let d = -CONTEXT_WINDOW; d <= CONTEXT_WINDOW; d++) {
        const id = `${source}-${chunkIndex + d}`;
        const entry = chunkMap.get(id);
        if (entry) window.push({ id, ...entry });
      }

      const lines = window
        .filter(({ id }) => !seen.has(id))
        .map(({ id, metadata, isMatch }) => {
          seen.add(id);
          const { text, surahNumber, ayahNumber } = metadata;
          const ref =
            surahNumber != null && ayahNumber != null
              ? `[Surah ${surahNumber}, Ayah ${ayahNumber}]${isMatch ? " ◄" : ""}`
              : isMatch ? "◄" : "";
          return ref ? `${ref}\n${text}` : text;
        });

      if (lines.length > 0) contextParts.push(lines.join("\n\n"));
    }

    const context = contextParts.join("\n\n---\n\n");

    // 5. Generate answer
    const groqResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are a Quran-only assistant. You MUST answer solely from the Quran verses supplied in the user message. " +
              "Do NOT use any knowledge from your training, the internet, or any external source. " +
              "Verses marked with ◄ are the primary matches for the question; surrounding verses are provided for context only — use them to interpret the marked verses correctly, do not treat them as direct answers. " +
              "Always cite [Surah X, Ayah Y] for every verse you reference. " +
              "Always include the Arabic text of each verse you cite, followed by its translation. " +
              "If the provided verses do not contain enough information to answer the question, respond with exactly: " +
              '"I could not find an answer to this question in the provided Quran verses." ' +
              "Never deviate from this rule under any circumstances.",
              "If the answer comes from the Quran, cite the verse. If it comes from Hadith or scholarly commentary, clearly say so and cite the source. Never blend the two without distinguishing them. If no source answers the question, say so honestly rather than speculating.",
          },
          {
            role: "user",
            content: `Quran verses:\n${context}\n\nQuestion: ${question}`,
          },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } }
    );

    const answer = groqResponse.data.choices[0].message.content;

    res.json({
      answer,
      sources: relevantMatches.map((m) => ({
        source: m.metadata.source,
        surahNumber: m.metadata.surahNumber ?? null,
        ayahNumber: m.metadata.ayahNumber ?? null,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
