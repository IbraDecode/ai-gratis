const fetch = require("node-fetch");
const https = require("https");
const { randomUUID } = require("crypto");

class GeminiEngine {
  constructor() {
    this.session = null;
    this.reqId = 1;
  }

  async #fetch() {
    const res = await fetch("https://gemini.google.com/", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36", "accept-language": "id-ID,id;q=0.9" },
    });
    const html = await res.text();
    this.session = { bl: html.match(/"cfb2h":"(.*?)"/)?.[1] || "", sid: html.match(/"FdrFJe":"(.*?)"/)?.[1] || "" };
  }

  async chat(prompt) {
    if (!this.session) await this.#fetch();
    const payload = [null, JSON.stringify([[prompt, 0, null, null, null, null, 0]])];
    const q = new URLSearchParams({ bl: this.session.bl, "f.sid": this.session.sid, hl: "id", _reqid: this.reqId++, rt: "c" });
    const res = await fetch(`https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${q}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36", "x-same-domain": "1", "accept-language": "id-ID,id;q=0.9" },
      body: `f.req=${encodeURIComponent(JSON.stringify(payload))}&at=`,
    });
    if (res.status === 401 || res.status === 403) { this.session = null; return this.chat(prompt); }
    const raw = await res.text();
    for (const ln of raw.split("\n")) {
      if (ln.startsWith('[["wrb.fr"')) {
        try { const d = JSON.parse(JSON.parse(ln)[0][2]); if (d?.[4]?.[0]?.[1]) return Array.isArray(d[4][0][1]) ? d[4][0][1][0] : d[4][0][1]; } catch (_) {}
      }
    }
    return null;
  }
}

class UnlimitedEngine {
  async chat(prompt, options = {}) {
    const { model = "chat-model-reasoning", locale = "id", onStream } = options;
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        chatId: randomUUID(), messages: [
          { id: randomUUID(), role: "user", content: prompt, parts: [{ type: "text", text: prompt }], createdAt: new Date().toISOString() },
          { id: randomUUID(), role: "assistant", content: "", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString() },
        ],
        selectedChatModel: model, selectedCharacter: null, selectedStory: null, deviceId: randomUUID(), locale,
      });
      const req = https.request(
        { hostname: "app.unlimitedai.chat", path: "/api/chat", method: "POST",
          headers: { "Content-Type": "application/json", "x-next-intl-locale": locale, "Content-Length": Buffer.byteLength(payload), "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        },
        (res) => {
          let buffer = "";
          res.on("data", (chunk) => {
            const lines = chunk.toString().split("\n").filter(Boolean);
            for (const line of lines) {
              try { const p = JSON.parse(line); if (p.type === "delta" && p.delta) { buffer += p.delta; if (onStream) onStream(p.delta); } } catch (_) {}
            }
          });
          res.on("end", () => resolve(buffer));
          res.on("error", (err) => reject(new Error(err.message)));
        }
      );
      req.on("error", (err) => reject(new Error(err.message)));
      req.write(payload);
      req.end();
    });
  }
}

class GPTEngine {
  async chat(prompt, options = {}) {
    const { onStream } = options;
    return new Promise((resolve, reject) => {
      const ip = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(".");
      const body = JSON.stringify({ model_slug: "gpt-5.4-mini-no-login", messages: [{ role: "user", content: prompt }] });
      const req = https.request(
        { hostname: "api.surfsense.com", path: "/api/v1/public/anon-chat/stream", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36", Referer: "https://surfsense.com/", "X-Forwarded-For": ip, "X-Real-IP": ip, "Client-IP": ip },
        },
        (res) => {
          let buffer = "";
          res.on("data", (chunk) => {
            const lines = chunk.toString().split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const raw = line.replace("data: ", "").trim();
                if (raw === "[DONE]") continue;
                try { const json = JSON.parse(raw); if (json.type === "text-delta" && json.delta) { buffer += json.delta; if (onStream) onStream(json.delta); } } catch (_) {}
              }
            }
          });
          res.on("end", () => resolve(buffer));
          res.on("error", (err) => reject(new Error(err.message)));
        }
      );
      req.on("error", (err) => reject(new Error(err.message)));
      req.write(body);
      req.end();
    });
  }
}

module.exports = { GeminiEngine, UnlimitedEngine, GPTEngine };
