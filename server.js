import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
const upload = multer({ dest: "uploads/" });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(express.static("public"));

// ===== API =====
app.post("/upload", upload.single("audio"), async (req, res) => {
  const filePath = req.file?.path;

  console.log("=== START REQUEST ===");

  if (!filePath) {
    console.error("❌ file not found");
    return res.status(400).send("no file");
  }

  try {
    const size = fs.statSync(filePath).size;
    console.log("file size:", size);

    if (size < 1000) {
      console.error("❌ file too small");
      fs.unlinkSync(filePath);
      return res.status(400).send("file too small");
    }

    // ===== ① Whisper（WAV） =====
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), {
      filename: "audio.wav",
      contentType: "audio/wav"
    });
    formData.append("model", "gpt-4o-mini-transcribe");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: formData
      }
    );

    const whisperData = await whisperRes.json();
    console.log("whisper:", whisperData);

    if (!whisperRes.ok || whisperData.error) {
      console.error("❌ Whisper error:", whisperData);
      fs.unlinkSync(filePath);
      return res.status(500).send("whisper failed");
    }

    const userText = whisperData.text;

    if (!userText) {
      console.error("❌ no transcription");
      fs.unlinkSync(filePath);
      return res.status(500).send("no transcription");
    }

    console.log("USER:", userText);

    // ===== ② GPT =====
    const chatRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
              content:
                "あなたは優しく寄り添うぬいぐるみAIです。短くやさしく返答してください。"
            },
            { role: "user", content: userText }
          ]
        })
      }
    );

    const chatData = await chatRes.json();
    console.log("chat:", chatData);

    if (!chatRes.ok || chatData.error) {
      console.error("❌ Chat error:", chatData);
      fs.unlinkSync(filePath);
      return res.status(500).send("chat failed");
    }

    const reply = chatData.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("❌ empty reply");
      fs.unlinkSync(filePath);
      return res.status(500).send("empty reply");
    }

    console.log("AI:", reply);

    // ===== ③ TTS =====
    const ttsRes = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
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
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("❌ TTS error:", errText);
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

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).send("server error");
  }
});

// ===== 起動 =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("server started on", PORT));