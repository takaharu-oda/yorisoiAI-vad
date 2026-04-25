const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    // ===== 安全チェック =====
    if (!req.file || !req.file.buffer) {
      return res.status(400).send("no audio");
    }

    const name = req.body.name || "";

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

    console.log("認識:", text);

    // 🔥 無音対策（超重要）
    if (!text || text.trim() === "") {
      return res.status(400).send("no speech");
    }

    // ===== GPT =====
    const systemPrompt = name
      ? `あなたはやさしいぬいぐるみ。時々「${name}」と呼びながら、短く1文で答えてください。`
      : `あなたはやさしいぬいぐるみ。短く1文で答えてください。`;

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

    const gptData = await gptRes.json();

    // 🔥 GPTエラー防止
    if (!gptData.choices || !gptData.choices[0]) {
      console.log("GPTエラー:", gptData);
      return res.status(500).send("gpt error");
    }

    const reply = gptData.choices[0].message.content;
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

    // 🔥 TTSエラー防止
    if (!ttsRes.ok) {
      console.log("TTSエラー");
      return res.status(500).send("tts error");
    }

    // 🔥 安全な音声返却（pipeやめる）
    const buffer = await ttsRes.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(buffer));

  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

app.use(express.static("public"));

app.listen(process.env.PORT || 3001, () => {
  console.log("server running");
});
