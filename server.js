const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));
const FormData = require("form-data");

const app = express();
const upload = multer({ dest: "uploads/" });

const MEMORY_FILE = "memory.json";

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  return JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

app.post("/voice", upload.single("audio"), async (req, res) => {
  try {
    const audioFile = req.file.path;
    const memory = loadMemory();

    const userId = req.body.userId || "default";

    if (!memory[userId]) {
      memory[userId] = {
        name: req.body.name || "おともだち",
        gender: req.body.gender || "girl",
        history: []
      };
    }

    const user = memory[userId];

    if (req.body.name) user.name = req.body.name;
    if (req.body.gender) user.gender = req.body.gender;

    const suffix = user.gender === "boy" ? "くん" : "ちゃん";

    // ===== Whisper =====
    const form = new FormData();
    form.append("file", fs.createReadStream(audioFile));
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("language", "ja");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const whisperData = await whisperRes.json();
    const text = whisperData.text || "";

    console.log("認識:", text);

    if (!text.trim()) {
      fs.unlinkSync(audioFile);
      return res.status(204).end();
    }

    user.history.push({ role: "user", content: text });
    user.history = user.history.slice(-10);

    const callName = Math.random() < 0.4;
    const nameCall = callName ? `${user.name}${suffix}` : "";

    // ===== GPT =====
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
あなたはやさしいぬいぐるみです。

・1文で話す
・最大でも2文まで
・短くする（超重要）
・子供に話しかける

${nameCall ? `・「${nameCall}」と呼ぶ` : "・名前は呼ばない"}
`
          },
          ...user.history
        ]
      })
    });

    const chatData = await chatRes.json();
    const reply = chatData.choices[0].message.content;

    console.log("返答:", reply);

    user.history.push({ role: "assistant", content: reply });
    saveMemory(memory);

    // ===== TTS =====
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: reply
      })
    });

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    fs.unlinkSync(audioFile);

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);

  } catch (e) {
    console.error("エラー:", e);
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static("."));
app.listen(3001, () => console.log("http://localhost:3001"));