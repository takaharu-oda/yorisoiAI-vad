const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== API =====
app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("no file");
    }

    console.log("📥 file size:", req.file.size);

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

    if (!sttData.text) {
      console.log("❌ transcription failed", sttData);
      return res.status(500).send("stt error");
    }

    const text = sttData.text;
    console.log("📝 認識:", text);

    // ===== GPT =====
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content: "あなたはやさしいぬいぐるみ。短く1文で答える。"
          },
          {
            role: "user",
            content: text
          }
        ]
      })
    });

    const gptData = await gptRes.json();

    if (!gptData.choices) {
      console.log("❌ GPT error", gptData);
      return res.status(500).send("gpt error");
    }

    const reply = gptData.choices[0].message.content;
    console.log("💬 返答:", reply);

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
      const err = await ttsRes.text();
      console.log("❌ TTS error:", err);
      return res.status(500).send("tts error");
    }

    // 🔥 超重要（スマホ音出すため）
    res.set("Content-Type", "audio/mpeg");

    // ストリーム返す
    ttsRes.body.pipe(res);

  } catch (e) {
    console.error("❌ server crash", e);
    res.status(500).send("server error");
  }
});

// ===== 静的ファイル =====
app.use(express.static("public"));

// ===== 起動 =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 server running on port", PORT);
});