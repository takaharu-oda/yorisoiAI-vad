const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== メモリ =====
let memory = {};

// ===== API =====
app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("no audio");
    }

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

    // ===== 音声→テキスト（Whisper安定版）=====
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

    const sttData = await sttRes.json();
    console.log("STT結果:", sttData);

    const text = sttData.text || "";
    console.log("認識:", text);

    // 無音対策
    if (!text.trim()) {
      return res.json({ reply: "ごめんね、聞こえなかったよ。もう一回話してくれる？" });
    }

    // ===== 履歴 =====
    user.history.push({ role: "user", content: text });
    user.history = user.history.slice(-10);

    const callName = Math.random() < 0.4;
    const nameCall = callName ? `${user.name}${suffix}` : "";

    // ===== GPT =====
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
            content: `
あなたはやさしいぬいぐるみです。

・1文で話す
・最大でも2文まで
・短くする（超重要）
・子供に話しかける
${nameCall ? `・「${nameCall}」と呼ぶ` : ""}
`
          },
          ...user.history
        ]
      })
    });

    const gptData = await gptRes.json();
    const reply = gptData.choices?.[0]?.message?.content || "";

    console.log("返答:", reply);

    user.history.push({ role: "assistant", content: reply });

    res.json({ reply });

  } catch (e) {
    console.error("エラー:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===== 静的ファイル =====
app.use(express.static("public"));

// ===== 起動 =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("server running on " + PORT));