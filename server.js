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
  const filePath = req.file?.path;

  if (!filePath) return res.status(400).send("no file");

  try {
    const size = fs.statSync(filePath).size;
    console.log("file size:", size);

    if (size < 1000) {
      fs.unlinkSync(filePath);
      return res.status(400).send("too small");
    }

    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), {
      filename: "audio.wav",
      contentType: "audio/wav"
    });
    formData.append("model", "gpt-4o-mini-transcribe");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData
    });

    const whisperData = await whisperRes.json();
    const text = whisperData.text;

    if (!text) {
      fs.unlinkSync(filePath);
      return res.status(500).send("transcription failed");
    }

    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "優しく短く話すぬいぐるみAI" },
          { role: "user", content: text }
        ]
      })
    });

    const chatData = await chatRes.json();
    const reply = chatData.choices?.[0]?.message?.content;

    if (!reply) {
      fs.unlinkSync(filePath);
      return res.status(500).send("chat failed");
    }

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

  } catch (e) {
    console.error(e);
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    res.status(500).send("error");
  }
});

app.listen(process.env.PORT || 3000);