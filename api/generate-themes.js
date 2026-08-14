import { buildThemePrompt } from "../src/promptTemplate.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
    return;
  }

  const { mainQuestion, answers, extraInstructions } = req.body || {};
  if (!mainQuestion || !Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ error: "mainQuestion and a non-empty answers array are required" });
    return;
  }

  const prompt = buildThemePrompt({ mainQuestion, answers, extraInstructions });

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: Math.min(16000, Math.max(1024, answers.length * 60)),
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error", anthropicRes.status, errText);
      res.status(502).json({ error: `Anthropic API error: ${errText}` });
      return;
    }

    const data = await anthropicRes.json();
    if (data.stop_reason === "max_tokens") {
      console.error("generate-themes: response truncated at max_tokens", {
        answerCount: answers.length,
        usage: data.usage,
      });
      res.status(502).json({ error: "The model's response was too long and got cut off. Try again." });
      return;
    }

    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const cleaned = textBlocks.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    res.status(200).json(parsed);
  } catch (e) {
    console.error("generate-themes failed", e);
    res.status(500).json({ error: "Failed to generate themes" });
  }
}
