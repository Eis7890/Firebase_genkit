import { configureGenkit } from "@genkit-ai/core";
import { embed } from "@genkit-ai/ai/embedder";
import { defineFlow, run } from "@genkit-ai/flow";
import { textEmbeddingGecko001, googleAI } from "@genkit-ai/googleai";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { chunk } from "llm-chunk";
import * as z from "zod";
import { readFile } from "fs/promises";
import path from "path";

// Configuration for indexing process
const indexConfig = {
  collection: "merch",  // Firestore collection to store the data
  contentField: "text", // Field name for the text content
  vectorField: "embedding", // Field name for the embedding vector
  embedder: textEmbeddingGecko001, // Embedder model to use
};

// Configure Genkit with Google AI plugin
configureGenkit({
  plugins: [googleAI({ apiVersion: ['v1', 'v1beta'] })],
  enableTracingAndMetrics: false,
});

// Initialize Firestore instance
const firestore = getFirestore();

// Define the data processing flow
export const embedFlow = defineFlow(
  {
    name: "embedFlow", // Name of the flow
    inputSchema: z.void(), // No input is expected
    outputSchema: z.void(), // No output is returned
  },
  async () => {
    // 1. Read text data from file
    const filePath = path.resolve('./shop-merch-google.txt');
    const textData = await run("extract-text", () => extractText(filePath));

    // 2. Split text into chunks using '---' as delimiter
    const chunks = await run("chunk-it", async () => chunk(textData, { delimiters: '---' }));

    // 3. Index chunks into Firestore
    await run("index-chunks", async () => indexToFirestore(chunks));
  }
);

// Function to index chunks into Firestore
async function indexToFirestore(data: string[]) {
  for (const text of data) {
    // Generate embedding for the text chunk
    const embedding = await embed({
      embedder: indexConfig.embedder,
      content: text,
    });

    // Add the text and embedding to Firestore
    await firestore.collection(indexConfig.collection).add({
      [indexConfig.vectorField]: FieldValue.vector(embedding),
      [indexConfig.contentField]: text,
    });
  }
}

// Function to read text content from a file
async function extractText(filePath: string) {
  const f = path.resolve(filePath);
  return await readFile(f, 'utf-8');
}