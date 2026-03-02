import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3001;
let allEmbeddings = {}; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ChatBot')));

const EMBED_MODEL = 'mxbai-embed-large'; 
const CHAT_MODEL = 'deepseek-r1:8b';

// ===============================
// MOTOR VETORIAL REVISADO
// ===============================
async function getVector(text) {
    try {
        // Tentativa no endpoint moderno /api/embed
        const response = await axios.post('http://localhost:11434/api/embed', {
            model: EMBED_MODEL,
            input: text
        });

        if (response.data.embeddings && response.data.embeddings[0]) {
            return response.data.embeddings[0];
        }
        
        // Backup caso seja versão antiga
        const oldRes = await axios.post('http://localhost:11434/api/embeddings', {
            model: EMBED_MODEL,
            prompt: text
        });
        return oldRes.data.embedding;

    } catch (err) {
        console.error(`❌ Falha Crítica no Ollama: ${err.message}`);
        return null;
    }
}

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, mA = 0, mB = 0;
    for(let i=0; i<vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        mA += vecA[i] * vecA[i];
        mB += vecB[i] * vecB[i];
    }
    const mag = Math.sqrt(mA) * Math.sqrt(mB);
    return mag === 0 ? 0 : dot / mag;
}

// ===============================
// CARREGAMENTO DA BASE
// ===============================
async function loadEmbeddings() {
    const root = path.join(__dirname, 'prompts');
    const map = {};
    if (!fs.existsSync(root)) return {};

    const files = fs.readdirSync(root).filter(f => f.endsWith('.txt') && f !== 'geral.txt');

    for (const file of files) {
        const content = fs.readFileSync(path.join(root, file), 'utf-8');
        const chunks = content.split('\n\n').map(c => c.trim()).filter(c => c.length > 10);

        map[file] = [];
        process.stdout.write(`⏳ Vetorizando ${file}... `);

        for (const chunk of chunks) {
            const v = await getVector(chunk);
            if (v) map[file].push({ chunk, vector: v });
        }
        console.log('✅');
    }
    return map;
}

// ===============================
// CHAT
// ===============================
app.post('/chat', async (req, res) => {
    const { message } = req.body;
    const userVec = await getVector(message);

    if (!userVec) return res.status(500).json({ error: "Erro no Ollama" });

    const scored = [];
    for (const [file, chunks] of Object.entries(allEmbeddings)) {
        chunks.forEach(item => {
            scored.push({ file, chunk: item.chunk, score: cosineSimilarity(userVec, item.vector) });
        });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 7);

    console.log(`\n🔍 BUSCA: "${message}"`);
    top.forEach(c => console.log(`[${c.score.toFixed(7)}] ${c.file}`));

    const rules = fs.existsSync(path.join(__dirname, 'prompts', 'geral.txt')) 
        ? fs.readFileSync(path.join(__dirname, 'prompts', 'geral.txt'), 'utf-8') : "";
    
    const context = top.map(c => `[FONTE: ${c.file}]\n${c.chunk}`).join('\n\n');

    try {
        const ai = await axios.post('http://localhost:11434/api/chat', {
            model: CHAT_MODEL,
            stream: false,
            messages: [
                { role: 'system', content: `${rules}\n\nCONTEXTO:\n${context}` },
                { role: 'user', content: message }
            ]
        });
        res.json({ choices: [{ message: { content: ai.data.message.content } }] });
    } catch (e) { res.status(500).send("Erro na IA"); }
});

app.listen(PORT, async () => {
    allEmbeddings = await loadEmbeddings();
    console.log(`\n🚀 Pronto! Acesse http://localhost:${PORT}`);
});