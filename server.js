const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const app = express();
const upload = multer();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== メモリ（簡易） =====
let userMemory = {
  name: null,
  history: []
};

// ===== 名前取得（URL対応） =====
app.use((req, res, next) => {
  const name = req.query.name;
  if (name) {
    userMemory.name = name;
  }
  next();
});

// ===== 静的ファイル =====
app.use(express.static("public"));

// ===== 音声受信 =====
app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("音声なし");
    }

    console.log("リクエスト来た");

    // ===== Whisper（音声→テキスト）=====
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: "audio/webm"
    });
    formData.append("model", "gpt-4o-mini-transcribe");

    const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    const sttData = await sttRes.json();
    const text = sttData.text || "";

    console.log("認識:", text);

    if (!text || text.trim() === "") {
      console.log("無音スキップ");
      return res.send({ reply: "" });
    }

    // ===== 名前処理 =====
    const name = userMemory.name;
    const isBoy = name && (name.endsWith("くん") || name.endsWith("君"));

    const callName = name
      ? (isBoy ? `${name}` : `${name}ちゃん`)
      : "";

    const useName = Math.random() < 0.4;

    // ===== 会話履歴追加 =====
    userMemory.history.push({ role: "user", content: text });
    userMemory.history = userMemory.history.slice(-6);

    // ===== GPT =====
    const prompt = `
あなたはやさしいぬいぐるみです。

・1文で話す
・最大でも2文まで
・短くする（超重要）
・説明しすぎない
・子供に話しかける

${useName && callName ? `・たまに「${callName}」と呼ぶ` : ""}
`;

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          ...userMemory.history
        ]
      })
    });

    const gptData = await gptRes.json();
    const reply = gptData.choices?.[0]?.message?.content || "";

    console.log("返答:", reply);

    // ===== 履歴保存 =====
    userMemory.history.push({ role: "assistant", content: reply });

    res.send({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).send("エラー");
  }
});

// ===== ポート（超重要）=====
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});