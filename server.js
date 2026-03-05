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
// MOTOR VETORIAL
// ===============================
async function getVector(text) {
    try {
        const response = await axios.post('http://localhost:11434/api/embed', {
            model: EMBED_MODEL,
            input: text
        });
        if (response.data.embeddings && response.data.embeddings[0]) {
            return response.data.embeddings[0];
        }
        return null;
    } catch (err) {
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
// CARREGAMENTO COM LOGS (O que faltava)
// ===============================
async function loadEmbeddings() {
    const root = path.join(__dirname, 'prompts');
    const map = {};
    if (!fs.existsSync(root)) return {};

    const files = fs.readdirSync(root).filter(f => f.endsWith('.txt') && f !== 'geral.txt');

    for (const file of files) {
        const content = fs.readFileSync(path.join(root, file), 'utf-8');
        const chunks = content.split('\n\n').map(c => c.trim()).filter(c => c.length > 10);

        map[file] = []; // Inicializa a lista do arquivo
        process.stdout.write(`⏳ Vetorizando ${file}... `); // Log de início

        for (const chunk of chunks) {
            const v = await getVector(chunk);
            if (v) map[file].push({ chunk, vector: v });
        }
        console.log('✅'); // Log de conclusão do arquivo
    }
    return map;
}

// ===============================
// CHAT COM LOGS E STREAMING
// ===============================
app.post('/chat', async (req, res) => {
    const { message } = req.body;
    const userVec = await getVector(message);

    if (!userVec) return res.status(500).send("Erro no processamento.");

    const scored = [];
    for (const [file, chunks] of Object.entries(allEmbeddings)) {
        chunks.forEach(item => {
            scored.push({ file, chunk: item.chunk, score: cosineSimilarity(userVec, item.vector) });
        });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 7);

    // Logs bonitinhos da busca no terminal
    console.log(`\n🔍 BUSCA: "${message}"`);
    top.forEach(c => console.log(`[${c.score.toFixed(7)}] ${c.file}`));

    const rules = fs.existsSync(path.join(__dirname, 'prompts', 'geral.txt')) 
        ? fs.readFileSync(path.join(__dirname, 'prompts', 'geral.txt'), 'utf-8') : "";
    
    const context = top.map(c => `[FONTE: ${c.file}]\n${c.chunk}`).join('\n\n');

    // Configuração do cabeçalho de streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const aiResponse = await axios({
            method: 'post',
            url: 'http://localhost:11434/api/chat',
            data: {
                model: CHAT_MODEL,
                messages: [
                    { role: 'system', content: `${rules}\n\nCONTEXTO:\n${context}` },
                    { role: 'user', content: message }
                ],
                stream: true 
            },
            responseType: 'stream'
        });

        aiResponse.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        res.write(json.message.content); 
                    }
                } catch (e) {}
            }
        });

        aiResponse.data.on('end', () => res.end());

    } catch (e) {
        console.error("❌ Erro na IA:", e.message);
        res.status(500).end();
    }
});

app.listen(PORT, async () => {
    allEmbeddings = await loadEmbeddings();
    console.log(`\n🚀 Sistema pronto para uso! Acesse http://localhost:${PORT}`);
});