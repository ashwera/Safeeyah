import { Pinecone } from "@pinecone-database/pinecone";

const initPinecone = async () => {
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  return pc;
};

export { initPinecone };