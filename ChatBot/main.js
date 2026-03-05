const chatConatiner = document.getElementById("chatConatiner");
const title = chatConatiner.querySelector(".titlebar");
const textarea = document.getElementById("userInput");
let controller; 
let isGenerating = false;

let action = null;
let startX, startY, startW, startH, startTop, startLeft;

const edge = 8;

//---------------- TEXTO PADRÃO ----------------
function showInitialMessage() {
    const chatHistoric = document.getElementById('chatHistoric');

    const markdown = `
### 👋 Olá!

Sou o assistente da **UTFPR**.

Posso ajudar você a:

- 📶 Conectar ao **Wi-Fi do campus**
- 🖨️ Configurar **impressoras**

Como posso te ajudar?`;

    const html = marked.parse(markdown);

    chatHistoric.innerHTML += `
      <div class="message ai">
        <div class="markdown">${html}</div>
      </div>
    `;

    chatHistoric.scrollTop = chatHistoric.scrollHeight;

    marked.setOptions({
        breaks: true,
        gfm: true
    });

}

// dispara quando a página carregar
window.addEventListener('load', showInitialMessage);

// ---------------- CURSOR DINÂMICO ----------------
chatConatiner.addEventListener("mousemove", (e) => {
    const rect = chatConatiner.getBoundingClientRect();
    let cursor = "default";

    const left = e.clientX < rect.left + edge;
    const right = e.clientX > rect.right - edge;
    const top = e.clientY < rect.top + edge;
    const bottom = e.clientY > rect.bottom - edge;

    if ((right && bottom) || (left && top)) cursor = "nwse-resize";
    else if ((right && top) || (left && bottom)) cursor = "nesw-resize";
    else if (right || left) cursor = "ew-resize";
    else if (top || bottom) cursor = "ns-resize";

    chatConatiner.style.cursor = cursor;
});

// ---------------- MOVER ----------------
title.addEventListener("mousedown", (e) => {
    action = "move";
    startX = e.clientX;
    startY = e.clientY;
    startTop = chatConatiner.offsetTop;
    startLeft = chatConatiner.offsetLeft;
});

// ---------------- RESIZE ----------------
chatConatiner.addEventListener("mousedown", (e) => {
    const rect = chatConatiner.getBoundingClientRect();

    const left = e.clientX < rect.left + edge;
    const right = e.clientX > rect.right - edge;
    const top = e.clientY < rect.top + edge;
    const bottom = e.clientY > rect.bottom - edge;

    if (left && top) action = "top-left";
    else if (right && top) action = "top-right";
    else if (left && bottom) action = "bottom-left";
    else if (right && bottom) action = "bottom-right";
    else if (left) action = "left";
    else if (right) action = "right";
    else if (top) action = "top";
    else if (bottom) action = "bottom";
    else return;

    startX = e.clientX;
    startY = e.clientY;
    startW = chatConatiner.offsetWidth;
    startH = chatConatiner.offsetHeight;
    startTop = chatConatiner.offsetTop;
    startLeft = chatConatiner.offsetLeft;
});

document.addEventListener("mousemove", (e) => {
    if (!action) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (action === "move") {
        chatConatiner.style.left = startLeft + dx + "px";
        chatConatiner.style.top = startTop + dy + "px";
    }

    if (action.includes("right"))
        chatConatiner.style.width = startW + dx + "px";

    if (action.includes("bottom"))
        chatConatiner.style.height = startH + dy + "px";

    if (action.includes("left")) {
        chatConatiner.style.width = startW - dx + "px";
        chatConatiner.style.left = startLeft + dx + "px";
    }

    if (action.includes("top")) {
        chatConatiner.style.height = startH - dy + "px";
        chatConatiner.style.top = startTop + dy + "px";
    }
});

document.addEventListener("mouseup", () => {
    action = null;
    chatConatiner.style.cursor = "default";
});

// ---------------- INPUT CUSTOM ----------------
const input = document.getElementById("userInput");
const placeholder = document.querySelector(".placeholder");

input.addEventListener("input", () => {
    placeholder.style.display = input.value ? "none" : "block";
});

input.addEventListener("focus", () => {
    placeholder.style.display = "none";
});

input.addEventListener("blur", () => {
    if (!input.value) placeholder.style.display = "block";
});
//---------------- ENVIAR TEXTO ----------------
textarea.addEventListener("keydown", (e) => {
    // Agora verifica se está gerando. Se estiver, impede o Enter.
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); 
        if (!isGenerating) {
            sendMessage();
        }
    }
});

// Ajuste na função mestre do ícone
function handleAction() {
    if (isGenerating) {
        stopResponse();
    } else {
        sendMessage();
    }
}

async function sendMessage() {
    const textarea = document.getElementById("userInput");
    const chatHistoric = document.getElementById('chatHistoric');
    const sendIcon = document.getElementById("sendIcon");
    const message = textarea.value;

    // IMPEDE ENVIAR SE VAZIO OU SE JÁ ESTIVER GERANDO
    if (message.trim() === "" || isGenerating) return;

    controller = new AbortController();
    isGenerating = true;
    
    // Feedback visual no ícone
    sendIcon.innerHTML = `<span class="icon-content" style="margin-bottom: 2px;">■</span>`;
    sendIcon.classList.add("stop-active");

    chatHistoric.innerHTML += `<div class="message user"> ${message}</div>`;
    textarea.value = '';
    // Garante que o placeholder volte a aparecer
    if (placeholder) placeholder.style.display = "block";
    
    chatHistoric.scrollTop = chatHistoric.scrollHeight;

    const aiDiv = document.createElement("div");
    aiDiv.className = "message ai";
    aiDiv.innerHTML = `<div class="markdown"><em>Digitando...</em></div>`;
    chatHistoric.appendChild(aiDiv);
    const contentTarget = aiDiv.querySelector(".markdown");

    lockChatUI(); 

    try {
        const response = await fetch('http://localhost:3001/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
            signal: controller.signal
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;

            let formattedText = fullText
                .replace('<think>', '\n> 💭 **Pensando:**\n> ')
                .replace('</think>', '\n\n---\n');

            contentTarget.innerHTML = marked.parse(formattedText);
            chatHistoric.scrollTop = chatHistoric.scrollHeight;
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            contentTarget.innerHTML += "<br>⚠️ *Interrompido.*";
        } else {
            contentTarget.innerHTML = "Erro ao conectar.";
        }
    } finally {
        finishResponse();
    }
}
function stopResponse() {
    if (controller) {
        controller.abort();
    }
}

function finishResponse() {
    isGenerating = false;
    const sendIcon = document.getElementById("sendIcon");
    sendIcon.innerHTML = `<span class="icon-content">➤</span>`;
    sendIcon.classList.remove("stop-active");
    sendIcon.style.color = ""; 
    unlockChatUI();
}

// --- NOVAS FUNÇÕES DE UI ---

function lockChatUI() {
    document.getElementById("chatBox").style.borderColor = "#ff4d4d";
}

function unlockChatUI() {
    document.getElementById("chatBox").style.borderColor = "";
    textarea.focus();
}