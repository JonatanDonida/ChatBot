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
// PROMPT DE CLASSIFICAÇÃO
// ===============================
const INTENT_PROMPT = `
Você é um classificador de intenção.

Categorias possíveis:
- wifi
- impressora
- nenhuma

Responda SOMENTE com uma palavra da lista acima.
`;

// ===============================
// CACHE DE PROMPTS ESPECÍFICOS
// ===============================
const promptCache = {};

function loadSpecificPrompt(intent) {
  if (!intent || intent === 'nenhuma') return null;

  if (!promptCache[intent]) {
    const filePath = path.join(__dirname, 'prompts', `${intent}.txt`);

    if (!fs.existsSync(filePath)) return null;

    promptCache[intent] = fs.readFileSync(filePath, 'utf-8');
  }

  return promptCache[intent];
}

// ===============================
// IA DECIDE A INTENÇÃO
// ===============================
async function detectIntentWithAI(message) {
  try {
    const response = await axios.post(
      'http://localhost:11434/api/chat',
      {
        model: 'deepseek-r1:8b',
        stream: false,
        messages: [
          { role: 'system', content: INTENT_PROMPT },
          { role: 'user', content: message }
        ]
      }
    );

    return response.data.message?.content?.trim().toLowerCase();
  } catch (err) {
    console.error('Erro ao detectar intenção:', err.message);
    return 'nenhuma';
  }
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
  const intent = await detectIntentWithAI(message);
  const specificPrompt = loadSpecificPrompt(intent);

  // injeta documento específico (se houver)
  if (specificPrompt) {
    conversations[sessionId].push({
      role: 'system',
      content: `DOCUMENTO ${intent.toUpperCase()} UTFPR:\n\n${specificPrompt}`
    });
  }

  // ===============================
  // MENSAGEM DO USUÁRIO
  // ===============================
  conversations[sessionId].push({
    role: 'user',
    content: message
  });

  // mantém apenas as últimas 20 mensagens
  if (conversations[sessionId].length > 20) {
    conversations[sessionId] = conversations[sessionId].slice(-20);
  }

  try {
    const ollamaResponse = await axios.post(
      'http://localhost:11434/api/chat',
      {
        model: 'deepseek-r1:8b',
        stream: false,
        messages: conversations[sessionId]
      }
    );

    const aiMessage =
      ollamaResponse.data.message?.content ?? 'Sem resposta';

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
