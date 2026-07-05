import express from "express";
import multer from "multer";//middleware to handle file uploads
import {initPinecone} from "../utils/pinecone.js";
import { getEmbedding } from "../utils/embeddings.js";
import { chunkByAyah, extractEmbedText } from "../utils/chunker.js";
import { PDFParse } from "pdf-parse";

const router = express.Router(); //handle incoming requests to /upload endpoint
const upload = multer({ storage: multer.memoryStorage() }); //store 

router.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    const surahNumber = parseInt(req.body.surahNumber, 10);

    const parser = new PDFParse({ data: req.file.buffer });
    await parser.load();
    const { text } = await parser.getText();

    const chunks = chunkByAyah(text);

    // Prepare vectors with real Ollama bge-m3 embeddings
    const vectors = await Promise.all(
      chunks.map(async (chunk, idx) => {
        // Extract surah and ayah from the "surah:ayah" reference at the start of the chunk
        const refMatch = chunk.match(/^(\d+):(\d+)/);
        const chunkSurah = refMatch ? parseInt(refMatch[1], 10) : surahNumber;
        const ayahNumber = refMatch ? parseInt(refMatch[2], 10) : null;

        return {
          id: `${req.file.originalname}-${idx}`,
          values: await getEmbedding(extractEmbedText(chunk)),
          metadata: {
            text: chunk,
            source: req.file.originalname,
            chunkIndex: idx,
            ...(!Number.isNaN(chunkSurah) && chunkSurah !== null && { surahNumber: chunkSurah }),
            ...(ayahNumber !== null && { ayahNumber }),
          },
        };
      })
    );

    //vector initializiation and upsert to pinecone
    const pc = await initPinecone();
    const index = pc.index(process.env.PINECONE_INDEX_NAME);  
    await index.upsert(vectors);

    res.json({
      status: "PDF uploaded successfully",
      chunks: chunks.length,
      file: req.file.originalname,
      surahNumber,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

export default router;