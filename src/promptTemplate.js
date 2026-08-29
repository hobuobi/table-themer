/* Prompt for turning a question's comments into candidate themes.
   Candidates carry only what the UI needs — the theme text, a few
   representative comments, and any existing themes they overlap with.
   We deliberately do NOT ask the model to echo every supporting
   comment id: that output grows with the dataset and blows the token
   budget on large questions. */
export function buildThemePrompt({
  mainQuestion,
  comments,
  existingThemes = [],
  previousCandidates = [],
}) {
  const parts = [];

  parts.push(
    `You are helping a facilitator synthesize themes from a public deliberation event.`
  );
  parts.push(`The main question participants responded to:\n"${mainQuestion}"`);

  parts.push(
    `Below are participant comments, gathered across several tables. Each has a unique id.\n` +
      JSON.stringify(comments)
  );

  if (existingThemes.length) {
    parts.push(
      `The facilitator has already recorded these themes (with ids). Where the data supports it, ` +
        `align new candidates with them and note the overlap rather than inventing near-duplicates:\n` +
        JSON.stringify(existingThemes)
    );
  }

  if (previousCandidates.length) {
    parts.push(
      `In an earlier pass you proposed these candidate themes. Keep the ones still well-supported by ` +
        `the comments, revise wording where it helps, and drop or replace any the data no longer backs. ` +
        `If the overall taxonomy has shifted, restructure freely:\n` +
        JSON.stringify(previousCandidates)
    );
  }

  parts.push(
    `Produce 4 to 9 candidate themes. Requirements:\n` +
      `- Each theme captures exactly ONE idea in response to the main question.\n` +
      `- Themes must be mutually exclusive — no overlap — and together cover the main currents.\n` +
      `- Only propose a theme whose underlying idea appears multiple times, within a table and/or across tables.\n` +
      `- "text": plain, concrete language, no jargon, 100 characters maximum.\n` +
      `- "representativeCommentIds": 2 to 4 comment ids whose text best exemplifies the theme.\n` +
      `- "similarThemeIds": ids of any already-recorded themes this candidate overlaps with (empty array if none).`
  );

  parts.push(
    `Return ONLY valid JSON, no markdown fences, no commentary, no extra keys, in exactly this shape:\n` +
      `{"themes":[{"text":"...","representativeCommentIds":["id1","id2"],"similarThemeIds":[]}]}`
  );

  return parts.join("\n\n");
}
