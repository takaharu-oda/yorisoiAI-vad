const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("no file");

    // ===== 名前取得 =====
    const namesRaw = req.body.names || "";
    const names = namesRaw.split(",").map(n => n.trim()).filter(Boolean);

    // ===== STT =====
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: "audio/webm"
    });
    form.append("model", "whisper-1");

    const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: form
    });

    const sttData = await sttRes.json();
    const text = sttData.text || "";

    // 🔇 無音スキップ
    if (!text.trim()) {
      return res.status(204).end();
    }

    // ===== 呼び方ロジック =====
    let callName = "";

    if (names.length >= 2) {
      if (Math.random() < 0.3) callName = "みんなー";
    } else if (names.length === 1) {
      if (Math.random() < 0.3) callName = names[0];
    }

    let systemPrompt = "あなたはやさしいぬいぐるみ。短く1文で話す。";

    if (callName) {
      systemPrompt += ` 時々「${callName}」と呼びかける。`;
    }

    // ===== GPT =====
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      })
    });

    const gptData = await gptRes.json();
    const reply = gptData.choices[0].message.content;

    // ===== TTS =====
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: reply,
        format: "mp3"
      })
    });

    if (!ttsRes.ok) {
      return res.status(204).end();
    }

    const audioBuffer = await ttsRes.buffer();

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);

  } catch (e) {
    console.error(e);
    res.status(204).end();
  }
});

app.use(express.static("public"));

app.listen(process.env.PORT || 3000, () => {
  console.log("server running");
});