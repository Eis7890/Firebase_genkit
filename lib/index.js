"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.menuQAFlow = exports.menuRetriever = exports.indexMenu = exports.menuPdfIndexer = void 0;
const core_1 = require("@genkit-ai/core");
const flow_1 = require("@genkit-ai/flow");
const dev_local_vectorstore_1 = require("@genkit-ai/dev-local-vectorstore");
const vertexai_1 = require("@genkit-ai/vertexai");
const ai_1 = require("@genkit-ai/ai");
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const llm_chunk_1 = require("llm-chunk");
const promises_1 = require("fs/promises");
const flow_2 = require("@genkit-ai/flow");
const retriever_1 = require("@genkit-ai/ai/retriever");
const cheerio = __importStar(require("cheerio"));
const ai_2 = require("@genkit-ai/ai");
const dev_local_vectorstore_2 = require("@genkit-ai/dev-local-vectorstore");
const retriever_2 = require("@genkit-ai/ai/retriever");
const vertexai_2 = require("@genkit-ai/vertexai");
const z = __importStar(require("zod"));
const dev_local_vectorstore_3 = require("@genkit-ai/dev-local-vectorstore");
const vertexai_3 = require("@genkit-ai/vertexai");
(0, core_1.configureGenkit)({
    plugins: [
        (0, vertexai_3.vertexAI)(),
        (0, dev_local_vectorstore_3.devLocalVectorstore)([
            {
                indexName: '__d_VectorStore',
                embedder: vertexai_1.textEmbeddingGecko,
            },
        ]),
    ],
});
const chunkingConfig = {
    minLength: 10000,
    maxLength: 20000,
    splitter: 'sentence',
    overlap: 100,
    delimiters: '',
};
exports.menuPdfIndexer = (0, dev_local_vectorstore_1.devLocalIndexerRef)('__d_VectorStore');
exports.indexMenu = (0, flow_1.defineFlow)({
    name: 'indexer_flow',
    inputSchema: z.string().describe('Root folder path containing nested subfolders with files'),
    outputSchema: z.void(),
}, async (rootFolderPath) => {
    rootFolderPath = path_1.default.resolve(rootFolderPath);
    try {
        const allFilePaths = await collectFilePaths(rootFolderPath);
        for (const filePath of allFilePaths) {
            try {
                const ext = path_1.default.extname(filePath).toLowerCase();
                if (ext === '.pdf') {
                    const pdfTxt = await (0, flow_2.run)('extract-text', () => extractTextFromPdf(filePath));
                    const chunks = await (0, flow_2.run)('chunk-it', async () => (0, llm_chunk_1.chunk)(pdfTxt, chunkingConfig));
                    const documents = chunks.map((text) => retriever_1.Document.fromText(text, { filePath }));
                    await (0, ai_1.index)({
                        indexer: exports.menuPdfIndexer,
                        documents,
                    });
                }
                else if (ext === '.html' || ext === '.htm') {
                    const htmlTxt = await (0, flow_2.run)('extract-text', () => extractTextFromHtml(filePath));
                    const chunks = await (0, flow_2.run)('chunk-it', async () => (0, llm_chunk_1.chunk)(htmlTxt, chunkingConfig));
                    const documents = chunks.map((text) => retriever_1.Document.fromText(text, { filePath }));
                    await (0, ai_1.index)({
                        indexer: exports.menuPdfIndexer,
                        documents,
                    });
                }
                else {
                    console.warn(`Unsupported file type: ${filePath}`);
                }
            }
            catch (error) {
                console.error(`Error processing file ${filePath}:`, error);
            }
        }
    }
    catch (error) {
        console.error(`Error reading folder ${rootFolderPath}:`, error);
    }
});
async function collectFilePaths(folderPath) {
    const files = [];
    const entries = await (0, promises_1.readdir)(folderPath);
    for (const entry of entries) {
        const entryPath = path_1.default.join(folderPath, entry);
        const stats = await (0, promises_1.stat)(entryPath);
        if (stats.isDirectory()) {
            const nestedFiles = await collectFilePaths(entryPath);
            files.push(...nestedFiles);
        }
        else if (stats.isFile()) {
            files.push(entryPath);
        }
    }
    return files;
}
async function extractTextFromPdf(filePath) {
    const dataBuffer = await (0, promises_1.readFile)(filePath);
    const data = await (0, pdf_parse_1.default)(dataBuffer);
    return data.text;
}
async function extractTextFromHtml(filePath) {
    const dataBuffer = await (0, promises_1.readFile)(filePath, 'utf8');
    const $ = cheerio.load(dataBuffer);
    return $('body').text();
}
/// RETRIVER///
exports.menuRetriever = (0, dev_local_vectorstore_2.devLocalRetrieverRef)('__d_VectorStore');
exports.menuQAFlow = (0, flow_1.defineFlow)({
    name: 'retriever_flow',
    inputSchema: z.string(),
    outputSchema: z.string(),
}, async (input) => {
    // Retrieve relevant documents
    const docs = await (0, retriever_2.retrieve)({
        retriever: exports.menuRetriever,
        query: input,
        options: { k: 3 },
    });
    // Function to decode password from embedding
    function decodePasswordFromEmbedding(embedding) {
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
    let decodedPasswords = [];
    for (const doc of docs) {
        const text = doc.text();
        console.log(`Retrieved text: ${text}`);
        const passwordEmbedding = text.split(' ').map(Number);
        console.log(`Password embedding: ${passwordEmbedding}`);
        const decodedPassword = decodePasswordFromEmbedding(passwordEmbedding);
        console.log(`Decoded password: ${decodedPassword}`);
        if (decodedPassword.trim()) {
            decodedPasswords.push(decodedPassword);
        }
        else {
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
    const llmResponse = await (0, ai_2.generate)({
        model: vertexai_2.geminiPro,
        prompt,
        context: docs,
    });
    const output = llmResponse.text();
    return output;
});
//# sourceMappingURL=index.js.map