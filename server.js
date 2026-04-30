import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
const upload = multer({ dest: "uploads/" });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 静的ファイル
app.use(express.static("public"));

app.post("/upload", upload.single("audio"), async (req, res) => {
  const filePath = req.file.path;

  try {
    // ===== ① 音声 → テキスト =====
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("model", "gpt-4o-mini-transcribe");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    const whisperData = await whisperRes.json();
    const userText = whisperData.text || "";

    console.log("USER:", userText);

    // ===== ② GPT =====
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "あなたは優しく寄り添うぬいぐるみのAIです。短く優しく話してください。"
          },
          { role: "user", content: userText }
        ]
      })
    });

    const chatData = await chatRes.json();
    const reply = chatData.choices[0].message.content;

    console.log("AI:", reply);

    // ===== ③ 音声生成 =====
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: reply
      })
    });

    const audioBuffer = await ttsRes.arrayBuffer();

    fs.unlinkSync(filePath);

    res.set({ "Content-Type": "audio/mpeg" });
    res.send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.listen(3000, () => console.log("server started"));