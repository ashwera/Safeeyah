import express from "express";
import cors from "cors"; //lets my server accept requests from different origins, frontend talks to backend
import uploadRouter from "./routes/upload.js";
import queryRouter from "./routes/query.js";
import "dotenv/config";
import { initPinecone } from "./utils/pinecone.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express(); //creates express app 
let index;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.resolve(__dirname, "../client/public");

app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ limit: "50mb" }));
app.use(express.static(clientDirectory));
// express.urlencoded -> reads response string and returs as object 
app.use("/upload", uploadRouter);
app.use("/query", queryRouter);

(async () => {
  const pc = await initPinecone();
  index = pc.Index(process.env.PINECONE_INDEX_NAME);
  console.log("Pinecone initialized");
})();

app.get("/health", (req, res) => {
  res.json({ status: "Server running" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(clientDirectory, "index.html"));
});

const server = app.listen(process.env.PORT || 5000, () => {
  console.log("Backend running on port 5000");
});

process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
