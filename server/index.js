import express from "express";
import cors from "cors"; //lets my server accept requests from different origins, frontend talks to backend
import uploadRouter from "./routes/upload.js";
import queryRouter from "./routes/query.js";
import "dotenv/config";
import { initPinecone } from "./utils/pinecone.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express(); //creates express app
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.resolve(__dirname, "../client/public");

app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(clientDirectory));
// express.urlencoded -> reads response string and returs as object 
app.use("/upload", uploadRouter);
app.use("/query", queryRouter);

// Fail loudly but don't crash the whole server when config is missing.
const missingEnv = [
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
].filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(`Missing environment variables: ${missingEnv.join(", ")}`);
} else {
  initPinecone()
    .then((pc) => {
      pc.index(process.env.PINECONE_INDEX_NAME);
      console.log("Pinecone initialized");
    })
    .catch((error) => console.error("Pinecone init failed:", error.message));
}


app.get('/health', (req, res) => {
  res.status(200).send('OK');
});


app.get("/", (req, res) => {
  res.sendFile(path.join(clientDirectory, "index.html"));
});

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
