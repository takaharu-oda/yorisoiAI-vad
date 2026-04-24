const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 会話履歴
let history = [];

app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    const name = req.body?.name;
    const mode = req.body?.mode;

    // ===== STT =====
    const form = new FormData();

    if (!req.file || !req.file.buffer) {
      console.log("❌ 音声データなし");
      return res.status(400).send("no audio");
    }

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

    const sttData = await sttRes.json().catch(() => ({}));
    const text = sttData?.text || "";

    console.log("認識:", text);

    // 🔥 無音対策
    if (!text) {
      return res.status(400).send("no speech");
    }

    // ===== 呼び方 =====
    let systemPrompt;

    if (mode === "multi") {
      systemPrompt = `やさしいぬいぐるみ。ときどき「みんなー」と呼ぶ。短く1文で答える。`;
    } else if (name) {
      systemPrompt = `やさしいぬいぐるみ。ときどき「${name}」と呼ぶ。短く1文で答える。`;
    } else {
      systemPrompt = `やさしいぬいぐるみ。短く1文で答える。`;
    }

    // ===== 履歴安全化 =====
    history.push({ role: "user", content: text });

    const safeHistory = history
      .filter(m => m && m.role && m.content)
      .slice(-6);

    // ===== GPT =====
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
          ...safeHistory
        ]
      })
    });

    const gptData = await gptRes.json().catch(() => ({}));

    const reply =
      gptData?.choices?.[0]?.message?.content ||
      "ちょっと聞き取れなかったよ";

    console.log("返答:", reply);

    history.push({ role: "assistant", content: reply });

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
      console.log("❌ TTS失敗");
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