const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
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

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "あなたはやさしいぬいぐるみ。短く話す。"
          },
          { role: "user", content: text }
        ]
      })
    });

    const gptData = await gptRes.json();
    const reply = gptData.choices[0].message.content;

    console.log("返答:", reply);

    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: reply
      })
    });

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