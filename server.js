const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SETTINGS_FILE = path.join(__dirname, "settings.json");

function ensureSettingsFile() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      systemPrompt: "You are a helpful WhatsApp assistant for ARTEC REALITY. Reply clearly, briefly, and professionally. If the user writes in Darija, reply in Darija. If the user asks about services, explain that ARTEC REALITY offers 3D scanning, AR/VR experiences, virtual tours, filmmaking, editing, and creative production.",
      firstMessage: "Salam! Ana assistant dyal ARTEC REALITY 👋 Kifach n9dar n3awnk lyoum?",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 500
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), "utf8");
  }
}

function loadSettings() {
  ensureSettingsFile();
  const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
  return JSON.parse(raw);
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf8");
}

ensureSettingsFile();

const processedMessageIds = new Set();

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function askOpenRouter(userMessage, phoneNumber) {
  const settings = loadSettings();

  const messages = [
    {
      role: "system",
      content: settings.systemPrompt
    },
    {
      role: "user",
      content: `User phone: ${phoneNumber}\nMessage: ${userMessage}`
    }
  ];

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: settings.model,
      messages,
      temperature: Number(settings.temperature) || 0.7,
      max_tokens: Number(settings.maxTokens) || 500
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_PUBLIC_URL || "https://example.com",
        "X-Title": "ARTEC REALITY WhatsApp Bot"
      }
    }
  );

  return (
    response.data?.choices?.[0]?.message?.content ||
    "Sma7 lia, wa9e3 mouchkil sghir. 3awed jarrab mn ba3d chwiya."
  );
}

async function sendWhatsAppMessage(to, body) {
  const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot is running.");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/dashboard", (req, res) => {
  const adminKey = req.query.key;
  if (!process.env.ADMIN_SECRET || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  const settings = loadSettings();

  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Bot Dashboard</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
            background: #f6f6f6;
          }
          .card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          }
          textarea, input {
            width: 100%;
            padding: 12px;
            margin-top: 8px;
            margin-bottom: 16px;
            border-radius: 8px;
            border: 1px solid #ccc;
            font-size: 14px;
          }
          button {
            background: black;
            color: white;
            border: none;
            padding: 12px 18px;
            border-radius: 8px;
            cursor: pointer;
          }
          label {
            font-weight: bold;
          }
          .small {
            color: #666;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>WhatsApp AI Dashboard</h1>
          <p class="small">Protected by ADMIN_SECRET</p>

          <form method="POST" action="/dashboard/save?key=${encodeURIComponent(adminKey)}">
            <label>System Prompt</label>
            <textarea name="systemPrompt" rows="10">${escapeHtml(settings.systemPrompt || "")}</textarea>

            <label>First Message</label>
            <textarea name="firstMessage" rows="4">${escapeHtml(settings.firstMessage || "")}</textarea>

            <label>Model</label>
            <input type="text" name="model" value="${escapeHtml(settings.model || "")}" />

            <label>Temperature</label>
            <input type="number" step="0.1" name="temperature" value="${escapeHtml(String(settings.temperature ?? 0.7))}" />

            <label>Max Tokens</label>
            <input type="number" name="maxTokens" value="${escapeHtml(String(settings.maxTokens ?? 500))}" />

            <button type="submit">Save Settings</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.use(express.urlencoded({ extended: true }));

app.post("/dashboard/save", (req, res) => {
  const adminKey = req.query.key;
  if (!process.env.ADMIN_SECRET || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  const newSettings = {
    systemPrompt: req.body.systemPrompt || "",
    firstMessage: req.body.firstMessage || "",
    model: req.body.model || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    temperature: Number(req.body.temperature || 0.7),
    maxTokens: Number(req.body.maxTokens || 500)
  };

  saveSettings(newSettings);
  res.redirect(`/dashboard?key=${encodeURIComponent(adminKey)}`);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== "whatsapp_business_account") {
      return res.sendStatus(404);
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const messageId = message.id;
    if (processedMessageIds.has(messageId)) {
      return res.sendStatus(200);
    }
    processedMessageIds.add(messageId);

    const from = message.from;
    const type = message.type;

    if (type !== "text") {
      await sendWhatsAppMessage(
        from,
        "Daba kan9der njaweb ghir 3la text messages."
      );
      return res.sendStatus(200);
    }

    const userText = message.text?.body?.trim() || "";
    const settings = loadSettings();

    const greetings = ["hi", "hello", "salam", "slm", "salut", "hey", "yo"];
    const normalized = userText.toLowerCase();

    if (greetings.includes(normalized)) {
      await sendWhatsAppMessage(from, settings.firstMessage);
      return res.sendStatus(200);
    }

    const aiReply = await askOpenRouter(userText, from);
    await sendWhatsAppMessage(from, aiReply);

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});