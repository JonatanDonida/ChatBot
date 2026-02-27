import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3001;
const conversations = {};

// ===============================
// CONFIGURAÇÃO ESM
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// ===============================
// SERVIR FRONTEND
// ===============================
app.use(express.static(path.join(__dirname, 'ChatBot')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'ChatBot', 'index.html'));
});

// ===============================
// PROMPT GERAL (SEMPRE ATIVO)
// ===============================
const GENERAL_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'geral.txt'),
  'utf-8'
);

// ===============================
// CACHE DE PROMPTS
// ===============================
const promptCache = {};

// ===============================
// MAPA DE EMBEDDINGS → ARQUIVOS
// ===============================
async function loadEmbeddings() {
  const files = ['wifi', 'certificado'];
  const allEmbeddings = {};

  for (const name of files) {
    const txtPath = path.join(__dirname, 'prompts', `${name}.txt`);
    if (!fs.existsSync(txtPath)) continue;

    const text = fs.readFileSync(txtPath, 'utf-8');
    const chunks = text.split('\n\n'); // separa por parágrafos

    allEmbeddings[name] = [];

    for (const chunk of chunks) {
      const response = await axios.post('http://localhost:11434/api/embeddings', {
        model: 'deepseek-r1:8b',
        input: chunk,
      });
      allEmbeddings[name].push({ chunk, useVector: response.data.embedding });
    }
  }

  return allEmbeddings;
}
// ===============================
// EMBEDDINGS → PERGUNTA DO USUÁRIO
// ===============================
async function getUserEmbedding(userMessage) {
  const response = await axios.post('http://localhost:11434/api/embeddings', {
    model: 'deepseek-r1:8b',
    input: userMessage,
  })
  return response.data.embedding;
}
// ===============================
// ENCONTRA CHUNKS MAIS RELEVANTES
// ===============================
function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dot / (magA * magB);
}

// Encontra os chunks mais relevantes usando embeddings
function findRelevantChunks(userVector, allEmbeddings, topK = 4) {
  const scored = [];

  for (const [fileName, chunks] of Object.entries(allEmbeddings)) {
    chunks.forEach(chunk => {
      // Ajuste "useVector" conforme seu JSON, pode ser "vector" ou "embedding"
      const score = cosineSimilarity(userVector, chunk.useVector);
      scored.push({ fileName, chunk: chunk.chunk, score });
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ===============================
// CHAT
// ===============================
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  const sessionId = getSessionId(req);

  // ===============================
  // CRIA SESSÃO COM PROMPT GERAL
  // ===============================
  if (!conversations[sessionId]) {
    conversations[sessionId] = [
      { role: 'system', content: GENERAL_PROMPT }
    ];
  }
  // ===============================
  // DETECTA INTENÇÃO
  // ===============================
  //Carregar todos os embeddings
  const allEmbeddings = await loadEmbeddings();
  //Gera embedding da pergunta do usuário
  const userVector = await getUserEmbedding(message);
  //Buscar os top chunks mais relevantes
  const topChunks = findRelevantChunks(userVector, allEmbeddings, 4);
  // INJETA DOCUMENTO PEDAÇOS IMPORTANTES DO PROMPT ESPECÍFICO
  if (topChunks.length > 0) {
    const relevantText = topChunks
      .map(c => `DOCUMENTO ${c.fileName.toUpperCase()}:\n${c.chunk}`)
      .join('\n\n');

    conversations[sessionId].push({ role: 'system', content: relevantText });
  }

  // ===============================
  // ADICIONA MENSAGEM DO USUÁRIO
  // ===============================
  conversations[sessionId].push({
    role: 'user',
    content: message
  });

  // ===============================
  // MANTÉM SOMENTE AS ÚLTIMAS 10 MENSAGENS
  // ===============================
  if (conversations[sessionId].length > 10) {
    conversations[sessionId] = conversations[sessionId].slice(-10);
  }

  // ===============================
  // ENVIA PARA A IA
  // ===============================
  try {
    const ollamaResponse = await axios.post(
      'http://localhost:11434/api/chat',
      {
        model: 'deepseek-r1:8b',
        stream: false,
        messages: conversations[sessionId]
      }
    );

    const aiMessage = ollamaResponse.data.message?.content ?? 'Sem resposta';

    // resposta da IA no histórico
    conversations[sessionId].push({
      role: 'assistant',
      content: aiMessage
    });

    res.json({
      choices: [
        {
          message: { content: aiMessage }
        }
      ]
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      choices: [
        { message: { content: 'Erro ao gerar resposta' } }
      ]
    });
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// ===============================
// SESSÃO SIMPLES POR IP
// ===============================
function getSessionId(req) {
  return req.ip;
}
