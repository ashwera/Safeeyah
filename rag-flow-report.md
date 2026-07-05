# RAG Model Functionality and Flow Report

## Overview

This project is a retrieval-augmented generation (RAG) app centered on Quran verse search and answer generation. The system has two main stages:

1. Ingestion and indexing of Quran content into Pinecone.
2. Retrieval and answer generation when a user asks a question.

The backend uses embeddings for semantic search, Pinecone as the vector store, and Groq for the final answer generation. The frontend is a static client that opens a chat interface and sends user questions to the backend.

## Dev Side Flow

### 1. Content ingestion

The ingestion pipeline starts from PDF files in the `server/resource/` directory. The upload and seeding scripts read PDF content, split it into ayah-sized chunks, and prepare metadata for each chunk.

Relevant files:

- [server/routes/upload.js](server/routes/upload.js)
- [server/scripts/seed.js](server/scripts/seed.js)
- [server/scripts/populate.js](server/scripts/populate.js)
- [server/utils/chunker.js](server/utils/chunker.js)

### 2. Chunking and metadata extraction

The chunker tries several patterns to split verses cleanly:

- `surah:ayah` references at the start of a line.
- Numbered verse formats such as `1.`, `1)` or `(1)`.
- One line per ayah.
- Sentence-based fallback if the input is unstructured.

The code also extracts a smaller embedding text using the translation portion only, while preserving the raw chunk text in metadata. That keeps semantic search focused on the translation language and still retains the original verse content for display.

### 3. Embedding generation

Each chunk is passed through the embedding helper before storage.

Relevant file:

- [server/utils/embeddings.js](server/utils/embeddings.js)

At the moment, embeddings are requested from a local Ollama endpoint. That means the dev environment depends on a running local model service for indexing and for question-time embedding.

### 4. Vector storage

Embeddings and metadata are stored in Pinecone.

Relevant file:

- [server/utils/pinecone.js](server/utils/pinecone.js)

Each record stores:

- the original verse text,
- the file source,
- the chunk index,
- the surah number,
- the ayah number when available.

### 5. Answer generation route

The main answer endpoint is [`POST /query`](server/routes/query.js).

The route works as follows:

1. Embed the user question.
2. Query Pinecone for the top matching verse chunks.
3. Filter results by similarity threshold.
4. Fetch nearby surrounding verses for context.
5. Fetch the Arabic text for each referenced ayah from the Quran API.
6. Build a context block with Arabic text and translation.
7. Send the context and question to Groq for answer generation.

The prompt instructs the model to answer only from the supplied Quran verses, cite every verse, and include Arabic text plus translation for cited verses.

### 6. Arabic verse enrichment

The query route now fetches Arabic text by surah and ayah number from the Quran API before constructing the final context. That means the displayed verse block is not dependent on the PDF text alone.

This is important because the system prompt explicitly requires Arabic text to be sourced from the Quran API, not copied from the stored verse content.

## Customer Side Flow

### 1. Landing page

The customer first sees a landing page with a short introduction and a primary action to begin.

Relevant file:

- [client/public/index.html](client/public/index.html)

### 2. Entering chat

When the user clicks “Begin your journey”, the app hides the landing view and opens the chat interface.

Relevant file:

- [client/public/app.js](client/public/app.js)

### 3. Asking a question

The user types a question into the composer and submits it. The client immediately:

- adds the user message to the conversation,
- shows a typing indicator,
- sends the question to the backend with response preferences.

The client sends the request to `POST /query` using a relative path, so the frontend expects to be served from the same origin as the backend or behind a shared proxy.

### 4. Receiving an answer

If the backend finds relevant verses, the customer receives a generated response grounded in those verses. The answer is expected to include:

- Quran citations,
- Arabic verse text,
- translation,
- context where needed.

If no relevant verses are found, the app returns a fixed fallback message explaining that no answer could be found in the provided Quran verses.

### 5. Preferences and session behavior

The customer can change response style, preferred language, Arabic term visibility, and dark mode in settings. These preferences are appended to the question payload and influence how the model is instructed to respond.

## End-to-End RAG Summary

The core loop is:

1. A Quran verse corpus is chunked and embedded.
2. The vectors are stored in Pinecone.
3. A user asks a question.
4. The question is embedded and matched against the vector store.
5. Relevant verses and surrounding context are collected.
6. Arabic text is fetched from the Quran API using the surah and ayah numbers.
7. Groq generates the final answer using only the supplied verse context.

This design keeps the system retrieval-grounded while preserving a user-facing chat experience that feels conversational rather than search-like.

## Operational Notes

- The system depends on a valid Pinecone index name and API key.
- The backend also depends on a Groq API key.
- Embeddings currently depend on a local Ollama service.
- Verse display depends on the external Quran API for Arabic text enrichment.
