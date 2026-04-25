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
    const mode = req.body.mode;

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

    const sttData = await sttRes.json();
    const text = sttData.text || "";
    console.log("認識:", text);

    // ===== 呼び方ロジック =====
    let systemPrompt;

    if (mode === "multi") {
      const callGroup = Math.random() < 0.4;

      systemPrompt = callGroup
        ? `あなたはやさしいぬいぐるみ。「みんなー」と優しく呼びかけてもよいが毎回は言わない。短く1文で答える。`
        : `あなたはやさしいぬいぐるみ。自然に短く1文で答える。`;
    } else if (name) {
      const shouldCallName = Math.random() < 0.3;

      systemPrompt = shouldCallName
        ? `あなたはやさしいぬいぐるみ。「${name}」と呼びかけてもよいが毎回は呼ばない。短く1文で答える。`
        : `あなたはやさしいぬいぐるみ。名前は呼ばずに短く1文で答える。`;
    } else {
      systemPrompt = `あなたはやさしいぬいぐるみ。短く1文で答える。`;
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
        temperature: 0.3,
        max_tokens: 50,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      })
    });

    const gptData = await gptRes.json();
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

    res.set("Content-Type", "audio/mpeg");
    ttsRes.body.pipe(res);

  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

app.use(express.static("public"));

app.listen(process.env.PORT || 3001, () => {
  console.log("server running");
});
