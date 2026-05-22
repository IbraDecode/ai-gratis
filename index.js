const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { GeminiEngine, UnlimitedEngine, GPTEngine } = require("./engine");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const engines = {
  gemini: new GeminiEngine(),
  unlimited: new UnlimitedEngine(),
  gpt: new GPTEngine(),
};

const MODELS = [
  { id: "gemini", name: "Gemini", engine: "gemini", desc: "Google Gemini" },
  { id: "unlimited-std", name: "Standard", engine: "unlimited", desc: "Standard model" },
  { id: "gpt", name: "GPT-5.4 Mini", engine: "gpt", desc: "GPT model" },
];

const MODEL_MAP = {
  gemini: { engine: "gemini" },
  "unlimited-std": { engine: "unlimited", apiModel: "chat-model-reasoning" },
  gpt: { engine: "gpt" },
};

const conversations = new Map();
const CONV_EXPIRY = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of conversations) {
    if (now - conv.updated > CONV_EXPIRY) conversations.delete(id);
  }
}, 60000);

app.get("/", (req, res) => {
  res.json({
    name: "SIbra AI",
    version: "2.2.0",
    author: "Ibra Decode",
    models: MODELS.map((m) => ({ id: m.id, name: m.name, description: m.desc })),
    endpoints: { chat: "POST /api/chat", models: "GET /api/models", health: "GET /health" },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    conversations: conversations.size,
    models: MODELS.length,
  });
});

app.get("/api/models", (req, res) => {
  res.json({ status: true, data: MODELS });
});

async function runChat(engine, method, prompt, apiModel, onStream) {
  if (method === "gemini") return await engine.chat(prompt);
  if (method === "unlimited") return await engine.chat(prompt, { model: apiModel, onStream });
  if (method === "gpt") return await engine.chat(prompt, { onStream });
}

app.post("/api/chat", async (req, res) => {
  const { prompt, model = "gemini", stream, session } = req.body;
  if (!prompt) return res.status(400).json({ status: false, error: "Prompt harus diisi" });
  if (prompt.length > 10000) return res.status(400).json({ status: false, error: "Prompt terlalu panjang" });

  const cfg = MODEL_MAP[model] || MODEL_MAP.gemini;
  let convId = session || crypto.randomUUID();

  if (!conversations.has(convId)) {
    conversations.set(convId, { history: [], created: Date.now(), updated: Date.now() });
  }
  const conv = conversations.get(convId);
  conv.updated = Date.now();

  let fullPrompt = prompt;
  if (conv.history.length > 0) {
    const ctx = conv.history.slice(-6).map((m) => m.role + ": " + m.text).join("\n");
    fullPrompt = ctx + "\n\nuser: " + prompt;
  }

  async function save(text) {
    if (text) {
      conv.history.push({ role: "user", text: prompt }, { role: "assistant", text });
      if (conv.history.length > 20) conv.history = conv.history.slice(-20);
    }
  }

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Session-Id", convId);
    res.flushHeaders();

    try {
      let full = "";
      if (cfg.engine === "gemini") {
        const text = await engines.gemini.chat(fullPrompt);
        if (text) {
          for (const word of text.split(/(?<=\s)/)) {
            res.write(`data: ${JSON.stringify({ delta: word })}\n\n`);
            await new Promise((r) => setTimeout(r, 15));
          }
          full = text;
        }
      } else {
        await runChat(engines[cfg.engine], cfg.engine, fullPrompt, cfg.apiModel, (delta) => {
          full += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        });
      }
      await save(full);
      res.write(`data: ${JSON.stringify({ done: true, session: convId })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message, session: convId })}\n\n`);
      res.end();
    }
  } else {
    try {
      let text;
      if (cfg.engine === "gemini") {
        text = await engines.gemini.chat(fullPrompt);
      } else {
        text = await runChat(engines[cfg.engine], cfg.engine, fullPrompt, cfg.apiModel);
      }
      await save(text);
      res.json({ status: true, model, prompt, response: text || "Tidak ada respons", session: convId });
    } catch (err) {
      // Fallback: coba model lain
      try {
        const fallbacks = Object.keys(MODEL_MAP).filter((m) => m !== model);
        for (const fb of fallbacks) {
          const fcfg = MODEL_MAP[fb];
          try {
            let text;
            if (fcfg.engine === "gemini") text = await engines.gemini.chat(prompt);
            else text = await runChat(engines[fcfg.engine], fcfg.engine, prompt, fcfg.apiModel);
            if (text) {
              await save(text);
              return res.json({ status: true, model: fb + " (fallback)", prompt, response: text, session: convId });
            }
          } catch (_) {}
        }
      } catch (_) {}
      res.status(500).json({ status: false, error: err.message, session: convId });
    }
  }
});

app.listen(PORT, () => {
  console.log(`SIbra AI v2.2 running on http://localhost:${PORT}`);
  MODELS.forEach((m) => console.log(`  ${m.id}: ${m.name}`));
});
