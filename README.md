# Safeeyah

A Quran-grounded question-and-answer app. The Express server serves the web UI and retrieves relevant passages from Pinecone before generating a response.

## Setup

1. Install the server dependencies:

   ```bash
   cd server
   npm install
   ```

2. Create `server/.env`:

   ```env
   PORT=5000
   PINECONE_API_KEY=your_pinecone_key
   PINECONE_INDEX_NAME=your_1536_dimension_index
   GEMINI_API_KEY=your_gemini_key
   GROQ_API_KEY=your_groq_key
   # Optional, defaults to openai/gpt-oss-120b
   GROQ_MODEL=openai/gpt-oss-120b
   ```

   The Pinecone index must use 1,536 dimensions to match `gemini-embedding-001`.

## Add and embed sources

Put Quran source files (`.txt`) in `server/resource/`. Then, from `server/`:

```bash
# Embed every source that has not already been seeded
npm run seed

# Embed one file
npm run seed -- --file 34.txt

# Re-embed a source (or all sources) even if vectors already exist
npm run seed -- --file 34.txt --force
```

The seed script chunks content by ayah, creates Gemini embeddings, and upserts them to Pinecone.

## Run

From `server/`:

```bash
npm start
```

Open [http://localhost:5000](http://localhost:5000). The server also exposes `GET /health` for a simple health check.
