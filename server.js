import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("OK");
});

// ===== 音声処理 =====
app.post("/upload", upload.single("audio"), async (req, res) => {
  const filePath = req.file?.path;

  console.log("=== REQUEST START ===");

  if (!filePath) {
    console.error("no file");
    return res.status(400).send("no file");
  }

  try {
    const size = fs.statSync(filePath).size;
    console.log("file size:", size);

    if (size < 1000) {
      fs.unlinkSync(filePath);
      return res.status(400).send("too small");
    }

    // ===== Whisper =====
    console.log("→ Whisper start");

    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), {
      filename: "audio.wav",
      contentType: "audio/wav"
    });
    formData.append("model", "gpt-4o-mini-transcribe");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    const whisperText = await whisperRes.text();
    console.log("Whisper raw:", whisperText);

    if (!whisperRes.ok) {
      fs.unlinkSync(filePath);
      return res.status(500).send("whisper error");
    }

    const whisperData = JSON.parse(whisperText);
    const userText = whisperData.text;

    if (!userText) {
      fs.unlinkSync(filePath);
      return res.status(500).send("no text");
    }

    console.log("USER:", userText);

    // ===== GPT =====
    console.log("→ GPT start");

    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "優しく寄り添うぬいぐるみAI" },
          { role: "user", content: userText }
        ]
      })
    });

    const chatText = await chatRes.text();
    console.log("Chat raw:", chatText);

    if (!chatRes.ok) {
      fs.unlinkSync(filePath);
      return res.status(500).send("chat error");
    }

    const chatData = JSON.parse(chatText);
    const reply = chatData.choices?.[0]?.message?.content;

    if (!reply) {
      fs.unlinkSync(filePath);
      return res.status(500).send("no reply");
    }

    console.log("AI:", reply);

    // ===== TTS =====
    console.log("→ TTS start");

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
      const err = await ttsRes.text();
      console.error("TTS error:", err);
      fs.unlinkSync(filePath);
      return res.status(500).send("tts error");
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    fs.unlinkSync(filePath);

    res.set({ "Content-Type": "audio/mpeg" });
    res.send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error("SERVER ERROR:", err);

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).send("server error");
  }
});

// 🔥 Render対応（超重要）
const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("🔥 server started on", PORT);
});