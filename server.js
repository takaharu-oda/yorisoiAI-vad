const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    const name = req.body.name;

    if (!req.file || !req.file.buffer) {
      return res.status(400).send("no audio");
    }

    // ===== STT =====
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: "audio/webm"
    });
    form.append("model", "whisper-1");

    const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });

    const sttData = await sttRes.json().catch(() => ({}));
    const text = sttData?.text || "";
    console.log("認識:", text || "(空)");

    // 🔥 無音スキップ
    if (!text || text.trim() === "") {
      return res.status(400).send("no speech");
    }

    // ===== GPT =====
    const systemPrompt = name
      ? `やさしいぬいぐるみ。時々「${name}」と呼び短く1文で答える。`
      : `やさしいぬいぐるみ。短く1文で答える。`;

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 50,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      })
    });

    const gptData = await gptRes.json().catch(() => ({}));

    const reply =
      gptData?.choices?.[0]?.message?.content ||
      "もう一回話してくれる？";

    console.log("返答:", reply);

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
      return res.status(500).send("tts error");
    }

    res.set("Content-Type", "audio/mpeg");
    ttsRes.body.pipe(res);

  } catch (e) {
    console.error("🔥 サーバーエラー:", e);
    res.status(500).send("server error");
  }
});

app.use(express.static("public"));

app.listen(process.env.PORT || 3001, () => {
  console.log("server running");
});