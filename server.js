const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let history = [];

app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    const name = req.body?.name;
    const mode = req.body?.mode;

    // ===== 音声チェック =====
    if (!req.file || !req.file.buffer) {
      console.log("❌ audioなし");
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
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: form
    });

    const sttData = await sttRes.json().catch(() => ({}));
    const text = sttData?.text || "";

    console.log("📝 認識:", text || "(空)");

    // ❌ ←ここが今回の変更（無音でも止めない）
    // if (!text) {
    //   return res.status(400).send("no speech");
    // }

    // ===== 呼び方 =====
    let systemPrompt;

    if (mode === "multi") {
      systemPrompt = `やさしいぬいぐるみ。ときどき「みんなー」と呼ぶ。短く1文。`;
    } else if (name) {
      systemPrompt = `やさしいぬいぐるみ。ときどき「${name}」と呼ぶ。短く1文。`;
    } else {
      systemPrompt = `やさしいぬいぐるみ。短く1文。`;
    }

    // ===== 履歴 =====
    history.push({ role: "user", content: text || "..." });

    const safeHistory = history.slice(-6);

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
      "もう一回話してくれる？";

    console.log("🤖 返答:", reply);

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