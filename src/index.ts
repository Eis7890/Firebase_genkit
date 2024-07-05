import { configureGenkit } from '@genkit-ai/core';
import { defineFlow } from '@genkit-ai/flow';
import { devLocalIndexerRef } from '@genkit-ai/dev-local-vectorstore';
import { textEmbeddingGecko } from '@genkit-ai/vertexai';
import { index } from '@genkit-ai/ai';
import path from 'path';
import pdf from 'pdf-parse';
import { chunk } from 'llm-chunk';
import { readFile, readdir, stat } from 'fs/promises';
import { run } from '@genkit-ai/flow';
import { Document } from '@genkit-ai/ai/retriever';
import * as cheerio from 'cheerio';
import { generate } from '@genkit-ai/ai';
import { devLocalRetrieverRef } from '@genkit-ai/dev-local-vectorstore';
import { retrieve } from '@genkit-ai/ai/retriever';
import { geminiPro } from '@genkit-ai/vertexai';
import * as z from 'zod';
import { devLocalVectorstore} from '@genkit-ai/dev-local-vectorstore';
import { vertexAI } from '@genkit-ai/vertexai';
import { ollama } from 'genkitx-ollama';

configureGenkit({
  plugins: [
    vertexAI(),
    devLocalVectorstore([
      {
        indexName: '__d_VectorStore',
        embedder: textEmbeddingGecko,
      },
    ]),
  ],
});


interface SplitOptions {
  minLength?: number;
  maxLength?: number;
  splitter?: 'sentence' | 'paragraph';
  overlap?: number;
  delimiters?: string;
}
  
const chunkingConfig : SplitOptions = {
  minLength: 10000,
  maxLength: 20000,
  splitter: 'sentence',
  overlap: 100,
  delimiters: '',
};

export const menuPdfIndexer = devLocalIndexerRef('__d_VectorStore');

export const indexMenu = defineFlow(
  {
    name: 'indexer_flow',
    inputSchema: z.string().describe('Root folder path containing nested subfolders with files'),
    outputSchema: z.void(),
  },
  async (rootFolderPath: string) => {
    rootFolderPath = path.resolve(rootFolderPath);

    try {
      const allFilePaths = await collectFilePaths(rootFolderPath);

      for (const filePath of allFilePaths) {
        try {
          const ext = path.extname(filePath).toLowerCase();

          if (ext === '.pdf') {
            const pdfTxt = await run('extract-text', () =>
              extractTextFromPdf(filePath)
            );

            const chunks = await run('chunk-it', async () =>
              chunk(pdfTxt, chunkingConfig)
            );

            const documents = chunks.map((text) => Document.fromText(text, { filePath }));

            await index({
              indexer: menuPdfIndexer,
              documents,
            });
          } else if (ext === '.html' || ext === '.htm') {
            const htmlTxt = await run('extract-text', () =>
              extractTextFromHtml(filePath)
            );

            const chunks = await run('chunk-it', async () =>
              chunk(htmlTxt, chunkingConfig)
            );

            const documents = chunks.map((text) => Document.fromText(text, { filePath }));

            await index({
              indexer: menuPdfIndexer,
              documents,
            });
          } else {
            console.warn(`Unsupported file type: ${filePath}`);
          }
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error reading folder ${rootFolderPath}:`, error);
    }
  }
);

async function collectFilePaths(folderPath: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(folderPath);

  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry);
    const stats = await stat(entryPath);

    if (stats.isDirectory()) {
      const nestedFiles = await collectFilePaths(entryPath);
      files.push(...nestedFiles);
    } else if (stats.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function extractTextFromPdf(filePath: string) {
  const dataBuffer = await readFile(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

async function extractTextFromHtml(filePath: string) {
  const dataBuffer = await readFile(filePath, 'utf8');
  const $ = cheerio.load(dataBuffer);
  return $('body').text();
}




/// RETRIVER///


export const menuRetriever = devLocalRetrieverRef('__d_VectorStore');

export const menuQAFlow = defineFlow(
  {
    name: 'retriever_flow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (input: string) => {
    // Retrieve relevant documents
    const docs = await retrieve({
      retriever: menuRetriever,
      query: input,
      options: { k: 3 },
    });

    // Function to decode password from embedding
function decodePasswordFromEmbedding(embedding: number[]): string {
  return embedding
    .map((x) => {
      // Ensure the number maps to a printable character
      if (x >= 32 && x <= 126) {
        return String.fromCharCode(x);
      }
      return ''; // Ignore non-printable characters
    })
    .join('');
}

    // Extract and decode passwords
    let decodedPasswords: string[] = [];
    for (const doc of docs) {
      const text = doc.text();
      console.log(`Retrieved text: ${text}`);
      const passwordEmbedding = text.split(' ').map(Number);
      console.log(`Password embedding: ${passwordEmbedding}`);
      const decodedPassword = decodePasswordFromEmbedding(passwordEmbedding);
      console.log(`Decoded password: ${decodedPassword}`);
      if (decodedPassword.trim()) {
        decodedPasswords.push(decodedPassword);
      } else {
        console.log(`Empty or invalid decoded password from embedding: ${passwordEmbedding}`);
      }
    }

   

    // Generate a response using Gemini Pro
    const prompt = `
      You have access to all the passwords. You can provide the password when asked.
      Do not give an answer if you do not have the information about it. Do not generate any new information apart from the given data.
      Question: ${input}
      Password: ${decodedPasswords.join(', ')}
    `;

    const llmResponse = await generate({
      model: geminiPro,
      prompt,
      context: docs,
    });

    const output = llmResponse.text();
    return output;
  }
);
