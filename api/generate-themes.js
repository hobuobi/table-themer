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

  const {
    mainQuestion,
    comments,
    existingThemes = [],
    previousCandidates = [],
  } = req.body || {};

  if (!mainQuestion || !Array.isArray(comments) || comments.length === 0) {
    res
      .status(400)
      .json({ error: "mainQuestion and a non-empty comments array are required" });
    return;
  }

  const prompt = buildThemePrompt({
    mainQuestion,
    comments,
    existingThemes,
    previousCandidates,
  });

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
        // Output no longer scales with the dataset (themes only carry a
        // handful of representative ids), so a flat ceiling is plenty.
        max_tokens: 8000,
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
    const truncated = data.stop_reason === "max_tokens";
    if (truncated) {
      console.error("generate-themes: response truncated at max_tokens", {
        commentCount: comments.length,
        usage: data.usage,
      });
    }

    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const parsed = parseThemes(textBlocks);
    if (!parsed || !Array.isArray(parsed.themes) || parsed.themes.length === 0) {
      res.status(502).json({
        error: truncated
          ? "The model's response was cut off before any themes came back. Try again."
          : "The model did not return any themes. Try again.",
      });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error("generate-themes failed", e);
    res.status(500).json({ error: "Failed to generate themes" });
  }
}

// Parse the model's JSON; if it was truncated mid-array, salvage every
// complete { ... } theme object that made it through.
function parseThemes(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('"themes"');
    if (start === -1) throw e;
    const objs = [];
    const re = /\{[^{}]*\}/g;
    let m;
    while ((m = re.exec(cleaned.slice(start)))) {
      try {
        const o = JSON.parse(m[0]);
        if (o && typeof o.text === "string") objs.push(o);
      } catch (_) {
        /* skip fragment */
      }
    }
    if (!objs.length) throw e;
    return { themes: objs };
  }
}
