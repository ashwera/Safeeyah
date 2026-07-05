import axios from "axios";

export async function getEmbedding(text) {
  const response = await axios.post("http://localhost:11434/api/embeddings", {
    model: "bge-m3",
    prompt: text,
  });
  return response.data.embedding;
}
