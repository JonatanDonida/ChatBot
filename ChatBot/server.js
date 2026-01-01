const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('./ChatBot'));
app.get('/', (req, res) => res.sendFile('index.html', { root: './ChatBot' }));

const apiKey = "sk-c72607ed3f184b8196d3141396bff134";

app.post('/chat', async (req, res) => {
    const { message } = req.body;
    if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "user", content: message }
                ]
            })
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => console.log('Server running on port 3001'));
