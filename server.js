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
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });

    const sttData = await sttRes.json();
    const text = sttData.text || "";

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "あなたはやさしいぬいぐるみ。短く話す。" },
          { role: "user", content: text }
        ]
      })
    });

    const gptData = await gptRes.json();
    const reply = gptData.choices[0].message.content;

    // 🔥ここ修正
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: reply,
        format: "mp3"   // ← これ追加（重要）
      })
    });

    // 🔥 streamで返す（これが安定）
    res.set("Content-Type", "audio/mpeg");
    ttsRes.body.pipe(res);

  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});