import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
const upload = multer({ dest: "uploads/" });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(express.static("public"));

app.post("/upload", upload.single("audio"), async (req, res) => {
  const filePath = req.file.path;

  try {
    console.log("file size:", fs.statSync(filePath).size);

    // ===== ① Whisper =====
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), {
      filename: "audio.webm",
      contentType: "audio/webm"
    });
    formData.append("model", "gpt-4o-mini-transcribe");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    const whisperData = await whisperRes.json();
    console.log("whisper:", whisperData);

    const userText = whisperData.text;

    if (!userText) {
      console.error("❌ transcription failed");
      fs.unlinkSync(filePath);
      return res.status(500).send("transcription failed");
    }

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
            content: "あなたは優しく寄り添うぬいぐるみのAIです。短くやさしく答えてください。"
          },
          { role: "user", content: userText }
        ]
      })
    });

    const chatData = await chatRes.json();
    console.log("chat:", chatData);

    const reply = chatData?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("❌ chat failed");
      fs.unlinkSync(filePath);
      return res.status(500).send("chat failed");
    }

    console.log("AI:", reply);

    // ===== ③ TTS =====
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

    if (!ttsRes.ok) {
      console.error("❌ TTS failed");
      fs.unlinkSync(filePath);
      return res.status(500).send("tts failed");
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    fs.unlinkSync(filePath);

    res.set({
      "Content-Type": "audio/mpeg"
    });

    res.send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error("🔥 SERVER ERROR:", err);
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    res.status(500).send("server error");
  }
});

app.listen(3000, () => console.log("server started"));