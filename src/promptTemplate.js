/* Prompt for turning a question's comments into candidate themes.
   Candidates are richer than plain themes: each carries the comments that
   inform it, the most representative ones, and any existing recorded
   themes it overlaps with. */
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
    `Produce a set of candidate themes. Requirements:\n` +
      `- Each theme captures exactly ONE idea in response to the main question.\n` +
      `- Themes must be mutually exclusive — no overlap — and together cover the main currents.\n` +
      `- Only propose a theme whose underlying idea appears multiple times, within a table and/or across tables.\n` +
      `- "text": plain, concrete language, no jargon, 100 characters maximum.\n` +
      `- "informingCommentIds": every comment id that supports the theme.\n` +
      `- "representativeCommentIds": 1-3 comment ids that best exemplify it (a subset of informingCommentIds).\n` +
      `- "similarThemeIds": ids of any already-recorded themes this candidate overlaps with (empty array if none).`
  );

  parts.push(
    `Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:\n` +
      `{"themes":[{"text":"...","informingCommentIds":["id1"],"representativeCommentIds":["id1"],"similarThemeIds":[]}]}`
  );

  return parts.join("\n\n");
}
