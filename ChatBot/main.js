const chatConatiner = document.getElementById("chatConatiner");
const title = chatConatiner.querySelector(".titlebar");

let action = null;
let startX, startY, startW, startH, startTop, startLeft;

const edge = 8;

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

function sendMessage() {
    const textarea = document.getElementById("userInput");
    const container = document.getElementsByClassName("chatBox")[0];
    const message = textarea.value;

    if (message.trim() === "") {
        container.style.border = "1px solid red";
        return;
    }
    container.style.border = "1px solid transparent";

    var status = document.getElementById("status");
    var chatBox = document.getElementById("chatBox");
    const chatHistoric = document.getElementById('chatHistoric');

    chatHistoric.innerHTML += `<div class="message user"><strong>Você:</strong> ${message}</div>`;
    textarea.value = '';
    placeholder.style.display = "block";

    status.innerHTML = "Carregando...";
    disableChatBox();

    fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
    })
        .then(response => response.json())
        .then(data => {
            const aiMessage = data.choices[0].message.content;
            chatHistoric.innerHTML += `<div class="message ai"><strong>AI:</strong> ${aiMessage}</div>`;
            status.innerHTML = "";
            enableChatBox();
            chatHistoric.scrollTop = chatHistoric.scrollHeight;
        })
        .catch(error => {
            console.error('Error:', error);
            status.innerHTML = "Erro ao enviar mensagem.";
            enableChatBox();
        });
}

function disableChatBox() {
    const chatBox = document.getElementById("chatBox");
    chatBox.style.pointerEvents = "none";
    chatBox.style.opacity = "0.6";
}

function enableChatBox() {
    const chatBox = document.getElementById("chatBox");
    chatBox.style.pointerEvents = "auto";
    chatBox.style.opacity = "1";
}
