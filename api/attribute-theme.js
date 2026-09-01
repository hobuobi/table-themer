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

  const { mainQuestion, themeText, comments } = req.body || {};
  if (!themeText || !Array.isArray(comments) || comments.length === 0) {
    res
      .status(400)
      .json({ error: "themeText and a non-empty comments array are required" });
    return;
  }

  const prompt =
    `A facilitator is analysing participant responses to: "${mainQuestion}".\n\n` +
    `They have written this theme:\n"${themeText}"\n\n` +
    `Below are all the participant comments, each with an id:\n${JSON.stringify(comments)}\n\n` +
    `Return 2 to 4 comment ids whose text best exemplifies this theme — the most ` +
    `representative examples, not every comment that touches on it. Only include a ` +
    `comment if it genuinely belongs to this theme. If no comments clearly fit, return ` +
    `an empty array; do not force weak matches.\n\n` +
    `Return ONLY valid JSON, no markdown, no commentary: {"representativeCommentIds":["id1","id2"]}`;

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
        max_tokens: 4000,
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
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const ids = parsed.representativeCommentIds || parsed.commentIds || [];

    res.status(200).json({
      representativeCommentIds: Array.isArray(ids) ? ids : [],
    });
  } catch (e) {
    console.error("attribute-theme failed", e);
    res.status(500).json({ error: "Failed to attribute theme" });
  }
}
